import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/domain/errors";
import { TtlCache } from "@/lib/providers/cache";
import { MAX_QUERY_LENGTH, normalizeQuery, searchPlaces } from "@/lib/providers/geocode";
import { fetchUpstreamJson } from "@/lib/providers/http";
import {
  buildAirQualityUrl,
  createAirProvider,
  parseAirQuality,
  roundCoordinates,
} from "@/lib/providers/openmeteo";
import { jsonResponse, openMeteoBody } from "./fixtures";

describe("TtlCache", () => {
  it("returns stored values until they expire", () => {
    let now = 0;
    const cache = new TtlCache<number>({ ttlMs: 100, maxEntries: 5, now: () => now });
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    now = 101;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("evicts the oldest entry beyond maxEntries", () => {
    const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("de-duplicates concurrent loads and caches the result", async () => {
    const cache = new TtlCache<string>({ ttlMs: 1000, maxEntries: 5 });
    const loader = vi.fn(async () => "value");
    const [a, b] = await Promise.all([cache.load("k", loader), cache.load("k", loader)]);
    expect([a, b]).toEqual(["value", "value"]);
    await cache.load("k", loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const cache = new TtlCache<string>({ ttlMs: 1000, maxEntries: 5 });
    await expect(cache.load("k", async () => Promise.reject(new Error("nope")))).rejects.toThrow(
      "nope",
    );
    await expect(cache.load("k", async () => "ok")).resolves.toBe("ok");
  });
});

describe("fetchUpstreamJson", () => {
  const url = new URL("https://example.test/x");

  it("returns parsed JSON and sends a timeout signal", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ a: 1 }));
    await expect(fetchUpstreamJson(url, { fetchImpl })).resolves.toEqual({ a: 1 });
    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps HTTP errors, network failures, timeouts and bad bodies to safe AppErrors", async () => {
    const run = (fetchImpl: typeof fetch) => fetchUpstreamJson(url, { fetchImpl });
    await expect(run(async () => jsonResponse({}, 500))).rejects.toMatchObject({
      code: "upstream_failed",
    });
    await expect(
      run(async () => Promise.reject(new TypeError("fetch failed"))),
    ).rejects.toMatchObject({
      code: "upstream_failed",
    });
    await expect(
      run(async () => Promise.reject(new DOMException("timed out", "TimeoutError"))),
    ).rejects.toMatchObject({ code: "upstream_timeout" });
    await expect(run(async () => new Response("<html>", { status: 200 }))).rejects.toMatchObject({
      code: "upstream_failed",
    });
  });

  it("never leaks upstream details in the error message", async () => {
    const error = await fetchUpstreamJson(url, {
      fetchImpl: async () => Promise.reject(new Error("ECONNREFUSED 10.0.0.5:5432")),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).message).not.toContain("10.0.0.5");
  });
});

describe("Open-Meteo air quality", () => {
  it("rounds coordinates to ~1 km", () => {
    expect(roundCoordinates({ lat: 28.61394, lon: 77.20906 })).toEqual({ lat: 28.61, lon: 77.21 });
  });

  it("builds the request URL with only the fields we use", () => {
    const url = buildAirQualityUrl({ lat: 28.61, lon: 77.21 });
    expect(url.origin).toBe("https://air-quality-api.open-meteo.com");
    expect(url.searchParams.get("latitude")).toBe("28.61");
    expect(url.searchParams.get("current")).toBe("us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone");
    expect(url.searchParams.get("hourly")).toBe("us_aqi,pm2_5");
    expect(url.searchParams.get("timezone")).toBe("auto");
  });

  it("parses a valid response", () => {
    const air = parseAirQuality(openMeteoBody());
    expect(air).toMatchObject({ usAqi: 187, pm25: 142.3, pm10: 190.1, no2: 40.2, o3: 30.4 });
    expect(air.observedAt).toBe("2026-11-18T05:00");
    expect(air.hourly).toHaveLength(48);
    expect(air.hourly[13]).toMatchObject({ time: "2026-11-18T13:00", pm25: 70 });
  });

  it("tolerates null pollutants and ragged hourly arrays", () => {
    const body = openMeteoBody();
    const base = body.hourly as {
      time: string[];
      us_aqi: (number | null)[];
      pm2_5: (number | null)[];
    };
    const air = parseAirQuality({
      ...body,
      current: {
        time: "2026-11-18T05:00",
        us_aqi: 90,
        pm2_5: null,
        pm10: null,
        nitrogen_dioxide: null,
        ozone: null,
      },
      hourly: {
        time: base.time,
        us_aqi: base.us_aqi.slice(0, 12),
        pm2_5: base.pm2_5.slice(0, 10).map((v, i) => (i === 5 ? null : v)),
      },
    });
    expect(air.pm25).toBeNull();
    expect(air.hourly).toHaveLength(10);
    expect(air.hourly[5]?.pm25).toBeNull();
  });

  it("reports missing data distinctly from a broken response", () => {
    const body = openMeteoBody();
    const current = body.current as Record<string, unknown>;
    expect(() => parseAirQuality({ ...body, current: { ...current, us_aqi: null } })).toThrowError(
      expect.objectContaining({ code: "no_data" }),
    );
    expect(() => parseAirQuality({ nonsense: true })).toThrowError(
      expect.objectContaining({ code: "upstream_failed" }),
    );
  });

  it("caches by rounded location so nearby requests share one upstream call", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(openMeteoBody()));
    const getAir = createAirProvider({ fetchImpl });
    await getAir({ lat: 28.611, lon: 77.209 });
    await getAir({ lat: 28.612, lon: 77.208 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await getAir({ lat: 19.07, lon: 72.87 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects out-of-range coordinates before any network call", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(createAirProvider({ fetchImpl })({ lat: 95, lon: 10 })).rejects.toMatchObject({
      code: "bad_request",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("geocoding", () => {
  const body = {
    results: [
      {
        id: 1,
        name: "Ongole",
        latitude: 15.5057,
        longitude: 80.0499,
        admin1: "Andhra Pradesh",
        country: "India",
      },
      { id: 2, name: "Ongole <b>Fake</b>", latitude: 15.51, longitude: 80.05 },
    ],
  };

  it("validates and normalises the query", () => {
    expect(normalizeQuery("  New   Delhi ")).toBe("New Delhi");
    expect(() => normalizeQuery("a")).toThrowError(
      expect.objectContaining({ code: "bad_request" }),
    );
    expect(() => normalizeQuery("​​")).toThrowError(
      expect.objectContaining({ code: "bad_request" }),
    );
    expect(Array.from(normalizeQuery("x".repeat(500))).length).toBe(MAX_QUERY_LENGTH);
  });

  it("maps, rounds and sanitises results", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(body));
    const places = await searchPlaces("Ongole", { fetchImpl });
    expect(places[0]).toEqual({
      id: "1",
      name: "Ongole",
      region: "Andhra Pradesh",
      country: "India",
      lat: 15.51,
      lon: 80.05,
    });
    expect(places[1]).toMatchObject({ name: "Ongole bFake/b", region: null, country: null });
    const requested = fetchImpl.mock.calls[0]?.[0] as URL;
    expect(requested.searchParams.get("name")).toBe("Ongole");
  });

  it("returns an empty list when nothing matches", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ generationtime_ms: 0.4 }));
    await expect(searchPlaces("Nowhereville", { fetchImpl })).resolves.toEqual([]);
  });

  it("rejects an unexpected upstream format", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ results: [{ id: "x" }] }));
    await expect(searchPlaces("Delhi", { fetchImpl })).rejects.toMatchObject({
      code: "upstream_failed",
    });
  });
});
