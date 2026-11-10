import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { installServerLogFile } from "./serverLogFile";

// 2026-11-10 (Opus audit): the server log was overwritten on every restart, so the proof of Reina's lost morning
// would vanish at the next restart, and nothing could tell when a line was written. The server keeps a dated copy
// of everything it prints, with the time on each line, for seven days.
const roots: string[] = [];
let uninstall: (() => void) | undefined;
afterEach(() => { uninstall?.(); uninstall = undefined; for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it("keeps a dated, timed copy of what the server prints, and drops copies older than seven days", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-server-log-")); roots.push(dir);
  fs.writeFileSync(path.join(dir, "2026-11-01.log"), "old\n");
  fs.writeFileSync(path.join(dir, "2026-11-05.log"), "recent\n");
  uninstall = installServerLogFile({ dir, now: () => new Date("2026-11-10T12:16:00Z") });
  process.stdout.write(" 🎮 [learning-cycle-route] [completion] [failed] Error: x\n");
  const files = fs.readdirSync(dir).sort();
  expect(files).toEqual(["2026-11-05.log", "2026-11-10.log"]);
  expect(fs.readFileSync(path.join(dir, "2026-11-10.log"), "utf8")).toContain("2026-11-10T12:16:00.000Z  🎮 [learning-cycle-route] [completion] [failed] Error: x");
});
