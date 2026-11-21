/**
 * Lock code's baseline school-test forecast for a homework week now, and print the week's latest forecasts
 * (2026-11-13: Reina's math test is Monday). No model call. The Planner's forecast is locked with each decision.
 *
 *   npm run sunny:forecast:lock -- --child reina --homework hw-math-3809226e
 *   npm run sunny:forecast:lock -- --child reina --homework hw-math-3809226e --show   (print only, lock nothing)
 */
import "dotenv/config";
import { getLearningCycle, lockBaselineSchoolForecast } from "../engine/learningCycleRepository";

const value = (flag: string) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1]?.trim() : undefined; };
const childId = value("--child"), homeworkId = value("--homework"), showOnly = process.argv.includes("--show");
if (!childId || !homeworkId) {
  console.error("Usage: npm run sunny:forecast:lock -- --child CHILD --homework HOMEWORK [--show]");
  process.exitCode = 1;
} else {
  try {
    const cycle = showOnly ? getLearningCycle(childId, homeworkId) : lockBaselineSchoolForecast(childId, homeworkId);
    if (!cycle) throw new Error(`learning_cycle_missing:${homeworkId}`);
    const latest = new Map<string, NonNullable<typeof cycle.schoolForecasts>[number]>();
    for (const row of cycle.schoolForecasts ?? []) latest.set(`${row.modelId}|${row.constructId}`, row);
    console.log(`${homeworkId} school-test forecasts (latest per forecaster):`);
    for (const row of latest.values()) {
      const range = row.expectedMetric.min === row.expectedMetric.max ? `${Math.round(row.expectedMetric.min * 100)}%` : `${Math.round(row.expectedMetric.min * 100)}-${Math.round(row.expectedMetric.max * 100)}%`;
      console.log(`- ${row.modelId} ${row.constructId.split(":").at(-1)}: ${range} (locked ${row.lockedAt}) — ${row.context}`);
    }
  } catch (error) {
    console.error(` 🎮 [school-forecast] [lock] [refused] child=${childId} homework=${homeworkId} reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
