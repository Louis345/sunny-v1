/** A child asking for help, as speech recognition writes it (normalized, no punctuation). */
const HELP_REQUEST = /\b(?:(?:can|could|will|would) (?:you|i|u) (?:help|get help|have help|get some help)|help me|i need (?:some )?help|i want help|im stuck|i am stuck|i dont get it|i dont understand)\b/;

export function normalizeSpeechText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** One rule for "she asked for help": the live companion route and the session scorecard both use it (audit 2026-11-13 f). */
export function isChildHelpRequest(transcript: string): boolean {
  return HELP_REQUEST.test(normalizeSpeechText(transcript));
}
