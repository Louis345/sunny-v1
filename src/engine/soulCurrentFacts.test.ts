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

// Owner 2026-11-20: "Tomorrow's their birthday, so when they do Sunny, the companion should know it's their birthday".
// FaceTime already had the birthday line (11/15); the homework-session companion only saw "Age: 9 (born 2017-11-21)"
// and had to do date math to notice. Why the human caught it: only family knows the day matters. Why logs missed it:
// nothing logs what a prompt leaves implicit. Why the lab missed it: no test set "today" to her birthday.
it("says plainly when today is her birthday, and when it is coming", () => {
  const rootDir = child({ grade: 3, gradeSchoolYear: 2026, birthDate: "2017-11-21" });
  expect(readSoulWithCurrentFacts("soulkid", { rootDir, today: new Date("2026-11-21T15:00:00Z") })).toContain("Today is her birthday: she is 9 today.");
  expect(readSoulWithCurrentFacts("soulkid", { rootDir, today: new Date("2026-11-20T15:00:00Z") })).toMatch(/Her birthday is tomorrow .*she turns 9/);
  expect(readSoulWithCurrentFacts("soulkid", { rootDir, today: new Date("2026-12-10T15:00:00Z") })).not.toMatch(/birthday is|Today is her birthday/);
});

// Owner 11/22 ("it's still saying happy birthday … it breaks the immersion"): Reina heard "Happy birthday, Ray-nah!
// Nine today!" on 11/22 from two games built for her on 11/21. The chart's "about her" carried today's birthday line,
// the Planner and game builder read it, and a game is kept and replayed for days. Why the human caught it: the day
// was over. Why the logs missed it: the line was spoken from the game's own text, which nothing dates. Why the lab
// missed it: no test built content on one day and played it the next. Rule: lasting content (boards, games) gets only
// lasting facts; facts about today go only to the live companion, who reads them fresh every turn.
it("keeps today's birthday out of the facts that lasting boards and games are built from", async () => {
  const rootDir = child({ age: 9, grade: 3, gradeSchoolYear: 2026, birthDate: "2017-11-21", diagnoses: [] });
  const { currentFactsBlock } = await import("../profiles/soulCurrentFacts");
  const birthday = new Date("2026-11-21T15:00:00Z");
  expect(currentFactsBlock("soulkid", { rootDir, today: birthday, lasting: true })).not.toMatch(/birthday/i);
  expect(currentFactsBlock("soulkid", { rootDir, today: birthday, lasting: true })).toContain("Age: 9");
  expect(readSoulWithCurrentFacts("soulkid", { rootDir, today: birthday })).toContain("Today is her birthday");
  const chart = fs.readFileSync(path.join(__dirname, "../profiles/childChart.ts"), "utf8");
  expect(chart).toMatch(/currentFactsBlock\(childId, \{ rootDir, lasting: true \}\)/);
});
