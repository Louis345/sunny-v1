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
      allowedEvidence: ["practice", "mastery"],
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
      allowedEvidence: ["practice", "mastery"],
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
      allowedEvidence: ["practice", "mastery"],
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
      allowedEvidence: ["practice", "mastery"],
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
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "mastery", "quest-gate"],
      contaminationRisks: [],
    },
  },
  {
    id: "boss",
    label: "Boss",
    nodeType: "boss",
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
    evidence: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "mastery", "quest-gate"],
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
  return ACTIVITY_TOOL_CONTRACTS.map((contract) => ({
    ...contract,
    purposes: [...contract.purposes],
    domains: [...contract.domains],
    strengths: [...contract.strengths],
    weakFor: [...contract.weakFor],
    goodFitWhen: [...contract.goodFitWhen],
    badFitWhen: [...contract.badFitWhen],
    scaffolds: [...contract.scaffolds],
    measures: [...(contract.measures ?? EMPTY_ACTIVITY_PLANNER_AUDIT.measures)],
    configKnobs: [...(contract.configKnobs ?? EMPTY_ACTIVITY_PLANNER_AUDIT.configKnobs)],
    realDifficultyLevels: [
      ...(contract.realDifficultyLevels ?? EMPTY_ACTIVITY_PLANNER_AUDIT.realDifficultyLevels),
    ],
    signalsEmitted: [...(contract.signalsEmitted ?? EMPTY_ACTIVITY_PLANNER_AUDIT.signalsEmitted)],
    signalsMissing: [...(contract.signalsMissing ?? EMPTY_ACTIVITY_PLANNER_AUDIT.signalsMissing)],
    psychologistGuidance: [
      ...(contract.psychologistGuidance ?? EMPTY_ACTIVITY_PLANNER_AUDIT.psychologistGuidance),
    ],
    traits: traitsForActivity(contract.id),
    evidence: {
      ...contract.evidence,
      allowedEvidence: [...contract.evidence.allowedEvidence],
      contaminationRisks: [...contract.evidence.contaminationRisks],
    },
    capabilityModes: (contract.capabilityModes ?? []).map((mode) => ({
      ...mode,
      skillTargets: [...mode.skillTargets],
      inputModes: [...mode.inputModes],
      scaffolds: [...mode.scaffolds],
      config: { ...mode.config },
      measurementRisks: [...mode.measurementRisks],
    })),
  }));
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
