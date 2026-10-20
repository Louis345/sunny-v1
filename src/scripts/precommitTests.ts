/**
 * Pre-commit test selection: run only the tests related to staged files
 * (`vitest related`), like `nx affected`. CI still runs the full suite on every
 * PR — that is the safety net for tests this import graph cannot see.
 *
 * Force the full suite locally with SUNNY_PRECOMMIT_FULL=1.
 */
import { execFileSync, spawnSync } from "child_process";
import path from "path";

export type SuitePlan = { mode: "skip" | "related" | "full"; files: string[] };
export type PrecommitPlan = { root: SuitePlan; web: SuitePlan };

const SOURCE = /\.(ts|tsx|js|mjs|cjs|jsx)$/;
// Dependency changes always touch the lockfile; package.json script edits don't need a full run.
const ROOT_FULL_TRIGGERS = new Set([
  "package-lock.json",
  "vitest.config.ts",
  "tsconfig.json",
]);
const WEB_FULL_TRIGGERS = new Set([
  "package-lock.json",
  "vitest.config.ts",
  "vite.config.ts",
  "tsconfig.json",
  "tsconfig.app.json",
]);
/** Tests that read source via fs (budgets), invisible to the import graph. */
const ROOT_ALWAYS_RUN = ["src/tests/test-session-manager-lines.ts"];

export function planPrecommitTests(
  staged: string[],
  opts: { forceFull?: boolean } = {},
): PrecommitPlan {
  if (opts.forceFull) {
    return { root: { mode: "full", files: [] }, web: { mode: "full", files: [] } };
  }
  const rootFiles: string[] = [];
  const webFiles: string[] = [];
  let rootFull = false;
  let webFull = false;
  for (const file of staged) {
    if (file.startsWith("web/")) {
      const rel = file.slice("web/".length);
      if (WEB_FULL_TRIGGERS.has(rel)) webFull = true;
      else if (rel.startsWith("src/") && SOURCE.test(rel)) webFiles.push(rel);
    } else if (ROOT_FULL_TRIGGERS.has(file)) {
      rootFull = true;
    } else if (file.startsWith("src/") && SOURCE.test(file)) {
      rootFiles.push(file);
    }
  }
  const suite = (full: boolean, files: string[], always: string[] = []): SuitePlan =>
    full
      ? { mode: "full", files: [] }
      : files.length
        ? { mode: "related", files: [...files, ...always.filter((f) => !files.includes(f))] }
        : { mode: "skip", files: [] };
  return { root: suite(rootFull, rootFiles, ROOT_ALWAYS_RUN), web: suite(webFull, webFiles) };
}

/**
 * Real-browser journeys import the whole host, so `related` would pull them in
 * for almost any server change and take 10–20 minutes. They run in CI.
 */
const CI_ONLY_GLOBS = ["**/*Browser*.test.ts", "**/*Acceptance*.test.ts"];

export function precommitVitestArgs(plan: SuitePlan): string[] {
  if (plan.mode === "full") return ["vitest", "run", "--reporter=dot"];
  return [
    "vitest",
    "related",
    "--run",
    "--passWithNoTests",
    "--reporter=dot",
    ...CI_ONLY_GLOBS.flatMap((glob) => ["--exclude", glob]),
    ...plan.files,
  ];
}

function runSuite(name: "root" | "web", plan: SuitePlan, cwd: string): number {
  if (plan.mode === "skip") {
    console.log(` 🎮 [precommit] [${name}-tests] [skipped] no staged source files`);
    return 0;
  }
  const args = precommitVitestArgs(plan);
  console.log(
    ` 🎮 [precommit] [${name}-tests] [${plan.mode}] ${plan.mode === "related" ? `${plan.files.length} staged file(s)` : "all tests"}`,
  );
  const result = spawnSync("npx", args, { cwd, stdio: "inherit" });
  if (result.error) {
    console.error(` 🎮 [precommit] [${name}-tests] [error] ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function main(): void {
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const staged = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8", cwd: repoRoot },
  )
    .split("\n")
    .filter(Boolean);
  const plan = planPrecommitTests(staged, { forceFull: process.env.SUNNY_PRECOMMIT_FULL === "1" });
  const rootStatus = runSuite("root", plan.root, repoRoot);
  const webStatus = rootStatus === 0 ? runSuite("web", plan.web, path.join(repoRoot, "web")) : 1;
  process.exit(rootStatus || webStatus);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main();
}
