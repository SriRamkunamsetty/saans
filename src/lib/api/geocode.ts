import { AppError } from "../domain/errors";
import type { Place } from "../domain/air";
import type { PlaceSummary } from "../domain/api";
import { errorResponse, json } from "../http";
import type { RateLimiter } from "../security/rateLimit";
import { getClientKey } from "../security/request";

export interface GeocodeDeps {
  readonly search: (query: string) => Promise<Place[]>;
  readonly limiter: RateLimiter;
}

/** GET /api/geocode?q=… — place search. Results are public data, so the CDN may cache them. */
export async function handleGeocode(request: Request, deps: GeocodeDeps): Promise<Response> {
  try {
    const limit = deps.limiter.check(getClientKey(request.headers));
    if (!limit.allowed) {
      throw new AppError("rate_limited", "Too many requests. Please wait a moment.", {
        "Retry-After": String(limit.retryAfterSec),
      });
    }
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const places = await deps.search(query);
    const results: PlaceSummary[] = places.map((p) => ({ ...p }));
    return json(
      { results },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
