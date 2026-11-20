import { composeNarrative } from "../ai/narrative";
import type { NarrativeComposer } from "../ai/narrative";
import type { AppConfig } from "../config";
import type { AirSnapshot, Coordinates } from "../domain/air";
import { AIR_ATTRIBUTION } from "../domain/air";
import type { AssessResponse } from "../domain/api";
import { AppError } from "../domain/errors";
import { AssessRequestSchema, MAX_PLACE_NAME_LENGTH } from "../domain/schemas";
import { buildPlan } from "../engine/plan";
import { errorResponse, json } from "../http";
import { roundCoordinates } from "../providers/openmeteo";
import { sanitizeText } from "../security/sanitize";
import type { RateLimiter } from "../security/rateLimit";
import { assertSameOrigin, getClientKey, readJsonBody } from "../security/request";

const MAX_BODY_BYTES = 8 * 1024;

export interface AssessDeps {
  readonly config: AppConfig;
  readonly getAir: (coords: Coordinates) => Promise<AirSnapshot>;
  readonly limiter: RateLimiter;
  readonly compose?: NarrativeComposer;
  readonly now?: () => Date;
}

/**
 * POST /api/assess — the whole request pipeline in one readable place:
 * origin check → rate limit → size-capped parse → schema validation → air data →
 * deterministic plan → narrative. Dependencies are injected so it is testable end to end
 * without the network.
 */
export async function handleAssess(request: Request, deps: AssessDeps): Promise<Response> {
  try {
    assertSameOrigin(request);

    const limit = deps.limiter.check(getClientKey(request.headers));
    if (!limit.allowed) {
      throw new AppError("rate_limited", "Too many requests. Please wait a moment.", {
        "Retry-After": String(limit.retryAfterSec),
      });
    }

    const parsed = AssessRequestSchema.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
    if (!parsed.success) {
      const problems = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      throw new AppError("bad_request", `Invalid request — ${problems}`);
    }
    const { location, profile, language, question } = parsed.data;

    const coords = roundCoordinates({ lat: location.lat, lon: location.lon });
    const air = await deps.getAir(coords);
    const plan = buildPlan(air, profile);
    const place = sanitizeText(location.name, MAX_PLACE_NAME_LENGTH) || "Your location";

    const compose = deps.compose ?? composeNarrative;
    const narrative = await compose(
      { place, plan, pm25: air.pm25, language, question },
      {
        geminiApiKey: deps.config.geminiApiKey,
        geminiModel: deps.config.geminiModel,
        aiTimeoutMs: deps.config.aiTimeoutMs,
      },
    );

    const body: AssessResponse = {
      location: { name: place, ...coords },
      air: {
        usAqi: air.usAqi,
        pm25: air.pm25,
        pm10: air.pm10,
        no2: air.no2,
        o3: air.o3,
        observedAt: air.observedAt,
      },
      plan,
      narrative,
      generatedAt: (deps.now?.() ?? new Date()).toISOString(),
      attribution: AIR_ATTRIBUTION,
    };
    return json(body);
  } catch (error) {
    return errorResponse(error);
  }
}
