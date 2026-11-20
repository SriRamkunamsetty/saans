import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Parses the real stylesheet and checks WCAG 2.2 contrast (AA) for every token pair the UI
 * uses, in both colour schemes — so the accessibility guarantee cannot drift from the CSS.
 */
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function block(selector: string, from = 0): string {
  const start = css.indexOf(`${selector} {`, from);
  if (start < 0) throw new Error(`Selector not found: ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

function vars(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, value] of text.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[name as string] = value as string;
  }
  return out;
}

const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const light = vars(block(":root"));
const dark = { ...light, ...vars(block(":root", darkStart)) };

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ["text", "bg"],
  ["text", "surface"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["accent", "surface"], // links, secondary buttons, summary toggles
  ["accent", "bg"],
  ["on-accent", "accent"], // primary button, skip link
  ["error", "surface"],
  ["muted", "track"],
];

const GRAPHIC_PAIRS: [string, string][] = [
  ["border", "surface"], // form control borders (WCAG 1.4.11)
  ["border", "bg"],
  ["focus", "surface"], // focus ring (WCAG 2.4.11/2.4.13)
  ["focus", "bg"],
  ["accent", "surface"],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_name, tokens) => {
  it.each(TEXT_PAIRS)("text --%s on --%s meets 4.5:1", (fg, bg) => {
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHIC_PAIRS)("graphic --%s against --%s meets 3:1", (fg, bg) => {
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(3);
  });

  it.each(["good", "moderate", "sensitive", "unhealthy", "very-unhealthy", "hazardous"])(
    "AQI band %s: chip text is 4.5:1 and the gauge arc is 3:1 against the card",
    (band) => {
      const base = vars(block(`.band-${band}`));
      const overrides = _name === "dark" ? vars(block(`  .band-${band}`, darkStart)) : {};
      const merged = { ...base, ...overrides };
      expect(contrast(merged["band-fg"]!, merged["band-bg"]!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(merged["band-line"]!, tokens["surface"]!)).toBeGreaterThanOrEqual(3);
      // The chip border must also stand out from the chip's own fill.
      expect(contrast(merged["band-line"]!, merged["band-bg"]!)).toBeGreaterThanOrEqual(3);
    },
  );
});

describe("stylesheet accessibility features", () => {
  it("honours reduced motion, forced colours, and visible focus", () => {
    expect(css).toContain("prefers-reduced-motion: no-preference");
    expect(css).toContain("forced-colors: active");
    expect(css).toContain(":focus-visible");
  });

  it("keeps touch targets at least 44px (2.75rem)", () => {
    expect(css).toMatch(/\.button\s*{[^}]*min-height:\s*2\.75rem/);
    expect(css).toMatch(/select,[^{]*{[^}]*min-height:\s*2\.75rem/s);
  });
});
