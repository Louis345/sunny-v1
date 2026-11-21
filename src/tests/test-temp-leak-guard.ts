import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { countLeftSunnyTempDirs, startTempLeakGuard } from "./tempLeakGuard";

// I2 (11/14): about 40 suites left sunny-* folders in the system temp dir after every run and nothing counted them.
// Why the human caught it: the temp dir held thousands of sunny-* folders. Why the logs missed it: no run reported
// what it left. Invariant: each run gets its own temp dir, counts the sunny-* folders left in it, removes it, and fails
// when the count rises above the ceiling (other worktrees' runs cannot change the count).
const made: string[] = [];
afterEach(() => { for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const scratch = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-probe-")); made.push(dir); return dir; };

describe("temp leak guard", () => {
  it("counts only sunny-* folders, by prefix", () => {
    const dir = scratch();
    for (const name of ["sunny-a-1", "sunny-a-2", "sunny-b-x", "other-1"]) fs.mkdirSync(path.join(dir, name));
    expect(countLeftSunnyTempDirs(dir)).toEqual({ total: 3, byPrefix: { "sunny-a": 2, "sunny-b": 1 } });
  });

  it("points the run at its own temp dir, removes it after, and fails above the ceiling", () => {
    const env: NodeJS.ProcessEnv = { TMPDIR: scratch() };
    const guard = startTempLeakGuard({ env, ceiling: 1 });
    expect(env.TMPDIR).not.toBe(guard.previous);
    fs.mkdirSync(path.join(env.TMPDIR!, "sunny-left-1"));
    fs.mkdirSync(path.join(env.TMPDIR!, "sunny-left-2"));
    const runDir = env.TMPDIR!;
    expect(() => guard.finish()).toThrow(/temp_dirs_left_by_tests: 2 > 1/);
    expect(fs.existsSync(runDir)).toBe(false);
    expect(env.TMPDIR).toBe(guard.previous);
  });

  it("passes at or under the ceiling", () => {
    const env: NodeJS.ProcessEnv = { TMPDIR: scratch() };
    const guard = startTempLeakGuard({ env, ceiling: 1 });
    fs.mkdirSync(path.join(env.TMPDIR!, "sunny-left-1"));
    expect(guard.finish()).toMatchObject({ total: 1 });
  });
});
