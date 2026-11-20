import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as healthGet } from "@/app/api/health/route";
import { postRequest, VALID_ASSESS_BODY } from "./fixtures";

describe("route modules", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("AI_TIMEOUT_MS", "");
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "");
    vi.stubEnv("GEMINI_MODEL", "");
  });

  it("health reports ok and nothing about configuration", async () => {
    const response = healthGet();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("assess pipes a full request through the real wiring with mocked network", async () => {
    const { openMeteoBody, jsonResponse } = await import("./fixtures");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(openMeteoBody())),
    );
    const { POST, maxDuration } = await import("@/app/api/assess/route");
    const response = await POST(postRequest(VALID_ASSESS_BODY));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      plan: { aqi: number };
      narrative: { source: string };
    };
    expect(body.plan.aqi).toBe(187);
    expect(body.narrative.source).toBe("rules");
    expect(maxDuration).toBeGreaterThan(14); // 6 s data + 8 s AI budget
  });

  it("assess turns a broken environment into a safe 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("GEMINI_MODEL", "../../evil");
    const { POST } = await import("@/app/api/assess/route");
    const response = await POST(postRequest(VALID_ASSESS_BODY));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("evil");
  });

  it("geocode returns results through the real wiring with mocked network", async () => {
    const { jsonResponse } = await import("./fixtures");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ results: [{ id: 7, name: "Ongole", latitude: 15.5, longitude: 80.05 }] }),
      ),
    );
    const { GET } = await import("@/app/api/geocode/route");
    const response = await GET(new Request("http://localhost/api/geocode?q=Ongole"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ results: [{ id: "7", name: "Ongole" }] });
  });

  it("geocode turns a broken environment into a safe 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "nope");
    const { GET } = await import("@/app/api/geocode/route");
    expect((await GET(new Request("http://localhost/api/geocode?q=Ongole"))).status).toBe(500);
  });
});
