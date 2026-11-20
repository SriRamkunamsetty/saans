import { AIR_ATTRIBUTION } from "@/lib/domain/air";
import type { AirSnapshot, HourlyPoint } from "@/lib/domain/air";
import type { AssessResponse, Narrative } from "@/lib/domain/api";
import { DEFAULT_PROFILE } from "@/lib/domain/profile";
import type { Profile } from "@/lib/domain/profile";
import { buildPlan } from "@/lib/engine/plan";

/** Two days of hourly points starting 2026-11-18T00:00; PM2.5 dips in the early afternoon. */
export function makeHourly(
  pm25ForHour: (hour: number, day: number) => number | null,
): HourlyPoint[] {
  const points: HourlyPoint[] = [];
  for (let day = 0; day < 2; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const pm25 = pm25ForHour(hour, day);
      points.push({
        time: `2026-11-${String(18 + day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00`,
        pm25,
        usAqi: pm25 === null ? null : Math.round(pm25 * 1.3),
      });
    }
  }
  return points;
}

const afternoonDip = (hour: number): number => (hour >= 13 && hour <= 16 ? 70 : 140);

export function makeAir(overrides: Partial<AirSnapshot> = {}): AirSnapshot {
  return {
    usAqi: 187,
    pm25: 142,
    pm10: 190,
    no2: 40,
    o3: 30,
    observedAt: "2026-11-18T05:00",
    hourly: makeHourly(afternoonDip),
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return { ...DEFAULT_PROFILE, ...overrides };
}

/** A realistic Open-Meteo air-quality response body. */
export function openMeteoBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const hourly = makeHourly(afternoonDip);
  return {
    latitude: 28.6,
    longitude: 77.2,
    utc_offset_seconds: 19800,
    current: {
      time: "2026-11-18T05:00",
      interval: 3600,
      us_aqi: 187,
      pm2_5: 142.3,
      pm10: 190.1,
      nitrogen_dioxide: 40.2,
      ozone: 30.4,
    },
    hourly: {
      time: hourly.map((p) => p.time),
      us_aqi: hourly.map((p) => p.usAqi),
      pm2_5: hourly.map((p) => p.pm25),
    },
    ...overrides,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function postRequest(
  body: unknown,
  headers: Record<string, string> = {},
  url = "http://localhost:3000/api/assess",
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "localhost:3000", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export const VALID_ASSESS_BODY = {
  location: { name: "Delhi, India", lat: 28.6139, lon: 77.209 },
  profile: DEFAULT_PROFILE,
  language: "en",
};

export function makeNarrative(overrides: Partial<Narrative> = {}): Narrative {
  return {
    summary: "Delhi: US AQI 187 (Unhealthy).",
    answer: null,
    source: "rules",
    notice: null,
    ...overrides,
  };
}

export function makeAssessResponse(
  overrides: {
    air?: Partial<AirSnapshot>;
    profile?: Partial<Profile>;
    narrative?: Partial<Narrative>;
  } = {},
): AssessResponse {
  const air = makeAir(overrides.air);
  const plan = buildPlan(air, makeProfile(overrides.profile));
  return {
    location: { name: "Delhi, India", lat: 28.61, lon: 77.21 },
    air: {
      usAqi: air.usAqi,
      pm25: air.pm25,
      pm10: air.pm10,
      no2: air.no2,
      o3: air.o3,
      observedAt: air.observedAt,
    },
    plan,
    narrative: makeNarrative(overrides.narrative),
    generatedAt: "2026-11-18T00:00:00.000Z",
    attribution: AIR_ATTRIBUTION,
  };
}
