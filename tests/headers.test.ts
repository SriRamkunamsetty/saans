import { afterEach, describe, expect, it, vi } from "vitest";

async function headersFor(nodeEnv: string): Promise<Record<string, string>> {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  const config = (await import("../next.config")).default;
  const rules = (await config.headers?.()) ?? [];
  expect(rules).toHaveLength(1);
  return Object.fromEntries(rules[0]!.headers.map((h) => [h.key, h.value]));
}

afterEach(() => vi.unstubAllEnvs());

describe("production security headers", () => {
  it("lock down framing, sniffing, referrers, transport and powerful features", async () => {
    const h = await headersFor("production");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=63072000/);
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(h["Permissions-Policy"]).toContain("geolocation=(self)");
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });

  it("ships a strict Content-Security-Policy without eval", async () => {
    const csp = (await headersFor("production"))["Content-Security-Policy"]!;
    for (const directive of [
      "default-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ]) {
      expect(csp).toContain(directive);
    }
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/\*/);
  });

  it("only relaxes script-src for the dev server", async () => {
    const csp = (await headersFor("development"))["Content-Security-Policy"]!;
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("hides the framework banner", async () => {
    vi.resetModules();
    const config = (await import("../next.config")).default;
    expect(config.poweredByHeader).toBe(false);
  });
});
