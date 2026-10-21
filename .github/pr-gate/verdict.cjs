"use strict";

const { truncate } = require("./humanGate.cjs");

const STATUS_CONTEXT = "ai-review/opus";
const REVIEW_MARKER = "<!-- ai-review/opus -->";

/** Generated files the reviewer is not expected to read line by line. */
const SKIP_REVIEW = [/(^|\/)package-lock\.json$/];

const DEFAULT_BUDGET = { maxFiles: 150, maxChangedLines: 8000 };

/** JSON schema passed to Claude Code via --json-schema. */
const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "files_reviewed", "findings", "prior_items", "probes"],
  properties: {
    verdict: { type: "string", enum: ["approve", "request_changes"] },
    summary: { type: "string" },
    files_reviewed: { type: "array", items: { type: "string" } },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "line", "severity", "law", "title", "body", "fix", "red_test"],
        properties: {
          path: { type: "string" },
          line: { anyOf: [{ type: "integer" }, { type: "null" }] },
          severity: { type: "string", enum: ["blocking", "deferrable"] },
          law: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          fix: { type: "string" },
          red_test: { type: "string" },
        },
      },
    },
    prior_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "status", "evidence"],
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["resolved", "unresolved"] },
          evidence: { type: "string" },
        },
      },
    },
    probes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["command", "purpose", "outcome", "notes"],
        properties: {
          command: { type: "string" },
          purpose: { type: "string" },
          outcome: { type: "string", enum: ["pass", "fail", "error"] },
          notes: { type: "string" },
        },
      },
    },
  },
};

const isReviewable = (path) => !SKIP_REVIEW.some((re) => re.test(path));

/**
 * Fails closed when the PR is too large to review completely; the old
 * workflow silently truncated at 50KB.
 * @param {{ path: string, additions: number, deletions: number }[]} numstat
 */
function checkDiffBudget(numstat, budget = DEFAULT_BUDGET) {
  const reviewed = numstat.filter((f) => isReviewable(f.path));
  const changedLines = reviewed.reduce((n, f) => n + (f.additions || 0) + (f.deletions || 0), 0);
  const reviewFiles = reviewed.map((f) => f.path);
  if (reviewFiles.length > budget.maxFiles) {
    return { ok: false, reviewFiles, reason: `Diff too large: ${reviewFiles.length} files > ${budget.maxFiles}; split the PR` };
  }
  if (changedLines > budget.maxChangedLines) {
    return { ok: false, reviewFiles, reason: `Diff too large: ${changedLines} lines > ${budget.maxChangedLines}; split the PR` };
  }
  return { ok: true, reviewFiles, reason: "" };
}

function validateVerdict(v) {
  const errors = [];
  const isStr = (x) => typeof x === "string";
  if (!v || typeof v !== "object" || Array.isArray(v)) return ["verdict is not an object"];
  if (!["approve", "request_changes"].includes(v.verdict)) errors.push(`unknown verdict ${JSON.stringify(v.verdict)}`);
  if (!isStr(v.summary) || !v.summary.trim()) errors.push("missing summary");
  if (!Array.isArray(v.files_reviewed) || !v.files_reviewed.every(isStr)) errors.push("files_reviewed must be strings");
  if (!Array.isArray(v.findings)) errors.push("findings must be an array");
  else
    v.findings.forEach((f, i) => {
      const ok =
        f &&
        isStr(f.path) &&
        (f.line === null || Number.isInteger(f.line)) &&
        ["blocking", "deferrable"].includes(f.severity) &&
        isStr(f.law) &&
        isStr(f.title) &&
        isStr(f.body) &&
        isStr(f.fix) &&
        isStr(f.red_test);
      if (!ok) errors.push(`finding ${i} is malformed`);
    });
  if (!Array.isArray(v.prior_items)) errors.push("prior_items must be an array");
  else
    v.prior_items.forEach((p, i) => {
      const ok = p && isStr(p.id) && ["resolved", "unresolved"].includes(p.status) && isStr(p.evidence);
      if (!ok) errors.push(`prior item ${i} is malformed`);
    });
  if (!Array.isArray(v.probes)) errors.push("probes must be an array");
  else
    v.probes.forEach((p, i) => {
      const ok = p && isStr(p.command) && isStr(p.purpose) && ["pass", "fail", "error"].includes(p.outcome);
      if (!ok) errors.push(`probe ${i} is malformed`);
    });
  return errors;
}

/**
 * Single fail-closed decision for the `ai-review/opus` status. Only an
 * approve verdict, from a successful run, covering every changed file and
 * every prior open Required item, with nothing blocking, yields success.
 * @param priorOpen open Required items from the previous review's state;
 *   null means that state was unreadable.
 */
function evaluateReviewRun({ conclusion, structuredOutput, changedFiles, budget = { ok: true, reason: "" }, priorOpen = [] }) {
  const fail = (kind, description, verdict = null, errors = []) => ({
    state: "failure",
    kind,
    description: truncate(description),
    verdict,
    errors,
  });

  if (!budget.ok) return fail("budget", budget.reason);
  if (conclusion !== "success") return fail("run", `Reviewer run did not succeed (${conclusion || "no conclusion"}): API or tool error`);
  if (priorOpen === null) return fail("run", "Prior review state unreadable: cannot verify earlier Required items");
  if (typeof structuredOutput !== "string" || !structuredOutput.trim()) return fail("output", "Reviewer returned no structured verdict");

  let verdict;
  try {
    verdict = JSON.parse(structuredOutput);
  } catch (err) {
    return fail("output", `Unparseable reviewer output: ${err.message}`);
  }
  const errors = validateVerdict(verdict);
  if (errors.length) return fail("output", `Invalid reviewer output: ${errors[0]}`, null, errors);

  const reviewed = new Set(verdict.files_reviewed);
  const missing = changedFiles.filter((f) => isReviewable(f) && !reviewed.has(f));
  if (missing.length) {
    return fail("coverage", `Truncated review: did not cover ${missing.length} changed file(s), e.g. ${missing[0]}`, verdict, missing);
  }

  const checked = new Map(verdict.prior_items.map((p) => [p.id, p.status]));
  const unchecked = priorOpen.filter((item) => !checked.has(item.id)).map((item) => item.id);
  if (unchecked.length) {
    return fail("prior", `Did not re-check ${unchecked.length} prior Required item(s): ${unchecked.join(", ")}`, verdict, unchecked);
  }

  const blocking = verdict.findings.filter((f) => f.severity === "blocking").length;
  const unresolved = priorOpen.filter((item) => checked.get(item.id) !== "resolved").length;
  if (verdict.verdict !== "approve" || blocking || unresolved) {
    return fail("blocking", `Blocking: ${blocking} new Required, ${unresolved} prior unresolved, verdict ${verdict.verdict}`, verdict);
  }
  const deferrable = verdict.findings.length;
  return { state: "success", kind: "approved", description: truncate(`Approved by Opus: ${deferrable} deferrable note(s)`), verdict, errors: [] };
}

/** Right-side line numbers GitHub accepts for inline review comments. */
function commentableLines(patch) {
  const lines = new Set();
  if (!patch) return lines;
  let right = 0;
  for (const raw of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      right = Number(hunk[1]);
      continue;
    }
    if (!right) continue;
    if (raw.startsWith("-") || raw.startsWith("\\")) continue;
    lines.add(right);
    right += 1;
  }
  return lines;
}

const formatFinding = (f) =>
  [
    `**${f.severity === "blocking" ? "🛑 Required" : "🗂️ Can defer to BUGS.md"} (${f.law}): ${f.title}**`,
    f.body,
    f.fix && `**Fix:** ${f.fix}`,
    f.red_test && `**Red test first:** ${f.red_test}`,
  ]
    .filter(Boolean)
    .join("\n\n");

/**
 * One GitHub review: summary body plus inline comments for findings that land
 * on diff lines. Findings GitHub would reject inline move into the body.
 * @param {Record<string, Set<number>>} commentable path -> commentable lines
 */
function buildReview(evaluation, commentable) {
  const { state, description, verdict } = evaluation;
  const parts = [
    REVIEW_MARKER,
    `## AI review (Opus): ${state === "success" ? "✅ pass" : "❌ failure"}`,
    `\`${STATUS_CONTEXT}\` → **${state}**: ${description}`,
  ];
  const comments = [];
  const inlineFindingIndexes = [];
  if (!verdict) {
    if (evaluation.errors.length) parts.push(evaluation.errors.map((e) => `- ${e}`).join("\n"));
    parts.push("The gate fails closed. Re-run the workflow, or split the PR if the diff budget was exceeded.");
    return { body: parts.join("\n\n"), comments, inlineFindingIndexes };
  }

  parts.push(`### Summary\n\n${verdict.summary}`);
  const elsewhere = [];
  verdict.findings.forEach((f, index) => {
    const lines = commentable[f.path];
    if (f.line !== null && lines && lines.has(f.line)) {
      comments.push({ path: f.path, line: f.line, side: "RIGHT", body: formatFinding(f) });
      inlineFindingIndexes.push(index);
    } else {
      elsewhere.push(`- \`${f.path}${f.line !== null ? `:${f.line}` : ""}\`: ${formatFinding(f).replace(/\n\n/g, " — ")}`);
    }
  });
  if (elsewhere.length) parts.push(`### Findings not anchored to diff lines\n\n${elsewhere.join("\n")}`);
  if (verdict.prior_items.length) {
    const rows = verdict.prior_items.map((p) => `- ${p.status === "resolved" ? "✅" : "🛑"} **${p.id}** ${p.status}: ${p.evidence}`);
    parts.push(`### Prior Required items\n\n${rows.join("\n")}`);
  }
  if (verdict.probes.length) {
    const rows = verdict.probes.map(
      (p) => `| \`${p.command.replace(/\|/g, "\\|")}\` | ${p.purpose.replace(/\|/g, "\\|")} | ${p.outcome} |`,
    );
    parts.push(`### Executed probes\n\n| Command | Purpose | Outcome |\n| --- | --- | --- |\n${rows.join("\n")}`);
  }
  if (evaluation.errors.length) parts.push(`### Coverage gaps\n\n${evaluation.errors.map((e) => `- \`${e}\``).join("\n")}`);
  parts.push("The `@codex` fix list for this review is posted as a PR comment below.");
  return { body: parts.join("\n\n"), comments, inlineFindingIndexes };
}

module.exports = {
  STATUS_CONTEXT,
  REVIEW_MARKER,
  DEFAULT_BUDGET,
  VERDICT_SCHEMA,
  isReviewable,
  checkDiffBudget,
  evaluateReviewRun,
  commentableLines,
  buildReview,
};
