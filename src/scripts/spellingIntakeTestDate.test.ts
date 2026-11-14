import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { linearJourneyFixture } from "./fixtures/authoredJourney";
import { recordedIntake } from "./fixtures/recordedIntake";
import { recordedSpellingDiagnostic, seedSpellingLab } from "./fixtures/spellingEvidenceFirst";
import { runSpellingDiscoveryIntake } from "./ingestHomework";
import { runAdaptiveMathGeneration } from "./runAdaptiveMathGeneration";
import { completeDiscoveryEvaluation, resolveAdaptiveMathDraftDir } from "../engine/adaptiveMathDiscovery";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { recordSpellingDiscoveryAttempt } from "../engine/learningCycleRuntime";
import { setHomeworkTestDate } from "../profiles/homeworkTestDate";
vi.mock("../utils/generateStoryImage", () => ({ generateStoryImage: vi.fn() }));
vi.mock("../engine/directMathExperience", async original => ({ ...await original<typeof import("../engine/directMathExperience")>(),
  askLearningPlanner: vi.fn(async () => { throw new Error("test_stops_before_teaching_planner_call"); }) }));

// E5 (BUGS.md, 11/08 "Practice should move toward test conditions"): `--testDate` reached only the chart database.
// The spelling intake wrote `testDate: null` into homework/current.json (so a re-ingest also erased a date a parent set
// later), and the intake and Teaching-board Planners got a masteryContext with no date and the default "build" pace.
// Why the human caught it: the Planner said "not recorded" with the test days away. Why logs missed it: nothing logs
// the date a Planner packet carries. Why the lab missed it: no intake test ever passed a test date.
const roots: string[] = [];
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });

async function intake(rootDir: string, testDate?: string) {
  return runSpellingDiscoveryIntake({ rootDir, childId: "lab-child", sourceFile: path.join(rootDir, "school-words.txt"), testDate }, {
    plannerTools: recordedIntake(async packet => ({ draft: { boardDefinition: linearJourneyFixture(["diagnostic"]), diagnostic: recordedSpellingDiagnostic(packet), title: "School words", words: ["night", "light"].map(word => ({ word, pageNumber: 1 })), uncertainty: [] } })),
  });
}

it("carries the intake's test date into current.json, keeps a parent's date on re-ingest, and gives both Planners the date", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-intake-testdate-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  seedSpellingLab(rootDir);
  const currentFile = path.join(rootDir, "src/context/lab-child/homework/current.json");
  const { homeworkId } = await intake(rootDir, "2026-11-16");
  const current = JSON.parse(fs.readFileSync(currentFile, "utf8"));
  for (const row of [current.current, current.activeByDomain.spelling]) expect(row).toMatchObject({ homeworkId, testDate: "2026-11-16", testDateConfirmed: true });
  const draft = resolveAdaptiveMathDraftDir("lab-child", homeworkId, { rootDir });
  const intakePacket = JSON.parse(fs.readFileSync(path.join(draft, "spelling-intake-request.json"), "utf8"));
  expect(intakePacket.masteryContext).toMatchObject({ testDate: "2026-11-16", testDateConfirmed: true, daysUntilTest: 2, sessionIntensity: "urgent" });

  // A parent moves the date; re-running the same intake without --testDate must keep it.
  setHomeworkTestDate("lab-child", homeworkId, "2026-11-18", "parent", { rootDir });
  await intake(rootDir);
  expect(JSON.parse(fs.readFileSync(currentFile, "utf8")).current).toMatchObject({ testDate: "2026-11-18", testDateSource: "human_confirmed" });

  // The Teaching-board Planner reads the recorded date.
  const scope = { rootDir, childId: "lab-child", homeworkId };
  Object.values(getLearningCycle("lab-child", homeworkId, scope)!.nodes[0].evidenceContract.spellingItems!).forEach((item, index) => recordSpellingDiscoveryAttempt({ childId: "lab-child", homeworkId,
    attempt: { attemptId: `observed-${index}`, itemId: item.id, attemptedValue: item.word, observedAt: "2026-11-14T15:00:00Z" }, support: { status: "unassisted", scaffolds: [] } }, scope));
  completeDiscoveryEvaluation({ ...scope, completedAt: "2026-11-14T15:01:00Z" });
  await runAdaptiveMathGeneration("lab-child", homeworkId, rootDir).catch(() => undefined);
  const teachingPacket = JSON.parse(fs.readFileSync(path.join(draft, "spelling-targeted-request.json"), "utf8"));
  expect(teachingPacket.masteryContext).toMatchObject({ testDate: "2026-11-18", daysUntilTest: 4, sessionIntensity: "build", expectedSessionsRemaining: 5 });
});
