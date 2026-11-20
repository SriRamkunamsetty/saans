import { describe, expect, it } from "vitest";
import {
  AQI_BANDS,
  WHO_PM25_24H_GUIDELINE,
  categorize,
  outdoorAdviceFor,
  pm25MultipleOfWho,
} from "@/lib/domain/aqi";

describe("categorize", () => {
  it.each([
    [0, "good"],
    [50, "good"],
    [51, "moderate"],
    [100, "moderate"],
    [101, "sensitive"],
    [150, "sensitive"],
    [151, "unhealthy"],
    [200, "unhealthy"],
    [201, "very-unhealthy"],
    [300, "very-unhealthy"],
    [301, "hazardous"],
    [999, "hazardous"],
  ])("maps AQI %d to %s", (aqi, band) => {
    expect(categorize(aqi).band).toBe(band);
  });

  it("rounds before comparing so 50.4 is still good and 50.6 is moderate", () => {
    expect(categorize(50.4).band).toBe("good");
    expect(categorize(50.6).band).toBe("moderate");
  });

  it("exposes an index that matches AQI_BANDS order", () => {
    for (const band of AQI_BANDS) {
      const sample = {
        good: 10,
        moderate: 70,
        sensitive: 120,
        unhealthy: 170,
        "very-unhealthy": 250,
        hazardous: 400,
      }[band];
      expect(AQI_BANDS[categorize(sample).index]).toBe(band);
    }
  });

  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])("rejects invalid AQI %s", (bad) => {
    expect(() => categorize(bad)).toThrow(RangeError);
  });
});

describe("pm25MultipleOfWho", () => {
  it("compares with the WHO 24-hour guideline", () => {
    expect(pm25MultipleOfWho(WHO_PM25_24H_GUIDELINE)).toBe(1);
    expect(pm25MultipleOfWho(142)).toBe(9.5);
    expect(pm25MultipleOfWho(0)).toBe(0);
  });

  it("rejects invalid readings", () => {
    expect(() => pm25MultipleOfWho(-3)).toThrow(RangeError);
    expect(() => pm25MultipleOfWho(Number.NaN)).toThrow(RangeError);
  });
});

describe("outdoorAdviceFor", () => {
  it.each([
    [0, "normal"],
    [1, "normal"],
    [2, "limit"],
    [3, "avoid"],
    [5, "avoid"],
  ])("risk index %d → %s", (risk, advice) => {
    expect(outdoorAdviceFor(risk)).toBe(advice);
  });
});
