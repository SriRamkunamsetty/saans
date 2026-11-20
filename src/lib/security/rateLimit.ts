export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSec: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

export interface RateLimiterOptions {
  readonly limit: number;
  readonly windowMs: number;
  readonly maxKeys?: number;
  readonly now?: () => number;
}

/**
 * Sliding-window limiter held in memory.
 *
 * On serverless platforms each warm instance keeps its own counters, so this is a
 * best-effort first line of defence against bursts and accidental loops, not a global
 * quota. The README describes moving it to a shared store for hard guarantees.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, maxKeys = 10_000, now = Date.now } = options;
  const hits = new Map<string, number[]>();

  const prune = (current: number): void => {
    for (const [key, stamps] of hits) {
      const last = stamps[stamps.length - 1];
      if (last === undefined || last <= current - windowMs) hits.delete(key);
    }
    // Still too big (many active keys): drop the oldest entries first.
    for (const key of hits.keys()) {
      if (hits.size <= maxKeys) break;
      hits.delete(key);
    }
  };

  return {
    check(key: string): RateLimitResult {
      const current = now();
      if (hits.size >= maxKeys && !hits.has(key)) prune(current);

      const recent = (hits.get(key) ?? []).filter((stamp) => stamp > current - windowMs);
      if (recent.length >= limit) {
        const oldest = recent[0] ?? current;
        hits.set(key, recent);
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - current) / 1000)),
        };
      }
      recent.push(current);
      hits.set(key, recent);
      return { allowed: true, remaining: limit - recent.length, retryAfterSec: 0 };
    },
  };
}
