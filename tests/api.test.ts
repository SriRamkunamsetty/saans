import { describe, expect, it, vi } from "vitest";
import { handleAssess } from "@/lib/api/assess";
import type { AssessDeps } from "@/lib/api/assess";
import { handleGeocode } from "@/lib/api/geocode";
import { AppError } from "@/lib/domain/errors";
import { createRateLimiter } from "@/lib/security/rateLimit";
import { makeAir, makeNarrative, postRequest, VALID_ASSESS_BODY } from "./fixtures";

const NOW = new Date("2026-11-18T05:00:00.000Z");

/** The union of success and error response fields the tests read. */
interface ApiJson {
  plan: { aqi: number; band: string; actions: unknown[] };
  narrative: { source: string; summary: string };
  location: { name: string; lat: number; lon: number };
  air: object;
  generatedAt: string;
  attribution: string;
  error: { code: string; message: string };
}

function makeDeps(over: Partial<AssessDeps> = {}): AssessDeps {
  return {
    config: {
      geminiApiKey: undefined,
      geminiModel: "gemini-test",
      aiTimeoutMs: 1000,
      rateLimitPerMinute: 20,
    },
    getAir: vi.fn(async () => makeAir()),
    limiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    compose: vi.fn(async () => makeNarrative()),
    now: () => NOW,
    ...over,
  };
}

const call = async (body: unknown, deps = makeDeps(), headers: Record<string, string> = {}) => {
  const response = await handleAssess(postRequest(body, headers), deps);
  return { response, json: (await response.json()) as ApiJson };
};

describe("POST /api/assess", () => {
  it("returns a plan, summary and attribution for a valid request", async () => {
    const { response, json } = await call(VALID_ASSESS_BODY);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(json.plan).toMatchObject({ aqi: 187, band: "unhealthy" });
    expect(json.plan.actions.length).toBeGreaterThan(5);
    expect(json.narrative.source).toBe("rules");
    expect(json.generatedAt).toBe(NOW.toISOString());
    expect(json.attribution).toMatch(/CAMS/);
  });

  it("rounds the location before using or echoing it, and does not leak the hourly forecast", async () => {
    const deps = makeDeps();
    const { json } = await call(VALID_ASSESS_BODY, deps);
    expect(deps.getAir).toHaveBeenCalledWith({ lat: 28.61, lon: 77.21 });
    expect(json.location).toEqual({ name: "Delhi, India", lat: 28.61, lon: 77.21 });
    expect(json.air).not.toHaveProperty("hourly");
  });

  it("sanitises the place name and passes question and language to the composer", async () => {
    const deps = makeDeps();
    await call(
      {
        ...VALID_ASSESS_BODY,
        location: { ...VALID_ASSESS_BODY.location, name: "Delhi <script>" },
        language: "hi",
        question: "Can I run?",
      },
      deps,
    );
    expect(deps.compose).toHaveBeenCalledWith(
      expect.objectContaining({ place: "Delhi script", language: "hi", question: "Can I run?" }),
      { geminiApiKey: undefined, geminiModel: "gemini-test", aiTimeoutMs: 1000 },
    );
  });

  it("falls back to a generic place name when the given one is empty after cleaning", async () => {
    const { json } = await call({
      ...VALID_ASSESS_BODY,
      location: { ...VALID_ASSESS_BODY.location, name: "<>" },
    });
    expect(json.location.name).toBe("Your location");
  });

  it("uses the real narrative composer by default", async () => {
    const { json } = await call(VALID_ASSESS_BODY, makeDeps({ compose: undefined }));
    expect(json.narrative.summary).toContain("US AQI 187");
  });

  it("stamps the current time when no clock is injected", async () => {
    const { json } = await call(VALID_ASSESS_BODY, makeDeps({ now: undefined }));
    expect(Number.isNaN(Date.parse(json.generatedAt))).toBe(false);
  });

  describe("input validation", () => {
    const cases: [string, unknown][] = [
      ["missing profile", { location: VALID_ASSESS_BODY.location }],
      ["unknown top-level key", { ...VALID_ASSESS_BODY, admin: true }],
      [
        "unknown profile key",
        { ...VALID_ASSESS_BODY, profile: { ...VALID_ASSESS_BODY.profile, extra: 1 } },
      ],
      [
        "latitude out of range",
        { ...VALID_ASSESS_BODY, location: { ...VALID_ASSESS_BODY.location, lat: 91 } },
      ],
      [
        "longitude out of range",
        { ...VALID_ASSESS_BODY, location: { ...VALID_ASSESS_BODY.location, lon: -181 } },
      ],
      [
        "invalid enum",
        { ...VALID_ASSESS_BODY, profile: { ...VALID_ASSESS_BODY.profile, commute: "rocket" } },
      ],
      [
        "distance too large",
        { ...VALID_ASSESS_BODY, profile: { ...VALID_ASSESS_BODY.profile, commuteKm: 5000 } },
      ],
      ["unsupported language", { ...VALID_ASSESS_BODY, language: "fr" }],
      ["question too long", { ...VALID_ASSESS_BODY, question: "x".repeat(601) }],
      ["wrong types", { ...VALID_ASSESS_BODY, location: { name: "x", lat: "28", lon: "77" } }],
      ["not an object", [1, 2, 3]],
    ];

    it.each(cases)("rejects %s with a 400 and a helpful message", async (_name, body) => {
      const deps = makeDeps();
      const { response, json } = await call(body, deps);
      expect(response.status).toBe(400);
      expect(json.error.code).toBe("bad_request");
      expect(json.error.message).toMatch(/^Invalid request/);
      expect(deps.getAir).not.toHaveBeenCalled();
    });

    it("rejects malformed JSON and the wrong content type", async () => {
      expect((await call("{oops")).response.status).toBe(400);
      const wrongType = await handleAssess(
        new Request("http://localhost:3000/api/assess", {
          method: "POST",
          headers: { "Content-Type": "text/plain", host: "localhost:3000" },
          body: "{}",
        }),
        makeDeps(),
      );
      expect(wrongType.status).toBe(415);
    });

    it("rejects oversized bodies", async () => {
      const { response } = await call({ ...VALID_ASSESS_BODY, question: "x".repeat(20_000) });
      expect(response.status).toBe(413);
    });
  });

  describe("protection", () => {
    it("blocks cross-site requests", async () => {
      const { response } = await call(VALID_ASSESS_BODY, makeDeps(), {
        origin: "https://evil.example",
      });
      expect(response.status).toBe(403);
    });

    it("rate limits per client with a Retry-After header", async () => {
      const deps = makeDeps({ limiter: createRateLimiter({ limit: 2, windowMs: 60_000 }) });
      const headers = { "x-forwarded-for": "203.0.113.7" };
      expect((await call(VALID_ASSESS_BODY, deps, headers)).response.status).toBe(200);
      expect((await call(VALID_ASSESS_BODY, deps, headers)).response.status).toBe(200);
      const blocked = await call(VALID_ASSESS_BODY, deps, headers);
      expect(blocked.response.status).toBe(429);
      expect(Number(blocked.response.headers.get("Retry-After"))).toBeGreaterThan(0);
      const other = await call(VALID_ASSESS_BODY, deps, { "x-forwarded-for": "203.0.113.8" });
      expect(other.response.status).toBe(200);
    });
  });

  describe("failure handling", () => {
    it("passes through safe upstream errors", async () => {
      const getAir = vi.fn(async () =>
        Promise.reject(
          new AppError("upstream_timeout", "The data service took too long to respond."),
        ),
      );
      const { response, json } = await call(VALID_ASSESS_BODY, makeDeps({ getAir }));
      expect(response.status).toBe(504);
      expect(json.error.code).toBe("upstream_timeout");
    });

    it("hides unexpected errors", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const getAir = vi.fn(async () =>
        Promise.reject(new Error("connection string postgres://u:p@host")),
      );
      const { response, json } = await call(VALID_ASSESS_BODY, makeDeps({ getAir }));
      expect(response.status).toBe(500);
      expect(JSON.stringify(json)).not.toContain("postgres");
    });
  });
});

describe("GET /api/geocode", () => {
  const place = {
    id: "1",
    name: "Ongole",
    region: "Andhra Pradesh",
    country: "India",
    lat: 15.51,
    lon: 80.05,
  };
  const get = (q: string, headers: Record<string, string> = {}) =>
    new Request(`http://localhost:3000/api/geocode?q=${encodeURIComponent(q)}`, { headers });

  it("returns places and allows public caching", async () => {
    const search = vi.fn(async () => [place]);
    const response = await handleGeocode(get("Ongole"), {
      search,
      limiter: createRateLimiter({ limit: 5, windowMs: 1000 }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600");
    expect(await response.json()).toEqual({ results: [place] });
    expect(search).toHaveBeenCalledWith("Ongole");
  });

  it("treats a missing query as empty and surfaces validation errors", async () => {
    const search = vi.fn(async (q: string) => {
      if (q.length < 2) throw new AppError("bad_request", "Type at least 2 characters to search.");
      return [];
    });
    const response = await handleGeocode(new Request("http://localhost/api/geocode"), {
      search,
      limiter: createRateLimiter({ limit: 5, windowMs: 1000 }),
    });
    expect(response.status).toBe(400);
  });

  it("rate limits", async () => {
    const deps = {
      search: vi.fn(async () => []),
      limiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    };
    await handleGeocode(get("Delhi"), deps);
    const blocked = await handleGeocode(get("Delhi"), deps);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
  });
});
