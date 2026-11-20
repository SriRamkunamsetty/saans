import type { Plan } from "./plan";

/** The air reading shown to the user; the hourly forecast stays on the server. */
export interface AirSummary {
  usAqi: number;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  observedAt: string;
}

export interface Narrative {
  summary: string;
  /** Answer to the user's question, or null when none was asked or AI was unavailable. */
  answer: string | null;
  source: "gemini" | "rules";
  /** Honest note when the AI path was skipped or failed. */
  notice: string | null;
}

export interface AssessResponse {
  location: { name: string; lat: number; lon: number };
  air: AirSummary;
  plan: Plan;
  narrative: Narrative;
  generatedAt: string;
  attribution: string;
}

export interface PlaceSummary {
  id: string;
  name: string;
  region: string | null;
  country: string | null;
  lat: number;
  lon: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
