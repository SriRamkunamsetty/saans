/**
 * Text hygiene for anything that is not ours: user questions, place names, model output.
 *
 * Removes control characters, invisible "format" characters (zero-width and bidirectional
 * overrides, commonly used to hide instructions) and angle brackets, so untrusted text can
 * never close the delimiter tags we wrap it in.
 */
const HIDDEN_OR_CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const ANGLE_BRACKETS = /[<>]/g;
const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+/gi;

export function sanitizeText(input: string, maxLength: number): string {
  const cleaned = input
    .normalize("NFKC")
    .replace(HIDDEN_OR_CONTROL, " ")
    .replace(ANGLE_BRACKETS, "")
    .replace(/\s+/g, " ")
    .trim();
  // Array.from keeps surrogate pairs (emoji, Indic conjuncts) from being cut in half.
  return Array.from(cleaned).slice(0, maxLength).join("");
}

/** Model output is untrusted too: remove links so it cannot be used to phish. */
export function stripLinks(text: string): string {
  return text.replace(URL_LIKE, "[link removed]");
}
