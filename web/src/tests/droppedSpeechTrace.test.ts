import { describe, expect, it } from "vitest";
import { speechDroppedWhileBusy } from "../utils/companionVideoCallTrace";

// Fable review, 2026-11-21 (owner's latency push after the Nuance Labs call): when Deepgram's final transcript carries
// more words than the early one the companion is already answering, the FaceTime call drops them while she thinks or
// speaks, and nothing records it. Why logs missed it: the gate returned silently. Why the lab missed it: no test asked
// what happens to her words while the companion is busy. Honest records: what she said must be visible.
describe("her words that arrive while the companion is busy", () => {
  it("are recorded with the phase they were dropped in", () => {
    expect(speechDroppedWhileBusy("thinking", "and I also like cats")).toEqual({
      eventName: "speech_dropped_while_busy",
      payload: { phase: "thinking", transcript: "and I also like cats", chars: 20 },
    });
  });

  it("are not recorded when the companion is free to hear them", () => {
    expect(speechDroppedWhileBusy("listening", "hello")).toBeNull();
  });

  it("are not recorded when there were no words", () => {
    expect(speechDroppedWhileBusy("speaking", "   ")).toBeNull();
  });
});
