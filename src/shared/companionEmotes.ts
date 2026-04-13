/**
 * Emotes for `expressCompanion` and optional `CompanionEventPayload.emote`.
 * Single source for server Zod, validation, and web.
 */

export const COMPANION_EMOTES = [
  "happy",
  "sad",
  "thinking",
  "surprised",
  "celebrating",
  "neutral",
  "wink",
] as const;

export type CompanionEmote = (typeof COMPANION_EMOTES)[number];

const EMOTE_SET = new Set<string>(COMPANION_EMOTES);

export function isCompanionEmote(v: unknown): v is CompanionEmote {
  return typeof v === "string" && EMOTE_SET.has(v);
}
