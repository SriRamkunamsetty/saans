import { AppError } from "./domain/errors";
import type { ApiErrorBody } from "./domain/api";

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

export function json(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Cache-Control": "no-store", ...BASE_HEADERS, ...init.headers },
  });
}

/**
 * Converts any thrown value into a safe response. Only `AppError` messages are shown to
 * clients; anything unexpected is logged server-side and replaced with a generic message,
 * so stack traces and upstream details never leak.
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    const body: ApiErrorBody = { error: { code: error.code, message: error.message } };
    return json(body, { status: error.status, headers: { ...error.headers } });
  }
  console.error(JSON.stringify({ level: "error", event: "unhandled", name: nameOf(error) }));
  const body: ApiErrorBody = {
    error: { code: "internal", message: "Something went wrong. Please try again." },
  };
  return json(body, { status: 500 });
}

function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
