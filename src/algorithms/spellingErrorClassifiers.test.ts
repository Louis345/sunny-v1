import { describe, expect, it } from "vitest";
import {
  classifySpellingError,
  classifyVowelOmission,
  classifyVowelSubstitution,
  classifyConsonantDoubling,
  classifyEndingConfusion,
  classifyTransposition,
  classifyInsertion,
  classifyWholeWordVisualConfusion,
  classifyInitialConsonantBlendOmission,
} from "./spellingErrorClassifiers";

describe("spelling error classifiers", () => {
  it("detects vowel omission", () => {
    expect(classifyVowelOmission("blister", "blster")).toMatchObject({
      errorType: "spelling:vowel_omission",
      positions: [2],
    });
  });

  it("detects vowel substitution", () => {
    expect(classifyVowelSubstitution("blister", "blistor")).toMatchObject({
      errorType: "spelling:vowel_substitution",
      positions: [5],
    });
  });

  it("detects consonant doubling", () => {
    expect(classifyConsonantDoubling("blister", "blisster")).toMatchObject({
      errorType: "spelling:consonant_doubling",
      positions: [4],
    });
  });

  it("detects ending confusion", () => {
    expect(classifyEndingConfusion("blister", "blisten")).toMatchObject({
      errorType: "spelling:ending_confusion",
      positions: [5, 6],
    });
  });

  it("detects adjacent transposition", () => {
    expect(classifyTransposition("blister", "blitser")).toMatchObject({
      errorType: "spelling:transposition",
      positions: [3, 4],
    });
  });

  it("detects insertion that is not consonant doubling", () => {
    expect(classifyInsertion("blister", "bliyster")).toMatchObject({
      errorType: "spelling:insertion",
      positions: [3],
    });
  });

  it("detects whole-word visual confusion for same-shape attempts", () => {
    expect(classifyWholeWordVisualConfusion("saw", "was")).toMatchObject({
      errorType: "spelling:whole_word_visual_confusion",
      positions: [0, 1, 2],
    });
  });

  it("detects initial consonant blend omission before generic insertion/deletion", () => {
    expect(classifyInitialConsonantBlendOmission("blister", "lister")).toMatchObject({
      errorType: "spelling:initial_consonant_blend_omission",
      positions: [0],
    });
  });

  it("uses deterministic classifier priority for ambiguous attempts", () => {
    expect(classifySpellingError("blister", "lister")?.errorType).toBe(
      "spelling:initial_consonant_blend_omission",
    );
    expect(classifySpellingError("blister", "blisster")?.errorType).toBe(
      "spelling:consonant_doubling",
    );
    expect(classifySpellingError("blister", "bliyster")?.errorType).toBe(
      "spelling:insertion",
    );
  });

  it("returns null when target and attempt match or no known pattern fits", () => {
    expect(classifySpellingError("blister", "blister")).toBeNull();
    expect(classifySpellingError("blister", "zzzzzzz")).toBeNull();
  });
});
