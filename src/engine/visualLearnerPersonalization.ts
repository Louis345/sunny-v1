import type { LearningProfile } from "../context/schemas/learningProfile";
import { getChildChart } from "../profiles/childChart";
import type { NodeConfig } from "../shared/adventureTypes";

export type ConceptCheckState = "unknown" | "none" | "partial" | "ready" | "mastered";
export type ReusableArtifactStatus = "none" | "candidate" | "reuse" | "revise" | "retire" | "rejected";
export type VisualLearnerTriggerRecommendation =
  | "visual-explainer"
  | "skip-mastered"
  | "skip-not-visual-core"
  | "skip-missing-evidence"
  | "reuse-approved-artifact"
  | "skip-retired-or-rejected";

export type VisualLearnerTriggerInput = {
  hasHomeworkEvidence: boolean;
  domain: string;
  skill: string;
  conceptCheckState: ConceptCheckState;
  reusableArtifactStatus: ReusableArtifactStatus;
};

export type VisualLearnerTriggerDecision = {
  eligible: boolean;
  recommendation: VisualLearnerTriggerRecommendation;
  reason: string;
};

export type VisualLearnerEngagementWrapperId =
  | "whimsical-quest"
  | "competition"
  | "mystery"
  | "cute-chaos"
  | "calm-coach"
  | "strategy";

export type VisualLearnerEngagementWrapper = {
  id: VisualLearnerEngagementWrapperId;
  label: string;
  promptLanguage: string;
};

export type VisualLearnerGenerationContext = {
  child: {
    id: string;
    displayName: string;
    age: number;
    grade: number;
    readability: string;
  };
  companion: {
    id: string;
    displayName: string;
    role: "hint_only";
  };
  homework: {
    homeworkId: string;
    title: string;
    domain: string;
    skill: string;
    topic: string;
    concepts: string[];
    sourceEvidence: string[];
    sourceDocuments: string[];
  };
  conceptCheck: {
    targetConcept: string;
    state: ConceptCheckState;
    accuracy?: number;
    evidenceId?: string;
  };
  trigger: VisualLearnerTriggerDecision;
  engagementWrapper: VisualLearnerEngagementWrapper;
  knownMotivators: string[];
  avoidSignals: string[];
  assumptions: string[];
  falsifyCriteria: string[];
  researchNotes: Array<{
    source: string;
    summary: string;
    url?: string;
  }>;
  parentNote?: string;
  psychologistNote?: string;
  catalog: {
    contentId: string;
    algorithmTargets: string[];
    reuseStatus: "candidate" | "reuse" | "revise" | "retire";
  };
};

export type VisualLearnerContextOptions = {
  rootDir?: string;
  conceptCheck: VisualLearnerGenerationContext["conceptCheck"];
  parentNote?: string;
  psychologistNote?: string;
  researchNotes?: VisualLearnerGenerationContext["researchNotes"];
  reusableArtifactStatus?: ReusableArtifactStatus;
};

export type VisualLearnerRewardInput = {
  completed: boolean;
  recallAccuracy: number;
  frustrationScore: number;
  hintCount: number;
  replayRequested?: boolean;
  positiveChoiceSignal?: boolean;
  transferSupported?: boolean;
};

const VISUAL_CORE_DOMAINS = new Set(["math", "science"]);
const VISUAL_CORE_SKILL_PATTERNS = [
  /geometry/i,
  /spatial/i,
  /measurement/i,
  /fraction/i,
  /place[_ -]?value/i,
  /clock/i,
  /process/i,
  /cause/i,
  /system/i,
];

export const VISUAL_LEARNER_ENGAGEMENT_WRAPPERS: VisualLearnerEngagementWrapper[] = [
  {
    id: "whimsical-quest",
    label: "Whimsical Quest",
    promptLanguage:
      "Make it whimsical, cute, playful, warm, and quest-like. Use wonder and tiny surprises, not academic lecture language.",
  },
  {
    id: "competition",
    label: "Friendly Competition",
    promptLanguage:
      "Make it feel like a friendly challenge with coins, stakes, quick wins, and a chance to beat the board later.",
  },
  {
    id: "mystery",
    label: "Mystery",
    promptLanguage:
      "Make it feel like a mystery reveal where the child notices clues before Sunny reveals the rule.",
  },
  {
    id: "cute-chaos",
    label: "Cute Chaos",
    promptLanguage:
      "Make it cute, energetic, and slightly silly, with playful motion and tiny visual jokes that never distract from the concept.",
  },
  {
    id: "calm-coach",
    label: "Calm Coach",
    promptLanguage:
      "Make it gentle, calm, and confidence-building, with low clutter and one idea at a time.",
  },
  {
    id: "strategy",
    label: "Strategy",
    promptLanguage:
      "Make it feel strategic: compare moves, test a rule, and let the child feel clever for spotting the pattern.",
  },
];

function clamp01(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function sourceDocumentLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "filename" in value) {
    return String((value as { filename?: unknown }).filename ?? "");
  }
  return "";
}

function visualCore(domain: string, skill: string): boolean {
  const normalizedDomain = domain.trim().toLowerCase();
  const normalizedSkill = skill.trim().toLowerCase();
  return VISUAL_CORE_DOMAINS.has(normalizedDomain) &&
    VISUAL_CORE_SKILL_PATTERNS.some((pattern) => pattern.test(normalizedSkill));
}

function unwrapPendingHomework(profile: LearningProfile): NonNullable<LearningProfile["pendingHomework"]> {
  const pending = profile.pendingHomework;
  const captured = pending?.capturedContent;
  const contentProfile = pending?.contentProfile ?? captured?.contentProfile;
  if (!pending || !captured || !contentProfile) {
    throw new Error("visual_learner_missing_homework_evidence");
  }
  return pending;
}

function profileMotivators(profile: LearningProfile): string[] {
  const dimensions = Object.values(profile.activityTraitModel ?? {})
    .filter((entry) => entry.positiveWeight > entry.negativeWeight)
    .sort((a, b) => b.positiveWeight - a.positiveWeight)
    .map((entry) => entry.dimension);
  return [...new Set([...dimensions, ...(profile.rewardPreferences?.favoriteGames ?? [])])].slice(0, 8);
}

function profileAvoidSignals(profile: LearningProfile): string[] {
  return Object.values(profile.activityTraitModel ?? {})
    .filter((entry) => entry.negativeWeight > entry.positiveWeight)
    .sort((a, b) => b.negativeWeight - a.negativeWeight)
    .map((entry) => entry.dimension)
    .slice(0, 5);
}

function defaultResearchNotes(): VisualLearnerGenerationContext["researchNotes"] {
  return [
    {
      source: "WWC math intervention",
      url: "https://ies.ed.gov/ncee/wwc/practiceguide/2",
      summary: "Use visual representations when math intervention needs a concrete model.",
    },
    {
      source: "CMU retrieval practice",
      url: "https://www.cmu.edu/teaching/resources/instructionalstrategies/activelearningstrategies/retrievalpractice/index.html",
      summary: "Follow explanation with feedback-rich retrieval instead of treating the video as mastery proof.",
    },
  ];
}

export function evaluateVisualLearnerTrigger(
  input: VisualLearnerTriggerInput,
): VisualLearnerTriggerDecision {
  if (!input.hasHomeworkEvidence) {
    return {
      eligible: false,
      recommendation: "skip-missing-evidence",
      reason: "Visual Learner requires captured homework evidence before generation.",
    };
  }
  if (input.reusableArtifactStatus === "reuse") {
    return {
      eligible: false,
      recommendation: "reuse-approved-artifact",
      reason: "An approved reusable artifact already covers this concept.",
    };
  }
  if (input.reusableArtifactStatus === "retire" || input.reusableArtifactStatus === "rejected") {
    return {
      eligible: false,
      recommendation: "skip-retired-or-rejected",
      reason: "Prior artifact evidence says this content should not be reused.",
    };
  }
  if (input.conceptCheckState === "mastered" || input.conceptCheckState === "ready") {
    return {
      eligible: false,
      recommendation: "skip-mastered",
      reason: "Concept check already shows enough mastery for practice or transfer.",
    };
  }
  if (!visualCore(input.domain, input.skill)) {
    return {
      eligible: false,
      recommendation: "skip-not-visual-core",
      reason: "The domain or skill is not visual-core enough for a generated explainer.",
    };
  }
  return {
    eligible: true,
    recommendation: "visual-explainer",
    reason: "Homework evidence exists and the visual-core concept is unknown or partial.",
  };
}

export function selectVisualLearnerEngagementWrapper(
  profile: LearningProfile,
  opts: { random?: () => number; epsilon?: number } = {},
): VisualLearnerEngagementWrapper {
  const state = profile.visualLearnerEngagementBanditState;
  const counts = state?.counts ?? {};
  const values = state?.values ?? {};
  const untried = VISUAL_LEARNER_ENGAGEMENT_WRAPPERS.find((wrapper) => (counts[wrapper.id] ?? 0) === 0);
  if (untried) return untried;

  const random = opts.random ?? Math.random;
  const epsilon = opts.epsilon ?? ((profile.sessionStats?.totalSessions ?? 0) < 10 ? 0.3 : 0.1);
  if (random() < epsilon) {
    const index = Math.floor(random() * VISUAL_LEARNER_ENGAGEMENT_WRAPPERS.length);
    return VISUAL_LEARNER_ENGAGEMENT_WRAPPERS[index] ?? VISUAL_LEARNER_ENGAGEMENT_WRAPPERS[0]!;
  }
  return VISUAL_LEARNER_ENGAGEMENT_WRAPPERS.reduce((best, wrapper) =>
    (values[wrapper.id] ?? 0) > (values[best.id] ?? 0) ? wrapper : best,
  VISUAL_LEARNER_ENGAGEMENT_WRAPPERS[0]!);
}

function rewardValue(input: VisualLearnerRewardInput): number {
  const completion = input.completed ? 0.2 : 0;
  const recall = clamp01(input.recallAccuracy) * 0.35;
  const frustration = (1 - clamp01(input.frustrationScore)) * 0.18;
  const hintScore = Math.max(0, 1 - input.hintCount / 4) * 0.12;
  const engagement = (input.replayRequested ? 0.08 : 0) + (input.positiveChoiceSignal ? 0.05 : 0);
  const transfer = input.transferSupported ? 0.02 : 0;
  return round(clamp01(completion + recall + frustration + hintScore + engagement + transfer));
}

export function recordVisualLearnerEngagementReward(
  profile: LearningProfile,
  wrapperId: VisualLearnerEngagementWrapperId,
  reward: VisualLearnerRewardInput,
): LearningProfile {
  const state = profile.visualLearnerEngagementBanditState ?? { counts: {}, values: {} };
  const priorCount = state.counts[wrapperId] ?? 0;
  const priorValue = state.values[wrapperId] ?? 0;
  const nextCount = priorCount + 1;
  const nextValue = round((priorValue * priorCount + rewardValue(reward)) / nextCount);
  return {
    ...profile,
    visualLearnerEngagementBanditState: {
      counts: { ...state.counts, [wrapperId]: nextCount },
      values: { ...state.values, [wrapperId]: nextValue },
    },
  };
}

export function buildVisualLearnerGenerationContext(
  childId: string,
  opts: VisualLearnerContextOptions,
): VisualLearnerGenerationContext {
  const chart = getChildChart(childId, { rootDir: opts.rootDir });
  const pending = unwrapPendingHomework(chart.learningProfile);
  const captured = pending.capturedContent!;
  const contentProfile = pending.contentProfile ?? captured.contentProfile!;
  const knownMotivators = [
    ...new Set([
      ...profileMotivators(chart.learningProfile),
    ]),
  ].slice(0, 8);
  const domain = contentProfile.practiceDomain || contentProfile.contentDomain || captured.type;
  const skill = contentProfile.primarySkill;
  const sourceDocuments = (captured.sourceDocuments ?? [])
    .map(sourceDocumentLabel)
    .filter(Boolean);
  const trigger = evaluateVisualLearnerTrigger({
    hasHomeworkEvidence: true,
    domain,
    skill,
    conceptCheckState: opts.conceptCheck.state,
    reusableArtifactStatus: opts.reusableArtifactStatus ?? "none",
  });
  const wrapper = selectVisualLearnerEngagementWrapper(chart.learningProfile);
  const topic = contentProfile.topic || captured.title;
  const contentId = `visual-learner:${chart.childId}:${safeSlug(topic)}:${safeSlug(opts.conceptCheck.targetConcept)}`;

  return {
    child: {
      id: chart.childId,
      displayName: chart.identity.displayName,
      age: chart.demographics.age,
      grade: chart.demographics.grade,
      readability: `Grade ${chart.demographics.grade}, age ${chart.demographics.age}; short sentences and concrete words.`,
    },
    companion: {
      id: chart.companion.presetId,
      displayName: chart.companion.displayName,
      role: "hint_only",
    },
    homework: {
      homeworkId: pending.homeworkId ?? `pending-${safeSlug(captured.title)}`,
      title: captured.title,
      domain,
      skill,
      topic,
      concepts: [...(contentProfile.concepts ?? [])],
      sourceEvidence: [
        ...(contentProfile.sourceEvidence ?? []),
        ...sourceDocuments,
      ].filter(Boolean),
      sourceDocuments,
    },
    conceptCheck: { ...opts.conceptCheck },
    trigger,
    engagementWrapper: wrapper,
    knownMotivators,
    avoidSignals: profileAvoidSignals(chart.learningProfile),
    assumptions: [
      `${chart.identity.displayName} may need a visual model before independent retrieval on ${topic}.`,
      `The ${wrapper.label} wrapper may increase attention without changing the math target.`,
      "The visual explainer is an intervention, not proof of mastery.",
    ],
    falsifyCriteria: [
      "follow-up co-op recall accuracy below 0.65",
      "high frustration or abandonment",
      "delayed concept-check or graded homework contradicts the in-app result",
    ],
    researchNotes: opts.researchNotes?.length ? opts.researchNotes : defaultResearchNotes(),
    parentNote: opts.parentNote,
    psychologistNote: opts.psychologistNote,
    catalog: {
      contentId,
      algorithmTargets: [
        "visual-modeling",
        "retrieval-practice",
        "error-pattern-remediation",
        "activity-affinity",
      ],
      reuseStatus: "candidate",
    },
  };
}

export function buildVisualLearnerPrompt(context: VisualLearnerGenerationContext): string {
  return [
    `Create a Sunny visual learner artifact for ${context.child.displayName}, age ${context.child.age}, grade ${context.child.grade}.`,
    `Homework: ${context.homework.title}. Topic: ${context.homework.topic}. Skill: ${context.homework.skill}.`,
    `Target concept: ${context.conceptCheck.targetConcept}; concept-check state: ${context.conceptCheck.state}.`,
    `Make it whimsical, cute, fun, engaging, and not academic. ${context.engagementWrapper.promptLanguage}`,
    `Known motivators: ${context.knownMotivators.join(", ") || "unknown"}. Avoid: ${context.avoidSignals.join(", ") || "none observed"}.`,
    "quest narrator speaks; companion does not narrate.",
    "The companion is the outer VRM via _contract.js. The artifact may send companion_anchor and narration_request, but the companion is hint-only unless the child explicitly asks.",
    "Do not put fake companion art or a fake companion speech bubble inside the iframe.",
    "Use parent-preview-only research notes; do not do live search during the child session.",
    "Assumptions to write into the artifact:",
    ...context.assumptions.map((item) => `- ${item}`),
    "Falsifiers:",
    ...context.falsifyCriteria.map((item) => `- ${item}`),
    "Include a co-op recall game config for the next node. The game is where the child and companion take turns.",
    "The visual explainer may pause for one prediction, then continue. Watching alone is not mastery.",
  ].join("\n");
}

export function buildVisualLearnerFeedbackDemoNodes(
  context: VisualLearnerGenerationContext,
): NodeConfig[] {
  const artifactId = "2d-faces-of-3d-solids-cube-square-prism-rectangle-cylinder-cone-circle-b-1778718658762";
  const configPath = `/generated/openai-visual-probe/${artifactId}/artifact.config.json`;
  return [
    {
      id: "visual-demo-concept-check",
      type: "concept-check",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 1,
      activityConfigPath: "/games/demo-configs/visual-learner-solid-faces-concept-check.json",
      contentId: context.catalog.contentId,
      theme: "Baseline Check",
    },
    {
      id: "visual-demo-explainer",
      type: "visual-explainer",
      isLocked: !context.trigger.eligible,
      isCompleted: false,
      isGoal: false,
      difficulty: 1,
      activityConfigPath: configPath,
      contentId: context.catalog.contentId,
      theme: context.engagementWrapper.label,
    },
    {
      id: "visual-demo-coop-recall",
      type: "visual-recall-quiz",
      isLocked: true,
      isCompleted: false,
      isGoal: true,
      difficulty: 2,
      activityConfigPath: configPath,
      contentId: context.catalog.contentId,
      theme: "Co-op Recall",
    },
  ];
}
