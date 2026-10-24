import * as canvasVerifier from './adventureBoardCanvas';
import {createHash} from 'node:crypto';
import {choiceJourneyFixture,linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
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
    definition:linearJourneyFixture(nodes.map(node=>node.nodeId)),
    predecessorBoardId: null,
    plannerDecisionId: `${HW}:decision:r0`,
    evidenceIds: ["pdf:1"],
    nodeIds: nodes.map((node) => node.nodeId),
    publishedAt: "2026-10-01T00:00:00.000Z",
  });
  return { ...base, boards: [board] };
}

function complete(rootDir: string, nodeId: string, sessionId: string, target: string, correct = true, extra: Record<string, unknown> = {}, now?: Date) {
  return recordCanonicalNodeCompletion({
    childId: CHILD, homeworkId: HW, sessionId, nodeId,
    result: { completed: true, accuracy: correct ? 1 : 0, timeSpent_ms: 1000, targetResults: [{ target, correct, attemptedValue: correct ? "10" : "3" }], ...extra },
  }, { rootDir, ...(now ? { now } : {}) });
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
    ...(successor ? { successor:{...successor,boardDefinition:successor.boardDefinition??linearJourneyFixture(successor.instruments.map(row=>row.nodeId))} } : {}),
  };
}

const supportDefinition=choiceJourneyFixture([{id:'dock',label:'Dock',nodeIds:['route-dock']},{id:'reef',label:'Reef',nodeIds:['route-reef']}],['warmup'],['check']);
const supportSuccessor = {
  boardDefinition:supportDefinition,
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
  if(preparing.definition)cycle=transitionLearningCycle(CHILD,HW,cycle.revision,{type:'board_canvas_verified',boardId:preparing.boardId,proof:{definitionHash:createHash('sha256').update(JSON.stringify(preparing.definition)).digest('hex'),rendererHash:'unit-renderer-proof',viewports:['1280x720','768x1024'],screenshots:['/test/a.png','/test/b.png'],verifiedAt:'2026-10-09T00:00:00Z'}},{rootDir});
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
    expect(board.definition?.choices[0].options).toHaveLength(2);
    expect(board.agencyExperiment).toBeUndefined();
    expect(board.definition?.paths.find(p=>p.id==='main')?.portalIds).toEqual(['start','warmup','choice','check','end']);
    expect(board.definition?.paths.find(p=>p.id==='dock')?.portalIds).toEqual(['dock:route-dock']);
    expect(board.definition?.paths.find(p=>p.id==='reef')?.portalIds).toEqual(['reef:route-reef']);
    expect(nodesOfBoard(published, board.boardId).some((node) => node.role === "quest" || node.role === "boss")).toBe(false);
    const projected = projectLearningCycle(published);
    expect(projected.adventureBoard.nodes.some((node) => node.kind === "quest" || node.kind === "boss")).toBe(false);
    expect(projected.adventureBoard.nodes.some((node) => node.kind === "choice-gate")).toBe(true);
  });

  it("test 5: inventory-only history remains intact and cannot invent a visible board", () => {
    const rootDir = root();
    const legacyQuest: LearningCycleNodeContract = { ...baseline("quest", "Quest"), role: "quest", state: "locked", artifactBinding: null };
    const legacyBoss: LearningCycleNodeContract = { ...baseline("boss", "Boss"), role: "boss", state: "locked", artifactBinding: null };
    const { boards: _boards, ...legacyInput } = cycleInput();
    const cycle = createLearningCycle({ ...legacyInput, nodes: [...legacyInput.nodes, legacyQuest, legacyBoss] }, { rootDir });
    expect(()=>projectLearningCycle(cycle)).toThrow('board_definition_missing');
    expect(cycle.nodes.filter(node=>node.role==='quest'||node.role==='boss')).toHaveLength(2);

  });

  it("test 6: an authorized Quest is visible and follows its authored warmup", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    const decided = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_quest", questSuccessor) }, { rootDir });
    expect(decided.lifecycle).toBe("quest_generating");
    const published = bindAll(rootDir);
    expect(published.lifecycle).toBe("quest_ready");
    const quest = nodesOfBoard(published, currentBoardInstance(published).boardId).find((node) => node.role === "quest")!;
    expect(quest).toMatchObject({ title: "Lantern Rescue", state: "ready" });
    const projected = projectLearningCycle(published);
    const questNode = projected.adventureBoard.nodes.find((node) => node.activityNodeId === quest.nodeId)!;
    expect(questNode.kind).toBe("activity");
    expect(questNode.state).toBe("locked");
    complete(rootDir,published.nodes.find(node=>node.nodeId.endsWith(":warmup"))!.nodeId,"s2","s-1");
    expect(projectLearningCycle(getLearningCycle(CHILD,HW,{rootDir})!).adventureBoard.nodes.find(node=>node.activityNodeId===quest.nodeId)?.state).toBe("available");
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
    complete(rootDir,getLearningCycle(CHILD,HW,{rootDir})!.nodes.find(node=>node.nodeId.endsWith(":warmup"))!.nodeId,"s2","s-1");
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
    complete(rootDir,getLearningCycle(CHILD,HW,{rootDir})!.nodes.find(node=>node.nodeId.endsWith(":warmup"))!.nodeId,"s2","s-1");
    complete(rootDir, quest.nodeId, "s2", "q-1");
    cycle = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_boss", bossSuccessor) }, { rootDir });
    expect(cycle.lifecycle).toBe("boss_generating");
    cycle = bindAll(rootDir);
    expect(cycle.lifecycle).toBe("boss_ready");
    const boss = nodesOfBoard(cycle, currentBoardInstance(cycle).boardId).find((node) => node.role === "boss")!;
    expect(projectLearningCycle(cycle).adventureBoard.nodes.find((node) => node.activityNodeId === boss.nodeId)?.kind).toBe("activity");
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
      boardDefinition:linearJourneyFixture(["warmup","lantern"]),
    };
    const create = vi.fn(async () => ({ content: [{ type: "tool_use", name: "decide_learning_cycle_progression", input: toolInput }] }));
    const first = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { create, stream: (payload: unknown) => ({ finalMessage: () => create() }) } } as never }, { rootDir });
    const firstBoard = preparingBoardInstance(first)!;

    // Crash after the provider replied but before the cycle commit survived.
    fs.writeFileSync(file, snapshot);
    const unavailable = vi.fn(async () => { throw new Error("provider must not be called on restart"); });
    const replayed = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { create: unavailable, stream: (payload: unknown) => ({ finalMessage: () => unavailable() }) } } as never }, { rootDir });

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
    const observedAt = new Date("2026-10-01T00:30:00.000Z");
    complete(rootDir, "facts", "s1", "b-1", true, {}, observedAt);
    const evaluated = complete(rootDir, "story", "s1", "b-2", true, {}, observedAt)!;
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
    const canonical=(id:string)=>board.definition!.portals.find(p=>p.id===id)!.activityNodeId!;
    complete(rootDir, canonical('warmup'), "s2", "s-1");
    cycle = getLearningCycle(CHILD, HW, { rootDir })!;
    cycle = transitionLearningCycle(CHILD, HW, cycle.revision, { type: "journey_choice_selected", choiceId:'choice', optionId:'dock', choiceEventId: "choice-1" }, { rootDir });
    complete(rootDir,canonical('dock:route-dock'),'s2','s-2');
    complete(rootDir,canonical('check'),'s2','b-2');
    cycle = getLearningCycle(CHILD, HW, { rootDir })!;
    expect(cycle.lifecycle).toBe("baseline_evaluating");
    const untaken = "reef:route-reef";
    expect(projectLearningCycle(cycle).adventureBoard.nodes.find((node) => node.id === untaken)?.lock).toMatchObject({ reason: "route-not-taken", label: "Not taken" });
  });
});

describe("successor preparation status (no in-session swap)", () => {
  it("reports preparation and publication with one stable updatedAt so the child's current session never refreshes into the successor", async () => {
    const rootDir = root();
    const evaluated = await finishBaselineBoard(rootDir);
    // While the Planner is still deciding, the next board is already preparing, on the same clock.
    const deciding = successorPreparationStatus(evaluated)!;
    expect(deciding).toMatchObject({ phase: "successor_preparing", nodes: [] });
    const decided = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir });
    const preparing = successorPreparationStatus(decided)!;
    expect(preparing).toMatchObject({ phase: "successor_preparing", nodes: [] });
    expect(preparing.startedAt).toBe(preparing.updatedAt);
    expect(preparing.updatedAt).toBe(deciding.updatedAt);
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

  // 2026-10-21 human catch: Ila's board 3 sat unpublished behind one activity that failed its
  // check before this rule existed, so she kept seeing her finished board. Logs said needs-attention;
  // the lab asserted that a held board was correct. At startup that activity becomes Not ready at $0.
  it("resumes a successor held by an earlier failed activity, marks it Not ready without rebuilding it, and publishes", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    const decided = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir });
    const failed = preparingBoardInstance(decided)!.nodeIds[0]!;
    const held = transitionLearningCycle(CHILD, HW, decided.revision, { type: "artifact_generation_attention_required", nodeId: failed, reason: "successor_node_failed:checker wanted a visible prompt" }, { rootDir });
    expect(successorResumeAction(held)).toBe("prepare");
    const canvas = vi.spyOn(canvasVerifier, "verifyPreparingBoardCanvas").mockResolvedValue(undefined);
    const generateHtml = vi.fn(async ({ node }: any) => `<html><body><h1>${node.title}</h1></body></html>`);
    try {
      const after = await prepareSuccessorBoard({ childId: CHILD, homeworkId: HW, generateHtml, generateArtwork: async () => "/generated/a.png", validate: async () => ({ passed: true, failures: [] }) }, { rootDir });
      expect(after.boards!.at(-1)!.publishedAt).not.toBeNull();
      expect(after.nodes.find(node => node.nodeId === failed)?.notReadyReason).toContain("checker wanted a visible prompt");
      expect(generateHtml.mock.calls.map(([call]: any) => call.node.nodeId)).not.toContain(failed);
      expect(successorResumeAction(after)).toBeNull();
    } finally { canvas.mockRestore(); }
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
const toolResponse = (input: Record<string, unknown>) => ({ content: [{ type: "tool_use", name: "decide_learning_cycle_progression", input:{...input,...(Array.isArray(input.nextInstruments)?{boardDefinition:linearJourneyFixture(input.nextInstruments.map((row:any)=>row.nodeId))}:{})} }] });
const baseTool = { status: "supported", reason: "r", preserve: [], change: [], testNext: [], nextEvidenceRequired: [], predictionEvaluationIds: [] };

describe("review fixes: no stuck or silent cycles", () => {
  it("blocks visibly, once, when a checkpointed Planner response fails validation, and never re-asks", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    writeProfile(rootDir);
    const create = vi.fn(async () => toolResponse({ ...baseTool, progressionAction: "generate_quest", nextInstruments: supportSuccessor.instruments }));
    await expect(advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { create, stream: (payload: unknown) => ({ finalMessage: () => create() }) } } as never }, { rootDir }))
      .rejects.toThrow("canonical_progression_encounter_missing");
    const blocked = getLearningCycle(CHILD, HW, { rootDir })!;
    expect(blocked.lifecycle).toBe("blocked");
    expect(blocked.decisionHistory.at(-1)?.reason).toContain("planner_decision_invalid:canonical_progression_encounter_missing");
    expect(successorResumeAction(blocked)).toBeNull();
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { create, stream: (payload: unknown) => ({ finalMessage: () => create() }) } } as never }, { rootDir });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("blocks visibly when the provider outcome is uncertain instead of retrying a possibly paid call", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    writeProfile(rootDir);
    const create = vi.fn(async () => { throw new Error("socket hang up"); });
    await expect(advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { create, stream: (payload: unknown) => ({ finalMessage: () => create() }) } } as never }, { rootDir }))
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
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { create, stream: (payload: unknown) => ({ finalMessage: () => create() }) } } as never }, { rootDir });
    fs.writeFileSync(file, snapshot);
    complete(rootDir, "facts", "replay-after-restart", "b-1");
    const replayed = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, client: { messages: { stream: () => ({ finalMessage: vi.fn(async () => { throw new Error("must not call"); }) }) } } as never }, { rootDir });
    expect(create).toHaveBeenCalledTimes(1);
    expect(preparingBoardInstance(replayed)).toBeDefined();
  });

  it("preserves prepared successor activities and continues despite a canvas diagnostic failure", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    const successor = structuredClone(supportSuccessor);
    successor.boardDefinition.portals[1]!.position = structuredClone(successor.boardDefinition.portals[0]!.position);
    await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", successor) }, { rootDir });
    let before = getLearningCycle(CHILD, HW, { rootDir })!;
    const pending = preparingBoardInstance(before)!;
    before = transitionLearningCycle(CHILD, HW, before.revision, {
      type: "artifact_bound", nodeId: pending.nodeIds[0]!, artifact: baseline("saved", "Saved").artifactBinding!,
    }, { rootDir });
    const verify = vi.spyOn(canvasVerifier, "verifyPreparingBoardCanvas").mockRejectedValue(Error("canvas diagnostic unavailable"));
    const generateHtml = vi.fn(async ({node}:any) => `<html><body><h1>${node.title}</h1></body></html>`);
    try {
      const after = await prepareSuccessorBoard({ childId: CHILD, homeworkId: HW, generateHtml, validate:async()=>({passed:true,failures:[]}) }, { rootDir });
      expect(after.lifecycle).toBe("baseline_ready");
      expect(after.nodes.find(node=>node.nodeId===pending.nodeIds[0])).toEqual(before.nodes.find(node=>node.nodeId===pending.nodeIds[0]));
      expect(after.observations).toEqual(before.observations);
      expect(after.boards!.at(-1)!.publishedAt).not.toBeNull();
      expect(after.boards![0]).toEqual(before.boards![0]);
      expect(after.decisionHistory.some(row=>row.eventType==="block")).toBe(false);
      expect(successorResumeAction(after)).toBeNull();
      const restarted = await prepareSuccessorBoard({ childId: CHILD, homeworkId: HW, generateHtml }, { rootDir });
      expect(restarted).toEqual(after);
      expect(verify).toHaveBeenCalledTimes(1);
      expect(generateHtml).toHaveBeenCalledTimes(pending.nodeIds.length-1);
    } finally { verify.mockRestore(); }
  }, 20000);

  // Jamal's rule: the board is a dumb canvas for the Planner's orders. Nothing downstream holds it back.
  it.each([
    ["the builder throws", { generateHtml: (fail: boolean, title: string) => fail ? Promise.reject(new Error("builder exploded")) : Promise.resolve(`<html><body><h1>${title}</h1></body></html>`), validate: () => Promise.resolve({ passed: true, failures: [] }) }],
    ["the checker fails", { generateHtml: (_fail: boolean, title: string) => Promise.resolve(`<html><body><h1>${title}</h1></body></html>`), validate: (fail: boolean) => Promise.resolve(fail ? { passed: false, failures: ["math_journey_checker_contract_ambiguity;item=word-1"] } : { passed: true, failures: [] }) }],
  ] as const)("publishes the successor with one Not ready activity when %s, keeps the reason, and never rebuilds it", async (_label, builder) => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    const decided = await advanceCanonicalCycleFromEvidence({ childId: CHILD, homeworkId: HW, decide: async () => decision("generate_support", supportSuccessor) }, { rootDir });
    const board = preparingBoardInstance(decided)!;
    const failed = board.nodeIds[0]!;
    const canvas = vi.spyOn(canvasVerifier, "verifyPreparingBoardCanvas").mockResolvedValue(undefined);
    const generateHtml = vi.fn(async ({ node }: any) => builder.generateHtml(node.nodeId === failed, node.title));
    const validate = vi.fn(async ({ node }: any) => builder.validate(node.nodeId === failed));
    const prepare = () => prepareSuccessorBoard({ childId: CHILD, homeworkId: HW, generateHtml, validate, generateArtwork: async () => "/generated/a.png" }, { rootDir });
    try {
      const after = await prepare();
      expect(after.boards!.find(candidate => candidate.boardId === board.boardId)!.publishedAt).not.toBeNull();
      // The Not ready portal keeps the real failure for tracing, never a generic placeholder.
      expect(after.nodes.find(node => node.nodeId === failed)?.notReadyReason).toMatch(_label === "the checker fails" ? /math_journey_checker_contract_ambiguity/ : /builder exploded/);
      for (const nodeId of board.nodeIds.slice(1)) expect(after.nodes.find(node => node.nodeId === nodeId)?.artifactBinding?.validationStatus).toBe("passed");
      expect(successorPreparationStatus(after)?.phase).toBe("successor_published");
      expect(successorResumeAction(after)).toBeNull();
      const calls = generateHtml.mock.calls.length;
      expect(await prepare()).toEqual(after);
      expect(generateHtml).toHaveBeenCalledTimes(calls);
    } finally { canvas.mockRestore(); }
  });

  it("never lets a route choice reopen a closed evidence batch or overwrite an encounter lifecycle", async () => {
    const rootDir = root();
    await finishBaselineBoard(rootDir);
    const questWithRoutes = {
      boardDefinition:choiceJourneyFixture([{id:"dock",label:"Dock",nodeIds:["dock"]},{id:"reef",label:"Reef",nodeIds:["reef"]}],["warmup"],["lantern"]),
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
    const definition=currentBoardInstance(cycle).definition!;
    complete(rootDir, definition.portals.find(p=>p.id==="warmup")!.activityNodeId!, "s2", "s-1");
    cycle = getLearningCycle(CHILD, HW, { rootDir })!;
    cycle = transitionLearningCycle(CHILD, HW, cycle.revision, { type: "journey_choice_selected", choiceId:"choice", optionId: "dock", choiceEventId: "c1" }, { rootDir });
    expect(cycle.lifecycle).toBe("quest_ready");
    const quest = cycle.nodes.find((node) => node.role === "quest" && node.nodeId.includes(":b2:"))!;
    // An authorized encounter inside a route is never hidden by navigation locks (test 12).
    expect(projectLearningCycle(cycle).adventureBoard.nodes.some((node) => node.activityNodeId === quest.nodeId)).toBe(true);
    complete(rootDir, cycle.nodes.find((node) => node.title === "Dock Path")!.nodeId, "s2", "s-2");
    complete(rootDir, quest.nodeId, "s2", "q-1");
    cycle = getLearningCycle(CHILD, HW, { rootDir })!;
    expect(cycle.lifecycle).toBe("quest_evaluating");
    expect(() => transitionLearningCycle(CHILD, HW, cycle.revision, { type: "journey_choice_selected", choiceId:"choice", optionId: "reef", choiceEventId: "c2" }, { rootDir }))
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

  it("preserves an in-flight historical Quest without inventing a board from its inventory", async () => {
    const rootDir = root();
    const cycle = legacyQuestGenerating(rootDir);
    expect(() => projectLearningCycle(cycle)).toThrow("board_definition_missing");
    const after = await prepareSuccessorBoard({ childId: CHILD, homeworkId: HW, generateHtml: async () => "<html><body><h1>Quest</h1></body></html>", validate: async () => ({ passed: true, failures: [] }), generateArtwork: async () => "/generated/q.png" }, { rootDir });
    expect(after.lifecycle).toBe("quest_ready");
    expect(after.boards).toBeUndefined();
    expect(after.nodes.find(node => node.nodeId === "quest")?.artifactBinding?.validationStatus).toBe("passed");
    expect(() => projectLearningCycle(after)).toThrow("board_definition_missing");
  });
});

describe("Planner successor program parsing", () => {
  it("parses a Planner-authored multi-node successor with a route choice and encounter markers", () => {
    const parsed = parseCanonicalProgressionDecision({
      status: "supported", reason: "Transfer next.", progressionAction: "generate_quest",
      preserve: [], change: [], testNext: [], nextEvidenceRequired: [], predictionEvaluationIds: [],
      nextInstruments: questSuccessor.instruments,
      boardDefinition:linearJourneyFixture(["warmup","lantern"]),
      routeChoice: { sharedNodeIds: ["warmup"], routes: [{ routeId: "a", nodeIds: ["lantern"] }] },
    });
    expect(parsed.successor?.instruments.map((row) => [row.nodeId, row.encounter ?? null])).toEqual([["warmup", null], ["lantern", "quest"]]);
    expect(parsed.successor?.routeChoice).toBeUndefined();
    expect(parsed.successor?.boardDefinition).toEqual(linearJourneyFixture(["warmup","lantern"]));
  });

  it("requires explicit new authoring for a historical single-instrument receipt", () => {
    expect(()=>parseCanonicalProgressionDecision({
      status: "supported", reason: "Transfer next.", progressionAction: "generate_quest",
      preserve: [], change: [], testNext: [], nextEvidenceRequired: [], predictionEvaluationIds: [],
      nextNodeId: "quest", nextTitle: "Lantern Rescue", nextAcademicTarget: "transfer", nextMechanic: "m", nextTheme: "t",
      nextOpeningPurpose: "p", nextCreatorPrompt: "c", nextItems: items(["q-1"]),
    })).toThrow("board_definition_missing");
  });

  it("requires no successor for await_calibration", () => {
    const parsed = parseCanonicalProgressionDecision({
      status: "awaiting_calibration", reason: "Wait.", progressionAction: "await_calibration",
      preserve: [], change: [], testNext: [], nextEvidenceRequired: [], predictionEvaluationIds: [],
    });
    expect(parsed.successor).toBeUndefined();
  });
});
