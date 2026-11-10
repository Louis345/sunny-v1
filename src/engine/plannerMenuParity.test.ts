import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChildChart } from "../profiles/childChart";
import { linearJourneyFixture } from "../scripts/fixtures/authoredJourney";
import { seedSpellingLab } from "../scripts/fixtures/spellingEvidenceFirst";
import { plainDraw, successorToolReply } from "../scripts/fixtures/successorToolConversation";
import { runItemsIntake } from "../scripts/itemsIntake";
import { buildNodeLaunchAction } from "../shared/homeworkNodeRouting";
import { resolveChildContextDir } from "../utils/contextRoot";
import * as canvas from "./adventureBoardCanvas";
import { resolveAdaptiveMathDraftDir } from "./adaptiveMathDiscovery";
import { buildAssignmentPlanningPacket, spellingActivityCatalog, type AssignmentPlanningPacket, type AssignmentSourceExtraction } from "./assignmentPlanner";
import { prepareSuccessorBoard } from "./canonicalProgressionGenerator";
import { itemIntakeToolkit } from "./itemIntakeTools";
import { currentBoardInstance } from "./learningBoardInstances";
import { buildSpellingRecallItems } from "./learningCycleIngest";
import { createLearningCycle, getLearningCycle, projectLearningCycle } from "./learningCycleRepository";
import * as runtime from "./learningCycleRuntime";
import { plannerMenu, STAGE_EXCEPTIONS, stageChoices, successorMenuFacts } from "./plannerMenu";
import type { ToolLoopRequest } from "./plannerToolLoop";
import { spellingSuccessorToolkit, type SuccessorFacts } from "./spellingSuccessorTools";
import { spellingTeachingToolkit } from "./spellingTeachingTools";
import type { SpellingGameClient } from "./spellingGameBuilder";

// Law 16 (owner, 2026-11-08): a doctor gets every instrument. Every Planner stage and subject reads its
// games and tools from one menu; a stage removes a tool only through STAGE_EXCEPTIONS, with its reason.
// Before this, each stage hand-built its own menu and the next board silently lost the reward break.
vi.setConfig({ testTimeout: 60_000 });
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const catalog = spellingActivityCatalog("demo-pashley");
const menu = plannerMenu(catalog);

function teachingPacket(): AssignmentPlanningPacket {
  const text = "Spelling\nsign\nknow\nwrite";
  const extraction: AssignmentSourceExtraction = { sourceKind: "scanned_assignment_image", sourcePath: "/tmp/spelling.pdf", filename: "spelling.pdf", mediaType: "application/pdf", fileHash: "c".repeat(64), extractionMethod: "tesseract", pages: [{ pageNumber: 1, text }], fullText: text, warnings: [] };
  const chart = { childId: "demo-pashley", rootDir: process.cwd(), identity: { childId: "demo-pashley", displayName: "Demo" }, learningProfile: { childId: "demo-pashley", name: "Demo", age: 8, grade: 3, diagnoses: [], learningGoals: [], preferences: {}, strengths: [], challenges: [], notes: [], sessionHistory: [], totalSessions: 0, lastUpdated: "2026-10-24T00:00:00.000Z" },
    homework: { pending: null, selectedDomain: "spelling", lanes: {}, recent: [] }, activeSessionPlan: null, carePlan: { current: null, source: "missing" }, companion: { presetId: "elli", config: {}, displayName: "Elli" }, companionCare: { plan: {}, view: {}, filePath: "", existed: true }, artifacts: { contentCatalog: [] }, activityResults: { latest: null, recent: [] }, decisionTrace: [] } as unknown as ChildChart;
  const built = buildAssignmentPlanningPacket({ childId: "demo-pashley", extraction, childChart: chart });
  built.capturedHomework = { ...built.capturedHomework, words: ["sign", "know", "write"] };
  (built as any).discoveryEvidence = { observations: [{ observationId: "obs-1" }], summary: { constructs: [] }, history: { constructs: {} } };
  return { ...built, activityCatalog: catalog };
}

const successorFacts = (overrides: Partial<SuccessorFacts> = {}): SuccessorFacts => ({
  builtIns: [], evaluationIds: [], allowedActions: ["generate_support", "collect_more_evidence"], idPrefix: "next", rerunnable: () => true,
  // Built the way learningCycleRuntime builds them: from the one menu on the same catalog.
  ...successorMenuFacts(catalog, { grade: 3, words: [{ wordId: "w-sign", word: "sign" }] }),
  ...overrides,
});
// Math's next board (owner, 2026-11-08: one next board for both subjects), built the way learningCycleRuntime builds it.
const mathProblem = { id: "p1", prompt: "15 - 8 =", lineage: { sourceEvidenceIds: ["assignment:abc:page:1"], exposure: "unseen" as const, measurementRole: "practice" as const }, response: { mode: "numeric" as const, expected: 7 } };
const mathSuccessorFacts = (overrides: Partial<SuccessorFacts> = {}): SuccessorFacts => ({
  builtIns: [], evaluationIds: [], allowedActions: ["generate_support", "collect_more_evidence"], idPrefix: "next", rerunnable: () => false,
  ...successorMenuFacts(catalog, { grade: 3, words: [] }, "math-successor"), selfReview: true, aimedGames: true, problems: [mathProblem], answeredProblemIds: [],
  ...overrides,
});
const mathPacket = { childId: "lab-child", sourceDocument: { fileHash: "abc", pages: [{ pageNumber: 1 }] }, childChart: {}, activityCatalog: catalog } as never;
const call = (tools: any[], state: unknown, name: string, input: unknown) => {
  const tool = tools.find(row => row.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: `schema: ${parsed.error.message}` };
  return tool.run(state, parsed.data) as { ok: boolean; error?: string; result?: any };
};
const reward = { title: "Treasure Break", story: "A chest glows at the river bend.", picture: "A glowing chest by a river." };

describe("one Planner menu for every stage and subject", () => {
  it("offers the reward break on every stage: Teaching, next board and math intake", () => {
    expect(menu.rewardBreak).toBe(true);
    const stages = {
      teaching: spellingTeachingToolkit(teachingPacket()).tools,
      successor: spellingSuccessorToolkit(successorFacts()).tools,
      "math-intake": itemIntakeToolkit(mathPacket).tools,
      "math-successor": spellingSuccessorToolkit(mathSuccessorFacts()).tools,
    };
    for (const [stage, tools] of Object.entries(stages)) {
      const rewardTool = tools.find(tool => tool.name === "add_reward");
      expect(rewardTool, stage).toBeTruthy();
      // One tool: the same description shape and the same schema everywhere.
      expect(Object.keys((rewardTool!.schema as any).shape), stage).toEqual(["title", "story", "picture"]);
      expect(rewardTool!.description, stage).toMatch(/^Add a Mystery reward with no words and no measurement\. Returns its /);
    }
  });

  it("declares every per-stage removal once, with a child-safety or honest-record reason", () => {
    for (const [stage, rows] of Object.entries(STAGE_EXCEPTIONS)) for (const row of rows) {
      expect(["child-safety", "honest-record"], `${stage}:${row.remove}`).toContain(row.kind);
      expect(row.reason.length, `${stage}:${row.remove}`).toBeGreaterThan(20);
    }
    expect(STAGE_EXCEPTIONS.teaching.map(row => row.remove)).toEqual(["generated-game"]);
    expect(STAGE_EXCEPTIONS.successor).toEqual([]);
  });

  it("gives the Teaching board the whole menu minus exactly its stated exceptions", () => {
    const addActivity = spellingTeachingToolkit(teachingPacket()).tools.find(tool => tool.name === "add_activity")!;
    const offered = (addActivity.schema as any).shape.activity.options;
    const removed = STAGE_EXCEPTIONS.teaching.map(row => row.remove);
    expect(menu.choices).toEqual(expect.arrayContaining(removed));
    expect(offered).toEqual(menu.choices.filter(id => !removed.includes(id)));
    expect(offered).toEqual(stageChoices(menu, "teaching"));
  });

  it("gives the next board (support, Quest, Boss) the whole menu, with nothing removed", () => {
    for (const allowedActions of [["generate_support"], ["generate_quest", "generate_support"], ["generate_boss", "await_calibration"]]) {
      const addStep = spellingSuccessorToolkit(successorFacts({ allowedActions })).tools.find(tool => tool.name === "add_step")!;
      expect((addStep.schema as any).shape.built_in.options, allowedActions.join()).toEqual(stageChoices(menu, "successor"));
      expect(stageChoices(menu, "successor")).toEqual(menu.choices);
    }
  });

  it("gives math's next board the same tools as spelling's, minus exactly its stated exceptions", () => {
    const removed = STAGE_EXCEPTIONS["math-successor"].map(row => row.remove);
    expect(removed).toEqual(["built-in-games", "visual-explainer"]);
    // The spelling lesson page is the one tool its visual-explainer exception removes; everything else, add_reward included, is the same.
    const spellingTools = spellingSuccessorToolkit(successorFacts()).tools.map(tool => tool.name);
    const mathTools = spellingSuccessorToolkit(mathSuccessorFacts()).tools.map(tool => tool.name);
    expect(mathTools).toEqual(spellingTools.filter(name => name !== "add_explainer"));
    expect(mathTools).toContain("add_reward");
    // Its games are the whole menu minus its built-in-games exception: the game built for her problems.
    const addStep = spellingSuccessorToolkit(mathSuccessorFacts()).tools.find(tool => tool.name === "add_step")!;
    expect((addStep.schema as any).shape.built_in.options).toEqual(stageChoices(menu, "math-successor"));
    expect(stageChoices(menu, "math-successor")).toEqual(menu.choices.filter(id => id === "generated-game"));
    expect(Object.keys((addStep.schema as any).shape)).toEqual(expect.arrayContaining(["problems", "check_first", "focus"]));
  });

  it("orders a math step with her recorded problem exactly as saved; only its role is code's", () => {
    const kit = spellingSuccessorToolkit(mathSuccessorFacts({ answeredProblemIds: ["p1"] }));
    const state = kit.initialState();
    expect(call(kit.tools, state, "decide", { status: "revised", reason: "Recheck.", progression_action: "generate_support", preserve: [], change: ["Recheck p1."], test_next: [], next_evidence_required: [], prediction_evaluation_ids: [], revised_hypothesis: "",
      self_review: { what_i_tried: "First board.", what_happened: "Missed p1.", why: "Unsure.", what_i_keep: "The short game.", what_i_change_now: "Recheck p1." } }).ok).toBe(true);
    const step = call(kit.tools, state, "add_step", { built_in: "generated-game", problems: ["p1"], check_first: true, title: "Camp Check", purpose: "Check p1.", story: "s", picture: "p" });
    expect(step.result).toMatchObject({ role: "fresh_checkpoint", note: expect.stringContaining("recorded as practice") });
    expect(call(kit.tools, state, "set_order", { opening: [step.result.step_id], closing: [] }).ok).toBe(true);
    const shown = call(kit.tools, state, "finish_board", { title: "Board", endpoint_label: "Finish", single_path_reason: "One path." });
    expect(shown.result.board_as_served[0]).toMatchObject({ game: "generated-game", problems: ["p1: 15 - 8 ="], check_first: true });
    call(kit.tools, state, "finish_board", { title: "Board", endpoint_label: "Finish", single_path_reason: "One path." });
    const row = (kit.result(state).decision.nextInstruments as any[])[0];
    expect(row).toMatchObject({ mechanic: "generated-game", items: [{ ...mathProblem, lineage: { ...mathProblem.lineage, measurementRole: "fresh_checkpoint" } }] });
    expect(row.spelling).toBeUndefined();
  });

  // Owner 2026-11-09: a generated-game can start from a game she played; only a real played game, only for a built game.
  it("builds from a game she played only for a generated-game, and only from a game she really played", () => {
    for (const facts of [successorFacts({ builtIns: [{ nodeId: "act-1", title: "Radar", implementationType: "word-radar", wordIds: ["w-sign"], responseMode: "spelling_letters", checkpoint: true }], playedGames: [{ nodeId: "voice-gate", title: "Spelling Voice Gate", answers: 11, right: 5 }] }),
      mathSuccessorFacts({ playedGames: [{ nodeId: "voice-gate", title: "Spelling Voice Gate", answers: 11, right: 5 }] })]) {
      const kit = spellingSuccessorToolkit(facts);
      const state = kit.initialState();
      call(kit.tools, state, "decide", { status: "revised", reason: "Reuse.", progression_action: "generate_support", preserve: [], change: ["Reuse the gate."], test_next: [], next_evidence_required: [], prediction_evaluation_ids: [], revised_hypothesis: "" });
      const content = facts.problems ? { problems: ["p1"], check_first: false } : { words: ["w-sign"] };
      const base = { title: "Gate Again", purpose: "Practice.", story: "s", picture: "p", ...content };
      const made = call(kit.tools, state, "add_step", { ...base, built_in: "generated-game", build_from: "voice-gate" }); expect(made.error).toBeUndefined();
      expect(state.steps.at(-1)).toMatchObject({ buildFrom: "voice-gate" });
      if (!facts.problems) expect(call(kit.tools, state, "add_step", { ...base, built_in: "word-radar:hidden_word_recall", build_from: "voice-gate" })).toMatchObject({ ok: false, error: expect.stringContaining("plays as it is") });
      const addStep = kit.tools.find(tool => tool.name === "add_step")!;
      expect((addStep.schema as any).shape.build_from.unwrap().options).toEqual(["voice-gate"]);
    }
    // Without played games the field is not offered at all.
    expect(Object.keys((spellingSuccessorToolkit(successorFacts()).tools.find(tool => tool.name === "add_step")!.schema as any).shape)).not.toContain("build_from");
  });

  // 2026-11-10, both audits: Reina had answered every worksheet problem, so Quest and Boss vanished and Sunny had
  // nothing harder to give a child who loves a challenge. The Planner now writes a new problem with the arithmetic
  // that gives its answer; code computes the answer (a wrong key can never mark her wrong) and saves it as unseen.
  it("lets the math Planner write a new problem whose answer code computes, and check it as her Quest", () => {
    const kit = spellingSuccessorToolkit(mathSuccessorFacts({ answeredProblemIds: ["p1"], allowedActions: ["generate_quest", "generate_support"], writeProblems: true }));
    const state = kit.initialState();
    call(kit.tools, state, "decide", { status: "supported", reason: "She has every worksheet problem.", progression_action: "generate_quest", preserve: [], change: ["Harder."], test_next: [], next_evidence_required: [], prediction_evaluation_ids: [], revised_hypothesis: "",
      self_review: { what_i_tried: "a", what_happened: "b", why: "c", what_i_keep: "d", what_i_change_now: "e" } });
    expect(call(kit.tools, state, "add_problem", { based_on: "p1", prompt: "Feb and Mar sweaters together, minus Jan: 298, 171, 402.", answer_expression: "298 + 171 - x", why: "Push" })).toMatchObject({ ok: false });
    const written = call(kit.tools, state, "add_problem", { based_on: "p1", prompt: "Feb and Mar sweaters together, minus Jan: 298, 171, 402.", answer_expression: "298 + 171 - 402", why: "Two steps, a step past p1." });
    expect(written).toMatchObject({ ok: true, result: { problem_id: "next-problem-1", answer: 67 } });
    const step = call(kit.tools, state, "add_step", { built_in: "generated-game", problems: ["next-problem-1"], check_first: true, encounter: "quest", title: "Sweater Quest", purpose: "Check.", story: "s", picture: "p" });
    expect(step).toMatchObject({ ok: true, result: { encounter: "quest" } });
    call(kit.tools, state, "set_order", { opening: [step.result.step_id], closing: [] });
    call(kit.tools, state, "finish_board", { title: "Board", endpoint_label: "Finish", single_path_reason: "One path." });
    call(kit.tools, state, "finish_board", { title: "Board", endpoint_label: "Finish", single_path_reason: "One path." });
    const row = (kit.result(state).decision.nextInstruments as any[])[0];
    expect(row.items[0]).toMatchObject({ id: "next-problem-1", response: { mode: "numeric", expected: 67 },
      lineage: { exposure: "unseen", measurementRole: "fresh_checkpoint", sourceEvidenceIds: expect.arrayContaining(["planner-written:next-problem-1"]) } });
  });

  it("records a next-board reward break as play: no words, no spelling, mechanic mystery, shown as a reward break", () => {
    const kit = spellingSuccessorToolkit(successorFacts({ builtIns: [{ nodeId: "act-1", title: "Radar", implementationType: "word-radar", wordIds: ["w-sign"], responseMode: "spelling_letters", checkpoint: true }] }));
    const state = kit.initialState();
    expect(call(kit.tools, state, "decide", { status: "revised", reason: "Needs a break.", progression_action: "generate_support", preserve: [], change: ["Add a break."], test_next: [], next_evidence_required: [], prediction_evaluation_ids: [], revised_hypothesis: "" }).ok).toBe(true);
    const game = call(kit.tools, state, "add_step", { built_in: "word-radar:hidden_word_recall", words: ["w-sign"], title: "Sign Check", purpose: "Check sign.", story: "s", picture: "p" });
    const added = call(kit.tools, state, "add_reward", reward);
    expect(added.ok).toBe(true);
    expect(call(kit.tools, state, "set_order", { opening: [game.result.step_id, added.result.step_id], closing: [] }).ok).toBe(true);
    const shown = call(kit.tools, state, "finish_board", { title: "Board", endpoint_label: "Finish", single_path_reason: "One path." });
    expect(shown.result.board_as_served.at(-1)).toMatchObject({ step_id: added.result.step_id, game: "reward break", words: [] });
    expect(call(kit.tools, state, "finish_board", { title: "Board", endpoint_label: "Finish", single_path_reason: "One path." }).result.accepted).toBe(true);
    const row = (kit.result(state).decision.nextInstruments as any[]).at(-1);
    expect(row).toMatchObject({ nodeId: added.result.step_id, title: "Treasure Break", mechanic: "mystery", reward: true, theme: reward.story, picture: reward.picture });
    expect(row.spelling).toBeUndefined();
    // The saved decision parses with the reward kept, and needs no creator prompt.
    const saved = kit.result(state).decision as { nextInstruments: Array<{ nodeId: string }> };
    const parsed = runtime.parseCanonicalProgressionDecision({ ...saved, boardDefinition: linearJourneyFixture(saved.nextInstruments.map(row => row.nodeId)) });
    expect(parsed.successor!.instruments.at(-1)).toMatchObject({ reward: true, mechanic: "mystery" });
    expect(parsed.successor!.instruments.at(-1)!.spelling).toBeUndefined();
  });

  it("keeps older frozen next-board questions exactly as asked: no rewardBreak fact, no reward tool", () => {
    const { rewardBreak: _dropped, ...older } = successorFacts();
    expect(spellingSuccessorToolkit(older as SuccessorFacts).tools.map(tool => tool.name)).not.toContain("add_reward");
  });

  it("keeps a math reward stop in the journey where the Planner put it, with no problems and no prediction", () => {
    const kit = itemIntakeToolkit(mathPacket);
    const state = kit.initialState();
    expect(call(kit.tools, state, "record_items", { items: [{ id: "p1", problem: "15 - 8 =", page_number: 1, answer: { kind: "number", value: 7 } }], source_notes: [] }).ok).toBe(true);
    const prediction = { expected_correct_min: 0.4, expected_correct_max: 0.8, confidence: 0.5, why: "Familiar." };
    const first = call(kit.tools, state, "add_stop", { title: "Camp", story: "s", picture: "p", purpose: "check", item_ids: ["p1"], check_first: true, prediction });
    const middle = call(kit.tools, state, "add_reward", reward);
    expect(middle.ok).toBe(true);
    const last = call(kit.tools, state, "add_stop", { title: "River", story: "s", picture: "p", purpose: "practice", item_ids: ["p1"], check_first: false, prediction });
    expect([first, middle, last].map(row => row.result.stop_id)).toEqual(["stop-1", "stop-2", "stop-3"]);
    expect(call(kit.tools, state, "finish_intake", { title: "Sums", theory: "Secure." }).ok).toBe(true);
    const stops = kit.result(state).stops;
    expect(stops.map(stop => stop.reward ?? false)).toEqual([false, true, false]);
    expect(stops[1]).toMatchObject({ title: "Treasure Break", itemIds: [], prediction: null });
  });

  it("does not let a reward break stand in for a math board's only stop", () => {
    const kit = itemIntakeToolkit(mathPacket);
    const state = kit.initialState();
    call(kit.tools, state, "record_items", { items: [{ id: "p1", problem: "15 - 8 =", page_number: 1, answer: { kind: "number", value: 7 } }], source_notes: [] });
    call(kit.tools, state, "add_reward", reward);
    expect(call(kit.tools, state, "finish_intake", { title: "Sums", theory: "Secure." }).ok).toBe(false);
  });
});

describe("a reward break reaches her published board", () => {
  const childId = "tools-lab", homeworkId = "lab-assignment", words = ["write", "island"];
  const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

  function spellingFixture() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-menu-parity-")); roots.push(rootDir);
    vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
    vi.stubGlobal("fetch", () => { throw Error("lab_forbids_network"); });
    seedSpellingLab(rootDir, words, "", childId);
    const wordRadarConfig = { recallMode: "hidden_word_recall", inputMode: "keyboard" };
    const items = buildSpellingRecallItems({ homeworkId, words, evidenceIds: ["school:lab"], measurementRole: "practice", exposure: "practiced", occasionId: "radar-check" });
    const evidenceContract = { academic: true, engagement: true, companionObservations: true, spellingItems: Object.fromEntries(items.map(item => [item.id, item])), nativeConfig: { activityId: "word-radar", wordRadarConfig } };
    const configFile = path.join(resolveAdaptiveMathDraftDir(childId, homeworkId, { rootDir }), "native-instruments", "radar-check.json");
    const configuration = { version: 1, node: { id: "radar-check", type: "word-radar", activityId: "word-radar", targets: words, difficulty: 1, title: "Radar Check", wordRadarConfig }, evidenceContract };
    fs.mkdirSync(path.dirname(configFile), { recursive: true }); fs.writeFileSync(configFile, JSON.stringify(configuration));
    const localArtifactPath = `/${path.relative(resolveChildContextDir(childId, { rootDir }), configFile).split(path.sep).join("/")}`;
    createLearningCycle({ childId, homeworkId, domain: "spelling", assignment: { title: "Lab assignment", contentFingerprint: "lab", capturedEvidenceIds: ["school:lab"], targets: words }, academicTheory: { theoryId: "lab-theory", revision: 1, hypothesis: "Recall needs practice", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null, boardDefinition: linearJourneyFixture(["radar-check"]), initialLifecycle: "board_ready", nodes: [{
      nodeId: "radar-check", role: "baseline", title: "Radar Check", state: "ready", implementationType: "word-radar", academicTarget: { domain: "spelling", skill: "spelling", targets: words }, algorithmOwner: "ai_tutor", theoryId: "lab-theory", experimentId: "radar-check", mechanic: "word-radar", theme: "world", openingScreen: { title: "Radar Check", purpose: "Check" }, generationPrompt: null,
      artifactBinding: { contentId: `${homeworkId}:radar-check`, artifactId: `${homeworkId}:radar-check:native`, localArtifactPath, localArtworkPath: "/generated/world.jpeg", contractFingerprint: sha(configuration), validationStatus: "passed" },
      artwork: { status: "ready", localPath: "/generated/world.jpeg", prompt: null }, sfxContract: [], companionContract: { events: [] }, evidenceContract, evidenceIds: [],
    }] }, { rootDir });
    runtime.recordCanonicalNodeCompletion({ childId, homeworkId, nodeId: "radar-check", sessionId: "first-session", result: { completed: true, accuracy: 0, timeSpent_ms: 100, targetResults: items.map(item => ({ target: item.id, correct: false, attemptedValue: "rite" })) } }, { rootDir });
    // The recorded decision re-runs the proven radar, then gives her a reward break.
    const decision = { status: "revised", reason: "Re-check, then a break.", progressionAction: "generate_support", preserve: [], change: ["Add a break."], testNext: [], nextEvidenceRequired: ["Independent evidence"], predictionEvaluationIds: [],
      nextInstruments: [
        { nodeId: `${homeworkId}:radar-check`, title: "Radar Again", academicTarget: "Spelling", spelling: { wordIds: items.map(item => item.wordId) } },
        { nodeId: `${homeworkId}:treasure-break`, title: "Treasure Break", reward: true },
      ],
      boardDefinition: linearJourneyFixture([`${homeworkId}:radar-check`, `${homeworkId}:treasure-break`]) };
    const requests: any[] = [];
    const stream = vi.fn((payload: any) => { requests.push(structuredClone(payload)); return { finalMessage: async () => successorToolReply(decision, payload) }; });
    return { rootDir, requests, request: { childId, homeworkId, client: { messages: { stream } } as never, draw: plainDraw } };
  }

  it("flows from add_reward through the decision to a bound mystery node on a published next board, with no provider build", async () => {
    const f = spellingFixture(), opts = { rootDir: f.rootDir };
    await runtime.advanceCanonicalCycleFromEvidence(f.request, opts);
    expect(f.requests[0].tools.map((tool: any) => tool.name)).toContain("add_reward");
    vi.spyOn(canvas, "verifyPreparingBoardCanvas").mockResolvedValue(undefined);
    const generateHtml = vi.fn(async () => "<html></html>");
    const after = await prepareSuccessorBoard({ childId, homeworkId, generateHtml, generateArtwork: async () => "/generated/world.jpeg", validate: async () => ({ passed: true, failures: [] }) }, opts);
    const board = currentBoardInstance(after);
    expect(board.kind).toBe("successor");
    expect(board.publishedAt).not.toBeNull();
    const nodes = after.nodes.filter(node => board.nodeIds.includes(node.nodeId));
    const treat = nodes.find(node => node.role === "mystery")!;
    expect(treat).toMatchObject({ title: "Treasure Break", implementationType: "mystery", state: "ready", academicTarget: { targets: [] } });
    expect(treat.evidenceContract.academic).toBe(false);
    expect(treat.evidenceContract.spellingItems).toBeUndefined();
    expect(treat.evidenceContract.itemRoles).toBeUndefined();
    expect(treat.artifactBinding?.validationStatus).toBe("passed");
    expect(treat.notReadyReason).toBeUndefined();
    // Board order is the Planner's: the radar, then the break.
    expect(board.nodeIds.indexOf(treat.nodeId)).toBe(1);
    expect(generateHtml).not.toHaveBeenCalled();
    // The kiosk sees a Mystery stop it can open, and picks her reward game for it.
    const projected = projectLearningCycle(after);
    expect(projected.adventureBoard.nodes.some(node => node.id === treat.nodeId || (node as { activityNodeId?: string }).activityNodeId === treat.nodeId)).toBe(true);
    expect(projected.activeSessionPlan.nodePlan.find(node => node.id === treat.nodeId)).toMatchObject({ type: "mystery" });
    // Invariant: the stop she taps opens a real reward game page, never the native-instrument JSON bound on the node.
    const planNode = projected.activeSessionPlan.nodePlan.find(node => node.id === treat.nodeId)!;
    const action = buildNodeLaunchAction({ ...planNode, id: planNode.id, type: planNode.type, difficulty: 1 } as never, { childId, companion: "elli", isDiagMode: false });
    expect(action.kind).toBe("iframe");
    const launchPath = action.kind === "iframe" ? action.url.split("?")[0]! : "";
    expect(launchPath).toMatch(/^\/games\/[^/]+\.html$/);
    expect(fs.existsSync(path.join(process.cwd(), "web/public", launchPath))).toBe(true);
  });

  it("publishes a math board with the Planner's reward break where it placed it", async () => {
    const mathChild = "lab-child";
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-menu-parity-math-")); roots.push(rootDir);
    seedSpellingLab(rootDir, ["night"], "", mathChild);
    const sourceFile = path.join(rootDir, "even-odd.txt");
    fs.writeFileSync(sourceFile, "Even and odd sums\n1. 15 - 8 = ___\n2. 9 - 4 = ___\n");
    const prediction = { expected_correct_min: 0.4, expected_correct_max: 0.8, confidence: 0.5, why: "Familiar." };
    const requests: ToolLoopRequest[] = [];
    const send = async (request: ToolLoopRequest, turn: number) => {
      requests.push(request);
      const calls = [
        { name: "record_items", input: { items: [{ id: "p1", problem: "15 - 8 =", page_number: 1, answer: { kind: "number", value: 7 } }, { id: "p2", problem: "9 - 4 =", page_number: 1, answer: { kind: "number", value: 5 } }], source_notes: [] } },
        { name: "add_stop", input: { title: "Scout Camp", story: "A race up Lantern Mountain", picture: "Lanterns", purpose: "Check first", item_ids: ["p1"], check_first: true, prediction } },
        { name: "add_reward", input: reward },
        { name: "add_stop", input: { title: "River Run", story: "Rafting", picture: "A raft", purpose: "Practice", item_ids: ["p2"], check_first: false, prediction } },
        { name: "finish_intake", input: { title: "Subtraction", theory: "Secure." } },
      ];
      return { id: `intake-${turn}`, type: "message", role: "assistant", model: request.model, stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
        content: calls.map((row, index) => ({ type: "tool_use", id: `intake-${turn}-${index}`, ...row })) } as never;
    };
    const GOOD = `<!doctype html><html><head><title>Game</title></head><body><p id="q"></p><input id="box"><script>
const items = window.GAME_PARAMS.itemBindings; let i = 0;
const open = () => { document.getElementById("q").textContent = items[i].display; window.openItem(items[i].itemId, "Camp " + (i + 1)); };
open();
document.getElementById("box").onchange = event => { window.fireAttemptEvent({ target: items[i].itemId, attemptedValue: event.target.value });
  i += 1; if (i < items.length) open(); else { window.reportStep("done", "All answered."); window.sendNodeComplete({ completed: true }); } };
</script></body></html>`;
    const built: any[] = [];
    const gameClient: SpellingGameClient = { messages: { stream: (request: any) => { built.push(request);
      return { finalMessage: async () => ({ content: [{ type: "text", text: GOOD }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: "end_turn" }) as never }; } } } as never;
    const { homeworkId: mathHomework } = await runItemsIntake({ childId: mathChild, sourceFile, rootDir }, { send, draw: plainDraw, gameClient });
    expect(requests[0]!.tools.map(tool => tool.name)).toContain("add_reward");
    const cycle = getLearningCycle(mathChild, mathHomework, { rootDir })!;
    expect(cycle.boards![0]!.publishedAt).not.toBeNull();
    expect(cycle.nodes.map(node => node.role)).toEqual(["baseline", "mystery", "baseline"]);
    const treat = cycle.nodes[1]!;
    expect(treat).toMatchObject({ title: "Treasure Break", implementationType: "mystery", academicTarget: { targets: [] } });
    expect(treat.evidenceContract.academic).toBe(false);
    expect(treat.evidenceContract.itemContracts).toBeUndefined();
    expect(treat.artifactBinding?.validationStatus).toBe("passed");
    // No prediction for play, and no game built for it.
    expect(cycle.academicPredictions).toHaveLength(2);
    expect(built).toHaveLength(2);
    expect(currentBoardInstance(cycle).nodeIds).toEqual(cycle.nodes.map(node => node.nodeId));
  });
});
