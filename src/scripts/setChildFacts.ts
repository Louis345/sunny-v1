/**
 * A parent's facts about a child (2026-11-10). Only what the parent gives; dated so age and grade stay current.
 *
 *   npm run sunny:child:facts -- --child ila --grade 3 --school-year 2026 --school "Pashley Elementary" [--birth-date YYYY-MM-DD] --source "parent, 2026-11-10"
 */
import "dotenv/config";
import { setChildFacts } from "../profiles/childFacts";

const value = (flag: string) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1]?.trim() : undefined; };
const childId = value("--child"), source = value("--source");
if (!childId || !source) {
  console.error('Usage: npm run sunny:child:facts -- --child CHILD [--grade N --school-year YYYY] [--birth-date YYYY-MM-DD] [--school "name"] --source "who, when"');
  process.exitCode = 1;
} else {
  try {
    const grade = value("--grade"), year = value("--school-year");
    setChildFacts(childId, { ...(grade ? { grade: Number(grade) } : {}), ...(year ? { gradeSchoolYear: Number(year) } : {}),
      ...(value("--birth-date") ? { birthDate: value("--birth-date") } : {}), ...(value("--school") ? { school: value("--school") } : {}) }, source);
  } catch (error) {
    console.error(` 🎮 [child-facts] [refused] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
