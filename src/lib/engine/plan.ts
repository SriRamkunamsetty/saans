import type { AirSnapshot } from "../domain/air";
import { categorize, outdoorAdviceFor, pm25MultipleOfWho } from "../domain/aqi";
import type { AqiBand } from "../domain/aqi";
import { ACTION_CATEGORIES } from "../domain/plan";
import type { Action, Plan } from "../domain/plan";
import { hasVulnerableMember } from "../domain/profile";
import type { Profile } from "../domain/profile";
import { RULES } from "./rules";
import type { RuleContext } from "./rules";
import { findBestOutdoorWindow } from "./window";

/** Keeps the plan scannable: the most important few per category, not everything. */
export const MAX_ACTIONS_PER_CATEGORY = 4;
const MAX_RISK_INDEX = 5;

const HEADLINES: Record<AqiBand, string> = {
  good: "The air is good. Enjoy the outdoors.",
  moderate: "The air is acceptable, but unusually sensitive people should take it easier.",
  sensitive: "Unhealthy for sensitive groups. Limit long or heavy time outdoors.",
  unhealthy: "Unhealthy air. Everyone should cut back on time outside.",
  "very-unhealthy": "Very unhealthy smog. Stay indoors as much as you can.",
  hazardous: "Hazardous air. Treat today as an emergency-level pollution day.",
};

/**
 * Turns live air data and a household profile into a ranked, explainable plan.
 * Pure and deterministic: the same inputs always give the same plan.
 */
export function buildPlan(air: AirSnapshot, profile: Profile): Plan {
  const category = categorize(air.usAqi);
  const adjustedForVulnerable = hasVulnerableMember(profile) && category.index < MAX_RISK_INDEX;
  const riskIndex = Math.min(
    MAX_RISK_INDEX,
    category.index + (hasVulnerableMember(profile) ? 1 : 0),
  );
  const bestWindow = findBestOutdoorWindow(air);
  const pm25VsWho = air.pm25 === null ? null : pm25MultipleOfWho(air.pm25);

  const context: RuleContext = { air, profile, category, riskIndex, pm25VsWho, bestWindow };
  const applicable = RULES.map((rule) => rule(context)).filter(
    (action): action is Action => action !== null,
  );

  return {
    aqi: Math.round(air.usAqi),
    band: category.band,
    bandLabel: category.label,
    riskIndex,
    adjustedForVulnerable,
    outdoorAdvice: outdoorAdviceFor(riskIndex),
    headline: HEADLINES[category.band],
    pm25VsWho,
    bestWindow,
    actions: rank(applicable),
  };
}

/** Orders by category, then priority (stable, so rule order breaks ties), and caps each group. */
function rank(actions: readonly Action[]): Action[] {
  return ACTION_CATEGORIES.flatMap((category) =>
    actions
      .filter((a) => a.category === category)
      .map((action, order) => ({ action, order }))
      .sort((a, b) => a.action.priority - b.action.priority || a.order - b.order)
      .slice(0, MAX_ACTIONS_PER_CATEGORY)
      .map(({ action }) => action),
  );
}
