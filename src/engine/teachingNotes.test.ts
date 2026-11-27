import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { readTeachingNotes, teachingNotesSection, TEACHING_NOTES_FILE } from "./teachingNotes";

// Owner + Saori 11/22: what worked at the table ("19 classmates: about 10 or 20?") never reached the Planner. A parent's
// teaching note is outside knowledge: dated, with who wrote it, read first. Child data never reaches the public repo,
// so this test uses a fixture and the file name is gitignored for every child folder.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function withNotes(text: string) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-notes-")); roots.push(rootDir);
  const dir = path.join(rootDir, "src/context/lab-child");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, TEACHING_NOTES_FILE), text);
  return rootDir;
}

describe("parent teaching notes, as outside knowledge", () => {
  it("reads each dated entry with its writer and gives it an id the Planner can cite", () => {
    const rootDir = withNotes(`# Teaching notes\n\nAnything above the first dated heading is ignored.\n\n## 2026-11-22 Parent (mother)\nShe rounds by changing the digit she looks at.\nMeaning first worked: "19 classmates: about 10 or 20?"\n\n## 2026-11-20 Tutor\nShort sessions.\n\n## not a date\nSkipped.\n`);
    const notes = readTeachingNotes("lab-child", { rootDir });
    expect(notes).toEqual([
      { id: "note:2026-11-20:1", date: "2026-11-20", source: "Tutor", text: "Short sessions." },
      { id: "note:2026-11-22:1", date: "2026-11-22", source: "Parent (mother)", text: `She rounds by changing the digit she looks at.\nMeaning first worked: "19 classmates: about 10 or 20?"` },
    ]);
    const section = teachingNotesSection(notes);
    expect(section).toMatch(/^Teaching notes from outside Sunny \(a parent or tutor, dated, with who wrote it\):/);
    expect(section).not.toContain("read these first");
    expect(section).toContain(`[note:2026-11-22:1] 2026-11-22, Parent (mother):`);
  });

  it("no file is no notes, said plainly", () => {
    expect(readTeachingNotes("nobody", { rootDir: path.join(os.tmpdir(), "sunny-notes-none") })).toEqual([]);
    expect(teachingNotesSection([])).toContain("- None recorded. A parent or tutor can add dated notes to");
  });

  it("the notes file of every child is gitignored (child data never reaches GitHub)", () => {
    const ignored = execFileSync("git", ["check-ignore", "-v", `src/context/ila/${TEACHING_NOTES_FILE}`, `src/context/reina/${TEACHING_NOTES_FILE}`], { encoding: "utf8" });
    expect(ignored.trim().split("\n")).toHaveLength(2);
  });
});
