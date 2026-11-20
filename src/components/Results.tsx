import { forwardRef } from "react";
import type { ReactElement } from "react";
import type { AssessResponse } from "@/lib/domain/api";
import { ACTION_CATEGORIES, CATEGORY_LABELS, formatHour12 } from "@/lib/domain/plan";
import type { Language } from "@/lib/domain/profile";
import { ActionCard } from "./ActionCard";
import { AqiGauge } from "./AqiGauge";

interface ResultsProps {
  data: AssessResponse;
  language: Language;
}

const ADVICE_TEXT = {
  normal: "Outdoors: fine for most people.",
  limit: "Outdoors: limit long or hard activity.",
  avoid: "Outdoors: avoid unnecessary time outside.",
} as const;

const fmt = (value: number | null): string => (value === null ? "n/a" : String(Math.round(value)));

export const Results = forwardRef<HTMLHeadingElement, ResultsProps>(function Results(
  { data, language },
  headingRef,
): ReactElement {
  const { plan, air, narrative } = data;
  const lang = narrative.source === "gemini" ? language : "en";

  return (
    <section aria-labelledby="results-heading" className="results">
      <h2 id="results-heading" tabIndex={-1} ref={headingRef}>
        Your air today in {data.location.name}
      </h2>

      <div className="card hero">
        <AqiGauge aqi={plan.aqi} band={plan.band} label={plan.bandLabel} />
        <div>
          <p className="headline">{plan.headline}</p>
          <p className="advice">{ADVICE_TEXT[plan.outdoorAdvice]}</p>
          {plan.adjustedForVulnerable ? (
            <p>
              Because your household includes sensitive members, this plan is one step more
              cautious.
            </p>
          ) : null}
          {plan.bestWindow ? (
            <p>
              Cleanest hour today: <strong>{formatHour12(plan.bestWindow.hour)}</strong> (fine
              particles about {plan.bestWindow.reductionPct}% lower than now).
            </p>
          ) : null}
        </div>
      </div>

      <div className="card">
        <h3>Pollutant readings</h3>
        <dl className="readings">
          <div>
            <dt>Fine particles (PM2.5)</dt>
            <dd>
              {fmt(air.pm25)} µg/m³
              {plan.pm25VsWho !== null ? ` — ${plan.pm25VsWho}× the WHO 24-hour guideline` : ""}
            </dd>
          </div>
          <div>
            <dt>Coarse particles (PM10)</dt>
            <dd>{fmt(air.pm10)} µg/m³</dd>
          </div>
          <div>
            <dt>Nitrogen dioxide</dt>
            <dd>{fmt(air.no2)} µg/m³</dd>
          </div>
          <div>
            <dt>Ozone</dt>
            <dd>{fmt(air.o3)} µg/m³</dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <h3>
          Summary{" "}
          <span className="badge">
            {narrative.source === "gemini" ? "AI-generated" : "Rule-based"}
          </span>
        </h3>
        <p lang={lang}>{narrative.summary}</p>
        {narrative.answer ? (
          <>
            <h4>Your question</h4>
            <p lang={lang}>{narrative.answer}</p>
          </>
        ) : null}
        {narrative.notice ? <p className="hint">{narrative.notice}</p> : null}
      </div>

      <h3 className="plan-title">Your plan</h3>
      {ACTION_CATEGORIES.map((category) => {
        const actions = plan.actions.filter((a) => a.category === category);
        if (actions.length === 0) return null;
        const headingId = `cat-${category}`;
        return (
          <section key={category} aria-labelledby={headingId} className="card">
            <h3 id={headingId}>{CATEGORY_LABELS[category]}</h3>
            <ul className="actions">
              {actions.map((action) => (
                <ActionCard key={action.id} action={action} />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="hint">
        {data.attribution} Impact figures are indicative estimates, not measurements of your home.
        This is general information, not medical advice.
      </p>
    </section>
  );
});
