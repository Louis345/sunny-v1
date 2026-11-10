import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { listChildProductIssues, recordProductIssue } from "./productIssues";

// 2026-11-10, Reina: one sentence ("Tell her side... It's a big bug...") became 10 bug tickets in 17 seconds, one per
// partial transcript as the sentence grew, plus a fake "pronunciation" ticket from the session audit. They crowd
// her real words out of what the Planner and builder read (they keep the newest few). The human saw 14 tickets for
// one complaint; the logs showed 10 [recorded] lines; no lab ever sent a growing sentence through the tool.
// Invariant: the same sentence, growing, in the same session, within two minutes, is one ticket.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it("keeps one ticket per sentence as a partial transcript grows, and a new sentence gets its own", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-issue-dedupe-")); roots.push(rootDir);
  fs.mkdirSync(path.join(rootDir, "src/context/reina"), { recursive: true });
  const base = { childId: "reina", activityId: "unknown_activity", issueType: "bug_report" as const, severity: "medium" as const, evidenceText: "She called it a bug.", confidence: 0.9, source: "child_utterance" as const, sessionId: "s1" };
  const words = "Tell her side. Yeah. Not what? It's a big bug. Okay. Okay. Okay. So you".split(" ");
  for (let n = 10; n <= words.length; n += 1) recordProductIssue({ ...base, childUtterance: words.slice(0, n).join(" "), createdAt: `2026-11-10T12:35:${String(n).padStart(2, "0")}Z` }, { rootDir });
  recordProductIssue({ ...base, childUtterance: "Matilda says progress could not be saved.", createdAt: "2026-11-10T12:38:17Z" }, { rootDir });
  const issues = listChildProductIssues("reina", { rootDir, limit: 50 });
  expect(issues).toHaveLength(2);
  expect(issues[0].childUtterance).toBe(words.join(" "));
});
