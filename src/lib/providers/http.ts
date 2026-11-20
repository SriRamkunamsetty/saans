import { AppError } from "../domain/errors";

export interface FetchDeps {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export const DEFAULT_UPSTREAM_TIMEOUT_MS = 6000;

/**
 * Fetches JSON from a fixed, trusted upstream with a hard timeout. Upstream bodies and
 * status details are never forwarded to clients — only a generic AppError.
 */
export async function fetchUpstreamJson(url: URL, deps: FetchDeps = {}): Promise<unknown> {
  const { fetchImpl = fetch, timeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS } = deps;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw timedOut
      ? new AppError("upstream_timeout", "The data service took too long to respond.")
      : new AppError("upstream_failed", "The data service could not be reached.");
  }
  if (!response.ok) {
    throw new AppError("upstream_failed", "The data service returned an error.");
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new AppError("upstream_failed", "The data service returned an unreadable response.");
  }
}
