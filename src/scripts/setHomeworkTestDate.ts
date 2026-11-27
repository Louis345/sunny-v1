/**
 * A parent's school test date for an existing homework week (2026-11-12).
 *
 *   npm run sunny:homework:test-date -- --child reina --homework hw-math-3809226e --date 2026-11-16 --source "parent, 2026-11-12"
 */
import "dotenv/config";
import { setHomeworkTestDate } from "../profiles/homeworkTestDate";

const value = (flag: string) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1]?.trim() : undefined; };
const childId = value("--child"), homeworkId = value("--homework"), date = value("--date"), source = value("--source");
if (!childId || !homeworkId || !date || !source) {
  console.error('Usage: npm run sunny:homework:test-date -- --child CHILD --homework HOMEWORK --date YYYY-MM-DD --source "who, when"');
  process.exitCode = 1;
} else {
  try {
    setHomeworkTestDate(childId, homeworkId, date, source);
  } catch (error) {
    console.error(` 🎮 [homework-test-date] [refused] child=${childId} homework=${homeworkId} reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
