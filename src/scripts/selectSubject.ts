/**
 * Switches which of a child's homework subjects her next session opens (2026-11-10). No restart: each session start
 * reads it. Refuses a subject she has no homework for.
 *
 *   npm run sunny:subject -- --child ila --subject math --source "parent: Ila's ready for math"
 */
import "dotenv/config";
import { normalizeHomeworkDomain, selectHomeworkDomain } from "../engine/homeworkLanes";

const value = (flag: string) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1]?.trim() : undefined; };
const childId = value("--child"), domain = normalizeHomeworkDomain(value("--subject")), source = value("--source");
if (!childId || !domain || !source) {
  console.error('Usage: npm run sunny:subject -- --child CHILD --subject spelling|math|reading|science --source "who, why"');
  process.exitCode = 1;
} else {
  try { selectHomeworkDomain(childId, domain, { source }); }
  catch (error) {
    console.error(` 🎮 [homework-subject] [refused] child=${childId} subject=${domain} reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
