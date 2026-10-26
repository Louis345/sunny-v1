import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { runSpellingDiscoveryIntake } from "../scripts/ingestHomework";
import { runAdaptiveMathGeneration } from "../scripts/runAdaptiveMathGeneration";
import { seedSpellingLab, writeSpellingPdfFixture } from "../scripts/fixtures/spellingEvidenceFirst";
import type { RecordedToolLab } from "../scripts/fixtures/recordedToolPlanner";
import { getLearningCycle, transitionLearningCycle } from "../engine/learningCycleRepository";
import { currentBoardInstance } from "../engine/learningBoardInstances";
import { completeDiscoveryEvaluation } from "../engine/adaptiveMathDiscovery";
import { prepareSuccessorBoard } from "../engine/canonicalProgressionGenerator";
import * as canvas from "../engine/adventureBoardCanvas";
import * as runtime from "../engine/learningCycleRuntime";
import { getChildChart } from "../profiles/childChart";
import { renderHarnessReport, scoreRun, wallsFromConversations, type HarnessRun } from "./plannerHarness";
import { HARNESS_CHILDREN } from "./harnessChildren";

/**
 * Runs each synthetic child through real intake, Discovery, the Teaching board and the next board, with the
 * Planner at the Anthropic boundary. By default that Planner is the recorded one ($0). With HARNESS_MODEL set
 * (and ANTHROPIC_API_KEY), each Planner and artist turn goes to that model instead, stopping at
 * HARNESS_MAX_TOKENS (default 400000) so a run cannot overspend. Never touches a real child's data.
 * Run: npm run harness  (paid: HARNESS_MODEL=claude-sonnet-5 HARNESS_MAX_TOKENS=200000 npm run harness)
 */
const lab = vi.hoisted(() => ({ planner: { root: "", childId: "", homeworkId: "", words: [], missedWords: [], requests: [], teachingBoards: 0, decisions: 0 } as RecordedToolLab, tokens: 0 }));
vi.mock("@anthropic-ai/sdk", async original => {
  const actual = await original<typeof import("@anthropic-ai/sdk")>();
  const { recordedToolReply } = await import("../scripts/fixtures/recordedToolPlanner");
  const model = process.env.HARNESS_MODEL?.trim(), cap = Number(process.env.HARNESS_MAX_TOKENS ?? 400000);
  const real = model ? new actual.default({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 }) : undefined;
  const answer = async (request: any) => {
    if (!real) return recordedToolReply(lab.planner, request);
    if (lab.tokens >= cap) throw new Error(`harness_token_cap_reached:${lab.tokens}`);
    lab.planner.requests.push(structuredClone(request));
    const message = await real.messages.stream({ ...request, model }).finalMessage();
    lab.tokens += (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0);
    return message;
  };
  class HarnessAnthropic { messages = { stream: (request: any) => ({ finalMessage: () => answer(request) }), create: (request: any) => answer(request) }; }
  return { ...actual, default: HarnessAnthropic, Anthropic: HarnessAnthropic };
});
vi.mock("../engine/directMathExperience", async original => ({ ...await original<typeof import("../engine/directMathExperience")>(),
  generateAdaptiveProgressionActivityHtml: vi.fn(async () => { throw new Error("harness_builder_forbidden"); }),
}));

const planner = process.env.HARNESS_MODEL?.trim() || "recorded";
const firstText = (request: any) => { const first = request?.messages?.[0]?.content; return typeof first === "string" ? first : (first ?? []).filter((block: any) => block.type === "text").map((block: any) => block.text).join("\n"); };

async function runChild(child: typeof HARNESS_CHILDREN[number]): Promise<HarnessRun> {
  const childId = "ila", rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `sunny-harness-${child.id}-`));
  Object.assign(lab.planner, { root: rootDir, childId, words: child.words, missedWords: child.missedWords, requests: [], decisions: 0, teachingBoards: 0 });
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context")); vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "true");
  if (planner === "recorded") vi.stubEnv("ANTHROPIC_API_KEY", "recorded-local-only");
  for (const name of ["SUNNY_CHART_DIR", "SUNNY_PREVIEW_MODE", "SUNNY_CERTIFICATION_RUN_ID", "SUNNY_ACTIVITY_RESULT_LOG_ROOT", "SUNNY_LOG_REPO_DIR", "SUNNY_IMAGE_CACHE_PATH", "GROK_API_KEY", "OPENAI_API_KEY"]) vi.stubEnv(name, "");
  const run: HarnessRun = { caseId: child.id, planner, aboutHer: null, boards: [], prompts: {}, conversations: [] };
  try {
    seedSpellingLab(rootDir, child.words, "", childId);
    const childDir = path.join(rootDir, "src/context", childId);
    if (child.soul) fs.writeFileSync(path.join(childDir, "soul.md"), child.soul);
    run.aboutHer = getChildChart(childId, { rootDir }).childVoice.aboutHer;
    const opts = { rootDir };
    const { homeworkId } = await runSpellingDiscoveryIntake({ childId, sourceFile: writeSpellingPdfFixture(rootDir, child.words), rootDir });
    lab.planner.homeworkId = homeworkId;
    const discovery = getLearningCycle(childId, homeworkId, opts)!.nodes.find(node => node.role === "evaluation")!;
    Object.values(discovery.evidenceContract.spellingItems!).forEach((item, index) => runtime.recordSpellingDiscoveryAttempt({ childId, homeworkId,
      attempt: { attemptId: `discovery-${index}`, itemId: item.id, attemptedValue: child.missedWords.includes(item.word) ? "zzz" : item.word, observedAt: "2026-10-25T10:00:00Z" } }, opts));
    completeDiscoveryEvaluation({ childId, homeworkId, rootDir, completedAt: "2026-10-25T10:01:00Z" });
    await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
    let cycle = getLearningCycle(childId, homeworkId, opts)!;
    const teaching = currentBoardInstance(cycle);
    const choice = teaching.definition!.choices[0];
    if (choice) cycle = transitionLearningCycle(childId, homeworkId, cycle.revision, { type: "journey_choice_selected", choiceId: choice.portalId, optionId: choice.options[0].id, choiceEventId: "harness-choice" } as never, opts);
    const route = new Set([...teaching.definition!.paths.find(row => row.id === teaching.definition!.rootPathId)!.portalIds, ...(choice ? teaching.definition!.paths.find(row => row.id === choice.options[0].pathId)!.portalIds : [])]
      .map(id => teaching.definition!.portals.find(portal => portal.id === id)?.activityNodeId).filter(Boolean));
    for (const node of cycle.nodes.filter(row => teaching.nodeIds.includes(row.nodeId) && route.has(row.nodeId) && !row.notReadyReason)) {
      Object.values(node.evidenceContract.spellingItems ?? {}).forEach(item => runtime.recordSpellingDiscoveryAttempt({ childId, homeworkId, sessionId: "harness-session",
        attempt: { attemptId: `${node.nodeId}:${item.id}`, itemId: item.id, attemptedValue: item.word, observedAt: "2026-10-25T10:05:00Z" } }, opts));
      runtime.recordCanonicalNodeCompletion({ childId, homeworkId, nodeId: node.nodeId, sessionId: "harness-session", result: { completed: true, accuracy: 1, timeSpent_ms: 100,
        targetResults: Object.values(node.evidenceContract.spellingItems ?? {}).map(item => ({ target: item.id, correct: true, attemptedValue: item.word })) } }, opts);
    }
    await runtime.advanceCanonicalCycleFromEvidence({ childId, homeworkId }, opts);
    cycle = await prepareSuccessorBoard({ childId, homeworkId }, opts);
    run.boards = (cycle.boards ?? []).filter(board => board.kind !== "probe").map(board => ({
      kind: board.kind, published: board.publishedAt !== null, choice: Boolean(board.definition?.choices.length),
      background: board.definition?.theme.background.value.includes("silent-letter-world") ? "world" : board.definition?.theme.background.value ?? "world",
      stops: cycle.nodes.filter(node => board.nodeIds.includes(node.nodeId)).map(node => ({ nodeId: node.nodeId, title: node.title, theme: node.theme, picture: node.artwork.prompt ?? undefined,
        type: node.implementationType, reused: Boolean(node.reusedFrom), ...(node.notReadyReason ? { notReady: node.notReadyReason } : {}) })),
    }));
  } catch (error) {
    run.error = error instanceof Error ? error.message : String(error);
  } finally {
    const requests = lab.planner.requests;
    const phase = (request: any) => { const names = (request.tools ?? []).map((tool: any) => tool.name); return names.includes("record_words") ? "intake" : names.includes("add_activity") ? "teaching" : names.includes("decide") ? "nextBoard" : names.includes("submit_board") ? "artist" : "other"; };
    for (const name of ["intake", "teaching", "nextBoard", "artist"]) { const first = requests.find(request => phase(request) === name); if (first) run.prompts[name] = firstText(first); }
    run.conversations = ["intake", "teaching", "nextBoard", "artist"].map(name => ({ phase: name, requests: requests.filter(request => phase(request) === name) }));
    vi.unstubAllEnvs();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
  return run;
}

it("runs every harness child through the real boards and writes the report", async () => {
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (url: any, init?: any) => {
    // Only a paid run may reach the model provider; nothing else leaves the machine.
    if (planner !== "recorded" && new URL(String(url)).hostname === "api.anthropic.com") return originalFetch(url, init);
    throw new Error("harness_external_network_forbidden");
  });
  vi.spyOn(canvas, "verifyPreparingBoardCanvas").mockResolvedValue(undefined);
  const runs: HarnessRun[] = [];
  for (const child of HARNESS_CHILDREN) runs.push(await runChild(child));
  const walls = wallsFromConversations(runs.flatMap(run => run.conversations));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = path.join(process.cwd(), "outputs/harness", `${stamp}-${planner}`);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify({ planner, tokens: lab.tokens, runs: runs.map(run => ({ ...run, score: scoreRun(run), conversations: undefined })), walls }, null, 2));
  fs.writeFileSync(path.join(directory, "index.html"), renderHarnessReport({ title: `Planner harness: ${planner}`, runs, walls,
    note: planner === "recorded" ? "Recorded Planner ($0): this proves the rig and the rules score, not a model's quality. Set HARNESS_MODEL to compare a real model." : `Real model ${planner}, ${lab.tokens} tokens used.` }));
  console.log(` 🎮 [harness] [report] [written] file=${path.join(directory, "index.html")} runs=${runs.length} walls=${walls.length} tokens=${lab.tokens}`);
  expect(runs.filter(run => run.error).map(run => `${run.caseId}: ${run.error}`)).toEqual([]);
}, 600000);
