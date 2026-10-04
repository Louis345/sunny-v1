import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  createLearningCycle,
  getLearningCycle,
  projectLearningCycle,
  transitionLearningCycle,
  type CreateLearningCycleInput,
  type LearningCycleNodeContract,
  type LearningCycleRecordV2,
} from "./learningCycleRepository";
import {
  advanceCanonicalCycleFromEvidence,
  parseCanonicalProgressionDecision,
  recordCanonicalNodeCompletion,
  type CanonicalProgressionDecision,
} from "./learningCycleRuntime";
import {
  currentBoardInstance,
  listBoardInstances,
  preparingBoardInstance,
  publishBoardInstance,
  assertPublishedBoardsImmutable,
  successorPreparationStatus,
  successorResumeAction,
} from "./learningBoardInstances";
import { generateCanonicalProgressionArtifact, prepareSuccessorBoard } from "./canonicalProgressionGenerator";

const CHILD = "boardkid";
const HW = "hw-successor";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-successor-boards-"));
}

function items(ids: string[], role: "fresh_checkpoint" | "practice" = "fresh_checkpoint") {
  return ids.map((id) => ({
    id,
    prompt: `Item ${id}`,
    lineage: { sourceEvidenceIds: ["pdf:1"], exposure: "unseen" as const, measurementRole: role },
    response: { mode: "numeric" as const, expected: 10 },
  }));
}

const ALL_ITEMS = [...items(["b-1", "b-2", "q-1", "q-2", "boss-1", "s-1", "s-2"]), ...items(["practice-1"], "practice")];

function baseline(nodeId: string, title: string, overrides: Partial<LearningCycleNodeContract> = {}): LearningCycleNodeContract {
  return {
    nodeId,
    role: "baseline",
    title,
    state: "ready",
    academicTarget: { domain: "math", skill: "multiplication", targets: [nodeId] },
    algorithmOwner: "retrieval-practice",
    theoryId: "theory-1",
    experimentId: `experiment-${nodeId}`,
    mechanic: nodeId,
    theme: "math adventure",
    openingScreen: { title, purpose: `Practice ${nodeId}` },
    generationPrompt: null,
    artifactBinding: {
      contentId: `content-${nodeId}`,
      artifactId: `artifact-${nodeId}`,
      localArtifactPath: `/games/${nodeId}.html`,
      localArtworkPath: `/generated/${nodeId}.png`,
      contractFingerprint: `contract-${nodeId}`,
      validationStatus: "passed",
    },
    artwork: { status: "ready", localPath: `/generated/${nodeId}.png`, prompt: null },
    sfxContract: [],
    companionContract: { events: ["session_complete"] },
    evidenceContract: {
      academic: true, engagement: true, companionObservations: true,
      itemContracts: Object.fromEntries(ALL_ITEMS.map((item) => [item.id, item])),
    },
    evidenceIds: [],
    ...overrides,
  };
}

function cycleInput(): CreateLearningCycleInput {
  const nodes = [baseline("facts", "Fact Blaster"), baseline("story", "Story Solver")];
  const base: CreateLearningCycleInput = {
    childId: CHILD,
    homeworkId: HW,
    domain: "math",
    assignment: { title: "Multiplication", contentFingerprint: "fp", capturedEvidenceIds: ["pdf:1"], targets: ["facts", "story"] },
    academicTheory: { theoryId: "theory-1", revision: 1, hypothesis: "Measure recall then transfer", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] },
    engagementTheory: null,
    nodes,
    initialLifecycle: "board_ready",
  };
  const board = publishBoardInstance({ ...base, boards: [] } as unknown as LearningCycleRecordV2, {
    kind: "teaching",
    predecessorBoardId: null,
    plannerDecisionId: `${HW}:decision:r0`,
    evidenceIds: ["pdf:1"],
    nodeIds: nodes.map((node) => node.nodeId),
    publishedAt: "2026-10-01T00:00:00.000Z",
  });
  return { ...base, boards: [board] };
}

function complete(rootDir: string, nodeId: string, sessionId: string, target: string, correct = true, extra: Record<string, unknown> = {}) {
  return recordCanonicalNodeCompletion({
    childId: CHILD, homeworkId: HW, sessionId, nodeId,
    result: { completed: true, accuracy: correct ? 1 : 0, timeSpent_ms: 1000, targetResults: [{ target, correct, attemptedValue: correct ? "10" : "3" }], ...extra },
  }, { rootDir });
}

function instrument(nodeId: string, title: string, itemIds: string[], encounter?: "quest" | "boss") {
  return {
    nodeId, title, academicTarget: "multiplication transfer", mechanic: `${nodeId}-mechanic`, theme: "harbor",
    openingPurpose: `Play ${title}`, creatorPrompt: `Build ${title}`,
    items: items(itemIds),
    ...(encounter ? { encounter } : {}),
  };
}

function decision(action: CanonicalProgressionDecision["progressionAction"], successor?: CanonicalProgressionDecision["successor"]): CanonicalProgressionDecision {
  return {
    status: "supported",
    reason: `Planner chose ${action}.`,
    progressionAction: action,
    preserve: [], change: [], testNext: [], nextEvidenceRequired: [],
    ...(successor ? { successor } : {}),
  };
}

const supportSuccessor = {
  instruments: [
    instrument("warmup", "Tide Warmup", ["s-1"]),
    instrument("route-dock", "Dock Route", ["s-2"]),
    instrument("route-reef", "Reef Route", ["s-2"]),
    instrument("check", "Lighthouse Check", ["b-2"]),
  ],
  routeChoice: {
    sharedNodeIds: ["warmup"],
    routes: [
      { routeId: "dock", nodeIds: ["route-dock", "check"] },
      { routeId: "reef", nodeIds: ["route-reef", "check"] },
    ],
  },
};

const questSuccessor = {
  instruments: [
    instrument("warmup", "Harbor Warmup", ["s-1"]),
    instrument("lantern", "Lantern Rescue", ["q-1", "b-1"], "quest"),
  ],
};

const bossSuccessor = { instruments: [instrument("echo", "The Echo Keeper", ["boss-1"], "boss")] };

function bindAll(rootDir: string): LearningCycleRecordV2 {
  let cycle = getLearningCycle(CHILD, HW, { rootDir })!;
  const preparing = preparingBoardInstance(cycle)!;
  for (const nodeId of preparing.nodeIds) {
    cycle = transitionLearningCycle(CHILD, HW, cycle.revision, {
      type: "artifact_bound",
      nodeId,
      artifact: { contentId: nodeId, artifactId: nodeId, localArtifactPath: `/games/${encodeURIComponent(nodeId)}.html`, localArtworkPath: "/generated/a.png", contractFingerprint: nodeId, validationStatus: "passed" },
    }, { rootDir });
  }
  return cycle;
}

async function finishBaselineBoard(rootDir: string, correct = true) {
  createLearningCycle(cycleInput(), { rootDir });
  complete(rootDir, "facts", "s1", correct ? "b-1" : "practice-1", correct);
  return complete(rootDir, "story", "s1", correct ? "b-2" : "practice-1", correct)!;
}

function nodesOfBoard(cycle: LearningCycleRecordV2, boardId: string) {
  const ids = new Set(listBoardInstances(cycle).find((board) => board.boardId === boardId)!.nodeIds);
  return cycle.nodes.filter((node) => ids.has(node.nodeId));
}

describe("successor boards (contract 21)", () => {
  it("test 2: completion leads to exactly one decision and one complete successor board; the predecessor is untouched", async () => {
    const rootDir = root();
    const evaluated = await finishBaselineBoard(rootDir);
    expect(evaluated.lifecycle).toBe("baseline_evaluating");
    const predecessor = currentBoardInstance(evaluated);
    const before = structuredClone(nodesOfBoard(evaluated, predecessor.boardId));

    const decide = vi.fn(async () => decision("generate_support", supportSuccessor));
    const decided = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide }, { rootDir });
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide }, { rootDir });

    expect(decide).toHaveBeenCalledTimes(1);
    const after = getLearningCycle(CHILD, HW, { rootDir })!;
    expect(after.decisionHistory.filter((entry) => entry.eventType === "theory_decided")).toHaveLength(1);
    const boards = listBoardInstances(after);
    expect(boards).toHaveLength(2);
    const successor = boards[1]!;
    expect(successor).toMatchObject({
      kind: "successor",
      predecessorBoardId: predecessor.boardId,
      plannerDecisionId: [...decided.decisionHistory].reverse().find((entry) => entry.eventType === "theory_decided")!.decisionId,
      publishedAt: null,
    });
    expect(successor.nodeIds).toHaveLength(4);
    expect(new Set(successor.nodeIds).size).toBe(4);
    expect(nodesOfBoard(after, predecessor.boardId).map(({ state, nodeId, title, mechanic }) => ({ state, nodeId, title, mechanic })))
      .toEqual(before.map(({ state, nodeId, title, mechanic }) => ({ state, nodeId, title, mechanic })));
  });

  it("does not show an unpublished successor; the child keeps the completed predecessor until every node is verified", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    const decided = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir });
    const predecessor = currentBoardInstance(decided);
    expect(projectLearningCycle(decided).adventureBoard.boardId).toBe(predecessor.boardId);
    expect(projectLearningCycle(decided).activeSessionPlan.nodePlan.map((node) => node.id)).toEqual(["facts", "story"]);

    const preparing = preparingBoardInstance(decided)!;
    const partial = transitionLearningCycle(CHILD, HW, decided.revision, {
      type: "artifact_bound", nodeId: preparing.nodeIds[0]!,
      artifact: { contentId: "x", artifactId: "x", localArtifactPath: "/games/x.html", localArtworkPath: "/generated/x.png", contractFingerprint: "x", validationStatus: "passed" },
    }, { rootDir });
    expect(preparingBoardInstance(partial)?.boardId).toBe(preparing.boardId);
    expect(projectLearningCycle(partial).adventureBoard.boardId).toBe(predecessor.boardId);

    const published = bindAll(rootDir);
    expect(preparingBoardInstance(published)).toBeUndefined();
    expect(currentBoardInstance(published).boardId).toBe(preparing.boardId);
    expect(currentBoardInstance(published).publishedAt).toEqual(expect.any(String));
    expect(published.lifecycle).toBe("baseline_ready");
    expect(projectLearningCycle(published).adventureBoard.boardId).toBe(preparing.boardId);
  });

  it("test 4: a support successor keeps a real, reconverging route choice with no Quest or Boss", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir });
    const published = bindAll(rootDir);
    const board = currentBoardInstance(published);
    expect(board.agencyExperiment?.routes).toHaveLength(2);
    const [first, second] = board.agencyExperiment!.routes;
    expect(first!.nodeIds.at(-1)).toBe(second!.nodeIds.at(-1));
    expect(first!.nodeIds[0]).not.toBe(second!.nodeIds[0]);
    expect(published.agencyExperiment).toEqual(board.agencyExperiment);
    expect(nodesOfBoard(published, board.boardId).some((node) => node.role === "quest" || node.role === "boss")).toBe(false);
    const projected = projectLearningCycle(published);
    expect(projected.adventureBoard.nodes.some((node) => node.kind === "quest" || node.kind === "boss")).toBe(false);
    expect(projected.adventureBoard.nodes.some((node) => node.kind === "choice-gate")).toBe(true);
  });

  it("test 5: unauthorized Quest and Boss are absent, including legacy pre-allocated placeholders", () => {
    const rootDir = root();
    const legacyQuest: LearningCycleNodeContract = { ...baseline("quest", "Quest"), role: "quest", state: "locked", artifactBinding: null };
    const legacyBoss: LearningCycleNodeContract = { ...baseline("boss", "Boss"), role: "boss", state: "locked", artifactBinding: null };
    const { boards: _boards, ...legacyInput } = cycleInput();
    const cycle = createLearningCycle({ ...legacyInput, nodes: [...legacyInput.nodes, legacyQuest, legacyBoss] }, { rootDir });
    const projected = projectLearningCycle(cycle);
    expect(projected.adventureBoard.nodes.some((node) => node.kind === "quest" || node.kind === "boss")).toBe(false);
    expect(projected.adventureBoard.nodes.some((node) => /quest|boss/i.test(node.lock?.label ?? ""))).toBe(false);
    expect(projected.adventureBoard.edges.some((edge) => ["quest", "boss"].includes(edge.to))).toBe(false);
    expect(projected.activeSessionPlan.nodePlan.some((node) => node.type === "quest" || node.type === "boss")).toBe(false);
  });

  it("test 6: an authorized Quest is present and playable from the successor's first render", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    const decided = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_quest", questSuccessor) }, { rootDir });
    expect(decided.lifecycle).toBe("quest_generating");
    const published = bindAll(rootDir);
    expect(published.lifecycle).toBe("quest_ready");
    const quest = nodesOfBoard(published, currentBoardInstance(published).boardId).find((node) => node.role === "quest")!;
    expect(quest).toMatchObject({ title: "Lantern Rescue", state: "ready" });
    const projected = projectLearningCycle(published);
    const questNode = projected.adventureBoard.nodes.find((node) => node.id === quest.nodeId)!;
    expect(questNode.kind).toBe("quest");
    expect(["available", "current"]).toContain(questNode.state);
    expect(questNode.lock).toBeUndefined();
    expect(questNode.action?.type).toBe("launch-activity");
  });

  it("closes a Quest board's evidence batch only when the Quest itself completes", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_quest", questSuccessor) }, { rootDir });
    const published = bindAll(rootDir);
    const nodes = nodesOfBoard(published, currentBoardInstance(published).boardId);
    const warmup = complete(rootDir, nodes.find((node) => node.role === "baseline")!.nodeId, "s2", "s-1")!;
    expect(warmup.lifecycle).toBe("quest_ready");
    const quest = complete(rootDir, nodes.find((node) => node.role === "quest")!.nodeId, "s2", "q-1")!;
    expect(quest.lifecycle).toBe("quest_evaluating");
  });

  it("test 7: Quest cannot be authorized without valid transfer eligibility", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir, false);
    await expect(advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_quest", questSuccessor) }, { rootDir }))
      .rejects.toThrow("canonical_progression_quest_requires_eligible_baseline_evidence");
    expect(listBoardInstances(getLearningCycle(CHILD, HW, { rootDir })!)).toHaveLength(1);
  });

  it("rejects an encounter smuggled into a support or Quest decision", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    await expect(advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", questSuccessor) }, { rootDir }))
      .rejects.toThrow("canonical_progression_encounter_not_authorized");
    await expect(advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_quest", { instruments: [...questSuccessor.instruments, ...bossSuccessor.instruments] }) }, { rootDir }))
      .rejects.toThrow("canonical_progression_encounter_not_authorized");
    await expect(advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_quest", supportSuccessor) }, { rootDir }))
      .rejects.toThrow("canonical_progression_encounter_missing");
  });

  it("test 8: Boss requires valid unseen, unassisted Quest evidence", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_quest", questSuccessor) }, { rootDir });
    const published = bindAll(rootDir);
    const quest = nodesOfBoard(published, currentBoardInstance(published).boardId).find((node) => node.role === "quest")!;
    // Repeating an already-exposed item downgrades the Quest attempt to practice.
    complete(rootDir, quest.nodeId, "s2", "b-1");
    await expect(advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_boss", bossSuccessor) }, { rootDir }))
      .rejects.toThrow("canonical_progression_boss_requires_unseen_quest_evidence");
    const rejected = getLearningCycle(CHILD, HW, { rootDir })!;
    expect(listBoardInstances(rejected)).toHaveLength(2);
    expect(rejected.nodes.some((node) => node.role === "boss")).toBe(false);
  });

  it("test 8b: a Boss successor appears complete after valid Quest evidence and ends awaiting calibration", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_quest", questSuccessor) }, { rootDir });
    let cycle = bindAll(rootDir);
    const quest = nodesOfBoard(cycle, currentBoardInstance(cycle).boardId).find((node) => node.role === "quest")!;
    complete(rootDir, quest.nodeId, "s2", "q-1");
    cycle = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_boss", bossSuccessor) }, { rootDir });
    expect(cycle.lifecycle).toBe("boss_generating");
    cycle = bindAll(rootDir);
    expect(cycle.lifecycle).toBe("boss_ready");
    const boss = nodesOfBoard(cycle, currentBoardInstance(cycle).boardId).find((node) => node.role === "boss")!;
    expect(projectLearningCycle(cycle).adventureBoard.nodes.find((node) => node.id === boss.nodeId)?.kind).toBe("boss");
    complete(rootDir, boss.nodeId, "s3", "boss-1");
    const awaiting = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => ({ ...decision("await_calibration"), status: "awaiting_calibration" }) }, { rootDir });
    expect(awaiting.lifecycle).toBe("awaiting_calibration");
    expect(listBoardInstances(awaiting)).toHaveLength(3);
    expect(preparingBoardInstance(awaiting)).toBeUndefined();
  });

  it("test 9: engagement, replays and rewards alone cannot authorize Quest", async () => {
    const rootDir = root();
    createLearningCycle(cycleInput(), { rootDir });
    complete(rootDir, "facts", "s1", "practice-1", true, { frustrationSignals: [], companionInteractions: [] });
    complete(rootDir, "facts", "s1-replay", "practice-1", true);
    complete(rootDir, "facts", "s1-replay-2", "practice-1", true);
    complete(rootDir, "story", "s1", "practice-1", true);
    await expect(advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_quest", questSuccessor) }, { rootDir }))
      .rejects.toThrow("canonical_progression_quest_requires_eligible_baseline_evidence");
  });

  it("test 10 / test 3: a restart from the same frozen snapshot replays the checkpointed decision with no new provider call", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    fs.writeFileSync(path.join(rootDir, `src/context/${CHILD}/learning_profile.json`), JSON.stringify({
      childId: CHILD, name: "Board Kid", interests: [], goals: [], moodHistory: [],
      demographics: { age: 8, grade: "3", dyslexia: false, adhd: false, languages: ["en"] },
      sessionStats: { totalSessions: 0, totalWordsMastered: 0, currentStreak: 0 },
    }));
    const file = path.join(rootDir, `src/context/${CHILD}/homework/cycles/${HW}.json`);
    const snapshot = fs.readFileSync(file, "utf8");
    const toolInput = {
      status: "supported", reason: "Independent checkpoint was correct; test transfer.", progressionAction: "generate_quest",
      preserve: [], change: [], testNext: ["transfer"], nextEvidenceRequired: ["Quest"], predictionEvaluationIds: [],
      nextInstruments: questSuccessor.instruments,
    };
    const create = vi.fn(async () => ({ content: [{ type: "tool_use", name: "decide_learning_cycle_progression", input: toolInput }] }));
    const first = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { create } } as never }, { rootDir });
    const firstBoard = preparingBoardInstance(first)!;

    // Crash after the provider replied but before the cycle commit survived.
    fs.writeFileSync(file, snapshot);
    const unavailable = vi.fn(async () => { throw new Error("provider must not be called on restart"); });
    const replayed = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { create: unavailable } } as never }, { rootDir });

    expect(create).toHaveBeenCalledTimes(1);
    expect(unavailable).not.toHaveBeenCalled();
    const replayedBoard = preparingBoardInstance(replayed)!;
    expect(replayedBoard.topologyHash).toBe(firstBoard.topologyHash);
    expect(replayed.nodes.filter((node) => node.role === "quest")).toHaveLength(1);
  });

  it("test 3: restarting successor preparation reuses bound artifacts and never duplicates nodes or boards", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir });
    const generateHtml = vi.fn(async ({ node }: { node: LearningCycleNodeContract }) => `<!doctype html><html><body><h1>${node.title}</h1></body></html>`);
    const validate = vi.fn(async () => ({ passed: true, failures: [] }));
    // The process ends after the first node is bound; a restart must reuse it.
    const firstNodeId = preparingBoardInstance(getLearningCycle(CHILD, HW, { rootDir })!)!.nodeIds[0]!;
    await generateCanonicalProgressionArtifact({ childId: CHILD, homeworkId: HW, nodeId: firstNodeId, generateHtml, validate, generateArtwork: async () => "/generated/a.png" }, { rootDir });
    const resumed = await prepareSuccessorBoard({ childId: CHILD, homeworkId: HW, generateHtml, validate, generateArtwork: async () => "/generated/a.png" }, { rootDir });
    const again = await prepareSuccessorBoard({ childId: CHILD, homeworkId: HW, generateHtml, validate, generateArtwork: async () => "/generated/a.png" }, { rootDir });
    expect(generateHtml).toHaveBeenCalledTimes(4);
    expect(again.revision).toBe(resumed.revision);
    expect(listBoardInstances(resumed)).toHaveLength(2);
    expect(currentBoardInstance(resumed).kind).toBe("successor");
    expect(resumed.nodes).toHaveLength(6);
  });

  it("serializes overlapping successor workers before either can buy the same node", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir });
    let releaseFirst!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const blocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const generateHtml = vi.fn(async ({ node }: { node: LearningCycleNodeContract }) => {
      if (generateHtml.mock.calls.length === 1) {
        markStarted();
        await blocked;
      }
      return `<!doctype html><html><body><h1>${node.title}</h1></body></html>`;
    });
    const input = {
      childId: CHILD,
      homeworkId: HW,
      generateHtml,
      validate: async () => ({ passed: true, failures: [] }),
      generateArtwork: async () => "/generated/a.png",
    };
    const first = prepareSuccessorBoard(input, { rootDir }).catch((error: unknown) => error);
    await started;
    const beforeOverlap = getLearningCycle(CHILD, HW, { rootDir })!;
    const overlap = await prepareSuccessorBoard(input, { rootDir });
    const callsBeforeRelease = generateHtml.mock.calls.length;
    releaseFirst();
    const result = await first;
    expect(overlap.revision).toBe(beforeOverlap.revision);
    expect(callsBeforeRelease).toBe(1);
    expect(result).not.toBeInstanceOf(Error);
    expect(currentBoardInstance(result as LearningCycleRecordV2).kind).toBe("successor");
    expect(generateHtml).toHaveBeenCalledTimes(supportSuccessor.instruments.length);
  });

  it("test 11: the successor cites valid evidence and the Planner's prediction evaluations", async () => {
    const rootDir = root();
    const input = cycleInput();
    input.academicPredictions = [{
      predictionId: "pred-1", theoryId: "theory-1", constructId: "math.multiplication", context: "baseline", horizon: "now",
      eligibility: { sources: ["independent_probe"], maxDelayDays: 7 },
      expectedMetric: { key: "accuracy", min: 0.5, max: 1 }, predictedErrorPatterns: [], confidence: 0.6,
      evidenceIds: ["pdf:1"], intervention: "baseline", evidenceLimit: "independent_performance", createdAt: "2026-09-30T00:00:00.000Z",
    }];
    createLearningCycle(input, { rootDir, now: new Date("2026-10-01T00:00:00.000Z") });
    complete(rootDir, "facts", "s1", "b-1");
    const evaluated = complete(rootDir, "story", "s1", "b-2")!;
    expect(evaluated.lifecycle).toBe("baseline_evaluating");
    await expect(advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir, now: new Date("2026-10-01T01:00:00.000Z") }))
      .rejects.toThrow("canonical_progression_prediction_evaluation_citation_required");
    const withEvaluations = getLearningCycle(CHILD, HW, { rootDir })!;
    const evaluationIds = withEvaluations.predictionEvaluations.map((entry) => entry.evaluationId);
    expect(evaluationIds.length).toBeGreaterThan(0);
    const decided = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => ({ ...decision("generate_support", supportSuccessor), predictionEvaluationIds: evaluationIds }) }, { rootDir, now: new Date("2026-10-01T01:00:00.000Z") });
    const successor = preparingBoardInstance(decided)!;
    const valid = new Set([...decided.observations.map((row) => row.observationId), ...decided.predictionEvaluations.map((row) => row.evaluationId), ...decided.evidence.academic.map((row) => row.evidenceId), ...decided.evidence.engagement.map((row) => row.evidenceId)]);
    expect(successor.evidenceIds.length).toBeGreaterThan(0);
    expect(successor.evidenceIds.every((id) => valid.has(id))).toBe(true);
    expect(successor.evidenceIds).toEqual(expect.arrayContaining(evaluationIds));
    const record = decided.decisionHistory.find((entry) => entry.decisionId === successor.plannerDecisionId)!;
    expect(record.predictionEvaluationIds).toEqual(evaluationIds);
  });

  it("makes the predecessor read-only history once its successor is published, while allowing replay before then", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir });
    const replay = complete(rootDir, "facts", "replay-before", "b-1")!;
    expect(replay.observations.at(-1)?.provenance).toBe("practice");
    bindAll(rootDir);
    expect(() => complete(rootDir, "facts", "replay-after", "b-1")).toThrow("learning_board_read_only:facts");
  });

  it("continues a legacy cycle without touching its placeholders and publishes a real successor", async () => {
    const rootDir = root();
    const legacyQuest: LearningCycleNodeContract = { ...baseline("quest", "Quest"), role: "quest", state: "locked", artifactBinding: null };
    const { boards: _boards, ...legacyInput } = cycleInput();
    createLearningCycle({ ...legacyInput, nodes: [...legacyInput.nodes, legacyQuest] }, { rootDir });
    complete(rootDir, "facts", "s1", "b-1");
    complete(rootDir, "story", "s1", "b-2");
    const decided = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_quest", questSuccessor) }, { rootDir });
    const boards = listBoardInstances(decided);
    expect(boards.map((board) => board.kind)).toEqual(["legacy", "successor"]);
    expect(boards[0]!.boardId).toBe(`cycle-board:${HW}`);
    expect(decided.nodes.find((node) => node.nodeId === "quest")).toMatchObject({ state: "locked", title: "Quest", generationPrompt: null });
    expect(decided.nodes.filter((node) => node.role === "quest")).toHaveLength(2);
  });

  it("presents unchosen routes as not taken instead of relocking them", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir });
    let cycle = bindAll(rootDir);
    const board = currentBoardInstance(cycle);
    const experiment = board.agencyExperiment!;
    complete(rootDir, experiment.sharedNodeIds[0]!, "s2", "s-1");
    cycle = getLearningCycle(CHILD, HW, { rootDir })!;
    cycle = transitionLearningCycle(CHILD, HW, cycle.revision, { type: "route_selected", experimentId: experiment.experimentId, routeId: experiment.routes[0]!.routeId, choiceEventId: "choice-1" }, { rootDir });
    for (const nodeId of experiment.routes[0]!.nodeIds) complete(rootDir, nodeId, "s2", nodeId.endsWith("check") ? "b-2" : "s-2");
    cycle = getLearningCycle(CHILD, HW, { rootDir })!;
    expect(cycle.lifecycle).toBe("baseline_evaluating");
    const untaken = experiment.routes[1]!.nodeIds[0]!;
    expect(projectLearningCycle(cycle).adventureBoard.nodes.find((node) => node.id === untaken)?.lock).toMatchObject({ reason: "route-not-taken", label: "Not taken" });
  });
});

describe("successor preparation status (no in-session swap)", () => {
  it("reports preparation and publication with one stable updatedAt so the child's current session never refreshes into the successor", async () => {
    const rootDir = root();
    const evaluated = await finishBaselineBoard(rootDir);
    expect(successorPreparationStatus(evaluated)).toBeUndefined();
    const decided = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir });
    const preparing = successorPreparationStatus(decided)!;
    expect(preparing).toMatchObject({ phase: "successor_preparing", nodes: [] });
    const published = successorPreparationStatus(bindAll(rootDir))!;
    expect(published.phase).toBe("successor_published");
    expect(published.updatedAt).toBe(preparing.updatedAt);
  });
});

describe("restart resume (test 3)", () => {
  it("resumes exactly the outstanding step after a restart and nothing once the successor is published", async () => {
    const rootDir = root();
    const evaluated = await finishBaselineBoard(rootDir);
    expect(successorResumeAction(evaluated)).toBe("decide");
    const decided = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir });
    expect(successorResumeAction(decided)).toBe("prepare");
    const published = bindAll(rootDir);
    expect(successorResumeAction(published)).toBeNull();
  });

  it("does not resume a successor whose node needs human attention", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    const decided = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_quest", { instruments: [questSuccessor.instruments[1]!] }) }, { rootDir });
    const blocked = transitionLearningCycle(CHILD, HW, decided.revision, { type: "artifact_generation_attention_required", nodeId: preparingBoardInstance(decided)!.nodeIds[0]!, reason: "builder failed twice" }, { rootDir });
    expect(successorResumeAction(blocked)).toBeNull();
    expect(blocked.lifecycle).toBe("quest_generating");
  });
});

describe("legacy restart safety", () => {
  it("never auto-resumes a legacy cycle, so a restart cannot start a Planner call it never made before", () => {
    const rootDir = root();
    const { boards: _boards, ...legacyInput } = cycleInput();
    createLearningCycle(legacyInput, { rootDir });
    complete(rootDir, "facts", "s1", "b-1");
    const evaluated = complete(rootDir, "story", "s1", "b-2")!;
    expect(evaluated.lifecycle).toBe("baseline_evaluating");
    expect(successorResumeAction(evaluated)).toBeNull();
  });
});

describe("returned work (test 14)", () => {
  it("calibrates the original assignment without creating or changing any board", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir });
    const before = bindAll(rootDir);
    const source = {
      sourceId: "returned:1", type: "graded_work" as const, fileFingerprint: "marked-fp", sourceFile: "marked.pdf", provenance: "teacher" as const,
      capturedAt: "2026-10-02T00:00:00.000Z", status: "confirmed" as const,
      assignmentLink: { homeworkId: HW, method: "explicit_selection" as const, confidence: 1, confirmedBy: "caregiver" as const },
    };
    const after = transitionLearningCycle(CHILD, HW, before.revision, {
      type: "returned_work_confirmed", source,
      calibration: { calibrationId: "cal-1", gradedAt: "2026-10-02T00:00:00.000Z", score: 0.9, status: "inconclusive", gradedItems: [], sourceFile: "marked.pdf", reason: "graded", nextAction: "interpret" },
      observations: [{ observationId: "returned:1:q1", sourceId: "returned:1", itemId: "q1", constructLinks: [{ constructId: "math.multiplication", role: "primary", confidence: 1 }], result: { correct: true }, assistance: { status: "unassisted", scaffolds: [] }, exposure: "unseen", provenance: "graded_work", observedAt: "2026-10-02T00:00:00.000Z", confounds: [] }],
      evaluations: [],
    }, { rootDir });
    expect(after.homeworkId).toBe(HW);
    expect(after.observations.some((row) => row.observationId === "returned:1:q1")).toBe(true);
    expect(after.boards).toEqual(before.boards);
    expect(after.nodes).toEqual(before.nodes);
  });
});

function writeProfile(rootDir: string) {
  fs.writeFileSync(path.join(rootDir, `src/context/${CHILD}/learning_profile.json`), JSON.stringify({
    childId: CHILD, name: "Board Kid", interests: [], goals: [], moodHistory: [],
    demographics: { age: 8, grade: "3", dyslexia: false, adhd: false, languages: ["en"] },
    sessionStats: { totalSessions: 0, totalWordsMastered: 0, currentStreak: 0 },
  }));
}
const toolResponse = (input: Record<string, unknown>) => ({ content: [{ type: "tool_use", name: "decide_learning_cycle_progression", input }] });
const baseTool = { status: "supported", reason: "r", preserve: [], change: [], testNext: [], nextEvidenceRequired: [], predictionEvaluationIds: [] };

describe("review fixes: no stuck or silent cycles", () => {
  it("blocks visibly, once, when a checkpointed Planner response fails validation, and never re-asks", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    writeProfile(rootDir);
    const create = vi.fn(async () => toolResponse({ ...baseTool, progressionAction: "generate_quest", nextInstruments: supportSuccessor.instruments }));
    await expect(advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { create } } as never }, { rootDir }))
      .rejects.toThrow("canonical_progression_encounter_missing");
    const blocked = getLearningCycle(CHILD, HW, { rootDir })!;
    expect(blocked.lifecycle).toBe("blocked");
    expect(blocked.decisionHistory.at(-1)?.reason).toContain("planner_decision_invalid:canonical_progression_encounter_missing");
    expect(successorResumeAction(blocked)).toBeNull();
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { create } } as never }, { rootDir });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("blocks visibly when the provider outcome is uncertain instead of retrying a possibly paid call", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    writeProfile(rootDir);
    const create = vi.fn(async () => { throw new Error("socket hang up"); });
    await expect(advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { create } } as never }, { rootDir }))
      .rejects.toThrow("provider_outcome_uncertain");
    const blocked = getLearningCycle(CHILD, HW, { rootDir })!;
    expect(blocked.lifecycle).toBe("blocked");
    expect(blocked.decisionHistory.at(-1)?.reason).toContain("provider_outcome_uncertain");
  });

  it("keeps one Planner checkpoint for the batch even when replays change the revision", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    writeProfile(rootDir);
    const file = path.join(rootDir, `src/context/${CHILD}/homework/cycles/${HW}.json`);
    const snapshot = fs.readFileSync(file, "utf8");
    const create = vi.fn(async () => toolResponse({ ...baseTool, progressionAction: "generate_support", nextInstruments: supportSuccessor.instruments }));
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { create } } as never }, { rootDir });
    fs.writeFileSync(file, snapshot);
    complete(rootDir, "facts", "replay-after-restart", "b-1");
    const replayed = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { create: vi.fn(async () => { throw new Error("must not call"); }) } } as never }, { rootDir });
    expect(create).toHaveBeenCalledTimes(1);
    expect(preparingBoardInstance(replayed)).toBeDefined();
  });

  it("marks a successor node that fails to build as needing attention, reports it, and never rebuilds it automatically", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir });
    const failing = vi.fn(async () => { throw new Error("builder exploded"); });
    const after = await prepareSuccessorBoard({ childId: CHILD, homeworkId: HW, generateHtml: failing, validate: async () => ({ passed: true, failures: [] }), generateArtwork: async () => "/generated/a.png" }, { rootDir });
    const board = preparingBoardInstance(after)!;
    expect(after.nodes.find((node) => node.nodeId === board.nodeIds[0])?.state).toBe("blocked");
    expect(successorPreparationStatus(after)?.phase).toBe("needs_attention");
    expect(successorResumeAction(after)).toBeNull();
    await prepareSuccessorBoard({ childId: CHILD, homeworkId: HW, generateHtml: failing, validate: async () => ({ passed: true, failures: [] }) }, { rootDir });
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("never lets a route choice reopen a closed evidence batch or overwrite an encounter lifecycle", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    const questWithRoutes = {
      instruments: [
        instrument("warmup", "Harbor Warmup", ["s-1"]),
        instrument("dock", "Dock Path", ["s-2"]),
        instrument("reef", "Reef Path", ["s-2"]),
        instrument("lantern", "Lantern Rescue", ["q-1"], "quest"),
      ],
      routeChoice: { sharedNodeIds: ["warmup"], routes: [{ routeId: "dock", nodeIds: ["dock", "lantern"] }, { routeId: "reef", nodeIds: ["reef", "lantern"] }] },
    };
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_quest", questWithRoutes) }, { rootDir });
    let cycle = bindAll(rootDir);
    const experiment = currentBoardInstance(cycle).agencyExperiment!;
    complete(rootDir, experiment.sharedNodeIds[0]!, "s2", "s-1");
    cycle = getLearningCycle(CHILD, HW, { rootDir })!;
    cycle = transitionLearningCycle(CHILD, HW, cycle.revision, { type: "route_selected", experimentId: experiment.experimentId, routeId: "dock", choiceEventId: "c1" }, { rootDir });
    expect(cycle.lifecycle).toBe("quest_ready");
    const quest = cycle.nodes.find((node) => node.role === "quest" && node.nodeId.includes(":b2:"))!;
    // An authorized encounter inside a route is never hidden by navigation locks (test 12).
    expect(projectLearningCycle(cycle).adventureBoard.nodes.some((node) => node.id === quest.nodeId)).toBe(true);
    complete(rootDir, cycle.nodes.find((node) => node.title === "Dock Path")!.nodeId, "s2", "s-2");
    complete(rootDir, quest.nodeId, "s2", "q-1");
    cycle = getLearningCycle(CHILD, HW, { rootDir })!;
    expect(cycle.lifecycle).toBe("quest_evaluating");
    expect(() => transitionLearningCycle(CHILD, HW, cycle.revision, { type: "route_selected", experimentId: experiment.experimentId, routeId: "reef", choiceEventId: "c2" }, { rootDir }))
      .toThrow("learning_board_batch_closed");
  });

  it("rejects relocking a playable non-route node on a published board", () => {
    const rootDir = root();
    const cycle = createLearningCycle(cycleInput(), { rootDir });
    const next = structuredClone(cycle);
    next.nodes[0]!.state = "locked";
    expect(() => transitionLearningCycle(CHILD, HW, cycle.revision, { type: "block", reason: "x" }, { rootDir })).not.toThrow();
    expect(() => assertPublishedBoardsImmutable(cycle, next)).toThrow("learning_board_state_regressed:facts");
  });
});

describe("review fixes: legacy cycles keep working", () => {
  function legacyQuestGenerating(rootDir: string) {
    const legacyQuest: LearningCycleNodeContract = {
      ...baseline("quest", "Quest"), role: "quest", state: "generating", artifactBinding: null,
      generationPrompt: { promptId: "quest:prompt", createdFromEvidenceIds: ["s1:facts:completion"], text: "Build the legacy Quest." },
    };
    const { boards: _boards, ...legacyInput } = cycleInput();
    return createLearningCycle({ ...legacyInput, nodes: [...legacyInput.nodes, legacyQuest], initialLifecycle: "quest_generating" }, { rootDir });
  }

  it("finishes an in-flight legacy Quest through the legacy generator and hides it until it is ready", async () => {
    const rootDir = root();
    const cycle = legacyQuestGenerating(rootDir);
    expect(projectLearningCycle(cycle).adventureBoard.nodes.some((node) => node.id === "quest")).toBe(false);
    const after = await prepareSuccessorBoard({ childId: CHILD, homeworkId: HW, generateHtml: async () => "<html><body><h1>Quest</h1></body></html>", validate: async () => ({ passed: true, failures: [] }), generateArtwork: async () => "/generated/q.png" }, { rootDir });
    expect(after.lifecycle).toBe("quest_ready");
    expect(after.boards).toBeUndefined();
    expect(projectLearningCycle(after).adventureBoard.nodes.find((node) => node.id === "quest")?.action?.type).toBe("launch-activity");
  });
});

describe("Planner successor program parsing", () => {
  it("parses a Planner-authored multi-node successor with a route choice and encounter markers", () => {
    const parsed = parseCanonicalProgressionDecision({
      status: "supported", reason: "Transfer next.", progressionAction: "generate_quest",
      preserve: [], change: [], testNext: [], nextEvidenceRequired: [], predictionEvaluationIds: [],
      nextInstruments: questSuccessor.instruments,
      routeChoice: { sharedNodeIds: ["warmup"], routes: [{ routeId: "a", nodeIds: ["lantern"] }] },
    });
    expect(parsed.successor?.instruments.map((row) => [row.nodeId, row.encounter ?? null])).toEqual([["warmup", null], ["lantern", "quest"]]);
    expect(parsed.successor?.routeChoice?.routes).toHaveLength(1);
  });

  it("reads a legacy single-instrument checkpoint as a one-node successor", () => {
    const parsed = parseCanonicalProgressionDecision({
      status: "supported", reason: "Transfer next.", progressionAction: "generate_quest",
      preserve: [], change: [], testNext: [], nextEvidenceRequired: [], predictionEvaluationIds: [],
      nextNodeId: "quest", nextTitle: "Lantern Rescue", nextAcademicTarget: "transfer", nextMechanic: "m", nextTheme: "t",
      nextOpeningPurpose: "p", nextCreatorPrompt: "c", nextItems: items(["q-1"]),
    });
    expect(parsed.successor?.instruments).toHaveLength(1);
    expect(parsed.successor?.instruments[0]).toMatchObject({ title: "Lantern Rescue", encounter: "quest" });
  });

  it("requires no successor for await_calibration", () => {
    const parsed = parseCanonicalProgressionDecision({
      status: "awaiting_calibration", reason: "Wait.", progressionAction: "await_calibration",
      preserve: [], change: [], testNext: [], nextEvidenceRequired: [], predictionEvaluationIds: [],
    });
    expect(parsed.successor).toBeUndefined();
  });
});
