import fs from "fs";
import path from "path";
import type { MapState, NodeConfig, NodeResult } from "../shared/adventureTypes";
import { resetAdaptabilityDemo, sandboxContextRoot } from "../scripts/adaptabilityDemo";
import {
  __resetAdventureMapSessionsForTests,
  applyNodeResult,
  startMapSession,
} from "../server/map-coordinator";
import { getChildChart } from "../profiles/childChart";
import {
  planHomeworkSessionFromChart,
  writeActiveSessionPlan,
} from "./sessionPlanFromChart";
import {
  registerActiveVoiceSessionManager,
  unregisterActiveVoiceSessionManager,
  type VoiceSessionManagerHandle,
} from "../server/voice-session-registry";
import { SessionDebugRecorder } from "../server/session-debug-recorder";
import {
  writePostSessionTruthPacket,
  type PostSessionTruthPacket,
} from "./postSessionTruthPacket";
import type { LearningProfile, PlanTheory } from "../context/schemas/learningProfile";

export type ClosedLoopProofNode = {
  id: string;
  type: string;
  words: string[];
  locked: boolean;
  completed: boolean;
};

export type ClosedLoopProofTrajectory = {
  id: "worsening_child" | "improving_child";
  direction: "worse" | "better";
  expectedBoardMove: "route_support" | "increase_challenge_or_skip_repetition";
  proved: boolean;
  sessionDir: string;
  nodeCompleted: {
    id: string;
    type: string;
  };
  accuracy: number;
  targetResults: NonNullable<NodeResult["targetResults"]>;
  changedNodeIds: string[];
  skippedPracticeNodeIds: string[];
  nextTargets: string[];
  reason: string;
  failures: string[];
};

export type ClosedLoopAdaptationProofReport = {
  reportVersion: 1;
  proved: boolean;
  childId: string;
  generatedAt: string;
  labDir: string;
  sessionDir: string;
  selectedMissTarget: string;
  nodeCompleted: {
    id: string;
    type: string;
  };
  evidence: {
    correctTargets: string[];
    missedTargets: string[];
  };
  runtimeDiff: {
    changedNodeIds: string[];
    nextTargets: string[];
    reason: string;
  };
  boardBefore: ClosedLoopProofNode[];
  boardAfter: ClosedLoopProofNode[];
  trajectories: ClosedLoopProofTrajectory[];
  postSessionTruth: PostSessionTruthPacket;
  files: {
    gameTraces: boolean;
    gameSummary: boolean;
    postSessionTruth: boolean;
    adaptationDiff: boolean;
  };
  failures: string[];
};

export type RunClosedLoopAdaptationProofOptions = {
  rootDir?: string;
  generatedAt?: string;
  domain?: "spelling";
  persona?: "struggling_reader";
};

const CHILD_ID = "demo_adaptive";
const PROOF_WORD_RADAR_CONFIG = {
  recallMode: "partial_visual_recall",
  inputMode: "whole-word",
  speakStyle: "option-a",
  showTimer: false,
  hideWordDuringResponse: false,
  requiresCapturedResponse: true,
} as const;

function proofPlanTheory(): PlanTheory {
  return {
    hypothesis:
      "If Sunny reads real activity evidence after an approved assignment plan, missed targets should move into the next support node while clean targets can be reduced or skipped.",
    evidenceSummary: [
      "The fixture starts with pending spelling homework and an approved chart-attached session plan.",
      "The completed activity emits target-level correct and missed word evidence.",
    ],
    intervention:
      "Use Word Radar as the first measurement instrument, then compare the canonical board before and after applyNodeResult.",
    supportCriteria: [
      "A missed target appears in a later support node after the activity result.",
      "The post-session truth packet marks adaptation as changed.",
    ],
    reviseCriteria: [
      "The board changes, but the missed target does not move into the next support path.",
      "Generated trace files are present but the post-session truth packet is incomplete.",
    ],
    falsifyCriteria: [
      "No downstream board node changes after target-level evidence.",
      "The runtime starts from pending homework without an approved active session plan.",
    ],
  };
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeStamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function labDirFor(rootDir: string, generatedAt: string): string {
  return path.join(rootDir, ".sunny-sandbox", "lab", "closed-loop", safeStamp(generatedAt));
}

function snapshotBoard(mapState: MapState): ClosedLoopProofNode[] {
  return mapState.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    words: [...(node.words ?? [])],
    locked: node.isLocked === true,
    completed: node.isCompleted === true,
  }));
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function patchDemoProfileForRetargetableProof(childDir: string): void {
  const profileFile = path.join(childDir, "learning_profile.json");
  const profile = readJson<LearningProfile>(profileFile);
  const pending = profile.pendingHomework;
  if (!pending) throw new Error("demo_adaptive fixture did not include pending homework");
  const homeworkId = pending.homeworkId ?? pending.weekOf ?? "hw-closed-loop";
  const words = ["above", "again", "around", "away", "alone", "awake"];
  const nodes = [
    {
      id: `n-word-radar-${homeworkId}`,
      type: "word-radar",
      words: words.slice(0, 3),
      difficulty: 1,
      gameFile: null,
      storyFile: null,
      wordRadarConfig: PROOF_WORD_RADAR_CONFIG,
    },
    {
      id: `n-monster-stampede-${homeworkId}`,
      type: "monster-stampede",
      words: words.slice(0, 3),
      difficulty: 1,
      gameFile: "monster-stampede.html",
      storyFile: null,
    },
    {
      id: `n-spell-check-${homeworkId}`,
      type: "spell-check",
      words: words.slice(0, 3),
      difficulty: 1,
      gameFile: "spell-check.html",
      storyFile: null,
    },
    {
      id: `n-pronunciation-${homeworkId}`,
      type: "pronunciation",
      words,
      difficulty: 1,
      gameFile: null,
      storyFile: null,
    },
  ] satisfies NonNullable<LearningProfile["pendingHomework"]>["nodes"];
  const nextPending = {
    ...pending,
    wordList: words,
    reinforceWords: [],
    completedAdventureNodeIds: [],
    nodes,
  };
  const nextProfile = {
    ...profile,
    selectedHomeworkDomain: "spelling" as const,
    pendingHomework: nextPending,
    activeHomeworkByDomain: {
      ...(profile.activeHomeworkByDomain ?? {}),
      spelling: nextPending,
    },
  };
  writeJson(profileFile, nextProfile);
}

function writeApprovedProofSessionPlan(rootDir: string, generatedAt: string): void {
  const chart = getChildChart(CHILD_ID, { rootDir });
  const plan = planHomeworkSessionFromChart(chart, {
    source: "ingest_human_loop",
    now: new Date(generatedAt),
    parentNote: "Closed-loop proof fixture: use the approved chart plan, then adapt after activity evidence.",
  });
  writeActiveSessionPlan(CHILD_ID, {
    ...plan,
    planTheory: plan.planTheory ?? proofPlanTheory(),
    plannedMeasurements: plan.plannedMeasurements ?? plan.nodePlan.flatMap((node) =>
      node.targets.map((target) => ({
        id: `${node.id}:${target}`,
        activityId: node.activityId,
        target,
        evidenceType: node.type === "word-radar" ? "recognition_recall" : "practice",
        supportCriteria: "Target is answered correctly without extra scaffold.",
        reviseCriteria: "Target is missed or needs extra scaffold.",
        falsifyCriteria: "No target-level evidence is recorded for this activity.",
      })),
    ),
    approvalStatus: "approved",
  }, { rootDir });
}

function withProofEnv<T>(contextRoot: string, fn: () => Promise<T>): Promise<T> {
  const previous = {
    SUNNY_CONTEXT_ROOT: process.env.SUNNY_CONTEXT_ROOT,
    SUNNY_SUBJECT: process.env.SUNNY_SUBJECT,
    SUNNY_MODE: process.env.SUNNY_MODE,
    SUNNY_PREVIEW_MODE: process.env.SUNNY_PREVIEW_MODE,
    SUNNY_HOMEWORK_DOMAIN: process.env.SUNNY_HOMEWORK_DOMAIN,
    SUNNY_LOG_UPLOAD_ON_END: process.env.SUNNY_LOG_UPLOAD_ON_END,
    TTS_ENABLED: process.env.TTS_ENABLED,
    GROK_API_KEY: process.env.GROK_API_KEY,
  };
  process.env.SUNNY_CONTEXT_ROOT = contextRoot;
  process.env.SUNNY_SUBJECT = "review";
  process.env.SUNNY_MODE = "real";
  process.env.SUNNY_PREVIEW_MODE = "off";
  process.env.SUNNY_HOMEWORK_DOMAIN = "spelling";
  process.env.SUNNY_LOG_UPLOAD_ON_END = "false";
  process.env.TTS_ENABLED = "false";
  delete process.env.GROK_API_KEY;

  return fn().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function firstWordDrivenNode(mapState: MapState): NodeConfig {
  const node = mapState.nodes.find((candidate) =>
    candidate.type === "word-radar" &&
    (candidate.words?.length ?? 0) >= 2,
  );
  if (!node) throw new Error("closed-loop proof could not find a word-radar node with at least two targets");
  return node;
}

function observeRuntimeBoardDiff(args: {
  boardBefore: ClosedLoopProofNode[];
  runtimeAfter: ClosedLoopProofNode[];
  completedNode: NodeConfig;
}): {
  boardAfter: ClosedLoopProofNode[];
  diff: {
    changedNodeIds: string[];
    skippedPracticeNodeIds: string[];
    nextTargets: string[];
    reason: string;
  };
} {
  const boardAfter = args.runtimeAfter.map((node) => ({
    ...node,
    words: [...node.words],
  }));
  // Observe production output only. A lab-selected practice plan is not proof
  // that the real session applied that plan; completion/unlocking is not targeting.
  const completedIndex = boardAfter.findIndex(node => node.id === args.completedNode.id);
  const changed = boardAfter.slice(completedIndex + 1).filter(node => {
    const before = args.boardBefore.find(previous => previous.id === node.id);
    return !node.completed && (!before || JSON.stringify(before.words) !== JSON.stringify(node.words));
  });
  const changedNodeIds = changed.map(node => node.id);
  const skippedPracticeNodeIds = changed.filter(node => node.words.length === 0).map(node => node.id);
  const nextTargets = [...new Set(changed.flatMap(node => node.words))];
  return {
    boardAfter,
    diff: {
      changedNodeIds,
      skippedPracticeNodeIds,
      nextTargets,
      reason: changed.length ? "Observed target changes in the production map result" : "Production session kept its existing targets; adaptive retargeting is not proven",
    },
  };
}

function writeCanonicalAdaptationDiff(args: {
  sessionDir: string;
  diff: {
    changedNodeIds: string[];
    skippedPracticeNodeIds: string[];
    nextTargets: string[];
    reason: string;
  };
}): void {
  writeJson(path.join(args.sessionDir, "adaptation-diff.json"), {
    status: args.diff.changedNodeIds.length > 0 ? "changed" : "stay_course",
    changed: args.diff.changedNodeIds.length > 0,
    reason: args.diff.reason,
    changedNodeIds: args.diff.changedNodeIds,
    skippedPracticeNodeIds: args.diff.skippedPracticeNodeIds,
    nextTargets: args.diff.nextTargets,
    source: "board_state_diff",
  });
}

function renderMarkdown(report: ClosedLoopAdaptationProofReport): string {
  const lines = [
    "# Sunny Closed-Loop Adaptation Proof",
    "",
    `childId: ${report.childId}`,
    `generatedAt: ${report.generatedAt}`,
    `proved: ${report.proved ? "yes" : "no"}`,
    `sessionDir: ${report.sessionDir}`,
    "",
    "## Evidence",
    `- completed node: ${report.nodeCompleted.type} (${report.nodeCompleted.id})`,
    `- correct targets: ${report.evidence.correctTargets.join(", ") || "(none)"}`,
    `- missed targets: ${report.evidence.missedTargets.join(", ") || "(none)"}`,
    "",
    "## Runtime Diff",
    `- changed nodes: ${report.runtimeDiff.changedNodeIds.join(", ") || "(none)"}`,
    `- next targets: ${report.runtimeDiff.nextTargets.join(", ") || "(none)"}`,
    `- reason: ${report.runtimeDiff.reason}`,
    "",
    "## Trajectory Proofs",
    ...report.trajectories.flatMap((trajectory) => [
      `### ${trajectory.id}`,
      `- direction: ${trajectory.direction}`,
      `- expected board move: ${trajectory.expectedBoardMove}`,
      `- proved: ${trajectory.proved ? "yes" : "no"}`,
      `- accuracy: ${Math.round(trajectory.accuracy * 100)}%`,
      `- changed nodes: ${trajectory.changedNodeIds.join(", ") || "(none)"}`,
      `- skipped practice nodes: ${trajectory.skippedPracticeNodeIds.join(", ") || "(none)"}`,
      `- next targets: ${trajectory.nextTargets.join(", ") || "(none)"}`,
      `- reason: ${trajectory.reason}`,
      "",
    ]),
    "",
    "## Post-Session Truth",
    `- adaptation status: ${report.postSessionTruth.adaptationDecision.status}`,
    `- reason: ${report.postSessionTruth.adaptationDecision.reason}`,
    "",
    "## Failures",
    ...(report.failures.length ? report.failures.map((failure) => `- ${failure}`) : ["- none"]),
  ];
  return `${lines.join("\n")}\n`;
}

type RunTrajectoryProofInput = {
  rootDir: string;
  labDir: string;
  generatedAt: string;
  id: ClosedLoopProofTrajectory["id"];
  direction: ClosedLoopProofTrajectory["direction"];
  expectedBoardMove: ClosedLoopProofTrajectory["expectedBoardMove"];
  resultForNode: (node: NodeConfig) => NodeResult;
};

async function runTrajectoryProof(input: RunTrajectoryProofInput): Promise<ClosedLoopProofTrajectory> {
  __resetAdventureMapSessionsForTests();
  const reset = resetAdaptabilityDemo({
    rootDir: input.rootDir,
    scenario: "weak_performance",
  });
  patchDemoProfileForRetargetableProof(reset.childDir);

  return withProofEnv(sandboxContextRoot(input.rootDir), async () => {
    writeApprovedProofSessionPlan(input.rootDir, input.generatedAt);
    const { sessionId, mapState } = await startMapSession(CHILD_ID, {
      subject: "review",
      sessionMode: "real",
      previewMode: "off",
      voiceMode: "muted",
      childId: CHILD_ID,
      homeworkDomain: "spelling",
    });
    const recorder = new SessionDebugRecorder({
      rootDir: path.join(input.labDir, "trajectory-session-logs", input.id),
      sessionId,
      childName: CHILD_ID,
      subject: "homework",
      mode: `closed-loop-${input.id}`,
      enabled: true,
      startedAt: new Date(input.generatedAt),
      command: "sunny:lab:closed-loop",
      gitCommit: "proof",
      envFlags: {
        SUNNY_CONTEXT_ROOT: sandboxContextRoot(input.rootDir),
        SUNNY_SUBJECT: "homework",
        SUNNY_PREVIEW_MODE: "off",
      },
    });
    const proofSession = {
      noteExternalEvent: () => {},
      recordGameTrace: recorder.recordGameTrace.bind(recorder),
      recordGameSummary: recorder.recordGameSummary.bind(recorder),
    } satisfies VoiceSessionManagerHandle & {
      recordGameSummary: (state: Record<string, unknown>) => void;
    };
    registerActiveVoiceSessionManager(CHILD_ID, proofSession);
    try {
      const node = firstWordDrivenNode(mapState);
      const boardBefore = snapshotBoard(mapState);
      const result = input.resultForNode(node);
      const completed = await applyNodeResult(sessionId, result);
      const { diff } = observeRuntimeBoardDiff({
        boardBefore,
        runtimeAfter: snapshotBoard(completed.mapState),
        completedNode: node,
      });
      writeCanonicalAdaptationDiff({ sessionDir: recorder.sessionDir, diff });
      recorder.finalize({
        endedAt: new Date(input.generatedAt),
        result: "completed",
        finalState: {
          childId: CHILD_ID,
          sessionId,
          nodeCompleted: node.id,
          trajectory: input.id,
        },
        artifacts: {
          proof: "closed-loop-trajectory",
        },
      });
      const { changedNodeIds, skippedPracticeNodeIds, nextTargets, reason } = diff;
      const targetResults = result.targetResults ?? [];
      const expectedMet =
        input.expectedBoardMove === "route_support"
          ? nextTargets.length > 0 && changedNodeIds.length > 0
          : nextTargets.length === 0 && skippedPracticeNodeIds.length > 0;
      const failures = [
        ...(changedNodeIds.length === 0 ? ["no next board nodes changed"] : []),
        ...(!expectedMet ? [`expected board move not met: ${input.expectedBoardMove}`] : []),
      ];
      return {
        id: input.id,
        direction: input.direction,
        expectedBoardMove: input.expectedBoardMove,
        proved: failures.length === 0,
        sessionDir: recorder.sessionDir,
        nodeCompleted: {
          id: node.id,
          type: node.type,
        },
        accuracy: result.accuracy ?? 0,
        targetResults,
        changedNodeIds,
        skippedPracticeNodeIds,
        nextTargets,
        reason,
        failures,
      };
    } finally {
      unregisterActiveVoiceSessionManager(CHILD_ID, proofSession);
    }
  });
}

export async function runClosedLoopAdaptationProof(
  opts: RunClosedLoopAdaptationProofOptions = {},
): Promise<ClosedLoopAdaptationProofReport> {
  const rootDir = opts.rootDir ?? process.cwd();
  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const labDir = labDirFor(rootDir, generatedAt);
  fs.mkdirSync(labDir, { recursive: true });
  __resetAdventureMapSessionsForTests();
  const reset = resetAdaptabilityDemo({
    rootDir,
    scenario: "weak_performance",
  });
  patchDemoProfileForRetargetableProof(reset.childDir);

  return withProofEnv(sandboxContextRoot(rootDir), async () => {
    writeApprovedProofSessionPlan(rootDir, generatedAt);
    const { sessionId, mapState } = await startMapSession(CHILD_ID, {
      subject: "review",
      sessionMode: "real",
      previewMode: "off",
      voiceMode: "muted",
      childId: CHILD_ID,
      homeworkDomain: "spelling",
    });
    const recorder = new SessionDebugRecorder({
      rootDir: path.join(labDir, "session-logs"),
      sessionId,
      childName: CHILD_ID,
      subject: "homework",
      mode: "closed-loop-proof",
      enabled: true,
      startedAt: new Date(generatedAt),
      command: "sunny:lab:closed-loop",
      gitCommit: "proof",
      envFlags: {
        SUNNY_CONTEXT_ROOT: sandboxContextRoot(rootDir),
        SUNNY_SUBJECT: "homework",
        SUNNY_PREVIEW_MODE: "off",
      },
    });
    const proofSession = {
      noteExternalEvent: () => {},
      recordGameTrace: recorder.recordGameTrace.bind(recorder),
      recordGameSummary: recorder.recordGameSummary.bind(recorder),
    } satisfies VoiceSessionManagerHandle & {
      recordGameSummary: (state: Record<string, unknown>) => void;
    };
    registerActiveVoiceSessionManager(CHILD_ID, proofSession);
    try {
      const node = firstWordDrivenNode(mapState);
      const boardBefore = snapshotBoard(mapState);
      const correctTarget = node.words?.[0] ?? "above";
      const missedTarget = node.words?.[1] ?? "again";
      const result: NodeResult = {
        nodeId: node.id,
        activityId: node.type,
        completed: true,
        accuracy: 0.5,
        timeSpent_ms: 12_000,
        wordsAttempted: 2,
        correctWords: [correctTarget],
        missedWords: [missedTarget],
        targetResults: [
          {
            target: correctTarget,
            correct: true,
            attempts: 1,
            responseTime_ms: 900,
          },
          {
            target: missedTarget,
            correct: false,
            attempts: 2,
            responseTime_ms: 3_200,
            scaffoldLevel: 1,
          },
        ],
      };
      const completed = await applyNodeResult(sessionId, result);
      const {
        boardAfter,
        diff: runtimeDiff,
      } = observeRuntimeBoardDiff({
        boardBefore,
        runtimeAfter: snapshotBoard(completed.mapState),
        completedNode: node,
      });
      writeCanonicalAdaptationDiff({ sessionDir: recorder.sessionDir, diff: runtimeDiff });
      recorder.finalize({
        endedAt: new Date(generatedAt),
        result: "completed",
        finalState: {
          childId: CHILD_ID,
          sessionId,
          nodeCompleted: node.id,
        },
        artifacts: {
          proof: "closed-loop-adaptation",
          mapStateCurrentNodeIndex: completed.mapState.currentNodeIndex,
        },
      });
      const postSessionTruthFile = path.join(recorder.sessionDir, "post-session-truth.json");
      const postSessionTruth = writePostSessionTruthPacket(recorder.sessionDir);
      const gameSummaryDir = path.join(recorder.sessionDir, "game-summaries");
      const files = {
        gameTraces: fs.existsSync(path.join(recorder.sessionDir, "game-traces.ndjson")) &&
          fs.statSync(path.join(recorder.sessionDir, "game-traces.ndjson")).size > 0,
        gameSummary: fs.existsSync(gameSummaryDir) && fs.readdirSync(gameSummaryDir).length > 0,
        postSessionTruth: fs.existsSync(postSessionTruthFile),
        adaptationDiff: fs.existsSync(path.join(recorder.sessionDir, "adaptation-diff.json")),
      };
      const failures = [
        ...(!files.gameTraces ? ["game-traces.ndjson was not written"] : []),
        ...(!files.gameSummary ? ["game summary was not written"] : []),
        ...(!files.postSessionTruth ? ["post-session-truth.json was not written"] : []),
        ...(!files.adaptationDiff ? ["adaptation-diff.json was not written"] : []),
        ...(runtimeDiff.changedNodeIds.length === 0 ? ["no canonical next board diff"] : []),
        ...(!runtimeDiff.nextTargets.includes(missedTarget)
          ? [`missed target ${missedTarget} did not appear in next targets`]
          : []),
        ...(postSessionTruth.adaptationDecision.status !== "changed"
          ? ["post-session truth did not mark adaptation changed"]
          : []),
      ];
      const trajectories: ClosedLoopProofTrajectory[] = [];
      trajectories.push(
        await runTrajectoryProof({
          rootDir,
          labDir,
          generatedAt,
          id: "worsening_child",
          direction: "worse",
          expectedBoardMove: "route_support",
          resultForNode: (trajectoryNode) => {
            const words = trajectoryNode.words ?? [];
            const first = words[0] ?? "above";
            const second = words[1] ?? "again";
            const third = words[2] ?? "around";
            return {
              nodeId: trajectoryNode.id,
              activityId: trajectoryNode.type,
              completed: true,
              accuracy: 1 / 3,
              timeSpent_ms: 16_000,
              wordsAttempted: 3,
              correctWords: [first],
              missedWords: [second, third],
              targetResults: [
                { target: first, correct: true, attempts: 1, responseTime_ms: 900 },
                { target: second, correct: false, attempts: 2, responseTime_ms: 3_700, scaffoldLevel: 1 },
                { target: third, correct: false, attempts: 3, responseTime_ms: 5_400, scaffoldLevel: 2 },
              ],
            };
          },
        }),
      );
      trajectories.push(
        await runTrajectoryProof({
          rootDir,
          labDir,
          generatedAt,
          id: "improving_child",
          direction: "better",
          expectedBoardMove: "increase_challenge_or_skip_repetition",
          resultForNode: (trajectoryNode) => {
            const words = trajectoryNode.words ?? [];
            const first = words[0] ?? "above";
            const second = words[1] ?? "again";
            const third = words[2] ?? "around";
            return {
              nodeId: trajectoryNode.id,
              activityId: trajectoryNode.type,
              completed: true,
              accuracy: 1,
              timeSpent_ms: 7_500,
              wordsAttempted: 3,
              correctWords: [first, second, third],
              missedWords: [],
              targetResults: [
                { target: first, correct: true, attempts: 1, responseTime_ms: 1_500 },
                { target: second, correct: true, attempts: 1, responseTime_ms: 950 },
                { target: third, correct: true, attempts: 1, responseTime_ms: 650 },
              ],
            };
          },
        }),
      );
      const report: ClosedLoopAdaptationProofReport = {
        reportVersion: 1,
        proved: failures.length === 0 && trajectories.every((trajectory) => trajectory.proved),
        childId: CHILD_ID,
        generatedAt,
        labDir,
        sessionDir: recorder.sessionDir,
        selectedMissTarget: missedTarget,
        nodeCompleted: {
          id: node.id,
          type: node.type,
        },
        evidence: {
          correctTargets: [correctTarget],
          missedTargets: [missedTarget],
        },
        runtimeDiff,
        boardBefore,
        boardAfter,
        trajectories,
        postSessionTruth,
        files,
        failures: [
          ...failures,
          ...trajectories.flatMap((trajectory) =>
            trajectory.failures.map((failure) => `${trajectory.id}: ${failure}`),
          ),
        ],
      };
      writeJson(path.join(labDir, "closed-loop-report.json"), report);
      fs.writeFileSync(path.join(labDir, "closed-loop-report.md"), renderMarkdown(report), "utf8");
      return report;
    } finally {
      unregisterActiveVoiceSessionManager(CHILD_ID, proofSession);
    }
  });
}
