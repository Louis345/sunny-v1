/**
 * The game announcer: a fixed, pre-recorded line bank written each week from the child's soul file,
 * and a picker that decides, in code, which clips to play for a moment in the game.
 *
 * The bank is personal (her name, her creatures, what she loves, Japanese when she loves it) but fixed,
 * so play has no model call and no wait. Facts in a line (a word she missed before) come from the
 * record the game passes in, never from the writer: a callback line plays only when the record says so.
 */

export type AnnouncerEvent =
  | "intro"
  | "round"
  | "right"
  | "perfect"
  | "streak"
  | "miss"
  | "catch"
  | "breakFree"
  | "hatch"
  | "eggIntro"
  | "eggCrack"
  | "eggNotYet"
  | "callback";

export interface AnnouncerClip {
  id: string;
  /** A whole line for a moment, or a "slot" piece the picker stitches (name, number, creature). */
  event: AnnouncerEvent | "slot";
  text: string;
  lang: "en" | "ja";
  /** Path of the recorded clip, relative to the bank. */
  file: string;
  /** Callback lines: the one word this line is about. */
  word?: string;
  /** Slot pieces: "name", "streak:5", "round:3", "creature:glowmoth", "word:carnival" (the companion saying a word). */
  slot?: string;
}

export interface AnnouncerBank {
  childId: string;
  /** ISO week the bank was written for; a new week brings new lines. */
  week: string;
  clips: AnnouncerClip[];
}

export interface AnnounceMoment {
  event: Exclude<AnnouncerEvent, "callback">;
  round?: number;
  streak?: number;
  creatureId?: string;
  /** The word she just answered (spelling). */
  word?: string;
  /** From the record: she missed this word on an earlier day. */
  missedBefore?: boolean;
}

export interface AnnouncerMemory {
  /** Clip ids spoken recently, newest last. */
  recent: string[];
  lastSpokeAt: number;
  now: number;
}

/** How often a moment gets a line; the big moments always do. Sparse keeps it special. */
const SPEAK_CHANCE: Partial<Record<AnnouncerEvent, number>> = { right: 0.35, miss: 0.5 };
/** Moments that may speak over a line that just started. */
const BIG_MOMENTS = new Set<AnnouncerEvent>(["catch", "hatch", "perfect", "eggCrack", "callback", "breakFree"]);
const QUIET_GAP_MS = 1500;
const RECENT_LIMIT = 6;

function slot(bank: AnnouncerBank, name: string): AnnouncerClip | undefined {
  return bank.clips.find((clip) => clip.event === "slot" && clip.slot === name);
}

/** A fresh line for the event: not one said recently; the least recent when every line was. */
function freshLine(bank: AnnouncerBank, event: AnnouncerEvent, recent: string[], rand: () => number): AnnouncerClip | undefined {
  const lines = bank.clips.filter((clip) => clip.event === event);
  if (!lines.length) return undefined;
  const window = recent.slice(-Math.min(RECENT_LIMIT, lines.length - 1));
  const fresh = lines.filter((clip) => !window.includes(clip.id));
  const pool = fresh.length ? fresh : lines;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/** Pick the clips for a moment, or null to stay quiet (the game then uses its own line). */
export function announce(
  bank: AnnouncerBank | null | undefined,
  moment: AnnounceMoment,
  memory: AnnouncerMemory,
  rand: () => number = Math.random,
): { clips: string[]; memory: AnnouncerMemory } | null {
  if (!bank) return null;
  const callback =
    (moment.event === "right" || moment.event === "perfect") && moment.missedBefore && moment.word
      ? bank.clips.find((clip) => clip.event === "callback" && clip.word?.toLowerCase() === moment.word!.toLowerCase())
      : undefined;
  const event: AnnouncerEvent = callback ? "callback" : moment.event;
  if (memory.now - memory.lastSpokeAt < QUIET_GAP_MS && !BIG_MOMENTS.has(event)) return null;
  const chance = SPEAK_CHANCE[event];
  if (!callback && chance !== undefined && rand() >= chance) return null;

  let clips: AnnouncerClip[] = [];
  if (callback) clips = [callback];
  else if (event === "streak") {
    const line = slot(bank, `streak:${moment.streak ?? 0}`);
    const name = slot(bank, "name");
    if ((moment.streak ?? 0) < 3 || !line) return null;
    clips = [...(name && rand() < 0.5 ? [name] : []), line];
  } else if (event === "round") {
    const line = slot(bank, `round:${moment.round ?? 0}`);
    if (!line) return null;
    clips = [line];
  } else {
    const line = freshLine(bank, event, memory.recent, rand);
    if (!line) return null;
    clips = [line];
    const creature = moment.creatureId ? slot(bank, `creature:${moment.creatureId}`) : undefined;
    if (creature && (event === "intro" || event === "catch" || event === "hatch")) clips.push(creature);
  }
  const ids = clips.map((clip) => clip.id);
  return {
    clips: ids,
    memory: { recent: [...memory.recent, ...ids].slice(-RECENT_LIMIT * 2), lastSpokeAt: memory.now, now: memory.now },
  };
}

const LETTER_RUN = /\b[a-z]\b(?:\s*[,.\-–]\s*|\s+)\b[a-z]\b(?:\s*[,.\-–]\s*|\s+)\b[a-z]\b/i;
const HYPHEN_SPELLED = /\b[a-z](?:-[a-z]){2,}\b/i;
const MISS_SHAME = /\b(wrong|fail\w*|bad|oops|missed|mistake|no\b|nope|lose|loser|try harder|too slow)\b/i;
const PRIVATE = /\b(adhd|dyslex\w*|diagnos\w*|delay\w*|percentile|iep|therap\w*|disorder|disabilit\w*|score[sd]?|grade[sd]?|test)\b/i;
const MAX_WORDS = 10;

/** Whether a written line may go in the bank. The writer is told these rules; this check enforces them. */
export function checkAnnouncerLine(
  text: string,
  event: AnnouncerEvent | "slot",
  targetWords: string[],
  options: { avoidNames?: string[] } = {},
): { ok: true } | { ok: false; reason: string } {
  if (LETTER_RUN.test(text) || HYPHEN_SPELLED.test(text)) return { ok: false, reason: "spells letters out" };
  if (PRIVATE.test(text)) return { ok: false, reason: "mentions something private" };
  if (options.avoidNames?.some((name) => new RegExp(`\\b${name}\\b`, "i").test(text))) return { ok: false, reason: "compares her to someone" };
  if (event === "miss" && MISS_SHAME.test(text)) return { ok: false, reason: "tells her she was wrong" };
  if (event !== "callback" && targetWords.some((word) => new RegExp(`\\b${word}\\b`, "i").test(text))) {
    return { ok: false, reason: "says a target word before she answers" };
  }
  if (text.trim().split(/\s+/).length > MAX_WORDS) return { ok: false, reason: "too long for a beat" };
  return { ok: true };
}
