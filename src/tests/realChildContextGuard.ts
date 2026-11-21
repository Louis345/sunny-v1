import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Nov 2 catch: a failed browser-lab run ended its voice session after the test
// unstubbed SUNNY_CONTEXT_ROOT, and the late session-end write landed in the
// real src/context/ila (lastUpdated, totalSessions +2). The parent session saw
// it in `git status`; no test looked at the real folders. On Saori those
// folders are the girls' live records, so any change after a run fails it.
const REAL_CHILDREN = ["ila", "reina"];
// Lab fixtures use this id; anything under its real folder (ignored ledgers too) is a leak.
const WATCHED_DIRS = [...REAL_CHILDREN, "lab-child"];

function fingerprint(root: string): Map<string, string> {
  const files = new Map<string, string>();
  const visit = (target: string): void => {
    if (!fs.existsSync(target)) return;
    if (fs.statSync(target).isDirectory()) {
      for (const entry of fs.readdirSync(target).sort()) visit(path.join(target, entry));
      return;
    }
    files.set(path.relative(root, target).split(path.sep).join("/"), createHash("sha256").update(fs.readFileSync(target)).digest("hex"));
  };
  for (const child of WATCHED_DIRS) visit(path.join(root, "src", "context", child));
  return files;
}

// I2 catch: full runs modified tracked src/context/creator files and created
// src/context/lab-child ledgers. git status shows both; the guard compares the
// files git reports as changed or new (not ignored) before and after the run.
function gitReportedContextFiles(root: string): Map<string, string> {
  const files = new Map<string, string>();
  let out = "";
  try {
    out = execFileSync("git", ["status", "--porcelain", "-z", "--untracked-files=all", "--", "src/context"], { cwd: root, encoding: "utf8" });
  } catch (error) {
    console.warn(" 🎮 [test-guard] [git-status] [unavailable]", error);
    return files;
  }
  for (const entry of out.split("\0")) {
    const file = entry.slice(3);
    if (!file || !file.startsWith("src/context/")) continue;
    const full = path.join(root, file);
    files.set(file, fs.existsSync(full) && fs.statSync(full).isFile()
      ? createHash("sha256").update(fs.readFileSync(full)).digest("hex")
      : "missing");
  }
  return files;
}

function snapshot(root: string): Map<string, string> {
  const files = fingerprint(root);
  for (const [file, hash] of gitReportedContextFiles(root)) files.set(file, hash);
  return files;
}

export function changedRealChildFiles(before: Map<string, string>, after: Map<string, string>): string[] {
  return [...new Set([...before.keys(), ...after.keys()])].filter(file => before.get(file) !== after.get(file)).sort();
}

export default function setup(): () => void {
  const root = process.cwd();
  const before = snapshot(root);
  return () => {
    const changed = changedRealChildFiles(before, snapshot(root));
    if (changed.length) throw new Error(`context_changed_by_tests: ${changed.join(", ")}`);
  };
}
