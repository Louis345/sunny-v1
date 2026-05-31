export type QuestBossLabCandidate = {
  candidateId: string;
  title?: string;
};

export type QuestBossLabSelectionStage = "quest" | "boss";

export type QuestBossLabSelectionSource = "explicit_id" | "explicit_index" | "default_first";

export type QuestBossLabSelection<T extends QuestBossLabCandidate> = {
  candidate: T;
  source: QuestBossLabSelectionSource;
  requestedSelection: string | null;
  availableCandidates: Array<{
    index: number;
    candidateId: string;
    title?: string;
  }>;
};

function stageLabel(stage: QuestBossLabSelectionStage): string {
  return stage === "quest" ? "Quest" : "Boss";
}

function availableLabel(candidates: QuestBossLabCandidate[]): string {
  return candidates
    .map((candidate, index) => `${index + 1}:${candidate.candidateId}`)
    .join(", ");
}

export function selectQuestBossLabCandidate<T extends QuestBossLabCandidate>(input: {
  candidates: T[];
  requestedSelection?: string | null;
  stage: QuestBossLabSelectionStage;
  allowDefaultFirst: boolean;
}): QuestBossLabSelection<T> {
  const availableCandidates = input.candidates.map((candidate, index) => ({
    index: index + 1,
    candidateId: candidate.candidateId,
    ...(candidate.title ? { title: candidate.title } : {}),
  }));
  if (input.candidates.length === 0) {
    throw new Error(`${stageLabel(input.stage)} has no available candidates.`);
  }

  const requestedSelection = input.requestedSelection?.trim() || null;
  if (!requestedSelection) {
    if (input.allowDefaultFirst) {
      return {
        candidate: input.candidates[0]!,
        source: "default_first",
        requestedSelection,
        availableCandidates,
      };
    }
    throw new Error(
      `${stageLabel(input.stage)} candidate selection required. Pass --select-${input.stage}=<1-${input.candidates.length}|candidateId> or --auto-select-first. Available: ${availableLabel(input.candidates)}`,
    );
  }

  if (/^\d+$/.test(requestedSelection)) {
    const requestedIndex = Number(requestedSelection);
    const candidate = input.candidates[requestedIndex - 1];
    if (!candidate) {
      throw new Error(
        `${stageLabel(input.stage)} candidate index ${requestedSelection} is out of range. Available: ${availableLabel(input.candidates)}`,
      );
    }
    return {
      candidate,
      source: "explicit_index",
      requestedSelection,
      availableCandidates,
    };
  }

  const candidate = input.candidates.find((item) => item.candidateId === requestedSelection);
  if (!candidate) {
    throw new Error(
      `${stageLabel(input.stage)} candidate "${requestedSelection}" was not generated. Available: ${availableLabel(input.candidates)}`,
    );
  }

  return {
    candidate,
    source: "explicit_id",
    requestedSelection,
    availableCandidates,
  };
}
