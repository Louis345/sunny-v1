/**
 * The first and last words of a FaceTime call, written by the companion from live context (owner 2026-11-22: no
 * canned pickup greeting or goodbye). Code only says which moment it is and passes the call's own lines; what she
 * says is hers.
 */
export type CallMoment = "opening" | "goodbye" | "showroom_intro" | "showroom_plead";
const CALL_MOMENTS = new Set<CallMoment>(["opening", "goodbye", "showroom_intro", "showroom_plead"]);

/** Showroom moments are spoken in the showroom (not on a call); the rest are call moments. */
export function isShowroomMoment(moment: CallMoment): boolean {
  return moment === "showroom_intro" || moment === "showroom_plead";
}

const MAX_RECENT_LINES = 8;
const MAX_LINE_CHARS = 240;

export function resolveCallMoment(value: unknown): CallMoment | null {
  return CALL_MOMENTS.has(value as CallMoment) ? (value as CallMoment) : null;
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
  // Audit 2026-11-22: the showroom intro/plead were scripts; she now says them as herself, from her persona.
  if (input.moment === "showroom_intro") {
    return [
      "(Note from the showroom, not words from her: the child is looking at you in the companion showroom and tapped to hear you. You may not know each other yet.)",
      "She wants to hear who you are. Coins, rewards and homework are not part of this moment.",
    ].join("\n");
  }
  if (input.moment === "showroom_plead") {
    return [
      "(Note from the showroom, not words from her: the child tapped to hear why she should pick you as her companion.)",
      "She wants to hear from you before she chooses.",
    ].join("\n");
  }
  if (input.moment === "opening") {
    return [
      "(Note from the call, not words from her: the call just connected and nobody has spoken yet.)",
      "What you remember about her and your own life are above. Call time, coins, rewards and homework are not part of this moment.",
    ].join("\n");
  }
  return [
    "(Note from the call, not words from her: she is hanging up now.)",
    "The screen closes in a few seconds.",
    lines.length ? `What was said on this call, oldest first:\n${lines.join("\n")}` : "Almost nothing was said on this call.",
  ].join("\n");
}
