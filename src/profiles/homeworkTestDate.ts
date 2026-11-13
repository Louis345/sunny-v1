import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";

type Row = { homeworkId?: string | null; testDate?: string | null; testDateSource?: string | null; testDateConfirmed?: boolean } | null | undefined;
type HomeworkFile = { current?: Row; pending?: Row; activeByDomain?: Record<string, Row> };

/**
 * A parent's school test date for a homework week that already exists (owner, 2026-11-12: Reina's Monday math test
 * was unknown to the Planner). Written to every row of homework/current.json that names that homework, which is where
 * the Planner reads it (schoolTestFacts), and logged with the before and after. Only what the parent gave.
 */
export function setHomeworkTestDate(childId: string, homeworkId: string, testDate: string, source: string, opts: { rootDir?: string } = {}): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate) || Number.isNaN(Date.parse(`${testDate}T00:00:00Z`))) throw new Error("test_date_must_be_yyyy_mm_dd");
  if (!source.trim()) throw new Error("source_required");
  const dir = resolveChildContextDir(childId, { rootDir: opts.rootDir });
  const file = path.join(dir, "homework", "current.json");
  const json = (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {}) as HomeworkFile;
  const rows = [json.current, json.pending, ...Object.values(json.activeByDomain ?? {})].filter((row): row is NonNullable<Row> => row?.homeworkId === homeworkId);
  if (!rows.length) throw new Error(`homework_not_found:${homeworkId}`);
  const from = rows[0].testDate ?? null;
  for (const row of rows) Object.assign(row, { testDate, testDateSource: "human_confirmed", testDateConfirmed: true });
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(json, null, 2)}\n`); fs.renameSync(`${file}.tmp`, file);
  const log = path.join(dir, "sunny_health", "profile-changes.ndjson");
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.appendFileSync(log, `${JSON.stringify({ at: new Date().toISOString(), source: source.trim(), homeworkId, changes: { testDate: { from, to: testDate } } })}\n`);
  console.log(` 🎮 [homework-test-date] [set] child=${childId} homework=${homeworkId} testDate=${testDate} from=${from ?? "none"} rows=${rows.length}`);
}
