import fs from "fs";
import path from "path";
import type { AssignmentConcept } from "./directMathExperience";
import { resolveChildContextDir, type ContextRootOptions } from "../utils/contextRoot";

/**
 * The assumptions ledger is the system's memory of what it believed before a
 * board was built, so a later retro can check those beliefs against what the
 * child actually did.
 *
 * The entries written by the general homework path recorded the assignment's
 * entire OCR text under `words:` and a diagnosis inherited from another domain.
 * A ledger entry should carry the *concept* and the beliefs about the child —
 * the assignment itself is already stored elsewhere and is not what we want to
 * remember.
 */
export type AssignmentLedgerEntry = {
  childId: string;
  homeworkId: string;
  sourceFilename: string;
  concept: AssignmentConcept;
  boardSummary?: {
    title: string;
    routeLabels: string[];
    activityCount: number;
  };
  ingestedAt?: string;
};

function assumptionsDir(childId: string, opts: ContextRootOptions = {}): string {
  return path.join(resolveChildContextDir(childId, opts), "assumptions");
}

export function renderAssignmentLedgerEntry(entry: AssignmentLedgerEntry): string {
  const { concept } = entry;
  const lines = [
    "## Assignment ingested",
    "",
    `**homeworkId:** ${entry.homeworkId}`,
    `**source:** ${entry.sourceFilename}`,
    `**ingestedAt:** ${entry.ingestedAt ?? new Date().toISOString()}`,
    "",
    "## Concept",
    "",
    `**id:** ${concept.conceptId}`,
    `**name:** ${concept.name}`,
    "",
    concept.statement,
    "",
    `**This assignment instantiates:** ${concept.instanceScope}`,
    `**Prerequisites:** ${concept.prerequisites.join(", ") || "none recorded"}`,
    "",
    "## What we currently believe about this child",
    "",
    ...(concept.assumptions.length > 0
      ? concept.assumptions.map((line) => `- ${line}`)
      : ["- No prior beliefs recorded."]),
  ];
  if (entry.boardSummary) {
    lines.push(
      "",
      "## Board built from it",
      "",
      `**title:** ${entry.boardSummary.title}`,
      `**routes:** ${entry.boardSummary.routeLabels.join(" | ") || "none"}`,
      `**activities:** ${entry.boardSummary.activityCount}`,
    );
  }
  lines.push(
    "",
    "## Still to be checked",
    "",
    "- Did the child's real work support or contradict the beliefs above?",
    "- Which of them should the next board change?",
  );
  return `${lines.join("\n")}\n`;
}

/** Writes `<date>-pre.md` and returns the path written. */
export function writeAssignmentLedgerEntry(
  entry: AssignmentLedgerEntry,
  opts: ContextRootOptions = {},
): string {
  const dir = assumptionsDir(entry.childId, opts);
  fs.mkdirSync(dir, { recursive: true });
  const day = (entry.ingestedAt ?? new Date().toISOString()).slice(0, 10);
  const file = path.join(dir, `${day}-pre.md`);
  fs.writeFileSync(file, renderAssignmentLedgerEntry(entry), "utf8");
  return file;
}

/**
 * Concept ids this child already has on record, newest first. Offered back to
 * the Planner so it reuses an existing identity instead of rephrasing one —
 * longitudinal matching is exact string equality, so a rephrase silently loses
 * every prior observation for that concept.
 */
export function readPriorConceptIds(childId: string, opts: ContextRootOptions = {}): string[] {
  const dir = assumptionsDir(childId, opts);
  if (!fs.existsSync(dir)) return [];
  const ids: string[] = [];
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".md")).sort().reverse()) {
    const match = fs.readFileSync(path.join(dir, file), "utf8").match(/^\*\*id:\*\*\s*(\S+)\s*$/m);
    if (match?.[1]) ids.push(match[1]);
  }
  return [...new Set(ids)];
}
