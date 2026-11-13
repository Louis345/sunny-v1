import type { AcademicPrediction, LearningCycleRecordV2 } from "./learningCycleRepository";
import { isFirstTryOnHerOwn } from "./sessionTimeline";

/**
 * School-test forecasts locked at every Planner decision (owner, 2026-11-13: predictions grounded in reality, per word,
 * updated as evidence arrives, and compared with plain code). The Planner's forecast carries its model; code locks its
 * own baseline beside it from her first tries on her own, so we can see whether the AI predicts better than arithmetic.
 * Presentation of these numbers is later work; the record is now.
 */
export const BASELINE_FORECASTER = "code-baseline-v1";
const RECENT_TRIES = 10;

export type SchoolForecast = {
  forecaster: string;
  words?: Array<{ wordId: string; chance: number; why: string }>;
  score?: { min: number; max: number; why: string };
};

type Cycle = Pick<LearningCycleRecordV2, "childId" | "homeworkId" | "domain" | "academicTheory" | "nodes" | "observations">;
type Observation = LearningCycleRecordV2["observations"][number];

const round = (value: number) => Math.round(value * 1000) / 1000;
const ownFirstTry = (row: Observation) => typeof row.result?.correct === "boolean" && isFirstTryOnHerOwn(row);
/** Her last first tries on her own, smoothed so one answer never reads as certainty: (right + 1) / (tries + 2). */
function smoothedChance(rows: Observation[]): { chance: number; right: number; tries: number } {
  const recent = rows.filter(ownFirstTry).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)).slice(-RECENT_TRIES);
  const right = recent.filter(row => row.result.correct === true).length;
  return { chance: round((right + 1) / (recent.length + 2)), right, tries: recent.length };
}

function spellingWords(cycle: Cycle): Array<{ wordId: string; word: string; constructId: string }> {
  const words = new Map<string, { wordId: string; word: string; constructId: string }>();
  for (const node of cycle.nodes) for (const item of Object.values(node.evidenceContract?.spellingItems ?? {})) {
    if (item.wordId && item.constructId && !words.has(item.wordId)) words.set(item.wordId, { wordId: item.wordId, word: item.word, constructId: item.constructId });
  }
  return [...words.values()];
}

export function schoolForecastPredictions(cycle: Cycle, forecast: SchoolForecast | undefined, at: string): Array<AcademicPrediction & { modelId: string }> {
  const lock = (forecaster: string, constructId: string, metric: AcademicPrediction["expectedMetric"], context: string): AcademicPrediction & { modelId: string } => ({
    predictionId: `${cycle.homeworkId}:school-forecast:${at}:${forecaster}:${constructId}`, theoryId: cycle.academicTheory.theoryId, constructId, modelId: forecaster,
    context, horizon: "Her graded school test on this assignment.", eligibility: { sources: ["graded_work"], maxDelayDays: 60 },
    expectedMetric: metric, predictedErrorPatterns: [], confidence: round((metric.min + metric.max) / 2), evidenceIds: [], intervention: "school test forecast",
    evidenceLimit: "calibrated_mastery", createdAt: at, lockedAt: at,
  });
  const rows: Array<AcademicPrediction & { modelId: string }> = [];
  if (cycle.domain === "spelling") {
    const words = spellingWords(cycle);
    const planned = new Map((forecast?.words ?? []).map(row => [row.wordId, row]));
    for (const word of words) {
      const call = planned.get(word.wordId);
      if (call) rows.push(lock(forecast!.forecaster, word.constructId, { key: "school_test_correct", min: round(call.chance), max: round(call.chance) }, call.why));
    }
    for (const word of words) {
      const base = smoothedChance(cycle.observations.filter(row => row.constructLinks?.some(link => link.constructId === word.constructId)));
      rows.push(lock(BASELINE_FORECASTER, word.constructId, { key: "school_test_correct", min: base.chance, max: base.chance }, `${base.right} right of her last ${base.tries} first tries on her own.`));
    }
  } else {
    const constructId = `${cycle.homeworkId}:school-test-score`;
    if (forecast?.score) rows.push(lock(forecast.forecaster, constructId, { key: "school_test_percent", min: round(forecast.score.min), max: round(forecast.score.max) }, forecast.score.why));
    const base = smoothedChance(cycle.observations);
    rows.push(lock(BASELINE_FORECASTER, constructId, { key: "school_test_percent", min: base.chance, max: base.chance }, `${base.right} right of her last ${base.tries} first tries on her own.`));
  }
  const planner = rows.filter(row => row.modelId !== BASELINE_FORECASTER).length;
  console.log(` 🎮 [school-forecast] [${planner ? "locked" : "planner"}] ${planner ? `` : "[missing] "}child=${cycle.childId} homework=${cycle.homeworkId} planner=${planner} baseline=${rows.length - planner} by=${forecast?.forecaster ?? "none"}`);
  return rows;
}

