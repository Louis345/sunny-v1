export type LearningDomain =
  | "spelling"
  | "vocabulary"
  | "reading"
  | "science"
  | "math"
  | "pronunciation"
  | "attention"
  | "reward";

export type ActivityPurpose =
  | "evaluate"
  | "teach"
  | "practice"
  | "guided-practice"
  | "fluency"
  | "vocabulary-familiarity"
  | "independent-retrieval"
  | "reward"
  | "quest"
  | "boss"
  | "attention-screening";

export type ScaffoldKind =
  | "visible-word"
  | "letter-tiles"
  | "hint"
  | "retry"
  | "stt-match"
  | "fuzzy-match"
  | "companion-coaching"
  | "picture-choice"
  | "model-answer";

export type EvidenceKind =
  | "practice"
  | "mastery"
  | "attention"
  | "reward"
  | "companion"
  | "quest-gate";

export type ActivitySkillTarget =
  | "spell_from_memory"
  | "read_fluently"
  | "pronounce"
  | "auditory_retrieval"
  | "visual_recognition"
  | "concept_understanding"
  | "reading_comprehension"
  | "vocabulary_meaning"
  | "retrieval_practice"
  | "typing_fluency"
  | "attention_control"
  | "reward_recovery"
  | "generated_transfer"
  | "mastery_gate"
  | "math_reasoning";

export type ActivityFriction = "low" | "medium" | "high";
export type ActivityPacing = "slow" | "medium" | "fast" | "burst";
export type ActivityInputMode =
  | "voice"
  | "typing"
  | "click"
  | "touch"
  | "reading"
  | "visual"
  | "mixed";
export type ActivityScaffoldLevel = "none" | "low" | "medium" | "high";
export type ActivityEvidenceType =
  | "practice"
  | "diagnostic"
  | "mastery"
  | "reward"
  | "attention"
  | "generated";
export type ActivityPreferenceDimension =
  | "speed"
  | "voice"
  | "typing"
  | "challenge"
  | "story"
  | "competition"
  | "control"
  | "novelty"
  | "calm"
  | "social"
  | "visual"
  | "movement"
  | "low-writing-load"
  | "confidence";

export type ActivityConfigSource =
  | "unspecified"
  | "activity-config-file"
  | "canvas-message"
  | "query-params"
  | "generated-artifact"
  | "registry-default"
  | "reward-game";

export type ActivityTraits = {
  skillTargets: ActivitySkillTarget[];
  friction: ActivityFriction;
  pacing: ActivityPacing;
  inputModes: ActivityInputMode[];
  scaffoldLevel: ActivityScaffoldLevel;
  evidenceType: ActivityEvidenceType;
  preferenceDimensions: ActivityPreferenceDimension[];
};

export type ActivityCapabilityMode = {
  id: string;
  label: string;
  difficulty: 1 | 2 | 3;
  purpose: ActivityPurpose;
  skillTargets: ActivitySkillTarget[];
  inputModes: ActivityInputMode[];
  scaffolds: ScaffoldKind[];
  evidenceType: ActivityEvidenceType;
  masteryEligible: boolean | "requires_captured_response";
  config: Record<string, unknown>;
  measurementRisks: string[];
};

export type ActivityPlannerAudit = {
  measures: string[];
  configKnobs: string[];
  realDifficultyLevels: string[];
  signalsEmitted: string[];
  signalsMissing: string[];
  psychologistGuidance: string[];
};

type ActivityToolContractSource = {
  id: string;
  label: string;
  nodeType?: string;
  /** HTML/game registry ids powered by this contract. Canvas-only tools can leave this empty. */
  gameIds?: string[];
  /** How this activity receives its runtime configuration. */
  configSource?: ActivityConfigSource;
  purposes: ActivityPurpose[];
  domains: LearningDomain[];
  strengths: string[];
  weakFor: string[];
  goodFitWhen: string[];
  badFitWhen: string[];
  scaffolds: ScaffoldKind[];
  evidence: {
    writesPracticeEvidence: boolean;
    writesMasteryEvidence: boolean;
    requiresPerTargetResult: boolean;
    allowedEvidence: EvidenceKind[];
    contaminationRisks: ScaffoldKind[];
  };
  capabilityModes?: ActivityCapabilityMode[];
} & Partial<ActivityPlannerAudit>;

const EMPTY_ACTIVITY_PLANNER_AUDIT: ActivityPlannerAudit = {
  measures: [],
  configKnobs: [],
  realDifficultyLevels: [],
  signalsEmitted: [],
  signalsMissing: [],
  psychologistGuidance: [],
};

export type ActivityToolContract = ActivityToolContractSource & {
  traits: ActivityTraits;
  capabilityModes: ActivityCapabilityMode[];
  gameIds: string[];
  configSource: ActivityConfigSource;
} & ActivityPlannerAudit;

export type LearnerState = "unknown" | "none" | "partial" | "ready" | "mastered";

export type InstructionalActivityPlanInput = {
  childId?: string;
  homeworkId?: string | null;
  practiceDomain?: string | null;
  contentDomain?: string | null;
  primarySkill?: string | null;
  topic?: string | null;
  learnerState?: LearnerState;
  words?: string[];
  concepts?: string[];
  questionCount?: number;
};

export type InstructionalActivityPlanStep = {
  step: number;
  toolId: string;
  label: string;
  purpose: ActivityPurpose;
  writesMasteryEvidence: boolean;
  evidencePolicy: string;
  reason: string;
};

export type InstructionalActivityPlan = {
  childId?: string;
  homeworkId?: string | null;
  domainSummary: string;
  topic: string;
  learnerState: LearnerState;
  steps: InstructionalActivityPlanStep[];
  notes: string[];
};

export type ActivityToolAuditRow = {
  id: string;
  label: string;
  domains: LearningDomain[];
  purposes: ActivityPurpose[];
  scaffolds: ScaffoldKind[];
  evidencePolicy: string;
  issues: string[];
};

export type ActivityToolAudit = {
  rows: ActivityToolAuditRow[];
  blockers: string[];
};

const DEFAULT_ACTIVITY_TRAITS: ActivityTraits = {
  skillTargets: ["retrieval_practice"],
  friction: "medium",
  pacing: "medium",
  inputModes: ["mixed"],
  scaffoldLevel: "medium",
  evidenceType: "practice",
  preferenceDimensions: ["challenge"],
};

const ACTIVITY_TRAITS_BY_ID = {
  "concept-check": {
    skillTargets: ["concept_understanding", "reading_comprehension", "vocabulary_meaning"],
    friction: "medium",
    pacing: "medium",
    inputModes: ["voice", "click"],
    scaffoldLevel: "low",
    evidenceType: "diagnostic",
    preferenceDimensions: ["challenge", "control", "social"],
  },
  "visual-explainer": {
    skillTargets: ["concept_understanding", "reading_comprehension", "vocabulary_meaning"],
    friction: "low",
    pacing: "slow",
    inputModes: ["visual", "reading"],
    scaffoldLevel: "high",
    evidenceType: "practice",
    preferenceDimensions: ["visual", "story", "calm", "novelty"],
  },
  "picture-question": {
    skillTargets: ["concept_understanding", "reading_comprehension", "visual_recognition"],
    friction: "low",
    pacing: "medium",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "medium",
    evidenceType: "diagnostic",
    preferenceDimensions: ["visual", "control", "challenge"],
  },
  "spelling-recall": {
    skillTargets: ["spell_from_memory", "retrieval_practice"],
    friction: "high",
    pacing: "slow",
    inputModes: ["voice", "typing"],
    scaffoldLevel: "none",
    evidenceType: "diagnostic",
    preferenceDimensions: ["challenge", "typing", "control"],
  },
  "word-radar": {
    skillTargets: ["visual_recognition", "read_fluently", "vocabulary_meaning"],
    friction: "low",
    pacing: "fast",
    inputModes: ["voice", "visual", "click"],
    scaffoldLevel: "high",
    evidenceType: "practice",
    preferenceDimensions: ["speed", "visual", "low-writing-load", "confidence"],
  },
  "spell-check": {
    skillTargets: ["spell_from_memory", "auditory_retrieval", "retrieval_practice"],
    friction: "medium",
    pacing: "medium",
    inputModes: ["voice", "typing"],
    scaffoldLevel: "low",
    evidenceType: "diagnostic",
    preferenceDimensions: ["typing", "challenge", "control", "confidence"],
  },
  "monster-stampede": {
    skillTargets: ["spell_from_memory", "typing_fluency", "retrieval_practice"],
    friction: "medium",
    pacing: "fast",
    inputModes: ["typing", "visual"],
    scaffoldLevel: "medium",
    evidenceType: "practice",
    preferenceDimensions: ["speed", "challenge", "competition", "movement"],
  },
  "letter-rush": {
    skillTargets: ["spell_from_memory", "typing_fluency", "visual_recognition"],
    friction: "medium",
    pacing: "burst",
    inputModes: ["typing", "click", "visual"],
    scaffoldLevel: "low",
    evidenceType: "diagnostic",
    preferenceDimensions: ["speed", "challenge", "competition", "control"],
  },
  karaoke: {
    skillTargets: ["read_fluently", "reading_comprehension", "vocabulary_meaning"],
    friction: "low",
    pacing: "medium",
    inputModes: ["voice", "reading", "visual"],
    scaffoldLevel: "high",
    evidenceType: "practice",
    preferenceDimensions: ["story", "voice", "calm", "social"],
  },
  "word-builder": {
    skillTargets: ["spell_from_memory", "visual_recognition", "retrieval_practice"],
    friction: "medium",
    pacing: "medium",
    inputModes: ["touch", "typing", "visual"],
    scaffoldLevel: "high",
    evidenceType: "practice",
    preferenceDimensions: ["control", "typing", "challenge", "visual"],
  },
  "speed-catcher": {
    skillTargets: ["visual_recognition", "spell_from_memory", "attention_control"],
    friction: "medium",
    pacing: "burst",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "low",
    evidenceType: "practice",
    preferenceDimensions: ["speed", "challenge", "movement", "visual"],
  },
  wordle: {
    skillTargets: ["spell_from_memory", "retrieval_practice", "visual_recognition"],
    friction: "medium",
    pacing: "medium",
    inputModes: ["typing", "visual"],
    scaffoldLevel: "low",
    evidenceType: "diagnostic",
    preferenceDimensions: ["challenge", "control", "visual"],
  },
  "vault-cracker": {
    skillTargets: ["retrieval_practice", "spell_from_memory", "attention_control"],
    friction: "medium",
    pacing: "medium",
    inputModes: ["typing", "click", "visual"],
    scaffoldLevel: "low",
    evidenceType: "practice",
    preferenceDimensions: ["challenge", "novelty", "control"],
  },
  "bd-reversal": {
    skillTargets: ["visual_recognition", "read_fluently", "attention_control"],
    friction: "medium",
    pacing: "medium",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "medium",
    evidenceType: "diagnostic",
    preferenceDimensions: ["visual", "challenge", "control"],
  },
  "clock-game": {
    skillTargets: ["math_reasoning", "visual_recognition"],
    friction: "medium",
    pacing: "medium",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "medium",
    evidenceType: "practice",
    preferenceDimensions: ["visual", "control", "challenge"],
  },
  "coin-counter": {
    skillTargets: ["math_reasoning", "visual_recognition"],
    friction: "medium",
    pacing: "medium",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "medium",
    evidenceType: "practice",
    preferenceDimensions: ["visual", "control", "challenge"],
  },
  "bubble-pop": {
    skillTargets: ["attention_control", "visual_recognition"],
    friction: "low",
    pacing: "burst",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "low",
    evidenceType: "attention",
    preferenceDimensions: ["movement", "visual", "speed"],
  },
  "cpt-low-reward": {
    skillTargets: ["attention_control"],
    friction: "medium",
    pacing: "medium",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "low",
    evidenceType: "attention",
    preferenceDimensions: ["calm", "control"],
  },
  "fish-flanker": {
    skillTargets: ["attention_control", "visual_recognition"],
    friction: "medium",
    pacing: "medium",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "low",
    evidenceType: "attention",
    preferenceDimensions: ["visual", "challenge", "control"],
  },
  "target-blaster": {
    skillTargets: ["attention_control", "visual_recognition"],
    friction: "medium",
    pacing: "burst",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "low",
    evidenceType: "attention",
    preferenceDimensions: ["speed", "challenge", "movement"],
  },
  "hero-shield": {
    skillTargets: ["attention_control", "visual_recognition"],
    friction: "medium",
    pacing: "medium",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "medium",
    evidenceType: "attention",
    preferenceDimensions: ["visual", "challenge", "confidence"],
  },
  pronunciation: {
    skillTargets: ["read_fluently", "pronounce", "auditory_retrieval"],
    friction: "low",
    pacing: "fast",
    inputModes: ["voice"],
    scaffoldLevel: "medium",
    evidenceType: "practice",
    preferenceDimensions: ["voice", "speed", "low-writing-load", "confidence"],
  },
  mystery: {
    skillTargets: ["reward_recovery"],
    friction: "low",
    pacing: "burst",
    inputModes: ["click", "touch", "mixed"],
    scaffoldLevel: "low",
    evidenceType: "reward",
    preferenceDimensions: ["novelty", "control", "competition", "social"],
  },
  "wheel-of-fortune": {
    skillTargets: ["reward_recovery", "retrieval_practice"],
    friction: "low",
    pacing: "burst",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "medium",
    evidenceType: "reward",
    preferenceDimensions: ["novelty", "competition", "control", "visual"],
  },
  quest: {
    skillTargets: ["generated_transfer", "retrieval_practice", "concept_understanding"],
    friction: "medium",
    pacing: "medium",
    inputModes: ["mixed"],
    scaffoldLevel: "low",
    evidenceType: "generated",
    preferenceDimensions: ["story", "challenge", "novelty", "competition"],
  },
  boss: {
    skillTargets: ["mastery_gate", "generated_transfer", "retrieval_practice"],
    friction: "high",
    pacing: "medium",
    inputModes: ["mixed"],
    scaffoldLevel: "none",
    evidenceType: "mastery",
    preferenceDimensions: ["challenge", "competition", "novelty", "control"],
  },
  "store-game": {
    skillTargets: ["reward_recovery"],
    friction: "low",
    pacing: "slow",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "high",
    evidenceType: "reward",
    preferenceDimensions: ["control", "novelty", "social", "visual"],
  },
  asteroid: {
    skillTargets: ["reward_recovery", "attention_control"],
    friction: "low",
    pacing: "burst",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "low",
    evidenceType: "reward",
    preferenceDimensions: ["speed", "movement", "novelty"],
  },
  "space-frogger": {
    skillTargets: ["reward_recovery", "attention_control"],
    friction: "low",
    pacing: "burst",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "low",
    evidenceType: "reward",
    preferenceDimensions: ["movement", "challenge", "novelty"],
  },
  "space-invaders": {
    skillTargets: ["reward_recovery", "attention_control"],
    friction: "low",
    pacing: "burst",
    inputModes: ["click", "touch", "visual"],
    scaffoldLevel: "low",
    evidenceType: "reward",
    preferenceDimensions: ["speed", "competition", "novelty"],
  },
} satisfies Record<string, ActivityTraits>;

function cloneTraits(traits: ActivityTraits): ActivityTraits {
  return {
    ...traits,
    skillTargets: [...traits.skillTargets],
    inputModes: [...traits.inputModes],
    preferenceDimensions: [...traits.preferenceDimensions],
  };
}

function traitsForActivity(id: string): ActivityTraits {
  return cloneTraits(ACTIVITY_TRAITS_BY_ID[id as keyof typeof ACTIVITY_TRAITS_BY_ID] ?? DEFAULT_ACTIVITY_TRAITS);
}

const ACTIVITY_RUNTIME_CONFIG_BY_ID = {
  "concept-check": {
    gameIds: ["concept-check"],
    configSource: "activity-config-file",
  },
  "visual-explainer": {
    gameIds: [],
    configSource: "generated-artifact",
  },
  "picture-question": {
    gameIds: [],
    configSource: "activity-config-file",
  },
  "spelling-recall": {
    gameIds: [],
    configSource: "canvas-message",
  },
  "word-radar": {
    gameIds: [],
    configSource: "canvas-message",
  },
  "spell-check": {
    gameIds: ["spell-check"],
    configSource: "query-params",
  },
  "monster-stampede": {
    gameIds: ["monster-stampede"],
    configSource: "query-params",
  },
  "letter-rush": {
    gameIds: ["letter-rush"],
    configSource: "activity-config-file",
  },
  karaoke: {
    gameIds: [],
    configSource: "canvas-message",
  },
  "word-builder": {
    gameIds: ["word-builder"],
    configSource: "query-params",
  },
  "speed-catcher": {
    gameIds: ["speed-catcher"],
    configSource: "query-params",
  },
  wordle: {
    gameIds: ["wordle"],
    configSource: "query-params",
  },
  "vault-cracker": {
    gameIds: ["vault-cracker"],
    configSource: "query-params",
  },
  "bd-reversal": {
    gameIds: ["bd-reversal"],
    configSource: "registry-default",
  },
  "clock-game": {
    gameIds: ["clock-game"],
    configSource: "query-params",
  },
  "coin-counter": {
    gameIds: ["coin-counter"],
    configSource: "query-params",
  },
  pronunciation: {
    gameIds: ["pronunciation-game"],
    configSource: "canvas-message",
  },
  "bubble-pop": {
    gameIds: ["attention-bubble-pop"],
    configSource: "query-params",
  },
  "cpt-low-reward": {
    gameIds: ["attention-cpt-low-reward"],
    configSource: "query-params",
  },
  "fish-flanker": {
    gameIds: ["attention-fish-flanker"],
    configSource: "query-params",
  },
  "target-blaster": {
    gameIds: ["attention-target-blaster"],
    configSource: "query-params",
  },
  "hero-shield": {
    gameIds: ["attention-hero-shield"],
    configSource: "query-params",
  },
  mystery: {
    gameIds: [],
    configSource: "reward-game",
  },
  "wheel-of-fortune": {
    gameIds: ["WheelOfFortune"],
    configSource: "query-params",
  },
  quest: {
    gameIds: ["quest", "chimp-quest-generated"],
    configSource: "generated-artifact",
  },
  boss: {
    gameIds: [],
    configSource: "generated-artifact",
  },
  "store-game": {
    gameIds: ["store-game"],
    configSource: "registry-default",
  },
  asteroid: {
    gameIds: ["asteroid"],
    configSource: "reward-game",
  },
  "space-frogger": {
    gameIds: ["space-frogger"],
    configSource: "reward-game",
  },
  "space-invaders": {
    gameIds: ["space-invaders"],
    configSource: "reward-game",
  },
} satisfies Record<string, { gameIds: string[]; configSource: ActivityConfigSource }>;

type ActivityPlannerAuditDefaults = Partial<ActivityPlannerAudit> & {
  capabilityModes?: ActivityCapabilityMode[];
};

const ACTIVITY_PLANNER_AUDIT_BY_ID = {
  "concept-check": {
    measures: [
      "Concept understanding before teaching.",
      "Reading or science comprehension through item-level answers.",
      "Which misconception should drive the generated explainer or quest.",
    ],
    configKnobs: [
      "questions",
      "answerMode",
      "choiceCount",
      "readAloud",
      "scaffoldLevel",
      "perQuestionResults",
    ],
    realDifficultyLevels: [
      "warmup_check: familiar language and picture-supported questions.",
      "baseline_probe: clean item-level concept questions before teaching.",
      "transfer_check: new scenario or wording after instruction.",
    ],
    signalsEmitted: [
      "question result",
      "selected answer",
      "response time",
      "completion accuracy",
    ],
    signalsMissing: [
      "Reading fluency unless the child reads aloud.",
      "Spelling or pronunciation evidence.",
      "Clean mastery when choices reveal the answer.",
    ],
    psychologistGuidance: [
      "Use first when Sunny needs to know whether to teach or practice.",
      "Prefer transfer_check after visual teaching or story practice.",
      "Do not treat picture-supported guesses as broad mastery.",
    ],
  },
  "visual-explainer": {
    measures: [
      "Engagement with a generated visual model.",
      "Whether a concept needs direct teaching before practice.",
      "Teachability of the current theory, not mastery.",
    ],
    configKnobs: [
      "artifactId",
      "concepts",
      "narration",
      "interactionPoints",
      "flowMode",
      "validationStatus",
    ],
    realDifficultyLevels: [
      "guided_model: clear visual model with narration.",
      "interactive_pause: child answers questions between scenes.",
      "playthrough_review: parent or preview mode validates the artifact.",
    ],
    signalsEmitted: [
      "artifact opened",
      "interaction answer",
      "completion",
      "validation result",
    ],
    signalsMissing: [
      "Independent transfer unless followed by concept check or quest.",
      "Per-word spelling evidence.",
      "Reliable reading fluency.",
    ],
    psychologistGuidance: [
      "Use when the chart shows concept confusion or weak background knowledge.",
      "The brief must name the theory and planned measurement.",
      "Generated artifacts remain locked until cataloged and validated.",
    ],
  },
  "picture-question": {
    measures: [
      "Applied comprehension with a visual anchor.",
      "Vocabulary meaning and classification from images.",
      "Bridge evidence after teaching.",
    ],
    configKnobs: [
      "prompt",
      "imagePrompt",
      "choices",
      "correctChoice",
      "explanation",
      "scaffoldLevel",
    ],
    realDifficultyLevels: [
      "recognition_choice: obvious visual choices for practice.",
      "near_miss_choice: plausible distractors for diagnostic evidence.",
      "explain_choice: child explains why the answer fits.",
    ],
    signalsEmitted: [
      "choice result",
      "response time",
      "explanation attempt",
      "completion accuracy",
    ],
    signalsMissing: [
      "Cold reading or spelling evidence.",
      "Concept mastery when the image gives away the answer.",
      "Pronunciation accuracy unless voice capture is enabled.",
    ],
    psychologistGuidance: [
      "Use after a concept model to test application without heavy reading load.",
      "Distractor quality controls whether this is practice or diagnostic.",
      "Follow with a text-only transfer check before claiming mastery.",
    ],
  },
  "spelling-recall": {
    measures: [
      "Cold spelling production before scaffolded practice.",
      "Which words are already known versus need teaching.",
      "Exact response capture for per-word baseline evidence.",
    ],
    configKnobs: [
      "promptMode",
      "targetWords",
      "responseMode",
      "hideTargetWord",
      "maxRetries",
      "requiresCapturedResponse",
    ],
    realDifficultyLevels: [
      "audio_word: hear the word and spell it.",
      "sentence_context: hear the word in a sentence before spelling.",
      "definition_prompt: retrieve from meaning or clue.",
    ],
    signalsEmitted: [
      "attempt text",
      "per-word correct/incorrect",
      "retry count",
      "completion accuracy",
    ],
    signalsMissing: [
      "Flow or engagement by itself.",
      "Reading fluency.",
      "Mastery without exact response capture.",
    ],
    psychologistGuidance: [
      "Use when the chart lacks clean baseline spelling evidence.",
      "Keep it short for children who fatigue quickly.",
      "Route misses into scaffolded games before repeating cold recall.",
    ],
  },
  "letter-rush": {
    measures: [
      "Falling-word or falling-letter spelling performance under speed.",
      "Visual discrimination between target words and distractors.",
      "Per-word recall only in hidden/mastery-run mode.",
    ],
    configKnobs: [
      "mode",
      "targetWords",
      "distractors",
      "fallDuration_ms",
      "spawnInterval_ms",
      "letterBankMode",
      "showTargetWord",
      "maxMistakes",
    ],
    realDifficultyLevels: [
      "read_and_race: visible target practice with falling words.",
      "trap_the_imposter: choose the correct word among near-miss distractors.",
      "mastery_run: hidden prompt with captured per-target response.",
    ],
    signalsEmitted: [
      "spawned item",
      "hit/miss",
      "distractor selected",
      "per-target result",
      "completion accuracy",
    ],
    signalsMissing: [
      "Mastery if the target word or letter bank is visible.",
      "Reading comprehension beyond word-level recognition.",
      "Frustration unless misses and exits are recorded.",
    ],
    psychologistGuidance: [
      "Use as the falling-word arcade instrument after the mode is explicit.",
      "Trap-the-imposter is excellent for high-frequency word confusion.",
      "Only mastery_run can approach mastery, and only with captured response.",
    ],
    capabilityModes: [
      {
        id: "read_and_race",
        label: "Read And Race",
        difficulty: 1,
        purpose: "practice",
        skillTargets: ["visual_recognition", "read_fluently"],
        inputModes: ["click", "touch", "visual"],
        scaffolds: ["visible-word"],
        evidenceType: "practice",
        masteryEligible: false,
        config: {
          mode: "read-and-race",
          showTargetWord: true,
          fallDuration_ms: 5200,
          distractors: "low",
        },
        measurementRisks: [
          "Visible target makes this recognition and fluency practice.",
        ],
      },
      {
        id: "trap_the_imposter",
        label: "Trap The Imposter",
        difficulty: 2,
        purpose: "fluency",
        skillTargets: ["visual_recognition", "spell_from_memory", "attention_control"],
        inputModes: ["click", "touch", "visual"],
        scaffolds: ["retry"],
        evidenceType: "diagnostic",
        masteryEligible: false,
        config: {
          mode: "trap-the-imposter",
          showTargetWord: false,
          distractors: "near-miss",
          fallDuration_ms: 4300,
        },
        measurementRisks: [
          "Near-miss discrimination is diagnostic but still not written transfer.",
        ],
      },
      {
        id: "mastery_run",
        label: "Mastery Run",
        difficulty: 3,
        purpose: "independent-retrieval",
        skillTargets: ["spell_from_memory", "retrieval_practice"],
        inputModes: ["typing"],
        scaffolds: [],
        evidenceType: "mastery",
        masteryEligible: "requires_captured_response",
        config: {
          mode: "mastery-run",
          showTargetWord: false,
          letterBankMode: "none",
          requiresCapturedResponse: true,
        },
        measurementRisks: [
          "Only use for mastery when exact per-target response is captured.",
        ],
      },
    ],
  },
  karaoke: {
    measures: [
      "Story reading fluency in context.",
      "Skipped words, hesitations, and completion stamina.",
      "Whether target vocabulary is easier in a meaningful passage.",
    ],
    configKnobs: [
      "passageText",
      "storyTitle",
      "targetWords",
      "highlightMode",
      "wordsPerLine",
      "fontSize",
      "skipWordEnabled",
      "companionSilence",
    ],
    realDifficultyLevels: [
      "guided_story_read: visible story with current-word highlighting.",
      "target_word_reread: rereads flagged words from the passage.",
      "cold_passage_probe: unfamiliar passage with minimal assist.",
    ],
    signalsEmitted: [
      "reading_progress",
      "word index",
      "skipped word",
      "flagged word",
      "completion accuracy",
    ],
    signalsMissing: [
      "Spelling mastery.",
      "Comprehension unless followed by questions.",
      "Cold decoding if the child has heard the passage repeatedly.",
    ],
    psychologistGuidance: [
      "Use for fluency, context, and stamina, not isolated mastery.",
      "Keep companion voice muted while the child is reading.",
      "Route skipped or flagged words into pronunciation, word builder, or reread mode.",
    ],
    capabilityModes: [
      {
        id: "guided_story_read",
        label: "Guided Story Read",
        difficulty: 1,
        purpose: "guided-practice",
        skillTargets: ["read_fluently", "reading_comprehension"],
        inputModes: ["voice", "reading", "visual"],
        scaffolds: ["visible-word", "stt-match"],
        evidenceType: "practice",
        masteryEligible: false,
        config: {
          highlightMode: "current-word",
          skipWordEnabled: true,
          companionSilence: true,
        },
        measurementRisks: [
          "Visible story and repeated exposure make this guided fluency evidence.",
        ],
      },
      {
        id: "target_word_reread",
        label: "Target Word Reread",
        difficulty: 2,
        purpose: "fluency",
        skillTargets: ["read_fluently", "pronounce", "vocabulary_meaning"],
        inputModes: ["voice", "reading"],
        scaffolds: ["visible-word", "stt-match", "retry"],
        evidenceType: "practice",
        masteryEligible: false,
        config: {
          highlightMode: "flagged-words",
          targetWords: "skipped-or-missed",
          skipWordEnabled: false,
          companionSilence: true,
        },
        measurementRisks: [
          "Rereading flagged words measures recovery, not first-pass reading.",
        ],
      },
      {
        id: "cold_passage_probe",
        label: "Cold Passage Probe",
        difficulty: 3,
        purpose: "evaluate",
        skillTargets: ["read_fluently", "reading_comprehension"],
        inputModes: ["voice", "reading"],
        scaffolds: ["stt-match"],
        evidenceType: "diagnostic",
        masteryEligible: "requires_captured_response",
        config: {
          highlightMode: "line",
          skipWordEnabled: false,
          passageSeenBefore: false,
          requiresCapturedResponse: true,
        },
        measurementRisks: [
          "STT and background noise can undercount correct reading.",
        ],
      },
    ],
  },
  "word-builder": {
    measures: [
      "Word construction with visual/letter support.",
      "Chunk awareness and correction after errors.",
      "Which words need scaffolded practice before recall.",
    ],
    configKnobs: [
      "word",
      "mode",
      "letterBank",
      "blankPattern",
      "chunkHints",
      "maxRetries",
    ],
    realDifficultyLevels: [
      "fill_blanks: targeted blanks in an otherwise visible word.",
      "scrambled_tiles: build the word from shuffled letters.",
      "chunk_builder: assemble syllables or morphemes before letters.",
    ],
    signalsEmitted: [
      "tile placement",
      "correct/incorrect",
      "retry count",
      "completion",
    ],
    signalsMissing: [
      "Cold spelling mastery when tiles or blanks reveal structure.",
      "Reading comprehension.",
      "Transfer unless followed by hidden recall.",
    ],
    psychologistGuidance: [
      "Use when a child needs support on hard words without emotional pressure.",
      "Great bridge from pronunciation/reading struggle into spelling practice.",
      "Follow with Spell Check or hidden recall before mastery claims.",
    ],
  },
  "speed-catcher": {
    measures: [
      "Falling-word recognition under arcade timing.",
      "Correctly spelled word selection among fakes.",
      "Engagement with fast visual scanning.",
    ],
    configKnobs: [
      "targetWords",
      "distractors",
      "fallSpeed",
      "duration_seconds",
      "rounds",
      "missPenalty",
    ],
    realDifficultyLevels: [
      "slow_catch: generous speed and obvious distractors.",
      "near_miss_catch: plausible misspellings and faster fall speed.",
      "streak_catch: sustained streak requirement under pressure.",
    ],
    signalsEmitted: [
      "caught word",
      "missed word",
      "distractor hit",
      "score",
    ],
    signalsMissing: [
      "Written spelling production.",
      "Reading comprehension.",
      "Mastery if the answer is selected from visible choices.",
    ],
    psychologistGuidance: [
      "Treat as visual recognition practice and reward-adjacent flow.",
      "Use near-miss mode for spelling confusions after baseline.",
      "Do not substitute for hidden recall.",
    ],
  },
  wordle: {
    measures: [
      "Letter-position inference and spelling strategy.",
      "Persistence after feedback.",
      "Pattern reasoning with constrained guesses.",
    ],
    configKnobs: [
      "targetWord",
      "wordLength",
      "maxGuesses",
      "allowedWords",
      "hintPolicy",
    ],
    realDifficultyLevels: [
      "guided_wordle: known target set and hints.",
      "target_wordle: homework word with normal feedback.",
      "transfer_wordle: related but unseen word.",
    ],
    signalsEmitted: [
      "guess",
      "letter feedback",
      "solve success",
      "guess count",
    ],
    signalsMissing: [
      "Cold spelling of the whole list.",
      "Pronunciation or reading fluency.",
      "Mastery when guesses are heavily hinted.",
    ],
    psychologistGuidance: [
      "Use for strategy and pattern inference after exposure.",
      "Good for children who like puzzle control.",
      "Follow with direct recall for transfer.",
    ],
  },
  "vault-cracker": {
    measures: [
      "Retrieval under puzzle pressure.",
      "Letter or code pattern strategy.",
      "Reward tolerance after wrong guesses.",
    ],
    configKnobs: [
      "targetCode",
      "targetWords",
      "hintPolicy",
      "attemptLimit",
      "rewardSchedule",
    ],
    realDifficultyLevels: [
      "guided_code: visible hints and generous attempts.",
      "word_code: word-derived code with limited hints.",
      "cold_vault: no hints and strict attempts.",
    ],
    signalsEmitted: [
      "guess",
      "hint used",
      "success/failure",
      "attempt count",
    ],
    signalsMissing: [
      "Clean academic mastery if code mechanics dominate.",
      "Reading fluency.",
      "Per-word evidence unless target words are explicit.",
    ],
    psychologistGuidance: [
      "Use as puzzle/reward practice, not first baseline.",
      "Best when tied to a known target set.",
      "Watch frustration if attempt limits are tight.",
    ],
  },
  "bd-reversal": {
    measures: [
      "b/d visual discrimination.",
      "Letter orientation under quick recognition.",
      "Whether reversals need targeted support.",
    ],
    configKnobs: [
      "pairs",
      "probeWords",
      "rounds",
      "showMnemonic",
      "responseMode",
    ],
    realDifficultyLevels: [
      "mnemonic_practice: visual supports and simple pairs.",
      "word_probe: b/d words without mnemonic prompt.",
      "speed_probe: timed discrimination.",
    ],
    signalsEmitted: [
      "probe result",
      "selected letter",
      "response time",
      "accuracy",
    ],
    signalsMissing: [
      "General spelling mastery.",
      "Reading comprehension.",
      "Other reversals unless configured.",
    ],
    psychologistGuidance: [
      "Use only when chart evidence suggests reversal confusion.",
      "Keep probes short; frustration can contaminate attention.",
      "Route misses to visual teaching before timed probes.",
    ],
  },
  "clock-game": {
    measures: [
      "Analog clock reading.",
      "Hour/minute hand interpretation.",
      "Time vocabulary and visual math reasoning.",
    ],
    configKnobs: [
      "hour",
      "minute",
      "mode",
      "showLabels",
      "responseMode",
      "rounds",
    ],
    realDifficultyLevels: [
      "hour_only: whole-hour recognition.",
      "half_quarter: half-hour and quarter-hour.",
      "mixed_minutes: arbitrary minute readings.",
    ],
    signalsEmitted: [
      "time prompt",
      "answer",
      "correct/incorrect",
      "completion accuracy",
    ],
    signalsMissing: [
      "Arithmetic transfer beyond time reading.",
      "Reading fluency.",
      "Mastery without varied prompts.",
    ],
    psychologistGuidance: [
      "Use for time-telling interventions and probes.",
      "Escalate only after varied hour/half-hour success.",
      "Do not attach to unrelated math homework unless time is the target.",
    ],
  },
  "coin-counter": {
    measures: [
      "Coin identification and counting.",
      "Skip-counting/value composition.",
      "Money reasoning with visual supports.",
    ],
    configKnobs: [
      "coinSet",
      "targetAmount",
      "showValues",
      "mode",
      "rounds",
    ],
    realDifficultyLevels: [
      "identify_coins: name/value recognition.",
      "count_same_coin: repeated coin counting.",
      "mixed_amounts: combine coins to match a value.",
    ],
    signalsEmitted: [
      "selected coin",
      "target amount",
      "correct/incorrect",
      "completion accuracy",
    ],
    signalsMissing: [
      "Written arithmetic transfer.",
      "Reading comprehension.",
      "Mastery without varied amounts.",
    ],
    psychologistGuidance: [
      "Use only when money/skip-counting is the target.",
      "Treat showValues as scaffolded practice.",
      "Follow with mixed transfer prompts before mastery.",
    ],
  },
  "bubble-pop": {
    measures: [
      "Simple visual attention and response timing.",
      "Low-stakes engagement/readiness.",
      "Gross missed-click or avoidance patterns.",
    ],
    configKnobs: [
      "duration_seconds",
      "targetRate",
      "distractors",
      "rewardDensity",
      "difficulty",
    ],
    realDifficultyLevels: [
      "warmup_pop: easy targets and high reward.",
      "distractor_pop: includes non-target bubbles.",
      "sustained_pop: longer window for attention stamina.",
    ],
    signalsEmitted: [
      "hit/miss",
      "response time",
      "score",
      "completion",
    ],
    signalsMissing: [
      "Academic learning evidence.",
      "Reading or spelling evidence.",
      "Attention diagnosis by itself.",
    ],
    psychologistGuidance: [
      "Use as a readiness or attention-vitals check, not curriculum.",
      "Keep short before academic work.",
      "Record avoidance or frustration but do not overinterpret a single run.",
    ],
  },
  "cpt-low-reward": {
    measures: [
      "Sustained attention with low reward density.",
      "Commission and omission errors.",
      "Tolerance for quiet focus tasks.",
    ],
    configKnobs: [
      "duration_seconds",
      "targetRatio",
      "stimulusInterval_ms",
      "rewardDensity",
      "goNoGoMode",
    ],
    realDifficultyLevels: [
      "brief_focus: short calm probe.",
      "go_no_go: inhibit response to non-targets.",
      "low_reward_stamina: longer low-reward interval.",
    ],
    signalsEmitted: [
      "hit",
      "false alarm",
      "miss",
      "reaction time",
      "completion",
    ],
    signalsMissing: [
      "Academic mastery.",
      "Why attention dipped without observation context.",
      "Clinical diagnosis.",
    ],
    psychologistGuidance: [
      "Use as vitals, not a teaching node.",
      "Avoid when the child is already frustrated.",
      "Compare across sessions rather than one-off scores.",
    ],
  },
  "fish-flanker": {
    measures: [
      "Selective attention and interference control.",
      "Direction response under distractors.",
      "Executive-function load tolerance.",
    ],
    configKnobs: [
      "rounds",
      "congruencyRatio",
      "stimulusDuration_ms",
      "responseMode",
      "difficulty",
    ],
    realDifficultyLevels: [
      "congruent_only: learn response mapping.",
      "mixed_flanker: congruent and incongruent trials.",
      "speeded_flanker: shorter stimulus window.",
    ],
    signalsEmitted: [
      "trial result",
      "reaction time",
      "congruency",
      "completion accuracy",
    ],
    signalsMissing: [
      "Academic learning evidence.",
      "Reading/spelling transfer.",
      "Clinical interpretation without context.",
    ],
    psychologistGuidance: [
      "Use sparingly as attention-vitals evidence.",
      "Do not schedule right after reading frustration.",
      "Look for trend, not a single pass/fail.",
    ],
  },
  "target-blaster": {
    measures: [
      "Visual search and sustained attention.",
      "Target recognition under speed.",
      "Motor response and engagement.",
    ],
    configKnobs: [
      "targets",
      "distractors",
      "rounds",
      "speed",
      "duration_seconds",
    ],
    realDifficultyLevels: [
      "slow_targets: clear targets and few distractors.",
      "mixed_targets: multiple distractor types.",
      "speed_blaster: fast spawn and streak requirement.",
    ],
    signalsEmitted: [
      "target hit",
      "distractor hit",
      "reaction time",
      "score",
    ],
    signalsMissing: [
      "Academic mastery.",
      "Reading comprehension.",
      "Why a miss happened without board context.",
    ],
    psychologistGuidance: [
      "Use for attention and readiness, or as a brief reward.",
      "Do not attach to academic claims without academic targets.",
      "Short rounds protect against fatigue.",
    ],
  },
  "hero-shield": {
    measures: [
      "Response inhibition and protection timing.",
      "Sustained attention under defensive gameplay.",
      "Recovery after mistakes.",
    ],
    configKnobs: [
      "waves",
      "targetTypes",
      "distractors",
      "shieldCooldown_ms",
      "difficulty",
    ],
    realDifficultyLevels: [
      "training_shield: slow attacks and visible cues.",
      "mixed_shield: target/distractor decisions.",
      "stamina_shield: longer waves and cooldown management.",
    ],
    signalsEmitted: [
      "block",
      "miss",
      "wrong block",
      "wave completion",
      "score",
    ],
    signalsMissing: [
      "Academic mastery.",
      "Reading or spelling evidence.",
      "Emotion/frustration without companion/log audit.",
    ],
    psychologistGuidance: [
      "Use as attention-vitals or motivation after academic work.",
      "Good for children who like heroic framing.",
      "Avoid treating arcade score as curriculum progress.",
    ],
  },
  mystery: {
    measures: [
      "Preference, choice, and reward recovery.",
      "Which optional activities sustain engagement.",
      "Transition tolerance between work and reward.",
    ],
    configKnobs: [
      "options",
      "choiceMode",
      "fallbackGame",
      "rewardBudget",
      "domainValidity",
    ],
    realDifficultyLevels: [
      "choice_lab: child chooses from valid options.",
      "surprise_drop: system selects a domain-safe surprise.",
      "earned_bonus: reward after evidence threshold.",
    ],
    signalsEmitted: [
      "option shown",
      "child choice",
      "selected game",
      "completion",
    ],
    signalsMissing: [
      "Academic mastery.",
      "Why the child chose an option unless conversation is audited.",
      "Transfer evidence.",
    ],
    psychologistGuidance: [
      "Use after evidence-generating work, not before baseline.",
      "Record preferences, but do not let preference override assignment validity.",
      "Keep options real and child-visible.",
    ],
  },
  quest: {
    measures: [
      "Generated-content transfer against the active theory.",
      "Whether baseline evidence supports a harder creative artifact.",
      "Per-target performance when the artifact is valid.",
    ],
    configKnobs: [
      "artifactId",
      "briefId",
      "validated",
      "targetSkills",
      "evidenceGate",
      "gameHtmlPath",
    ],
    realDifficultyLevels: [
      "locked_brief: visible destination but no playable artifact.",
      "validated_quest: generated content passed contract checks.",
      "adaptive_quest: quest retargets known misses or concepts.",
    ],
    signalsEmitted: [
      "unlock state",
      "artifact result",
      "target results",
      "completion",
    ],
    signalsMissing: [
      "Trustworthy evidence when artifact is unvalidated.",
      "Calibration against real homework unless graded result is ingested.",
      "Baseline if skipped directly.",
    ],
    psychologistGuidance: [
      "Quest is a reward-plus-transfer test, not a fixed script.",
      "Keep locked until chart evidence and validation gates pass.",
      "Tie every artifact to a theory and planned measurement.",
    ],
  },
  boss: {
    measures: [
      "Mastery-gated finale after quest evidence.",
      "Whether the care-plan theory survives a harder transfer test.",
      "High-stakes confidence and recovery.",
    ],
    configKnobs: [
      "artifactId",
      "evidenceGate",
      "masteryThreshold",
      "targetSkills",
      "validated",
      "gameHtmlPath",
    ],
    realDifficultyLevels: [
      "locked_finale: visible destination but not playable.",
      "validated_boss: generated finale after quest evidence.",
      "calibration_boss: post-test transfer or review artifact.",
    ],
    signalsEmitted: [
      "unlock state",
      "target results",
      "completion accuracy",
      "calibration result",
    ],
    signalsMissing: [
      "Fair mastery if quest evidence is missing.",
      "Real-world transfer unless graded work is ingested.",
      "Support needs if it only reports score.",
    ],
    psychologistGuidance: [
      "Boss should remain locked until the chart says the evidence gate is ready.",
      "Use to falsify or support the session theory.",
      "Failed boss should route to support, not shame or repeat.",
    ],
  },
  "store-game": {
    measures: [
      "Reward preference and care-loop engagement.",
      "Inventory choices and motivation.",
      "Companion attachment behaviors, not academics.",
    ],
    configKnobs: [
      "itemPool",
      "prices",
      "inventory",
      "currencyBalance",
      "companionCare",
    ],
    realDifficultyLevels: [
      "browse_reward: inspect items.",
      "earned_purchase: spend earned coins.",
      "care_choice: pick item based on companion needs.",
    ],
    signalsEmitted: [
      "item viewed",
      "item bought",
      "currency update",
      "care event",
    ],
    signalsMissing: [
      "Academic evidence.",
      "Learning transfer.",
      "Why an item matters unless companion context is recorded.",
    ],
    psychologistGuidance: [
      "Use as relationship/reward surface.",
      "Never let store time replace needed baseline work.",
      "Care events should write back to companion chart state.",
    ],
  },
  asteroid: {
    measures: [
      "Short reward recovery and attention reset.",
      "Motor engagement and completion tolerance.",
      "Preference for space/action rewards.",
    ],
    configKnobs: [
      "duration_seconds",
      "level",
      "rewardBudget",
      "difficulty",
    ],
    realDifficultyLevels: [
      "short_bonus: brief break.",
      "standard_reward: normal reward duration.",
      "challenge_bonus: harder reward after strong evidence.",
    ],
    signalsEmitted: [
      "score",
      "duration",
      "completion",
      "reward payout",
    ],
    signalsMissing: [
      "Academic mastery.",
      "Skill-specific evidence.",
      "Reason for preference.",
    ],
    psychologistGuidance: [
      "Use as reward/reset only.",
      "Keep reward budget bounded.",
      "Preference can inform engagement wrappers, not domain routing.",
    ],
  },
  "space-frogger": {
    measures: [
      "Reward recovery and movement engagement.",
      "Tolerance for challenge after work.",
      "Preference for navigation-style games.",
    ],
    configKnobs: [
      "duration_seconds",
      "level",
      "rewardBudget",
      "difficulty",
    ],
    realDifficultyLevels: [
      "short_crossing: brief break.",
      "standard_crossing: normal reward.",
      "challenge_crossing: harder navigation after strong evidence.",
    ],
    signalsEmitted: [
      "score",
      "duration",
      "completion",
      "reward payout",
    ],
    signalsMissing: [
      "Academic mastery.",
      "Reading/spelling/math evidence.",
      "Transfer.",
    ],
    psychologistGuidance: [
      "Use as a bounded dopamine reward.",
      "Do not confuse game preference with academic readiness.",
      "Good as mystery option after evidence work.",
    ],
  },
  "space-invaders": {
    measures: [
      "Reward recovery and speed/competition preference.",
      "Attention reset after academic work.",
      "Tolerance for short action bursts.",
    ],
    configKnobs: [
      "duration_seconds",
      "level",
      "rewardBudget",
      "difficulty",
    ],
    realDifficultyLevels: [
      "short_wave: brief break.",
      "standard_wave: normal reward.",
      "challenge_wave: harder reward after strong evidence.",
    ],
    signalsEmitted: [
      "score",
      "duration",
      "completion",
      "reward payout",
    ],
    signalsMissing: [
      "Academic mastery.",
      "Specific learning evidence.",
      "Calibration.",
    ],
    psychologistGuidance: [
      "Use as reward/reset after baseline nodes.",
      "Keep it bounded and chart-gated.",
      "Record preference separately from mastery.",
    ],
  },
} satisfies Record<string, ActivityPlannerAuditDefaults>;

const ACTIVITY_TOOL_CONTRACTS: ActivityToolContractSource[] = [
  {
    id: "concept-check",
    label: "Concept Check",
    purposes: ["evaluate"],
    domains: ["reading", "science", "vocabulary"],
    strengths: [
      "Finds what the child already understands before teaching.",
      "Produces question-level evidence for concept transfer.",
    ],
    weakFor: ["spelling-recall", "flow-state-practice"],
    goodFitWhen: [
      "The assignment is science or reading comprehension and Sunny does not know the baseline yet.",
      "The next move depends on whether the child knows the idea or needs teaching first.",
    ],
    badFitWhen: [
      "The child needs fast repetition on already-identified misses.",
      "The UI shows the answer during the response window.",
    ],
    scaffolds: [],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice"],
      contaminationRisks: [],
    },
  },
  {
    id: "visual-explainer",
    label: "Visual Explainer",
    nodeType: "visual-explainer",
    purposes: ["teach"],
    domains: ["reading", "science", "math", "vocabulary"],
    strengths: [
      "Turns an abstract idea into a concrete visual model.",
      "Works well after a concept check shows the child has not learned the idea yet.",
    ],
    weakFor: ["independent-recall", "mastery-gating"],
    goodFitWhen: [
      "The child has little prior knowledge or needs a mental model before drills.",
      "The topic benefits from animation, diagrams, pictures, or cause/effect sequences.",
    ],
    badFitWhen: [
      "Sunny needs clean independent evidence.",
      "The child has already demonstrated mastery and needs desirable difficulty.",
    ],
    scaffolds: ["model-answer", "companion-coaching"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: false,
      requiresPerTargetResult: false,
      allowedEvidence: ["practice", "companion"],
      contaminationRisks: ["model-answer", "companion-coaching"],
    },
  },
  {
    id: "picture-question",
    label: "Picture Question",
    purposes: ["guided-practice", "evaluate"],
    domains: ["reading", "science", "vocabulary"],
    strengths: [
      "Checks comprehension with visual anchors.",
      "Can bridge from teaching into retrieval when choices are not answer-revealing.",
    ],
    weakFor: ["pure-spelling-recall"],
    goodFitWhen: [
      "The child needs to apply a concept to an image or scenario.",
      "The target is cause/effect, classification, or vocabulary meaning.",
    ],
    badFitWhen: [
      "The choices give away the answer.",
      "Sunny needs spelling-from-memory evidence.",
    ],
    scaffolds: ["picture-choice"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice"],
      contaminationRisks: ["picture-choice"],
    },
  },
  {
    id: "spelling-recall",
    label: "Spelling Recall",
    purposes: ["evaluate", "independent-retrieval"],
    domains: ["spelling", "vocabulary"],
    strengths: [
      "Measures whether the child can produce the spelling without seeing the word.",
      "Creates clean per-word baseline evidence.",
    ],
    weakFor: ["initial-teaching", "science-concept-modeling"],
    goodFitWhen: [
      "The assignment is a spelling list and Sunny needs to know which words are already known.",
      "The UI can hide the target word and capture an exact per-word attempt.",
    ],
    badFitWhen: [
      "The child can see the answer, letter tiles, or a word bank.",
      "The target is a science concept rather than spelling recall.",
    ],
    scaffolds: [],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice"],
      contaminationRisks: [],
    },
  },
  {
    id: "word-radar",
    label: "Word Radar",
    nodeType: "word-radar",
    purposes: ["practice", "vocabulary-familiarity", "fluency"],
    domains: ["spelling", "vocabulary", "reading", "science"],
    strengths: [
      "Builds fast recognition and momentum around target words.",
      "Great for reinforcing misses after an evaluator identifies them.",
    ],
    weakFor: ["independent-recall", "initial-teaching", "mastery-gating"],
    goodFitWhen: [
      "Sunny already knows the target misses and wants scaffolded, high-flow practice.",
      "The child benefits from visible-word repetition before harder retrieval.",
    ],
    badFitWhen: [
      "Sunny needs an initial baseline for unknown content.",
      "The result would be treated as independent spelling or concept mastery.",
    ],
    scaffolds: ["visible-word", "letter-tiles", "stt-match", "retry"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: false,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice"],
      contaminationRisks: ["visible-word", "letter-tiles", "stt-match", "retry"],
    },
    measures: [
      "Visible-word recognition and read-aloud fluency.",
      "Recall practice only when the full word is hidden during response.",
      "Child confidence and low-friction willingness to engage target words.",
    ],
    configKnobs: [
      "recallMode",
      "inputMode",
      "speakStyle",
      "showTimer",
      "timerSeconds",
      "hideWordDuringResponse",
      "requiresCapturedResponse",
    ],
    realDifficultyLevels: [
      "visible_read: child sees the word and says it while the word fills in.",
      "partial_visual_recall: child sees boxes or partial visual scaffolding.",
      "hidden_word_recall: child recalls with no visible answer context.",
    ],
    signalsEmitted: [
      "per-word response capture when enabled",
      "hit/miss practice result",
      "timer pressure",
      "retry/skip behavior",
    ],
    signalsMissing: [
      "Independent spelling mastery when the word remains visible.",
      "Reliable mastery if speech or keyboard response is not captured.",
      "Reading comprehension beyond word-level familiarity.",
    ],
    psychologistGuidance: [
      "Choose visible_read for warmup, confidence, or unknown/weak evidence.",
      "Escalate to partial or hidden recall only after strong evidence and low frustration.",
      "Do not treat visible Word Radar as mastery; it is recognition and flow practice.",
    ],
    capabilityModes: [
      {
        id: "visible_read",
        label: "Visible Read",
        difficulty: 1,
        purpose: "practice",
        skillTargets: ["visual_recognition", "read_fluently"],
        inputModes: ["voice", "visual"],
        scaffolds: ["visible-word", "stt-match"],
        evidenceType: "practice",
        masteryEligible: false,
        config: {
          recallMode: "visible_read",
          inputMode: "whole-word",
          speakStyle: "option-a",
          showTimer: false,
          hideWordDuringResponse: false,
          requiresCapturedResponse: true,
        },
        measurementRisks: [
          "Visible word supports recognition and fluency, not independent recall.",
        ],
      },
      {
        id: "partial_visual_recall",
        label: "Partial Visual Recall",
        difficulty: 2,
        purpose: "guided-practice",
        skillTargets: ["visual_recognition", "retrieval_practice"],
        inputModes: ["voice", "visual"],
        scaffolds: ["letter-tiles", "stt-match", "retry"],
        evidenceType: "practice",
        masteryEligible: false,
        config: {
          recallMode: "partial_visual_recall",
          inputMode: "whole-word",
          speakStyle: "option-a",
          showTimer: true,
          timerSeconds: 10,
          hideWordDuringResponse: true,
          requiresCapturedResponse: true,
        },
        measurementRisks: [
          "Boxes or tiles cue word length and can inflate recall evidence.",
        ],
      },
      {
        id: "hidden_word_recall",
        label: "Hidden Word Recall",
        difficulty: 3,
        purpose: "independent-retrieval",
        skillTargets: ["spell_from_memory", "retrieval_practice", "read_fluently"],
        inputModes: ["voice"],
        scaffolds: ["stt-match"],
        evidenceType: "diagnostic",
        masteryEligible: "requires_captured_response",
        config: {
          recallMode: "hidden_word_recall",
          inputMode: "whole-word",
          speakStyle: "option-b",
          showTimer: true,
          timerSeconds: 8,
          hideWordDuringResponse: true,
          requiresCapturedResponse: true,
        },
        measurementRisks: [
          "Do not claim mastery unless speech or keyboard capture proves the answer.",
          "No visual answer context should remain during the response window.",
        ],
      },
    ],
  },
  {
    id: "spell-check",
    label: "Spell Check",
    nodeType: "spell-check",
    purposes: ["practice", "evaluate", "independent-retrieval"],
    domains: ["spelling", "vocabulary"],
    strengths: [
      "Can verify targeted spelling after practice if the target word is hidden.",
      "Works as a second measurement after scaffolded practice.",
    ],
    weakFor: ["science-concept-modeling", "story-comprehension"],
    goodFitWhen: [
      "The activity records each word with targetResults.",
      "The word is prompted by audio or sentence context instead of being visible.",
    ],
    badFitWhen: [
      "The UI displays the answer or accepts fuzzy matches as mastery.",
      "Only aggregate accuracy is available.",
    ],
    scaffolds: ["retry"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice"],
      contaminationRisks: ["retry"],
    },
    measures: [
      "Spelling construction from an audio, sentence, or hidden-word prompt.",
      "Letter-order accuracy and recovery after an error.",
      "Whether the child can produce a target word with limited support.",
    ],
    configKnobs: [
      "promptMode",
      "hideTargetWord",
      "maxRetries",
      "letterBankMode",
      "perTargetResults",
      "hintPolicy",
    ],
    realDifficultyLevels: [
      "guided_letter_build: supported practice with retry or visible letter options.",
      "audio_prompt_spell: target hidden, child spells from hearing/context.",
      "cold_recall_spell: no answer display and no retry before score.",
    ],
    signalsEmitted: [
      "per-target correct/incorrect",
      "attempt text",
      "retry count",
      "completion accuracy",
    ],
    signalsMissing: [
      "Independent mastery if visible answer, retries, or hints occur before scoring.",
      "Reliable reading fluency; it primarily measures spelling construction.",
      "Frustration/hesitation unless game_state_update includes timing and misses.",
    ],
    psychologistGuidance: [
      "Use after a warmup when Sunny needs cleaner spelling evidence.",
      "Treat retry-heavy or hinted runs as practice, not mastery.",
      "Avoid when the child is frustrated by isolated letter selection; route to a flow activity first.",
    ],
    capabilityModes: [
      {
        id: "guided_letter_build",
        label: "Guided Letter Build",
        difficulty: 1,
        purpose: "guided-practice",
        skillTargets: ["spell_from_memory", "visual_recognition"],
        inputModes: ["typing", "click", "visual"],
        scaffolds: ["letter-tiles", "hint", "retry"],
        evidenceType: "practice",
        masteryEligible: false,
        config: {
          promptMode: "visible-or-audio",
          hideTargetWord: false,
          maxRetries: 2,
          letterBankMode: "supported",
        },
        measurementRisks: [
          "Visible letters and retries support practice but contaminate mastery.",
        ],
      },
      {
        id: "audio_prompt_spell",
        label: "Audio Prompt Spell",
        difficulty: 2,
        purpose: "evaluate",
        skillTargets: ["spell_from_memory", "auditory_retrieval"],
        inputModes: ["typing", "voice"],
        scaffolds: ["retry"],
        evidenceType: "diagnostic",
        masteryEligible: "requires_captured_response",
        config: {
          promptMode: "audio",
          hideTargetWord: true,
          maxRetries: 1,
          requiresCapturedResponse: true,
        },
        measurementRisks: [
          "One retry is useful for correction but should downgrade mastery confidence.",
        ],
      },
      {
        id: "cold_recall_spell",
        label: "Cold Recall Spell",
        difficulty: 3,
        purpose: "independent-retrieval",
        skillTargets: ["spell_from_memory", "retrieval_practice"],
        inputModes: ["typing", "voice"],
        scaffolds: [],
        evidenceType: "mastery",
        masteryEligible: "requires_captured_response",
        config: {
          promptMode: "audio-or-definition",
          hideTargetWord: true,
          maxRetries: 0,
          requiresCapturedResponse: true,
        },
        measurementRisks: [
          "Only use as mastery when exact response capture is available.",
        ],
      },
    ],
  },
  {
    id: "monster-stampede",
    label: "Monster Stampede",
    nodeType: "monster-stampede",
    purposes: ["practice", "fluency", "reward"],
    domains: ["spelling", "vocabulary"],
    strengths: [
      "Reinforces a bounded spelling cohort after initial measurement.",
      "Adds high-energy repetition without pretending to be the clean baseline.",
    ],
    weakFor: ["initial-baseline", "mastery-gating", "independent-retrieval"],
    goodFitWhen: [
      "Word Radar and Spell Check have already scoped the target cohort.",
      "Sunny wants whole-list spelling exposure to feel like movement, not another drill.",
    ],
    badFitWhen: [
      "It is used as the first source of evidence for unknown words.",
      "Aggregate arcade success would be treated as proof of transfer or mastery.",
    ],
    scaffolds: ["visible-word", "retry"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: false,
      requiresPerTargetResult: false,
      allowedEvidence: ["practice", "reward"],
      contaminationRisks: ["visible-word", "retry"],
    },
    measures: [
      "Fast orthographic recognition and spelling under time pressure.",
      "Recovery after misses and willingness to stay in the loop.",
      "Engagement with movement, speed, competition, and streaks.",
    ],
    configKnobs: [
      "speedMode",
      "cohortSize",
      "wordOrder",
      "visibleWordMode",
      "missPenalty",
      "streakRewards",
    ],
    realDifficultyLevels: [
      "visible_stampede: fast supported practice with visible word cues.",
      "targeted_recovery_run: retargets recent misses in a short arcade loop.",
      "pressure_probe: faster pacing with reduced cues, still practice-first.",
    ],
    signalsEmitted: [
      "hit/miss events",
      "streaks",
      "recovery after miss",
      "completion/score",
    ],
    signalsMissing: [
      "Clean first-pass baseline for unknown words.",
      "Transfer to paper spelling or delayed recall.",
      "Mastery proof when visible word or retries are available.",
    ],
    psychologistGuidance: [
      "Use as flow practice after baseline or targeted misses are known.",
      "Great for confidence, speed, and competition; practice, not mastery.",
      "Avoid as the first measurement for an unknown homework list.",
    ],
    capabilityModes: [
      {
        id: "visible_stampede",
        label: "Visible Stampede",
        difficulty: 1,
        purpose: "practice",
        skillTargets: ["visual_recognition", "typing_fluency"],
        inputModes: ["typing", "visual"],
        scaffolds: ["visible-word", "retry"],
        evidenceType: "practice",
        masteryEligible: false,
        config: {
          speedMode: "standard",
          visibleWordMode: true,
          missPenalty: "gentle",
          streakRewards: true,
        },
        measurementRisks: [
          "Visible words make this recognition/typing practice.",
        ],
      },
      {
        id: "targeted_recovery_run",
        label: "Targeted Recovery Run",
        difficulty: 2,
        purpose: "fluency",
        skillTargets: ["spell_from_memory", "retrieval_practice", "typing_fluency"],
        inputModes: ["typing", "visual"],
        scaffolds: ["retry"],
        evidenceType: "practice",
        masteryEligible: false,
        config: {
          speedMode: "medium",
          wordOrder: "misses-first",
          missPenalty: "combo-break",
          streakRewards: true,
        },
        measurementRisks: [
          "Retargeted misses are excellent practice but not independent transfer.",
        ],
      },
      {
        id: "pressure_probe",
        label: "Pressure Probe",
        difficulty: 3,
        purpose: "fluency",
        skillTargets: ["spell_from_memory", "typing_fluency", "attention_control"],
        inputModes: ["typing"],
        scaffolds: [],
        evidenceType: "practice",
        masteryEligible: false,
        config: {
          speedMode: "fast",
          visibleWordMode: false,
          missPenalty: "full-combo-break",
          streakRewards: true,
        },
        measurementRisks: [
          "Stress and timing can suppress performance, so use with attention/frustration context.",
        ],
      },
    ],
  },
  {
    id: "letter-rush",
    label: "Letter Rush",
    nodeType: "letter-rush",
    purposes: ["evaluate", "practice", "fluency", "independent-retrieval"],
    domains: ["spelling", "vocabulary"],
    strengths: [
      "Runs spelling as a fast arcade loop while keeping the mode selected by config.",
      "Supports clean hidden-word recall for baseline or mastery run evidence.",
      "Supports visual recognition and imposter discrimination as practice-only modes.",
    ],
    weakFor: ["science-concept-modeling", "reading-comprehension-transfer"],
    goodFitWhen: [
      "The AI has selected a config mode such as hear-and-spell, read-and-race, trap-the-imposter, or mastery-run.",
      "Sunny needs per-word spelling evidence while preserving an arcade feel.",
      "The mode is mastery-run only after earlier practice has targeted known misses.",
    ],
    badFitWhen: [
      "The visible word, letter bank, retry-before-score, or companion hint would be treated as mastery.",
      "The config tries to let the child switch modes instead of using the AI-selected mode.",
      "The assignment is a science concept that needs visual teaching before vocabulary practice.",
    ],
    scaffolds: [],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "mastery"],
      contaminationRisks: ["visible-word", "letter-tiles", "retry", "companion-coaching"],
    },
  },
  {
    id: "karaoke",
    label: "Story Karaoke",
    nodeType: "karaoke",
    purposes: ["guided-practice", "fluency"],
    domains: ["reading", "science", "vocabulary"],
    strengths: [
      "Builds reading fluency and context around homework words.",
      "Lets the child hear and see academic language in a story wrapper.",
    ],
    weakFor: ["independent-recall", "mastery-gating"],
    goodFitWhen: [
      "The child needs repetition in context after direct teaching.",
      "Sunny wants engagement and exposure, not a clean baseline.",
    ],
    badFitWhen: [
      "The passage itself reveals the target answer.",
      "Sunny needs isolated transfer evidence.",
    ],
    scaffolds: ["visible-word", "model-answer", "companion-coaching"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: false,
      requiresPerTargetResult: false,
      allowedEvidence: ["practice", "companion"],
      contaminationRisks: ["visible-word", "model-answer", "companion-coaching"],
    },
  },
  {
    id: "word-builder",
    label: "Word Builder",
    nodeType: "word-builder",
    purposes: ["practice", "guided-practice"],
    domains: ["spelling", "vocabulary"],
    strengths: [
      "Helps the child assemble unfamiliar words with support.",
      "Useful between baseline and independent recall.",
    ],
    weakFor: ["independent-recall", "mastery-gating"],
    goodFitWhen: [
      "The word is hard and needs chunking or pattern support.",
      "Sunny is intentionally practicing, not evaluating.",
    ],
    badFitWhen: [
      "Letter tiles reveal too much for baseline evidence.",
      "Sunny needs to know if the child can spell the word cold.",
    ],
    scaffolds: ["letter-tiles", "hint", "retry"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: false,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice"],
      contaminationRisks: ["letter-tiles", "hint", "retry"],
    },
  },
  {
    id: "speed-catcher",
    label: "Speed Catcher",
    nodeType: "speed-catcher",
    purposes: ["practice", "fluency", "reward"],
    domains: ["spelling", "vocabulary", "reading"],
    strengths: [
      "Turns falling words into quick recognition practice.",
      "Good for near-miss spelling discrimination after baseline evidence exists.",
    ],
    weakFor: ["independent-recall", "reading-comprehension", "mastery-gating"],
    goodFitWhen: [
      "The planner needs a falling-word arcade loop for known target words.",
      "Distractors are generated from real error patterns or high-frequency confusions.",
    ],
    badFitWhen: [
      "Visible multiple-choice catching is treated as spelling mastery.",
      "The child needs slow decoding support rather than speed.",
    ],
    scaffolds: ["visible-word", "retry"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: false,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "reward"],
      contaminationRisks: ["visible-word", "retry"],
    },
  },
  {
    id: "wordle",
    label: "Wordle",
    nodeType: "wordle",
    purposes: ["practice", "independent-retrieval"],
    domains: ["spelling", "vocabulary"],
    strengths: [
      "Supports letter-position reasoning and spelling strategy.",
      "Creates useful guess-path evidence when the target set is controlled.",
    ],
    weakFor: ["initial-teaching", "pronunciation", "reading-comprehension"],
    goodFitWhen: [
      "The child likes puzzle control and the word length is appropriate.",
      "Sunny wants strategy practice after exposure to the target word.",
    ],
    badFitWhen: [
      "The target is unknown and guessing would frustrate the child.",
      "Hints or allowed-word filters would be mistaken for cold spelling mastery.",
    ],
    scaffolds: ["hint", "retry"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "mastery"],
      contaminationRisks: ["hint", "retry"],
    },
  },
  {
    id: "vault-cracker",
    label: "Vault Cracker",
    nodeType: "vault-cracker",
    purposes: ["practice", "reward"],
    domains: ["spelling", "vocabulary", "math"],
    strengths: [
      "Uses puzzle pressure as a reward wrapper around known targets.",
      "Can make retrieval feel like cracking a code instead of another drill.",
    ],
    weakFor: ["initial-baseline", "mastery-gating", "reading-fluency"],
    goodFitWhen: [
      "The code mechanic is tied to an explicit target word, clue, or fact.",
      "The child has already received baseline teaching and needs motivating practice.",
    ],
    badFitWhen: [
      "Puzzle mechanics dominate and the academic target becomes incidental.",
      "Attempt limits would spike frustration.",
    ],
    scaffolds: ["hint", "retry"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: false,
      requiresPerTargetResult: false,
      allowedEvidence: ["practice", "reward"],
      contaminationRisks: ["hint", "retry"],
    },
  },
  {
    id: "bd-reversal",
    label: "b/d Reversal",
    nodeType: "bd-reversal",
    purposes: ["evaluate", "practice"],
    domains: ["reading", "spelling"],
    strengths: [
      "Targets a narrow visual discrimination risk.",
      "Can produce quick probe evidence for b/d reversals.",
    ],
    weakFor: ["general-reading", "spelling-list-mastery", "concept-learning"],
    goodFitWhen: [
      "Chart evidence shows b/d confusion or reversal errors.",
      "The probe stays short and logs exact pair/word results.",
    ],
    badFitWhen: [
      "No reversal signal exists and the node would distract from homework.",
      "A timed probe would shame or frustrate the child.",
    ],
    scaffolds: ["hint", "retry"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "mastery"],
      contaminationRisks: ["hint", "retry"],
    },
  },
  {
    id: "clock-game",
    label: "Clock Game",
    nodeType: "clock-game",
    purposes: ["practice", "evaluate"],
    domains: ["math"],
    strengths: [
      "Measures analog clock reading with visual manipulatives.",
      "Supports stepwise difficulty from hours to mixed minutes.",
    ],
    weakFor: ["non-time-math", "reading", "spelling"],
    goodFitWhen: [
      "The assignment or chart target is time telling.",
      "Sunny needs varied prompt evidence, not one fixed time.",
    ],
    badFitWhen: [
      "It is attached to unrelated math homework.",
      "Only one clock prompt is reused as mastery.",
    ],
    scaffolds: ["visible-word", "hint", "retry"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: false,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "mastery"],
      contaminationRisks: ["visible-word", "hint", "retry"],
    },
  },
  {
    id: "coin-counter",
    label: "Coin Counter",
    nodeType: "coin-counter",
    purposes: ["practice", "evaluate"],
    domains: ["math"],
    strengths: [
      "Measures coin identification and value composition.",
      "Visual manipulatives can reduce arithmetic load while teaching money concepts.",
    ],
    weakFor: ["non-money-math", "reading", "spelling"],
    goodFitWhen: [
      "The homework or care plan targets money, skip counting, or value composition.",
      "Sunny controls whether coin values are shown or hidden.",
    ],
    badFitWhen: [
      "Displayed coin values are treated as independent mastery.",
      "The math target is multiplication, division, or unrelated operations.",
    ],
    scaffolds: ["visible-word", "hint", "retry"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: false,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "mastery"],
      contaminationRisks: ["visible-word", "hint", "retry"],
    },
  },
  {
    id: "bubble-pop",
    label: "Bubble Pop",
    nodeType: "bubble-pop",
    purposes: ["attention-screening", "reward"],
    domains: ["attention", "reward"],
    strengths: [
      "Quick low-stakes attention and readiness check.",
      "Can reset energy before returning to academics.",
    ],
    weakFor: ["academic-mastery", "reading", "spelling"],
    goodFitWhen: [
      "Sunny needs attention vitals or a tiny reset.",
      "The child needs a low-pressure transition into work.",
    ],
    badFitWhen: [
      "Arcade score would be interpreted as learning evidence.",
      "The child needs immediate academic support.",
    ],
    scaffolds: ["retry"],
    evidence: {
      writesPracticeEvidence: false,
      writesMasteryEvidence: false,
      requiresPerTargetResult: false,
      allowedEvidence: ["attention", "reward"],
      contaminationRisks: ["retry"],
    },
  },
  {
    id: "cpt-low-reward",
    label: "Quiet Focus",
    nodeType: "cpt-low-reward",
    purposes: ["attention-screening"],
    domains: ["attention"],
    strengths: [
      "Measures sustained attention without heavy reward scaffolding.",
      "Useful as a vitals-style probe across sessions.",
    ],
    weakFor: ["academic-mastery", "reward-recovery", "initial-teaching"],
    goodFitWhen: [
      "The care plan needs attention trend evidence.",
      "The child is calm enough for a low-reward task.",
    ],
    badFitWhen: [
      "The child is already frustrated or needs a relationship repair.",
      "A single run would be overinterpreted as diagnosis.",
    ],
    scaffolds: [],
    evidence: {
      writesPracticeEvidence: false,
      writesMasteryEvidence: false,
      requiresPerTargetResult: true,
      allowedEvidence: ["attention"],
      contaminationRisks: [],
    },
  },
  {
    id: "fish-flanker",
    label: "Fish Flanker",
    nodeType: "fish-flanker",
    purposes: ["attention-screening"],
    domains: ["attention"],
    strengths: [
      "Measures selective attention and interference control.",
      "Produces reaction-time and congruency evidence.",
    ],
    weakFor: ["academic-mastery", "initial-teaching", "spelling"],
    goodFitWhen: [
      "Sunny needs executive-function vitals.",
      "The child can tolerate a short rule-based attention game.",
    ],
    badFitWhen: [
      "The session should prioritize urgent homework or reading support.",
      "The task would feel like punishment after a hard academic node.",
    ],
    scaffolds: ["retry"],
    evidence: {
      writesPracticeEvidence: false,
      writesMasteryEvidence: false,
      requiresPerTargetResult: true,
      allowedEvidence: ["attention"],
      contaminationRisks: ["retry"],
    },
  },
  {
    id: "target-blaster",
    label: "Target Blaster",
    nodeType: "target-blaster",
    purposes: ["attention-screening", "reward"],
    domains: ["attention", "reward"],
    strengths: [
      "Measures visual search and response timing.",
      "High-energy attention check for children who like action.",
    ],
    weakFor: ["academic-mastery", "reading-comprehension", "spelling-recall"],
    goodFitWhen: [
      "The target/distractor set is explicit and short.",
      "Sunny needs attention vitals or a brief earned reward.",
    ],
    badFitWhen: [
      "The game has no target contract.",
      "Arcade score would replace academic evidence.",
    ],
    scaffolds: ["retry"],
    evidence: {
      writesPracticeEvidence: false,
      writesMasteryEvidence: false,
      requiresPerTargetResult: true,
      allowedEvidence: ["attention", "reward"],
      contaminationRisks: ["retry"],
    },
  },
  {
    id: "hero-shield",
    label: "Hero Shield",
    nodeType: "hero-shield",
    purposes: ["attention-screening", "reward"],
    domains: ["attention", "reward"],
    strengths: [
      "Measures inhibition and defensive timing.",
      "Can be framed as confident recovery after academic work.",
    ],
    weakFor: ["academic-mastery", "first-pass-baseline", "reading"],
    goodFitWhen: [
      "Sunny needs attention vitals in a heroic wrapper.",
      "The child has earned a short action break.",
    ],
    badFitWhen: [
      "The child is upset and needs calm support.",
      "The run would be interpreted as curriculum evidence.",
    ],
    scaffolds: ["retry"],
    evidence: {
      writesPracticeEvidence: false,
      writesMasteryEvidence: false,
      requiresPerTargetResult: true,
      allowedEvidence: ["attention", "reward"],
      contaminationRisks: ["retry"],
    },
  },
  {
    id: "pronunciation",
    label: "Pronunciation",
    nodeType: "pronunciation",
    purposes: ["practice", "fluency"],
    domains: ["pronunciation", "reading", "science", "vocabulary"],
    strengths: [
      "Creates high-flow repetition for spoken academic words.",
      "Can reinforce vocabulary from reading or science homework.",
    ],
    weakFor: ["spelling-recall", "written-comprehension"],
    goodFitWhen: [
      "The child skipped, hesitated on, or mispronounced a target word.",
      "The next goal is spoken fluency rather than written mastery.",
    ],
    badFitWhen: [
      "Multi-word phrases are forced when a single target would be smarter.",
      "Speech-to-text near misses are treated as spelling mastery.",
    ],
    scaffolds: ["stt-match", "fuzzy-match", "retry"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: false,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice"],
      contaminationRisks: ["stt-match", "fuzzy-match", "retry"],
    },
    measures: [
      "Read-aloud fluency and pronunciation accuracy for target words.",
      "Decoding struggle through misses, hesitation, support requests, and recovery.",
      "Flow tolerance for spoken word dosage and replay difficulty.",
    ],
    configKnobs: [
      "replayMode",
      "harderReplayGrowth",
      "dosagePolicy",
      "supportMode",
      "chunkHints",
      "sfxProfile",
      "pace",
      "cohortSize",
    ],
    realDifficultyLevels: [
      "supported_read_aloud: short cohort with chunk hints and forgiving match.",
      "flow_replay_expansion: harder replay adds words without breaking streak flow.",
      "diagnostic_reading_probe: stricter capture for reading/pronunciation evidence.",
    ],
    signalsEmitted: [
      "word start",
      "hit/miss",
      "support cue",
      "replay selection",
      "completion accuracy",
    ],
    signalsMissing: [
      "Written spelling mastery.",
      "Reading comprehension beyond word decoding.",
      "Exact phonics error category unless chunk/error detail is captured.",
    ],
    psychologistGuidance: [
      "Choose when reading/pronunciation fluency or low-writing-load practice is the target.",
      "Lower pace and enable support mode after frustration, help requests, or repeated misses.",
      "Let strong mastery expand dosage for flow; the psychologist controls the base size.",
    ],
    capabilityModes: [
      {
        id: "supported_read_aloud",
        label: "Supported Read Aloud",
        difficulty: 1,
        purpose: "guided-practice",
        skillTargets: ["read_fluently", "pronounce"],
        inputModes: ["voice", "reading"],
        scaffolds: ["stt-match", "fuzzy-match", "retry", "model-answer"],
        evidenceType: "practice",
        masteryEligible: false,
        config: {
          replayMode: "same-cohort",
          dosagePolicy: "planner-base",
          supportMode: true,
          chunkHints: true,
          sfxProfile: "arcade",
          pace: "supportive",
        },
        measurementRisks: [
          "Model answer and fuzzy matching make this supported practice.",
        ],
      },
      {
        id: "flow_replay_expansion",
        label: "Flow Replay Expansion",
        difficulty: 2,
        purpose: "fluency",
        skillTargets: ["read_fluently", "pronounce", "retrieval_practice"],
        inputModes: ["voice"],
        scaffolds: ["stt-match", "fuzzy-match", "retry"],
        evidenceType: "practice",
        masteryEligible: false,
        config: {
          replayMode: "harder",
          harderReplayGrowth: "add-bonus-words",
          dosagePolicy: "mastery-expands",
          supportMode: "on-request",
          sfxProfile: "arcade-combo",
          pace: "flow",
        },
        measurementRisks: [
          "Expansion measures flow and fluency, not written transfer.",
        ],
      },
      {
        id: "diagnostic_reading_probe",
        label: "Diagnostic Reading Probe",
        difficulty: 3,
        purpose: "evaluate",
        skillTargets: ["read_fluently", "pronounce", "auditory_retrieval"],
        inputModes: ["voice"],
        scaffolds: ["stt-match"],
        evidenceType: "diagnostic",
        masteryEligible: "requires_captured_response",
        config: {
          replayMode: "none",
          dosagePolicy: "bounded-probe",
          supportMode: false,
          chunkHints: false,
          speechStrictness: "stricter",
          requiresCapturedResponse: true,
        },
        measurementRisks: [
          "STT confidence can misread child speech; review low-confidence misses.",
        ],
      },
    ],
  },
  {
    id: "mystery",
    label: "Mystery Reward",
    nodeType: "mystery",
    purposes: ["reward"],
    domains: ["reward", "spelling", "reading", "science", "vocabulary", "math"],
    strengths: [
      "Adds variable reward and exploration between learning blocks.",
      "Keeps motivation high without pretending to be a baseline evaluator.",
    ],
    weakFor: ["baseline", "mastery-gating", "initial-teaching"],
    goodFitWhen: [
      "The child has completed evidence-generating work and needs a dopamine break.",
      "Sunny wants motivation without updating mastery.",
    ],
    badFitWhen: [
      "Sunny still lacks a baseline.",
      "The result would be used as independent learning evidence.",
    ],
    scaffolds: ["companion-coaching"],
    evidence: {
      writesPracticeEvidence: false,
      writesMasteryEvidence: false,
      requiresPerTargetResult: false,
      allowedEvidence: ["reward"],
      contaminationRisks: ["companion-coaching"],
    },
  },
  {
    id: "wheel-of-fortune",
    label: "Wheel of Fortune",
    nodeType: "wheel-of-fortune",
    purposes: ["practice", "reward"],
    domains: ["spelling", "vocabulary", "reading"],
    strengths: [
      "Adds variable reward and excitement after work is underway.",
      "Useful as a dopamine break that can still touch target words.",
    ],
    weakFor: ["baseline", "mastery-gating", "initial-teaching"],
    goodFitWhen: [
      "The child has already completed serious evidence-generating work.",
      "Sunny wants fun repetition without contaminating mastery.",
    ],
    badFitWhen: [
      "Sunny still lacks baseline evidence.",
      "The child needs direct teaching or clean retrieval.",
    ],
    scaffolds: ["visible-word", "hint", "retry"],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: false,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "reward"],
      contaminationRisks: ["visible-word", "hint", "retry"],
    },
    measures: [
      "Pattern inference from word length, revealed letters, and letter strategy.",
      "Engagement with choice, surprise, competition, and risk/reward pacing.",
      "Vocabulary or spelling familiarity when linked to target words.",
    ],
    configKnobs: [
      "puzzleSource",
      "hintPolicy",
      "wheelRisk",
      "opponentMode",
      "targetWordCount",
      "rewardTiming",
    ],
    realDifficultyLevels: [
      "mystery_reward_word: short target-word reward after work.",
      "pattern_inference: limited hints, target words, and strategic guessing.",
      "strategy_challenge: higher risk wheel and fewer scaffolds.",
    ],
    signalsEmitted: [
      "letter guesses",
      "board state",
      "solve success/failure",
      "coins/reward outcome",
    ],
    signalsMissing: [
      "Cold spelling mastery for the full word list.",
      "Reading fluency or pronunciation.",
      "Transfer evidence unless followed by an independent activity.",
    ],
    psychologistGuidance: [
      "Use as mystery/reward or pattern inference after evidence-generating work.",
      "Excellent for preference and motivation signals; not mastery by itself.",
      "Avoid when the child needs direct teaching or an initial baseline.",
    ],
    capabilityModes: [
      {
        id: "mystery_reward_word",
        label: "Mystery Reward Word",
        difficulty: 1,
        purpose: "reward",
        skillTargets: ["reward_recovery", "visual_recognition"],
        inputModes: ["click", "touch", "visual"],
        scaffolds: ["hint", "visible-word"],
        evidenceType: "reward",
        masteryEligible: false,
        config: {
          puzzleSource: "target-word",
          hintPolicy: "generous",
          wheelRisk: "low",
          rewardTiming: "after-work",
        },
        measurementRisks: [
          "Reward mode prioritizes engagement over clean learning evidence.",
        ],
      },
      {
        id: "pattern_inference",
        label: "Pattern Inference",
        difficulty: 2,
        purpose: "practice",
        skillTargets: ["retrieval_practice", "visual_recognition"],
        inputModes: ["click", "touch", "visual"],
        scaffolds: ["hint", "retry"],
        evidenceType: "practice",
        masteryEligible: false,
        config: {
          puzzleSource: "homework-word",
          hintPolicy: "limited",
          wheelRisk: "medium",
          opponentMode: "companion",
        },
        measurementRisks: [
          "Letter reveals and hints make this inference practice, not cold recall.",
        ],
      },
      {
        id: "strategy_challenge",
        label: "Strategy Challenge",
        difficulty: 3,
        purpose: "reward",
        skillTargets: ["retrieval_practice", "attention_control", "reward_recovery"],
        inputModes: ["click", "touch", "visual"],
        scaffolds: [],
        evidenceType: "reward",
        masteryEligible: false,
        config: {
          puzzleSource: "target-or-transfer-word",
          hintPolicy: "none",
          wheelRisk: "high",
          opponentMode: "competitive",
        },
        measurementRisks: [
          "High-risk play can measure engagement and strategy but not academic transfer alone.",
        ],
      },
    ],
  },
  {
    id: "quest",
    label: "Quest",
    nodeType: "quest",
    configSource: "generated-artifact",
    purposes: ["quest"],
    domains: ["spelling", "reading", "science", "vocabulary", "math"],
    strengths: [
      "Tests the current theory with engaging generated content.",
      "Should carry traceable evidence, target skill, and review state.",
    ],
    weakFor: ["unreviewed-content", "missing-baseline"],
    goodFitWhen: [
      "Captured homework, baseline evidence, and review gate are ready.",
      "The quest directly tests the written theory.",
    ],
    badFitWhen: [
      "The evidence snapshot is blocked.",
      "The activity has no target-results trace.",
    ],
    scaffolds: [],
    measures: [
      "Generated transfer against the current chart theory.",
      "Whether the child can apply baseline practice inside a novel artifact.",
      "Per-target completion, misses, recovery, and support usage.",
    ],
    configKnobs: [
      "chart-derived theory id",
      "artifact validation status",
      "captured homework fingerprint",
      "baseline evidence gate",
      "target words/concepts",
      "review state",
    ],
    realDifficultyLevels: [
      "Brief-only locked destination with no play or measurement.",
      "Validated transfer quest with captured child responses.",
    ],
    signalsEmitted: [
      "artifact validation status",
      "quest completion",
      "per-target results",
      "support usage",
      "chart theory result",
    ],
    signalsMissing: [
      "delayed transfer calibration",
      "returned-test calibration",
      "artifact quality rubric score",
    ],
    psychologistGuidance: [
      "Quest is not a baseline activity; choose it only when chart evidence supports a generated transfer test.",
      "The quest should name the theory it tests and what result would support, revise, or falsify it.",
      "A locked quest is a planning destination, not evidence that the child practiced.",
    ],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "mastery", "quest-gate"],
      contaminationRisks: ["model-answer", "hint"],
    },
    capabilityModes: [
      {
        id: "brief_only_locked",
        label: "Brief Only / Locked",
        difficulty: 1,
        purpose: "quest",
        skillTargets: ["generated_transfer", "retrieval_practice"],
        inputModes: ["mixed"],
        scaffolds: ["model-answer"],
        evidenceType: "generated",
        masteryEligible: false,
        config: {
          artifactStatus: "brief_only",
          playable: false,
          requiresCapturedHomework: true,
          requiresBaselineEvidence: true,
          requiresValidation: true,
        },
        measurementRisks: [
          "Briefs are planning artifacts only; no child evidence exists yet.",
        ],
      },
      {
        id: "validated_transfer_quest",
        label: "Validated Transfer Quest",
        difficulty: 2,
        purpose: "quest",
        skillTargets: ["generated_transfer", "retrieval_practice"],
        inputModes: ["mixed"],
        scaffolds: [],
        evidenceType: "generated",
        masteryEligible: "requires_captured_response",
        config: {
          validationStatus: "passed",
          playable: true,
          requiresPerTargetResult: true,
          requiresTheoryId: true,
        },
        measurementRisks: [
          "Generated engagement can mask weak transfer unless per-target results and delayed calibration are captured.",
        ],
      },
    ],
  },
  {
    id: "boss",
    label: "Boss",
    nodeType: "boss",
    configSource: "generated-artifact",
    purposes: ["boss"],
    domains: ["spelling", "reading", "science", "vocabulary", "math"],
    strengths: [
      "Acts as the high-stakes mastery finale after quest evidence.",
      "Best when tied to a falsifiable theory and prior attempts.",
    ],
    weakFor: ["first-node", "unreviewed-content", "missing-quest-evidence"],
    goodFitWhen: [
      "The quest has produced enough evidence to justify a finale.",
      "Sunny can explain what the boss is testing and why.",
    ],
    badFitWhen: [
      "Quest evidence is missing or inconclusive.",
      "The boss is just a fixed map node with no gate.",
    ],
    scaffolds: [],
    measures: [
      "Final mastery gate for the chart theory after quest evidence exists.",
      "Independent transfer under higher stakes with per-target scoring.",
      "Whether the generated quest theory should be reused, revised, or retired.",
    ],
    configKnobs: [
      "chart-derived boss theory",
      "artifact validation status",
      "quest measurement requirement",
      "mastery threshold",
      "target words/concepts",
      "support policy",
    ],
    realDifficultyLevels: [
      "Locked destination while quest evidence or validation is missing.",
      "Validated mastery boss with captured independent responses.",
    ],
    signalsEmitted: [
      "artifact validation status",
      "boss completion",
      "per-target results",
      "mastery gate result",
      "chart theory result",
    ],
    signalsMissing: [
      "returned-test calibration",
      "delayed transfer calibration",
      "artifact quality rubric score",
    ],
    psychologistGuidance: [
      "Boss is not a baseline activity; choose it only after chart evidence and quest results justify a mastery gate.",
      "The boss should make the current theory accountable to evidence, not merely replay a harder reward game.",
      "A locked boss should remain visible as a destination but must not become playable until evidence gates pass.",
    ],
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "mastery", "quest-gate"],
      contaminationRisks: ["model-answer", "hint"],
    },
    capabilityModes: [
      {
        id: "boss_locked_pending_quest_evidence",
        label: "Locked Pending Quest Evidence",
        difficulty: 2,
        purpose: "boss",
        skillTargets: ["mastery_gate", "generated_transfer"],
        inputModes: ["mixed"],
        scaffolds: ["model-answer"],
        evidenceType: "generated",
        masteryEligible: false,
        config: {
          artifactStatus: "preparing",
          playable: false,
          requiresQuestMeasurement: true,
          requiresBossTheory: true,
        },
        measurementRisks: [
          "A boss before quest evidence is just a harder game, not a mastery gate.",
        ],
      },
      {
        id: "validated_mastery_boss",
        label: "Validated Mastery Boss",
        difficulty: 3,
        purpose: "boss",
        skillTargets: ["mastery_gate", "retrieval_practice", "generated_transfer"],
        inputModes: ["mixed"],
        scaffolds: [],
        evidenceType: "mastery",
        masteryEligible: "requires_captured_response",
        config: {
          requiresQuestMeasurement: true,
          validationStatus: "passed",
          playable: true,
          requiresPerTargetResult: true,
        },
        measurementRisks: [
          "Boss success is not transfer proof until rubric scoring or returned-test calibration confirms it.",
        ],
      },
    ],
  },
  {
    id: "store-game",
    label: "Store",
    nodeType: "store-game",
    purposes: ["reward"],
    domains: ["reward"],
    strengths: [
      "Supports the companion-care relationship with earned choices.",
      "Turns currency into visible motivation without academic claims.",
    ],
    weakFor: ["academic-mastery", "baseline", "initial-teaching"],
    goodFitWhen: [
      "The child has earned a care/reward moment.",
      "The companion chart needs inventory or treat interaction evidence.",
    ],
    badFitWhen: [
      "Store time would replace urgent academic support.",
      "Purchases are not written back to companion care state.",
    ],
    scaffolds: ["companion-coaching"],
    evidence: {
      writesPracticeEvidence: false,
      writesMasteryEvidence: false,
      requiresPerTargetResult: false,
      allowedEvidence: ["reward", "companion"],
      contaminationRisks: ["companion-coaching"],
    },
  },
  {
    id: "asteroid",
    label: "Asteroid",
    nodeType: "dopamine",
    purposes: ["reward"],
    domains: ["reward"],
    strengths: [
      "Short action reward for recovery after evidence-generating work.",
      "Useful as a preference signal for space/action wrappers.",
    ],
    weakFor: ["academic-mastery", "baseline", "initial-teaching"],
    goodFitWhen: [
      "A bounded reward is earned and the child likes fast action.",
      "The planner needs a reset, not learning evidence.",
    ],
    badFitWhen: [
      "The reward budget is unbounded.",
      "The result would be treated as academic progress.",
    ],
    scaffolds: [],
    evidence: {
      writesPracticeEvidence: false,
      writesMasteryEvidence: false,
      requiresPerTargetResult: false,
      allowedEvidence: ["reward"],
      contaminationRisks: [],
    },
  },
  {
    id: "space-frogger",
    label: "Space Frogger",
    nodeType: "dopamine",
    purposes: ["reward"],
    domains: ["reward"],
    strengths: [
      "Navigation reward with novelty and movement.",
      "Good mystery option after the child completes baseline work.",
    ],
    weakFor: ["academic-mastery", "baseline", "initial-teaching"],
    goodFitWhen: [
      "The child has earned a short movement-style reward.",
      "Sunny wants to measure reward preference without contaminating mastery.",
    ],
    badFitWhen: [
      "A reward game appears before the baseline.",
      "The reward is used as evidence for the academic target.",
    ],
    scaffolds: [],
    evidence: {
      writesPracticeEvidence: false,
      writesMasteryEvidence: false,
      requiresPerTargetResult: false,
      allowedEvidence: ["reward"],
      contaminationRisks: [],
    },
  },
  {
    id: "space-invaders",
    label: "Space Invaders",
    nodeType: "dopamine",
    purposes: ["reward"],
    domains: ["reward"],
    strengths: [
      "Fast action reward with competition and score pressure.",
      "Can reset energy after hard cognitive work.",
    ],
    weakFor: ["academic-mastery", "baseline", "initial-teaching"],
    goodFitWhen: [
      "The child has earned a short competitive reward.",
      "The planner wants preference evidence about action/competition.",
    ],
    badFitWhen: [
      "It replaces direct teaching or baseline measurement.",
      "Its score is interpreted as learning evidence.",
    ],
    scaffolds: [],
    evidence: {
      writesPracticeEvidence: false,
      writesMasteryEvidence: false,
      requiresPerTargetResult: false,
      allowedEvidence: ["reward"],
      contaminationRisks: [],
    },
  },
];

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function evidencePolicy(contract: ActivityToolContract): string {
  if (contract.evidence.writesMasteryEvidence) return "mastery-eligible";
  if (contract.evidence.writesPracticeEvidence) return "practice-only";
  return "no-learning-evidence";
}

function planStep(
  step: number,
  toolId: string,
  purpose: ActivityPurpose,
  reason: string,
): InstructionalActivityPlanStep {
  const contract = getActivityToolContract(toolId);
  return {
    step,
    toolId,
    label: contract.label,
    purpose,
    writesMasteryEvidence: contract.evidence.writesMasteryEvidence,
    evidencePolicy: evidencePolicy(contract),
    reason,
  };
}

function primaryDomain(input: InstructionalActivityPlanInput): LearningDomain | "unknown" {
  const contentDomain = normalize(input.contentDomain);
  const practiceDomain = normalize(input.practiceDomain);
  const primarySkill = normalize(input.primarySkill);
  const homeworkId = normalize(input.homeworkId);
  const topic = normalize(input.topic);
  if (contentDomain === "science") return "science";
  if (
    practiceDomain === "spelling" ||
    contentDomain === "spelling" ||
    primarySkill.includes("spell") ||
    homeworkId.includes("spelling") ||
    topic.includes("spelling")
  ) {
    return "spelling";
  }
  if (practiceDomain === "math" || contentDomain === "math") return "math";
  if (practiceDomain === "pronunciation") return "pronunciation";
  if (practiceDomain === "reading" || primarySkill.includes("reading")) return "reading";
  if (practiceDomain === "vocabulary" || contentDomain === "vocabulary") return "vocabulary";
  return "unknown";
}

export function listActivityToolContracts(): ActivityToolContract[] {
  return ACTIVITY_TOOL_CONTRACTS.map((contract) => {
    const runtime =
      ACTIVITY_RUNTIME_CONFIG_BY_ID[contract.id as keyof typeof ACTIVITY_RUNTIME_CONFIG_BY_ID];
    const audit: ActivityPlannerAuditDefaults | undefined =
      ACTIVITY_PLANNER_AUDIT_BY_ID[contract.id as keyof typeof ACTIVITY_PLANNER_AUDIT_BY_ID];
    const capabilityModes: ActivityCapabilityMode[] =
      contract.capabilityModes ?? audit?.capabilityModes ?? [];

    return {
      ...contract,
      gameIds: [...(contract.gameIds ?? runtime?.gameIds ?? [])],
      configSource: contract.configSource ?? runtime?.configSource ?? "unspecified",
      purposes: [...contract.purposes],
      domains: [...contract.domains],
      strengths: [...contract.strengths],
      weakFor: [...contract.weakFor],
      goodFitWhen: [...contract.goodFitWhen],
      badFitWhen: [...contract.badFitWhen],
      scaffolds: [...contract.scaffolds],
      measures: [
        ...(contract.measures ?? audit?.measures ?? EMPTY_ACTIVITY_PLANNER_AUDIT.measures),
      ],
      configKnobs: [
        ...(contract.configKnobs ??
          audit?.configKnobs ??
          EMPTY_ACTIVITY_PLANNER_AUDIT.configKnobs),
      ],
      realDifficultyLevels: [
        ...(contract.realDifficultyLevels ??
          audit?.realDifficultyLevels ??
          EMPTY_ACTIVITY_PLANNER_AUDIT.realDifficultyLevels),
      ],
      signalsEmitted: [
        ...(contract.signalsEmitted ??
          audit?.signalsEmitted ??
          EMPTY_ACTIVITY_PLANNER_AUDIT.signalsEmitted),
      ],
      signalsMissing: [
        ...(contract.signalsMissing ??
          audit?.signalsMissing ??
          EMPTY_ACTIVITY_PLANNER_AUDIT.signalsMissing),
      ],
      psychologistGuidance: [
        ...(contract.psychologistGuidance ??
          audit?.psychologistGuidance ??
          EMPTY_ACTIVITY_PLANNER_AUDIT.psychologistGuidance),
      ],
      traits: traitsForActivity(contract.id),
      evidence: {
        ...contract.evidence,
        allowedEvidence: [...contract.evidence.allowedEvidence],
        contaminationRisks: [...contract.evidence.contaminationRisks],
      },
      capabilityModes: capabilityModes.map((mode) => ({
        ...mode,
        skillTargets: [...mode.skillTargets],
        inputModes: [...mode.inputModes],
        scaffolds: [...mode.scaffolds],
        config: { ...mode.config },
        measurementRisks: [...mode.measurementRisks],
      })),
    };
  });
}

export function getActivityToolContract(id: string): ActivityToolContract {
  const contract = ACTIVITY_TOOL_CONTRACTS.find((item) => item.id === id);
  if (!contract) {
    throw new Error(`Unknown activity tool: ${id}`);
  }
  return listActivityToolContracts().find((item) => item.id === id)!;
}

export function auditActivityToolContracts(): ActivityToolAudit {
  const rows = listActivityToolContracts().map((contract): ActivityToolAuditRow => {
    const issues: string[] = [];
    const policy = evidencePolicy(contract);
    if (!contract.evidence.writesMasteryEvidence && contract.scaffolds.length) {
      issues.push("scaffolded-practice-not-mastery");
    }
    if (contract.evidence.writesMasteryEvidence && !contract.evidence.requiresPerTargetResult) {
      issues.push("mastery-needs-per-target-results");
    }
    if (
      contract.evidence.writesMasteryEvidence &&
      (contract.scaffolds.includes("visible-word") || contract.scaffolds.includes("letter-tiles"))
    ) {
      issues.push("mastery-contaminated-by-visible-answer");
    }
    if (!(contract.id in ACTIVITY_TRAITS_BY_ID)) {
      issues.push("missing-activity-traits");
    }
    return {
      id: contract.id,
      label: contract.label,
      domains: contract.domains,
      purposes: contract.purposes,
      scaffolds: contract.scaffolds,
      evidencePolicy: policy,
      issues,
    };
  });

  return {
    rows,
    blockers: rows.flatMap((row) =>
      row.issues
        .filter((issue) => issue !== "scaffolded-practice-not-mastery")
        .map((issue) => `${row.id}:${issue}`),
    ),
  };
}

export function buildInstructionalActivityPlan(
  input: InstructionalActivityPlanInput,
): InstructionalActivityPlan {
  const domain = primaryDomain(input);
  const learnerState = input.learnerState ?? "unknown";
  const topic = input.topic?.trim() || input.contentDomain || input.practiceDomain || "current homework";
  const steps: InstructionalActivityPlanStep[] = [];

  if (domain === "spelling") {
    steps.push(
      planStep(
        1,
        "spelling-recall",
        "evaluate",
        "Start with hidden-word independent recall so Sunny learns which words are known before practice.",
      ),
      planStep(
        2,
        "word-radar",
        "practice",
        "Use Word Radar after misses are known; it is fast, scaffolded, practice-only targeted repetition.",
      ),
      planStep(
        3,
        "spell-check",
        "evaluate",
        "Re-check the missed targets with per-word results after practice, without visible answers.",
      ),
      planStep(
        4,
        "wheel-of-fortune",
        "reward",
        "Use a reward/practice node only after baseline evidence is protected.",
      ),
    );
  } else if (domain === "science" || domain === "reading") {
    steps.push(
      planStep(
        1,
        "concept-check",
        "evaluate",
        "Start by asking what the child already understands about the concept before deciding how much to teach.",
      ),
      planStep(
        2,
        "visual-explainer",
        "teach",
        "If the concept check shows a gap, teach the idea visually before vocabulary drills.",
      ),
      planStep(
        3,
        "picture-question",
        "guided-practice",
        "Move from teaching into applied questions with per-question evidence.",
      ),
      planStep(
        4,
        "word-radar",
        "practice",
        "Bring in Word Radar after the concept model exists, for vocabulary practice-only momentum.",
      ),
      planStep(
        5,
        "karaoke",
        "guided-practice",
        "Use story/karaoke for contextual fluency, not as clean mastery evidence.",
      ),
    );
  } else {
    steps.push(
      planStep(
        1,
        "concept-check",
        "evaluate",
        "When the domain is unclear, take a small baseline sample before selecting practice tools.",
      ),
      planStep(
        2,
        "visual-explainer",
        "teach",
        "Teach only after the baseline shows the gap.",
      ),
      planStep(
        3,
        "word-radar",
        "practice",
        "Use scaffolded practice after targets are known.",
      ),
    );
  }

  return {
    ...(input.childId ? { childId: input.childId } : {}),
    homeworkId: input.homeworkId ?? null,
    domainSummary: `${domain}${input.practiceDomain ? ` practice=${input.practiceDomain}` : ""}${input.contentDomain ? ` content=${input.contentDomain}` : ""}`,
    topic,
    learnerState,
    steps,
    notes: [
      "Evaluator evidence must be per-target before it can affect mastery.",
      "Practice wins can route the next node, but they should not overwrite baseline evidence.",
    ],
  };
}
