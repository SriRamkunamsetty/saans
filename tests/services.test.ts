import { beforeEach, describe, expect, it, vi } from "vitest";

async function freshServices() {
  vi.resetModules();
  return import("@/lib/api/services");
}

describe("service singletons", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "");
    vi.stubEnv("GEMINI_MODEL", "");
    vi.stubEnv("AI_TIMEOUT_MS", "");
  });

  it("reads configuration lazily and caches it", async () => {
    const { getConfig } = await freshServices();
    vi.stubEnv("GEMINI_API_KEY", "abc");
    const first = getConfig();
    vi.stubEnv("GEMINI_API_KEY", "changed");
    expect(first.geminiApiKey).toBe("abc");
    expect(getConfig()).toBe(first);
  });

  it("builds assess dependencies once and wires the configured rate limit", async () => {
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "1");
    const { getAssessDeps } = await freshServices();
    const deps = getAssessDeps();
    expect(getAssessDeps()).toBe(deps);
    expect(deps.limiter.check("k").allowed).toBe(true);
    expect(deps.limiter.check("k").allowed).toBe(false);
    expect(typeof deps.getAir).toBe("function");
  });

  it("gives geocoding a more generous limit than assessment", async () => {
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "1");
    const { getGeocodeDeps } = await freshServices();
    const deps = getGeocodeDeps();
    expect(getGeocodeDeps()).toBe(deps);
    expect([1, 2, 3].map(() => deps.limiter.check("k").allowed)).toEqual([true, true, true]);
    expect(deps.limiter.check("k").allowed).toBe(false);
  });

  it("fails loudly on invalid configuration instead of silently using defaults", async () => {
    vi.stubEnv("AI_TIMEOUT_MS", "5");
    const { getConfig } = await freshServices();
    expect(() => getConfig()).toThrow();
  });

  it("delegates place search to the geocoding provider", async () => {
    const { getGeocodeDeps } = await freshServices();
    await expect(getGeocodeDeps().search("a")).rejects.toMatchObject({ code: "bad_request" });
  });
});
