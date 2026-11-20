import { describe, expect, it } from "vitest";
import { findBestOutdoorWindow } from "@/lib/engine/window";
import { makeAir, makeHourly } from "./fixtures";

describe("findBestOutdoorWindow", () => {
  it("picks the cleanest waking hour and reports the improvement", () => {
    const window = findBestOutdoorWindow(makeAir());
    expect(window).toMatchObject({ hour: 13, pm25: 70, time: "2026-11-18T13:00" });
    expect(window?.reductionPct).toBe(51); // 1 - 70/142
  });

  it("ignores night-time hours even when they are cleaner", () => {
    const air = makeAir({
      observedAt: "2026-11-18T01:00",
      hourly: makeHourly((hour) => (hour === 3 ? 5 : hour === 10 ? 60 : 140)),
    });
    expect(findBestOutdoorWindow(air)).toMatchObject({ hour: 10, pm25: 60 });
  });

  it("returns null when right now is already the cleanest hour", () => {
    const air = makeAir({ observedAt: "2026-11-18T14:00", pm25: 70 });
    expect(findBestOutdoorWindow(air)).toBeNull();
  });

  it("returns null when waiting would improve things by less than 15%", () => {
    const air = makeAir({ pm25: 80, hourly: makeHourly((hour) => (hour === 13 ? 72 : 85)) });
    expect(findBestOutdoorWindow(air)).toBeNull();
  });

  it("returns null when PM2.5 is unavailable or zero", () => {
    expect(findBestOutdoorWindow(makeAir({ pm25: null }))).toBeNull();
    expect(findBestOutdoorWindow(makeAir({ pm25: 0 }))).toBeNull();
  });

  it("skips hours with missing PM2.5", () => {
    const air = makeAir({
      hourly: makeHourly((hour) => (hour === 13 ? null : hour === 15 ? 80 : 140)),
    });
    expect(findBestOutdoorWindow(air)).toMatchObject({ hour: 15 });
  });

  it("only looks 24 hours ahead", () => {
    // The only clean hour is tomorrow at 20:00 — 39 hours after "now".
    const air = makeAir({
      hourly: makeHourly((hour, day) => (day === 1 && hour === 20 ? 20 : 140)),
    });
    expect(findBestOutdoorWindow(air)).toBeNull();
  });

  it("ignores hours that are already in the past", () => {
    const air = makeAir({
      observedAt: "2026-11-18T18:00",
      hourly: makeHourly((hour, day) => (day === 0 && hour === 13 ? 10 : 140)),
    });
    expect(findBestOutdoorWindow(air)).toBeNull();
  });
});
