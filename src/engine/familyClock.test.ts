import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { familyClock } from "../utils/familyCalendar";

// Owner 2026-11-23 (human-caught, board 14): the Planner told her parents "several sessions ran very late (around
// 1-2 am)". Her sessions were 8-9 pm Eastern; the Planner read UTC clock times (01:48) as local. Why logs did not
// catch it: every timestamp is UTC by design. Why the lab missed it: no test read a time the way the Planner does.
afterEach(() => vi.unstubAllEnvs());

it("shows a time the way the family reads a clock, with the zone named", () => {
  vi.stubEnv("SUNNY_FAMILY_TIME_ZONE", "America/New_York");
  expect(familyClock("2026-11-23T01:48:45.876Z")).toBe("2026-11-22 20:48 EST");
  expect(familyClock("2026-07-01T23:05:00Z")).toBe("2026-07-01 19:05 EDT");
  expect(familyClock("")).toBe("");
});

it("no Planner-facing line prints a raw UTC clock time", () => {
  for (const file of ["src/engine/sessionScorecard.ts", "src/engine/conceptSignal.ts", "src/engine/plannerIntrospection.ts", "src/engine/sessionRating.ts", "src/engine/sessionHandoff.ts", "src/engine/spellingSuccessorTools.ts"]) {
    expect(fs.readFileSync(path.join(process.cwd(), file), "utf8"), file).not.toMatch(/slice\(0, 16\)\.replace\("T", " "\)/);
  }
});
