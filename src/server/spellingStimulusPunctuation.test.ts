import { describe, expect, it, vi } from "vitest";
import { narrateGameStimulus } from "./game-event-handler";

const play = (text: string, word: string) => narrateGameStimulus({
  text, metadata: { assessmentMode: true, itemId: "i1" }, childName: "Lab" as never, ttsLabel: "Lab",
  bridge: null, assessment: { itemId: "i1", word, audioDelivered: false }, record: vi.fn(),
});

describe("check words that end in punctuation", () => {
  // Human-caught: Reina's Nov 3 list had "Mr."; Hear word and Matilda's replay both
  // failed with spelling_stimulus_mismatch because the period was stripped from the
  // spoken text but not from the word. Every lab word was plain letters.
  it("plays a word whose own spelling ends in a period", async () => {
    await expect(play("Mr.", "Mr.")).rejects.toThrow("spelling_stimulus_audio_unavailable");
  });
  it("still plays a plain word spoken with a trailing period", async () => {
    await expect(play("night.", "night")).rejects.toThrow("spelling_stimulus_audio_unavailable");
  });
  it("still refuses a different word", async () => {
    await expect(play("Mrs.", "Mr.")).rejects.toThrow("spelling_stimulus_mismatch");
  });
});
