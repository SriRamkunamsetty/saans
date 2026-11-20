import type { Plan } from "../domain/plan";
import { selectTopActions } from "./prompt";

/**
 * Deterministic summary used whenever the AI layer is off, slow or returns something
 * invalid. The app is fully useful without it — the model only adds a friendlier voice,
 * translation and answers to follow-up questions.
 */
export function ruleBasedSummary(place: string, plan: Plan): string {
  const parts = [`${place}: US AQI ${plan.aqi} (${plan.bandLabel}).`];
  if (plan.pm25VsWho !== null) {
    parts.push(`Fine particles (PM2.5) are about ${plan.pm25VsWho}× the WHO 24-hour guideline.`);
  }
  parts.push(plan.headline);
  if (plan.adjustedForVulnerable) {
    parts.push(
      "Your household includes sensitive members, so this plan is one step more cautious.",
    );
  }
  const top = selectTopActions(plan.actions, 3).map((a) => a.title);
  if (top.length > 0) parts.push(`Start with: ${top.join("; ")}.`);
  return parts.join(" ");
}
