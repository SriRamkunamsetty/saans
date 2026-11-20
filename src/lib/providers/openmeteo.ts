import { z } from "zod";
import type { AirSnapshot, Coordinates, HourlyPoint } from "../domain/air";
import { AppError } from "../domain/errors";
import { CoordinatesSchema } from "../domain/schemas";
import { TtlCache } from "./cache";
import { fetchUpstreamJson } from "./http";
import type { FetchDeps } from "./http";

const AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

const nullableNumber = z.number().nullable();

const ResponseSchema = z.object({
  current: z.object({
    time: z.string(),
    us_aqi: nullableNumber,
    pm2_5: nullableNumber,
    pm10: nullableNumber,
    nitrogen_dioxide: nullableNumber,
    ozone: nullableNumber,
  }),
  hourly: z.object({
    time: z.array(z.string()),
    us_aqi: z.array(nullableNumber),
    pm2_5: z.array(nullableNumber),
  }),
});

/**
 * Coordinates are rounded to two decimals (~1 km). That is plenty for a 11 km model grid,
 * improves cache hits, and means we never send or store a precise home location.
 */
export function roundCoordinates(coords: Coordinates): Coordinates {
  return {
    lat: Math.round(coords.lat * 100) / 100,
    lon: Math.round(coords.lon * 100) / 100,
  };
}

export function buildAirQualityUrl(coords: Coordinates): URL {
  const url = new URL(AIR_QUALITY_URL);
  url.search = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    current: "us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone",
    hourly: "us_aqi,pm2_5",
    forecast_days: "2",
    timezone: "auto",
  }).toString();
  return url;
}

export function parseAirQuality(raw: unknown): AirSnapshot {
  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("upstream_failed", "The data service returned an unexpected format.");
  }
  const { current, hourly } = parsed.data;
  if (current.us_aqi === null) {
    throw new AppError("no_data", "No air quality data is available for this location yet.");
  }

  const count = Math.min(hourly.time.length, hourly.us_aqi.length, hourly.pm2_5.length);
  const points: HourlyPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    points.push({
      time: hourly.time[i] as string,
      usAqi: hourly.us_aqi[i] ?? null,
      pm25: hourly.pm2_5[i] ?? null,
    });
  }

  return {
    usAqi: current.us_aqi,
    pm25: current.pm2_5,
    pm10: current.pm10,
    no2: current.nitrogen_dioxide,
    o3: current.ozone,
    observedAt: current.time,
    hourly: points,
  };
}

export type AirProvider = (coords: Coordinates) => Promise<AirSnapshot>;

/** Builds a cached provider; one instance is shared per server process. */
export function createAirProvider(
  deps: FetchDeps = {},
  cache?: TtlCache<AirSnapshot>,
): AirProvider {
  const store =
    cache ?? new TtlCache<AirSnapshot>({ ttlMs: CACHE_TTL_MS, maxEntries: CACHE_MAX_ENTRIES });
  return async (input) => {
    const parsed = CoordinatesSchema.safeParse(input);
    if (!parsed.success) throw new AppError("bad_request", "Coordinates are out of range.");
    const coords = roundCoordinates(parsed.data);
    const key = `${coords.lat},${coords.lon}`;
    return store.load(key, async () =>
      parseAirQuality(await fetchUpstreamJson(buildAirQualityUrl(coords), deps)),
    );
  };
}
