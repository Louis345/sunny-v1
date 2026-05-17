import fs from "fs";
import path from "path";
import type {
  ActivityPurpose,
  AIContentCatalogItem,
  AttentionModel,
  LearningProfile,
} from "../context/schemas/learningProfile";
import { getChildChart } from "../profiles/childChart";
import {
  hydrateLearningProfileFromWaterfall,
  slimLearningProfileForDoorway,
} from "../profiles/chartWaterfall";
import { resolveChildContextDir } from "../utils/contextRoot";

export type AttentionDemand = "none" | "low" | "medium" | "high";

export type AttentionFeedbackPolicy = {
  practice: "corrective_audio_visual";
  measured: "neutral_audio_only" | "silent";
  results: "reward_summary";
};

export type AttentionAudioProfile = {
  practiceCorrect: "soft_chime";
  practiceMiss: "gentle_miss";
  measuredResponse: "neutral_tap";
  measuredAdvance: "neutral_advance";
  resultsComplete: "completion_chime";
  ambient: "off" | "low_loop";
};

export type AttentionTaskMetadata = {
  taskId: string;
  purpose: "attention_screening";
  activityFile: string;
  measures: string[];
  cognitiveLoad: "low" | "medium" | "high";
  ruleBurden: "low" | "medium" | "high";
  readingDemand: AttentionDemand;
  motorDemand: "low" | "medium" | "high";
  bestFor: string[];
  avoidWhen: string[];
  wrappers: string[];
  sensoryLoad: "low" | "medium" | "high";
  rewardDensity: "none" | "low" | "medium" | "high";
  feedbackPolicy: AttentionFeedbackPolicy;
  audioProfile: AttentionAudioProfile;
  profileConfigKeys: string[];
  transitionPolicy: AttentionTransitionPolicy;
};

export type AttentionSignal = {
  childId?: string;
  sessionId: string;
  activityId: string;
  purpose:
    | "attention_screening"
    | "attention_intervention"
    | "hybrid_learning_attention"
    | "dopamine_reward";
  startedAt: string;
  endedAt: string;
  activeDuration_ms: number;
  idleEvents: number;
  abandonments: number;
  reengagements: number;
  omissions?: number;
  commissions?: number;
  meanReactionTime_ms?: number;
  reactionTimeVariability?: number;
  dropoff?: number;
  accuracyOverTime?: Array<{ elapsed_ms: number; accuracy: number }>;
  frustrationSignals: string[];
  flowSignals: string[];
  practiceGate?: {
    passed: boolean;
    accuracy: number;
  };
};

export type AttentionTaskChoiceInput = {
  careQuestion: string;
  avoidReadingDemand?: boolean;
  avoidTaskIds?: string[];
};

export type AttentionTaskRuntimeConfig = {
  taskId: string;
  childPacing: {
    trialCount: number;
    practiceTrials: number;
    stimulusDuration_ms: number;
    maxFocusedWindow_ms: number;
  };
  wrapper: string;
  sensoryLoad: "low" | "medium" | "high";
  rewardDensity: "none" | "low" | "medium" | "high";
  feedbackPolicy: AttentionFeedbackPolicy;
  audioProfile: AttentionAudioProfile;
  companionDuringTrials: "hidden" | "quiet";
  transitionPolicy: AttentionTransitionPolicy;
};

export type AttentionTransitionPolicy = {
  practicePassAccuracy: number;
  maxPracticeRepeats: number;
  onPass: "start_measured_trials";
  onFail: "mark_invalid_and_return";
  companionDuringPractice: "instruct";
  companionDuringMeasurement: "hidden";
};

export type AttentionTaskSelection = {
  task: AttentionTaskMetadata;
  reason: string;
  config: AttentionTaskRuntimeConfig;
};

const DEFAULT_TRANSITION_POLICY: AttentionTransitionPolicy = {
  practicePassAccuracy: 0.75,
  maxPracticeRepeats: 1,
  onPass: "start_measured_trials",
  onFail: "mark_invalid_and_return",
  companionDuringPractice: "instruct",
  companionDuringMeasurement: "hidden",
};

const BASELINE_FEEDBACK_POLICY: AttentionFeedbackPolicy = {
  practice: "corrective_audio_visual",
  measured: "neutral_audio_only",
  results: "reward_summary",
};

const BASELINE_AUDIO_PROFILE: AttentionAudioProfile = {
  practiceCorrect: "soft_chime",
  practiceMiss: "gentle_miss",
  measuredResponse: "neutral_tap",
  measuredAdvance: "neutral_advance",
  resultsComplete: "completion_chime",
  ambient: "off",
};

export type RecordAttentionSignalResult = {
  recorded: boolean;
  reason?: "practice_gate_failed";
  profile: LearningProfile;
  signal: AttentionSignal & {
    childId: string;
    validBaseline: boolean;
    invalidReason?: string;
    recordedAt: string;
  };
};

export type AttentionWriterOptions = {
  rootDir?: string;
  now?: Date;
};

export const ATTENTION_TASKS: AttentionTaskMetadata[] = [
  {
    taskId: "bubble-pop",
    purpose: "attention_screening",
    activityFile: "attention-bubble-pop.html",
    measures: ["sustained_attention", "omissions", "basic_vigilance", "late_dropoff"],
    cognitiveLoad: "low",
    ruleBurden: "low",
    readingDemand: "none",
    motorDemand: "low",
    bestFor: ["first_baseline", "low_reading_confound", "rule_confusion_risk"],
    avoidWhen: ["needs_inhibition_measure"],
    wrappers: ["calm", "mission"],
    sensoryLoad: "low",
    rewardDensity: "low",
    feedbackPolicy: BASELINE_FEEDBACK_POLICY,
    audioProfile: BASELINE_AUDIO_PROFILE,
    profileConfigKeys: [
      "attentionModel.currentWindow_ms",
      "attentionTraining.currentAcademicLoad.maxFocusedWindow_ms",
      "rewardPreferences.celebrationStyle",
      "rewardPreferences.favoriteGames",
    ],
    transitionPolicy: DEFAULT_TRANSITION_POLICY,
  },
  {
    taskId: "fish-flanker",
    purpose: "attention_screening",
    activityFile: "attention-fish-flanker.html",
    measures: ["inhibition", "conflict_control", "reaction_variability", "commissions"],
    cognitiveLoad: "medium",
    ruleBurden: "medium",
    readingDemand: "none",
    motorDemand: "low",
    bestFor: ["impulsivity_question", "rule_holding_question"],
    avoidWhen: ["first_session_anxious", "visual_overload"],
    wrappers: ["challenge", "competition"],
    sensoryLoad: "medium",
    rewardDensity: "low",
    feedbackPolicy: BASELINE_FEEDBACK_POLICY,
    audioProfile: BASELINE_AUDIO_PROFILE,
    profileConfigKeys: [
      "attentionModel.currentWindow_ms",
      "attentionTraining.currentAcademicLoad.maxFocusedWindow_ms",
      "rewardPreferences.celebrationStyle",
      "rewardPreferences.favoriteGames",
    ],
    transitionPolicy: DEFAULT_TRANSITION_POLICY,
  },
  {
    taskId: "target-blaster",
    purpose: "attention_screening",
    activityFile: "attention-target-blaster.html",
    measures: ["rule_maintenance", "response_speed", "omissions"],
    cognitiveLoad: "medium",
    ruleBurden: "medium",
    readingDemand: "low",
    motorDemand: "low",
    bestFor: ["speed_vs_accuracy_question"],
    avoidWhen: ["motor_speed_confound", "letter_confusion"],
    wrappers: ["arcade", "competition"],
    sensoryLoad: "medium",
    rewardDensity: "low",
    feedbackPolicy: BASELINE_FEEDBACK_POLICY,
    audioProfile: BASELINE_AUDIO_PROFILE,
    profileConfigKeys: [
      "attentionModel.currentWindow_ms",
      "attentionTraining.currentAcademicLoad.maxFocusedWindow_ms",
      "rewardPreferences.celebrationStyle",
      "rewardPreferences.favoriteGames",
    ],
    transitionPolicy: DEFAULT_TRANSITION_POLICY,
  },
  {
    taskId: "hero-shield",
    purpose: "attention_screening",
    activityFile: "attention-hero-shield.html",
    measures: ["impulse_control", "themed_engagement", "commissions"],
    cognitiveLoad: "medium",
    ruleBurden: "medium",
    readingDemand: "none",
    motorDemand: "low",
    bestFor: ["mission_wrapper_affinity", "impulse_control_question"],
    avoidWhen: ["theme_distracts_from_measurement"],
    wrappers: ["mission", "story"],
    sensoryLoad: "medium",
    rewardDensity: "low",
    feedbackPolicy: BASELINE_FEEDBACK_POLICY,
    audioProfile: BASELINE_AUDIO_PROFILE,
    profileConfigKeys: [
      "attentionModel.currentWindow_ms",
      "attentionTraining.currentAcademicLoad.maxFocusedWindow_ms",
      "rewardPreferences.celebrationStyle",
      "rewardPreferences.favoriteGames",
    ],
    transitionPolicy: DEFAULT_TRANSITION_POLICY,
  },
];

function profilePath(rootDir: string, childId: string): string {
  return path.join(resolveChildContextDir(childId, { rootDir }), "learning_profile.json");
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function appendNdjson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}

function clamp01(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function isoNow(opts: AttentionWriterOptions): string {
  return (opts.now ?? new Date()).toISOString();
}

function dayFor(signal: Pick<AttentionSignal, "startedAt">, opts: AttentionWriterOptions): string {
  return (signal.startedAt || isoNow(opts)).slice(0, 10);
}

export function chooseAttentionTask(input: AttentionTaskChoiceInput): AttentionTaskMetadata {
  const question = input.careQuestion.toLowerCase();
  const avoid = new Set(input.avoidTaskIds ?? []);
  const candidates = ATTENTION_TASKS.filter((task) => !avoid.has(task.taskId));
  const filtered = input.avoidReadingDemand
    ? candidates.filter((task) => task.readingDemand === "none")
    : candidates;
  const pool = filtered.length ? filtered : candidates;

  if (question.includes("impulsive") || question.includes("inhibition") || question.includes("conflict")) {
    return pool.find((task) => task.taskId === "fish-flanker") ?? pool[0]!;
  }
  if (question.includes("speed") || question.includes("rule maintenance")) {
    return pool.find((task) => task.taskId === "target-blaster") ?? pool[0]!;
  }
  if (question.includes("mission") || question.includes("story")) {
    return pool.find((task) => task.taskId === "hero-shield") ?? pool[0]!;
  }
  return pool.find((task) => task.taskId === "bubble-pop") ?? pool[0]!;
}

function attentionTaskReason(task: AttentionTaskMetadata, input: AttentionTaskChoiceInput): string {
  const question = input.careQuestion.toLowerCase();
  if (task.taskId === "fish-flanker") {
    return "Selected fish-flanker because the care question mentions impulsive responding, inhibition, or conflict control while keeping reading demand at none.";
  }
  if (task.taskId === "target-blaster") {
    return "Selected target-blaster because the care question asks about speed versus accuracy or rule maintenance under light symbolic load.";
  }
  if (task.taskId === "hero-shield") {
    return "Selected hero-shield because the chart suggests a mission/story wrapper may improve engagement while measuring impulse control.";
  }
  if (question.includes("low-reading")) {
    return "Selected bubble-pop as the first low-reading, low-rule attention baseline so reading skill does not contaminate the measurement.";
  }
  return "Selected bubble-pop as the conservative first baseline because it has low rule burden and no reading demand.";
}

export function buildAttentionTaskConfig(
  profile: Pick<LearningProfile, "attentionModel" | "rewardPreferences">,
  task: AttentionTaskMetadata,
): AttentionTaskRuntimeConfig {
  const maxFocusedWindow = profile.attentionModel?.currentWindow_ms ?? 90_000;
  const prefersCompetition = profile.rewardPreferences.favoriteGames.some((entry) =>
    /race|challenge|competition|wheel|fighter|battle/i.test(entry),
  );
  const wrapper =
    prefersCompetition && task.wrappers.includes("competition")
      ? "competition"
      : task.wrappers[0] ?? "calm";
  return {
    taskId: task.taskId,
    childPacing: {
      trialCount: task.ruleBurden === "low" ? 12 : 16,
      practiceTrials: task.ruleBurden === "low" ? 3 : 4,
      stimulusDuration_ms: task.cognitiveLoad === "low" ? 1600 : 1300,
      maxFocusedWindow_ms: maxFocusedWindow,
    },
    wrapper,
    sensoryLoad: task.sensoryLoad,
    rewardDensity: task.rewardDensity,
    feedbackPolicy: task.feedbackPolicy,
    audioProfile: task.audioProfile,
    companionDuringTrials: "hidden",
    transitionPolicy: task.transitionPolicy,
  };
}

export function chooseAttentionTaskWithReason(
  input: AttentionTaskChoiceInput,
  profile: Pick<LearningProfile, "attentionModel" | "rewardPreferences">,
): AttentionTaskSelection {
  const task = chooseAttentionTask(input);
  return {
    task,
    reason: attentionTaskReason(task, input),
    config: buildAttentionTaskConfig(profile, task),
  };
}

function attentionModelFromSignal(
  signal: AttentionSignal,
  previous: AttentionModel | undefined,
  measuredAt: string,
): AttentionModel {
  const omissionPenalty = clamp01((signal.omissions ?? 0) / 10);
  const commissionPenalty = clamp01((signal.commissions ?? 0) / 10);
  const variabilityPenalty = clamp01(signal.reactionTimeVariability ?? 0.2);
  const dropoffPenalty = clamp01(Math.max(0, signal.dropoff ?? 0));
  const frustrationPenalty = clamp01(signal.frustrationSignals.length / 5);
  const quality =
    1 -
    clamp01(
      omissionPenalty * 0.28 +
        commissionPenalty * 0.22 +
        variabilityPenalty * 0.2 +
        dropoffPenalty * 0.2 +
        frustrationPenalty * 0.1,
    );
  const currentWindow = Math.max(
    30_000,
    Math.round(signal.activeDuration_ms * Math.max(0.35, quality)),
  );
  const bestWindow = Math.max(previous?.bestWindow_ms ?? 0, currentWindow);
  const confidence = signal.practiceGate?.passed === true
    ? Math.min(0.9, 0.45 + Math.min(signal.activeDuration_ms, 180_000) / 400_000)
    : 0.25;
  const priorWindow = previous?.currentWindow_ms;
  const trend: AttentionModel["trend"] = priorWindow == null
    ? "unknown"
    : currentWindow > priorWindow * 1.12
      ? "improving"
      : currentWindow < priorWindow * 0.88
        ? "declining"
        : "stable";

  return {
    source: previous?.source === "session_vitals" || previous?.source === "mixed"
      ? "mixed"
      : signal.purpose === "attention_screening"
        ? "onboarding_baseline"
        : "session_vitals",
    status: confidence >= 0.55 ? "measured" : "provisional",
    currentWindow_ms: currentWindow,
    bestWindow_ms: bestWindow,
    trend,
    confidence: Math.round(confidence * 100) / 100,
    lastMeasuredAt: measuredAt,
    evidence: [
      `activity=${signal.activityId}`,
      `purpose=${signal.purpose}`,
      `active=${signal.activeDuration_ms}ms`,
      `omissions=${signal.omissions ?? 0}`,
      `commissions=${signal.commissions ?? 0}`,
      `dropoff=${signal.dropoff ?? 0}`,
      `practiceGate=${signal.practiceGate?.passed === true ? "passed" : "not-recorded"}`,
    ],
  };
}

function catalogItemForAttentionTask(
  childId: string,
  task: AttentionTaskMetadata | undefined,
  purpose: ActivityPurpose,
): AIContentCatalogItem {
  const taskId = task?.taskId ?? "unknown-attention-task";
  return {
    contentId: `attention:${taskId}`,
    childId,
    type: "game",
    source: "prototype",
    purpose,
    title: `Attention screen: ${taskId}`,
    algorithmTargets: ["attention-vitals", "activity-affinity"],
    targetSkills: task?.measures ?? ["attention"],
    targetConcepts: [],
    targetWords: [],
    engagementHooks: task?.wrappers ?? [],
    inputEvidence: {},
    reuseStatus: "candidate",
    reuseReason: "Attention task needs child-specific validity and affinity evidence.",
  };
}

function upsertCatalogItem(
  profile: LearningProfile,
  item: AIContentCatalogItem,
): AIContentCatalogItem[] {
  const prior = profile.aiContentCatalog ?? [];
  const idx = prior.findIndex((entry) => entry.contentId === item.contentId);
  if (idx === -1) return [item, ...prior];
  return prior.map((entry, entryIdx) => entryIdx === idx ? { ...entry, ...item } : entry);
}

export function recordAttentionSignal(
  childIdRaw: string,
  input: AttentionSignal,
  opts: AttentionWriterOptions = {},
): RecordAttentionSignalResult {
  const rootDir = opts.rootDir ?? process.cwd();
  const chart = getChildChart(childIdRaw, { rootDir });
  const childId = chart.childId;
  const recordedAt = isoNow(opts);
  const validBaseline = input.purpose !== "attention_screening" || input.practiceGate?.passed !== false;
  const signal = {
    ...input,
    childId,
    validBaseline,
    ...(validBaseline ? {} : { invalidReason: "practice_gate_failed" }),
    recordedAt,
  };
  appendNdjson(path.join(chart.links.vitals, `${dayFor(input, opts)}.ndjson`), signal);

  const currentProfile = hydrateLearningProfileFromWaterfall(
    childId,
    readJson<LearningProfile>(profilePath(rootDir, childId)),
    { rootDir },
  );
  if (!validBaseline) {
    return {
      recorded: false,
      reason: "practice_gate_failed",
      profile: currentProfile,
      signal,
    };
  }

  const task = ATTENTION_TASKS.find((entry) => entry.taskId === input.activityId);
  const nextProfile: LearningProfile = {
    ...currentProfile,
    attentionModel: attentionModelFromSignal(input, currentProfile.attentionModel, recordedAt),
    aiContentCatalog: upsertCatalogItem(
      currentProfile,
      catalogItemForAttentionTask(childId, task, input.purpose),
    ),
    lastUpdated: recordedAt,
  };
  writeJson(profilePath(rootDir, childId), slimLearningProfileForDoorway(nextProfile));
  return {
    recorded: true,
    profile: nextProfile,
    signal,
  };
}
