import type { Narrative } from "../domain/api";
import type { Plan } from "../domain/plan";
import type { Language } from "../domain/profile";
import { sanitizeText } from "../security/sanitize";
import { MAX_QUESTION_LENGTH } from "../domain/schemas";
import { ruleBasedSummary } from "./fallback";
import { generateWithGemini } from "./gemini";
import { buildUserPrompt } from "./prompt";

export interface NarrativeInput {
  readonly place: string;
  readonly plan: Plan;
  readonly pm25: number | null;
  readonly language: Language;
  readonly question: string | undefined;
}

export interface NarrativeDeps {
  readonly geminiApiKey: string | undefined;
  readonly geminiModel: string;
  readonly aiTimeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

export type NarrativeComposer = (input: NarrativeInput, deps: NarrativeDeps) => Promise<Narrative>;

/**
 * Produces the user-facing summary (and optional answer). Never throws: any AI problem
 * degrades to the deterministic summary with an honest notice, so a model outage can
 * never take the assistant down.
 */
export const composeNarrative: NarrativeComposer = async (input, deps) => {
  const question = input.question ? sanitizeText(input.question, MAX_QUESTION_LENGTH) : "";
  const fallbackSummary = ruleBasedSummary(input.place, input.plan);

  if (!deps.geminiApiKey) {
    return {
      summary: fallbackSummary,
      answer: null,
      source: "rules",
      notice:
        question || input.language !== "en"
          ? "AI answers and translation are not enabled on this deployment, so this summary is rule-based and in English."
          : null,
    };
  }

  try {
    const output = await generateWithGemini(
      buildUserPrompt({
        place: input.place,
        plan: input.plan,
        pm25: input.pm25,
        language: input.language,
        question: question || null,
      }),
      {
        apiKey: deps.geminiApiKey,
        model: deps.geminiModel,
        timeoutMs: deps.aiTimeoutMs,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      },
    );
    return {
      summary: output.summary,
      answer: question && output.answer ? output.answer : null,
      source: "gemini",
      notice: null,
    };
  } catch (error) {
    // Log only the error class: messages can contain upstream details we do not control.
    console.error(
      JSON.stringify({
        level: "warn",
        event: "ai_fallback",
        reason: error instanceof Error ? error.name : "unknown",
      }),
    );
    return {
      summary: fallbackSummary,
      answer: null,
      source: "rules",
      notice: "The AI summary was unavailable just now, so this summary is rule-based.",
    };
  }
};
