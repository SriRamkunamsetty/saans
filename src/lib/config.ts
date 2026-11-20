import { z } from "zod";

export interface AppConfig {
  /** Undefined means the AI layer is disabled and the rules-based fallback is used. */
  readonly geminiApiKey: string | undefined;
  readonly geminiModel: string;
  readonly aiTimeoutMs: number;
  readonly rateLimitPerMinute: number;
}

const EnvSchema = z.object({
  GEMINI_API_KEY: z.string().trim().min(1).optional(),
  // Restricted charset: the value is placed in a URL path, so it must not be able to
  // smuggle in slashes, query strings or other hosts.
  GEMINI_MODEL: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{0,63}$/, "must look like a Gemini model id")
    .default("gemini-3.8-flash"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(20_000).default(8000),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(600).default(20),
});

const KEYS = ["GEMINI_API_KEY", "GEMINI_MODEL", "AI_TIMEOUT_MS", "RATE_LIMIT_PER_MINUTE"] as const;

/** Reads and validates configuration. Empty variables count as "not set". */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const picked: Record<string, string> = {};
  for (const key of KEYS) {
    const value = env[key];
    if (value !== undefined && value.trim() !== "") picked[key] = value;
  }
  const parsed = EnvSchema.parse(picked);
  return {
    geminiApiKey: parsed.GEMINI_API_KEY,
    geminiModel: parsed.GEMINI_MODEL,
    aiTimeoutMs: parsed.AI_TIMEOUT_MS,
    rateLimitPerMinute: parsed.RATE_LIMIT_PER_MINUTE,
  };
}
