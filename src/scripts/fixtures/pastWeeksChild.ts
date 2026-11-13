import fs from "node:fs";
import path from "node:path";
import type { LearningCycleDecision, LearningCycleRecordV2 } from "../../engine/learningCycleRepository";
import { writePlannerJournalEntry } from "../../engine/plannerIntrospection";

/**
 * A made-up child with two finished weeks (no real child file is read): week 1 spelling, where she wrote -ent for
 * -ant (dorment, plesent, servent) until a recall-first race, and a graded school test came back 5 of 6; week 2 math
 * (subtraction with regrouping), no graded test. Used by the past-weeks tests: week 3's first board must find both.
 */
export const PAST_WEEKS_CHILD = "lab-memory";
export const WEEK1 = "hw-spelling-wk1", WEEK2 = "hw-math-wk2";
/** Where a test date lives today: her homework rows (chart.homework), by homework id. */
export const PAST_HOMEWORK = { activeByDomain: { spelling: { homeworkId: WEEK1, testDate: "2026-10-30" } } };

type Node = Record<string, unknown>;
const base = (nodeId: string, role: string, title: string, implementationType: string, extra: Record<string, unknown>): Node => ({
  nodeId, role, title, state: "completed", implementationType, mechanic: implementationType, theme: `Story: ${title}`, openingScreen: { title, purpose: "Practice" },
  algorithmOwner: "ai_tutor", theoryId: "t", experimentId: nodeId, generationPrompt: null, artifactBinding: null, artwork: { status: "ready", localPath: null, prompt: null },
  sfxContract: [], companionContract: { events: [] }, evidenceIds: [], ...extra,
});
const cycle = (homeworkId: string, domain: string, title: string, targets: string[], rest: Partial<Record<keyof LearningCycleRecordV2, unknown>>): LearningCycleRecordV2 => ({
  schemaVersion: 2, revision: 30, childId: PAST_WEEKS_CHILD, homeworkId, domain, lifecycle: "awaiting_calibration",
  assignment: { title, contentFingerprint: `fp-${homeworkId}`, capturedEvidenceIds: [], targets },
  academicTheory: { theoryId: "t", revision: 1, hypothesis: "", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null,
  evidence: { academic: [], engagement: [], companionObservations: [] }, evidenceSources: [], academicPredictions: [], assumptions: [], predictionEvaluations: [], decisionHistory: [], observations: [],
  ...rest,
} as unknown as LearningCycleRecordV2);
const board = (homeworkId: string, index: number, nodeIds: string[], plannerDecisionId: string | null, publishedAt: string) => ({ boardId: `${homeworkId}:board:${index}`,
  kind: index === 1 ? "probe" : index === 2 ? "teaching" : "successor", predecessorBoardId: index > 1 ? `${homeworkId}:board:${index - 1}` : null, plannerDecisionId, evidenceIds: [], nodeIds, topologyHash: "", publishedAt });
const decision = (homeworkId: string, n: number, createdAt: string, extra: Partial<LearningCycleDecision>): LearningCycleDecision => ({
  decisionId: `${homeworkId}:decision:${n}`, eventType: "theory_decided", status: "revised", reason: "", nextAction: "generate_support", evidenceIds: [],
  fromLifecycle: "baseline_evaluating", toLifecycle: "baseline_generating", createdAt, preserve: [], change: [], testNext: [], nextEvidenceRequired: [], predictionEvaluationIds: [], ...extra,
} as LearningCycleDecision);

export function spellingWeek1(): LearningCycleRecordV2 {
  const h = WEEK1, words = ["dormant", "pleasant", "servant", "moment", "silent", "import"];
  const item = (nodeId: string, word: string) => ({ id: `${nodeId}:${word}`, wordId: `w-${word}`, word, domain: "spelling", constructId: `spelling:${word}`,
    lineage: { sourceEvidenceIds: [], exposure: "unseen", measurementRole: "practice" }, response: { mode: "spelling_letters", acceptedForms: [word], caseSensitive: false } });
  const node = (nodeId: string, role: string, title: string, type: string, list: string[], extra: Record<string, unknown> = {}) => base(nodeId, role, title, type, {
    academicTarget: { domain: "spelling", skill: "school words", targets: list },
    evidenceContract: { academic: true, engagement: true, companionObservations: true, spellingItems: Object.fromEntries(list.map(word => [`${nodeId}:${word}`, item(nodeId, word)])) }, ...extra });
  const nodes = [
    node("check", "evaluation", "Word Check", "word-radar", words),
    node("b2-page", "baseline", "Ending Detectives", "visual-explainer", ["dormant", "pleasant", "servant"]),
    node("b2-radar", "baseline", "Radar Warm-up", "word-radar", ["dormant", "pleasant", "servant", "import"]),
    node("b3-race", "baseline", "Recall Race", "generated-game", ["dormant", "pleasant", "servant", "import"], { focus: "-ant endings: say it, recall it, then check" }),
  ];
  let n = 0;
  const answer = (nodeId: string, word: string, wrote: string, at: string, help: "unassisted" | "assisted", confounds: string[] = []) => ({ observationId: `${h}:obs-${++n}`, sourceId: `activity:${nodeId}`,
    itemId: `${nodeId}:${word}`, childResponse: wrote, constructLinks: [], result: { correct: wrote === word }, assistance: { status: help, scaffolds: [] }, exposure: "previously_practiced",
    provenance: help === "unassisted" ? "independent_probe" : "practice", observedAt: at, confounds });
  const graded = (word: string, wrote: string) => ({ observationId: `${h}:graded-${word}`, sourceId: "graded:wk1", itemId: `graded:${word}`, prompt: word, childResponse: wrote,
    constructLinks: [{ constructId: `spelling:${word}`, role: "primary", confidence: 1 }], result: { correct: wrote === word }, assistance: { status: "unassisted", scaffolds: [] },
    exposure: "previously_practiced", provenance: "graded_work", observedAt: "2026-11-02T18:00:00Z", confounds: [] });
  const observations = [
    ...[["dormant", "dorment"], ["pleasant", "plesent"], ["servant", "servent"], ["moment", "moment"], ["silent", "silent"], ["import", "inport"]].map(([word, wrote]) => answer("check", word, wrote, "2026-10-26T16:00:00Z", "unassisted")),
    answer("b2-page", "dormant", "dormant", "2026-10-27T16:10:00Z", "assisted"),
    answer("b2-radar", "dormant", "dorment", "2026-10-27T16:20:00Z", "unassisted"),
    answer("b2-radar", "pleasant", "plesant", "2026-10-27T16:20:00Z", "unassisted"),
    answer("b2-radar", "servant", "servent", "2026-10-27T16:20:00Z", "unassisted"),
    answer("b2-radar", "import", "inport", "2026-10-27T16:20:00Z", "unassisted"),
    answer("b3-race", "dormant", "dormant", "2026-10-29T16:20:00Z", "unassisted"),
    answer("b3-race", "pleasant", "pleasant", "2026-10-29T16:20:00Z", "unassisted"),
    answer("b3-race", "servant", "servant", "2026-10-29T16:20:00Z", "unassisted"),
    answer("b3-race", "import", "inport", "2026-10-29T16:20:00Z", "unassisted"),
    // A retry is practice, never a first try on her own (contract 58).
    answer("b3-race", "import", "import", "2026-10-29T16:21:00Z", "unassisted", ["retry"]),
    ...[["dormant", "dormant"], ["pleasant", "pleasant"], ["servant", "servant"], ["moment", "moment"], ["silent", "silent"], ["import", "inport"]].map(([word, wrote]) => graded(word, wrote)),
  ];
  const decisions = [
    decision(h, 1, "2026-10-28T08:00:00Z", { reason: "She writes -ent for -ant on her own.", change: ["Recall-first race on the -ant words."], testNext: ["dormant, pleasant, servant on her own"],
      expectations: [{ itemId: "w-dormant", onHerOwn: true }, { itemId: "w-import", onHerOwn: true }],
      selfReview: { whatITried: "Word Radar practice and a picture page on the -ant endings.", whatHappened: "On her own she still wrote dorment, plesant and servent.",
        why: "Seeing the word first let her copy it; she never pulled it from memory.", whatIKeep: "Recall-first worked: she says the word, spells it from memory, then checks.",
        whatIChangeNow: "A recall-first race on the -ant words, aimed at the -ant ending." } }),
  ];
  return cycle(h, "spelling", "Week 8 words: -ant and -ent", words, {
    nodes, observations, decisionHistory: decisions,
    boards: [board(h, 1, ["check"], null, "2026-10-26T15:50:00Z"), board(h, 2, ["b2-page", "b2-radar"], null, "2026-10-27T16:00:00Z"), board(h, 3, ["b3-race"], decisions[0].decisionId, "2026-10-28T09:00:00Z")],
    evidenceSources: [{ sourceId: "graded:wk1", type: "graded_work", fileFingerprint: "graded-wk1", sourceFile: "graded-wk1.pdf", provenance: "caregiver", capturedAt: "2026-11-02T18:00:00Z",
      assignmentLink: { homeworkId: h, method: "explicit_selection", confidence: 1, confirmedBy: "caregiver" }, status: "confirmed" }],
    calibrations: [{ calibrationId: "calibration:wk1", gradedAt: "2026-11-02T18:00:00Z", score: 0.833, status: "inconclusive", sourceFile: "graded-wk1.pdf", reason: "Returned work.", nextAction: "Evaluate.",
      gradedItems: words.map(word => ({ target: `spelling:${word}`, correct: word !== "import" })) }],
    predictionEvaluations: [{ evaluationId: "eval-wk1", predictionId: "pred-wk1", sourceId: "graded:wk1", observationIds: [], predictedMetric: { min: 0.6, max: 0.9 }, observedMetric: 0.833, predictionError: 0, observedErrorPatterns: [], sufficiency: "sufficient", evaluatedAt: "2026-11-02T18:00:00Z" }],
    createdAt: "2026-10-26T15:00:00Z", updatedAt: "2026-11-02T18:00:00Z",
  });
}

export function mathWeek2(): LearningCycleRecordV2 {
  const h = WEEK2;
  const problem = (id: string, prompt: string, expected: number) => ({ id, prompt, lineage: { sourceEvidenceIds: [], exposure: "unseen", measurementRole: "practice" }, response: { mode: "numeric", expected } });
  const problems = [problem("p1", "702 - 348 = ?", 354), problem("p2", "Subtract 165 from 400.", 235)];
  const node = (nodeId: string, title: string, list: typeof problems) => base(nodeId, "baseline", title, "generated-game", {
    academicTarget: { domain: "math", skill: "subtraction", targets: list.map(row => row.prompt) },
    evidenceContract: { academic: true, engagement: true, companionObservations: true, itemContracts: Object.fromEntries(list.map(row => [row.id, row])) } });
  const answer = (id: string, wrote: string, right: boolean, at: string, nodeId: string) => ({ observationId: `${h}:${id}:${at}`, sourceId: `activity:${nodeId}`, itemId: id, childResponse: wrote, constructLinks: [],
    result: { correct: right }, assistance: { status: "unassisted", scaffolds: [] }, exposure: "unseen", provenance: "independent_probe", observedAt: at, confounds: [] });
  const decisions = [decision(h, 1, "2026-11-04T08:00:00Z", { reason: "She subtracts the smaller digit from the larger in each column.", change: ["Base-ten blocks for borrowing across a zero."], testNext: ["p1 on her own"] })];
  return cycle(h, "math", "Subtraction with regrouping", ["Subtraction with regrouping"], {
    nodes: [node("b1-game", "Canyon Crossing", problems), node("b2-game", "Block Bridge", problems)],
    observations: [answer("p1", "454", false, "2026-11-03T16:00:00Z", "b1-game"), answer("p2", "235", true, "2026-11-03T16:01:00Z", "b1-game"), answer("p1", "354", true, "2026-11-05T16:00:00Z", "b2-game")],
    decisionHistory: decisions,
    boards: [board(h, 1, ["b1-game"], null, "2026-11-03T15:00:00Z"), board(h, 2, ["b2-game"], decisions[0].decisionId, "2026-11-04T09:00:00Z")],
    createdAt: "2026-11-03T15:00:00Z", updatedAt: "2026-11-05T16:00:00Z",
  });
}

/** Writes both finished weeks into her folder the way the system keeps them: the cycle files, the Planner's
 * journal (by the real journal writer) and a session scorecard with minutes. */
export function seedPastWeeks(rootDir: string): void {
  const child = path.join(rootDir, "src/context", PAST_WEEKS_CHILD, "homework");
  fs.mkdirSync(path.join(child, "cycles"), { recursive: true });
  for (const week of [spellingWeek1(), mathWeek2()]) {
    fs.writeFileSync(path.join(child, "cycles", `${week.homeworkId}.json`), JSON.stringify(week));
    for (const row of week.decisionHistory) writePlannerJournalEntry(week, row, { rootDir });
  }
  fs.mkdirSync(path.join(child, "scorecards"), { recursive: true });
  fs.writeFileSync(path.join(child, "scorecards", `${WEEK1}.ndjson`), `${JSON.stringify({ sessionId: "s1", startedAt: "2026-10-29T16:00:00Z",
    minutes: { learning: 22.5, play: 6, call: 3, waiting: 1, map: 2, other: 0, unmeasured: 0.5, total: 35 } })}\n`);
}
