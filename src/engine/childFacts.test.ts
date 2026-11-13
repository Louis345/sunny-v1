import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { setChildFacts } from "../profiles/childFacts";

// 2026-11-10: Ila's grade was stale in learning_profile.json, and Reina's age differed between learning_profile.json
// and child_profile.json (which overrides it). A parent's correction is written to both, dated, and logged.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it("writes a parent's facts to every file that holds them, and logs the change", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-facts-")); roots.push(rootDir);
  const dir = path.join(rootDir, "src/context/reina"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "learning_profile.json"), JSON.stringify({ demographics: { age: 7, grade: 2, diagnoses: [], learningStyle: "mixed", attentionSpan: "moderate", iepActive: false } }));
  fs.writeFileSync(path.join(dir, "child_profile.json"), JSON.stringify({ childId: "reina", demographics: { age: 8, grade: 2 } }));
  setChildFacts("reina", { grade: 3, gradeSchoolYear: 2026, birthDate: "2018-05-01", school: "Pashley" }, "parent, 2026-11-10", { rootDir });
  for (const file of ["learning_profile.json", "child_profile.json"]) {
    expect(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")).demographics).toMatchObject({ grade: 3, gradeSchoolYear: 2026, birthDate: "2018-05-01", school: "Pashley" });
  }
  expect(fs.readFileSync(path.join(dir, "sunny_health", "profile-changes.ndjson"), "utf8")).toContain('"grade":{"from":2,"to":3}');
  expect(() => setChildFacts("reina", { birthDate: "May 1" }, "x", { rootDir })).toThrow("birth_date_must_be_yyyy_mm_dd");
});
