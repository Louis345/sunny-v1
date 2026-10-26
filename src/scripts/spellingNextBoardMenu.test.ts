import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runSpellingDiscoveryIntake } from "./ingestHomework";
import { runAdaptiveMathGeneration } from "./runAdaptiveMathGeneration";
import { seedSpellingLab, writeSpellingPdfFixture } from "./fixtures/spellingEvidenceFirst";
import type { RecordedToolLab } from "./fixtures/recordedToolPlanner";
import { getLearningCycle, projectLearningCycle, transitionLearningCycle } from "../engine/learningCycleRepository";
import { currentBoardInstance } from "../engine/learningBoardInstances";
import { completeDiscoveryEvaluation } from "../engine/adaptiveMathDiscovery";
import { prepareSuccessorBoard } from "../engine/canonicalProgressionGenerator";
import * as canvas from "../engine/adventureBoardCanvas";
import * as runtime from "../engine/learningCycleRuntime";

// 2026-10-25 human catch (#43): a child's next board offered a re-run of her Discovery check, and that
// stop came up Not ready. The menu's check re-pointed Discovery's setup in memory, but the re-run step
// read a saved instrument file Discovery never writes. Logs showed it only after the board published;
// the robot never chose Discovery, so no test had ever prepared every stop the menu offers.
// This guards the kitchen, not the chef: whatever the Planner picks from the menu can be prepared.
const lab = vi.hoisted(() => ({ planner: { root: "", childId: "", homeworkId: "", words: [], missedWords: [], requests: [], teachingBoards: 0, decisions: 0, everyBuiltIn: true } as RecordedToolLab }));
vi.mock("@anthropic-ai/sdk", async original => {
  const actual = await original<typeof import("@anthropic-ai/sdk")>();
  const { recordedToolReply } = await import("./fixtures/recordedToolPlanner");
  class RecordedAnthropic { messages = { stream: (request: any) => ({ finalMessage: async () => recordedToolReply(lab.planner, request) }), create: async (request: any) => recordedToolReply(lab.planner, request) }; }
  return { ...actual, default: RecordedAnthropic, Anthropic: RecordedAnthropic };
});
vi.mock("../engine/directMathExperience", async original => ({ ...await original<typeof import("../engine/directMathExperience")>(),
  generateAdaptiveProgressionActivityHtml: vi.fn(async () => { throw new Error("lab_builder_forbidden"); }),
}));
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

/** Real intake, Discovery and Teaching board at $0, then the next-board decision. */
async function playToNextBoard() {
  Object.assign(lab.planner, { requests: [], decisions: 0, teachingBoards: 0 });
  const childId = "ila", rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-next-board-menu-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context")); vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "true");
  vi.stubEnv("ANTHROPIC_API_KEY", "recorded-local-only"); vi.stubEnv("OPENAI_API_KEY", "");
  for (const name of ["SUNNY_CHART_DIR", "SUNNY_PREVIEW_MODE", "SUNNY_CERTIFICATION_RUN_ID", "SUNNY_ACTIVITY_RESULT_LOG_ROOT", "SUNNY_LOG_REPO_DIR", "SUNNY_IMAGE_CACHE_PATH"]) vi.stubEnv(name, "");
  vi.stubGlobal("fetch", () => { throw new Error("lab_external_network_forbidden"); });
  vi.spyOn(canvas, "verifyPreparingBoardCanvas").mockResolvedValue(undefined);
  const words = ["night", "light", "right", "sight", "might", "fight", "write", "knife", "wrong", "climb"];
  seedSpellingLab(rootDir, words, "", childId);
  // Who she is, in her family's words and her own: what a tutor would plan around.
  const childDir = path.join(rootDir, "src/context", childId);
  fs.writeFileSync(path.join(childDir, "soul.md"), "# Lab child\n\n## Who She Is\nA fictional third grader.\n\n## Her Brain\nIndex score 87 (clinical detail the board does not need).\n\n## Favorite Things\n- Pottery wheels and glazing mugs\n");
  fs.mkdirSync(path.join(childDir, "child_signals"), { recursive: true });
  fs.writeFileSync(path.join(childDir, "child_signals", "2026-10-24.ndjson"), `${JSON.stringify({ type: "child_signal", version: 1, childSignalId: "lab-signal", childId, activityId: "word-radar", domain: "spelling", signalType: "stated_preference", dimension: "novelty", valence: "negative", confidence: 0.9, evidenceText: "child said: this is boring, same game again", source: "child_statement", createdAt: "2026-10-24T18:00:00Z" })}\n`);
  Object.assign(lab.planner, { root: rootDir, childId, words, missedWords: words.slice(6) });
  const { homeworkId } = await runSpellingDiscoveryIntake({ childId, sourceFile: writeSpellingPdfFixture(rootDir, words), rootDir });
  lab.planner.homeworkId = homeworkId;
  const opts = { rootDir };
  // Discovery: six correct, four missed.
  const discovery = getLearningCycle(childId, homeworkId, opts)!.nodes.find(node => node.role === "evaluation")!;
  Object.values(discovery.evidenceContract.spellingItems!).forEach((item, index) => runtime.recordSpellingDiscoveryAttempt({ childId, homeworkId,
    attempt: { attemptId: `discovery-${index}`, itemId: item.id, attemptedValue: index >= 6 ? "zzz" : item.word, observedAt: "2026-10-25T10:00:00Z" } }, opts));
  completeDiscoveryEvaluation({ childId, homeworkId, rootDir, completedAt: "2026-10-25T10:01:00Z" });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  // Teaching board: take the first route and play every stop on it.
  let cycle = getLearningCycle(childId, homeworkId, opts)!;
  const teaching = currentBoardInstance(cycle);
  const choice = teaching.definition!.choices[0];
  cycle = transitionLearningCycle(childId, homeworkId, cycle.revision, { type: "journey_choice_selected", choiceId: choice.portalId, optionId: choice.options[0].id, choiceEventId: "lab-choice" } as never, opts);
  const route = new Set([...teaching.definition!.paths.find(row => row.id === teaching.definition!.rootPathId)!.portalIds, ...teaching.definition!.paths.find(row => row.id === choice.options[0].pathId)!.portalIds]
    .map(id => teaching.definition!.portals.find(portal => portal.id === id)?.activityNodeId).filter(Boolean));
  for (const node of cycle.nodes.filter(row => teaching.nodeIds.includes(row.nodeId) && route.has(row.nodeId))) {
    // A check reports each word as she answers it, then completes, as the kiosk does.
    Object.values(node.evidenceContract.spellingItems ?? {}).forEach(item => runtime.recordSpellingDiscoveryAttempt({ childId, homeworkId, sessionId: "lab-session",
      attempt: { attemptId: `${node.nodeId}:${item.id}`, itemId: item.id, attemptedValue: item.word, observedAt: "2026-10-25T10:05:00Z" } }, opts));
    runtime.recordCanonicalNodeCompletion({ childId, homeworkId, nodeId: node.nodeId, sessionId: "lab-session", result: { completed: true, accuracy: 1, timeSpent_ms: 100,
      targetResults: Object.values(node.evidenceContract.spellingItems ?? {}).map(item => ({ target: item.id, correct: true, attemptedValue: item.word })) } }, opts);
  }
  // The next board: the recorded Planner orders one step for every built-in the menu offers.
  await runtime.advanceCanonicalCycleFromEvidence({ childId, homeworkId }, opts);
  return { childId, homeworkId, opts, discovery };
}

it("prepares every built-in the next-board menu offers, Discovery included", async () => {
  const { childId, homeworkId, opts, discovery } = await playToNextBoard();
  const menu: string[] = lab.planner.requests.find(request => request.tools?.some((tool: any) => tool.name === "add_step"))!
    .tools.find((tool: any) => tool.name === "add_step").input_schema.properties.built_in.enum;
  expect(menu).toContain(discovery.nodeId);
  const after = await prepareSuccessorBoard({ childId, homeworkId }, opts);
  const board = currentBoardInstance(after);
  expect(board.publishedAt).not.toBeNull();
  const steps = after.nodes.filter(node => board.nodeIds.includes(node.nodeId));
  expect(steps.map(node => node.reusedFrom).sort()).toEqual([...menu].sort());
  expect(steps.filter(node => node.notReadyReason || node.artifactBinding?.validationStatus !== "passed").map(node => `${node.reusedFrom}: ${node.notReadyReason}`)).toEqual([]);
  // Prepared means the kiosk can launch it: unlocked, and a re-run radar keeps its recall mode.
  const plan = projectLearningCycle(after).activeSessionPlan.nodePlan.filter(row => board.nodeIds.includes(row.id));
  expect(plan.filter(row => row.locked || (row.type === "word-radar" && !row.wordRadarConfig)).map(row => row.id)).toEqual([]);
}, 120000);

// 2026-10-25 owner review: the boards felt bland because the Planner and the map artist never learned who
// she is. Her interests lived in her soul file and her own words in her signals, which only Elli read.
// Logs could not show it (nothing failed); the lab never asked what the Planner was told about her.
it("tells the Planner and the map artist who she is on every board, without her clinical detail", async () => {
  await playToNextBoard();
  const told = (request: any) => JSON.stringify(request.messages ?? []);
  const asked = (tool: string) => lab.planner.requests.filter(request => request.tools?.some((row: any) => row.name === tool));
  for (const tool of ["record_words", "add_activity", "decide", "submit_board"]) {
    expect(asked(tool).length, tool).toBeGreaterThan(0);
    for (const request of asked(tool)) {
      expect(told(request), tool).toContain("Pottery wheels and glazing mugs");
      expect(told(request), tool).toContain("this is boring, same game again");
      expect(told(request), tool).not.toContain("Index score 87");
    }
  }
}, 120000);

// 2026-10-25 owner review: the Planner's instructions were mostly "do not" lines guarding against old
// failures, and its only goal was academic. The owner's rule: one goal, the facts, and tools; a limit is
// what a strict tool accepts, never a sentence. This keeps the instructions from growing walls again.
it("gives every Planner one goal, that she wants to come back, and no do-not lines", async () => {
  await playToNextBoard();
  const prompts = ["record_words", "add_activity", "decide", "submit_board"].map(tool => {
    const request = lab.planner.requests.find(row => row.tools?.some((item: any) => item.name === tool))!;
    const first = request.messages[0].content;
    return [tool, typeof first === "string" ? first : first.filter((block: any) => block.type === "text").map((block: any) => block.text).join("\n")] as const;
  });
  for (const [tool, prompt] of prompts) {
    const instructions = prompt.split("\n").filter(line => !/^\s*[[{"]/.test(line) && line.length < 2000);
    expect(instructions.filter(line => /\b(do not|don't|never|must not)\b/i.test(line)), tool).toEqual([]);
    if (tool !== "submit_board") expect(prompt, tool).toContain("she wants to come back");
  }
}, 120000);
