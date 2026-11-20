import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientError, requestAssessment, searchPlaces } from "@/lib/client/api";
import { DEFAULT_PROFILE } from "@/lib/domain/profile";
import { jsonResponse, makeAssessResponse } from "./fixtures";

const stubFetch = (impl: typeof fetch) => {
  const fn = vi.fn<typeof fetch>(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
};

const input = {
  location: { name: "Delhi", lat: 28.6, lon: 77.2 },
  profile: DEFAULT_PROFILE,
  language: "en" as const,
};

afterEach(() => vi.unstubAllGlobals());

describe("searchPlaces", () => {
  it("URL-encodes the query and returns results", async () => {
    const fn = stubFetch(async () => jsonResponse({ results: [{ id: "1", name: "A & B" }] }));
    await expect(searchPlaces("A & B/../")).resolves.toEqual([{ id: "1", name: "A & B" }]);
    expect(fn.mock.calls[0]?.[0]).toBe("/api/geocode?q=A%20%26%20B%2F..%2F");
  });

  it("passes an abort signal through", async () => {
    const fn = stubFetch(async () => jsonResponse({ results: [] }));
    const controller = new AbortController();
    await searchPlaces("Delhi", controller.signal);
    expect(fn.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it("shows the server's safe message on API errors", async () => {
    stubFetch(async () =>
      jsonResponse(
        { error: { code: "bad_request", message: "Type at least 2 characters to search." } },
        400,
      ),
    );
    await expect(searchPlaces("a")).rejects.toThrow("Type at least 2 characters to search.");
  });

  it("uses a generic message when the error body is not JSON", async () => {
    stubFetch(async () => new Response("<html>502</html>", { status: 502 }));
    await expect(searchPlaces("Delhi")).rejects.toThrow("Something went wrong. Please try again.");
  });

  it("reports network failure in plain language", async () => {
    stubFetch(async () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(searchPlaces("Delhi")).rejects.toMatchObject({
      name: "ClientError",
      message: expect.stringContaining("Could not reach the service"),
    });
  });

  it("re-throws aborts untouched so callers can ignore them", async () => {
    stubFetch(async () => Promise.reject(new DOMException("aborted", "AbortError")));
    await expect(searchPlaces("Delhi")).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("requestAssessment", () => {
  it("POSTs JSON and returns the parsed plan", async () => {
    const data = makeAssessResponse();
    const fn = stubFetch(async () => jsonResponse(data));
    await expect(requestAssessment(input)).resolves.toEqual(data);
    const init = fn.mock.calls[0]?.[1];
    expect(fn.mock.calls[0]?.[0]).toBe("/api/assess");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init?.body as string)).toEqual(input);
  });

  it("surfaces API errors as ClientError", async () => {
    stubFetch(async () =>
      jsonResponse(
        { error: { code: "rate_limited", message: "Too many requests. Please wait a moment." } },
        429,
      ),
    );
    await expect(requestAssessment(input)).rejects.toBeInstanceOf(ClientError);
  });

  it("passes a signal when given one", async () => {
    const fn = stubFetch(async () => jsonResponse(makeAssessResponse()));
    const controller = new AbortController();
    await requestAssessment(input, controller.signal);
    expect(fn.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});
