import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openChart } from "../chart/db";
import { exportEvents } from "../chart/exportEvents";
import { recordAssignment, recordFact, recordTags } from "../chart/spelling/record";
import { claimHowSheLearnsTool, pastWeeksLine, pastWeeksTool, readPastWeeks } from "./pastWeeks";
import { spellingSuccessorToolkit, type SuccessorFacts } from "./spellingSuccessorTools";

// Phase 2 (2026-11-11): the Planner reads its cross-week claims, each with code's score, and writes new ones while it
// decides. Claims are frozen with the past-weeks archive, so a restart asks the same question.
let rootDir: string;
beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "past-weeks-claims-"));
  vi.stubEnv("SUNNY_CHART_DIR", path.join(rootDir, "charts"));
  const db = openChart("lab-claims");
  recordAssignment(db, { assignmentId: "wk1", words: ["carnivore"], testDate: null, sourcePhotoHash: "a".repeat(64) });
  recordTags(db, { assignmentId: "wk1", taxonomyVersion: 1, tags: [{ word: "carnivore", patterns: ["spelling.silent_letters"] }] });
  recordAssignment(db, { assignmentId: "wk2", words: ["tribe"], testDate: null, sourcePhotoHash: "b".repeat(64) });
  recordFact(db, "learner.hypothesis", { hypothesisId: "wk1:silent", claim: "She drops silent letters on a first try.", decisionIds: [], formedInAssignmentId: "wk1",
    scope: { patterns: ["spelling.silent_letters"], words: [] }, metric: "first_try_unassisted", expected: { min: 0, max: 0.5 }, falsifier: "Most right on two new lists.", horizonDays: 42 });
  db.close();
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(rootDir, { recursive: true, force: true }); });

const view = (archive: ReturnType<typeof readPastWeeks>) => pastWeeksTool<object>(archive).run({}, { view: "claims", week: "", query: "", offset: 0, limit: 20 } as never);

it("freezes her claims, with code's score, into the archive the Planner reads", () => {
  const archive = readPastWeeks("lab-claims", { rootDir, excludeHomeworkIds: ["wk2"] });
  expect(archive.claims).toMatchObject({ planning: "wk2", rows: [{ hypothesisId: "wk1:silent", status: "proposed", evidence: { right: 0, total: 0 } }] });
  expect(view(archive)).toMatchObject({ ok: true, result: { view: "claims", total: 1, rows: [{ claim: "She drops silent letters on a first try.", status: "proposed" }] } });
  expect(pastWeeksLine({ ...archive, weeks: [{ homeworkId: "wk1", title: "Words", domain: "spelling", started: "2026-11-02" } as never] })).toContain("claims");
});

it("keeps an older archive's exact tool when it has no claims", () => {
  vi.stubEnv("SUNNY_CHART_DIR", "");
  const archive = readPastWeeks("lab-claims", { rootDir, excludeHomeworkIds: ["wk2"] });
  expect(archive.claims).toBeUndefined();
  expect(JSON.stringify(pastWeeksTool(archive).schema)).not.toContain("claims");
  expect(view(archive)).toMatchObject({ ok: false });
});

it("records a new claim from the week being planned; the same claim twice is one record", () => {
  const archive = readPastWeeks("lab-claims", { rootDir, excludeHomeworkIds: ["wk2"] });
  const tool = claimHowSheLearnsTool<object>(archive)!;
  const input = { claim: "Recall-first carries over to a new list.", decision_ids: ["decision:wk1:2"], patterns: [], words: ["tribe"], metric: "first_try_unassisted",
    expected_min: 0.6, expected_max: 1, falsifier: "Under 60% on her own on two new lists.", horizon_days: 42 };
  const first = tool.run({}, input as never), again = tool.run({}, input as never);
  expect(first).toMatchObject({ ok: true, result: { recorded: true, status: "proposed" } });
  expect(again).toMatchObject({ ok: true });
  const db = openChart("lab-claims", { readonly: true });
  const claims = exportEvents(db).filter(event => event.type === "learner.hypothesis");
  db.close();
  expect(claims).toHaveLength(2);
  expect(claims[1]).toMatchObject({ actor: "planner", payload: { formedInAssignmentId: "wk2", scope: { patterns: [], words: ["tribe"] }, decisionIds: ["decision:wk1:2"] } });
  expect(tool.run({}, { ...input, words: [], patterns: [] } as never)).toMatchObject({ ok: false });
});

it("the next-board Planner is offered the claim tool beside read_past_weeks", () => {
  const archive = readPastWeeks("lab-claims", { rootDir, excludeHomeworkIds: ["wk2"] });
  const facts: SuccessorFacts = { builtIns: [], activities: [{ id: "generated-game", checkpoint: false, setup: { type: "generated-game" } }], rerunnable: () => true, evaluationIds: [], allowedActions: ["generate_support"], idPrefix: "next",
    pastWeeks: { ...archive, weeks: [{ homeworkId: "wk1", title: "Words", domain: "spelling", started: "2026-11-02" } as never] } };
  const names = spellingSuccessorToolkit(facts).tools.map(tool => tool.name);
  expect(names).toEqual(expect.arrayContaining(["read_past_weeks", "claim_how_she_learns"]));
});
