import { assign, createActor, setup } from "xstate";

/**
 * Who is talking in a homework session (owner, 2026-11-22: the ring announcer speaks, the commentators wait). Two
 * voices share one speaker: the game's narrator (on-screen text and test words) and the companion (her own model
 * output). The companion holds the floor for her whole turn, from the moment she starts thinking until her audio
 * ends; a narrator line asked for meanwhile waits (only the latest is kept) and plays when she finishes. When the
 * child speaks, both stop: a waiting screen line is dropped, a waiting test word still plays after her answer.
 * The kiosk's own floor (web/src/utils/voiceFloor.ts) keeps the recorded Orb announcer off both of these.
 */
export interface HeldLine { text: string; metadata: Record<string, unknown> }

const HELD_LIMIT_MS = 20_000;
const isTestWord = (line: HeldLine) => line.metadata.assessmentMode === true
  || (typeof line.metadata.word === "string" && line.metadata.word.trim() !== "");

export const serverVoiceFloorMachine = setup({
  types: {
    context: {} as { held?: HeldLine; reading?: HeldLine; timedOut: boolean },
    events: {} as
      | { type: "COMPANION_STARTED" }
      | { type: "COMPANION_ENDED" }
      | { type: "NARRATOR_STARTED"; line?: HeldLine }
      | { type: "NARRATOR_ENDED" }
      | { type: "CHILD_SPOKE" }
      | { type: "HOLD"; line: HeldLine }
      | { type: "CLEAR_HELD" },
  },
  actions: {
    hold: assign({ held: ({ event }) => (event.type === "HOLD" ? event.line : undefined) }),
    clearHeld: assign({ held: undefined, timedOut: false }),
    dropScreenLine: assign({ held: ({ context }) => (context.held && isTestWord(context.held) ? context.held : undefined) }),
    markTimedOut: assign({ timedOut: true }),
    noteReading: assign({ reading: ({ event }) => (event.type === "NARRATOR_STARTED" ? event.line : undefined) }),
    clearReading: assign({ reading: undefined }),
  },
}).createMachine({
  id: "serverVoiceFloor",
  initial: "free",
  context: { timedOut: false },
  on: {
    CHILD_SPOKE: { target: ".free", actions: "dropScreenLine" },
    CLEAR_HELD: { actions: "clearHeld" },
  },
  states: {
    free: { on: { COMPANION_STARTED: "companion", NARRATOR_STARTED: { target: "narrator", actions: "noteReading" } } },
    narrator: {
      exit: "clearReading",
      on: { COMPANION_STARTED: "companion", NARRATOR_ENDED: "free", NARRATOR_STARTED: { actions: "noteReading" } },
    },
    companion: {
      initial: "talking",
      on: { COMPANION_ENDED: "free", HOLD: { target: ".holding", actions: "hold" } },
      states: {
        talking: {},
        // A turn that never ends must not strand the game's word.
        holding: { after: { [HELD_LIMIT_MS]: { target: "#serverVoiceFloor.free", actions: "markTimedOut" } } },
      },
    },
  },
});

export type ServerVoiceFloorState = "free" | "companion" | "narrator";

export class ServerVoiceFloor {
  private readonly actor = createActor(serverVoiceFloorMachine).start();
  private releaseListeners: Array<(line: HeldLine) => void> = [];
  private last: ServerVoiceFloorState = "free";

  constructor() {
    this.actor.subscribe(snapshot => {
      const next = this.current();
      if (next !== this.last) console.log(` 🎮 [voice-floor] [changed] ${this.last} -> ${next}`);
      this.last = next;
      if (snapshot.context.timedOut) {
        const held = this.takeHeld();
        console.log(` 🎮 [voice-floor] [held-line] [released] reason=companion_turn_timeout`);
        if (held) this.releaseListeners.forEach(listener => listener(held));
      }
    });
  }

  current(): ServerVoiceFloorState {
    const value = this.actor.getSnapshot().value;
    return (typeof value === "string" ? value : Object.keys(value)[0]) as ServerVoiceFloorState;
  }

  /** Every companion turn state change. Returns the narrator line to play now when her turn just ended. */
  companionTurn(state: string): HeldLine | undefined {
    if (state === "IDLE" || state === "WORD_BUILDER") {
      if (this.current() === "companion") this.actor.send({ type: "COMPANION_ENDED" });
      return this.current() === "free" ? this.takeHeld() : undefined;
    }
    this.actor.send({ type: "COMPANION_STARTED" });
    return undefined;
  }

  /** She asked for help: her companion has the floor before her turn even starts. */
  companionClaimed(): void { this.actor.send({ type: "COMPANION_STARTED" }); }

  /** True when the narrator may speak now; otherwise the line waits for the companion (latest kept). */
  narratorMayStart(text: string, metadata: Record<string, unknown>): boolean {
    if (this.current() === "companion") {
      this.actor.send({ type: "HOLD", line: { text, metadata } });
      console.log(` 🎮 [voice-floor] [narrator] [held] word=${String(metadata.word ?? "")}`);
      return false;
    }
    this.actor.send({ type: "NARRATOR_STARTED", line: { text, metadata } });
    return true;
  }

  /** The narrator is reading an instruction or problem (not a test word): her voice may cut it off. */
  narratorReadingScreenText(): boolean {
    const reading = this.actor.getSnapshot().context.reading;
    return this.current() === "narrator" && Boolean(reading) && !isTestWord(reading!);
  }

  narratorEnded(): void { this.actor.send({ type: "NARRATOR_ENDED" }); }

  /** The child spoke: both voices stop and the floor is hers; her companion answers next. */
  childSpoke(): void { this.actor.send({ type: "CHILD_SPOKE" }); }

  /** Called with a held line the floor released on its own (a stuck turn). */
  onRelease(listener: (line: HeldLine) => void): void { this.releaseListeners.push(listener); }

  private takeHeld(): HeldLine | undefined {
    const held = this.actor.getSnapshot().context.held;
    if (held || this.actor.getSnapshot().context.timedOut) this.actor.send({ type: "CLEAR_HELD" });
    if (held) console.log(` 🎮 [voice-floor] [narrator] [released] word=${String(held.metadata.word ?? "")}`);
    return held;
  }
}
