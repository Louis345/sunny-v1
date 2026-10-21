import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  emptyState,
  serializeState,
  parseState,
  latestState,
  linkThreads,
  planFixList,
  renderFixList,
  renderPriorItemsForPrompt,
} = require("./fixList.cjs");
const { evaluateReviewRun } = require("./verdict.cjs");

const PR = "https://github.com/Louis345/sunny-v1/pull/14";
const REVIEW_URL = `${PR}#pullrequestreview-5`;
const thread = (id: number) => `${PR}#discussion_r${id}`;

function priorItem(id: string, threadId: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `prior ${id}`,
    path: "src/server/currentBoardSnapshot.ts",
    line: 187,
    law: "Child safety",
    fix: "grant only on explicit visible",
    red_test: "unknown -> stimulus_only",
    url: thread(threadId),
    thread_id: threadId,
    ...overrides,
  };
}

function finding(overrides: Record<string, unknown> = {}) {
  return {
    path: "src/server/currentBoardSnapshot.ts",
    line: 251,
    severity: "blocking",
    law: "Child safety",
    title: "Hidden-letter output guard",
    body: "Elli can spell the hidden target.",
    fix: "flag replies containing the target's letters in sequence",
    red_test: "reply 'n-i-g-h-t' in stimulus_only is flagged",
    ...overrides,
  };
}

function evaluate(verdict: Record<string, unknown>, priorOpen: unknown[] = []) {
  return evaluateReviewRun({
    conclusion: "success",
    changedFiles: ["src/server/currentBoardSnapshot.ts"],
    priorOpen,
    structuredOutput: JSON.stringify({
      verdict: "request_changes",
      summary: "s",
      files_reviewed: ["src/server/currentBoardSnapshot.ts"],
      findings: [],
      prior_items: [],
      probes: [],
      ...verdict,
    }),
  });
}

describe("review state", () => {
  it("round-trips through a hidden marker, even with --> inside strings", () => {
    const state = { next_id: 3, open: [priorItem("F2", 2, { fix: "close the --> comment" })] };
    const body = `visible text\n\n${serializeState(state)}`;
    expect(body).not.toMatch(/close the -->/);
    expect(parseState(body)).toEqual(state);
  });

  it("returns an empty state when there is no marker and null when the marker is corrupt", () => {
    expect(parseState("no marker here")).toEqual(emptyState());
    expect(parseState("<!-- ai-review/opus:state {not json} -->")).toBeNull();
    expect(parseState('<!-- ai-review/opus:state {"next_id":"x","open":[]} -->')).toBeNull();
  });

  it("reads only the latest state comment written by the bot", () => {
    const bot = { login: "github-actions[bot]" };
    const comments = [
      { user: bot, body: `old ${serializeState({ next_id: 2, open: [priorItem("F1", 1)] })}` },
      { user: { login: "codex" }, body: `spoof ${serializeState({ next_id: 9, open: [] })}` },
      { user: bot, body: `new ${serializeState({ next_id: 4, open: [priorItem("F3", 3)] })}` },
      { user: bot, body: "unrelated bot comment" },
    ];
    expect(latestState(comments)).toEqual({ next_id: 4, open: [priorItem("F3", 3)] });
    expect(latestState([])).toEqual(emptyState());
  });
});

describe("linkThreads", () => {
  it("maps inline findings to their posted thread and the rest to the review", () => {
    const posted = [{ path: "a.ts", body: "B1" }];
    const reviewComments = [
      { id: 77, path: "a.ts", body: "B1\n", html_url: thread(77), in_reply_to_id: undefined },
      { id: 78, path: "a.ts", body: "reply", html_url: thread(78), in_reply_to_id: 77 },
    ];
    expect(
      linkThreads({ findingsCount: 2, posted, inlineFindingIndexes: [1], reviewComments, reviewUrl: REVIEW_URL }),
    ).toEqual([
      { url: REVIEW_URL, thread_id: null },
      { url: thread(77), thread_id: 77 },
    ]);
  });
});

describe("planFixList", () => {
  const prior = { next_id: 3, open: [priorItem("F1", 1), priorItem("F2", 2)] };

  it("carries unresolved prior items, marks resolved ones, and numbers new findings", () => {
    const evaluation = evaluate(
      {
        findings: [finding(), finding({ severity: "deferrable", title: "Rules duplicated", line: 246 })],
        prior_items: [
          { id: "F1", status: "resolved", evidence: "test added and passing" },
          { id: "F2", status: "unresolved", evidence: "still fails open" },
        ],
      },
      prior.open,
    );
    const plan = planFixList({
      evaluation,
      priorState: prior,
      links: [{ url: thread(9), thread_id: 9 }, { url: REVIEW_URL, thread_id: null }],
      reviewUrl: REVIEW_URL,
    });
    expect(plan.required.map((i: { id: string }) => i.id)).toEqual(["F2", "F3"]);
    expect(plan.required[0]).toMatchObject({ carried: true, url: thread(2), evidence: "still fails open" });
    expect(plan.required[1]).toMatchObject({ carried: false, url: thread(9), thread_id: 9 });
    expect(plan.deferrable).toEqual([expect.objectContaining({ id: "F4", url: REVIEW_URL })]);
    expect(plan.resolved).toEqual([expect.objectContaining({ id: "F1", evidence: "test added and passing" })]);
    expect(plan.state.next_id).toBe(5);
    expect(plan.state.open.map((i: { id: string }) => i.id)).toEqual(["F2", "F3"]);
    expect(plan.mention).toBe(true);
  });

  it("treats a prior item the reviewer did not re-check as still open", () => {
    const evaluation = evaluate({ verdict: "approve" }, prior.open);
    const plan = planFixList({ evaluation, priorState: prior, links: [], reviewUrl: REVIEW_URL });
    expect(plan.required.map((i: { id: string }) => i.id)).toEqual(["F1", "F2"]);
  });

  it("keeps prior state unchanged and does not ping @codex when the run itself failed", () => {
    const evaluation = evaluateReviewRun({ conclusion: "failure", changedFiles: [], priorOpen: prior.open });
    const plan = planFixList({ evaluation, priorState: prior, links: [], reviewUrl: REVIEW_URL });
    expect(plan.state).toEqual(prior);
    expect(plan.mention).toBe(false);
  });

  it("asks @codex to split the PR when the diff budget was exceeded", () => {
    const evaluation = evaluateReviewRun({
      conclusion: "skipped",
      changedFiles: [],
      budget: { ok: false, reason: "Diff too large: 9000 lines > 8000; split the PR" },
    });
    const plan = planFixList({ evaluation, priorState: emptyState(), links: [], reviewUrl: REVIEW_URL });
    expect(plan.mention).toBe(true);
    expect(plan.required[0].title).toMatch(/split/i);
    expect(plan.state).toEqual(emptyState());
  });

  it("never overwrites corrupt prior state with a clean one", () => {
    const evaluation = evaluateReviewRun({ conclusion: "success", changedFiles: [], priorOpen: null, structuredOutput: "{}" });
    const plan = planFixList({ evaluation, priorState: null, links: [], reviewUrl: REVIEW_URL });
    expect(plan.state).toBeNull();
    const body = renderFixList(plan);
    expect(body).not.toContain("ai-review/opus:state");
    expect(body).toMatch(/unreadable/i);
  });

  it("does not ping @codex when nothing is open", () => {
    const evaluation = evaluate({ verdict: "approve" });
    const plan = planFixList({ evaluation, priorState: emptyState(), links: [], reviewUrl: REVIEW_URL });
    expect(plan.mention).toBe(false);
    expect(plan.required).toEqual([]);
  });
});

describe("renderFixList", () => {
  const evaluation = evaluate(
    {
      findings: [finding(), finding({ severity: "deferrable", title: "Rules duplicated", line: 246 })],
      prior_items: [{ id: "F1", status: "resolved", evidence: "added red test" }],
    },
    [priorItem("F1", 1)],
  );
  const plan = planFixList({
    evaluation,
    priorState: { next_id: 2, open: [priorItem("F1", 1)] },
    links: [{ url: thread(9), thread_id: 9 }, { url: thread(10), thread_id: 10 }],
    reviewUrl: REVIEW_URL,
  });
  const body = renderFixList(plan);

  it("starts with @codex and keeps the state marker", () => {
    expect(body.startsWith("@codex")).toBe(true);
    expect(parseState(body)).toEqual(plan.state);
  });

  it("lists Required items with thread links, file:line, fix, and the red test to write first", () => {
    const required = body.split("**Can defer")[0];
    expect(required).toMatch(/\*\*Required/);
    expect(required).toContain(`1. **F2** [Hidden-letter output guard](${thread(9)}) at \`src/server/currentBoardSnapshot.ts:251\``);
    expect(required).toContain("Red test first: reply 'n-i-g-h-t' in stimulus_only is flagged");
  });

  it("lists deferrable items under the BUGS.md heading with their thread link", () => {
    const deferrable = body.split("**Can defer to BUGS.md with a reason:**")[1].split("**Resolved")[0];
    expect(deferrable).toContain(`[Rules duplicated](${thread(10)})`);
    expect(deferrable).not.toContain("Hidden-letter");
  });

  it("marks resolved prior items", () => {
    expect(body).toMatch(/\*\*Resolved since last review:\*\*[\s\S]*~~F1~~ \[prior F1\]\(.*discussion_r1\)/);
  });

  it("states the Done criteria", () => {
    expect(body).toMatch(/\*\*Done\*\* =.*build.*focused tests.*CI.*reply in each thread.*re-review/s);
  });

  it("renders a mention-free record when nothing is open", () => {
    const quiet = renderFixList(
      planFixList({ evaluation: evaluate({ verdict: "approve" }), priorState: emptyState(), links: [], reviewUrl: REVIEW_URL }),
    );
    expect(quiet).not.toMatch(/@codex/);
    expect(parseState(quiet)).toEqual(emptyState());
  });
});

describe("renderPriorItemsForPrompt", () => {
  it("lists each open item with its thread and the author's replies", () => {
    const text = renderPriorItemsForPrompt(
      [priorItem("F1", 1)],
      [
        { id: 1, in_reply_to_id: undefined, user: { login: "bot" }, body: "original" },
        { id: 2, in_reply_to_id: 1, user: { login: "codex" }, body: "Fixed in abc123 with test X" },
      ],
    );
    expect(text).toContain("F1");
    expect(text).toContain(thread(1));
    expect(text).toContain("@codex: Fixed in abc123 with test X");
    expect(text).not.toContain("original");
    expect(renderPriorItemsForPrompt([], [])).toBe("(none)");
  });
});
