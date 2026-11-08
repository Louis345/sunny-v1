import type { LearningCycleRecordV2 } from "../../engine/learningCycleRepository";

/**
 * A made-up cycle shaped like Ila's 2026-11 list (no real child file is read): import kept coming back as
 * "inport" through a picture explainer (board 3) and Word Radar practice (boards 3 and 4), and two earlier
 * Planner decisions said what they would change. Used by the introspection tests and the owner's sample.
 */
export function ilaLikeIntrospectionCycle(): LearningCycleRecordV2 {
  const homeworkId = "hw-ila-like";
  const words = ["import", "dormant", "ornament", "pardon", "charge", "carnivore"];
  const item = (nodeId: string, word: string) => ({ id: `${nodeId}:${word}`, wordId: `w-${word}`, word, domain: "spelling" as const, constructId: `spelling:${word}`,
    lineage: {} as never, response: { mode: "spelling_letters" as const, acceptedForms: [word], caseSensitive: false } });
  const node = (nodeId: string, role: string, title: string, implementationType: string, list: string[], extra: Record<string, unknown> = {}) => ({
    nodeId, role, title, state: "completed", implementationType, mechanic: implementationType,
    academicTarget: { domain: "spelling", skill: "school words", targets: list }, theme: `Story: ${title}`, openingScreen: { title, purpose: "Practice" },
    evidenceContract: { academic: true, engagement: true, companionObservations: true, spellingItems: Object.fromEntries(list.map(word => [`${nodeId}:${word}`, item(nodeId, word)])) },
    evidenceIds: [], ...extra,
  });
  const nodes = [
    node("check", "evaluation", "Word Check", "word-radar", words),
    node("b2-explain", "baseline", "Sound Detectives", "visual-explainer", ["import", "dormant", "ornament"]),
    node("b2-radar", "baseline", "Radar Warm-up", "word-radar", ["import", "pardon", "ornament"]),
    node("b3-picture", "baseline", "Picture Clues", "visual-explainer", ["import", "dormant"]),
    node("b3-radar", "baseline", "Radar Run", "word-radar", ["import", "pardon", "dormant"]),
    node("b4-radar", "baseline", "Radar Rematch", "word-radar", ["import", "pardon", "ornament"]),
  ];
  let n = 0;
  const answer = (nodeId: string, word: string, wrote: string, at: string, help: "unassisted" | "assisted" | "unknown") => ({
    observationId: `obs-${++n}`, sourceId: nodeId === "check" ? `evaluation:${nodeId}` : `activity:${nodeId}:recall`, itemId: `${nodeId}:${word}`, childResponse: wrote,
    constructLinks: [], result: { correct: wrote === word }, assistance: { status: help, scaffolds: [] }, exposure: "previously_practiced", provenance: help === "unassisted" ? "independent_probe" : "practice",
    observedAt: at, confounds: [],
  });
  const observations = [
    // Board 1: the first check, on her own.
    ...[["import", "inport"], ["dormant", "dorment"], ["ornament", "ornamint"], ["pardon", "parden"], ["charge", "charge"], ["carnivore", "carnivore"]]
      .map(([word, wrote]) => answer("check", word, wrote, "2026-11-02T16:00:00Z", "unassisted")),
    // Board 2: teaching, with help.
    answer("b2-explain", "import", "import", "2026-11-02T16:20:00Z", "assisted"),
    answer("b2-radar", "import", "inport", "2026-11-02T16:30:00Z", "unknown"),
    answer("b2-radar", "pardon", "pardon", "2026-11-02T16:30:00Z", "unknown"),
    answer("b2-radar", "ornament", "ornament", "2026-11-02T16:30:00Z", "unknown"),
    // Board 3 (after decision 1).
    answer("b3-picture", "import", "import", "2026-11-04T16:10:00Z", "assisted"),
    answer("b3-radar", "import", "inport", "2026-11-04T16:20:00Z", "unassisted"),
    answer("b3-radar", "dormant", "dormant", "2026-11-04T16:20:00Z", "unassisted"),
    answer("b3-radar", "pardon", "pardon", "2026-11-04T16:20:00Z", "unassisted"),
    // Board 4 (after decision 2).
    answer("b4-radar", "import", "impot", "2026-11-06T16:20:00Z", "unassisted"),
    answer("b4-radar", "import", "inport", "2026-11-06T16:25:00Z", "unassisted"),
    answer("b4-radar", "pardon", "pardon", "2026-11-06T16:20:00Z", "unassisted"),
    answer("b4-radar", "ornament", "ornament", "2026-11-06T16:20:00Z", "unassisted"),
  ];
  const decision = (revision: number, createdAt: string, change: string[], testNext: string[], reason: string) => ({
    decisionId: `${homeworkId}:decision:r${revision}`, eventType: "theory_decided", status: "revised", reason, nextAction: "generate_support", evidenceIds: ["obs-1"],
    fromLifecycle: "baseline_evaluating", toLifecycle: "baseline_generating", createdAt, preserve: [], change, testNext, nextEvidenceRequired: [], predictionEvaluationIds: [],
  });
  const decisionHistory = [
    decision(20, "2026-11-03T08:00:00Z", ["Show the m before p in import with a picture explainer.", "Radar practice on import, dormant and pardon."], ["import on her own"], "She writes n for m in import; a picture of the lips closing may anchor it."),
    decision(30, "2026-11-05T08:00:00Z", ["Another Radar round on import, pardon and ornament."], ["import on her own again"], "Radar went well for dormant and pardon; import needs more reps."),
  ];
  const board = (index: number, nodeIds: string[], plannerDecisionId: string | null, publishedAt: string) => ({ boardId: `${homeworkId}:board:${index}`, kind: index === 1 ? "probe" : index === 2 ? "teaching" : "successor",
    predecessorBoardId: index > 1 ? `${homeworkId}:board:${index - 1}` : null, plannerDecisionId, evidenceIds: [], nodeIds, topologyHash: "", publishedAt });
  const boards = [
    board(1, ["check"], null, "2026-11-02T15:50:00Z"),
    board(2, ["b2-explain", "b2-radar"], null, "2026-11-02T16:05:00Z"),
    board(3, ["b3-picture", "b3-radar"], decisionHistory[0].decisionId, "2026-11-03T09:00:00Z"),
    board(4, ["b4-radar"], decisionHistory[1].decisionId, "2026-11-05T09:00:00Z"),
  ];
  return { schemaVersion: 2, revision: 40, childId: "lab-ila-like", homeworkId, domain: "spelling", lifecycle: "baseline_evaluating",
    assignment: { title: "Week 10 words", contentFingerprint: "lab", capturedEvidenceIds: [], targets: words }, nodes, boards, observations, decisionHistory,
    academicTheory: { theoryId: "t", revision: 1, hypothesis: "", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null,
    evidence: { academic: [], engagement: [], companionObservations: [] }, evidenceSources: [], academicPredictions: [], assumptions: [], predictionEvaluations: [],
    createdAt: "2026-11-02T15:00:00Z", updatedAt: "2026-11-06T17:00:00Z" } as unknown as LearningCycleRecordV2;
}
