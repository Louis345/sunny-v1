import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openChart } from "../chart/db";
import { exportEvents } from "../chart/exportEvents";
import { recordAssignment, recordPresentation, recordResponse } from "../chart/spelling/record";
import { readPastWeeks } from "./pastWeeks";
import { queryRecordTool } from "./recordQuery";
import { spellingSuccessorToolkit, type SuccessorFacts } from "./spellingSuccessorTools";

// 2026-11-11 owner: "the planner can see everything with an SQL query". Her whole chart database, read only, one
// child's file, as it stood when the question was asked (a restart asks the same question and gets the same rows).
let rootDir: string;
const answer = (db: ReturnType<typeof openChart>, word: string, wrote: string) => {
  const shown = recordPresentation(db, { assignmentId: "wk1", sessionId: "s1", itemId: word, word, acceptedForms: [word], instrument: "discovery", role: "measure", protocolVersion: 1, shown: { lettersVisible: false, hint: false, companionHelp: false } });
  recordResponse(db, { assignmentId: "wk1", sessionId: "s1", itemId: word, attempt: 1, rawResponse: wrote, status: "answered", support: { audioReplays: 0, spellingShown: false, hint: false, companionHelp: false } }, { cites: [shown.event_id] });
};
beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "record-query-"));
  vi.stubEnv("SUNNY_CHART_DIR", path.join(rootDir, "charts"));
  const db = openChart("lab-query");
  recordAssignment(db, { assignmentId: "wk1", words: ["carnivore", "pardon"], testDate: null, sourcePhotoHash: "a".repeat(64) });
  recordAssignment(db, { assignmentId: "wk2", words: ["tribe"], testDate: null, sourcePhotoHash: "b".repeat(64) });
  answer(db, "carnivore", "carnivor");
  db.close();
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(rootDir, { recursive: true, force: true }); });

const run = (asOf: number, sql: string) => queryRecordTool<object>("lab-query", asOf).run({}, { sql } as never);
const asOfNow = () => { const db = openChart("lab-query", { readonly: true }); const max = Math.max(...exportEvents(db).map(e => e.sequence)); db.close(); return max; };

it("answers a SELECT over her events with json_extract, as of the frozen point", () => {
  const asOf = asOfNow();
  const db = openChart("lab-query"); answer(db, "pardon", "pardon"); db.close();
  const result = run(asOf, "SELECT json_extract(payload,'$.rawResponse') AS wrote FROM events WHERE type='response.observed' ORDER BY sequence");
  expect(result).toMatchObject({ ok: true, result: { rows: [{ wrote: "carnivor" }], rowCount: 1, truncated: false } });
});

it("refuses anything that is not one read-only SELECT", () => {
  const asOf = asOfNow();
  for (const sql of ["DELETE FROM events", "SELECT 1; DROP TABLE events", "PRAGMA table_info(events)", "ATTACH DATABASE '/tmp/x.db' AS x", "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n) SELECT i FROM n", "CREATE TEMP VIEW v AS SELECT 1"]) {
    expect(run(asOf, sql), sql).toMatchObject({ ok: false });
  }
  const db = openChart("lab-query", { readonly: true });
  expect(exportEvents(db).length).toBeGreaterThan(0);
  db.close();
});

it("caps rows at 100 and says so", () => {
  const result = run(asOfNow(), "WITH a(x) AS (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10)) SELECT a.x, b.x AS y, c.x AS z FROM a, a AS b, a AS c");
  expect(result).toMatchObject({ ok: true, result: { rowCount: 100, truncated: true } });
});

it("is offered beside read_past_weeks when her chart is there, frozen with the archive", () => {
  const archive = readPastWeeks("lab-query", { rootDir, excludeHomeworkIds: ["wk2"] });
  expect(archive.claims?.asOfSequence).toBe(asOfNow());
  const facts: SuccessorFacts = { builtIns: [], activities: [{ id: "generated-game", checkpoint: false, setup: { type: "generated-game" } }], rerunnable: () => true, evaluationIds: [], allowedActions: ["generate_support"], idPrefix: "next",
    pastWeeks: { ...archive, weeks: [{ homeworkId: "wk1", title: "Words", domain: "spelling", started: "2026-11-02" } as never] } };
  expect(spellingSuccessorToolkit(facts).tools.map(tool => tool.name)).toContain("query_record");
});
