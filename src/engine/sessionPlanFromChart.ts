import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {
  ActiveSessionPlan,
  ActiveSessionPlanSource,
  LearningProfile,
} from "../context/schemas/learningProfile";
import type { ChildChart } from "../profiles/childChart";
import {
  appendDecisionTrace,
  slimLearningProfileForDoorway,
  writeWaterfallSessionPlan,
} from "../profiles/chartWaterfall";
import { withActiveSessionPlanLane } from "./homeworkLanes";
import { buildMysteryChoiceNodeData } from "./mysteryChoicePlanner";
import {
  createHomeworkEvidenceGate,
  filterHomeworkTargets,
  sanitizeActiveHomeworkPlanForLaunch,
  sanitizeActiveSessionPlanTargets,
} from "../shared/homeworkEvidenceGate";
import { resolveChildContextDir } from "../utils/contextRoot";
import type {
  MasteryUnlockState,
  MysteryChoiceOption,
  NodeConfig,
  NodeType,
  PronunciationNodeConfig,
  WordRadarNodeConfig,
} from "../shared/adventureTypes";

export type PlanHomeworkSessionInput = {
  source: ActiveSessionPlanSource;
  now?: Date;
  parentNote?: string;
};

export type WriteActiveSessionPlanOptions = {
  rootDir?: string;
};

export type BuildAdventureMapFromSessionPlanOptions = {
  dopamineGames?: string[];
  now?: Date;
};

const WORD_DRIVEN_NODE_TYPES = new Set<NodeType>([
  "word-radar",
  "spell-check",
  "monster-stampede",
  "letter-rush",
  "pronunciation",
  "word-builder",
  "wordle",
  "wheel-of-fortune",
]);

const STRONG_SPELLING_ORDER: NodeType[] = [
  "word-radar",
  "monster-stampede",
  "spell-check",
  "pronunciation",
  "letter-rush",
  "word-builder",
  "wordle",
  "wheel-of-fortune",
];

const DEFAULT_NODE_ORDER: NodeType[] = [
  "word-radar",
  "spell-check",
  "monster-stampede",
  "letter-rush",
  "pronunciation",
  "karaoke",
  "word-builder",
  "wordle",
  "wheel-of-fortune",
];

type AdaptivePlanNodeLike = {
  id?: unknown;
  activityId?: unknown;
  nodeType?: unknown;
  mode?: unknown;
  rationale?: unknown;
};

type AdaptivePlanLike = {
  homeworkId?: unknown;
  assertions?: unknown;
  nodes?: unknown;
};

type PlannedEntry = {
  id: string;
  type: NodeType;
  difficulty: 1 | 2 | 3;
  source: "pending_homework" | "chart_planner";
  activityId: string;
};

type ParentPlanConstraint = {
  requirePronunciation: boolean;
  targetLane?: string;
  useAllTargetsFromLane?: boolean;
  targetCount?: number;
};

type HomeworkWordGroup = {
  id?: string | null;
  wordGroupId?: string | null;
  label?: string | null;
  purpose?: string | null;
  words?: string[] | null;
};

function profilePath(rootDir: string, childId: string): string {
  return path.join(resolveChildContextDir(childId, { rootDir }), "learning_profile.json");
}

function normalizeDomain(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_") || "general";
}

function activeHomeworkId(chart: ChildChart): string | undefined {
  return chart.homework.pending?.homeworkId ?? chart.homework.pending?.weekOf;
}

export function activeSessionPlanRefreshReason(
  plan: ActiveSessionPlan | null | undefined,
  pending: NonNullable<ChildChart["homework"]["pending"]>,
  now: Date = new Date(),
): string | null {
  const homeworkId = pending.homeworkId ?? pending.weekOf;
  if (!plan) return "missing_plan";
  if (plan.activeHomeworkId !== homeworkId) {
    return `homework_changed:${plan.activeHomeworkId ?? "none"}->${homeworkId ?? "none"}`;
  }
  if (!plan.planTheory) return "missing_plan_theory";

  const parentApprovedPlan = plan.approvalStatus === "approved" && Boolean(plan.parentNote?.trim());
  if (parentApprovedPlan) {
    const parentMismatch = parentConstraintMismatchReason(plan, pending);
    return parentMismatch;
  }

  const completedCount = pending.completedAdventureNodeIds?.length ?? 0;
  const plannedCompletedCount = plan.variationPolicy?.previousCompletedNodeCount;
  if (plannedCompletedCount !== completedCount) {
    return `node_progress_changed:${plannedCompletedCount ?? "unknown"}->${completedCount}`;
  }

  const plannedDay = plan.createdAt?.slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  if (plannedDay && plannedDay !== today) {
    return `plan_day_changed:${plannedDay}->${today}`;
  }

  return null;
}

function stableHash(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 10);
}

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return [];
  const safeOffset = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(safeOffset), ...items.slice(0, safeOffset)];
}

function uniqueWords(words: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const word = raw.trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

function normalizeLaneKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function homeworkWordGroups(
  pending: NonNullable<ChildChart["homework"]["pending"]>,
): HomeworkWordGroup[] {
  const captured = pending.capturedContent as {
    wordGroups?: HomeworkWordGroup[] | null;
    assignmentInterpretation?: {
      wordGroups?: HomeworkWordGroup[] | null;
    } | null;
  } | null;
  const groups = [
    ...(captured?.assignmentInterpretation?.wordGroups ?? []),
    ...(captured?.wordGroups ?? []),
  ];
  const seen = new Set<string>();
  const out: HomeworkWordGroup[] = [];
  for (const group of groups) {
    const words = uniqueWords(group.words ?? []);
    if (words.length === 0) continue;
    const key = normalizeLaneKey(group.wordGroupId ?? group.id ?? group.label ?? words.join("|"));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...group, words });
  }
  return out;
}

function matchesTargetLane(group: HomeworkWordGroup, targetLane: string): boolean {
  const lane = normalizeLaneKey(targetLane);
  const keys = [
    group.id,
    group.wordGroupId,
    group.label,
    group.purpose,
  ].map(normalizeLaneKey);
  if (keys.some((key) => key === lane)) return true;
  if (lane === "high_frequency_words") {
    return keys.some((key) => key.includes("high_frequency")) ||
      (keys.includes("recognize") && keys.some((key) => key.includes("frequency")));
  }
  return false;
}

function findTargetLaneGroup(
  pending: NonNullable<ChildChart["homework"]["pending"]>,
  targetLane: string | undefined,
): HomeworkWordGroup | null {
  if (!targetLane) return null;
  return homeworkWordGroups(pending).find((group) => matchesTargetLane(group, targetLane)) ?? null;
}

function domainForChart(chart: ChildChart): string {
  const pending = chart.homework.pending;
  return normalizeDomain(
    pending?.contentProfile?.practiceDomain ??
      pending?.capturedContent?.contentProfile?.practiceDomain ??
      pending?.contentProfile?.contentDomain ??
      "homework",
  );
}

function strongLoadEvidence(chart: ChildChart, domain: string): boolean {
  const load = chart.learningProfile.adaptiveLoadState?.[domain];
  if (!load) return false;
  return (
    load.lastLoadEvidence.completed === true &&
    load.lastLoadEvidence.accuracy >= 0.85 &&
    load.lastLoadEvidence.targetCount >= 5 &&
    load.lastLoadEvidence.frustrationScore < 0.35 &&
    load.lastLoadEvidence.strongEvidence === true
  );
}

function daysUntilTest(testDate: string | null | undefined, now: Date): number | null {
  if (!testDate) return null;
  const parsed = new Date(`${testDate.slice(0, 10)}T23:59:59.999Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.ceil((parsed.getTime() - now.getTime()) / 86_400_000);
}

function completedBaselineNodeCount(chart: ChildChart): number {
  const completed = chart.homework.pending?.completedAdventureNodeIds ?? [];
  return completed.filter((id) =>
    /word-radar|spell-check|monster-stampede|pronunciation|letter-rush|word-builder|wordle|wheel-of-fortune/.test(
      id,
    ),
  ).length;
}

function cohortSizeForChart(chart: ChildChart, domain: string, strongEvidence: boolean): number {
  const load = chart.learningProfile.adaptiveLoadState?.[domain];
  const requested = strongEvidence
    ? Math.max(load?.currentCohortSize ?? 10, load?.maxRecentSuccessfulCohort ?? 10, 10)
    : Math.min(load?.currentCohortSize ?? 5, 5);
  return Math.max(1, Math.min(10, requested));
}

function plannedWords(chart: ChildChart, domain: string, cohortSize: number, strongEvidence: boolean): ActiveSessionPlan["wordPlan"] {
  const pending = chart.homework.pending;
  const gate = createHomeworkEvidenceGate(pending);
  const homeworkWords = uniqueWords(pending?.wordList ?? []);
  const reinforce = filterHomeworkTargets(
    gate,
    uniqueWords(pending?.reinforceWords ?? []),
    { logPrefix: "  🎮" },
  ).accepted;
  const completedCount = pending?.completedAdventureNodeIds?.length ?? 0;
  const rotation = strongEvidence ? Math.max(1, completedCount) : 0;
  const rotated = rotate(homeworkWords, rotation);
  const merged = uniqueWords([...reinforce, ...rotated]).slice(0, cohortSize);
  const purpose = reinforce.length > 0 ? "reinforce" : strongEvidence ? "challenge" : "baseline";
  return {
    cohortSize: merged.length,
    orderStrategy: strongEvidence
      ? "chart_seeded_rotation"
      : reinforce.length > 0
        ? "targeted_support"
        : "homework_order",
    words: merged.map((word) => ({
      text: word,
      purpose,
      reason:
        purpose === "challenge"
          ? `Strong ${domain} evidence supports a larger, rotated cohort.`
          : purpose === "reinforce"
            ? "Recent node evidence asked for targeted support."
            : "Baseline homework evidence starts the session.",
    })),
  };
}

function nodeTypeRank(type: NodeType, strongEvidence: boolean): number {
  const order = strongEvidence ? STRONG_SPELLING_ORDER : DEFAULT_NODE_ORDER;
  const idx = order.indexOf(type);
  return idx >= 0 ? idx : order.length;
}

function parentPlanConstraint(note: string | undefined): ParentPlanConstraint {
  const text = note?.toLowerCase() ?? "";
  const countMatch =
    text.match(/\b(?:use|handle|target|practice|do)\s+(\d{1,2})\s+(?:words?|targets?)\b/) ??
    text.match(/\b(\d{1,2})\s+(?:words?|targets?)\b/);
  const count = countMatch?.[1] ? Number(countMatch[1]) : undefined;
  const wantsHighFrequency = /\bhigh[-\s]?frequency\b|\bsight\s+words?\b/.test(text);
  const wantsAllTargets = /\ball\b/.test(text);
  return {
    requirePronunciation: /\bpronunciation\b|\bpronounce\b|\bpronunication\b/.test(text),
    ...(wantsHighFrequency ? { targetLane: "high_frequency_words" } : {}),
    ...(wantsHighFrequency && wantsAllTargets ? { useAllTargetsFromLane: true } : {}),
    ...(Number.isFinite(count) ? { targetCount: Math.max(1, Math.min(12, count!)) } : {}),
  };
}

function wordKeySet(words: string[]): Set<string> {
  return new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean));
}

function parentConstraintMismatchReason(
  plan: ActiveSessionPlan,
  pending: NonNullable<ChildChart["homework"]["pending"]>,
): string | null {
  const constraint = parentPlanConstraint(plan.parentNote);
  if (!constraint.requirePronunciation) return null;
  const pronunciation = plan.nodePlan.find((node) => node.type === "pronunciation");
  if (!pronunciation) return "parent_constraint_mismatch:pronunciation_required";
  if (plan.nodePlan[0]?.type !== "pronunciation") {
    return "parent_constraint_mismatch:pronunciation_first";
  }
  const lane = findTargetLaneGroup(pending, constraint.targetLane);
  if (!lane?.words?.length) return null;
  const laneKey = normalizeLaneKey(lane.wordGroupId ?? lane.id ?? constraint.targetLane);
  const expected = uniqueWords(lane.words);
  const expectedKeys = wordKeySet(expected);
  const targetKeys = wordKeySet(pronunciation.targets);
  const allTargetsFromLane = pronunciation.targets.every((word) => expectedKeys.has(word.trim().toLowerCase()));
  const hasWrongLane =
    pronunciation.targetLane !== laneKey &&
    pronunciation.targetLane !== constraint.targetLane;
  const missingAllLaneTargets =
    constraint.useAllTargetsFromLane === true &&
    expected.some((word) => !targetKeys.has(word.trim().toLowerCase()));
  if (hasWrongLane || !allTargetsFromLane || missingAllLaneTargets) {
    return constraint.targetLane === "high_frequency_words"
      ? "parent_constraint_mismatch:pronunciation_high_frequency"
      : `parent_constraint_mismatch:pronunciation_${constraint.targetLane ?? "target_lane"}`;
  }
  return null;
}

function wordRadarConfigForEvidence(input: {
  strongEvidence: boolean;
  priorEvidence: boolean;
  daysToTest: number | null;
}): WordRadarNodeConfig {
  const imminentTest = input.daysToTest != null && input.daysToTest <= 2;
  if (input.strongEvidence || (input.priorEvidence && imminentTest)) {
    return {
      recallMode: "hidden_word_recall",
      inputMode: "whole-word",
      speakStyle: "option-b",
      showTimer: true,
      timerSeconds: imminentTest ? 10 : 8,
      hideWordDuringResponse: true,
      requiresCapturedResponse: true,
    };
  }
  return {
    recallMode: "partial_visual_recall",
    inputMode: "whole-word",
    speakStyle: "option-a",
    showTimer: false,
    hideWordDuringResponse: true,
    requiresCapturedResponse: true,
  };
}

function safeWordRadarConfigForLaunch(
  config: WordRadarNodeConfig | undefined,
): WordRadarNodeConfig | undefined {
  if (!config) return undefined;
  if (config.recallMode !== "visible_read" && config.hideWordDuringResponse !== false) {
    return config;
  }
  return {
    ...config,
    recallMode: config.recallMode === "visible_read" ? "partial_visual_recall" : config.recallMode,
    hideWordDuringResponse: true,
    requiresCapturedResponse: true,
  };
}

function pronunciationConfigForEvidence(input: {
  homeworkWordCount: number;
  cohortSize: number;
  strongEvidence: boolean;
  requestedWordCount?: number;
}): PronunciationNodeConfig {
  const requested = Number(input.requestedWordCount);
  const hasRequested = Number.isFinite(requested) && requested > 0;
  const available = Math.max(1, input.homeworkWordCount || input.cohortSize);
  const maxWordCount = Math.min(12, available);
  const baseWordCount = hasRequested
    ? Math.min(maxWordCount, Math.max(1, Math.round(requested)))
    : input.strongEvidence
    ? Math.min(maxWordCount, Math.max(8, input.cohortSize))
    : Math.min(maxWordCount, Math.max(5, Math.min(input.cohortSize, 5)));
  const targetFlowWordCount = hasRequested
    ? baseWordCount
    : input.strongEvidence
    ? Math.min(maxWordCount, Math.max(baseWordCount, 10))
    : Math.min(maxWordCount, Math.max(baseWordCount, 8));

  return {
    baseWordCount,
    targetFlowWordCount,
    maxWordCount,
    expansionPolicy: "on_mastery_or_child_replay",
    masteryGate: {
      accuracyAtLeast: 0.85,
      minStreak: 5,
      noFrustrationSignal: true,
    },
    supportPolicy: "slow_on_help_or_repeated_miss",
  };
}

function sourceNodeType(raw: string): NodeType | null {
  return raw as NodeType;
}

function safePlanIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-") || "homework";
}

function adaptivePlanFromPending(
  pending: NonNullable<ChildChart["homework"]["pending"]>,
): AdaptivePlanLike | null {
  for (const node of pending.nodes) {
    const candidate = (node as { adaptivePlan?: unknown }).adaptivePlan;
    if (!candidate || typeof candidate !== "object") continue;
    const plan = candidate as AdaptivePlanLike;
    if (Array.isArray(plan.nodes) && plan.nodes.length > 0) return plan;
  }
  return null;
}

function adaptiveNodeType(node: AdaptivePlanNodeLike): NodeType | null {
  const raw = typeof node.nodeType === "string"
    ? node.nodeType
    : typeof node.activityId === "string"
      ? node.activityId
      : "";
  return raw ? sourceNodeType(raw) : null;
}

export function planHomeworkSessionFromChart(
  chart: ChildChart,
  input: PlanHomeworkSessionInput,
): ActiveSessionPlan {
  const pending = chart.homework.pending;
  if (!pending) {
    throw new Error(`Cannot plan homework session without pending homework for ${chart.childId}`);
  }
  const domain = domainForChart(chart);
  const now = input.now ?? new Date();
  const completedCount = pending.completedAdventureNodeIds?.length ?? 0;
  const baselineCompletedCount = completedBaselineNodeCount(chart);
  const priorEvidence = baselineCompletedCount > 0;
  const daysToTest = daysUntilTest(pending.testDate ?? null, now);
  const strongEvidence =
    strongLoadEvidence(chart, domain) ||
    (baselineCompletedCount >= 2 && (daysToTest == null || daysToTest <= 3));
  const parentConstraint = parentPlanConstraint(input.parentNote);
  const cohortSize = parentConstraint.targetCount ?? cohortSizeForChart(chart, domain, strongEvidence);
  const wordPlan = plannedWords(chart, domain, cohortSize, strongEvidence);
  const homeworkId = activeHomeworkId(chart);
  const seed = stableHash([
    chart.childId,
    homeworkId ?? "homework",
    now.toISOString().slice(0, 10),
    completedCount,
    input.parentNote ?? "",
  ].join("|"));

  const baselineNodes = pending.nodes
    .map((node) => ({ source: node, type: sourceNodeType(node.type) }))
    .filter((entry): entry is { source: typeof pending.nodes[number]; type: NodeType } =>
      Boolean(entry.type && entry.type !== "quest" && entry.type !== "boss" && entry.type !== "mystery"),
    )
    .sort((a, b) => nodeTypeRank(a.type, strongEvidence) - nodeTypeRank(b.type, strongEvidence));

  const targets = wordPlan.words.map((word) => word.text);
  const allHomeworkTargets = uniqueWords([
    ...targets,
    ...rotate(uniqueWords(pending.wordList ?? []), strongEvidence ? Math.max(1, completedCount) : 0),
  ]);
  const parentTargetGroup = findTargetLaneGroup(pending, parentConstraint.targetLane);
  const parentTargetLane = parentTargetGroup
    ? normalizeLaneKey(parentTargetGroup.wordGroupId ?? parentTargetGroup.id ?? parentConstraint.targetLane)
    : parentConstraint.targetLane;
  const pronunciationRequestedTargets = parentTargetGroup?.words?.length
    ? uniqueWords(parentTargetGroup.words)
    : allHomeworkTargets;
  const pronunciationTargetCount =
    parentConstraint.targetCount ??
    (parentConstraint.useAllTargetsFromLane ? pronunciationRequestedTargets.length : undefined);
  const pronunciationTargets = uniqueWords(pronunciationRequestedTargets)
    .slice(0, pronunciationTargetCount ?? pronunciationRequestedTargets.length);
  const pronunciationConfig = pronunciationConfigForEvidence({
    homeworkWordCount: pronunciationTargets.length || uniqueWords(pending.wordList ?? []).length,
    cohortSize: wordPlan.cohortSize,
    strongEvidence,
    requestedWordCount: pronunciationTargetCount,
  });
  const adaptivePlan = adaptivePlanFromPending(pending);
  const adaptiveNodes = Array.isArray(adaptivePlan?.nodes)
    ? (adaptivePlan.nodes as AdaptivePlanNodeLike[])
      .map((node) => ({ source: node, type: adaptiveNodeType(node) }))
      .filter((entry): entry is { source: AdaptivePlanNodeLike; type: NodeType } =>
        Boolean(entry.type && entry.type !== "quest" && entry.type !== "boss" && entry.type !== "mystery"),
      )
    : [];
  const planEntries: PlannedEntry[] = adaptiveNodes.length > 0
    ? adaptiveNodes.map((entry) => ({
        id: `n-${safePlanIdPart(String(entry.source.id ?? entry.type))}-${safePlanIdPart(homeworkId ?? "homework")}`,
        type: entry.type,
        difficulty: entry.source.mode === "mastery-run" ? 2 : 1,
        source: "chart_planner" as const,
        activityId: typeof entry.source.activityId === "string" && entry.source.activityId.trim()
          ? entry.source.activityId.trim()
          : entry.type,
      }))
    : baselineNodes.map(({ source, type }) => ({
        id: source.id,
        type,
        difficulty: Math.max(1, Math.min(3, source.difficulty)) as 1 | 2 | 3,
        source: "pending_homework" as const,
        activityId: type,
      }));
  if (parentConstraint.requirePronunciation && !planEntries.some((entry) => entry.type === "pronunciation")) {
    planEntries.unshift({
      id: `n-pronunciation-${safePlanIdPart(homeworkId ?? "homework")}`,
      type: "pronunciation",
      difficulty: 1,
      source: "chart_planner",
      activityId: "pronunciation",
    });
  } else if (parentConstraint.requirePronunciation) {
    planEntries.sort((a, b) => a.type === "pronunciation" ? -1 : b.type === "pronunciation" ? 1 : 0);
  }
  const nodePlan: ActiveSessionPlan["nodePlan"] = planEntries.map((entry) => {
    const type = entry.type;
    const plannedTargets =
      type === "pronunciation"
        ? pronunciationTargets.slice(0, pronunciationConfig.maxWordCount)
        : WORD_DRIVEN_NODE_TYPES.has(type)
          ? [...targets]
          : [...targets];
    return {
      id: entry.id,
      type,
      activityId: entry.activityId,
      targets: plannedTargets,
      difficulty: strongEvidence && type === "word-radar" ? 3 : entry.difficulty,
      source: entry.source,
      ...(type === "pronunciation" && parentTargetLane ? { targetLane: parentTargetLane } : {}),
      ...(type === "word-radar"
        ? { wordRadarConfig: wordRadarConfigForEvidence({ strongEvidence, priorEvidence, daysToTest }) }
        : {}),
      ...(type === "pronunciation"
        ? { pronunciationConfig }
        : {}),
    };
  });

  nodePlan.push({
    id: `n-mystery-${homeworkId ?? "homework"}`,
    type: "mystery",
    activityId: "mystery",
    targets: [...targets],
    difficulty: 2,
    source: "chart_planner",
    choiceMode: "choice_lab",
    choiceSource: "child_choice",
    locked: false,
  });

  for (const type of ["quest", "boss"] as const) {
    const source = pending.nodes.find((node) => node.type === type);
    nodePlan.push({
      id: source?.id ?? `n-${type}-${homeworkId ?? "homework"}`,
      type,
      activityId: type,
      targets: type === "quest" ? [...targets] : [],
      difficulty: type === "boss" ? 3 : 2,
      source: source ? "pending_homework" : "chart_planner",
      masteryUnlockState: source?.adaptiveArtifact?.validationStatus === "passed"
        ? "pending_ceremony"
        : "preparing",
      locked: true,
    });
  }

  return {
    planId: `session_plan_${chart.childId}_${homeworkId ?? "homework"}_${seed}`,
    childId: chart.childId,
    createdAt: now.toISOString(),
    source: input.source,
    activeHomeworkId: homeworkId,
    domain,
    testDate: pending.testDate ?? null,
    parentNote: input.parentNote,
    wordPlan,
    nodePlan,
    variationPolicy: {
      avoidExactPreviousNodeOrder: strongEvidence,
      avoidExactPreviousWordOrder: strongEvidence,
      seed,
      previousCompletedNodeCount: completedCount,
    },
    companionPolicy: {
      companionId: chart.companion.presetId,
      displayName: chart.companion.displayName,
      openingLinePolicy: "context_start_short",
      verbosity: "low",
      maxMicroProbes: 1,
    },
    evidenceUsed: [
      {
        id: homeworkId ?? "pending_homework",
        type: "pending_homework",
        summary: `${pending.wordList.length} homework word(s), test date ${pending.testDate ?? "unknown"}.`,
      },
      ...(adaptiveNodes.length > 0
        ? [{
            id: String(adaptivePlan?.homeworkId ?? homeworkId ?? "adaptive_homework_plan"),
            type: "adaptive_homework_plan",
            summary: `Chart-attached adaptive plan supplied ${adaptiveNodes.length} intervention node(s).`,
          }]
        : []),
      {
        id: `${domain}_adaptive_load`,
        type: "adaptive_load",
        summary: strongEvidence
          ? `Strong ${domain} evidence supports a rotated ${wordPlan.cohortSize}-word challenge.`
          : priorEvidence && daysToTest != null && daysToTest <= 2
            ? `Prior ${domain} baseline evidence plus an imminent test supports harder recall.`
          : `Weak or incomplete ${domain} evidence keeps the cohort small.`,
      },
    ],
    openQuestions: input.parentNote ? [`Parent note: ${input.parentNote}`] : [],
  };
}

export function writeActiveSessionPlan(
  childId: string,
  plan: ActiveSessionPlan,
  opts: WriteActiveSessionPlanOptions = {},
): void {
  const rootDir = opts.rootDir ?? process.cwd();
  const file = profilePath(rootDir, childId.trim().toLowerCase());
  const profile = JSON.parse(fs.readFileSync(file, "utf8")) as LearningProfile;
  const nextProfile = withActiveSessionPlanLane(profile, plan);
  const persistedProfile = {
    ...nextProfile,
    lastUpdated: new Date().toISOString(),
  };
  fs.writeFileSync(
    file,
    JSON.stringify(slimLearningProfileForDoorway(persistedProfile), null, 2),
    "utf8",
  );
  writeWaterfallSessionPlan(childId.trim().toLowerCase(), persistedProfile, opts);
  appendDecisionTrace(childId.trim().toLowerCase(), {
    traceId: `trace-session-plan-${plan.planId}`,
    eventType: "session_plan_write",
    evidenceRead: plan.evidenceUsed.map((item) => item.id),
    theoryUsed: plan.planTheory?.hypothesis,
    changeSummary: `Active session plan set to ${plan.planId}.`,
    reason: `Plan source ${plan.source} selected ${plan.nodePlan.length} node(s).`,
    writesTo: [
      file,
      path.join(resolveChildContextDir(childId.trim().toLowerCase(), { rootDir }), "plans", "active_session_plan.json"),
      path.join(resolveChildContextDir(childId.trim().toLowerCase(), { rootDir }), "care_plan", "current.json"),
    ],
    createdAt: new Date().toISOString(),
  }, opts);
  console.log(
    `🎮 [chart-plan] [write] child=${plan.childId} homework=${plan.activeHomeworkId ?? "none"} source=${plan.source}`,
  );
}

function isWordDrivenNode(type: NodeType): boolean {
  return WORD_DRIVEN_NODE_TYPES.has(type);
}

function passedArtifact(node: NonNullable<ChildChart["homework"]["pending"]>["nodes"][number] | undefined): boolean {
  const artifact = node?.adaptiveArtifact;
  if (!artifact) return false;
  if (artifact.validationStatus !== "passed") return false;
  if (artifact.validationReport && artifact.validationReport.passed !== true) return false;
  if (artifact.validationReport?.runtimeValidation?.passed !== true) return false;
  return true;
}

function nodeWords(plan: ActiveSessionPlan): string[] {
  return plan.wordPlan.words.map((word) => word.text);
}

function mysteryFallbackGame(options: MysteryChoiceOption[] | undefined): string | undefined {
  const dopamine = options?.find((option) => option.activityKind === "dopamine_game" && option.gameFile);
  return dopamine?.gameFile;
}

function masteryNodeConfig(input: {
  type: "quest" | "boss";
  id: string;
  targets: string[];
  difficulty: 1 | 2 | 3;
  source: NonNullable<ChildChart["homework"]["pending"]>["nodes"][number] | undefined;
  pendingWeekOf?: string;
  masteryUnlockState?: MasteryUnlockState;
}): NodeConfig {
  const artifactPassed = passedArtifact(input.source);
  return {
    id: input.id,
    type: input.type,
    words: input.targets,
    difficulty: input.difficulty,
    gameFile: artifactPassed ? input.source?.gameFile ?? undefined : undefined,
    storyFile: artifactPassed ? input.source?.storyFile ?? undefined : undefined,
    date: artifactPassed ? input.source?.date ?? input.pendingWeekOf : undefined,
    contentId: artifactPassed ? input.source?.adaptiveArtifact?.contentId : undefined,
    adaptiveArtifact: artifactPassed ? input.source?.adaptiveArtifact : undefined,
    artifactStatus: artifactPassed ? "ready" : "preparing",
    masteryUnlockState: artifactPassed ? "pending_ceremony" : input.masteryUnlockState ?? "preparing",
    isLocked: true,
    isCompleted: false,
    isGoal: false,
  };
}

export function buildAdventureMapFromSessionPlan(
  chart: ChildChart,
  plan: ActiveSessionPlan,
  opts: BuildAdventureMapFromSessionPlanOptions = {},
): NodeConfig[] {
  const pending = chart.homework.pending;
  if (!pending) return [];
  const scopedPlan = sanitizeActiveSessionPlanTargets(pending, plan);
  const targets = nodeWords(scopedPlan);
  const sourceById = new Map(pending.nodes.map((node) => [node.id, node]));
  const sourceByType = new Map<string, typeof pending.nodes[number]>();
  for (const node of pending.nodes) {
    if (!sourceByType.has(node.type)) sourceByType.set(node.type, node);
  }

  const nodes: NodeConfig[] = [];
  for (const planned of scopedPlan.nodePlan) {
    if (planned.type === "mystery") {
      const domainValidNodes = nodes.filter(
        (node) => node.type !== "quest" && node.type !== "boss" && node.type !== "mystery",
      );
      const choice = buildMysteryChoiceNodeData({
        childId: chart.childId,
        nodeId: planned.id,
        domain: scopedPlan.domain,
        words: planned.targets.length > 0 ? planned.targets : targets,
        profile: chart.learningProfile,
        dopamineGames: opts.dopamineGames ?? chart.companion.config.dopamineGames ?? [],
        domainValidNodes,
        allowSurpriseDrop: planned.choiceMode === "surprise_drop",
        now: opts.now,
      });
      nodes.push({
        id: planned.id,
        planId: plan.planId,
        type: "mystery",
        words: planned.targets.length > 0 ? planned.targets : targets,
        difficulty: planned.difficulty,
        gameFile: mysteryFallbackGame(choice.choiceOptions),
        isLocked: planned.locked ?? false,
        isCompleted: false,
        isGoal: false,
        ...choice,
      });
      continue;
    }

    const source = sourceById.get(planned.id) ?? sourceByType.get(planned.type);
    if (planned.type === "quest" || planned.type === "boss") {
      nodes.push(masteryNodeConfig({
        type: planned.type,
        id: planned.id,
        targets: planned.targets,
        difficulty: planned.difficulty,
        source,
        pendingWeekOf: pending.weekOf,
        masteryUnlockState: planned.masteryUnlockState,
      }));
      continue;
    }

    const words = isWordDrivenNode(planned.type) ? planned.targets : source?.words ?? [];
    nodes.push({
      id: planned.id,
      planId: plan.planId,
      type: planned.type,
      words,
      wordRadarItems:
        planned.type === "word-radar"
          ? words.map((word) => ({
              display: word,
              acceptedResponses: [word.toLowerCase()],
              label: "Spelling",
            }))
          : source?.wordRadarItems,
      wordRadarConfig:
        planned.type === "word-radar"
          ? safeWordRadarConfigForLaunch(planned.wordRadarConfig)
          : undefined,
      pronunciationConfig: planned.type === "pronunciation" ? planned.pronunciationConfig : undefined,
      targetLane: planned.targetLane,
      difficulty: planned.difficulty,
      gameFile: source?.gameFile ?? undefined,
      storyFile: source?.storyFile ?? undefined,
      storyText: source?.storyText,
      storyTitle: source?.storyTitle,
      storyImagePrompt: source?.storyImagePrompt,
      activityConfigPath: source?.activityConfigPath,
      date: source?.date ?? pending.weekOf,
      isLocked: planned.locked ?? false,
      isCompleted: false,
      isGoal: false,
    });
  }

  for (const type of ["quest", "boss"] as const) {
    if (nodes.some((node) => node.type === type)) continue;
    const source = sourceByType.get(type);
    nodes.push(masteryNodeConfig({
      type,
      id: source?.id ?? `n-${type}-${scopedPlan.activeHomeworkId ?? "homework"}`,
      targets: type === "quest" ? [...targets] : [],
      difficulty: type === "boss" ? 3 : 2,
      source,
      pendingWeekOf: pending.weekOf,
      masteryUnlockState: "preparing",
    }));
  }

  nodes.forEach((node, index) => {
    node.isGoal = index === nodes.length - 1;
  });
  return sanitizeActiveHomeworkPlanForLaunch(pending, nodes);
}
