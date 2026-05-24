import type { NodeConfig } from "../shared/adventureTypes";

export type EvidenceTier =
  | "practice"
  | "clean_recall"
  | "mastery_candidate"
  | "calibration_required";

export type TargetPurpose =
  | "spell_from_memory"
  | "recall_from_memory"
  | "recognize"
  | "read_fluently"
  | "pronounce"
  | "reinforce"
  | "unknown";

export type ActivityIntentPurpose =
  | "spelling_production_from_memory"
  | "recognition_recall_scan"
  | "fluency_auditory_discrimination_probe"
  | "high_energy_reinforcement"
  | "spelling_measurement_instrument"
  | "playful_retrieval_probe"
  | "fast_recognition_under_pressure"
  | "spelling_construction_support"
  | "orthographic_reasoning"
  | "generated_hypothesis_intervention"
  | "mastery_gated_finale";

export type TargetSelectorKind =
  | "production_targets"
  | "due_or_fragile_recall"
  | "high_frequency_or_confusion"
  | "fragile_reinforcement"
  | "baseline_pattern_mastery"
  | "fragile_or_recent_miss"
  | "known_but_slow_or_fragile"
  | "construction_support"
  | "strategic_spelling"
  | "quest_ready_targets"
  | "boss_mastery_targets";

export type ActivityIntentTarget = {
  target: string;
  targetPurpose?: TargetPurpose;
  compatibleWithActivity?: boolean;
  reasons: string[];
  evidenceTypes: string[];
  score: number;
};

export type CompanionSpeechPolicy = {
  mentionOnlyCurrentSnapshot: boolean;
  answerVisibility: "visible" | "hidden_until_reveal";
  canSpeakTargetBeforeReveal: boolean;
};

export type ActivityIntent = {
  intentId: string;
  activityId: string;
  nodeId: string;
  purpose: ActivityIntentPurpose;
  carePlanHypothesis: string;
  targetSelector: TargetSelectorKind;
  acceptedTargetPurposes: TargetPurpose[];
  selectedTargets: ActivityIntentTarget[];
  diagnosticQuestion: string;
  expectedEvidence: string[];
  successCriteria: string[];
  reviseCriteria: string[];
  falsifyCriteria: string[];
  evidenceTier: EvidenceTier;
  masteryEligible: boolean;
  companionSpeechPolicy: CompanionSpeechPolicy;
  createdAt: string;
};

export type TargetSelectorDecision = {
  selectorId: string;
  activityId: string;
  nodeId: string;
  targetSelector: TargetSelectorKind;
  selectedTargets: string[];
  targetReasons: ActivityIntentTarget[];
  sourceEvidence: string[];
  avoidedTargets: string[];
  traceSummary: string;
  createdAt: string;
};

export type ActivityIntentEvidence = {
  recentMisses?: string[];
  fragileTargets?: string[];
  slowTargets?: string[];
  scaffoldedTargets?: string[];
  pronunciationConfusions?: string[];
  sm2DueWords?: string[];
  carePlanTargets?: string[];
  homeworkWords?: string[];
  highFrequencyWords?: string[];
  recentCorrect?: string[];
  recentlyUsedByActivity?: Record<string, string[]>;
};

type IntentProfile = {
  purpose: ActivityIntentPurpose;
  targetSelector: TargetSelectorKind;
  acceptedTargetPurposes: TargetPurpose[];
  diagnosticQuestion: string;
  expectedEvidence: string[];
  successCriteria: string[];
  reviseCriteria: string[];
  falsifyCriteria: string[];
  evidenceTier: EvidenceTier;
  masteryEligible: boolean;
  companionSpeechPolicy?: Partial<CompanionSpeechPolicy>;
};

const DEFAULT_HYPOTHESIS =
  "The care plan must test the selected skill with chart evidence before changing the next plan.";

const DEFAULT_POLICY: CompanionSpeechPolicy = {
  mentionOnlyCurrentSnapshot: true,
  answerVisibility: "visible",
  canSpeakTargetBeforeReveal: true,
};

const INTENT_PROFILES: Partial<Record<NodeConfig["type"] | string, IntentProfile>> = {
  "spell-check": {
    purpose: "spelling_production_from_memory",
    targetSelector: "production_targets",
    acceptedTargetPurposes: ["spell_from_memory", "recall_from_memory", "reinforce", "unknown"],
    diagnosticQuestion: "Can the child spell the target from memory with limited scaffold support?",
    expectedEvidence: ["targetResults", "attemptedValue", "wrongLetters", "scaffoldLevel", "retries"],
    successCriteria: ["80% or better with low scaffold support", "misses recover after one cue"],
    reviseCriteria: ["repeated letter-order errors", "help request before attempting"],
    falsifyCriteria: ["cannot attempt without full model", "frustration or refusal during production"],
    evidenceTier: "practice",
    masteryEligible: false,
  },
  "word-radar": {
    purpose: "recognition_recall_scan",
    targetSelector: "due_or_fragile_recall",
    acceptedTargetPurposes: ["spell_from_memory", "recall_from_memory", "reinforce", "unknown"],
    diagnosticQuestion: "Can the child recognize or recall due words under timed pressure?",
    expectedEvidence: ["targetResults", "responseTime_ms", "missedWords", "slowTargets", "recallMode"],
    successCriteria: ["fast accurate responses in hidden or captured recall mode"],
    reviseCriteria: ["known words are slow", "visual mode succeeds but hidden recall drops"],
    falsifyCriteria: ["timer creates frustration before useful evidence"],
    evidenceTier: "clean_recall",
    masteryEligible: true,
  },
  pronunciation: {
    purpose: "fluency_auditory_discrimination_probe",
    targetSelector: "high_frequency_or_confusion",
    acceptedTargetPurposes: ["recognize", "read_fluently", "pronounce", "spell_from_memory", "unknown"],
    diagnosticQuestion: "Can the child read and say the target clearly, and recover after a model?",
    expectedEvidence: ["targetResults", "misses", "recoveryAfterModel", "retries", "heatModeVitals"],
    successCriteria: ["target is read accurately after low support"],
    reviseCriteria: ["same target needs repeated model", "confuses nearby sounds or words"],
    falsifyCriteria: ["speech recognition is too noisy to trust for the target"],
    evidenceTier: "practice",
    masteryEligible: false,
  },
  "monster-stampede": {
    purpose: "high_energy_reinforcement",
    targetSelector: "fragile_reinforcement",
    acceptedTargetPurposes: ["spell_from_memory", "recall_from_memory", "reinforce", "unknown"],
    diagnosticQuestion: "Can the child keep practicing fragile words without heavy writing load?",
    expectedEvidence: ["targetResults", "wrongTiles", "hints", "persistence", "flowState"],
    successCriteria: ["high engagement with improving accuracy"],
    reviseCriteria: ["repeated wrong tile pattern", "engagement without accuracy"],
    falsifyCriteria: ["energy format masks actual spelling weakness"],
    evidenceTier: "practice",
    masteryEligible: false,
  },
  "letter-rush": {
    purpose: "spelling_measurement_instrument",
    targetSelector: "baseline_pattern_mastery",
    acceptedTargetPurposes: ["spell_from_memory", "recall_from_memory", "reinforce", "unknown"],
    diagnosticQuestion: "Can the child produce spelling evidence strong enough for a mastery candidate?",
    expectedEvidence: ["targetResults", "letterResults", "timing", "distractors", "bonusRisk"],
    successCriteria: ["clean recall with low error and stable timing"],
    reviseCriteria: ["specific letter or pattern errors repeat"],
    falsifyCriteria: ["practice success does not survive clean recall"],
    evidenceTier: "mastery_candidate",
    masteryEligible: true,
  },
  "wheel-of-fortune": {
    purpose: "playful_retrieval_probe",
    targetSelector: "fragile_or_recent_miss",
    acceptedTargetPurposes: ["spell_from_memory", "recall_from_memory", "reinforce", "unknown"],
    diagnosticQuestion: "Can a fragile word be retrieved playfully without exposing the answer too early?",
    expectedEvidence: ["guessedLetters", "wrongGuesses", "solveState", "helpRequests", "persistence"],
    successCriteria: ["solves or meaningfully narrows a fragile word without answer leak"],
    reviseCriteria: ["wrong guesses cluster around a spelling pattern", "needs clue escalation"],
    falsifyCriteria: ["answer is exposed before reveal", "target repeats without new evidence"],
    evidenceTier: "practice",
    masteryEligible: false,
    companionSpeechPolicy: {
      answerVisibility: "hidden_until_reveal",
      canSpeakTargetBeforeReveal: false,
    },
  },
  "speed-catcher": {
    purpose: "fast_recognition_under_pressure",
    targetSelector: "known_but_slow_or_fragile",
    acceptedTargetPurposes: ["recognize", "read_fluently", "spell_from_memory", "unknown"],
    diagnosticQuestion: "Can the child identify known but slow targets under pressure?",
    expectedEvidence: ["choiceAccuracy", "timeouts", "wrongChoice", "responseTime_ms", "flowState"],
    successCriteria: ["accurate choices with improving speed"],
    reviseCriteria: ["timeouts on otherwise known targets"],
    falsifyCriteria: ["speed pressure causes frustration without diagnostic value"],
    evidenceTier: "practice",
    masteryEligible: false,
  },
  "word-builder": {
    purpose: "spelling_construction_support",
    targetSelector: "construction_support",
    acceptedTargetPurposes: ["spell_from_memory", "recall_from_memory", "reinforce", "unknown"],
    diagnosticQuestion: "Can the child construct the word with support and hints?",
    expectedEvidence: ["constructedValue", "hints", "targetResults"],
    successCriteria: ["construction improves with reduced hints"],
    reviseCriteria: ["needs the same hint repeatedly"],
    falsifyCriteria: ["construction support does not produce independent recall evidence"],
    evidenceTier: "practice",
    masteryEligible: false,
  },
  wordle: {
    purpose: "orthographic_reasoning",
    targetSelector: "strategic_spelling",
    acceptedTargetPurposes: ["spell_from_memory", "recall_from_memory", "reinforce", "unknown"],
    diagnosticQuestion: "Can the child reason about spelling patterns from letter-state feedback?",
    expectedEvidence: ["guesses", "letterStateEvidence", "targetResults", "answerVisibility"],
    successCriteria: ["uses feedback to narrow the target"],
    reviseCriteria: ["guesses do not respond to feedback"],
    falsifyCriteria: ["hidden-answer policy or target evidence is missing"],
    evidenceTier: "practice",
    masteryEligible: false,
    companionSpeechPolicy: {
      answerVisibility: "hidden_until_reveal",
      canSpeakTargetBeforeReveal: false,
    },
  },
  quest: {
    purpose: "generated_hypothesis_intervention",
    targetSelector: "quest_ready_targets",
    acceptedTargetPurposes: ["spell_from_memory", "recall_from_memory", "recognize", "read_fluently", "pronounce", "reinforce", "unknown"],
    diagnosticQuestion: "Does the generated quest test the active care-plan hypothesis?",
    expectedEvidence: ["targetResults", "hypothesisTest", "validationStatus", "activityResult"],
    successCriteria: ["quest evidence supports the hypothesis with calibrated targets"],
    reviseCriteria: ["quest evidence is incomplete or points to a different support need"],
    falsifyCriteria: ["generated content is unrelated to chart evidence"],
    evidenceTier: "calibration_required",
    masteryEligible: false,
  },
  boss: {
    purpose: "mastery_gated_finale",
    targetSelector: "boss_mastery_targets",
    acceptedTargetPurposes: ["spell_from_memory", "recall_from_memory", "reinforce", "unknown"],
    diagnosticQuestion: "Is there enough quest-supported evidence for a mastery-gated finale?",
    expectedEvidence: ["finalProofAttempt", "failureCriteria", "chartUpdate", "questReadiness"],
    successCriteria: ["final proof is clean and tied to prior quest evidence"],
    reviseCriteria: ["boss reveals remaining fragile target"],
    falsifyCriteria: ["boss launched before quest evidence supports readiness"],
    evidenceTier: "calibration_required",
    masteryEligible: false,
  },
};

function normalizeTarget(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeTargetPurpose(value: unknown): TargetPurpose {
  const text = String(value ?? "").trim().toLowerCase();
  if (
    text === "spell_from_memory" ||
    text === "recall_from_memory" ||
    text === "recognize" ||
    text === "read_fluently" ||
    text === "pronounce" ||
    text === "reinforce"
  ) {
    return text;
  }
  return "unknown";
}

function purposeForEvidenceType(evidenceType: string): TargetPurpose {
  if (evidenceType === "high_frequency_word") return "recognize";
  if (evidenceType === "pronunciation_confusion") return "pronounce";
  if (evidenceType === "slow_target") return "read_fluently";
  if (
    evidenceType === "recent_miss" ||
    evidenceType === "fragile_target" ||
    evidenceType === "scaffold_use" ||
    evidenceType === "sm2_due" ||
    evidenceType === "care_plan_priority"
  ) {
    return "reinforce";
  }
  if (evidenceType === "homework_target" || evidenceType === "activity_target") {
    return "unknown";
  }
  return "unknown";
}

export function acceptedTargetPurposesForActivity(activityId: string): TargetPurpose[] {
  return profileForNode(activityId).acceptedTargetPurposes;
}

export function isTargetPurposeCompatibleWithActivity(input: {
  activityId: string;
  targetPurpose: unknown;
}): { compatible: boolean; acceptedTargetPurposes: TargetPurpose[]; targetPurpose: TargetPurpose } {
  const targetPurpose = normalizeTargetPurpose(input.targetPurpose);
  const acceptedTargetPurposes = acceptedTargetPurposesForActivity(input.activityId);
  return {
    compatible: acceptedTargetPurposes.includes(targetPurpose) || targetPurpose === "unknown",
    acceptedTargetPurposes,
    targetPurpose,
  };
}

function uniqueTargets(values: unknown[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const text = normalizeTarget(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function addCandidate(
  candidates: Map<string, ActivityIntentTarget>,
  target: string,
  score: number,
  reason: string,
  evidenceType: string,
  activityId: string,
): void {
  const normalized = normalizeTarget(target);
  if (!normalized) return;
  const existing =
    candidates.get(normalized) ??
    {
      target: normalized,
      targetPurpose: purposeForEvidenceType(evidenceType),
      compatibleWithActivity: true,
      reasons: [],
      evidenceTypes: [],
      score: 0,
    };
  const purpose = purposeForEvidenceType(evidenceType);
  if (existing.targetPurpose === "unknown" && purpose !== "unknown") {
    existing.targetPurpose = purpose;
  }
  existing.compatibleWithActivity =
    isTargetPurposeCompatibleWithActivity({
      activityId,
      targetPurpose: existing.targetPurpose,
    }).compatible;
  existing.score += score;
  if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
  if (!existing.evidenceTypes.includes(evidenceType)) existing.evidenceTypes.push(evidenceType);
  candidates.set(normalized, existing);
}

function sourcePriorityForSelector(
  selector: TargetSelectorKind,
): Array<{ key: keyof ActivityIntentEvidence; score: number; reason: string; evidenceType: string }> {
  switch (selector) {
    case "fragile_or_recent_miss":
      return [
        { key: "recentMisses", score: 100, reason: "recent miss", evidenceType: "recent_miss" },
        { key: "fragileTargets", score: 85, reason: "fragile target", evidenceType: "fragile_target" },
        { key: "scaffoldedTargets", score: 70, reason: "needed scaffold support", evidenceType: "scaffold_use" },
        { key: "pronunciationConfusions", score: 65, reason: "pronunciation confusion", evidenceType: "pronunciation_confusion" },
        { key: "sm2DueWords", score: 50, reason: "spaced repetition due", evidenceType: "sm2_due" },
        { key: "carePlanTargets", score: 40, reason: "care-plan priority", evidenceType: "care_plan_priority" },
        { key: "homeworkWords", score: 20, reason: "homework target", evidenceType: "homework_target" },
      ];
    case "high_frequency_or_confusion":
      return [
        { key: "highFrequencyWords", score: 100, reason: "high-frequency word target", evidenceType: "high_frequency_word" },
        { key: "pronunciationConfusions", score: 90, reason: "pronunciation confusion", evidenceType: "pronunciation_confusion" },
        { key: "recentMisses", score: 70, reason: "recent miss", evidenceType: "recent_miss" },
        { key: "fragileTargets", score: 60, reason: "fragile target", evidenceType: "fragile_target" },
        { key: "homeworkWords", score: 20, reason: "homework target", evidenceType: "homework_target" },
      ];
    case "known_but_slow_or_fragile":
      return [
        { key: "slowTargets", score: 100, reason: "known but slow target", evidenceType: "slow_target" },
        { key: "fragileTargets", score: 80, reason: "fragile target", evidenceType: "fragile_target" },
        { key: "recentMisses", score: 70, reason: "recent miss", evidenceType: "recent_miss" },
        { key: "sm2DueWords", score: 50, reason: "spaced repetition due", evidenceType: "sm2_due" },
        { key: "homeworkWords", score: 20, reason: "homework target", evidenceType: "homework_target" },
      ];
    case "production_targets":
      return [
        { key: "recentMisses", score: 100, reason: "recent miss", evidenceType: "recent_miss" },
        { key: "fragileTargets", score: 85, reason: "fragile target", evidenceType: "fragile_target" },
        { key: "scaffoldedTargets", score: 75, reason: "needed scaffold support", evidenceType: "scaffold_use" },
        { key: "carePlanTargets", score: 45, reason: "care-plan priority", evidenceType: "care_plan_priority" },
        { key: "sm2DueWords", score: 40, reason: "spaced repetition due", evidenceType: "sm2_due" },
        { key: "homeworkWords", score: 20, reason: "homework target", evidenceType: "homework_target" },
      ];
    default:
      return [
        { key: "recentMisses", score: 90, reason: "recent miss", evidenceType: "recent_miss" },
        { key: "fragileTargets", score: 80, reason: "fragile target", evidenceType: "fragile_target" },
        { key: "sm2DueWords", score: 60, reason: "spaced repetition due", evidenceType: "sm2_due" },
        { key: "carePlanTargets", score: 45, reason: "care-plan priority", evidenceType: "care_plan_priority" },
        { key: "homeworkWords", score: 20, reason: "homework target", evidenceType: "homework_target" },
      ];
  }
}

function displayActivity(activityId: string): string {
  if (activityId === "wheel-of-fortune") return "Wheel";
  return activityId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function nodeTargets(node: Pick<NodeConfig, "words" | "wordRadarItems">): string[] {
  return uniqueTargets([
    ...(node.words ?? []),
    ...(node.wordRadarItems ?? []).map((item) => item.display),
  ]);
}

export function selectTargetsForIntent(input: {
  childId: string;
  node: Pick<NodeConfig, "id" | "type" | "words" | "wordRadarItems">;
  targetSelector: TargetSelectorKind;
  evidence?: ActivityIntentEvidence;
  maxTargets?: number;
  now?: Date;
}): TargetSelectorDecision {
  const evidence = input.evidence ?? {};
  const activityId = String(input.node.type);
  const candidates = new Map<string, ActivityIntentTarget>();
  const nodeWords = nodeTargets(input.node);

  for (const source of sourcePriorityForSelector(input.targetSelector)) {
    for (const target of uniqueTargets(evidence[source.key] as string[] | undefined)) {
      addCandidate(candidates, target, source.score, source.reason, source.evidenceType, activityId);
    }
  }
  for (const target of nodeWords) {
    addCandidate(candidates, target, 10, "available in launched activity", "activity_target", activityId);
  }

  const recentlyUsed = new Set(
    uniqueTargets(evidence.recentlyUsedByActivity?.[activityId]),
  );
  const allTargets = [...candidates.values()];
  const sourceBoundary = new Set(uniqueTargets(evidence.homeworkWords));
  const eligibleTargets =
    sourceBoundary.size > 0
      ? allTargets.filter((target) => sourceBoundary.has(target.target))
      : allTargets;
  const offSourceTargets =
    sourceBoundary.size > 0
      ? allTargets
          .map((target) => target.target)
          .filter((target) => !sourceBoundary.has(target))
      : [];
  const hasAlternativeToRecent = allTargets.some((target) => !recentlyUsed.has(target.target));
  for (const target of allTargets) {
    if (recentlyUsed.has(target.target)) {
      target.reasons.push(`recently used by ${displayActivity(activityId)}`);
      target.evidenceTypes.push("avoid_repeat_history");
      if (hasAlternativeToRecent) target.score -= 100;
    } else if (recentlyUsed.size > 0) {
      target.reasons.push(`not recently used by ${displayActivity(activityId)}`);
      target.evidenceTypes.push("avoid_repeat_history");
    }
  }

  const limit =
    input.maxTargets ??
    (activityId === "wheel-of-fortune" ? 1 : Math.max(1, Math.min(10, nodeWords.length || 5)));
  const ranked = eligibleTargets
    .sort((a, b) => b.score - a.score || nodeWords.indexOf(a.target) - nodeWords.indexOf(b.target))
    .slice(0, limit);
  const selectedTargets = ranked.map((target) => target.target);
  const sourceEvidence = [
    ...new Set(ranked.flatMap((target) => target.evidenceTypes)),
  ];
  const avoidedTargets = [
    ...new Set([
      ...offSourceTargets,
      ...[...recentlyUsed].filter((target) => !selectedTargets.includes(target)),
    ]),
  ];
  const targetPhrase =
    selectedTargets.length === 1
      ? `"${selectedTargets[0]}"`
      : selectedTargets.map((target) => `"${target}"`).join(", ");
  const reasonPhrase =
    ranked[0]?.reasons.filter((reason) => !reason.startsWith("recently used")).join(", ") ||
    (sourceBoundary.size > 0
      ? "it was inside the approved homework target set"
      : "it was available in the activity target set");

  return {
    selectorId: [
      "selector",
      input.childId,
      activityId,
      (input.now ?? new Date()).toISOString().replace(/[:.]/g, "-"),
    ].join("-"),
    activityId,
    nodeId: input.node.id,
    targetSelector: input.targetSelector,
    selectedTargets,
    targetReasons: ranked,
    sourceEvidence,
    avoidedTargets,
    traceSummary: `${displayActivity(activityId)} selected ${targetPhrase} because ${reasonPhrase}.`,
    createdAt: (input.now ?? new Date()).toISOString(),
  };
}

function profileForNode(nodeType: string): IntentProfile {
  return INTENT_PROFILES[nodeType] ?? {
    purpose: "generated_hypothesis_intervention",
    targetSelector: "quest_ready_targets",
    acceptedTargetPurposes: ["spell_from_memory", "recall_from_memory", "recognize", "read_fluently", "pronounce", "reinforce", "unknown"],
    diagnosticQuestion: "Does this activity test the active care-plan hypothesis?",
    expectedEvidence: ["targetResults", "completionEvidence", "vitalSigns"],
    successCriteria: ["evidence supports the active care-plan hypothesis"],
    reviseCriteria: ["evidence is incomplete or contradicts the hypothesis"],
    falsifyCriteria: ["activity cannot produce interpretable learning evidence"],
    evidenceTier: "calibration_required",
    masteryEligible: false,
  };
}

export function buildActivityIntent(input: {
  childId: string;
  node: Pick<NodeConfig, "id" | "type" | "words" | "wordRadarItems">;
  carePlanHypothesis?: string;
  evidence?: ActivityIntentEvidence;
  now?: Date;
}): ActivityIntent {
  const profile = profileForNode(String(input.node.type));
  const decision = selectTargetsForIntent({
    childId: input.childId,
    node: input.node,
    targetSelector: profile.targetSelector,
    evidence: input.evidence,
    now: input.now,
  });
  const createdAt = (input.now ?? new Date()).toISOString();
  return {
    intentId: [
      "intent",
      input.childId,
      String(input.node.type),
      input.node.id,
      createdAt.replace(/[:.]/g, "-"),
    ].join("-"),
    activityId: String(input.node.type),
    nodeId: input.node.id,
    purpose: profile.purpose,
    carePlanHypothesis: input.carePlanHypothesis?.trim() || DEFAULT_HYPOTHESIS,
    targetSelector: profile.targetSelector,
    acceptedTargetPurposes: profile.acceptedTargetPurposes,
    selectedTargets: decision.targetReasons,
    diagnosticQuestion: profile.diagnosticQuestion,
    expectedEvidence: profile.expectedEvidence,
    successCriteria: profile.successCriteria,
    reviseCriteria: profile.reviseCriteria,
    falsifyCriteria: profile.falsifyCriteria,
    evidenceTier: profile.evidenceTier,
    masteryEligible: profile.masteryEligible,
    companionSpeechPolicy: {
      ...DEFAULT_POLICY,
      ...(profile.companionSpeechPolicy ?? {}),
    },
    createdAt,
  };
}
