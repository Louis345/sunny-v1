import { expect, it, vi } from "vitest";
import { buildCurrentBoardSnapshot } from "./currentBoardSnapshot";
import { createReplayWordTools } from "./companionReplayTool";
import { routeCompanionPresenceTranscript } from "./urgentLearningSupport";
import { shouldSuppressTranscriptDuringActiveLearningGame } from "./urgentLearningRuntime";

// Owner 2026-11-24 (prompt sweep): regexes decided what her words meant and acted on them: "help", "I don't know",
// "ugh", "wait" interrupted her companion, got past the name gate, turned a check into helped practice, told the
// companion "Help her with this word now" and wrote signals into her record. Her companion hears her and decides.
// Only the owner's on/off switch stays: her companion's name, and goodbye / go away / stop.
// Human-caught 11/23: the parents' talk by the kiosk was saved three times as her help signal at 0.9. With no code
// reading meaning into speech, nothing said in the room becomes a signal; her companion records what it notices.

const assessment = () => ({ audioPlaybacks: 1, instrument: "discovery" as const, nodeId: "hw:discovery", homeworkId: "hw", itemId: "i1", word: "carnivore",
  artifactHash: "h", audioDelivered: true, supportIds: [] as string[], lettersVisible: false, launchId: "l1" });
const state = { game: "word-radar", nodeId: "hw:discovery", itemId: "i1", currentWord: "carnivore", assessmentMode: true, answerVisibility: "hidden", phase: "response" };

it("her companion decides to teach a hidden word with a tool, which records the item as helped", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const bound = assessment();
  let snapshot = buildCurrentBoardSnapshot({ childId: "lab", sessionId: "s1", state, assessment: bound, canonicalPractice: false });
  const granted: string[] = [];
  const tools = createReplayWordTools({ snapshot: () => snapshot, playbackBusy: () => false, assessmentItemId: () => bound.itemId, requestNarration: () => undefined,
    grantHelp: () => { granted.push(bound.itemId); bound.supportIds.push("support:s1:i1"); snapshot = { ...snapshot!, spellingSupportMode: "pronunciation_model" }; return true; } }) as Record<string, { description?: string; execute?: (input: object, options: never) => Promise<unknown> }>;
  expect(Object.keys(tools)).toEqual(expect.arrayContaining(["replayWord", "teachWord"]));
  expect(tools.teachWord.description).toMatch(/recorded as help/i);
  const result = await tools.teachWord.execute!({}, undefined as never) as { word?: string; recordedAs?: string };
  expect(result).toEqual(expect.objectContaining({ word: "carnivore", recordedAs: "help" }));
  expect(granted).toEqual(["i1"]);
  expect(bound.supportIds).toEqual(["support:s1:i1"]);
});

it("a help phrase without her companion's name does not wake her companion; the name does", () => {
  for (const transcript of ["can you help me", "I don't get it", "I'm stuck"]) {
    expect(routeCompanionPresenceTranscript({ transcript, presence: "collapsed", companionWakeNames: ["elli"] }).action).not.toBe("summon_and_respond");
  }
  expect(routeCompanionPresenceTranscript({ transcript: "Elli can you help me", presence: "collapsed", companionWakeNames: ["elli"] }).action).toBe("summon_and_respond");
  expect(routeCompanionPresenceTranscript({ transcript: "go away", presence: "summoned", companionWakeNames: ["elli"] }).action).toBe("dismiss");
});

it("in a speaking game, her words go to her companion when she names her, not because of a keyword", () => {
  const game = { currentActivityState: { game: "pronunciation", currentWord: "above", phase: "speaking" }, currentCanvasState: { mode: "pronunciation" } } as const;
  expect(shouldSuppressTranscriptDuringActiveLearningGame({ transcript: "that's wrong", ...game })).toBe(true);
  expect(shouldSuppressTranscriptDuringActiveLearningGame({ transcript: "help", ...game })).toBe(true);
  expect(shouldSuppressTranscriptDuringActiveLearningGame({ transcript: "Elli that's wrong", ...game })).toBe(false);
});

it("no code reads meaning into her words to act on it", async () => {
  const support = await import("./urgentLearningSupport") as Record<string, unknown>;
  const runtime = await import("./urgentLearningRuntime") as Record<string, unknown>;
  for (const name of ["detectUrgentChildIntent", "classifyProductComplaintText", "auditConversationForLearningSignals"]) expect(support[name]).toBeUndefined();
  for (const name of ["detectUrgentLearningRoute", "recordUrgentLearningEvidenceForOrganicTurn", "runSessionLearningSignalAudit"]) expect(runtime[name]).toBeUndefined();
  const scorecard = await import("../engine/sessionScorecard");
  expect(String(scorecard.scorecardSection ?? "")).not.toMatch(/help asked/);
});
