import type { GeneratedExperienceBrief } from "../context/schemas/learningProfile";
import type { ChoiceEventInput } from "./choiceEvents";

export type QuestBossKind = "quest" | "boss";

export type QuestBossCandidateStatus =
  | "candidate"
  | "spec_invalid"
  | "validation_failed"
  | "validated_available"
  | "selected"
  | "not_selected"
  | "preserved"
  | "discarded"
  | "retired";

export type QuestBossVisualIntensity = "subtle" | "balanced" | "high";

export type QuestBossPalette = {
  background: string;
  surface: string;
  accent: string;
  glow: string;
  text: string;
};

export type QuestBossExperienceSkin = {
  theme: string;
  visualIntensity: QuestBossVisualIntensity;
  worldImagePath?: string;
  cardImagePath?: string;
  palette: QuestBossPalette;
  focalObject: string;
  mechanicMetaphor: string;
  companionLines: string[];
  rewardMoment: string;
  wrapperTraits: string[];
};

export type QuestBossCandidate = {
  candidateId: string;
  kind: QuestBossKind;
  status: QuestBossCandidateStatus;
  title: string;
  purpose: string;
  description: string;
  wrapperTraits: string[];
  targetWords: string[];
  evidenceRole: "intervention" | "mastery_gate";
  imagePath?: string;
  experienceSkin?: QuestBossExperienceSkin;
  validationSummary?: string;
};

export type QuestBossTargetResult = {
  target: string;
  correct: boolean;
  attempts: number;
  recovered?: boolean;
  hinted?: boolean;
};

export type QuestBossEvidence = {
  nodeId: string;
  contentId: string;
  kind: "quest" | "boss";
  completedAt: string;
  accuracy: number;
  targetResults: QuestBossTargetResult[];
  engagement?: {
    selectedCandidateId?: string;
    replayRequested?: boolean;
    activePlayTime_ms?: number;
    frustrationScore?: number;
  };
};

export type QuestBossAssignmentContext = {
  domain: string;
  title: string;
  targetWords: string[];
  concepts: string[];
};

export type QuestBossBaselineEvidence = {
  nodeId: string;
  summary: string;
};

export type PrepareQuestBossCandidatesInput = {
  childId: string;
  kind: QuestBossKind;
  homeworkId: string;
  nodeId: string;
  choiceSetId: string;
  assignment: QuestBossAssignmentContext;
  baselineEvidence: QuestBossBaselineEvidence[];
  questEvidence?: QuestBossEvidence | null;
  generator: (input: {
    childId: string;
    kind: QuestBossKind;
    homeworkId: string;
    nodeId: string;
    choiceSetId: string;
    assignment: QuestBossAssignmentContext;
    baselineEvidence: QuestBossBaselineEvidence[];
    questEvidence?: QuestBossEvidence | null;
  }) => Promise<QuestBossCandidate[]> | QuestBossCandidate[];
};

export type PrepareQuestBossCandidatesResult =
  | {
      ok: true;
      candidates: QuestBossCandidate[];
    }
  | {
      ok: false;
      reason: string;
      candidates: QuestBossCandidate[];
    };

export type SelectQuestBossCandidateInput = {
  childId: string;
  kind: QuestBossKind;
  nodeId: string;
  choiceSetId: string;
  candidates: QuestBossCandidate[];
  selectedCandidateId: string;
  buildArtifact: (candidate: QuestBossCandidate) => Promise<{
    ok: true;
    filename: string;
    contentId: string;
    validationReport: unknown;
  } | {
    ok: false;
    reason: string;
    validationReport?: unknown;
  }>;
};

export type SelectQuestBossCandidateResult =
  | {
      ok: true;
      selected: QuestBossCandidate;
      lifecycle: QuestBossCandidate[];
      notSelectedCandidateIds: string[];
      filename: string;
      contentId: string;
      validationReport: unknown;
    }
  | {
      ok: false;
      reason: string;
      lifecycle: QuestBossCandidate[];
      selectedCandidateId: string;
      notSelectedCandidateIds: string[];
      validationReport?: unknown;
    };

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

export function hasValidQuestBossExperienceSkin(candidate: QuestBossCandidate): boolean {
  const skin = candidate.experienceSkin;
  const validIntensity = skin?.visualIntensity === "subtle"
    || skin?.visualIntensity === "balanced"
    || skin?.visualIntensity === "high";
  return Boolean(
    skin
      && validIntensity
      && skin.theme.trim()
      && skin.palette.background.trim()
      && skin.palette.surface.trim()
      && skin.palette.accent.trim()
      && skin.palette.glow.trim()
      && skin.palette.text.trim()
      && skin.focalObject.trim()
      && skin.mechanicMetaphor.trim()
      && skin.rewardMoment.trim()
      && skin.wrapperTraits.length > 0,
  );
}

function candidateLifecycleAfterSelection(
  candidates: QuestBossCandidate[],
  selectedCandidateId: string,
  selectedStatus: QuestBossCandidateStatus,
): QuestBossCandidate[] {
  return candidates.map((candidate) => {
    if (candidate.candidateId === selectedCandidateId) {
      return { ...candidate, status: selectedStatus };
    }
    if (candidate.status === "validated_available" || candidate.status === "candidate") {
      return { ...candidate, status: "not_selected" };
    }
    return candidate;
  });
}

export async function prepareQuestBossCandidates(
  input: PrepareQuestBossCandidatesInput,
): Promise<PrepareQuestBossCandidatesResult> {
  if (input.kind === "boss" && !input.questEvidence) {
    return { ok: false, reason: "quest_evidence_required", candidates: [] };
  }
  const raw = await input.generator(input);
  const statusCandidates = raw
    .filter((candidate) => candidate.kind === input.kind)
    .filter((candidate) => candidate.status === "validated_available");
  const candidates = statusCandidates.filter(hasValidQuestBossExperienceSkin);
  if (candidates.length === 0) {
    const reason = statusCandidates.length > 0 ? "candidate_missing_experience_skin" : "no_validated_candidates";
    return { ok: false, reason, candidates: [] };
  }
  return { ok: true, candidates };
}

export function deriveBossBriefFromQuestEvidence(input: {
  childId: string;
  homeworkId: string;
  assignmentTitle: string;
  questEvidence: QuestBossEvidence;
  now?: Date;
}): GeneratedExperienceBrief {
  const missedOrRecovered = input.questEvidence.targetResults
    .filter((result) => !result.correct || result.recovered || result.attempts > 1)
    .map((result) => result.target);
  const secure = input.questEvidence.targetResults
    .filter((result) => result.correct && !result.recovered && result.attempts <= 1)
    .map((result) => result.target);
  const targetWords = unique([...missedOrRecovered, ...secure]);
  const createdAt = (input.now ?? new Date()).toISOString();
  const accuracyLabel = Math.round(input.questEvidence.accuracy * 100);
  return {
    briefId: `brief-boss-${input.homeworkId}-${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
    experimentId: `experiment-${input.homeworkId}-boss`,
    kind: "boss",
    title: `${input.assignmentTitle} Final Boss`,
    learningGoal:
      `Test transfer and mastery after Quest evidence (${accuracyLabel}%): probe weak/recovered targets first, then confirm secure targets cold.`,
    targetSkills: ["transfer", "mastery", "retrieval practice"],
    targetConcepts: ["quest-informed mastery gate"],
    targetWords,
    engagementHooks: ["finale", "confidence", "challenge"],
    algorithmTargets: ["mastery-gating", "retrieval-practice", "transfer-check"],
    evidenceUsed: [input.questEvidence.contentId, input.questEvidence.nodeId],
    artifactStatus: "brief_only",
    validationRequired: true,
  };
}

export async function selectQuestBossCandidate(
  input: SelectQuestBossCandidateInput,
): Promise<SelectQuestBossCandidateResult> {
  const selected = input.candidates.find((candidate) => candidate.candidateId === input.selectedCandidateId);
  const notSelectedCandidateIds = input.candidates
    .map((candidate) => candidate.candidateId)
    .filter((candidateId) => candidateId !== input.selectedCandidateId);

  if (!selected) {
    return {
      ok: false,
      reason: "selected_candidate_not_found",
      selectedCandidateId: input.selectedCandidateId,
      notSelectedCandidateIds,
      lifecycle: input.candidates,
    };
  }

  const built = await input.buildArtifact(selected);
  if (!built.ok) {
    return {
      ok: false,
      reason: built.reason,
      selectedCandidateId: selected.candidateId,
      notSelectedCandidateIds,
      lifecycle: candidateLifecycleAfterSelection(input.candidates, selected.candidateId, "validation_failed"),
      validationReport: built.validationReport,
    };
  }

  const lifecycle = candidateLifecycleAfterSelection(input.candidates, selected.candidateId, "selected");
  return {
    ok: true,
    selected: lifecycle.find((candidate) => candidate.candidateId === selected.candidateId)!,
    lifecycle,
    notSelectedCandidateIds,
    filename: built.filename,
    contentId: built.contentId,
    validationReport: built.validationReport,
  };
}

export function questBossChoiceEventInput(input: {
  childId: string;
  nodeId: string;
  kind: QuestBossKind;
  choiceSetId: string;
  candidates: QuestBossCandidate[];
  selectedCandidateId: string;
  createdAt: string;
}): ChoiceEventInput {
  return {
    choiceSetId: input.choiceSetId,
    childId: input.childId,
    nodeId: input.nodeId,
    context: input.kind,
    domain: "spelling",
    shownOptions: input.candidates.map((candidate) => ({
      optionId: candidate.candidateId,
      activityId: candidate.kind,
      nodeType: candidate.kind,
      label: candidate.title,
      purposeLabel: candidate.purpose,
      activityKind: "generated_learning",
      thumbnailUrl: candidate.imagePath ?? candidate.experienceSkin?.cardImagePath,
    })),
    selectedOptionId: input.selectedCandidateId,
    skippedOptionIds: input.candidates
      .map((candidate) => candidate.candidateId)
      .filter((candidateId) => candidateId !== input.selectedCandidateId),
    source: "child_choice",
    eventName: "option_selected",
    started: true,
    createdAt: input.createdAt,
  };
}
