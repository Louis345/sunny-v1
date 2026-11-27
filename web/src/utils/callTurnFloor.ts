import { assign, createActor, setup } from "xstate";

/**
 * Whose turn it is on a call (Ila 11/22: "she doesn't listen when I say stop… I want to speak"). Her voice always
 * wins: speaking over the companion, or a stop word while it is still thinking, ends the companion's turn at once,
 * and a bare stop is never sent to the companion as a question (it answered "stop" with "want to hear more?").
 * Code only routes the turn; what the companion says next comes from the live call.
 */
import { isOnlyStopWords } from "../../../src/shared/stopWords";

export { isOnlyStopWords };

type Ctx = { turn: number };
type Ev =
  | { type: "TURN_STARTED"; turn: number }
  | { type: "SPEAKING" }
  | { type: "TURN_ENDED"; turn: number }
  | { type: "SPOKE_OVER" }
  | { type: "STOP_HEARD" }
  | { type: "CHILD_ANSWERED" };

export const callTurnMachine = setup({
  types: { context: {} as Ctx, events: {} as Ev },
  guards: { isCurrentTurn: ({ context, event }) => event.type === "TURN_ENDED" && event.turn === context.turn },
  actions: { rememberTurn: assign({ turn: ({ event }) => (event.type === "TURN_STARTED" ? event.turn : 0) }) },
}).createMachine({
  id: "callTurn",
  initial: "listening",
  context: { turn: 0 },
  on: { TURN_STARTED: { target: ".thinking", actions: "rememberTurn" } },
  states: {
    listening: {},
    thinking: { on: { SPEAKING: "speaking", TURN_ENDED: { guard: "isCurrentTurn", target: "listening" }, SPOKE_OVER: "interrupted", STOP_HEARD: "listening" } },
    speaking: { on: { TURN_ENDED: { guard: "isCurrentTurn", target: "listening" }, SPOKE_OVER: "interrupted", STOP_HEARD: "listening" } },
    interrupted: { on: { CHILD_ANSWERED: "listening" } },
  },
});

export type CallTurnState = "listening" | "thinking" | "speaking" | "interrupted";
export type ChildFinalRoute = "answer" | "listen" | "busy";

export function createCallTurnFloor() {
  const actor = createActor(callTurnMachine).start();
  const current = () => actor.getSnapshot().value as CallTurnState;
  let last = current();
  actor.subscribe((snapshot) => {
    const next = snapshot.value as CallTurnState;
    if (next !== last) console.log(` 🎮 [call-turn] [changed] ${last} -> ${next}`);
    last = next;
  });
  let nextTurn = 0;
  let stopTurn: (() => void) | null = null;
  const endTurnNow = (why: string) => {
    const stop = stopTurn;
    stopTurn = null;
    console.log(` 🎮 [call-turn] [companion-stopped] reason=${why}`);
    try { stop?.(); } catch (error) { console.error(" 🎮 [call-turn] [stop] [failed]", error); }
  };
  const busy = () => current() === "thinking" || current() === "speaking";
  return {
    current,
    /** A companion turn begins; `stop` ends its speech and its stream. Returns the turn's id for companionTurnEnded. */
    companionTurnStarted(stop: () => void): number {
      nextTurn += 1;
      stopTurn = stop;
      actor.send({ type: "TURN_STARTED", turn: nextTurn });
      return nextTurn;
    },
    companionSpeaking: () => actor.send({ type: "SPEAKING" }),
    companionTurnEnded(turn: number) {
      if (turn === nextTurn) stopTurn = null;
      actor.send({ type: "TURN_ENDED", turn });
    },
    /** Her voice over the companion's: the companion stops now. True when there was a turn to stop. */
    childSpokeOver(): boolean {
      if (!busy()) return false;
      endTurnNow("spoke_over");
      actor.send({ type: "SPOKE_OVER" });
      return true;
    },
    /** What to do with words she finished saying. */
    childFinal(text: string): ChildFinalRoute {
      const stopOnly = isOnlyStopWords(text);
      if (busy()) {
        if (!stopOnly) return "busy";
        endTurnNow("stop_word");
        actor.send({ type: "STOP_HEARD" });
        return "listen";
      }
      if (stopOnly) return "listen";
      actor.send({ type: "CHILD_ANSWERED" });
      return "answer";
    },
  };
}

export type CallTurnFloor = ReturnType<typeof createCallTurnFloor>;
