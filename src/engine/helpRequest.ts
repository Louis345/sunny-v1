/** Speech as speech recognition writes it, normalized for matching her companion's name (no punctuation, lower case). */
export function normalizeSpeechText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
