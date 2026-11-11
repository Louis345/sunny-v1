import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { readSoulWithCurrentFacts } from "../profiles/soulCurrentFacts";

// 2026-11-10: the owner set Ila to grade 3 at Pashley with sunny:child:facts, but her soul.md (a dated snapshot of an
// old evaluation) still said "Age: 8 years, 3 months / Grade: 2nd (Teacher: M. Bowker)", and every AI that reads
// soul.md verbatim (session prompts, the psychologist's plan, the chart's "about her") kept seeing grade 2. A peer
// session caught it by reading both files; no log compares them; the lab's fixtures have no soul.md with old facts.
// Invariant: whatever reads soul.md for an AI gets her current dated facts first, marked as replacing older lines.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function child(demographics: Record<string, unknown>, manifest?: Record<string, unknown>) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "soul-facts-")); roots.push(rootDir);
  const dir = path.join(rootDir, "src", "context", "soulkid");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "soul.md"), "# Soulkid\n\n## Who she is\n- Age: 8 years, 3 months\n- Grade: 2nd (Teacher: M. Bowker)\n");
  fs.writeFileSync(path.join(dir, "learning_profile.json"), JSON.stringify({ demographics }));
  if (manifest) fs.writeFileSync(path.join(dir, "child_profile.json"), JSON.stringify({ demographics: manifest }));
  return rootDir;
}

it("puts her current dated facts above the old profile, and says they replace its age, grade and school lines", () => {
  const rootDir = child({ age: 8, grade: 3, gradeSchoolYear: 2026, birthDate: "2017-11-21", school: "Pashley Elementary, Glenville NY", diagnoses: [] });
  const text = readSoulWithCurrentFacts("soulkid", { rootDir, today: new Date("2026-11-25T12:00:00Z") });
  const facts = text.indexOf("Current facts"), old = text.indexOf("Grade: 2nd");
  expect(facts).toBeGreaterThanOrEqual(0);
  expect(facts).toBeLessThan(old);
  expect(text).toContain("Age: 9");
  expect(text).toContain("Grade: 3");
  expect(text).toContain("Pashley Elementary");
  expect(text.slice(0, old)).toMatch(/replace/i);
});

it("names a fact with no date as possibly old instead of passing it off as current", () => {
  const rootDir = child({ age: 7, grade: 2 }, { age: 8 });
  const text = readSoulWithCurrentFacts("soulkid", { rootDir });
  expect(text).toContain("Age: 8");
  expect(text).toMatch(/not dated/i);
});
