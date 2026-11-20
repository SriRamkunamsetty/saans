import type { CommuteMode } from "../domain/profile";

/**
 * Impact constants live in one reviewed place so every number the user sees is traceable.
 * They are indicative, order-of-magnitude figures — the README's "Assumptions" lists the
 * sources and caveats — never presented as measurements of the user's own home or trips.
 */

/**
 * Operational (tailpipe / per-passenger) CO₂ in grams per passenger-kilometre.
 * Car: US EPA's typical passenger vehicle figure of ~400 g CO₂/mile ≈ 250 g/km.
 * Two-wheeler and transit values are conservative planning figures.
 */
export const CO2_G_PER_PASSENGER_KM: Readonly<Record<CommuteMode, number>> = {
  walk: 0,
  cycle: 0,
  "work-from-home": 0,
  transit: 50,
  "two-wheeler": 70,
  car: 250,
};

export const COMMUTE_DAYS_PER_WEEK = 5;
export const CARPOOL_SIZE = 4;

/** Indicative exposure reductions, in percent: [low, high]. */
export const EXPOSURE_REDUCTION = {
  respirator: {
    range: [60, 95],
    basis:
      "NIOSH N95 rating is ≥95% filtration of fine particles; real-world protection depends on a good seal, so the low end reflects leakage.",
  },
  closedWindows: {
    range: [30, 60],
    basis:
      "Indicative range: well-closed homes typically admit roughly 30–60% less outdoor PM2.5 than open windows; leaky homes sit at the low end.",
  },
  hepaPurifier: {
    range: [50, 80],
    basis:
      "Indicative range for a HEPA unit sized to the room (CADR ≈ ⅔ of floor area in sq ft) running continuously with doors and windows closed.",
  },
  diyPurifier: {
    range: [40, 70],
    basis:
      "Indicative range for a Corsi–Rosenthal box (box fan plus four MERV-13 filters); performance varies with filter fit and fan.",
  },
} as const satisfies Record<string, { range: readonly [number, number]; basis: string }>;

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Weekly round-trip CO₂ for a commute, in kilograms. */
export function weeklyCommuteCo2Kg(
  mode: CommuteMode,
  oneWayKm: number,
  daysPerWeek: number = COMMUTE_DAYS_PER_WEEK,
): number {
  const grams = CO2_G_PER_PASSENGER_KM[mode] * oneWayKm * 2 * daysPerWeek;
  return round1(grams / 1000);
}

/** CO₂ saved per week by moving from one mode to another (never negative). */
export function weeklyCo2SavedKg(
  from: CommuteMode,
  to: CommuteMode,
  oneWayKm: number,
  daysPerWeek: number = COMMUTE_DAYS_PER_WEEK,
): number {
  const saved =
    weeklyCommuteCo2Kg(from, oneWayKm, daysPerWeek) - weeklyCommuteCo2Kg(to, oneWayKm, daysPerWeek);
  return Math.max(0, round1(saved));
}

/** Share of a trip's emissions avoided when it is shared by `riders` people. */
export function carpoolSavingPct(riders: number = CARPOOL_SIZE): number {
  if (!Number.isInteger(riders) || riders < 2) {
    throw new RangeError("A carpool needs at least two riders.");
  }
  return Math.round((1 - 1 / riders) * 100);
}
