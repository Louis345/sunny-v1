/**
 * Owner-approved only (2026-11-10): reseal a child's published boards after an approved repair of their saved
 * content, then check that her record accepts saves again. No provider is called.
 *
 *   npm run sunny:board:reseal -- --child reina --homework hw-math-c63fde7a --reason "why"
 */
import "dotenv/config";
import { resealPublishedBoards } from "../engine/learningCycleRepository";
import { replayHeldCompletions, runStartupCheck } from "../engine/sunnyHealth";

const value = (flag: string) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1]?.trim() : undefined; };
const childId = value("--child"), homeworkId = value("--homework"), reason = value("--reason");
if (!childId || !homeworkId || !reason) {
  console.error('Usage: npm run sunny:board:reseal -- --child CHILD --homework HOMEWORK --reason "why"');
  process.exitCode = 1;
} else {
  try {
    resealPublishedBoards(childId, homeworkId, reason);
    const [check] = runStartupCheck([childId]);
    const held = replayHeldCompletions(childId);
    console.log(` 🎮 [learning-board] [reseal] [${check.ok ? "saves-work" : "still-broken"}] child=${childId} boards=${check.boards} heldReplayed=${held.replayed}`);
    if (!check.ok) process.exitCode = 1;
  } catch (error) {
    console.error(` 🎮 [learning-board] [reseal] [refused] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
