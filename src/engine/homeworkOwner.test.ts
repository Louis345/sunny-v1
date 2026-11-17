import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { resolveChildContextDir } from "../utils/contextRoot";
import { hydrateLearningProfileFromWaterfall, writeWaterfallHomework } from "../profiles/chartWaterfall";
import { setHomeworkTestDate } from "../profiles/homeworkTestDate";

// Human-caught 2026-11-16 (owner): after Ila's new spelling list was ingested, she could not start ("it won't let me
// in"). Her profile file held its own stale copy of her homework (subject "math", lanes: spelling only), and that copy
// won over homework/current.json (subject spelling, lanes spelling + math). Session start looked for math, found no
// lane, and refused; the next save wrote the stale copy back and erased her math lane. Logs only showed the refusal;
// the lab never ingested a second subject for a child who already had one in progress.
// Rule: homework/current.json is the one owner of her subjects, and a save changes only the subjects it names.

const lane = (homeworkId: string) => ({ homeworkId, weekOf: "2026-11-16", testDate: null, wordList: [], nodes: [] }) as unknown as NonNullable<LearningProfile["pendingHomework"]>;

function setup() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-homework-owner-"));
  const dir = resolveChildContextDir("ila", { rootDir });
  fs.mkdirSync(path.join(dir, "homework"), { recursive: true });
  const file = path.join(dir, "homework", "current.json");
  fs.writeFileSync(file, JSON.stringify({ version: 1, childId: "ila", selectedDomain: "spelling", current: lane("hw-spelling-new"),
    activeByDomain: { spelling: lane("hw-spelling-new"), math: lane("hw-math-1") }, updatedAt: "2026-11-16T20:00:00Z" }));
  return { rootDir, file };
}

describe("homework/current.json owns her subjects", () => {
  it("a stale copy in the profile file never hides the homework file's subject or lanes", () => {
    const { rootDir } = setup();
    const stale = { childId: "ila", chartLinks: {}, selectedHomeworkDomain: "math", pendingHomework: lane("hw-spelling-new"),
      activeHomeworkByDomain: { spelling: lane("hw-spelling-new") } } as unknown as LearningProfile;
    const profile = hydrateLearningProfileFromWaterfall("ila", stale, { rootDir });
    expect(profile.selectedHomeworkDomain).toBe("spelling");
    expect(Object.keys(profile.activeHomeworkByDomain ?? {}).sort()).toEqual(["math", "spelling"]);
  });

  it("saving one subject keeps every other subject's lane", () => {
    const { rootDir, file } = setup();
    writeWaterfallHomework("ila", { childId: "ila", chartLinks: {}, selectedHomeworkDomain: "spelling", pendingHomework: lane("hw-spelling-newer"),
      activeHomeworkByDomain: { spelling: lane("hw-spelling-newer") } } as unknown as LearningProfile, { rootDir });
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(saved.activeByDomain.math.homeworkId).toBe("hw-math-1");
    expect(saved.activeByDomain.spelling.homeworkId).toBe("hw-spelling-newer");
  });

  // BUGS.md S15 (AI-caught 2026-11-17 when the owner restated dates): Ila's spelling test date, set 11/16 by the
  // parent command, was empty the next day. The command writes only homework/current.json; the next save rebuilt that
  // subject from the profile's copy, which had no date, and replaced it. Logs showed the set line and nothing after;
  // the lab never saved again after setting a date. A parent-confirmed date stays until the parent changes it.
  it("a save from the profile's copy keeps a parent's test date on the same homework", () => {
    const { rootDir, file } = setup();
    vi.spyOn(console, "log").mockImplementation(() => {});
    setHomeworkTestDate("ila", "hw-spelling-new", "2026-11-19", "parent", { rootDir });
    writeWaterfallHomework("ila", { childId: "ila", chartLinks: {}, selectedHomeworkDomain: "spelling", pendingHomework: lane("hw-spelling-new"),
      activeHomeworkByDomain: { spelling: lane("hw-spelling-new") } } as unknown as LearningProfile, { rootDir });
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(saved.activeByDomain.spelling).toMatchObject({ testDate: "2026-11-19", testDateConfirmed: true });
    expect(saved.current).toMatchObject({ testDate: "2026-11-19", testDateConfirmed: true });
  });
});
