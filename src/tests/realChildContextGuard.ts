import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Nov 2 catch: a failed browser-lab run ended its voice session after the test
// unstubbed SUNNY_CONTEXT_ROOT, and the late session-end write landed in the
// real src/context/ila (lastUpdated, totalSessions +2). The parent session saw
// it in `git status`; no test looked at the real folders. On Saori those
// folders are the girls' live records, so any change after a run fails it.
const REAL_CHILDREN = ["ila", "reina"];

function fingerprint(root: string): Map<string, string> {
  const files = new Map<string, string>();
  const visit = (target: string): void => {
    if (!fs.existsSync(target)) return;
    if (fs.statSync(target).isDirectory()) {
      for (const entry of fs.readdirSync(target).sort()) visit(path.join(target, entry));
      return;
    }
    files.set(path.relative(root, target), createHash("sha256").update(fs.readFileSync(target)).digest("hex"));
  };
  for (const child of REAL_CHILDREN) visit(path.join(root, "src", "context", child));
  return files;
}

export function changedRealChildFiles(before: Map<string, string>, after: Map<string, string>): string[] {
  return [...new Set([...before.keys(), ...after.keys()])].filter(file => before.get(file) !== after.get(file)).sort();
}

export default function setup(): () => void {
  const root = process.cwd();
  const before = fingerprint(root);
  return () => {
    const changed = changedRealChildFiles(before, fingerprint(root));
    if (changed.length) throw new Error(`real_child_context_changed_by_tests: ${changed.join(", ")}`);
  };
}
