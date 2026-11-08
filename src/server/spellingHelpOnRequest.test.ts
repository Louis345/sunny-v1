import { expect, it, vi } from "vitest";
import { grantSpellingHelpOnRequest } from "./spellingSpeechEvidence";
import { buildCurrentBoardSnapshot } from "./currentBoardSnapshot";

// Contract 54 (owner, 2026-11-07): if she asks for help on any word, the companion helps, and that word is recorded
// as helped. Ila asked three times on 11/7 and heard "this one's hidden". Elli still never volunteers help on a check.
const assessment = () => ({ audioPlaybacks: 1, instrument: "discovery" as const, nodeId: "hw:discovery", homeworkId: "hw", itemId: "i1", word: "carnivore",
  artifactHash: "h", audioDelivered: true, supportIds: [] as string[], lettersVisible: false, launchId: "l1" });
const state = { game: "word-radar", nodeId: "hw:discovery", itemId: "i1", currentWord: "carnivore", assessmentMode: true, answerVisibility: "hidden", phase: "response" };

it("records the word as helped the moment she asks, and lets Elli teach that word", () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const bound = assessment();
  const snapshot = buildCurrentBoardSnapshot({ childId: "lab", sessionId: "s1", state, assessment: bound, canonicalPractice: false });
  expect(snapshot.spellingSupportMode).toBe("stimulus_only");
  expect(grantSpellingHelpOnRequest(bound, snapshot)).toBe(true);
  expect(bound.supportIds).toEqual(["support:s1:i1"]);
  expect(snapshot.spellingSupportMode).toBe("pronunciation_model");
  // The next screen update for the same word keeps teaching open; the help stays on the record.
  const next = buildCurrentBoardSnapshot({ childId: "lab", sessionId: "s1", state, assessment: bound, canonicalPractice: false, helpGranted: true });
  expect(next.spellingSupportMode).toBe("pronunciation_model");
});

it("does nothing when the request is not about the word on screen", () => {
  const bound = assessment();
  const other = buildCurrentBoardSnapshot({ childId: "lab", sessionId: "s1", state: { ...state, itemId: "i2" }, assessment: bound, canonicalPractice: false });
  expect(grantSpellingHelpOnRequest(bound, other)).toBe(false);
  expect(bound.supportIds).toEqual([]);
  expect(grantSpellingHelpOnRequest(undefined, other)).toBe(false);
});
