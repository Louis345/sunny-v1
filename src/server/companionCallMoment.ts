/**
 * The first and last words of a FaceTime call, written by the companion from live context (owner 2026-11-22: no
 * canned pickup greeting or goodbye). Code only says which moment it is and passes the call's own lines; what she
 * says is hers.
 */
export type CallMoment = "opening" | "goodbye";

const MAX_RECENT_LINES = 8;
const MAX_LINE_CHARS = 240;

export function resolveCallMoment(value: unknown): CallMoment | null {
  return value === "opening" || value === "goodbye" ? value : null;
}

export function resolveRecentCallLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.replace(/\s+/g, " ").trim().slice(0, MAX_LINE_CHARS))
    .filter(Boolean)
    .slice(-MAX_RECENT_LINES);
}

/** The turn the model answers. It is a note from the call, never words put in the child's mouth. */
export function buildCallMomentTurn(input: { moment: CallMoment; recentLines?: string[] }): string {
  const lines = input.recentLines ?? [];
  if (input.moment === "opening") {
    return [
      "(Note from the call, not words from her: the call just connected and nobody has spoken yet.)",
      "Say your first words to her, as yourself. Start from something real: what you remember about her, how long it has been since you last talked, or something going on in your own life right now.",
      "Never open with a stock greeting you could say to anyone, and do not bring up call time, coins, rewards, or homework.",
    ].join("\n");
  }
  return [
    "(Note from the call, not words from her: she is hanging up now.)",
    "Say goodbye in your own words, from this call, short enough to finish before the screen closes.",
    lines.length ? `What was said on this call, oldest first:\n${lines.join("\n")}` : "Almost nothing was said on this call.",
  ].join("\n");
}
