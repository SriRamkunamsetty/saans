import type { ApiErrorBody, AssessResponse, PlaceSummary } from "../domain/api";
import type { Profile, Language } from "../domain/profile";

export class ClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientError";
  }
}

export interface AssessInput {
  location: { name: string; lat: number; lon: number };
  profile: Profile;
  language: Language;
  question?: string;
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as ApiErrorBody | null)?.error?.message;
    throw new ClientError(message ?? "Something went wrong. Please try again.");
  }
  return body as T;
}

function wrapNetworkError(error: unknown): never {
  if (error instanceof ClientError) throw error;
  if (error instanceof DOMException && error.name === "AbortError") throw error;
  throw new ClientError("Could not reach the service. Check your connection and try again.");
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceSummary[]> {
  try {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
      ...(signal ? { signal } : {}),
    });
    return (await parseOrThrow<{ results: PlaceSummary[] }>(response)).results;
  } catch (error) {
    return wrapNetworkError(error);
  }
}

export async function requestAssessment(
  input: AssessInput,
  signal?: AbortSignal,
): Promise<AssessResponse> {
  try {
    const response = await fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    });
    return await parseOrThrow<AssessResponse>(response);
  } catch (error) {
    return wrapNetworkError(error);
  }
}
