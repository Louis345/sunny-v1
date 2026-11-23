/**
 * Who says a game's line (owner, 2026-11-22; Reina: "it talks too much and doesn't follow up"). The narrator reads only
 * what the game put on screen — the instruction it reported with reportStep, the problem it opened, its progress — or
 * the test word (and a tapped chunk of it). Anything else a game asks to say (chat, praise, her name) is not spoken: it
 * reaches the companion as a fact, and she decides in her own words whether to say anything. The narrator also never
 * repeats a screen line within one game unless she taps replay. Test words keep their measured path untouched.
 */
export type NarrationRoute =
  | { to: "narrator"; kind: "test_word" | "screen_text"; text: string; fact: string }
  | { to: "companion"; fact: string }
  | { to: "skip"; reason: "repeat" };

const MAX_LINES = 60;
const REPLAY = /replay|repeat|again|hear/i;

const tokens = (text: string): string[] => text.toLowerCase().normalize("NFC").match(/[\p{L}\p{N}]+|[+\-×x÷*/=?<>]/gu) ?? [];
const words = (text: string): string => text.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "");

function gameKey(state: Record<string, unknown>): string {
  for (const field of ["launchToken", "nodeId", "activityId", "game"]) {
    const value = state[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function screenLines(state: Record<string, unknown>): string[] {
  const challenge = state.currentChallenge;
  const fromChallenge = typeof challenge === "string" ? challenge
    : challenge && typeof challenge === "object" && typeof (challenge as { prompt?: unknown }).prompt === "string"
      ? String((challenge as { prompt: string }).prompt) : "";
  return [fromChallenge, state.itemPrompt, state.progress, state.instruction]
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0);
}

function contains(haystack: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((token, index) => haystack[start + index] === token)) return true;
  }
  return false;
}

export class GameNarrationRouter {
  private key = "";
  private screen: string[][] = [];
  private spoken = new Set<string>();

  /** Every game state report: what the game says is on screen now. A new game starts a fresh screen and memory. */
  noteScreen(state: Record<string, unknown>): void {
    const key = gameKey(state);
    if (key && key !== this.key) {
      this.key = key;
      this.screen = [];
      this.spoken.clear();
    }
    for (const line of screenLines(state)) {
      this.screen.push(tokens(line));
      if (this.screen.length > MAX_LINES) this.screen.shift();
    }
  }

  route(text: string, metadata: Record<string, unknown>, childNames: string[]): NarrationRoute {
    const line = text.trim();
    // A new game's first line may arrive before (or without) any screen report: never judge it by the last game's screen.
    const key = gameKey(metadata);
    if (key && key !== this.key) {
      this.key = key;
      this.screen = [];
      this.spoken.clear();
    }
    const word = typeof metadata.word === "string" ? words(metadata.word) : "";
    const said = words(line);
    if (metadata.assessmentMode === true || (word && said && word.includes(said))) {
      console.log(` 🎮 [game-narration] [routed] [narrator] kind=test_word`);
      return { to: "narrator", kind: "test_word", text: line, fact: `The game's narrator just read her word aloud.` };
    }
    const namesIt = childNames.some(name => name && new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu").test(line));
    // The screen is the current game's (noteScreen resets it); a game's own postMessage often carries no launch id.
    // A game that never reported its screen cannot be checked: its lines are read, or a dyslexic child hears nothing
    // (Ila, 11/22: every line of her board-12 game went silent and she got stuck and upset).
    const screenKnown = this.screen.length > 0;
    const onScreen = !screenKnown || this.screen.some(screen => contains(screen, tokens(line)));
    if (!screenKnown && !namesIt) console.log(` 🎮 [game-narration] [screen] [unknown] reading the game's line`);
    if (namesIt || !onScreen) {
      console.log(` 🎮 [game-narration] [routed] [companion-fact] reason=${namesIt ? "names_child" : "not_on_screen"}`);
      return { to: "companion", fact: `The game wanted to say aloud: "${line}". It was not spoken (the narrator reads only what is on screen). Use it only if it helps her, in your own words; staying quiet is fine.` };
    }
    const spokenKey = tokens(line).join(" ");
    if (this.spoken.has(spokenKey) && !REPLAY.test(String(metadata.reason ?? ""))) {
      console.log(` 🎮 [game-narration] [routed] [skipped] reason=repeat`);
      return { to: "skip", reason: "repeat" };
    }
    this.spoken.add(spokenKey);
    if (this.spoken.size > MAX_LINES) this.spoken.delete(this.spoken.values().next().value as string);
    console.log(` 🎮 [game-narration] [routed] [narrator] kind=screen_text`);
    return { to: "narrator", kind: "screen_text", text: line, fact: `The game's narrator just read aloud: "${line}". She heard it; do not repeat it.` };
  }
}

/** The one door for a game's narration_request: route it, tell the companion the fact, and let the narrator read. */
export async function requestGameNarrationForSession(session: {
  gameNarration?: GameNarrationRouter; childName: string; sessionTtsLabel: string;
  noteExternalEvent(event: { source: string; summary: string }): void;
  recordDebugEvent?(component: string, action: string, payload: Record<string, unknown>): void;
  speakGameNarration(text: string, metadata: Record<string, unknown>): Promise<void>;
}, text: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const route = (session.gameNarration ??= new GameNarrationRouter()).route(text, metadata, [session.childName, session.sessionTtsLabel]);
  session.recordDebugEvent?.("game_narration", "routed", { to: route.to, text, reason: metadata.reason, itemId: metadata.itemId });
  if (route.to === "skip") return;
  // The kind rides on the playback: only a test word plays through the quiet button (11/23, mute let the narrator talk).
  if (route.to === "narrator") await session.speakGameNarration(route.text, { ...metadata, narration: route.kind });
  if (route.to === "narrator" && route.kind === "test_word") return; // she already holds the word as private context
  try {
    session.noteExternalEvent({ source: route.to === "narrator" ? "narrator" : "game", summary: route.fact });
  } catch (error) {
    console.error(" 🎮 [game-narration] [companion-fact] [failed]", error);
  }
}
