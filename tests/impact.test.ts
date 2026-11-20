import { describe, expect, it } from "vitest";
import {
  CARPOOL_SIZE,
  carpoolSavingPct,
  weeklyCo2SavedKg,
  weeklyCommuteCo2Kg,
} from "@/lib/engine/impact";

describe("commute emissions", () => {
  it("computes weekly round-trip CO₂ from distance and mode", () => {
    expect(weeklyCommuteCo2Kg("car", 10)).toBe(25); // 250 g × 10 km × 2 × 5 days
    expect(weeklyCommuteCo2Kg("two-wheeler", 8)).toBe(5.6);
    expect(weeklyCommuteCo2Kg("walk", 10)).toBe(0);
    expect(weeklyCommuteCo2Kg("work-from-home", 10)).toBe(0);
  });

  it("computes the saving from switching mode, scaled by days", () => {
    expect(weeklyCo2SavedKg("car", "transit", 10)).toBe(20);
    expect(weeklyCo2SavedKg("car", "transit", 10, 2)).toBe(8);
  });

  it("never reports a negative saving", () => {
    expect(weeklyCo2SavedKg("transit", "car", 10)).toBe(0);
  });
});

describe("carpoolSavingPct", () => {
  it("is 1 − 1/riders", () => {
    expect(carpoolSavingPct()).toBe(Math.round((1 - 1 / CARPOOL_SIZE) * 100));
    expect(carpoolSavingPct(2)).toBe(50);
  });

  it("needs at least two riders", () => {
    expect(() => carpoolSavingPct(1)).toThrow(RangeError);
    expect(() => carpoolSavingPct(2.5)).toThrow(RangeError);
  });
});
