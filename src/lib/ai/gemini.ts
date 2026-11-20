import { z } from "zod";
import { stripLinks } from "../security/sanitize";
import { RESPONSE_JSON_SCHEMA, SYSTEM_INSTRUCTION } from "./prompt";

export interface GeminiOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_RESPONSE_BYTES = 64 * 1024;
/** Room for a short answer plus the model's (low-effort) reasoning, which shares this budget. */
const MAX_OUTPUT_TOKENS = 2048;

const ApiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(
              z.object({ text: z.string().optional(), thought: z.boolean().optional() }),
            ),
          })
          .optional(),
      }),
    )
    .min(1),
});

/** Model output is validated like any other untrusted input. */
const ModelOutputSchema = z.object({
  summary: z.string().trim().min(1).max(800),
  answer: z.string().trim().max(1000),
});

export interface GeminiOutput {
  readonly summary: string;
  readonly answer: string;
}

/**
 * Builds the request body. "structured" uses the documented schema-constrained output;
 * "plain" omits it and relies on the prompt plus our own validation. Gemini's structured
 * output request fields have changed between API versions, so a 400 on the first form
 * triggers one retry in the second, rather than silently losing the AI layer.
 *
 * Temperature is left at the model default: Google recommends 1.0 for Gemini 3 models.
 */
function buildBody(userPrompt: string, mode: "structured" | "plain"): string {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    thinkingConfig: { thinkingLevel: "low" },
    ...(mode === "structured"
      ? {
          responseFormat: {
            text: { mimeType: "APPLICATION_JSON", schema: RESPONSE_JSON_SCHEMA },
          },
        }
      : {}),
  };
  return JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig,
  });
}

/** Models occasionally wrap JSON in a markdown fence even when told not to. */
export function extractJson(text: string): unknown {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(unfenced);
}

/**
 * Calls the Gemini REST API directly with `fetch` — no SDK, so the dependency surface and
 * bundle stay small. The key travels in a header (never the URL) and is never logged.
 * One deadline covers every attempt. Every failure mode throws; the caller decides how to
 * fall back.
 */
export async function generateWithGemini(
  userPrompt: string,
  options: GeminiOptions,
): Promise<GeminiOutput> {
  const { apiKey, model, timeoutMs, fetchImpl = fetch } = options;
  const signal = AbortSignal.timeout(timeoutMs);

  const send = (mode: "structured" | "plain"): Promise<Response> =>
    fetchImpl(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: buildBody(userPrompt, mode),
      signal,
      cache: "no-store",
    });

  let response = await send("structured");
  if (response.status === 400) response = await send("plain");
  if (!response.ok) throw new Error(`Gemini request failed with status ${response.status}`);

  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("Gemini response was unexpectedly large");

  const envelope = ApiResponseSchema.parse(JSON.parse(text));
  const modelText = (envelope.candidates[0]?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("");

  const output = ModelOutputSchema.parse(extractJson(modelText));
  return { summary: stripLinks(output.summary), answer: stripLinks(output.answer) };
}
