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

// 2026-11-09 Ila, Type It Fast (Letter Rush): she asked for help on ornament and carnivore and Elli spelled them for
// her, but both right answers were saved as "help not recorded". The game names the word once (phase presentation)
// and then reports "paused"/"playing" with a blank word for the same item; Sunny kept the item only while the phase
// stayed the same, so the screen lost the word and her help had nowhere to land. The owner did not catch it; the log
// showed no [spelling-assessment] [support] line in that stop; the lab only replayed Word Radar, which keeps one phase.
it("keeps the word on screen through Letter Rush's phase changes, so her help request is recorded on it", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const { retainSpellingItemState } = await import("./currentBoardSnapshot");
  const bound = { ...assessment(), instrument: "practice" as const, nodeId: "hw:rush", itemId: "ornament-item", word: "ornament" };
  const launch = { launchId: "l1" };
  const base = { game: "Letter Rush", activityId: "letter-rush", nodeId: "hw:rush", launchToken: "t1", itemIndex: 1, totalItems: 6, mode: "type-and-spell" };
  const opened = buildCurrentBoardSnapshot({ childId: "lab", sessionId: "s1", assessment: bound, canonicalPractice: true,
    state: { ...base, phase: "presentation", currentWord: "ornament", itemId: "ornament-item", spellingItemOpened: true, practiceCapture: true, answerVisibility: "unknown" } });
  let previous = opened;
  for (const phase of ["paused", "playing"]) {
    const state = retainSpellingItemState({ ...base, phase, currentWord: "" }, previous, bound, launch);
    previous = buildCurrentBoardSnapshot({ childId: "lab", sessionId: "s1", state, assessment: bound, canonicalPractice: true });
    expect(previous.itemId).toBe("ornament-item");
    expect(previous.phase).toBe(phase);
  }
  expect(grantSpellingHelpOnRequest(bound, previous)).toBe(true);
  expect(bound.supportIds).toEqual(["support:s1:ornament-item"]);
  // The next word is a new item: its first report without an id never inherits ornament.
  const next = retainSpellingItemState({ ...base, itemIndex: 2, phase: "paused", currentWord: "" }, previous, bound, launch);
  expect(next.itemId).toBeUndefined();
});
