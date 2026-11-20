import type { ReactElement } from "react";
import type { AqiBand } from "@/lib/domain/aqi";

interface AqiGaugeProps {
  aqi: number;
  band: AqiBand;
  label: string;
}

const GAUGE_MAX = 300;

/**
 * Semicircular gauge. Meaning is carried by the number and the written category, never by
 * colour alone; the SVG itself is an image with a full text alternative.
 */
export function AqiGauge({ aqi, band, label }: AqiGaugeProps): ReactElement {
  const fraction = Math.min(Math.max(aqi, 0), GAUGE_MAX) / GAUGE_MAX;
  const arc = "M 20 100 A 80 80 0 0 1 180 100";
  return (
    <figure className={`gauge band-${band}`}>
      <svg
        viewBox="0 0 200 120"
        role="img"
        aria-label={`US air quality index ${aqi}, ${label}`}
        focusable="false"
      >
        <path d={arc} pathLength={100} className="gauge-track" />
        <path
          d={arc}
          pathLength={100}
          className="gauge-value"
          strokeDasharray={`${(fraction * 100).toFixed(2)} 100`}
        />
        <text x="100" y="88" textAnchor="middle" className="gauge-number">
          {aqi}
        </text>
        <text x="100" y="110" textAnchor="middle" className="gauge-caption">
          US AQI
        </text>
      </svg>
      <figcaption className="band-chip">{label}</figcaption>
    </figure>
  );
}
