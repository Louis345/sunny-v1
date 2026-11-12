import { openChart, type ChartDatabase } from "../chart/db";
import { exportEvents } from "../chart/exportEvents";
import { scoreLockedPredictions } from "../chart/spelling/predictionBond";
import { factId, type Payloads } from "../chart/spelling/schemas";
import { recordFact, recordSchoolTest } from "../chart/spelling/record";
import { getLearningCycle, type LearningCycleRecordV2 } from "./learningCycleRepository";
import { frozenSpellingWordMapping } from "./longitudinalLearning";

/**
 * Owner 2026-11-12: the Planner's locked predictions go into her chart database, and a graded test is bonded to them
 * there, word by word. The week's record (the canonical cycle) keeps working as before; this copies its locked
 * predictions into the immutable chart, where the chart itself refuses any written after the test.
 */
type Lock = Payloads["prediction.locked"];
const MAX_TEXT = 4096;
const textOrNull = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_TEXT).trim() : null;
const instant = (value: string) => new Date(value).toISOString();

/** Each locked prediction of a spelling week, by word. Predictions whose word is not in the week's frozen list are logged and left out. */
export function lockedPredictionsFromCycle(cycle: LearningCycleRecordV2): Lock[] {
  const words = new Map((frozenSpellingWordMapping(cycle) ?? []).map(item => [item.constructId, item.word.normalize("NFC").trim().toLowerCase()]));
  return (cycle.academicPredictions ?? []).flatMap(prediction => {
    const word = words.get(prediction.constructId);
    const metric = prediction.expectedMetric;
    const lockedAt = prediction.lockedAt ?? prediction.createdAt;
    if (!word || !metric || typeof metric.min !== "number" || typeof metric.max !== "number" || !lockedAt) {
      console.warn(` 🎮 [prediction-bond] [lock] [skipped] homework=${cycle.homeworkId} prediction=${prediction.predictionId} reason=${!word ? "word_not_in_list" : "no_expected_range"}`);
      return [];
    }
    const modelId = textOrNull((prediction as { modelId?: unknown }).modelId);
    return [{ assignmentId: cycle.homeworkId, predictionId: prediction.predictionId, word, metric: metric.key, expected: { min: metric.min, max: metric.max },
      confidence: typeof prediction.confidence === "number" ? prediction.confidence : null,
      predictedErrors: (prediction.predictedErrorPatterns ?? []).flatMap(text => textOrNull(text) ?? []).slice(0, 50),
      rationale: textOrNull(prediction.context), horizon: textOrNull(prediction.horizon), modelId, lockedAt: instant(lockedAt) }];
  });
}

/** Records this week's locked predictions in her chart once; a second run adds nothing. Throws if the chart refuses. */
export function bondLockedPredictions(db: ChartDatabase, cycle: LearningCycleRecordV2): { recorded: number; already: number } {
  const locks = lockedPredictionsFromCycle(cycle);
  const exists = db.sql.prepare("SELECT 1 FROM events WHERE event_id=?");
  const result = db.sql.transaction(() => {
    let recorded = 0, already = 0;
    for (const lock of locks) {
      if (exists.get(factId("prediction.locked", lock))) { already += 1; continue; }
      recordFact(db, "prediction.locked", lock, { actor: "planner", occurred_at: lock.lockedAt });
      recorded += 1;
    }
    return { recorded, already };
  }).immediate();
  console.log(` 🎮 [prediction-bond] [locks] [ok] child=${db.childId} homework=${cycle.homeworkId} recorded=${result.recorded} already=${result.already}`);
  return result;
}

/**
 * The graded test and its bond, in one transaction: the week's locks (if the test is not in yet), the test, then code's
 * scoring of every lock against it. Repeating the same upload changes nothing. Any refusal throws; nothing half-saves.
 */
export function recordGradedTestBond(db: ChartDatabase, input: { cycle: LearningCycleRecordV2; schoolTest: Payloads["school_test.recorded"]; occurredAt: string }): Payloads["prediction.scored"] {
  const assignmentId = input.cycle.homeworkId;
  if (input.schoolTest.assignmentId !== assignmentId) throw new Error("prediction_bond_assignment_mismatch");
  const scored = db.sql.transaction(() => {
    const testId = factId("school_test.recorded", input.schoolTest);
    if (!db.sql.prepare("SELECT 1 FROM events WHERE event_id=?").get(testId)) bondLockedPredictions(db, input.cycle);
    const school = recordSchoolTest(db, input.schoolTest, { actor: "parent", occurred_at: input.occurredAt });
    const payload = scoreLockedPredictions(exportEvents(db), assignmentId);
    if (!payload) throw new Error("prediction_bond_school_test_missing");
    const cites = [school.event_id, ...new Set(payload.rows.flatMap(row => row.predictions.map(prediction => prediction.predictionEventId)))];
    recordFact(db, "prediction.scored", payload, { actor: "system", occurred_at: input.occurredAt, cites });
    return payload;
  }).immediate();
  const s = scored.summary;
  console.log(` 🎮 [prediction-bond] [scored] [ok] child=${db.childId} homework=${assignmentId} right=${s.right}/${s.words} predicted=${s.predictedRight ? `${s.predictedRight.min}-${s.predictedRight.max}` : "none"} inRange=${s.inRange}`);
  return scored;
}

/**
 * At each session's end: this week's locked predictions copied into her chart, so they are on record long before the
 * graded test. Session end is never blocked; a refusal is logged as an error with its reason.
 */
export function bondWeekPredictionsAtSessionEnd(childId: string, homeworkId: string): void {
  if (!process.env.SUNNY_CHART_DIR?.trim()) { console.log(` 🎮 [prediction-bond] [locks] [skipped] child=${childId} reason=no_chart_dir`); return; }
  let db: ChartDatabase | undefined;
  try {
    const cycle = getLearningCycle(childId, homeworkId);
    if (!cycle || cycle.domain !== "spelling" || !(cycle.academicPredictions ?? []).length) return;
    db = openChart(childId);
    bondLockedPredictions(db, cycle);
  } catch (error) {
    console.error(` 🎮 [prediction-bond] [locks] [refused] child=${childId} homework=${homeworkId} reason=${error instanceof Error ? error.message : String(error)}`);
  } finally {
    db?.close();
  }
}
