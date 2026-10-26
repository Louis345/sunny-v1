import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runSpellingDiscoveryIntake } from "./ingestHomework";
import { runAdaptiveMathGeneration } from "./runAdaptiveMathGeneration";
import { seedSpellingLab, writeSpellingPdfFixture } from "./fixtures/spellingEvidenceFirst";
import { plainDraw } from "./fixtures/successorToolConversation";
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

it("prepares every built-in the next-board menu offers, Discovery included", async () => {
  const childId = "ila", rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-next-board-menu-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context")); vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "true");
  vi.stubEnv("ANTHROPIC_API_KEY", "recorded-local-only"); vi.stubEnv("OPENAI_API_KEY", "");
  for (const name of ["SUNNY_CHART_DIR", "SUNNY_PREVIEW_MODE", "SUNNY_CERTIFICATION_RUN_ID", "SUNNY_ACTIVITY_RESULT_LOG_ROOT", "SUNNY_LOG_REPO_DIR", "SUNNY_IMAGE_CACHE_PATH"]) vi.stubEnv(name, "");
  vi.stubGlobal("fetch", () => { throw new Error("lab_external_network_forbidden"); });
  vi.spyOn(canvas, "verifyPreparingBoardCanvas").mockResolvedValue(undefined);
  const words = ["night", "light", "right", "sight", "might", "fight", "write", "knife", "wrong", "climb"];
  seedSpellingLab(rootDir, words, "", childId);
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
  await runtime.advanceCanonicalCycleFromEvidence({ childId, homeworkId, draw: plainDraw }, opts);
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
