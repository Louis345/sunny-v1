import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { ensureFreshPendingHomework } from "../scripts/homeworkSelector";
import { initializeLearningProfile, readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import { writeWordBank } from "../utils/wordBankIO";
import { selectHomeworkDomain } from "./homeworkLanes";

// 2026-11-10, owner: "start Ila with spelling because she's familiar with that, then we switch to math… I can just say
// 'Ila's ready for math', and we should have both built already." Sunny keeps one homework lane per subject, but the
// only way to change the selected lane was ingesting new homework (which selects it) or restarting the kiosk with
// --homework-domain, the flag that refused Reina's math on 11/8. Invariants: a parent switch holds through the next
// session start, never selects a subject that has no homework, and is logged with who asked.
const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-subject-switch-"));
const contextRoot = path.join(root, "context");
const childId = "subject-switch-child";
afterEach(() => { delete process.env.SUNNY_CONTEXT_ROOT; fs.rmSync(root, { recursive: true, force: true }); });

type Pending = NonNullable<LearningProfile["pendingHomework"]>;
const lane = (homeworkId: string, words: string[]): Pending => ({
  weekOf: "2026-11-08", homeworkId, testDate: "2026-11-30", wordList: words, generatedAt: "2026-11-08T10:00:00.000Z",
  nodes: [{ id: `n-${homeworkId}`, type: "word-radar", words, difficulty: 1, gameFile: null, storyFile: null }],
});

function seed(): void {
  process.env.SUNNY_CONTEXT_ROOT = contextRoot;
  const spelling = lane("hw-spelling-switch", ["alarm", "charge"]), math = lane("hw-math-switch", []);
  writeLearningProfile(childId, { ...initializeLearningProfile({ childId, age: 8, grade: 3, diagnoses: [], learningGoals: [] }),
    selectedHomeworkDomain: "math", pendingHomework: math, activeHomeworkByDomain: { spelling, math } });
  writeWordBank(childId, { childId, version: 1, lastUpdated: new Date().toISOString(), words: [] });
  const cycles = path.join(contextRoot, childId, "homework", "cycles");
  fs.mkdirSync(cycles, { recursive: true });
  for (const [subject, pending] of [["spelling_test", spelling], ["math", math]] as const) {
    fs.writeFileSync(path.join(cycles, `${pending.homeworkId}.json`), JSON.stringify({ homeworkId: pending.homeworkId, subject, wordList: pending.wordList,
      ingestedAt: "2026-11-08", testDate: "2026-11-30", assumptions: null, postAnalysis: null, scanResult: null, delta: null, metrics: null, nodes: pending.nodes }));
  }
}

it("switches her subject, and the next session start keeps it", () => {
  seed();
  selectHomeworkDomain(childId, "spelling", { source: "parent, before Ila's session" });
  expect(ensureFreshPendingHomework(childId).homeworkId).toBe("hw-spelling-switch");
  expect(readLearningProfile(childId)!.selectedHomeworkDomain).toBe("spelling");
  selectHomeworkDomain(childId, "math", { source: "parent: Ila's ready for math" });
  expect(ensureFreshPendingHomework(childId).homeworkId).toBe("hw-math-switch");
  const log = fs.readFileSync(path.join(contextRoot, childId, "sunny_health", "profile-changes.ndjson"), "utf8");
  expect(log).toContain("Ila's ready for math");
  expect(log).toContain('"from":"spelling"');
});

it("refuses a subject she has no homework for, and leaves her where she was", () => {
  seed();
  expect(() => selectHomeworkDomain(childId, "reading", { source: "parent" })).toThrow("no_reading_homework");
  expect(readLearningProfile(childId)!.selectedHomeworkDomain).toBe("math");
  expect(() => selectHomeworkDomain(childId, "spelling", { source: " " })).toThrow("source_required");
});
