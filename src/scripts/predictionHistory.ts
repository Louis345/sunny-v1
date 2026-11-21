/**
 * Owner 2026-11-12: her locked predictions against her graded school tests, from her chart database, as plain lines.
 *
 *   npm run sunny:predictions -- --child ila                                  # print every week
 *   npm run sunny:predictions -- --child ila --bond hw-spelling-caaeebeb       # first record that week's locked predictions
 *   npm run sunny:predictions -- --child ila --json                            # the bonded rows as JSON
 *
 * --bond copies the week's locked predictions into her chart (idempotent). Her chart refuses it once that week's
 * graded test is recorded, so a prediction can never be added with the answer known.
 */
import "dotenv/config";
import { openChart } from "../chart/db";
import { exportEvents } from "../chart/exportEvents";
import { predictionHistoryLines } from "../chart/spelling/predictionBond";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { bondLockedPredictions } from "../engine/predictionBond";

const value = (flag: string) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1]?.trim() : undefined; };
const childId = value("--child"), bond = value("--bond");
if (!childId) {
  console.error("Usage: npm run sunny:predictions -- --child CHILD [--bond HOMEWORK] [--json]");
  process.exitCode = 1;
} else {
  let db: ReturnType<typeof openChart> | undefined;
  try {
    if (bond) {
      const cycle = getLearningCycle(childId, bond);
      if (!cycle) throw new Error(`no_week:${bond}`);
      db = openChart(childId);
      const result = bondLockedPredictions(db, cycle);
      console.log(` 🎮 [predictions] [bond] [ok] child=${childId} homework=${bond} recorded=${result.recorded} already=${result.already}`);
      db.close(); db = undefined;
    }
    db = openChart(childId, { readonly: true });
    const events = exportEvents(db);
    if (process.argv.includes("--json")) console.log(JSON.stringify(events.filter(e => e.type === "prediction.scored").map(e => ({ ...e.payload, bondedAt: e.recorded_at })), null, 2));
    else console.log(predictionHistoryLines(events).join("\n") || "No locked predictions or graded tests in her chart yet.");
  } catch (error) {
    console.error(` 🎮 [predictions] [failed] child=${childId} reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    db?.close();
  }
}
