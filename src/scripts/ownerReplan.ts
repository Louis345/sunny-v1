/**
 * Owner 2026-11-09: close a child's current board early for one fresh Planner decision. Her finished stops and
 * answers stay. No provider is called here; the next kiosk start runs the decision and builds the board.
 *
 *   npm run sunny:planner:replan -- --child ila --homework hw-spelling-caaeebeb --reason "why"
 */
import "dotenv/config";
import { transitionLatestLearningCycle } from "../engine/learningCycleRepository";

const value = (flag: string) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1]?.trim() : undefined; };
const childId = value("--child"), homeworkId = value("--homework"), reason = value("--reason");
if (!childId || !homeworkId || !reason) {
  console.error('Usage: npm run sunny:planner:replan -- --child CHILD --homework HOMEWORK --reason "why"');
  process.exitCode = 1;
} else {
  try {
    const cycle = transitionLatestLearningCycle(childId, homeworkId, { type: "owner_replan_requested", reason });
    console.log(` 🎮 [canonical-progression] [owner-replan] [queued] child=${childId} homework=${homeworkId} lifecycle=${cycle.lifecycle} revision=${cycle.revision}. No provider called; the next kiosk start decides and builds her board.`);
  } catch (error) {
    console.error(` 🎮 [canonical-progression] [owner-replan] [refused] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
