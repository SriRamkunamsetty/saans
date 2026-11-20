import { z } from "zod";
import type { Place } from "../domain/air";
import { AppError } from "../domain/errors";
import { sanitizeText } from "../security/sanitize";
import { fetchUpstreamJson } from "./http";
import type { FetchDeps } from "./http";
import { roundCoordinates } from "./openmeteo";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 80;
const MAX_RESULTS = 6;

const ResponseSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        admin1: z.string().optional(),
        country: z.string().optional(),
      }),
    )
    .optional(),
});

export function normalizeQuery(raw: string): string {
  const query = sanitizeText(raw, MAX_QUERY_LENGTH);
  if (Array.from(query).length < MIN_QUERY_LENGTH) {
    throw new AppError("bad_request", `Type at least ${MIN_QUERY_LENGTH} characters to search.`);
  }
  return query;
}

export async function searchPlaces(rawQuery: string, deps: FetchDeps = {}): Promise<Place[]> {
  const query = normalizeQuery(rawQuery);
  const url = new URL(GEOCODING_URL);
  url.search = new URLSearchParams({
    name: query,
    count: String(MAX_RESULTS),
    language: "en",
    format: "json",
  }).toString();

  const parsed = ResponseSchema.safeParse(await fetchUpstreamJson(url, deps));
  if (!parsed.success) {
    throw new AppError("upstream_failed", "The place search returned an unexpected format.");
  }

  return (parsed.data.results ?? []).map((result) => {
    const { lat, lon } = roundCoordinates({ lat: result.latitude, lon: result.longitude });
    return {
      id: String(result.id),
      name: sanitizeText(result.name, 80),
      region: result.admin1 ? sanitizeText(result.admin1, 80) : null,
      country: result.country ? sanitizeText(result.country, 80) : null,
      lat,
      lon,
    };
  });
}
