import { describe, expect, it } from "vitest";
import { syllables } from "../utils/syllables";

describe("syllables: the chunks the beat lands on", () => {
  it.each([
    ["carnival", ["car", "ni", "val"]],
    ["dormant", ["dor", "mant"]],
    ["pardon", ["par", "don"]],
    ["charge", ["charge"]],
    ["monster", ["mon", "ster"]],
    ["rabbit", ["rab", "bit"]],
    ["table", ["ta", "ble"]],
    ["pocket", ["pock", "et"]],
    ["cat", ["cat"]],
  ])("%s", (word, expected) => {
    expect(syllables(word)).toEqual(expected);
  });

  it("always puts the word back together exactly", () => {
    for (const word of ["carnival", "elephant", "butterfly", "remember", "yesterday"]) expect(syllables(word).join("")).toBe(word);
  });
});
