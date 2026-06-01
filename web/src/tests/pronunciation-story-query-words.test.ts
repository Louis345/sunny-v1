import { describe, expect, it } from "vitest";
import {
  parsePronunciationStoryWords,
  readPronunciationStoryWordsFromSearch,
} from "../storybook/pronunciationStoryQueryWords";

describe("parsePronunciationStoryWords", () => {
  it("accepts actual homework words from the Storybook query string and rejects placeholders", () => {
    const words = parsePronunciationStoryWords(
      "?sunnyWords=above,machine,pair,_,wait,machine",
      "sunnyWords",
    );

    expect(words).toEqual(["above", "machine", "pair", "wait"]);
  });

  it("preserves the fact that a lab supplied only invalid targets", () => {
    const result = readPronunciationStoryWordsFromSearch("?sunnyWords=_");

    expect(result.wordsProvided).toBe(true);
    expect(result.words).toEqual([]);
  });
});
