import { loadConfig } from "../config";
import type { AppConfig } from "../config";
import { createAirProvider } from "../providers/openmeteo";
import { searchPlaces } from "../providers/geocode";
import { createRateLimiter } from "../security/rateLimit";
import type { AssessDeps } from "./assess";
import type { GeocodeDeps } from "./geocode";

/**
 * Process-wide singletons. Created lazily on first request so a missing or invalid
 * environment variable fails that request loudly instead of breaking the build, and kept
 * at module scope so warm serverless instances share the air-data cache and rate limiter.
 */
let config: AppConfig | undefined;
let assessDeps: AssessDeps | undefined;
let geocodeDeps: GeocodeDeps | undefined;

export function getConfig(): AppConfig {
  config ??= loadConfig(process.env);
  return config;
}

export function getAssessDeps(): AssessDeps {
  assessDeps ??= {
    config: getConfig(),
    getAir: createAirProvider(),
    limiter: createRateLimiter({ limit: getConfig().rateLimitPerMinute, windowMs: 60_000 }),
  };
  return assessDeps;
}

export function getGeocodeDeps(): GeocodeDeps {
  geocodeDeps ??= {
    search: (query) => searchPlaces(query),
    limiter: createRateLimiter({ limit: getConfig().rateLimitPerMinute * 3, windowMs: 60_000 }),
  };
  return geocodeDeps;
}
