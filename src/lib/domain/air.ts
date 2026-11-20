/** One forecast hour. `time` is local ISO without offset, e.g. "2026-11-18T14:00". */
export interface HourlyPoint {
  readonly time: string;
  readonly usAqi: number | null;
  readonly pm25: number | null;
}

export interface AirSnapshot {
  readonly usAqi: number;
  readonly pm25: number | null;
  readonly pm10: number | null;
  readonly no2: number | null;
  readonly o3: number | null;
  /** Local ISO time of the reading, without offset. */
  readonly observedAt: string;
  readonly hourly: readonly HourlyPoint[];
}

export interface Coordinates {
  readonly lat: number;
  readonly lon: number;
}

export interface Place extends Coordinates {
  readonly id: string;
  readonly name: string;
  readonly region: string | null;
  readonly country: string | null;
}

export const AIR_ATTRIBUTION =
  "Air quality data: CAMS ENSEMBLE (Copernicus Atmosphere Monitoring Service) via Open-Meteo.";
