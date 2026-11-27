import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { setHomeworkTestDate } from "../profiles/homeworkTestDate";
import { schoolTestFacts } from "./schoolTestObjective";

// 2026-11-12 (owner): Reina has a math test Monday, but her math week (set up 11/10) had no test date, so the Planner
// read "School test date: not recorded." A date could only be set when the homework was first added. A parent now sets
// it on the existing week, every row that names that homework gets it, and the change is logged.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function reinaRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-testdate-")); roots.push(rootDir);
  const dir = path.join(rootDir, "src/context/reina/homework"); fs.mkdirSync(dir, { recursive: true });
  const math = { homeworkId: "hw-math-1", weekOf: "2026-11-10", testDate: null, testDateSource: null };
  const spelling = { homeworkId: "hw-spelling-1", weekOf: "2026-11-10", testDate: null, testDateSource: null };
  fs.writeFileSync(path.join(dir, "current.json"), JSON.stringify({ version: 1, childId: "reina", selectedDomain: "math", current: math, activeByDomain: { spelling, math } }));
  return { rootDir, file: path.join(dir, "current.json") };
}

it("sets a parent's test date on every row for that homework, so the Planner reads it, and logs the change", () => {
  const { rootDir, file } = reinaRoot();
  setHomeworkTestDate("reina", "hw-math-1", "2026-11-16", "parent, 2026-11-12", { rootDir });
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const row of [json.current, json.activeByDomain.math]) expect(row).toMatchObject({ testDate: "2026-11-16", testDateSource: "human_confirmed", testDateConfirmed: true });
  expect(json.activeByDomain.spelling.testDate).toBeNull();
  const facts = schoolTestFacts({ waterfall: { current: json.current }, activeByDomain: json.activeByDomain }, "hw-math-1", new Date(2026, 10, 12));
  expect(facts).toMatchObject({ testDate: "2026-11-16", weekday: "Monday", daysLeft: 4 });
  expect(fs.readFileSync(path.join(rootDir, "src/context/reina/sunny_health/profile-changes.ndjson"), "utf8")).toContain('"testDate":{"from":null,"to":"2026-11-16"}');
});

it("refuses a bad date or a homework the child does not have, and changes nothing", () => {
  const { rootDir, file } = reinaRoot();
  const before = fs.readFileSync(file, "utf8");
  expect(() => setHomeworkTestDate("reina", "hw-math-1", "Monday", "parent", { rootDir })).toThrow("test_date_must_be_yyyy_mm_dd");
  expect(() => setHomeworkTestDate("reina", "hw-math-9", "2026-11-16", "parent", { rootDir })).toThrow("homework_not_found:hw-math-9");
  expect(() => setHomeworkTestDate("reina", "hw-math-1", "2026-11-16", " ", { rootDir })).toThrow("source_required");
  expect(fs.readFileSync(file, "utf8")).toBe(before);
});
