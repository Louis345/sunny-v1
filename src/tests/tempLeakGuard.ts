import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tierFromEnv } from "../testTiers";

// I2 (11/14): suites left sunny-* folders in the shared system temp dir (2,600+ on the dev Mac) and no run counted
// them. Counting the shared dir is unreliable (other worktrees run tests at the same time), so each run gets its own
// temp dir: every os.tmpdir() call in the run's workers lands there. The guard counts the sunny-* folders left in it,
// logs them by prefix, removes the dir, and fails only when the count rises above the ceiling (a ratchet: lower it
// as suites learn to clean up). Measured on the everyday tier (11/14: 106 left after the four worst suites were fixed);
// the predeploy and all tiers only log until they are measured.
export const TEMP_LEAK_CEILING = 0;

/** After each test file (files run one at a time): remove the sunny-* folders it made and name the file (I2, 11/22). */
export function removeTempDirsMadeSince(dir: string, before: ReadonlySet<string>, file: string): string[] {
  const made = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(name => name.startsWith("sunny-") && !before.has(name));
  for (const name of made) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  if (made.length) console.log(` 🎮 [test-guard] [temp-dirs-cleaned] file=${file} count=${made.length}`);
  return made;
}

export function countLeftSunnyTempDirs(dir: string): { total: number; byPrefix: Record<string, number> } {
  const byPrefix: Record<string, number> = {};
  let total = 0;
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!name.startsWith("sunny-")) continue;
    total += 1;
    const prefix = name.replace(/[-_][^-_]*$/, "");
    byPrefix[prefix] = (byPrefix[prefix] ?? 0) + 1;
  }
  return { total, byPrefix };
}

const TEMP_VARS = ["TMPDIR", "TMP", "TEMP"] as const;

export function startTempLeakGuard(opts: { env?: NodeJS.ProcessEnv; ceiling?: number } = {}) {
  const env = opts.env ?? process.env, ceiling = opts.ceiling ?? TEMP_LEAK_CEILING;
  const previous = env.TMPDIR;
  const saved = Object.fromEntries(TEMP_VARS.map(key => [key, env[key]]));
  // Short name: Chrome and Playwright put sockets under the temp dir, and macOS socket paths are capped at 104 bytes.
  const runDir = fs.mkdtempSync(path.join(previous || os.tmpdir(), "vr-"));
  for (const key of TEMP_VARS) env[key] = runDir;
  console.log(` 🎮 [test-guard] [temp-dir] [run-dir] ${runDir}`);
  return {
    previous,
    finish() {
      for (const key of TEMP_VARS) { if (saved[key] === undefined) delete env[key]; else env[key] = saved[key]; }
      const left = countLeftSunnyTempDirs(runDir);
      fs.rmSync(runDir, { recursive: true, force: true });
      const worst = Object.entries(left.byPrefix).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([prefix, count]) => `${prefix}=${count}`).join(" ");
      console.log(` 🎮 [test-guard] [temp-dirs-left] [${left.total > ceiling ? "over" : "ok"}] total=${left.total} ceiling=${ceiling} ${worst}`);
      if (left.total > ceiling) throw new Error(`temp_dirs_left_by_tests: ${left.total} > ${ceiling} (${worst}); remove them in afterAll`);
      return left;
    },
  };
}

export default function setup(): () => void {
  const guard = startTempLeakGuard({ ceiling: tierFromEnv() === "everyday" ? TEMP_LEAK_CEILING : Number.POSITIVE_INFINITY });
  return () => { guard.finish(); };
}
