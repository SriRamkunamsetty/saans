/**
 * US AQI categories and the WHO reference used to explain PM2.5 in plain terms.
 * Pure functions only — no I/O — so every branch is trivially unit-testable.
 */

export const AQI_BANDS = [
  "good",
  "moderate",
  "sensitive",
  "unhealthy",
  "very-unhealthy",
  "hazardous",
] as const;

export type AqiBand = (typeof AQI_BANDS)[number];

export interface AqiCategory {
  readonly band: AqiBand;
  /** Position in AQI_BANDS (0 = good … 5 = hazardous). */
  readonly index: number;
  readonly label: string;
  /** Inclusive upper bound of the band. */
  readonly max: number;
}

const CATEGORIES: readonly AqiCategory[] = [
  { band: "good", index: 0, label: "Good", max: 50 },
  { band: "moderate", index: 1, label: "Moderate", max: 100 },
  { band: "sensitive", index: 2, label: "Unhealthy for sensitive groups", max: 150 },
  { band: "unhealthy", index: 3, label: "Unhealthy", max: 200 },
  { band: "very-unhealthy", index: 4, label: "Very unhealthy", max: 300 },
  { band: "hazardous", index: 5, label: "Hazardous", max: Number.POSITIVE_INFINITY },
];

/** WHO 2021 air quality guideline for PM2.5, 24-hour mean, in µg/m³. */
export const WHO_PM25_24H_GUIDELINE = 15;

export function categorize(aqi: number): AqiCategory {
  if (!Number.isFinite(aqi) || aqi < 0) {
    throw new RangeError(`AQI must be a finite, non-negative number (received ${aqi}).`);
  }
  const rounded = Math.round(aqi);
  const category = CATEGORIES.find((c) => rounded <= c.max);
  // The last band has an infinite upper bound, so `find` cannot miss.
  return category ?? (CATEGORIES[CATEGORIES.length - 1] as AqiCategory);
}

/** How many times the WHO 24-hour guideline the PM2.5 reading is, to one decimal. */
export function pm25MultipleOfWho(pm25: number): number {
  if (!Number.isFinite(pm25) || pm25 < 0) {
    throw new RangeError(`PM2.5 must be a finite, non-negative number (received ${pm25}).`);
  }
  return Math.round((pm25 / WHO_PM25_24H_GUIDELINE) * 10) / 10;
}

export type OutdoorAdvice = "normal" | "limit" | "avoid";

/**
 * Translates a risk index into a single outdoor-activity recommendation.
 * `riskIndex` already includes the one-band shift for vulnerable households.
 */
export function outdoorAdviceFor(riskIndex: number): OutdoorAdvice {
  if (riskIndex <= 1) return "normal";
  if (riskIndex === 2) return "limit";
  return "avoid";
}
