import { describe, expect, it } from "vitest";
import { listeningReaction } from "../components/CompanionShowroom";

// Owner, 2026-11-21, after a call with Nuance Labs' Emma: her face reacts while you talk; Sunny's companion stood frozen
// for ~3 s from Ila's first word to its own first sound. Why the human caught it: only a person on the call sees a still
// face. Why logs missed it: no event marks the companion reacting to her voice. Why the lab missed it: video calls turn
// the listening gesture off (it fired on every mic restart) and nothing replaced it with a reaction to her actual voice.
describe("the companion's face reacts when she starts talking on FaceTime", () => {
  it("smiles softly at her first words of a turn", () => {
    expect(listeningReaction({ reactedThisTurn: false, phase: "idle" })).toEqual({ emote: "happy", intensity: 0.35, durationMs: 1200 });
    expect(listeningReaction({ reactedThisTurn: false, phase: "listening" })).not.toBeNull();
  });

  it("reacts once per turn, not on every word", () => {
    expect(listeningReaction({ reactedThisTurn: true, phase: "listening" })).toBeNull();
  });

  it("does not react to sound while the companion is thinking or speaking", () => {
    expect(listeningReaction({ reactedThisTurn: false, phase: "thinking" })).toBeNull();
    expect(listeningReaction({ reactedThisTurn: false, phase: "speaking" })).toBeNull();
  });
});
