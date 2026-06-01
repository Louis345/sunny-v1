/**
 * Adventure map shared types (TASK-003). Interfaces only — no runtime logic here.
 */

export type NodeType =
  | "mystery"
  | "concept-check"
  | "visual-explainer"
  | "letter-rush"
  | "monster-stampede"
  | "word-builder"
  | "bubble-pop"
  | "cpt-low-reward"
  | "fish-flanker"
  | "target-blaster"
  | "hero-shield"
  | "karaoke"
  | "pronunciation"
  | "word-radar"
  | "clock-game"
  | "coin-counter"
  | "spell-check"
  | "wordle"
  | "quest"
  | "riddle"
  | "space-invaders"
  | "asteroid"
  | "space-frogger"
  | "boss"
  | "wheel-of-fortune";

export type EvidenceTier =
  | "practice"
  | "clean_recall"
  | "mastery_candidate"
  | "calibration_required";

export interface ActivityIntentSummary {
  intentId: string;
  activityId: string;
  nodeId: string;
  purpose: string;
  carePlanHypothesis?: string;
  targetSelector: string;
  acceptedTargetPurposes?: string[];
  selectedTargets: Array<{
    target: string;
    targetPurpose?: string;
    compatibleWithActivity?: boolean;
    reasons?: string[];
    evidenceTypes?: string[];
  }>;
  diagnosticQuestion?: string;
  expectedEvidence?: string[];
  successCriteria?: string[];
  reviseCriteria?: string[];
  falsifyCriteria?: string[];
  evidenceTier?: EvidenceTier;
  masteryEligible?: boolean;
  companionSpeechPolicy?: {
    mentionOnlyCurrentSnapshot?: boolean;
    answerVisibility?: "visible" | "hidden_until_reveal";
    canSpeakTargetBeforeReveal?: boolean;
  };
}

export interface TargetSelectorDecisionSummary {
  selectorId: string;
  activityId: string;
  nodeId: string;
  targetSelector: string;
  selectedTargets: string[];
  targetReasons?: Array<{
    target: string;
    targetPurpose?: string;
    compatibleWithActivity?: boolean;
    reasons?: string[];
    evidenceTypes?: string[];
    score?: number;
  }>;
  traceSummary: string;
}

export type ChoiceEventSource =
  | "child_choice"
  | "parent_choice"
  | "system_recommendation"
  | "system_required";

export type MysteryMode = "choice_lab" | "surprise_drop";

export type WordRadarRecallMode =
  | "visible_read"
  | "partial_visual_recall"
  | "hidden_word_recall";

export interface WordRadarNodeConfig {
  recallMode: WordRadarRecallMode;
  inputMode: "whole-word" | "letter-by-letter" | "keyboard";
  speakStyle: "option-a" | "option-b";
  showTimer: boolean;
  timerSeconds?: number;
  hideWordDuringResponse: boolean;
  requiresCapturedResponse: boolean;
}

export type PronunciationFlowHook = "competition" | "speed" | "challenge";

export interface PronunciationNodeConfig {
  baseWordCount: number;
  targetFlowWordCount: number;
  maxWordCount: number;
  expansionPolicy: "on_mastery_or_child_replay";
  masteryGate: {
    accuracyAtLeast: number;
    minStreak: number;
    noFrustrationSignal: boolean;
  };
  supportPolicy: "slow_on_help_or_repeated_miss";
  /** Profile-driven engagement wrapper (presentation only; tempo uses latency calibration). */
  flowHooks?: PronunciationFlowHook[];
  mode?: "standard" | "rhythm";
  durationMs?: number;
  baseBeatMs?: number;
  minBeatMs?: number;
  rampEveryMs?: number;
  rampStepMs?: number;
  sfxMode?: "scored" | "visual-only";
}

export type MysteryActivityKind =
  | "dopamine_game"
  | "learning_activity"
  | "generated_learning";

export type MysteryLockedReason =
  | "evidence-gate"
  | "permission"
  | "fatigue"
  | "domain-mismatch"
  | string;

export type MasteryUnlockState =
  | "teased_locked"
  | "preparing"
  | "pending_ceremony"
  | "unlocked"
  | "completed";

export type AdaptiveArtifactValidationStatus = "passed" | "failed" | "warning";

export interface AdaptiveArtifactRuntimeValidationReport {
  engine?: "playwright";
  passed: boolean;
  screenshotPaths: string[];
  consoleErrors: string[];
  pageErrors: string[];
  attemptedTargets: number;
  completed: boolean;
  completionPayloads: unknown[];
  usedValidationHook: boolean;
}

export interface AdaptiveArtifactValidationReport {
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
  runtimeValidation?: AdaptiveArtifactRuntimeValidationReport;
}

export interface MysteryChoiceOption {
  optionId: string;
  activityId: string;
  nodeType?: NodeType;
  label: string;
  purposeLabel: string;
  preferenceTraits?: string[];
  thumbnailUrl?: string;
  gameFile?: string;
  domain?: string;
  activityKind?: MysteryActivityKind;
  contentId?: string;
  locked?: boolean;
  lockedReason?: MysteryLockedReason;
}

export interface NodeConfig {
  id: string;
  /** Active session plan that authored this node; used for audit traces. */
  planId?: string;
  type: NodeType;
  isLocked: boolean;
  isCompleted: boolean;
  isGoal: boolean;
  difficulty: 1 | 2 | 3;
  thumbnailUrl?: string;
  /** Grok / designer prompt for on-demand thumbnails (homework map). */
  thumbnailPrompt?: string;
  /** Karaoke passage when `type === "karaoke"`. */
  words?: string[];
  /** Word Radar drills when `type === "word-radar"`. */
  wordRadarItems?: Array<{
    display: string;
    acceptedResponses: string[];
    hint?: string;
    label?: string;
  }>;
  /** Planner-selected Word Radar measurement mode; profile config is only fallback. */
  wordRadarConfig?: WordRadarNodeConfig;
  /** Planner-selected pronunciation dosage; the game renders this instead of choosing word counts. */
  pronunciationConfig?: PronunciationNodeConfig;
  /** Chart word group / activity target lane used to choose this node's targets. */
  targetLane?: string;
  /** Declared learning instrument contract for this launch. */
  activityIntent?: ActivityIntentSummary;
  /** Trace explaining why these activity targets were chosen. */
  targetSelectorDecision?: TargetSelectorDecisionSummary;
  /** Homework node metadata (quest/boss routing). */
  gameFile?: string;
  gameHtmlPath?: string;
  generationModel?: "sonnet" | "opus";
  storyFile?: string;
  storyText?: string;
  storyTitle?: string;
  storyImagePrompt?: string;
  date?: string;
  /** Optional node theme label (client / diag). */
  theme?: string;
  /** Learning content catalog id when this node is generated/reused learning content. */
  contentId?: string;
  /** Quest/boss artifact contract carried from homework generation into map evidence. */
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
    validationStatus?: AdaptiveArtifactValidationStatus;
    validationReport?: AdaptiveArtifactValidationReport;
  };
  /** Locked mastery nodes can be visible while generated content is still being prepared. */
  artifactStatus?: "ready" | "preparing";
  /** Mystery node preference-lab/surprise-drop payload. */
  mysteryMode?: MysteryMode;
  choiceSetId?: string;
  choiceOptions?: MysteryChoiceOption[];
  surpriseOption?: MysteryChoiceOption;
  choiceSource?: ChoiceEventSource;
  /** Child-facing mastery reward state for quest/boss ceremony timing. */
  masteryUnlockState?: MasteryUnlockState;
  lockedReason?: string;
  /** Child-profile-derived activity config for attention screening/intervention nodes. */
  attentionConfig?: unknown;
  /** Validated JSON config endpoint for reusable activity engines. */
  activityConfigPath?: string;
  isCastle?: boolean;
  /** Curtain / accent override for transitions (optional). */
  accentColor?: string;
}

export type NodeRatingLike = "like" | "dislike";

export interface NodeRating {
  childId: string;
  sessionDate: string;
  nodeType: NodeType;
  word: string;
  theme: string;
  rating: NodeRatingLike;
  completionTime_ms: number;
  accuracy: number;
  abandonedEarly: boolean;
}

export interface NodeResult {
  nodeId: string;
  completed: boolean;
  accuracy: number;
  timeSpent_ms: number;
  wordsAttempted: number;
  activityId?: string;
  purpose?: string;
  activityIntentId?: string;
  targetSelectorId?: string;
  activityIntent?: ActivityIntentSummary;
  targetSelectorDecision?: TargetSelectorDecisionSummary;
  mode?: string;
  masteryEligible?: boolean;
  evidenceTier?: EvidenceTier;
  bonusRound?: Record<string, unknown>;
  letterResults?: unknown[];
  vitalSigns?: Record<string, unknown>;
  /** Targets answered incorrectly (e.g. Word Radar) — primes next companion / map node. */
  missedWords?: string[];
  /** Targets answered correctly — optional companion context. */
  correctWords?: string[];
  /** Per-target evidence used to retarget later adaptive practice nodes. */
  targetResults?: Array<{
    target: string;
    correct: boolean;
    attempts?: number;
    attemptedValue?: string;
    responseTime_ms?: number;
    scaffoldLevel?: number;
    concept?: string;
    misconception?: string | null;
    mode?: string;
    masteryEligible?: boolean;
    evidenceTier?: EvidenceTier;
    struggleSignals?: string[];
  }>;
}

export interface SessionThemePalette {
  sky: string;
  ground: string;
  accent: string;
  particle: string;
  glow: string;
  /** Optional reading / karaoke card fill; client falls back if absent. */
  cardBackground?: string;
}

export interface SessionThemeAmbient {
  type: string;
  count: number;
  speed: number;
  color: string;
}

/** Normalized 0–1 coordinates on the map container; used for arc-length node layout. */
export interface MapWaypoint {
  x: number;
  y: number;
}

export type MapPathPresetName =
  | "rising-curve"
  | "zigzag-climb"
  | "gentle-s-curve"
  | "stepping-stones";

export interface SessionTheme {
  name: string;
  palette: SessionThemePalette;
  ambient: SessionThemeAmbient;
  nodeStyle: string;
  pathStyle: string;
  castleVariant: string;
  /** Where this theme came from (diag bundle / generator); optional for wire payloads. */
  source?: "saved" | "palette" | "generated";
  backgroundUrl?: string;
  /** Grok castle asset; null if generation failed or no API key. */
  castleUrl?: string | null;
  /** Grok thumbnails keyed by node type; null per key when that asset failed. */
  nodeThumbnails?: Record<string, string | null>;
  /** Optional path polyline in normalized space; nodes spaced by arc length. */
  mapWaypoints?: ReadonlyArray<MapWaypoint>;
  /** Named map layout preset; ignored when `mapWaypoints` has valid custom points. */
  mapPathPreset?: MapPathPresetName;
}

export interface MapState {
  childId: string;
  sessionDate: string;
  nodes: NodeConfig[];
  currentNodeIndex: number;
  completedNodes: string[];
  theme: SessionTheme;
  xp: number;
  level: number;
}

/** Canonical arm ordering for bandit / registry (TASK-005). */
export const ALL_NODE_TYPES: readonly NodeType[] = [
  "mystery",
  "concept-check",
  "visual-explainer",
  "letter-rush",
  "monster-stampede",
  "word-builder",
  "bubble-pop",
  "cpt-low-reward",
  "fish-flanker",
  "target-blaster",
  "hero-shield",
  "karaoke",
  "pronunciation",
  "word-radar",
  "clock-game",
  "coin-counter",
  "spell-check",
  "wordle",
  "riddle",
  "space-invaders",
  "asteroid",
  "space-frogger",
  "quest",
  "boss",
  "wheel-of-fortune",
] as const;
