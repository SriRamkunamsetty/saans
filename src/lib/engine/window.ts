import type { AirSnapshot } from "../domain/air";
import type { OutdoorWindow } from "../domain/plan";

/** Hours (local, inclusive) during which people realistically go outside. */
const WAKING_FIRST_HOUR = 6;
const WAKING_LAST_HOUR = 20;
const LOOKAHEAD_HOURS = 24;
/** A wait is only worth recommending if PM2.5 drops by at least this much. */
const MIN_REDUCTION_PCT = 15;

const hourKey = (isoLocal: string): string => isoLocal.slice(0, 13); // "YYYY-MM-DDTHH"
const hourOf = (isoLocal: string): number => Number.parseInt(isoLocal.slice(11, 13), 10);

/**
 * Finds the cleanest waking hour in the next 24 hours, judged on PM2.5 (the pollutant
 * that drives winter smog). Returns null when waiting would not help meaningfully —
 * including when right now already is the cleanest hour.
 */
export function findBestOutdoorWindow(air: AirSnapshot): OutdoorWindow | null {
  if (air.pm25 === null || air.pm25 <= 0) return null;

  const nowKey = hourKey(air.observedAt);
  const upcoming = air.hourly.filter((p) => hourKey(p.time) >= nowKey).slice(0, LOOKAHEAD_HOURS);

  let best: { time: string; pm25: number; usAqi: number | null } | null = null;
  for (const point of upcoming) {
    const hour = hourOf(point.time);
    if (point.pm25 === null || !Number.isFinite(hour)) continue;
    if (hour < WAKING_FIRST_HOUR || hour > WAKING_LAST_HOUR) continue;
    if (best === null || point.pm25 < best.pm25) {
      best = { time: point.time, pm25: point.pm25, usAqi: point.usAqi };
    }
  }

  if (best === null || hourKey(best.time) === nowKey) return null;

  const reductionPct = Math.round((1 - best.pm25 / air.pm25) * 100);
  if (reductionPct < MIN_REDUCTION_PCT) return null;

  return {
    time: best.time,
    hour: hourOf(best.time),
    pm25: Math.round(best.pm25 * 10) / 10,
    usAqi: best.usAqi,
    reductionPct,
  };
}
