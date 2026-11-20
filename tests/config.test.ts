import { describe, expect, it } from "vitest";
import { loadConfig } from "@/lib/config";

describe("loadConfig", () => {
  it("applies safe defaults when nothing is set", () => {
    expect(loadConfig({})).toEqual({
      geminiApiKey: undefined,
      geminiModel: "gemini-3.8-flash",
      aiTimeoutMs: 8000,
      rateLimitPerMinute: 20,
    });
  });

  it("treats blank variables as unset", () => {
    expect(loadConfig({ GEMINI_API_KEY: "   ", GEMINI_MODEL: "" }).geminiApiKey).toBeUndefined();
  });

  it("reads overrides and coerces numbers", () => {
    expect(
      loadConfig({
        GEMINI_API_KEY: "k",
        GEMINI_MODEL: "gemini-3.5-flash",
        AI_TIMEOUT_MS: "5000",
        RATE_LIMIT_PER_MINUTE: "5",
      }),
    ).toEqual({
      geminiApiKey: "k",
      geminiModel: "gemini-3.5-flash",
      aiTimeoutMs: 5000,
      rateLimitPerMinute: 5,
    });
  });

  it.each([
    [{ GEMINI_MODEL: "../../evil" }],
    [{ GEMINI_MODEL: "model?key=x" }],
    [{ AI_TIMEOUT_MS: "50" }],
    [{ AI_TIMEOUT_MS: "999999" }],
    [{ RATE_LIMIT_PER_MINUTE: "0" }],
    [{ RATE_LIMIT_PER_MINUTE: "abc" }],
  ])("rejects unsafe or out-of-range values %#", (env) => {
    expect(() => loadConfig(env)).toThrow();
  });
});
