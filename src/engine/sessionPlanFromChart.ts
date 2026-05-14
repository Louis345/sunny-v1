import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {
  ActiveSessionPlan,
  ActiveSessionPlanSource,
  LearningProfile,
} from "../context/schemas/learningProfile";
import type { ChildChart } from "../profiles/childChart";
import { buildMysteryChoiceNodeData } from "./mysteryChoicePlanner";
import type { MysteryChoiceOption, NodeConfig, NodeType } from "../shared/adventureTypes";

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

function profilePath(rootDir: string, childId: string): string {
  return path.join(rootDir, "src", "context", childId, "learning_profile.json");
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

function cohortSizeForChart(chart: ChildChart, domain: string, strongEvidence: boolean): number {
  const load = chart.learningProfile.adaptiveLoadState?.[domain];
  const requested = strongEvidence
    ? Math.max(load?.currentCohortSize ?? 10, load?.maxRecentSuccessfulCohort ?? 10, 10)
    : Math.min(load?.currentCohortSize ?? 5, 5);
  return Math.max(1, Math.min(10, requested));
}

function plannedWords(chart: ChildChart, domain: string, cohortSize: number, strongEvidence: boolean): ActiveSessionPlan["wordPlan"] {
  const pending = chart.homework.pending;
  const homeworkWords = uniqueWords(pending?.wordList ?? []);
  const reinforce = uniqueWords(pending?.reinforceWords ?? []);
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

function sourceNodeType(raw: string): NodeType | null {
  return raw as NodeType;
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
  const strongEvidence = strongLoadEvidence(chart, domain);
  const cohortSize = cohortSizeForChart(chart, domain, strongEvidence);
  const wordPlan = plannedWords(chart, domain, cohortSize, strongEvidence);
  const now = input.now ?? new Date();
  const homeworkId = activeHomeworkId(chart);
  const completedCount = pending.completedAdventureNodeIds?.length ?? 0;
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
  const nodePlan: ActiveSessionPlan["nodePlan"] = baselineNodes.map(({ source, type }) => ({
    id: source.id,
    type,
    activityId: type,
    targets: WORD_DRIVEN_NODE_TYPES.has(type) ? [...targets] : [...(source.words ?? [])],
    difficulty: strongEvidence && type === "word-radar" ? 3 : (Math.max(1, Math.min(3, source.difficulty)) as 1 | 2 | 3),
    source: "pending_homework",
  }));

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
      {
        id: `${domain}_adaptive_load`,
        type: "adaptive_load",
        summary: strongEvidence
          ? `Strong ${domain} evidence supports a rotated ${wordPlan.cohortSize}-word challenge.`
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
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        ...profile,
        activeSessionPlan: plan,
        lastUpdated: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
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
  return true;
}

function nodeWords(plan: ActiveSessionPlan): string[] {
  return plan.wordPlan.words.map((word) => word.text);
}

function mysteryFallbackGame(options: MysteryChoiceOption[] | undefined): string | undefined {
  const dopamine = options?.find((option) => option.activityKind === "dopamine_game" && option.gameFile);
  return dopamine?.gameFile;
}

export function buildAdventureMapFromSessionPlan(
  chart: ChildChart,
  plan: ActiveSessionPlan,
  opts: BuildAdventureMapFromSessionPlanOptions = {},
): NodeConfig[] {
  const pending = chart.homework.pending;
  if (!pending) return [];
  const targets = nodeWords(plan);
  const sourceById = new Map(pending.nodes.map((node) => [node.id, node]));
  const sourceByType = new Map<string, typeof pending.nodes[number]>();
  for (const node of pending.nodes) {
    if (!sourceByType.has(node.type)) sourceByType.set(node.type, node);
  }

  const nodes: NodeConfig[] = [];
  for (const planned of plan.nodePlan) {
    if (planned.type === "mystery") {
      const domainValidNodes = nodes.filter(
        (node) => node.type !== "quest" && node.type !== "boss" && node.type !== "mystery",
      );
      const choice = buildMysteryChoiceNodeData({
        childId: chart.childId,
        nodeId: planned.id,
        domain: plan.domain,
        words: planned.targets.length > 0 ? planned.targets : targets,
        profile: chart.learningProfile,
        dopamineGames: opts.dopamineGames ?? chart.companion.config.dopamineGames ?? [],
        domainValidNodes,
        allowSurpriseDrop: planned.choiceMode === "surprise_drop",
        now: opts.now,
      });
      nodes.push({
        id: planned.id,
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
    const artifactPassed = passedArtifact(source);
    if (planned.type === "quest" || planned.type === "boss") {
      nodes.push({
        id: planned.id,
        type: planned.type,
        words: planned.targets,
        difficulty: planned.difficulty,
        gameFile: artifactPassed ? source?.gameFile ?? undefined : undefined,
        storyFile: artifactPassed ? source?.storyFile ?? undefined : undefined,
        date: artifactPassed ? source?.date ?? pending.weekOf : undefined,
        contentId: artifactPassed ? source?.adaptiveArtifact?.contentId : undefined,
        adaptiveArtifact: artifactPassed ? source?.adaptiveArtifact : undefined,
        artifactStatus: artifactPassed ? "ready" : "preparing",
        masteryUnlockState: artifactPassed ? "pending_ceremony" : "preparing",
        isLocked: true,
        isCompleted: false,
        isGoal: false,
      });
      continue;
    }

    const words = isWordDrivenNode(planned.type) ? planned.targets : source?.words ?? [];
    nodes.push({
      id: planned.id,
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

  nodes.forEach((node, index) => {
    node.isGoal = index === nodes.length - 1;
  });
  return nodes;
}
