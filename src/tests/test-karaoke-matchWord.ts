import { describe, it, expect } from "vitest";
import {
  matchKaraokeWord,
  classifyKaraokeWordMatch,
} from "../shared/karaokeMatchWord";
import { buildPronunciationTranscriptWindow } from "../shared/pronunciationTranscriptHygiene";

describe("matchKaraokeWord", () => {
  it("rejects Matt for mat (short expected word)", () => {
    expect(matchKaraokeWord("Matt", "mat")).toBe(false);
    expect(matchKaraokeWord("matt", "mat")).toBe(false);
  });

  it("accepts exact short words", () => {
    expect(matchKaraokeWord("mat", "mat")).toBe(true);
    expect(matchKaraokeWord("the", "The")).toBe(true);
  });

  it("accepts common live-STT variants for child names at the start of story karaoke", () => {
    expect(classifyKaraokeWordMatch("Isla", "Ila")).toBe("match");
    expect(classifyKaraokeWordMatch("Rayna", "Reina")).toBe("match");
    expect(classifyKaraokeWordMatch("Raina", "Reina")).toBe("match");
    expect(classifyKaraokeWordMatch("Isla", "is")).toBe("mismatch");
    expect(classifyKaraokeWordMatch("Rayna", "rain")).toBe("mismatch");
  });

  it("allows one edit on longer expected words", () => {
    expect(matchKaraokeWord("monster", "monster")).toBe(true);
    expect(matchKaraokeWord("monstor", "monster")).toBe(true);
  });

  it("treats stream prefix of longer word as partial; one-edit STT still matches", () => {
    expect(classifyKaraokeWordMatch("tw", "twelve")).toBe("partial");
    expect(matchKaraokeWord("tw", "twelve")).toBe(false);
    expect(classifyKaraokeWordMatch("happi", "happy")).toBe("match");
    expect(matchKaraokeWord("happi", "happy")).toBe(true);
    expect(matchKaraokeWord("happy", "happy")).toBe(true);
  });

  it("rejects two edits on longer words", () => {
    expect(matchKaraokeWord("kitchen", "sitting")).toBe(false);
    expect(matchKaraokeWord("running", "sitting")).toBe(false);
  });

  it("treats common letter confusions as match for dyslexia-friendly karaoke", () => {
    expect(classifyKaraokeWordMatch("man", "nan")).toBe("match");
    expect(classifyKaraokeWordMatch("bat", "dat")).toBe("match");
    expect(classifyKaraokeWordMatch("ship", "zhip")).toBe("match");
    expect(classifyKaraokeWordMatch("cat", "dog")).toBe("mismatch");
  });

  it("accepts STT homophones for pronunciation targets without broad fuzzy matching", () => {
    expect(classifyKaraokeWordMatch("where", "wear")).toBe("match");
    expect(classifyKaraokeWordMatch("wear", "where")).toBe("match");
    expect(classifyKaraokeWordMatch("when", "wear")).toBe("mismatch");
  });

  it("accepts phonetic equivalents in speech mode but not spelling mode", () => {
    expect(classifyKaraokeWordMatch("pair", "pear")).toBe("match");
    expect(classifyKaraokeWordMatch("pear", "pair")).toBe("match");
    expect(classifyKaraokeWordMatch("see", "sea")).toBe("match");
    expect(classifyKaraokeWordMatch("two", "to")).toBe("match");
    expect(
      classifyKaraokeWordMatch("pair", "pear", { mode: "spelling" }),
    ).toBe("mismatch");
    expect(
      classifyKaraokeWordMatch("see", "sea", { mode: "spelling" }),
    ).toBe("mismatch");
    expect(classifyKaraokeWordMatch("two", "to", { mode: "spelling" })).toBe(
      "mismatch",
    );
    expect(classifyKaraokeWordMatch("no", "know", { mode: "spelling" })).toBe(
      "mismatch",
    );
  });

  it("keeps pronunciation targets stricter than story karaoke", () => {
    expect(
      classifyKaraokeWordMatch("Pear", "pair", { mode: "pronunciation" }),
    ).toBe("match");
    expect(classifyKaraokeWordMatch("nearly", "neatly")).toBe("match");
    expect(
      classifyKaraokeWordMatch("nearly", "neatly", { mode: "pronunciation" }),
    ).toBe("mismatch");
    expect(
      classifyKaraokeWordMatch("whole", "whole", { mode: "pronunciation" }),
    ).toBe("match");
    expect(
      classifyKaraokeWordMatch("hole", "whole", { mode: "pronunciation" }),
    ).toBe("match");
    expect(
      classifyKaraokeWordMatch("no", "know", { mode: "pronunciation" }),
    ).toBe("match");
  });

  it("uses dictionary-grade homophone evidence for pronunciation without granting spelling credit", () => {
    const homophones: Array<[string, string]> = [
      ["right", "write"],
      ["rite", "write"],
      ["eight", "ate"],
      ["hear", "here"],
      ["flour", "flower"],
      ["night", "knight"],
      ["new", "knew"],
      ["mail", "male"],
      ["road", "rode"],
      ["week", "weak"],
    ];

    for (const [heard, target] of homophones) {
      expect(
        classifyKaraokeWordMatch(heard, target, { mode: "pronunciation" }),
      ).toBe("match");
      expect(classifyKaraokeWordMatch(heard, target, { mode: "spelling" })).toBe(
        "mismatch",
      );
    }
  });

  it("maps spoken number words to digits for match", () => {
    expect(matchKaraokeWord("fifteen", "15")).toBe(true);
    expect(matchKaraokeWord("hundred", "15")).toBe(false);
    expect(matchKaraokeWord("fifteen", "fifteen")).toBe(true);
  });
});

describe("pronunciation transcript hygiene", () => {
  it("keeps pair/pear as a clean pronunciation hit with orthographic ambiguity", () => {
    const result = buildPronunciationTranscriptWindow({
      target: "pair",
      rawTranscript: "Pear",
    });

    expect(result.contaminated).toBe(false);
    expect(result.scoringText).toBe("Pear");
    expect(result.orthographicAmbiguity).toBe(true);
  });

  it("keeps no/know as a pronunciation hit with orthographic ambiguity, not spelling proof", () => {
    const result = buildPronunciationTranscriptWindow({
      target: "know",
      rawTranscript: "no",
    });

    expect(result.contaminated).toBe(false);
    expect(result.scoringText).toBe("no");
    expect(result.orthographicAmbiguity).toBe(true);
  });

  it("keeps a clean target transcript scoreable", () => {
    const result = buildPronunciationTranscriptWindow({
      target: "government",
      rawTranscript: "government",
    });

    expect(result.contaminated).toBe(false);
    expect(result.scoringText).toBe("government");
  });

  it("allows accumulated STT only when the extra words are already-hit prefix targets", () => {
    const result = buildPronunciationTranscriptWindow({
      target: "government",
      rawTranscript: "ago government",
      acceptedPrefix: ["ago"],
    });

    expect(result.contaminated).toBe(false);
    expect(result.scoringText).toBe("ago government");
  });

  it("marks a target at the end of unrelated background speech as contaminated but still scoreable", () => {
    const result = buildPronunciationTranscriptWindow({
      target: "government",
      rawTranscript: "movie talk government",
    });

    expect(result.contaminated).toBe(true);
    expect(result.scoringText).toBe("government");
    expect(result.reasons).toContain("background_speech");
    expect(result.reasons).toContain("transcript_tail");
  });

  it("marks a target buried inside a long transcript tail as contaminated", () => {
    const result = buildPronunciationTranscriptWindow({
      target: "government",
      rawTranscript: "government movie talk unrelated",
    });

    expect(result.contaminated).toBe(true);
    expect(result.scoringText).toBe("");
    expect(result.reasons).toContain("target_not_tail");
  });

  it("marks Elli or adult chatter as contaminated even when the target appears", () => {
    const result = buildPronunciationTranscriptWindow({
      target: "government",
      rawTranscript: "Elli says government in the background",
    });

    expect(result.contaminated).toBe(true);
    expect(result.scoringText).toBe("");
    expect(result.reasons).toContain("companion_chatter");
  });

  it("treats repeated target-only speech as clean even with three or more tokens", () => {
    const result = buildPronunciationTranscriptWindow({
      target: "ahead",
      rawTranscript: "ahead ahead ahead",
    });

    expect(result.contaminated).toBe(false);
    expect(result.scoringText).toBe("ahead");
  });

  it("maps payer STT to pair as a clean pronunciation hit", () => {
    const result = buildPronunciationTranscriptWindow({
      target: "pair",
      rawTranscript: "Payer",
    });

    expect(result.contaminated).toBe(false);
    expect(result.scoringText).toBe("Payer");
    expect(
      classifyKaraokeWordMatch("Payer", "pair", { mode: "pronunciation" }),
    ).toBe("match");
  });

  it("keeps right/write as a clean pronunciation hit with orthographic ambiguity", () => {
    const result = buildPronunciationTranscriptWindow({
      target: "write",
      rawTranscript: "right",
    });

    expect(result.contaminated).toBe(false);
    expect(result.scoringText).toBe("right");
    expect(result.orthographicAmbiguity).toBe(true);
  });

  it("still scores a recoverable tail match after a misspoke prefix", () => {
    const result = buildPronunciationTranscriptWindow({
      target: "scientist",
      rawTranscript: "sentence scientist",
      acceptedPrefix: ["ago", "government", "half", "machine", "pair", "quickly"],
    });

    expect(result.contaminated).toBe(true);
    expect(result.scoringText).toBe("scientist");
    expect(result.reasons).toContain("transcript_tail");
  });

  it("does not recover when the target is buried before unrelated tail speech", () => {
    const result = buildPronunciationTranscriptWindow({
      target: "government",
      rawTranscript: "government movie talk unrelated",
    });

    expect(result.contaminated).toBe(true);
    expect(result.scoringText).toBe("");
    expect(result.reasons).toContain("target_not_tail");
  });
});
