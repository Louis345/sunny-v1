import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { getChildChart } from "../profiles/childChart";
import { runSpellingDiscoveryIntake } from "./ingestHomework";
import { runAdaptiveMathGeneration } from "./runAdaptiveMathGeneration";
import { seedSpellingLab, writeSpellingPdfFixture } from "./fixtures/spellingEvidenceFirst";
import type { RecordedToolLab } from "./fixtures/recordedToolPlanner";
import { getLearningCycle, inheritableArtworkNode } from "../engine/learningCycleRepository";
import { completeDiscoveryEvaluation } from "../engine/adaptiveMathDiscovery";
import { generateStoryImage } from "../utils/generateStoryImage";
import * as canvas from "../engine/adventureBoardCanvas";
import * as runtime from "../engine/learningCycleRuntime";

// 2026-11-01 Ila's live board: spelling stops showed built-in game icons, not the pictures the Planner
// wrote. Past the icon check, a board with a definition renders from the learning cycle, so a picture saved
// only on the presentation plan never reached her. The lab mocked the art stage, so nothing walked this path.
const lab = vi.hoisted(() => ({ planner: { root: "", childId: "", homeworkId: "", words: [], missedWords: [], requests: [], teachingBoards: 0, decisions: 0, everyBuiltIn: false } as unknown as RecordedToolLab }));
vi.mock("@anthropic-ai/sdk", async original => {
  const actual = await original<typeof import("@anthropic-ai/sdk")>();
  const { recordedToolReply } = await import("./fixtures/recordedToolPlanner");
  class RecordedAnthropic { messages = { stream: (request: any) => ({ finalMessage: async () => recordedToolReply(lab.planner, request) }), create: async (request: any) => recordedToolReply(lab.planner, request) }; }
  return { ...actual, default: RecordedAnthropic, Anthropic: RecordedAnthropic };
});
vi.mock("../utils/generateStoryImage", () => ({ generateStoryImage: vi.fn(async () => "https://recorded.invalid/stop.jpeg") }));
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it("shows her the picture the Planner wrote for each stop on the board she actually sees", async () => {
  const childId = "ila", rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-stop-pictures-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context")); vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "true");
  vi.stubEnv("ANTHROPIC_API_KEY", "recorded-local-only"); vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("GROK_API_KEY", "recorded-not-a-key");
  for (const name of ["SUNNY_CHART_DIR", "SUNNY_PREVIEW_MODE", "SUNNY_CERTIFICATION_RUN_ID", "SUNNY_ACTIVITY_RESULT_LOG_ROOT", "SUNNY_LOG_REPO_DIR", "SUNNY_IMAGE_CACHE_PATH"]) vi.stubEnv(name, "");
  vi.stubGlobal("fetch", async (url: string) => {
    if (String(url).startsWith("https://recorded.invalid/")) return new Response(new Uint8Array([1, 2, 3]));
    throw new Error("lab_external_network_forbidden");
  });
  vi.spyOn(canvas, "verifyPreparingBoardCanvas").mockResolvedValue(undefined);
  const words = ["night", "light", "right", "sight", "might", "fight", "write", "knife", "wrong", "climb"];
  seedSpellingLab(rootDir, words, "", childId);
  Object.assign(lab.planner, { root: rootDir, childId, words, missedWords: words.slice(6), requests: [], decisions: 0, teachingBoards: 0 });
  const { homeworkId } = await runSpellingDiscoveryIntake({ childId, sourceFile: writeSpellingPdfFixture(rootDir, words), rootDir });
  lab.planner.homeworkId = homeworkId;
  const discovery = getLearningCycle(childId, homeworkId, { rootDir })!.nodes.find(node => node.role === "evaluation")!;
  Object.values(discovery.evidenceContract.spellingItems!).forEach((item, index) => runtime.recordSpellingDiscoveryAttempt({ childId, homeworkId,
    attempt: { attemptId: `discovery-${index}`, itemId: item.id, attemptedValue: index >= 6 ? "zzz" : item.word, observedAt: "2026-10-25T10:00:00Z" } }, { rootDir }));
  completeDiscoveryEvaluation({ childId, homeworkId, rootDir, completedAt: "2026-10-25T10:01:00Z" });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(vi.mocked(generateStoryImage)).toHaveBeenCalled();
  const stops = getChildChart(childId, { rootDir }).activeSessionPlan!.adventureBoard!.nodes.filter(node => node.kind === "activity");
  const painted = stops.filter(node => node.thumbnailUrl?.startsWith("/generated/adventure-board/"));
  expect(painted.length).toBeGreaterThan(1);
  expect(new Set(painted.map(node => node.thumbnailUrl)).size).toBe(painted.length);
}, 60_000);

it("keeps a stop's painted picture off the next board's stops, which may still borrow a game icon", () => {
  const icon = { artwork: { localPath: "/thumbnails/activities/word-radar.svg" } };
  const painted = { artwork: { localPath: "/generated/adventure-board/ila/hw-p-act-1.jpeg" } };
  expect(inheritableArtworkNode([icon, painted])).toBe(icon);
  expect(inheritableArtworkNode([painted])).toBeUndefined();
});
