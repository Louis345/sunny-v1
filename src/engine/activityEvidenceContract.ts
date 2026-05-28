export type ActivityEvidenceRole =
  | "recognition_fluency"
  | "scaffolded_spelling_practice"
  | "clean_spelling_recall"
  | "spelling_production"
  | "pressure_mastery_candidate"
  | "construction_support"
  | "practice_fluency"
  | "preference_reward"
  | "read_aloud_fluency"
  | "orthographic_strategy"
  | "visual_discrimination"
  | "generated_transfer"
  | "mastery_gate";

export type ActivityProofStrength =
  | "access"
  | "practice"
  | "diagnostic"
  | "clean_recall_candidate"
  | "mastery_candidate"
  | "preference_only"
  | "calibration_required";

export type ActivityEvidenceContract = {
  activityId: string;
  modeId: string;
  evidenceRole: ActivityEvidenceRole;
  proofStrength: ActivityProofStrength;
  bestFor: string[];
  weakFor: string[];
  contaminationRisks: string[];
  requiresPerTargetEvidence: boolean;
  requiresCapturedResponse: boolean;
  masteryEligible: boolean | "requires_captured_response";
  notes: string[];
  currentGap?: "not_launchable_in_board_contract" | "blocked_for_real_child_sessions";
};

export type PlannerEvidenceModeNote = {
  id: string;
  role: ActivityEvidenceRole;
  strength: ActivityProofStrength;
  risks: string;
  proof: string;
};

export type PlannerActivityEvidenceFields = {
  evidenceRole: ActivityEvidenceRole;
  proofStrength: ActivityProofStrength;
  bestFor: string[];
  contaminationRisks: string[];
  modeEvidenceNotes: PlannerEvidenceModeNote[];
};

export type ActivityEvidenceAuditInput = {
  id: string;
  label?: string;
  nodeType?: string;
  gameIds?: string[];
  configSource?: string;
  domains?: string[];
  capabilityModes?: Array<{ id: string }>;
};

export type ActivityEvidenceContractAudit = {
  blockers: string[];
  warnings: string[];
};

const DEFAULT_MODE = "default";

export const ACTIVITY_EVIDENCE_CONTRACTS: ActivityEvidenceContract[] = [
  {
    activityId: "spelling-recall",
    modeId: DEFAULT_MODE,
    evidenceRole: "clean_spelling_recall",
    proofStrength: "clean_recall_candidate",
    bestFor: ["cold spelling baseline", "per-word spelling recall"],
    weakFor: ["flow practice", "low-friction engagement"],
    contaminationRisks: [],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: "requires_captured_response",
    notes: ["Conceptually clean, but currently rendered through another activity path."],
    currentGap: "not_launchable_in_board_contract",
  },
  {
    activityId: "word-radar",
    modeId: DEFAULT_MODE,
    evidenceRole: "scaffolded_spelling_practice",
    proofStrength: "practice",
    bestFor: ["fast target exposure", "scaffolded recall practice"],
    weakFor: ["written spelling production proof"],
    contaminationRisks: ["mode-dependent support"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Use the selected mode to decide what evidence the run can prove."],
  },
  {
    activityId: "word-radar",
    modeId: "visible_read",
    evidenceRole: "recognition_fluency",
    proofStrength: "practice",
    bestFor: ["word recognition", "read fluency access", "low-writing-load warmup"],
    weakFor: ["spelling production", "independent recall"],
    contaminationRisks: ["visible-word", "stt-match"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: false,
    notes: ["The child can see the answer, so do not count this as spelling mastery."],
  },
  {
    activityId: "word-radar",
    modeId: "partial_visual_recall",
    evidenceRole: "scaffolded_spelling_practice",
    proofStrength: "practice",
    bestFor: ["supported spelling construction", "fragile word practice"],
    weakFor: ["cold baseline", "mastery gate"],
    contaminationRisks: ["letter-tiles", "word-length cue", "retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: false,
    notes: ["Useful practice, but slots or tiles can inflate recall evidence."],
  },
  {
    activityId: "word-radar",
    modeId: "audio_cued_letter_recall",
    evidenceRole: "scaffolded_spelling_practice",
    proofStrength: "practice",
    bestFor: ["auditory spelling practice", "supported recall from hearing"],
    weakFor: ["cold visual recall", "mastery gate"],
    contaminationRisks: ["letter-tiles", "word-length cue", "retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: false,
    notes: ["Audio plus slots is scaffolded practice, not independent spelling mastery."],
  },
  {
    activityId: "word-radar",
    modeId: "hidden_word_recall",
    evidenceRole: "clean_spelling_recall",
    proofStrength: "clean_recall_candidate",
    bestFor: ["short spaced check", "advanced learner recall proof"],
    weakFor: ["first node for a frustrated learner"],
    contaminationRisks: ["stt-match"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: "requires_captured_response",
    notes: ["Can count as clean recall only when the response is captured and the word is hidden."],
  },
  {
    activityId: "spell-check",
    modeId: DEFAULT_MODE,
    evidenceRole: "spelling_production",
    proofStrength: "diagnostic",
    bestFor: ["spelling from memory", "targeted production evidence"],
    weakFor: ["read fluency", "voice-avoidant child if voice is required"],
    contaminationRisks: ["retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: "requires_captured_response",
    notes: ["Cleanest launchable spelling-production family when configured with hidden target words."],
  },
  {
    activityId: "spell-check",
    modeId: "guided_letter_build",
    evidenceRole: "scaffolded_spelling_practice",
    proofStrength: "practice",
    bestFor: ["supported spelling construction", "after a miss"],
    weakFor: ["cold mastery proof"],
    contaminationRisks: ["letter-tiles", "hint", "retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: false,
    notes: ["Practice mode; downgrade mastery confidence."],
  },
  {
    activityId: "spell-check",
    modeId: "audio_prompt_spell",
    evidenceRole: "spelling_production",
    proofStrength: "diagnostic",
    bestFor: ["auditory retrieval", "spelling production baseline"],
    weakFor: ["read fluency only groups"],
    contaminationRisks: ["retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: "requires_captured_response",
    notes: ["One retry is practice plus diagnostic evidence, not final mastery."],
  },
  {
    activityId: "spell-check",
    modeId: "cold_recall_spell",
    evidenceRole: "spelling_production",
    proofStrength: "mastery_candidate",
    bestFor: ["cold spelling production", "mastery candidate check"],
    weakFor: ["initial teaching", "frustrated learners"],
    contaminationRisks: [],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: "requires_captured_response",
    notes: ["No visible target and no retry before score."],
  },
  {
    activityId: "letter-rush",
    modeId: DEFAULT_MODE,
    evidenceRole: "pressure_mastery_candidate",
    proofStrength: "mastery_candidate",
    bestFor: ["competition wrapper", "spelling under pressure after baseline"],
    weakFor: ["first fragile probe", "slow decoder support"],
    contaminationRisks: ["speed pressure"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: "requires_captured_response",
    notes: ["Treat as pressure evidence; protect baseline first for fragile learners."],
  },
  {
    activityId: "letter-rush",
    modeId: "read_and_race",
    evidenceRole: "recognition_fluency",
    proofStrength: "practice",
    bestFor: ["fast word recognition", "speed preference"],
    weakFor: ["spelling production proof"],
    contaminationRisks: ["visible-word"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Visible target makes this recognition practice."],
  },
  {
    activityId: "letter-rush",
    modeId: "trap_the_imposter",
    evidenceRole: "visual_discrimination",
    proofStrength: "diagnostic",
    bestFor: ["near-miss discrimination", "high-frequency confusions"],
    weakFor: ["written transfer"],
    contaminationRisks: ["multiple-choice"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Diagnostic discrimination, not written spelling mastery."],
  },
  {
    activityId: "letter-rush",
    modeId: "mastery_run",
    evidenceRole: "pressure_mastery_candidate",
    proofStrength: "mastery_candidate",
    bestFor: ["spelling under pressure", "competitive mastery candidate"],
    weakFor: ["unsupported weak targets"],
    contaminationRisks: ["speed pressure"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: "requires_captured_response",
    notes: ["Only use as mastery candidate when exact responses are captured."],
  },
  {
    activityId: "word-builder",
    modeId: DEFAULT_MODE,
    evidenceRole: "construction_support",
    proofStrength: "practice",
    bestFor: ["slow decoder support", "chunking and letter pattern practice"],
    weakFor: ["cold recall", "advanced mastered targets"],
    contaminationRisks: ["letter-tiles", "hint", "retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: false,
    notes: ["Support instrument, not proof of mastery."],
  },
  {
    activityId: "monster-stampede",
    modeId: DEFAULT_MODE,
    evidenceRole: "practice_fluency",
    proofStrength: "practice",
    bestFor: ["flow practice", "confidence", "movement/competition wrapper"],
    weakFor: ["initial baseline", "mastery gate"],
    contaminationRisks: ["visible-word", "retry"],
    requiresPerTargetEvidence: false,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Reinforcement after baseline or known misses."],
  },
  {
    activityId: "monster-stampede",
    modeId: "visible_stampede",
    evidenceRole: "practice_fluency",
    proofStrength: "practice",
    bestFor: ["visible-word flow practice"],
    weakFor: ["spelling production proof"],
    contaminationRisks: ["visible-word", "retry"],
    requiresPerTargetEvidence: false,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Visible words make this recognition and typing fluency practice."],
  },
  {
    activityId: "monster-stampede",
    modeId: "targeted_recovery_run",
    evidenceRole: "practice_fluency",
    proofStrength: "practice",
    bestFor: ["known misses", "recovery practice"],
    weakFor: ["independent transfer"],
    contaminationRisks: ["retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Practice for already-identified misses."],
  },
  {
    activityId: "monster-stampede",
    modeId: "pressure_probe",
    evidenceRole: "practice_fluency",
    proofStrength: "diagnostic",
    bestFor: ["attention under pressure", "typing fluency"],
    weakFor: ["frustrated learners", "mastery gate"],
    contaminationRisks: ["speed pressure"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Pressure can suppress performance; interpret with attention context."],
  },
  {
    activityId: "speed-catcher",
    modeId: DEFAULT_MODE,
    evidenceRole: "practice_fluency",
    proofStrength: "practice",
    bestFor: ["near-miss recognition", "speed preference"],
    weakFor: ["spelling production proof"],
    contaminationRisks: ["visible-word", "multiple-choice", "retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Recognition/discrimination practice after baseline."],
  },
  {
    activityId: "wheel-of-fortune",
    modeId: DEFAULT_MODE,
    evidenceRole: "preference_reward",
    proofStrength: "preference_only",
    bestFor: ["reward", "pattern inference", "motivation"],
    weakFor: ["initial baseline", "mastery gate"],
    contaminationRisks: ["hint", "visible-word", "retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Useful preference and practice signal after evidence-generating work."],
  },
  {
    activityId: "wheel-of-fortune",
    modeId: "mystery_reward_word",
    evidenceRole: "preference_reward",
    proofStrength: "preference_only",
    bestFor: ["reward recovery", "target-word familiarity"],
    weakFor: ["baseline", "mastery gate"],
    contaminationRisks: ["hint", "visible-word"],
    requiresPerTargetEvidence: false,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Reward mode prioritizes engagement."],
  },
  {
    activityId: "wheel-of-fortune",
    modeId: "pattern_inference",
    evidenceRole: "orthographic_strategy",
    proofStrength: "practice",
    bestFor: ["pattern inference", "letter strategy"],
    weakFor: ["cold spelling recall"],
    contaminationRisks: ["hint", "retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Hints and reveals make this practice."],
  },
  {
    activityId: "wheel-of-fortune",
    modeId: "strategy_challenge",
    evidenceRole: "preference_reward",
    proofStrength: "preference_only",
    bestFor: ["risk/reward preference", "strategy challenge"],
    weakFor: ["academic transfer proof"],
    contaminationRisks: [],
    requiresPerTargetEvidence: false,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["High-risk play is engagement evidence unless followed by independent proof."],
  },
  {
    activityId: "pronunciation",
    modeId: DEFAULT_MODE,
    evidenceRole: "read_aloud_fluency",
    proofStrength: "practice",
    bestFor: ["pronunciation", "read aloud fluency", "low writing load"],
    weakFor: ["written spelling mastery"],
    contaminationRisks: ["stt-match", "fuzzy-match", "retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: false,
    notes: ["Voice evidence is not written spelling evidence."],
  },
  {
    activityId: "pronunciation",
    modeId: "supported_read_aloud",
    evidenceRole: "read_aloud_fluency",
    proofStrength: "practice",
    bestFor: ["supported read aloud", "pronunciation confidence"],
    weakFor: ["written spelling mastery"],
    contaminationRisks: ["model-answer", "fuzzy-match", "retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: false,
    notes: ["Supported fluency evidence, not spelling proof."],
  },
  {
    activityId: "pronunciation",
    modeId: "flow_replay_expansion",
    evidenceRole: "read_aloud_fluency",
    proofStrength: "practice",
    bestFor: ["fluency flow", "replay preference"],
    weakFor: ["written transfer"],
    contaminationRisks: ["stt-match", "fuzzy-match", "retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: false,
    notes: ["Expansion measures flow and fluency."],
  },
  {
    activityId: "pronunciation",
    modeId: "diagnostic_reading_probe",
    evidenceRole: "read_aloud_fluency",
    proofStrength: "diagnostic",
    bestFor: ["bounded read aloud probe"],
    weakFor: ["spelling production"],
    contaminationRisks: ["stt-match"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: false,
    notes: ["Review low-confidence speech misses before overinterpreting."],
  },
  {
    activityId: "wordle",
    modeId: DEFAULT_MODE,
    evidenceRole: "orthographic_strategy",
    proofStrength: "practice",
    bestFor: ["letter-position reasoning", "puzzle preference"],
    weakFor: ["initial teaching", "live board truth"],
    contaminationRisks: ["hint", "retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: false,
    notes: ["Blocked for real child sessions until live board truth is fixed."],
    currentGap: "blocked_for_real_child_sessions",
  },
  {
    activityId: "vault-cracker",
    modeId: DEFAULT_MODE,
    evidenceRole: "preference_reward",
    proofStrength: "practice",
    bestFor: ["puzzle motivation", "known target retrieval practice"],
    weakFor: ["initial baseline", "mastery gate"],
    contaminationRisks: ["hint", "retry"],
    requiresPerTargetEvidence: false,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Puzzle wrapper should not dominate the academic target."],
  },
  {
    activityId: "bd-reversal",
    modeId: DEFAULT_MODE,
    evidenceRole: "visual_discrimination",
    proofStrength: "diagnostic",
    bestFor: ["b/d reversal probe", "visual discrimination"],
    weakFor: ["general spelling list mastery"],
    contaminationRisks: ["hint", "retry"],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Narrow probe; only use when chart evidence names this risk."],
  },
  {
    activityId: "mystery",
    modeId: DEFAULT_MODE,
    evidenceRole: "preference_reward",
    proofStrength: "preference_only",
    bestFor: ["choice preference", "motivation"],
    weakFor: ["mastery", "baseline"],
    contaminationRisks: ["companion-coaching"],
    requiresPerTargetEvidence: false,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["Preference evidence only."],
  },
  {
    activityId: "quest",
    modeId: DEFAULT_MODE,
    evidenceRole: "generated_transfer",
    proofStrength: "calibration_required",
    bestFor: ["generated transfer proof"],
    weakFor: ["baseline replacement"],
    contaminationRisks: [],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: "requires_captured_response",
    notes: ["Unlocked only after baseline evidence and a named theory."],
  },
  {
    activityId: "quest",
    modeId: "brief_only_locked",
    evidenceRole: "generated_transfer",
    proofStrength: "calibration_required",
    bestFor: ["locked transfer destination", "planning artifact"],
    weakFor: ["child evidence"],
    contaminationRisks: ["model-answer"],
    requiresPerTargetEvidence: false,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["A locked quest brief is not child performance evidence."],
  },
  {
    activityId: "quest",
    modeId: "validated_transfer_quest",
    evidenceRole: "generated_transfer",
    proofStrength: "calibration_required",
    bestFor: ["transfer test after baseline"],
    weakFor: ["baseline replacement"],
    contaminationRisks: [],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: "requires_captured_response",
    notes: ["Generated quest evidence needs validation and per-target results."],
  },
  {
    activityId: "boss",
    modeId: DEFAULT_MODE,
    evidenceRole: "mastery_gate",
    proofStrength: "calibration_required",
    bestFor: ["mastery-gated finale"],
    weakFor: ["first proof", "reward-only use"],
    contaminationRisks: [],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: "requires_captured_response",
    notes: ["Requires quest evidence first."],
  },
  {
    activityId: "boss",
    modeId: "boss_locked_pending_quest_evidence",
    evidenceRole: "mastery_gate",
    proofStrength: "calibration_required",
    bestFor: ["locked mastery destination"],
    weakFor: ["child evidence"],
    contaminationRisks: ["model-answer"],
    requiresPerTargetEvidence: false,
    requiresCapturedResponse: false,
    masteryEligible: false,
    notes: ["A locked boss is a destination, not a result."],
  },
  {
    activityId: "boss",
    modeId: "validated_mastery_boss",
    evidenceRole: "mastery_gate",
    proofStrength: "calibration_required",
    bestFor: ["final mastery gate after quest evidence"],
    weakFor: ["first proof"],
    contaminationRisks: [],
    requiresPerTargetEvidence: true,
    requiresCapturedResponse: true,
    masteryEligible: "requires_captured_response",
    notes: ["Boss success still needs real-world or delayed calibration."],
  },
];

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function contractKey(activityId: string, modeId = DEFAULT_MODE): string {
  return `${normalize(activityId)}:${normalize(modeId) || DEFAULT_MODE}`;
}

function rowsForActivity(activityId: string, rows = ACTIVITY_EVIDENCE_CONTRACTS): ActivityEvidenceContract[] {
  const id = normalize(activityId);
  return rows.filter((row) => normalize(row.activityId) === id);
}

function summarizeList(values: string[], max = 2): string {
  return values.slice(0, max).join("; ");
}

function proofSummary(row: ActivityEvidenceContract): string {
  const requirements = [
    row.requiresPerTargetEvidence ? "per-target" : "",
    row.requiresCapturedResponse ? "captured-response" : "",
    row.masteryEligible ? `mastery:${row.masteryEligible}` : "",
  ].filter(Boolean);
  return requirements.join(", ") || "practice-only";
}

const PLANNER_MODE_NOTE_ACTIVITY_IDS = new Set(["word-radar", "spell-check", "letter-rush"]);

export function evidenceContractForActivityMode(
  activityId: string,
  modeId = DEFAULT_MODE,
): ActivityEvidenceContract | undefined {
  const rows = rowsForActivity(activityId);
  const requested = normalize(modeId) || DEFAULT_MODE;
  return rows.find((row) => normalize(row.modeId) === requested) ??
    rows.find((row) => normalize(row.modeId) === DEFAULT_MODE);
}

export function evidenceContractForPlannerNode(node: {
  activityId?: string;
  type?: string;
  wordRadarConfig?: { recallMode?: string };
}): ActivityEvidenceContract | undefined {
  const activityId = node.activityId || node.type || "";
  const modeId = activityId === "word-radar" || node.type === "word-radar"
    ? node.wordRadarConfig?.recallMode
    : undefined;
  return evidenceContractForActivityMode(activityId, modeId);
}

export function plannerEvidenceFieldsForActivity(activityId: string): PlannerActivityEvidenceFields {
  const rows = rowsForActivity(activityId);
  const primary = rows.find((row) => row.modeId === DEFAULT_MODE) ?? rows[0];
  if (!primary) {
    return {
      evidenceRole: "practice_fluency",
      proofStrength: "practice",
      bestFor: [],
      contaminationRisks: [],
      modeEvidenceNotes: [],
    };
  }
  return {
    evidenceRole: primary.evidenceRole,
    proofStrength: primary.proofStrength,
    bestFor: primary.bestFor.slice(0, 2),
    contaminationRisks: primary.contaminationRisks.slice(0, 3),
    modeEvidenceNotes: rows
      .filter(() => PLANNER_MODE_NOTE_ACTIVITY_IDS.has(normalize(activityId)))
      .filter((row) => row.modeId !== DEFAULT_MODE)
      .map((row) => ({
        id: row.modeId,
        role: row.evidenceRole,
        strength: row.proofStrength,
        risks: summarizeList(row.contaminationRisks, 3),
        proof: proofSummary(row),
      })),
  };
}

function isSpellingRelevant(activity: ActivityEvidenceAuditInput): boolean {
  const domains = (activity.domains ?? []).map(normalize);
  return domains.includes("spelling") || normalize(activity.id) in ACTIVITY_EVIDENCE_BY_ID;
}

const ACTIVITY_EVIDENCE_BY_ID = ACTIVITY_EVIDENCE_CONTRACTS.reduce<Record<string, true>>((out, row) => {
  out[normalize(row.activityId)] = true;
  return out;
}, {});

function isLaunchableEnoughForContract(activity: ActivityEvidenceAuditInput): boolean {
  if (normalize(activity.id) === "spelling-recall") return false;
  return Boolean(
    activity.nodeType ||
    (activity.gameIds?.length ?? 0) > 0 ||
    activity.configSource === "canvas-message" ||
    activity.configSource === "activity-config-file" ||
    activity.configSource === "query-params" ||
    activity.configSource === "generated-artifact" ||
    activity.configSource === "reward-game",
  );
}

function masteryNeedsCapturedEvidence(row: ActivityEvidenceContract): boolean {
  return row.masteryEligible === true ||
    row.masteryEligible === "requires_captured_response" ||
    row.proofStrength === "mastery_candidate" ||
    row.proofStrength === "clean_recall_candidate";
}

export function auditActivityEvidenceContracts(
  activities: ActivityEvidenceAuditInput[],
  rows = ACTIVITY_EVIDENCE_CONTRACTS,
): ActivityEvidenceContractAudit {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const rowKeys = new Set(rows.map((row) => contractKey(row.activityId, row.modeId)));
  const activityRows = new Map<string, ActivityEvidenceContract[]>();
  for (const row of rows) {
    const existing = activityRows.get(normalize(row.activityId)) ?? [];
    activityRows.set(normalize(row.activityId), [...existing, row]);
    if (masteryNeedsCapturedEvidence(row) && !row.requiresPerTargetEvidence) {
      blockers.push(`${row.activityId}/${row.modeId}:mastery_requires_per_target_evidence`);
    }
    if (masteryNeedsCapturedEvidence(row) && !row.requiresCapturedResponse) {
      blockers.push(`${row.activityId}/${row.modeId}:mastery_requires_captured_response`);
    }
  }

  for (const activity of activities) {
    if (!isSpellingRelevant(activity)) continue;
    const id = normalize(activity.id);
    const launchable = isLaunchableEnoughForContract(activity);
    const rowsForId = activityRows.get(id) ?? [];
    if (rowsForId.length === 0) {
      if (launchable) {
        blockers.push(`${activity.id}:missing_evidence_contract`);
      }
      continue;
    }
    for (const mode of activity.capabilityModes ?? []) {
      if (!rowKeys.has(contractKey(activity.id, mode.id))) {
        blockers.push(`${activity.id}/${mode.id}:missing_mode_evidence_contract`);
      }
    }
  }

  for (const row of rows) {
    if (row.currentGap) warnings.push(`${row.activityId}:${row.currentGap}`);
  }

  return {
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
  };
}
