import { createActor, setup } from "xstate";

/**
 * Who is talking right now: one voice at a time (owner, 2026-11-21: the Orb announcer talked over Matilda).
 * The companion is the relationship, so she always gets the floor; the announcer speaks only when the floor is
 * free and stops the moment she starts.
 */
export const voiceFloorMachine = setup({
  types: {
    events: {} as
      | { type: "COMPANION_STARTED" }
      | { type: "COMPANION_ENDED" }
      | { type: "ANNOUNCER_STARTED" }
      | { type: "ANNOUNCER_ENDED" },
  },
}).createMachine({
  id: "voiceFloor",
  initial: "free",
  states: {
    free: { on: { COMPANION_STARTED: "companion", ANNOUNCER_STARTED: "announcer" } },
    announcer: { on: { COMPANION_STARTED: "companion", ANNOUNCER_ENDED: "free" } },
    companion: { on: { COMPANION_ENDED: "free" } },
  },
});

export type VoiceFloorState = "free" | "companion" | "announcer";

export interface VoiceFloor {
  current(): VoiceFloorState;
  companionSpeaking(): boolean;
  companionStarted(): void;
  companionEnded(): void;
  announcerStarted(): void;
  announcerEnded(): void;
  /** Called with the new holder every time the floor changes hands; returns the unsubscribe. */
  onChange(listener: (state: VoiceFloorState) => void): () => void;
}

export function createVoiceFloor(): VoiceFloor {
  const actor = createActor(voiceFloorMachine).start();
  const current = () => actor.getSnapshot().value as VoiceFloorState;
  let last = current();
  actor.subscribe((snapshot) => {
    const next = snapshot.value as VoiceFloorState;
    if (next !== last) console.log(` 🎮 [voice-floor] [changed] ${last} -> ${next}`);
    last = next;
  });
  const send = (type: "COMPANION_STARTED" | "COMPANION_ENDED" | "ANNOUNCER_STARTED" | "ANNOUNCER_ENDED") => {
    if (type === "COMPANION_STARTED" && current() === "companion") return;
    if (type === "COMPANION_ENDED" && current() !== "companion") return;
    actor.send({ type });
  };
  return {
    current,
    companionSpeaking: () => current() === "companion",
    companionStarted: () => send("COMPANION_STARTED"),
    companionEnded: () => send("COMPANION_ENDED"),
    announcerStarted: () => send("ANNOUNCER_STARTED"),
    announcerEnded: () => send("ANNOUNCER_ENDED"),
    onChange(listener) {
      let seen = current();
      const subscription = actor.subscribe((snapshot) => {
        const next = snapshot.value as VoiceFloorState;
        if (next === seen) return;
        seen = next;
        listener(next);
      });
      return () => subscription.unsubscribe();
    },
  };
}

/** The one floor every voice in the app shares. */
export const voiceFloor = createVoiceFloor();
