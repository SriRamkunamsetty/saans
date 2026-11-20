import { AppError } from "../domain/errors";

const IP_LIKE = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * Rejects cross-site browser requests. Browsers always send `Origin` on cross-origin
 * POSTs; requests without it (curl, server-to-server) are allowed through because the
 * browser attack this guards against cannot omit it.
 */
export function assertSameOrigin(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError("forbidden", "Cross-site requests are not allowed.");
  }
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("forbidden", "Invalid Origin header.");
  }
  if (!host || originHost !== host) {
    throw new AppError("forbidden", "Cross-site requests are not allowed.");
  }
}

/**
 * Identifies the caller for rate limiting. On Vercel the platform sets
 * `x-forwarded-for` itself, so the first hop is the real client address.
 */
export function getClientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || headers.get("x-real-ip")?.trim() || "";
  return IP_LIKE.test(candidate) ? candidate : "unknown";
}

/** Reads a JSON body with a hard size limit, so oversized payloads never get parsed. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AppError("unsupported_media_type", "Send the request body as application/json.");
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AppError("payload_too_large", "Request body is too large.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new AppError("payload_too_large", "Request body is too large.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("bad_request", "Request body is not valid JSON.");
  }
}
