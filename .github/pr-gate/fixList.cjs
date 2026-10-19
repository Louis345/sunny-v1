"use strict";

/**
 * The `@codex` fix list posted after each Opus review, and the review state
 * that carries open Required items to the next push. State lives in a hidden
 * marker inside the fix-list comment; only comments by the Actions bot count.
 */

const STATE_MARKER = "ai-review/opus:state";
const BOT_LOGIN = "github-actions[bot]";
const MAX_REPLY = 600;

const emptyState = () => ({ next_id: 1, open: [] });

/** `--` is escaped so a string containing `-->` cannot close the HTML comment. */
function serializeState(state) {
  return `<!-- ${STATE_MARKER} ${JSON.stringify(state).replace(/--/g, "-\\u002d")} -->`;
}

const isItem = (i) => i && typeof i.id === "string" && typeof i.title === "string" && typeof i.url === "string";

/** @returns state, emptyState() when there is no marker, or null when it is corrupt. */
function parseState(body) {
  const start = String(body ?? "").indexOf(`<!-- ${STATE_MARKER} `);
  if (start < 0) return emptyState();
  const rest = body.slice(start + STATE_MARKER.length + 6);
  const end = rest.indexOf(" -->");
  if (end < 0) return null;
  try {
    const state = JSON.parse(rest.slice(0, end));
    if (!Number.isInteger(state.next_id) || !Array.isArray(state.open) || !state.open.every(isItem)) return null;
    return state;
  } catch {
    return null;
  }
}

/** Latest state among PR issue comments (oldest first, as the API lists them). */
function latestState(comments, botLogin = BOT_LOGIN) {
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.user?.login === botLogin && String(c.body ?? "").includes(`<!-- ${STATE_MARKER} `)) return parseState(c.body);
  }
  return emptyState();
}

/**
 * Thread link per finding: inline findings point at their review-comment
 * thread, everything else at the review itself.
 */
function linkThreads({ findingsCount, posted, inlineFindingIndexes, reviewComments, reviewUrl }) {
  const links = Array.from({ length: findingsCount }, () => ({ url: reviewUrl, thread_id: null }));
  const roots = reviewComments.filter((c) => !c.in_reply_to_id);
  posted.forEach((p, i) => {
    const match = roots.find((c) => c.path === p.path && String(c.body).trim() === String(p.body).trim());
    if (match) links[inlineFindingIndexes[i]] = { url: match.html_url, thread_id: match.id };
  });
  return links;
}

const pick = (f) => ({ title: f.title, path: f.path, line: f.line, law: f.law, fix: f.fix, red_test: f.red_test });

/**
 * Decide what the fix list says and what state the next push inherits.
 * A prior item closes only when the reviewer re-checked it and reported it
 * resolved; anything else carries forward as Required.
 */
function planFixList({ evaluation, priorState, links, reviewUrl }) {
  if (priorState === null) {
    // evaluateReviewRun already failed closed; keep the corrupt marker as the latest state.
    return { required: [], deferrable: [], resolved: [], state: null, mention: false, evaluation };
  }
  const prior = priorState ?? emptyState();
  const verdict = evaluation.verdict;

  if (!verdict) {
    const required = prior.open.map((i) => ({ ...i, carried: true, evidence: "" }));
    if (evaluation.kind === "budget") {
      required.unshift({
        id: "split",
        title: "Split this PR",
        path: null,
        line: null,
        law: "Law 3 / Law 8",
        fix: evaluation.description,
        red_test: "",
        url: reviewUrl,
        thread_id: null,
        carried: false,
        evidence: "",
      });
    }
    return { required, deferrable: [], resolved: [], state: prior, mention: evaluation.kind === "budget", evaluation };
  }

  const checks = new Map(verdict.prior_items.map((p) => [p.id, p]));
  const required = [];
  const resolved = [];
  for (const item of prior.open) {
    const check = checks.get(item.id);
    if (check?.status === "resolved") resolved.push({ ...item, evidence: check.evidence });
    else required.push({ ...item, carried: true, evidence: check?.evidence ?? "" });
  }

  let nextId = prior.next_id;
  const deferrable = [];
  verdict.findings.forEach((f, index) => {
    const link = links[index] ?? { url: reviewUrl, thread_id: null };
    const item = { id: `F${nextId++}`, ...pick(f), url: link.url, thread_id: link.thread_id, carried: false, evidence: "" };
    (f.severity === "blocking" ? required : deferrable).push(item);
  });

  const state = {
    next_id: nextId,
    open: required.map(({ carried, evidence, ...rest }) => rest),
  };
  return { required, deferrable, resolved, state, mention: required.length + deferrable.length > 0, evaluation };
}

const where = (i) => (i.path ? ` at \`${i.path}${i.line !== null && i.line !== undefined ? `:${i.line}` : ""}\`` : "");

function renderFixList(plan) {
  const { required, deferrable, resolved, state, mention, evaluation } = plan;
  const parts = [];

  if (mention) {
    parts.push(
      "@codex address this Opus 5.5 review. Push to this same branch, one fix per commit, red test first (AGENTS.md Laws 1 and 3).",
    );
  } else {
    parts.push(`**Opus review fix list** (\`ai-review/opus\`: ${evaluation.state}). Nothing for the author to act on${required.length ? " until the review re-runs" : ""}.`);
  }

  if (required.length) {
    const rows = required.map((i, n) => {
      const lines = [`${n + 1}. **${i.id}** [${i.title}](${i.url})${where(i)}${i.carried ? " (still open from an earlier review)" : ""}: ${i.fix}`];
      if (i.red_test) lines.push(`   Red test first: ${i.red_test}`);
      if (i.evidence) lines.push(`   Reviewer: ${i.evidence}`);
      return lines.join("\n");
    });
    parts.push(`**Required** (\`ai-review/opus\` stays red until each is resolved):\n\n${rows.join("\n")}`);
  }

  if (deferrable.length) {
    const rows = deferrable.map((i) => `- **${i.id}** [${i.title}](${i.url})${where(i)}: ${i.fix}`);
    parts.push(`**Can defer to BUGS.md with a reason:**\n\n${rows.join("\n")}`);
  }

  if (resolved.length) {
    const rows = resolved.map((i) => `- ✅ ~~${i.id}~~ [${i.title}](${i.url}): ${i.evidence}`);
    parts.push(`**Resolved since last review:**\n\n${rows.join("\n")}`);
  }

  if (mention) {
    parts.push(
      "Reply in each review thread with what changed (or, for a deferral, the BUGS.md entry and reason). " +
        "**Done** = `npm run build` and the focused tests pass, CI `verify` is green, you reply in each thread, " +
        "then request re-review by pushing to this branch (every push re-runs this review and re-checks each Required item).",
    );
  }

  if (state === null) {
    parts.push(
      "⚠️ The previous review state is unreadable, so earlier Required items cannot be verified. " +
        "The owner must delete or fix the corrupt state comment; `ai-review/opus` stays red until then.",
    );
  } else {
    parts.push(serializeState(state));
  }
  return parts.join("\n\n");
}

/** Prior open items plus the author's thread replies, for the reviewer prompt. */
function renderPriorItemsForPrompt(open, reviewComments) {
  if (!open.length) return "(none)";
  return open
    .map((i) => {
      const replies = reviewComments
        .filter((c) => i.thread_id !== null && c.in_reply_to_id === i.thread_id)
        .map((c) => {
          const body = String(c.body).replace(/\s+/g, " ").trim();
          return `  - @${c.user?.login}: ${body.length > MAX_REPLY ? `${body.slice(0, MAX_REPLY)}…` : body}`;
        });
      return [
        `- **${i.id}** ${i.title}${where(i)} (${i.law}) — ${i.url}`,
        `  - Required fix: ${i.fix}`,
        i.red_test ? `  - Red test expected: ${i.red_test}` : null,
        ...(replies.length ? replies : ["  - (no author reply in the thread)"]),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

module.exports = {
  STATE_MARKER,
  emptyState,
  serializeState,
  parseState,
  latestState,
  linkThreads,
  planFixList,
  renderFixList,
  renderPriorItemsForPrompt,
};
