import type {
  SM2Params,
  DifficultyParams,
  MasteryParams,
  InterleavingParams,
  StepSessionRecord,
} from "../../algorithms/types";
import type { HomeworkTestDateSource } from "./homeworkCycle";
import type { CompanionProfileTuning } from "../../shared/companionTypes";
import type { TamagotchiState } from "../../shared/vrrTypes";
import type {
  ChoiceEventSource,
  MasteryUnlockState,
  NodeType,
  PronunciationNodeConfig,
  RewardWrapperConfig,
  WordRadarNodeConfig,
} from "../../shared/adventureTypes";
import type { AdventureBoardJson } from "../../shared/adventureBoardJson";

export type ActiveSessionPlanSource =
  | "ingest_human_loop"
  | "runtime_fallback"
  | "psychologist_sync";

export type HomeworkDomain = "spelling" | "reading" | "math" | "science";

export type PlannerApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "auto_approved";

export interface PlannerReviewDecision {
  planId: string;
  status: "approved" | "rejected";
  reviewer?: string;
  notes?: string;
  decidedAt: string;
}

export interface PlannerTrustState {
  approvedCount: number;
  rejectedCount: number;
  autoPlanEnabled: boolean;
  autoPlanThreshold: number;
  lastDecision?: PlannerReviewDecision;
}

export interface PlanTheory {
  hypothesis: string;
  evidenceSummary: string[];
  intervention: string;
  supportCriteria: string[];
  reviseCriteria: string[];
  falsifyCriteria: string[];
}

export type LearningTheoryDecisionStatus =
  | "supported"
  | "revised"
  | "falsified"
  | "inconclusive"
  | "awaiting_calibration";

/** Durable, inspectable outcome of testing one care-plan theory. */
export interface LearningTheoryDecision {
  theoryDecisionId: string;
  theoryId: string;
  theoryVersion: number;
  childId: string;
  planId: string;
  domain: string;
  sessionDir: string;
  hypothesis: string;
  intervention: string;
  evidenceIds: string[];
  contentIds: string[];
  academicEvidenceSummary: string[];
  /** Child/companion conversation signals are kept separate from academic proof. */
  companionObservations: string[];
  status: LearningTheoryDecisionStatus;
  reason: string;
  nextAction: string;
  createdAt: string;
  calibrationId?: string;
}

export interface PlannedMeasurement {
  id: string;
  activityId: string;
  target: string;
  evidenceType: string;
  supportCriteria: string;
  reviseCriteria: string;
  falsifyCriteria: string;
  spelling?: {
    role: "instruction" | "practice" | "fresh_checkpoint";
    evidenceIds: string[];
    interventionNodeIds: string[];
    reason: string;
    uncertainty: string;
    expectedAccuracy: { min: number; max: number };
    confidence: number;
    maxDelayDays: number;
    finalCheck: boolean;
  };
}

export interface LearningRoutePrescription {
  id: string;
  label: string;
  rationale: string;
  nodeIds: string[];
}

export type GeneratedArtifactLifecycleStatus =
  | "brief_only"
  | "generating"
  | "validating"
  | "ready_for_review"
  | "approved_ready"
  | "failed_retryable"
  | "failed_final"
  | "retired"
  | "generated"
  | "validated"
  | "failed";

export interface GeneratedExperienceBrief {
  briefId: string;
  experimentId?: string;
  kind: "quest" | "boss" | "visual-explainer";
  title: string;
  learningGoal: string;
  targetSkills: string[];
  targetConcepts: string[];
  targetWords: string[];
  engagementHooks: string[];
  algorithmTargets: string[];
  evidenceUsed: string[];
  artifactStatus: GeneratedArtifactLifecycleStatus;
  validationRequired: boolean;
}

export type LearningExperimentStatus =
  | "planned"
  | "active"
  | "supported"
  | "revised"
  | "falsified"
  | "inconclusive";

export interface LearningExperiment {
  experimentId: string;
  childId: string;
  createdAt: string;
  updatedAt: string;
  status: LearningExperimentStatus;
  hypothesis: string;
  intervention: string;
  comparison: string;
  successCriteria: string[];
  stopConditions: string[];
  assignedActivityIds: string[];
  generatedArtifactIds: string[];
  metricsToCollect: string[];
  results: Array<{
    recordedAt: string;
    source: string;
    summary: string;
    metrics: Record<string, number | string | boolean | null>;
  }>;
  conclusion?: {
    status: Exclude<LearningExperimentStatus, "planned" | "active">;
    decidedAt: string;
    evidence: string[];
    nextAction: string;
  };
}

export interface ActiveSessionPlan {
  planId: string;
  childId: string;
  createdAt: string;
  source: ActiveSessionPlanSource;
  activeHomeworkId?: string;
  domain: string;
  testDate: string | null;
  parentNote?: string;
  nodePlan: Array<{
    id: string;
    type: NodeType;
    activityId: string;
    targets: string[];
    difficulty: 1 | 2 | 3;
    source: "pending_homework" | "chart_planner";
    targetLane?: string;
    choiceMode?: "choice_lab" | "surprise_drop";
    choiceSource?: ChoiceEventSource;
    masteryUnlockState?: MasteryUnlockState;
    locked?: boolean;
    /** Child-facing title; never expose the internal generated-baseline label. */
    title?: string;
    pronunciationConfig?: PronunciationNodeConfig;
    wordRadarConfig?: WordRadarNodeConfig;
    rewardWrapper?: RewardWrapperConfig;
    /** Approved generated shell HTML; required for generated-baseline nodes to launch from the board. */
    gameHtmlPath?: string;
    /** Canonical homework identity used to route the generated artifact. */
    date?: string;
    /** Planner/designer-selected artwork for this exact node. */
    thumbnailUrl?: string;
    thumbnailPrompt?: string;
    theoryId?: string;
    experimentId?: string;
    contentId?: string;
    engagementDimensions?: EngagementDimension[];
    engagementHypothesis?: string;
    mechanic?: string;
    theme?: string;
    sfxProfile?: string;
    companionPolicy?: string;
    /** Per-node refillable config endpoint consumed by the generated shell. */
    activityConfigPath?: string;
    /** Planner-authored payload for an existing reusable activity engine. */
    activityConfig?: Record<string, unknown>;
    validationProof?: {
      engine: "playwright";
      passed: boolean;
      worldStateChanged: boolean;
      screenshotPaths: string[];
    };
    /** Planner-authored practice rounds from the captured worksheet (generated-baseline nodes). */
    rounds?: Array<{
      id: string;
      prompt: string;
      options: Array<{ id: string; label: string; correct: boolean }>;
    }>;
  }>;
  learningRoutes?: LearningRoutePrescription[];
  adventureBoard?: AdventureBoardJson;
  variationPolicy: {
    avoidExactPreviousNodeOrder: boolean;
    avoidExactPreviousWordOrder: boolean;
    seed: string;
    previousCompletedNodeCount: number;
  };
  companionPolicy: {
    companionId: string;
    displayName: string;
    openingLinePolicy: "context_start_short" | "silent" | "none";
    verbosity: "low" | "medium" | "high";
    maxMicroProbes: number;
  };
  evidenceUsed: Array<{
    id: string;
    type: string;
    summary: string;
  }>;
  openQuestions: string[];
  plannerConfidence?: number;
  approvalStatus?: PlannerApprovalStatus;
  planTheory?: PlanTheory;
  plannedMeasurements?: PlannedMeasurement[];
  generatedExperienceBriefs?: GeneratedExperienceBrief[];
  learningExperiments?: LearningExperiment[];
}

export interface MoodEntry {
  date: string;
  startMood: "energetic" | "neutral" | "fatigued" | "upset";
  endMood: "energetic" | "neutral" | "fatigued" | "upset";
  bondQuality: "strong" | "moderate" | "weak";
  sessionAccuracy: number;
  notableSignals: string[];
}

export interface IEPTarget {
  area: string;
  baseline: string;
  currentLevel: "emerging" | "developing" | "approaching" | "meeting";
  lastProbeDate: string;
  nextProbeDue: string;
  probeFrequency: "weekly" | "biweekly" | "monthly";
  overdueDays?: number;
}

export interface ReadingProfile {
  currentReadingLevel: string;
  wordsPerMinute?: number;
  averageReadingAccuracy: number;
  comprehensionAccuracy: number;
  flaggedPatterns: string[];
  storiesCompleted: number;
  lastStoryDate?: string;
  /** Karaoke / reading canvas — optional; merged with defaults on client/server */
  fontSize?: number;
  lineHeight?: number;
  fontFamily?: string;
  background?: string;
  wordsPerLine?: number;
  highlightColor?: string;
  highlightBackground?: string;
  dyslexiaMode?: boolean;
}

export type AdventureMapLayoutPreset = "horizontal-adventure-spine";
export type AdventureMapCompanionSlot = "right" | "left" | "none";

export interface AdventureMapProfile {
  defaultLayoutPreset: AdventureMapLayoutPreset;
  companionSlot: AdventureMapCompanionSlot;
  agencyNotes: string[];
  visualStyleNotes: string[];
  staminaNotes: string[];
}

export const DEFAULT_ADVENTURE_MAP_PROFILE: AdventureMapProfile = {
  defaultLayoutPreset: "horizontal-adventure-spine",
  companionSlot: "right",
  agencyNotes: [],
  visualStyleNotes: [],
  staminaNotes: [],
};

export function resolveAdventureMapProfile(
  profile?: Partial<AdventureMapProfile> | null,
): AdventureMapProfile {
  return {
    defaultLayoutPreset:
      profile?.defaultLayoutPreset ?? DEFAULT_ADVENTURE_MAP_PROFILE.defaultLayoutPreset,
    companionSlot: profile?.companionSlot ?? DEFAULT_ADVENTURE_MAP_PROFILE.companionSlot,
    agencyNotes: profile?.agencyNotes ?? DEFAULT_ADVENTURE_MAP_PROFILE.agencyNotes,
    visualStyleNotes: profile?.visualStyleNotes ?? DEFAULT_ADVENTURE_MAP_PROFILE.visualStyleNotes,
    staminaNotes: profile?.staminaNotes ?? DEFAULT_ADVENTURE_MAP_PROFILE.staminaNotes,
  };
}

export interface BondPatterns {
  topics: string[];
  bondStyle: string;
  averageBondTurns: number;
  lastBondQuality: "strong" | "moderate" | "weak";
  topicFrequency: Record<string, number>;
}

export interface ActivityModelEntry {
  activityId: string;
  plays: number;
  completions: number;
  completionRate: number;
  averageAccuracy: number;
  averageTimePerTarget_ms?: number;
  engagementScore: number;
  frustrationScore: number;
  likedCount?: number;
  dislikedCount?: number;
  lastRating?: "like" | "dislike" | "implicit";
  lastPlayed: string;
  domains: Record<string, number>;
  missedWords: string[];
}

export interface ActivityTraitModelEntry {
  dimension: string;
  positiveWeight: number;
  negativeWeight: number;
  mixedWeight: number;
  evidenceCount: number;
  confidence: number;
  lastUpdated: string;
  activityCounts: Record<string, number>;
}

export type EngagementDimension =
  | "visual"
  | "puzzle"
  | "story"
  | "speed"
  | "competition"
  | "control"
  | "novelty"
  | "voice"
  | "calm";

export type EngagementEvidenceKind =
  | "choice"
  | "activity"
  | "companion"
  | "sound"
  | "parent_note";

export interface EngagementTheoryEvidence {
  id: string;
  kind: EngagementEvidenceKind;
  summary: string;
  sourcePath?: string;
  createdAt: string;
}

export interface EngagementDimensionState {
  dimension: EngagementDimension;
  positiveWeight: number;
  negativeWeight: number;
  mixedWeight: number;
  evidenceCount: number;
  confidence: number;
  lastUpdated: string;
}

export interface EngagementExperiment {
  experimentId: string;
  theoryId: string;
  variable: EngagementDimension | "mechanic" | "theme";
  arms: Array<{
    armId: string;
    label: string;
    contentId: string;
    dimensions: EngagementDimension[];
  }>;
  holdConstant: string[];
  successSignals: string[];
  status: "planned" | "active" | "complete";
}

export interface EngagementTheory {
  version: 1;
  theoryId: string;
  childId: string;
  domain: string;
  homeworkId?: string;
  hypothesis: string;
  dimensions: Record<EngagementDimension, EngagementDimensionState>;
  preferredDimensions: EngagementDimension[];
  avoidedDimensions: EngagementDimension[];
  promptDirectives: {
    prefer: string[];
    avoid: string[];
    vary: string[];
    holdConstant: string[];
  };
  evidence: EngagementTheoryEvidence[];
  nextExperiment?: EngagementExperiment;
  updatedAt: string;
}

export interface AdaptiveLoadDomainState {
  domain: string;
  currentCohortSize: number;
  maxRecentSuccessfulCohort: number;
  challengeRecommendation:
    | "expand_cohort"
    | "harder_valid_node"
    | "maintain"
    | "targeted_support";
  lastLoadEvidence: {
    activityId: string;
    completed: boolean;
    accuracy: number;
    targetCount: number;
    frustrationScore: number;
    strongEvidence: boolean;
    occurredAt: string;
  };
}

export interface AttentionModel {
  source: "onboarding_baseline" | "session_vitals" | "mixed" | "legacy_demographic";
  status: "provisional" | "measured" | "insufficient-data";
  currentWindow_ms: number;
  bestWindow_ms: number;
  trend: "improving" | "stable" | "declining" | "unknown";
  confidence: number;
  lastMeasuredAt?: string;
  evidence: string[];
}

export interface LearningCalibrationEntry {
  calibrationId: string;
  homeworkId: string;
  gradedAt: string;
  theoryId?: string;
  predictedPattern?: string;
  predictedRiskWords: string[];
  observedMisses: Array<{
    target: string;
    observedErrorType?: string;
    note?: string;
  }>;
  score: number | null;
  status: "supported" | "falsified" | "inconclusive";
  teacherNotes?: string;
  nextAdjustment: string;
}

export type LearningAlgorithmTarget =
  | "spaced-repetition"
  | "error-pattern-remediation"
  | "retrieval-practice"
  | "reading-comprehension"
  | "pronunciation"
  | "desirable-difficulty"
  | "mastery-gating"
  | "activity-affinity"
  | "variable-reward"
  | "attention-vitals";

export type ActivityPurpose =
  | "attention_screening"
  | "attention_intervention"
  | "learning_intervention"
  | "hybrid_learning_attention"
  | "dopamine_reward"
  | "mastery_gate"
  | "calibration_task";

export interface AIContentCatalogItem {
  contentId: string;
  /** Decision/theory record that authorized generation of this artifact. */
  theoryDecisionId?: string;
  homeworkId?: string;
  childId: string;
  type: "story" | "image" | "video" | "game" | "quiz" | "countdown" | "reading-mode";
  source: "generated" | "baseline" | "prototype" | "human" | "generated_shell";
  purpose?: ActivityPurpose;
  title: string;
  activityId?: string;
  gameHtmlPath?: string;
  domain?: string;
  skillTarget?: string;
  algorithmTargets: LearningAlgorithmTarget[];
  targetSkills: string[];
  targetConcepts: string[];
  targetWords: string[];
  engagementHooks: string[];
  inputEvidence: {
    contentFingerprint?: string;
    patternIds?: string[];
    activityEvidenceIds?: string[];
    calibrationIds?: string[];
  };
  reuseStatus: "candidate" | "reuse" | "revise" | "retire";
  reuseReason: string;
  reviewStatus?: GeneratedArtifactLifecycleStatus;
  reviewDecision?: "approve" | "revise" | "reject" | "regenerate";
  reviewReason?: string;
  reviewLessons?: string[];
  reviewedBy?: string;
  reviewedAt?: string;
  validationStatus?: "passed" | "failed" | "warning";
  validationReport?: {
    passed: boolean;
    score: number;
    failures: string[];
    warnings: string[];
    attempts: number;
    validatedAt: string;
    staticValidation?: {
      passed: boolean;
      score: number;
      failures: string[];
      warnings: string[];
    };
    runtimeValidation?: {
      engine?: "playwright";
      passed: boolean;
      screenshotPaths: string[];
      consoleErrors: string[];
      pageErrors: string[];
      attemptedTargets: number;
      completed: boolean;
      completionPayloads: unknown[];
      usedValidationHook: boolean;
    };
  };
  experimentId?: string;
  engagementTheoryId?: string;
  mechanic?: string;
  theme?: string;
  sfxProfile?: string;
  companionPolicy?: string;
  designMemory?: {
    artifactId: string;
    artifactHash: string;
    academicResponsibility: string;
    interactionHistory: string[];
    themeHistory: string[];
    humanReview: "positive" | "mixed" | "negative" | "not_reviewed";
    childEvidenceIds: string[];
    predictionIds: string[];
    theoryDecisionIds: string[];
    plannerModel?: string;
    architectModel?: string;
    builderProvider?: "anthropic" | "openai";
    builderModel?: string;
    academicContractHash?: string;
    implementationPromptHash?: string;
    generatedHtmlHash?: string;
  };
  artworkStatus?: "generated" | "fallback" | "missing";
  performanceSummary?: {
    plays: number;
    completionRate: number;
    averageAccuracy: number;
    engagementScore: number;
    frustrationScore: number;
    transferSupported?: boolean;
  };
}

export interface LearningProfile {
  childId: string;
  version: number;
  createdAt: string;
  lastUpdated: string;

  /** Doorway links to split chart records. Legacy mirrors remain during migration. */
  chartLinks?: {
    learningProfile?: string;
    wordBank?: string;
    todayPlan?: string;
    currentCarePlan?: string;
    currentHomework?: string;
    homeworkLanes?: string;
    currentSessionPlan?: string;
    sessionPlanLanes?: string;
    contentCatalog?: string;
    decisionTraces?: string;
    homework?: string;
    attempts?: string;
    ratings?: string;
    vitals?: string;
    sessionNotes?: string;
    companionCareDir?: string;
  };

  demographics: {
    age: number;
    grade: number;
    diagnoses: string[];
    learningStyle: "visual_kinesthetic" | "auditory" | "mixed";
    attentionSpan: "short" | "moderate" | "long";
    iepActive: boolean;
  };

  algorithmParams: {
    sm2: SM2Params;
    difficulty: DifficultyParams;
    mastery: MasteryParams;
    interleaving: InterleavingParams;
  };

  bondPatterns: BondPatterns;

  moodHistory: MoodEntry[];
  moodTrend: "improving" | "stable" | "declining";
  moodAdjustment: boolean;

  iepTargets: IEPTarget[];

  readingProfile: ReadingProfile;

  sessionStats: {
    totalSessions: number;
    averageAccuracy: number | null;
    /** Aggregate denominator, separate from all visits; legacy weight is preserved on first update. */
    accuracySessionCount?: number;
    averageDurationMinutes: number;
    currentWilsonStep: number;
    streakRecord: number;
    totalWordsMastered: number;
    perfectSessions: number;
    lastSessionDate: string;
  };

  /** Clock mini-game mastery — optional; added by clockTracker when first used. */
  clockMastery?: {
    currentStep: number;
    stepSessionHistory: StepSessionRecord[];
  };

  rewardPreferences: {
    favoriteGames: string[];
    celebrationStyle: "loud" | "quiet" | "mixed";
    bonusRoundHistory: {
      triggered: number;
      correct: number;
      lastTriggered?: string;
    };
  };

  /** Epsilon-greedy bandit per child (TASK-005); counts/values align with ALL_NODE_TYPES order. */
  banditState?: {
    counts: number[];
    values: number[];
  };

  /** Current activity-response model derived from node results. Raw attempts remain in attempts/*.ndjson. */
  activityModel?: Record<string, ActivityModelEntry>;

  /** Child-level trait response model derived from choice events and narrow companion micro-probes. */
  activityTraitModel?: Record<string, ActivityTraitModelEntry>;

  /** Domain-specific mental-load/cohort sizing learned from recent intervention evidence. */
  adaptiveLoadState?: Record<string, AdaptiveLoadDomainState>;

  /** Measured attention vital sign model. Demographic attentionSpan is legacy/intake only. */
  attentionModel?: AttentionModel;

  /** Child-specific adventure-map delivery preferences. The planner writes today's board. */
  adventureMapProfile?: AdventureMapProfile;

  /** Human-graded reality checks against Sunny's theories; newest first, capped by writers. */
  learningCalibrationJournal?: LearningCalibrationEntry[];

  /** Reusable/revisable/retired learning content. Generated content must declare algorithmTargets. */
  aiContentCatalog?: AIContentCatalogItem[];

  /** Human trust state for AI psychologist experience plans. */
  plannerTrust?: PlannerTrustState;

  /** Chart-attached plan the next kid session should render instead of rebuilding a script. */
  activeSessionPlan?: ActiveSessionPlan;

  /** Domain-isolated session plans; `activeSessionPlan` is only the selected-lane mirror. */
  activeSessionPlanByDomain?: Partial<Record<HomeworkDomain, ActiveSessionPlan>>;

  /** Scientific-method records for AI psychologist interventions. */
  learningExperiments?: LearningExperiment[];

  /** Completed theory-test decisions, newest first. */
  learningTheoryDecisions?: LearningTheoryDecision[];

  /** Human-readable, chart-backed preference theory used to design the next experience. */
  engagementTheory?: EngagementTheory;

  /** Selected homework lane mirrored into legacy `pendingHomework` for old callers. */
  selectedHomeworkDomain?: HomeworkDomain;

  /** Domain-isolated active homework; `pendingHomework` is only the selected-lane mirror. */
  activeHomeworkByDomain?: Partial<Record<HomeworkDomain, NonNullable<LearningProfile["pendingHomework"]>>>;

  pendingHomework?: {
    weekOf: string;
    testDate: string | null;
    testDateSource?: HomeworkTestDateSource;
    testDateConfirmed?: boolean;
    returnTag?: string;
    wordList: string[];
    homeworkId?: string;
    contentProfile?: {
      practiceDomain: string;
      contentDomain: string;
      topic: string;
      primarySkill: string;
      assignmentFormat: string;
      concepts: string[];
      sourceEvidence: string[];
    } | null;
    capturedContent?: {
      title: string;
      type: string;
      rawText: string;
      words: string[];
      homeworkWords?: Array<{
        homeworkWordId: string;
        text: string;
        normalizedText: string;
        wordGroupId?: string;
        wordBankEntryId?: string;
        purpose: string;
        positionIndex: number;
      }>;
      questions: unknown[];
      wordGroups?: Array<{
        id: string;
        wordGroupId?: string;
        label: string;
        purpose: string;
        words: string[];
        homeworkWordIds?: string[];
        confidence: number;
        evidence: string[];
        scheduleAfter?: string;
      }>;
      assignmentInterpretation?: {
        schemaVersion: number;
        status?: string;
        wordGroups: Array<{
          id: string;
          wordGroupId?: string;
          label: string;
          purpose: string;
          words: string[];
          homeworkWordIds?: string[];
          confidence: number;
          evidence: string[];
          scheduleAfter?: string;
        }>;
        assertions: Array<{
          id: string;
          claim: string;
          confidence: number;
          evidence: string[];
        }>;
        selectedTargets: unknown[];
        heldTargets: unknown[];
        clarificationQuestions?: unknown[];
        humanAnswers?: unknown[];
        memoryMatches?: unknown[];
      };
      sourceDocuments: Array<{
        filename: string;
        mediaType?: string;
      }>;
      contentProfile: {
        practiceDomain: string;
        contentDomain: string;
        topic: string;
        primarySkill: string;
        assignmentFormat: string;
        concepts: string[];
        sourceEvidence: string[];
      };
    } | null;
    /** From last homework node misses — prioritized on next map load, then cleared. */
    reinforceWords?: string[];
    generatedAt: string;
    nodes: Array<{
      id: string;
      type: string;
      words: string[];
      difficulty: number;
      gameFile: string | null;
      storyFile: string | null;
      /** Karaoke passage text embedded at ingest (no fetch at click). */
      storyText?: string;
      storyTitle?: string;
      storyImagePrompt?: string;
      /** Validated JSON config endpoint for reusable activity engines. */
      activityConfigPath?: string;
      /** Approved generated baseline shell HTML path. */
      gameHtmlPath?: string;
      /** Planner/designer-selected artwork for this exact node. */
      thumbnailUrl?: string;
      thumbnailPrompt?: string;
      /** Word Radar drills when `type === "word-radar"` (ingest / map). */
      wordRadarItems?: Array<{
        display: string;
        acceptedResponses: string[];
        hint?: string;
        label?: string;
        subject?: string;
      }>;
      /** Planner-selected Word Radar measurement mode carried from assignment ingest. */
      wordRadarConfig?: WordRadarNodeConfig;
      choiceMode?: "choice_lab" | "surprise_drop";
      choiceSource?: ChoiceEventSource;
      masteryUnlockState?: MasteryUnlockState;
      artifactStatus?: GeneratedArtifactLifecycleStatus;
      locked?: boolean;
      approved?: boolean;
      date?: string;
      adaptiveArtifact?: {
        artifactId: string;
        contentId: string;
        homeworkId: string;
        theoryId: string;
        experimentId?: string;
        generationStage: "quest" | "boss";
        targetGroupIds: string[];
        homeworkWordIds: string[];
        baselineEvidenceIds: string[];
        generatedPath?: string;
        artifactStatus?: GeneratedArtifactLifecycleStatus;
        validationStatus?: "passed" | "failed" | "warning";
        validationReport?: {
          passed: boolean;
          score: number;
          failures: string[];
          warnings: string[];
          attempts: number;
          validatedAt: string;
          staticValidation?: {
            passed: boolean;
            score: number;
            failures: string[];
            warnings: string[];
          };
          runtimeValidation?: {
            engine?: "playwright";
            passed: boolean;
            screenshotPaths: string[];
            consoleErrors: string[];
            pageErrors: string[];
            attemptedTargets: number;
            completed: boolean;
            completionPayloads: unknown[];
            usedValidationHook: boolean;
          };
        };
      };
    }>;
    /** Adventure map node ids completed for this homework week (persisted across sessions). */
    completedAdventureNodeIds?: string[];
  };

  /** Parent-confirmed assignment-interpretation patterns used to reduce future clarification prompts. */
  homeworkInterpretationMemory?: Array<{
    patternKey: string;
    confirmedAt: string;
    useCount: number;
    confidenceBoost: number;
    evidence: string[];
  }>;

  /** Intake menu/classifier decisions used to make future homework classification more predictive. */
  homeworkIntakeHistory?: Array<{
    decidedAt: string;
    source: "human_menu" | "cli" | "classifier";
    selectedDomain: HomeworkDomain;
    classifierDomain?: HomeworkDomain;
    homeworkId?: string;
    title?: string;
    note?: string;
  }>;

  /** Companion preset selection and behavior tuning; model identity stays on the selected preset. */
  companion?: CompanionProfileTuning;

  /** Companion care meters (optional; merged with defaults in buildProfile). */
  tamagotchi?: TamagotchiState;

  /** Companion shop / HUD coin balance persisted with the learning profile. */
  companionCurrency?: number;

  /**
   * Slug of the last homework mystery iframe played (`monster-stampede` | `speed-catcher`).
   * Next map session picks the other game so children never repeat back-to-back.
   */
  lastMysteryGame?: string | null;
}

/** Optional homework-test metadata on `word_bank.json` rows (see `WordEntry` in algorithms/types). */
export type WordBankHomeworkPriorityFields = {
  homeworkPriority?: boolean;
  testDate?: string;
  homeworkTargets?: Partial<Record<HomeworkDomain, {
    homeworkId: string;
    testDate: string | null;
    priority: boolean;
    purpose: string;
    sourceGroup?: string;
    updatedAt?: string;
  }>>;
};
