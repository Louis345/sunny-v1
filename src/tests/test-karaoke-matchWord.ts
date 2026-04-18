import { describe, it, expect } from "vitest";
import {
  matchKaraokeWord,
  classifyKaraokeWordMatch,
} from "../shared/karaokeMatchWord";

describe("matchKaraokeWord", () => {
  it("rejects Matt for mat (short expected word)", () => {
    expect(matchKaraokeWord("Matt", "mat")).toBe(false);
    expect(matchKaraokeWord("matt", "mat")).toBe(false);
  });

  it("accepts exact short words", () => {
    expect(matchKaraokeWord("mat", "mat")).toBe(true);
    expect(matchKaraokeWord("the", "The")).toBe(true);
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
});
