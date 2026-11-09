import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { linearJourneyFixture } from "../scripts/fixtures/authoredJourney";
import { seedSpellingLab } from "../scripts/fixtures/spellingEvidenceFirst";
import { builtInWordRadar } from "../scripts/fixtures/builtInSpellingActivity";
import { ilaLikeIntrospectionCycle } from "../scripts/fixtures/ilaLikeIntrospectionCycle";
import { plainDraw, successorToolReply } from "../scripts/fixtures/successorToolConversation";
import { buildSpellingRecallItems } from "./learningCycleIngest";
import { createLearningCycle, getLearningCycle } from "./learningCycleRepository";
import { currentBoardInstance } from "./learningBoardInstances";
import { prepareSuccessorBoard } from "./canonicalProgressionGenerator";
import { parseCanonicalProgressionDecision } from "./learningCycleRuntime";
import * as runtime from "./learningCycleRuntime";
import * as canvas from "./adventureBoardCanvas";
import { plannerJournalSection, spellingTrackRecordSection, writePlannerJournalEntry } from "./plannerIntrospection";
import { spellingSuccessorToolkit, type SuccessorFacts } from "./spellingSuccessorTools";
import { recordProductIssue } from "./productIssues";

// 2026-11-08 owner (Ila's sessions): she wrote "inport" for import again and again. A picture explainer
// (board 3) and Word Radar practice (boards 3, 4) did not fix it, and the next board re-taught the same way.
// The human saw it by reading board after board; no log failed, because nothing was wrong with any one board;
// the lab never asked whether the Planner was shown its own track record. Now every next-board question
// carries her per-word record and the Planner's journal, and the Planner writes a self-review it is held to.
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const noDoNot = (text: string) => text.split("\n").filter(line => /\b(do not|don't|never|must not)\b/i.test(line));

it("lays out her track record per word: right on her own and with help, what she wrote, where she practiced it", () => {
  const section = spellingTrackRecordSection(ilaLikeIntrospectionCycle());
  expect(section.split("\n")[0]).toBe("Her track record on each word (code counted every recorded answer on this list; on her own means no help was recorded):");
  expect(section).toContain(`- import: on her own 0 of 4 right, wrote "inport" x3, "impot" x1; with help 2 of 2 right; help not recorded 0 of 1 right, wrote "inport" x1; practiced in: word-radar on boards 1, 2, 3, 4 ("Word Check", "Radar Warm-up", "Radar Run", "Radar Rematch"), visual-explainer on boards 2, 3 ("Sound Detectives", "Picture Clues"); latest on her own: "inport" (missed, board 4)`);
  expect(section).toContain(`- pardon: on her own 2 of 3 right, wrote "parden" x1;`);
  expect(section).toContain("- Right every time she answered on her own: charge (1 of 1), carnivore (1 of 1)");
  expect(noDoNot(section)).toEqual([]);
});

it("keeps the Planner's journal: what each earlier decision said it would change, what it built, and her results before and after", () => {
  const section = plannerJournalSection(ilaLikeIntrospectionCycle());
  expect(section.split("\n")[0]).toBe("Your journal: what you tried on earlier boards and what happened (your words from each decision; her answers counted by code):");
  expect(section).toContain("- Decision 1 (2026-11-03, after board 2; generate_support; theory revised)");
  expect(section).toContain(`  You said you would change: "Show the m before p in import with a picture explainer." | "Radar practice on import, dormant and pardon."`);
  expect(section).toContain(`  You said you would test next: "import on her own"`);
  expect(section).toContain(`  You built board 3: visual-explainer "Picture Clues" (import, dormant); word-radar "Radar Run" (import, pardon, dormant)`);
  expect(section).toContain(`    - import: before 0 of 1 right (wrote "inport" x1) -> after 0 of 1 right (wrote "inport" x1)`);
  expect(section).toContain(`    - dormant: before 0 of 1 right (wrote "dorment" x1) -> after 1 of 1 right`);
  expect(section).toContain("- Decision 2 (2026-11-05, after board 3; generate_support; theory revised)");
  expect(section).toContain(`    - import: before 0 of 2 right (wrote "inport" x2) -> after 0 of 2 right (wrote "impot" x1, "inport" x1)`);
  expect(noDoNot(section)).toEqual([]);
});

// The live path: her answers, the Planner's decision, the next board, her answers again, and the next question.
const childId = "introspection-lab", homeworkId = "introspection-words";
function liveFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-introspection-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  vi.stubGlobal("fetch", () => { throw Error("lab_forbids_network"); });
  vi.spyOn(canvas, "verifyPreparingBoardCanvas").mockResolvedValue(undefined);
  const words = ["import", "pardon"];
  seedSpellingLab(rootDir, words, "", childId);
  const items = buildSpellingRecallItems({ homeworkId, words, evidenceIds: ["school:lab"], measurementRole: "practice", exposure: "practiced", occasionId: "first" });
  createLearningCycle({ childId, homeworkId, domain: "spelling", assignment: { title: "Lab words", contentFingerprint: "lab", capturedEvidenceIds: ["school:lab"], targets: words },
    academicTheory: { theoryId: "lab-theory", revision: 1, hypothesis: "Practice may help", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null,
    boardDefinition: linearJourneyFixture(["radar"]), initialLifecycle: "board_ready", nodes: [{
      nodeId: "radar", role: "baseline", title: "Radar Run", state: "ready", academicTarget: { domain: "spelling", skill: "spelling", targets: words }, algorithmOwner: "ai_tutor", theoryId: "lab-theory", experimentId: "radar",
      mechanic: "word-radar", theme: "world", openingScreen: { title: "Radar Run", purpose: "Practice" }, generationPrompt: null, artwork: { status: "ready", localPath: "/generated/world.jpeg", prompt: null }, sfxContract: [], companionContract: { events: [] }, evidenceIds: [],
      ...builtInWordRadar({ rootDir, childId, homeworkId, nodeId: "radar", title: "Radar Run", items }),
    }] } as never, { rootDir });
  const opts = { rootDir };
  const play = (nodeId: string, at: string) => {
    const node = getLearningCycle(childId, homeworkId, opts)!.nodes.find(row => row.nodeId === nodeId)!;
    const own = Object.values(node.evidenceContract.spellingItems!);
    own.forEach(item => runtime.recordSpellingDiscoveryAttempt({ childId, homeworkId, support: { status: "unassisted", scaffolds: [] },
      attempt: { attemptId: `${nodeId}:${item.id}`, itemId: item.id, attemptedValue: item.word === "import" ? "inport" : item.word, observedAt: at } }, opts));
    runtime.recordCanonicalNodeCompletion({ childId, homeworkId, nodeId, sessionId: `${nodeId}-session`, result: { completed: true, accuracy: 0.5, timeSpent_ms: 100,
      targetResults: own.map(item => ({ target: item.id, correct: item.word !== "import", attemptedValue: item.word === "import" ? "inport" : item.word })) } }, opts);
  };
  const decision = { status: "revised", reason: "She writes n for m in import.", progressionAction: "generate_support", preserve: [], change: ["Show the m before p in import with a picture."], testNext: ["import on her own"],
    nextEvidenceRequired: ["Independent recall."], boardDefinition: linearJourneyFixture(["again"]),
    selfReview: { whatITried: "Radar practice on both words.", whatHappened: "import stayed inport.", why: "She hears n before p.", whatIChangeNow: "Aim at the m before p." },
    nextInstruments: [{ nodeId: "again", title: "Radar Again", academicTarget: "m before p", openingPurpose: "Practice", spelling: { builtInActivityId: "radar", wordIds: items.map(item => item.wordId) } }] };
  const requests: any[] = [];
  const request = { childId, homeworkId, client: { messages: { stream: (payload: any) => { requests.push(payload); return { finalMessage: async () => successorToolReply(decision, payload) }; } } } as never, draw: plainDraw };
  const prepare = () => prepareSuccessorBoard({ childId, homeworkId, generateHtml: async ({ node }: any) => `<html><body>${node.title}</body></html>`, generateArtwork: async () => "/generated/world.jpeg", validate: async () => ({ passed: true, failures: [] }) } as never, opts);
  return { rootDir, opts, play, request, requests, prepare };
}
const promptOf = (request: any): string => { const first = request.messages[0].content; return typeof first === "string" ? first : first.filter((block: any) => block.type === "text").map((block: any) => block.text).join("\n"); };

it("shows the next-board Planner her track record and its journal, requires its self-review, and writes the journal file", async () => {
  const f = liveFixture();
  f.play("radar", new Date(Date.now() - 3_600_000).toISOString());
  await runtime.advanceCanonicalCycleFromEvidence(f.request, f.opts);
  const first = promptOf(f.requests[0]);
  expect(first).toContain(`- import: on her own 0 of 1 right, wrote "inport" x1;`);
  expect(first).toContain(`word-radar on board 1 ("Radar Run")`);
  expect(first).toContain("Your journal: what you tried on earlier boards and what happened");
  expect(first).toContain("- No earlier decisions on this list yet.");
  const decide = f.requests[0].tools.find((tool: any) => tool.name === "decide").input_schema;
  expect(decide.required).toContain("self_review");
  expect(Object.keys(decide.properties.self_review.properties)).toEqual(["what_i_tried", "what_happened", "why", "what_i_change_now"]);
  // The self-review is stored with the decision, and readable in her folder.
  let cycle = getLearningCycle(childId, homeworkId, f.opts)!;
  expect(cycle.decisionHistory.at(-1)).toMatchObject({ selfReview: { whatITried: "Radar practice on both words.", whatIChangeNow: "Aim at the m before p." } });
  const journalFile = path.join(f.rootDir, "src/context", childId, "homework/planner-journal", `${homeworkId}.md`);
  const journal = fs.readFileSync(journalFile, "utf8");
  expect(journal).toContain(cycle.decisionHistory.at(-1)!.decisionId);
  expect(journal).toContain("What I tried: Radar practice on both words.");
  expect(journal).toContain("What I change now: Aim at the m before p.");
  expect(journal).toContain("- Show the m before p in import with a picture.");
  // She plays the board it built, and gets import wrong again.
  cycle = await f.prepare();
  const built = currentBoardInstance(cycle);
  expect(built.plannerDecisionId).toBe(cycle.decisionHistory.filter(row => row.eventType === "theory_decided").at(-1)!.decisionId);
  f.play(built.nodeIds[0], new Date().toISOString());
  const asked = f.requests.length;
  await runtime.advanceCanonicalCycleFromEvidence(f.request, f.opts);
  const second = promptOf(f.requests[asked]);
  expect(second).toContain(`- import: on her own 0 of 2 right, wrote "inport" x2;`);
  expect(second).toContain(`You said you would change: "Show the m before p in import with a picture."`);
  expect(second).toContain(`You built board 2: word-radar "Radar Again" (import, pardon)`);
  expect(second).toContain(`    - import: before 0 of 1 right (wrote "inport" x1) -> after 0 of 1 right (wrote "inport" x1)`);
  expect(second).toContain(`Your self-review then: "Aim at the m before p."`);
  expect(fs.readFileSync(journalFile, "utf8").match(/^## /gm)).toHaveLength(2);
  const instructions = second.split("\n").filter(line => !/^\s*[[{"]/.test(line) && line.length < 2000);
  expect(noDoNot(instructions.join("\n"))).toEqual([]);
}, 120000);

const facts = (overrides: Partial<SuccessorFacts> = {}): SuccessorFacts => ({
  builtIns: [{ nodeId: "act-1", title: "Radar", implementationType: "word-radar", wordIds: ["w-import"], responseMode: "spelling_letters", checkpoint: false }],
  activities: [{ id: "generated-game", checkpoint: false, setup: { type: "generated-game" } }],
  rerunnable: () => true, evaluationIds: [], allowedActions: ["generate_support"], idPrefix: "next", ...overrides,
});
const decideInput = { status: "revised", reason: "import is still inport.", progression_action: "generate_support", preserve: [], change: ["Aim a game at m before p."], test_next: [], next_evidence_required: [], prediction_evaluation_ids: [], revised_hypothesis: "" };
const review = { what_i_tried: "Radar twice.", what_happened: "inport each time.", why: "Same practice, same error.", what_i_change_now: "A game aimed at m before p." };

it("answers a new decide without a self-review with a tool error, and keeps older questions and saved decisions working", () => {
  const kit = spellingSuccessorToolkit(facts({ selfReview: true, aimedGames: true }));
  const decide = kit.tools.find(row => row.name === "decide")!;
  expect(decide.schema.safeParse(decideInput).success).toBe(false);
  const state = kit.initialState();
  const parsed = decide.schema.safeParse({ ...decideInput, self_review: review });
  expect(parsed.success).toBe(true);
  expect(decide.run(state, parsed.data)).toMatchObject({ ok: true });
  expect(state.decision?.selfReview).toEqual({ whatITried: "Radar twice.", whatHappened: "inport each time.", why: "Same practice, same error.", whatIChangeNow: "A game aimed at m before p." });
  // A question frozen before contract 56 replays its saved turns as they were.
  expect(spellingSuccessorToolkit(facts()).tools.find(row => row.name === "decide")!.schema.safeParse(decideInput).success).toBe(true);
  // A decision saved before contract 56 still parses; a new one keeps its review.
  const saved = { status: "revised", reason: "Saved earlier.", progressionAction: "await_calibration", preserve: [], change: [], testNext: [], nextEvidenceRequired: [] };
  expect(parseCanonicalProgressionDecision(saved).selfReview).toBeUndefined();
  expect(parseCanonicalProgressionDecision({ ...saved, selfReview: state.decision!.selfReview }).selfReview).toEqual(state.decision!.selfReview);
});

it("lets a generated-game step be aimed at one error, and only a generated-game step", () => {
  const kit = spellingSuccessorToolkit(facts({ selfReview: true, aimedGames: true }));
  const state = kit.initialState();
  const add = kit.tools.find(row => row.name === "add_step")!;
  const step = { built_in: "generated-game", words: ["w-import"], title: "Lip Lock", purpose: "Aim at m before p.", story: "Story", picture: "Picture", focus: "the m before p in import" };
  expect(add.run(state, add.schema.parse(step))).toMatchObject({ ok: true });
  expect(state.steps[0]).toMatchObject({ focus: "the m before p in import" });
  expect(add.run(state, add.schema.parse({ ...step, built_in: "act-1" }))).toMatchObject({ ok: false, error: expect.stringContaining("focus") });
});

it("logs a journal file it cannot write and never throws into the board flow", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-journal-blocked-")); roots.push(rootDir);
  const cycle = ilaLikeIntrospectionCycle();
  // A file where her homework folder should be: the journal cannot be written.
  fs.mkdirSync(path.join(rootDir, "src/context", cycle.childId), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "src/context", cycle.childId, "homework"), "not a folder");
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect(() => writePlannerJournalEntry(cycle, cycle.decisionHistory[0], { rootDir })).not.toThrow();
  expect(error.mock.calls.flat().join(" ")).toContain("[planner-journal] [review] [write-failed]");
});

// 2026-11-08 Reina told Matilda the Boss hints "were too long. They didn't make sense." It was saved as a product
// issue tied to the stop, yet the Planner's self-review never saw it, so nothing could change because of it.
// The human heard it; the log line [product-issue] [recorded] fired; the lab never checked who reads it back.
it("shows the next-board Planner what she said about Sunny's games, in her words, beside her track record", async () => {
  const f = liveFixture();
  recordProductIssue({ childId, activityId: "word-radar", nodeId: "radar", issueType: "flow_complaint", severity: "medium", source: "child_utterance", confidence: 0.9,
    childUtterance: "the hints were too long, they didn't make sense", evidenceText: "Hints too long.", createdAt: "2026-11-08T22:20:00Z" }, f.opts);
  recordProductIssue({ childId, activityId: "word-radar", issueType: "companion_lag", severity: "medium", source: "observed_behavior", confidence: 0.7,
    childUtterance: "session transcript contained product complaint", evidenceText: "Audit.", createdAt: "2026-11-08T22:49:00Z" }, f.opts);
  f.play("radar", new Date(Date.now() - 3_600_000).toISOString());
  await runtime.advanceCanonicalCycleFromEvidence(f.request, f.opts);
  const prompt = promptOf(f.requests[0]);
  expect(prompt).toContain("What she (or a parent) said about Sunny's games, in her own words (recorded by code, most recent last):");
  expect(prompt).toContain(`- 2026-11-08, at "Radar Run": "the hints were too long, they didn't make sense"`);
  expect(prompt).not.toContain("session transcript contained product complaint");
}, 120000);
