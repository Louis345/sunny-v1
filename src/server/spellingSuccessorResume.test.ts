import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { expect, it, vi } from "vitest";
import { setupRoutes, resumeSuccessorBoards } from "./routes";
import { seedSpellingLab } from "../scripts/fixtures/spellingEvidenceFirst";
import { buildSpellingRecallItems } from "../engine/learningCycleIngest";
import { createLearningCycle, getLearningCycle, projectLearningCycle, type LearningCycleNodeContract } from "../engine/learningCycleRepository";
import { currentBoardInstance, preparingBoardInstance, publishBoardInstance } from "../engine/learningBoardInstances";

const lab = vi.hoisted(() => ({ decisions: 0, builds: 0, interruptAfterFirstBinding: true }));
vi.mock("../shared/childRegistry", async original => ({ ...await original<typeof import("../shared/childRegistry")>(), listChildProfileIds: () => ["handoff-child"] }));
vi.mock("../engine/learningCycleRuntime", async original => {
  const actual = await original<typeof import("../engine/learningCycleRuntime")>();
  return { ...actual, advanceCanonicalCycleFromEvidence: (input: any, opts: any) => actual.advanceCanonicalCycleFromEvidence({ ...input, decide: async cycle => {
    lab.decisions += 1;
    const wordIds = Object.values(cycle.nodes[0].evidenceContract.spellingItems!).map(item => item.wordId);
    return { status: "revised", reason: "Recorded support decision from the completed spelling evidence", progressionAction: "generate_support", preserve: [], change: ["guided practice"], testNext: ["later recall"], nextEvidenceRequired: ["delayed recall"], predictionEvaluationIds: cycle.predictionEvaluations.map(row => row.evaluationId), successor: { instruments: ["Sound workshop", "Later recall"].map((title, index) => ({ nodeId: `support-${index}`, title, academicTarget: "spelling.night", mechanic: "guided spelling", theme: "recorded harbor", openingPurpose: "Practice the observed spelling gap", creatorPrompt: "Recorded fixture: practice night using the saved evidence", spelling: { wordIds, measurementRole: index === 0 ? "practice" : "fresh_checkpoint", responseMode: "spelling_letters" } })) } };
  } }, opts) };
});
vi.mock("../engine/canonicalProgressionGenerator", async original => {
  const actual = await original<typeof import("../engine/canonicalProgressionGenerator")>();
  return { ...actual, prepareSuccessorBoard: async (input: any, opts: any) => {
    // Recorded Creator and verifier receipts test handoff/recovery, not content quality.
    const fixtureInput = { ...input, generateHtml: async ({ node }: { node: LearningCycleNodeContract }) => { lab.builds += 1; return `<html><body><h1>${node.title}</h1></body></html>`; }, validate: async () => ({ passed: true, failures: [] }), generateArtwork: async () => "/generated/recorded-harbor.png" };
    if (lab.interruptAfterFirstBinding) {
      lab.interruptAfterFirstBinding = false;
      const cycle = getLearningCycle(input.childId, input.homeworkId)!;
      return actual.generateCanonicalProgressionArtifact({ ...fixtureInput, nodeId: preparingBoardInstance(cycle)!.nodeIds[0] }, opts);
    }
    return actual.prepareSuccessorBoard(fixtureInput, opts);
  } };
});

it("resumes a partially prepared spelling successor after HTTP completion without another decision or rebuilding its bound node", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-handoff-"));
  const childId = "handoff-child", homeworkId = "recorded-spelling";
  let server: import("node:http").Server | undefined;
  try {
    vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
    vi.stubEnv("SUNNY_MODE", "real");
    vi.stubEnv("SUNNY_CHART_DIR", "");
    vi.stubEnv("SUNNY_CERTIFICATION_RUN_ID", "");
    vi.stubEnv("ANTHROPIC_API_KEY", ""); vi.stubEnv("OPENAI_API_KEY", "");
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (url: any, init?: any) => {
      if (!["127.0.0.1", "localhost"].includes(new URL(String(url)).hostname)) throw new Error("handoff_lab_external_network_forbidden");
      return originalFetch(url, init);
    });
    seedSpellingLab(rootDir, ["night"], "", childId);
    const item = buildSpellingRecallItems({ homeworkId, words: ["night"], evidenceIds: ["school:one"], measurementRole: "practice", exposure: "practiced" })[0]!;
    const node: LearningCycleNodeContract = {
      nodeId: "practice", role: "baseline", title: "Night practice", state: "ready",
      academicTarget: { domain: "spelling", skill: "spelling.night", targets: ["night"] },
      algorithmOwner: "retrieval-practice", theoryId: "spelling-theory", experimentId: "practice",
      mechanic: "guided spelling", theme: "harbor", openingScreen: { title: "Night practice", purpose: "Practice night" },
      generationPrompt: null, artifactBinding: { contentId: "practice", artifactId: "practice", localArtifactPath: "/games/practice.html", localArtworkPath: "/generated/practice.png", contractFingerprint: "recorded", validationStatus: "passed" },
      artwork: { status: "ready", localPath: "/generated/practice.png", prompt: null }, sfxContract: [], companionContract: { events: ["completion"] },
      evidenceContract: { academic: true, engagement: true, companionObservations: true, spellingItems: { [item.id]: item } }, evidenceIds: [],
    };
    const base = { childId, homeworkId, domain: "spelling", assignment: { title: "School spelling", contentFingerprint: "recorded", capturedEvidenceIds: ["school:one"], targets: ["night"] }, academicTheory: { theoryId: "spelling-theory", revision: 1, hypothesis: "Test the spelling gap", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null, nodes: [node], initialLifecycle: "board_ready" as const };
    const board = publishBoardInstance({ ...base, boards: [] } as never, { kind: "teaching", predecessorBoardId: null, plannerDecisionId: "original-plan", evidenceIds: ["school:one"], nodeIds: [node.nodeId], publishedAt: "2026-10-01T00:00:00Z" });
    createLearningCycle({ ...base, boards: [board] }, { rootDir });
    const app = express(); app.use(express.json()); setupRoutes(app);
    const activeServer = app.listen(0, "127.0.0.1"); server = activeServer;
    await new Promise<void>(resolve => activeServer.once("listening", resolve));
    const address = activeServer.address(); if (!address || typeof address === "string") throw new Error("handoff_address_missing");
    const post = () => fetch(`http://127.0.0.1:${address.port}/api/learning-cycle/node-complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ childId, homeworkId, nodeId: node.nodeId, result: { sessionId: "recorded-session", completed: true, accuracy: 0, timeSpent_ms: 1000, targetResults: [{ target: item.id, correct: false, attemptedValue: "nite" }] } }) });
    expect((await post()).status).toBe(200);
    await vi.waitFor(() => expect(lab.builds).toBe(1));
    await vi.waitFor(() => expect(getLearningCycle(childId, homeworkId)!.nodes.filter(row => row.nodeId !== "practice" && row.artifactBinding)).toHaveLength(1));
    const partial = getLearningCycle(childId, homeworkId)!;
    expect(partial.nodes[0]!.state).toBe("completed");
    expect(partial.observations[0]!.result.correct).toBe(false);
    expect(currentBoardInstance(partial).boardId).toBe(board.boardId);
    expect(projectLearningCycle(partial).adventureBoard.boardId).toBe(board.boardId);
    const completedEvidence = structuredClone(partial.observations);
    const bound = partial.nodes.find(row => row.nodeId !== "practice" && row.artifactBinding)!;
    // Execute the production startup recovery against the persisted synthetic cycle.
    vi.stubEnv("VITEST", ""); resumeSuccessorBoards();
    await vi.waitFor(() => expect(currentBoardInstance(getLearningCycle(childId, homeworkId)!).boardId).not.toBe(board.boardId));
    const ready = getLearningCycle(childId, homeworkId)!;
    expect(ready.boards).toHaveLength(2);
    expect(ready.observations).toEqual(completedEvidence);
    expect(ready.nodes.find(row => row.nodeId === bound.nodeId)!.artifactBinding).toEqual(bound.artifactBinding);
    expect(ready.nodes.filter(row => currentBoardInstance(ready).nodeIds.includes(row.nodeId)).every(row => row.state === "ready" && row.artifactBinding?.validationStatus === "passed")).toBe(true);
    expect(lab.decisions).toBe(1); expect(lab.builds).toBe(2);
    resumeSuccessorBoards();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(lab.decisions).toBe(1); expect(lab.builds).toBe(2);
    expect(getLearningCycle(childId, homeworkId)!.revision).toBe(ready.revision);
  } finally {
    try {
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    } finally {
      vi.unstubAllGlobals(); vi.unstubAllEnvs();
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }
}, 10000);
