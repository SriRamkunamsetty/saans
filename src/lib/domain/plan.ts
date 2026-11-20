import type { AqiBand, OutdoorAdvice } from "./aqi";

export const ACTION_CATEGORIES = [
  "routine",
  "indoor",
  "health",
  "alternative",
  "community",
] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ActionCategory, string> = {
  routine: "Daily routine",
  indoor: "Indoor air",
  health: "Health",
  alternative: "Sustainable alternatives",
  community: "Community",
};

/** 1 = do it now, 2 = do it today, 3 = build the habit. */
export type Priority = 1 | 2 | 3;

export interface Impact {
  /** What kind of benefit the number or sentence describes. */
  readonly kind: "exposure" | "emissions" | "health";
  /** Plain-language statement of the direct effect of this choice. */
  readonly summary: string;
  /** Indicative reduction in exposure, in percent: [low, high]. */
  readonly reductionPct?: readonly [number, number];
  /** Estimated tailpipe CO₂ avoided per week, in kilograms. */
  readonly co2KgPerWeek?: number;
  /** Where the figure or claim comes from, and how firm it is. */
  readonly basis: string;
}

export interface Action {
  readonly id: string;
  readonly category: ActionCategory;
  readonly priority: Priority;
  readonly title: string;
  readonly detail: string;
  readonly impact: Impact;
}

export interface OutdoorWindow {
  /** Local ISO time of the start of the hour, e.g. "2026-11-18T14:00". */
  readonly time: string;
  readonly hour: number;
  readonly pm25: number;
  readonly usAqi: number | null;
  /** How much lower PM2.5 is than right now, in percent. */
  readonly reductionPct: number;
}

export interface Plan {
  readonly aqi: number;
  readonly band: AqiBand;
  readonly bandLabel: string;
  /** Band index after the one-step shift for households with sensitive members. */
  readonly riskIndex: number;
  readonly adjustedForVulnerable: boolean;
  readonly outdoorAdvice: OutdoorAdvice;
  readonly headline: string;
  readonly pm25VsWho: number | null;
  readonly bestWindow: OutdoorWindow | null;
  readonly actions: readonly Action[];
}

export function formatRange(range: readonly [number, number]): string {
  const [low, high] = range;
  return low === high ? `about ${low}%` : `${low}–${high}%`;
}

export function formatHour12(hour: number): string {
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}
