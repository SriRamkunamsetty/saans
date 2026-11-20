import { describe, expect, it } from "vitest";
import { ACTION_CATEGORIES } from "@/lib/domain/plan";
import { buildPlan, MAX_ACTIONS_PER_CATEGORY } from "@/lib/engine/plan";
import { makeAir, makeHourly, makeProfile } from "./fixtures";

const ids = (air = makeAir(), profile = makeProfile()): string[] =>
  buildPlan(air, profile).actions.map((a) => a.id);

const goodAir = makeAir({ usAqi: 35, pm25: 8, hourly: makeHourly(() => 8) });
const moderateAir = makeAir({ usAqi: 80, pm25: 25, hourly: makeHourly(() => 25) });
const sensitiveAir = makeAir({ usAqi: 130, pm25: 45, hourly: makeHourly(() => 45) });
const hazardousAir = makeAir({ usAqi: 420, pm25: 380, hourly: makeHourly(() => 380) });

describe("buildPlan — summary fields", () => {
  it("categorises the reading and writes a headline", () => {
    const plan = buildPlan(makeAir(), makeProfile());
    expect(plan).toMatchObject({
      aqi: 187,
      band: "unhealthy",
      riskIndex: 3,
      outdoorAdvice: "avoid",
    });
    expect(plan.pm25VsWho).toBe(9.5);
    expect(plan.headline).toMatch(/unhealthy/i);
  });

  it("is deterministic", () => {
    expect(buildPlan(makeAir(), makeProfile())).toEqual(buildPlan(makeAir(), makeProfile()));
  });

  it("handles a missing PM2.5 reading", () => {
    const plan = buildPlan(makeAir({ pm25: null }), makeProfile());
    expect(plan.pm25VsWho).toBeNull();
    expect(plan.bestWindow).toBeNull();
  });
});

describe("buildPlan — vulnerable households", () => {
  it("shifts risk up one band and says so", () => {
    const plan = buildPlan(
      sensitiveAir,
      makeProfile({
        vulnerable: { children: true, olderAdults: false, pregnancy: false, heartOrLung: false },
      }),
    );
    expect(plan.riskIndex).toBe(3);
    expect(plan.adjustedForVulnerable).toBe(true);
    expect(plan.outdoorAdvice).toBe("avoid");
  });

  it("does not shift past hazardous, and does not claim an adjustment then", () => {
    const plan = buildPlan(
      hazardousAir,
      makeProfile({
        vulnerable: { children: true, olderAdults: true, pregnancy: false, heartOrLung: true },
      }),
    );
    expect(plan.riskIndex).toBe(5);
    expect(plan.adjustedForVulnerable).toBe(false);
  });

  it("names each sensitive group in the health action", () => {
    const profile = makeProfile({
      vulnerable: { children: true, olderAdults: true, pregnancy: true, heartOrLung: true },
    });
    const action = buildPlan(makeAir(), profile).actions.find(
      (a) => a.id === "protect-sensitive-members",
    );
    expect(action?.title).toContain("children");
    expect(action?.title).toContain("older adults");
    expect(action?.title).toContain("pregnant");
    expect(action?.title).toContain("heart or lung");
    expect(action?.priority).toBe(1);
  });

  it("adds child-specific actions only when children live there", () => {
    const withKids = makeProfile({
      vulnerable: { children: true, olderAdults: false, pregnancy: false, heartOrLung: false },
    });
    expect(ids(makeAir(), withKids)).toEqual(
      expect.arrayContaining(["children-play-indoors", "idle-free-school-gate"]),
    );
    expect(ids(makeAir(), makeProfile())).not.toContain("children-play-indoors");
    expect(ids(makeAir(), makeProfile())).not.toContain("idle-free-school-gate");
  });
});

describe("buildPlan — air-quality tiers", () => {
  it("encourages ventilation and normal activity when the air is good", () => {
    const list = ids(goodAir);
    expect(list).toContain("ventilate-freely");
    expect(list).not.toContain("close-windows");
    expect(list).not.toContain("exercise-indoors");
    expect(list).not.toContain("wear-respirator");
  });

  it("only asks for lighter exercise at moderate/sensitive levels", () => {
    expect(ids(sensitiveAir)).toContain("exercise-lighter");
    expect(ids(sensitiveAir)).not.toContain("exercise-indoors");
    expect(ids(moderateAir)).not.toContain("close-windows");
  });

  it("moves exercise indoors and closes windows in unhealthy air", () => {
    const list = ids(makeAir());
    expect(list).toEqual(
      expect.arrayContaining(["exercise-indoors", "close-windows", "watch-symptoms"]),
    );
    expect(list).not.toContain("ventilate-freely");
  });

  it("suggests work-from-home only at very unhealthy levels, and not to walkers", () => {
    const severe = makeAir({ usAqi: 260, pm25: 210, hourly: makeHourly(() => 210) });
    expect(ids(severe, makeProfile({ commute: "car" }))).toContain("work-from-home");
    expect(ids(severe, makeProfile({ commute: "walk" }))).not.toContain("work-from-home");
    expect(ids(severe, makeProfile({ commute: "work-from-home" }))).not.toContain("work-from-home");
    expect(ids(makeAir(), makeProfile({ commute: "car" }))).not.toContain("work-from-home");
  });

  it("skips exercise advice for people who rarely exercise outdoors", () => {
    const list = ids(makeAir(), makeProfile({ outdoorExercise: "rarely" }));
    expect(list).not.toContain("exercise-indoors");
  });
});

describe("buildPlan — lifestyle personalisation", () => {
  it("recommends a purifier that matches what the household has", () => {
    expect(ids(makeAir(), makeProfile({ airCleaner: "hepa" }))).toContain("run-purifier");
    expect(ids(makeAir(), makeProfile({ airCleaner: "diy" }))).toContain("run-purifier");
    const none = ids(makeAir(), makeProfile({ airCleaner: "none" }));
    expect(none).toEqual(expect.arrayContaining(["get-purifier", "build-diy-purifier"]));
    expect(none).not.toContain("run-purifier");
  });

  it("offers a low-cost purifier at moderate-plus levels but a bought one only above that", () => {
    expect(ids(sensitiveAir)).toContain("build-diy-purifier");
    expect(ids(sensitiveAir)).not.toContain("get-purifier");
  });

  it("targets cooking and heating sources", () => {
    const biomass = ids(makeAir(), makeProfile({ cooking: "biomass", heating: "biomass-or-coal" }));
    expect(biomass).toEqual(
      expect.arrayContaining(["cook-cleaner", "clean-cooking", "no-indoor-burning"]),
    );
    const clean = ids(makeAir(), makeProfile({ cooking: "electric", heating: "electric" }));
    expect(clean).not.toContain("cook-cleaner");
    expect(clean).not.toContain("clean-cooking");
    expect(clean).not.toContain("no-indoor-burning");
  });

  it("makes burning-fuel advice the top priority", () => {
    const action = buildPlan(makeAir(), makeProfile({ heating: "biomass-or-coal" })).actions.find(
      (a) => a.id === "no-indoor-burning",
    );
    expect(action?.priority).toBe(1);
  });

  it("raises cooking-smoke priority for biomass cooking in heavy smog", () => {
    const find = (cooking: "gas" | "biomass") =>
      buildPlan(makeAir(), makeProfile({ cooking })).actions.find((a) => a.id === "cook-cleaner")
        ?.priority;
    expect(find("biomass")).toBe(1);
    expect(find("gas")).toBe(2);
  });

  it("recommends respirators to people who travel outdoors, not to commuters who work from home", () => {
    expect(ids(makeAir(), makeProfile({ commute: "cycle" }))).toContain("wear-respirator");
    expect(ids(makeAir(), makeProfile({ commute: "car" }))).not.toContain("wear-respirator");
    expect(ids(makeAir(), makeProfile({ commute: "work-from-home" }))).not.toContain(
      "wear-respirator",
    );
  });

  it("explains emissions for the household's own commute", () => {
    const car = buildPlan(makeAir(), makeProfile({ commute: "car", commuteKm: 10 })).actions.find(
      (a) => a.id === "shift-car-trips",
    );
    expect(car?.impact.co2KgPerWeek).toBe(20);
    expect(car?.impact.summary).toContain("20");

    const bike = buildPlan(
      makeAir(),
      makeProfile({ commute: "two-wheeler", commuteKm: 8 }),
    ).actions.find((a) => a.id === "cleaner-two-wheeler");
    expect(bike?.impact.co2KgPerWeek).toBe(5.6);
  });

  it("only suggests carpooling and anti-idling for motorised commuters", () => {
    expect(ids(makeAir(), makeProfile({ commute: "car" }))).toEqual(
      expect.arrayContaining(["start-carpool", "stop-idling"]),
    );
    expect(ids(makeAir(), makeProfile({ commute: "walk" }))).not.toContain("start-carpool");
    expect(ids(makeAir(), makeProfile({ commute: "transit" }))).not.toContain("stop-idling");
  });

  it("only suggests car-shift advice when the commute is by car with real distance", () => {
    expect(ids(makeAir(), makeProfile({ commute: "car", commuteKm: 0 }))).not.toContain(
      "shift-car-trips",
    );
    expect(ids(makeAir(), makeProfile({ commute: "two-wheeler", commuteKm: 0 }))).not.toContain(
      "cleaner-two-wheeler",
    );
  });

  it("mentions the cleanest hour when airing the home and when planning outings", () => {
    const plan = buildPlan(makeAir(), makeProfile());
    const hour = plan.actions.find((a) => a.id === "use-cleanest-hour");
    expect(hour?.title).toContain("1 pm");
    expect(hour?.impact.reductionPct).toEqual([51, 51]);
    expect(plan.actions.find((a) => a.id === "close-windows")?.detail).toContain("1 pm");
  });
});

describe("buildPlan — structure and explainability", () => {
  const plans = [
    buildPlan(goodAir, makeProfile()),
    buildPlan(sensitiveAir, makeProfile({ commute: "car" })),
    buildPlan(
      makeAir(),
      makeProfile({
        cooking: "biomass",
        heating: "biomass-or-coal",
        vulnerable: { children: true, olderAdults: true, pregnancy: true, heartOrLung: true },
      }),
    ),
    buildPlan(hazardousAir, makeProfile({ commute: "two-wheeler" })),
  ];

  it("gives every action a direct-impact explanation and a stated basis", () => {
    for (const plan of plans) {
      for (const action of plan.actions) {
        expect(action.impact.summary.length).toBeGreaterThan(20);
        expect(action.impact.basis.length).toBeGreaterThan(10);
      }
    }
  });

  it("uses unique action ids and caps each category", () => {
    for (const plan of plans) {
      const seen = plan.actions.map((a) => a.id);
      expect(new Set(seen).size).toBe(seen.length);
      for (const category of ACTION_CATEGORIES) {
        expect(plan.actions.filter((a) => a.category === category).length).toBeLessThanOrEqual(
          MAX_ACTIONS_PER_CATEGORY,
        );
      }
    }
  });

  it("orders each category by priority", () => {
    for (const plan of plans) {
      for (const category of ACTION_CATEGORIES) {
        const priorities = plan.actions
          .filter((a) => a.category === category)
          .map((a) => a.priority);
        expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
      }
    }
  });

  it("always includes community and at least one routine action", () => {
    for (const plan of plans) {
      expect(plan.actions.some((a) => a.category === "community")).toBe(true);
      expect(plan.actions.some((a) => a.category === "indoor" || a.category === "routine")).toBe(
        true,
      );
    }
  });
});
