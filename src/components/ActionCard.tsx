import type { ReactElement } from "react";
import { formatRange } from "@/lib/domain/plan";
import type { Action, Priority } from "@/lib/domain/plan";

const PRIORITY_LABEL: Record<Priority, string> = {
  1: "Do now",
  2: "Do today",
  3: "Build the habit",
};

export function ActionCard({ action }: { action: Action }): ReactElement {
  const { impact } = action;
  return (
    <li className={`action priority-${action.priority}`}>
      <p className="priority">{PRIORITY_LABEL[action.priority]}</p>
      <h4>{action.title}</h4>
      <p>{action.detail}</p>
      <p className="impact">
        <strong>Direct impact:</strong> {impact.summary}
      </p>
      {impact.reductionPct ? (
        <p className="metric">
          {impact.kind === "emissions" ? "Cuts emissions share by" : "Cuts exposure by"}{" "}
          <strong>{formatRange(impact.reductionPct)}</strong>
        </p>
      ) : null}
      {impact.co2KgPerWeek ? (
        <p className="metric">
          Tailpipe CO₂: about <strong>{impact.co2KgPerWeek} kg</strong> a week on this commute
        </p>
      ) : null}
      <details>
        <summary>How we worked this out</summary>
        <p>{impact.basis}</p>
      </details>
    </li>
  );
}
