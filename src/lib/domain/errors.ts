/**
 * A single error type carries everything the HTTP layer needs, so route code never
 * has to guess which status code or message is safe to show a client.
 */
export type ErrorCode =
  | "bad_request"
  | "forbidden"
  | "payload_too_large"
  | "unsupported_media_type"
  | "rate_limited"
  | "upstream_failed"
  | "upstream_timeout"
  | "no_data"
  | "internal";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  forbidden: 403,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  upstream_failed: 502,
  upstream_timeout: 504,
  no_data: 404,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Extra response headers (e.g. Retry-After). */
  readonly headers: Readonly<Record<string, string>>;

  constructor(code: ErrorCode, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.headers = headers;
  }
}
