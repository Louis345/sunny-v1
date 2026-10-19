import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { classifyPaths, globToRegExp } = require("./riskPaths.cjs");
const { decideHumanGate, parseShipCommand, shipFromStatuses } = require("./humanGate.cjs");
const {
  checkDiffBudget,
  commentableLines,
  evaluateReviewRun,
  buildReview,
} = require("./verdict.cjs");

const HEAD = "0123456789abcdef0123456789abcdef01234567";

function verdictJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    verdict: "approve",
    summary: "Focused change with a covering test.",
    files_reviewed: ["src/engine/foo.ts", "src/engine/foo.test.ts"],
    findings: [],
    probes: [
      {
        command: "npx vitest run src/engine/foo.test.ts",
        purpose: "confirm the new guard",
        outcome: "pass",
        notes: "",
      },
    ],
    ...overrides,
  });
}

const CHANGED = ["src/engine/foo.ts", "src/engine/foo.test.ts"];

describe("globToRegExp", () => {
  it("matches ** across segments and * within one segment", () => {
    expect(globToRegExp("src/souls/**").test("src/souls/a/b.md")).toBe(true);
    expect(globToRegExp("src/context/*/child_profile.json").test("src/context/ila/child_profile.json")).toBe(true);
    expect(globToRegExp("src/context/*/child_profile.json").test("src/context/a/b/child_profile.json")).toBe(false);
    expect(globToRegExp("src/**/*evidence*").test("src/engine/activityEvidenceContract.ts")).toBe(true);
  });
});

describe("classifyPaths", () => {
  it.each([
    ["src/souls/companion-base.md", "souls"],
    ["src/companions/elli.md", "companions"],
    ["src/profiles.ts", "profiles"],
    ["src/profiles/buildProfile.ts", "profiles"],
    ["src/profile/childProfile.ts", "profiles"],
    ["children.config.json", "profiles"],
    ["src/context/reina/child_profile.json", "profiles"],
    ["src/server/session-manager.ts", "session-state-machine"],
    ["src/engine/learningCycleRuntime.ts", "learning-loop"],
    ["src/engine/activityEvidenceContract.test.ts", "learning-loop"],
    ["src/engine/learningTheoryDecision.ts", "learning-loop"],
    ["src/utils/attempts.ts", "learning-loop"],
    ["LEARNING_FEEDBACK_LOOP.md", "governance"],
    ["AGENTS.md", "governance"],
    [".github/workflows/ci.yml", "governance"],
    [".github/pr-gate/verdict.cjs", "governance"],
  ])("flags %s as %s", (file, rule) => {
    const result = classifyPaths([file]);
    expect(result.risky).toBe(true);
    expect(result.matches.map((m: { rule: string }) => m.rule)).toContain(rule);
  });

  it("leaves ordinary product files non-risky", () => {
    const result = classifyPaths([
      "web/src/components/VisualExplainer/WordChunkScene.tsx",
      "src/server/routes.ts",
      "README.md",
      "src/engine/boardNodeImageGenerator.ts",
    ]);
    expect(result).toEqual({ risky: false, matches: [] });
  });

  it("does not let a near-miss path match a risky rule", () => {
    expect(classifyPaths(["src/server/session-manager.test.ts"]).risky).toBe(false);
    expect(classifyPaths(["docs/AGENTS.md"]).risky).toBe(false);
    expect(classifyPaths(["src/soulsx/a.md"]).risky).toBe(false);
  });

  it("matches case-insensitively so renamed casing cannot dodge the gate", () => {
    expect(classifyPaths(["SRC/Souls/companion-base.md"]).risky).toBe(true);
  });
});

describe("parseShipCommand", () => {
  it("accepts a bare /ship and an optional sha", () => {
    expect(parseShipCommand("/ship")).toEqual({ sha: null });
    expect(parseShipCommand("  /ship  \nlooks good")).toEqual({ sha: null });
    expect(parseShipCommand("/ship 0123abc")).toEqual({ sha: "0123abc" });
    expect(parseShipCommand("/SHIP 0123ABC")).toEqual({ sha: "0123abc" });
  });

  it("rejects anything that is not a leading /ship command", () => {
    expect(parseShipCommand("please don't /ship yet")).toBeNull();
    expect(parseShipCommand("/shipit")).toBeNull();
    expect(parseShipCommand("/ship now")).toBeNull();
    expect(parseShipCommand("")).toBeNull();
    expect(parseShipCommand(undefined)).toBeNull();
  });
});

describe("decideHumanGate", () => {
  const base = {
    files: ["src/companions/elli.md"],
    filesComplete: true,
    labels: [] as string[],
    draft: false,
    ownerLogin: "Louis345",
    headSha: HEAD,
    ship: null as null | { login: string; sha: string | null },
  };

  it("goes green automatically for non-risky PRs", () => {
    const d = decideHumanGate({ ...base, files: ["web/src/App.tsx"] });
    expect(d.state).toBe("success");
  });

  it("stays pending for risky PRs without /ship", () => {
    const d = decideHumanGate(base);
    expect(d.state).toBe("pending");
    expect(d.description).toMatch(/companions/);
    expect(d.description).toMatch(/\/ship/);
  });

  it("turns green after /ship from the repo owner", () => {
    const d = decideHumanGate({ ...base, ship: { login: "louis345", sha: null } });
    expect(d.state).toBe("success");
  });

  it("ignores /ship from anyone else", () => {
    const d = decideHumanGate({ ...base, ship: { login: "codex-bot", sha: null } });
    expect(d.state).toBe("pending");
  });

  it("rejects a /ship pinned to a different sha than the head", () => {
    expect(decideHumanGate({ ...base, ship: { login: "Louis345", sha: "0123456" } }).state).toBe("success");
    const d = decideHumanGate({ ...base, ship: { login: "Louis345", sha: "fffffff" } });
    expect(d.state).toBe("pending");
    expect(d.description).toMatch(/sha/i);
  });

  it("holds on the hold label even after /ship and even for non-risky PRs", () => {
    const ship = { login: "Louis345", sha: null };
    expect(decideHumanGate({ ...base, labels: ["hold"], ship }).state).toBe("pending");
    expect(decideHumanGate({ ...base, labels: ["Hold"], files: ["web/src/App.tsx"] }).state).toBe("pending");
  });

  it("holds draft PRs even after /ship and even for non-risky PRs", () => {
    const ship = { login: "Louis345", sha: null };
    expect(decideHumanGate({ ...base, draft: true, ship }).state).toBe("pending");
    expect(decideHumanGate({ ...base, draft: true, files: ["web/src/App.tsx"] }).state).toBe("pending");
  });

  it("fails closed to pending when the file list is incomplete", () => {
    const d = decideHumanGate({ ...base, files: ["web/src/App.tsx"], filesComplete: false });
    expect(d.state).toBe("pending");
  });

  it("keeps descriptions within the GitHub status limit", () => {
    const files = Array.from({ length: 40 }, (_, i) => `src/souls/very/long/path/name/${i}.md`);
    expect(decideHumanGate({ ...base, files }).description.length).toBeLessThanOrEqual(140);
  });
});

describe("shipFromStatuses", () => {
  const shipped = {
    context: "human-gate",
    state: "success",
    description: "Shipped by @Louis345 at 0123456 (companions)",
    creator: { login: "github-actions[bot]" },
  };

  it("recovers a prior /ship recorded on this head sha", () => {
    expect(shipFromStatuses([{ ...shipped, state: "pending", description: "hold" }, shipped])).toEqual({
      login: "Louis345",
      sha: null,
    });
  });

  it("ignores statuses from other contexts, states, or creators", () => {
    expect(shipFromStatuses([])).toBeNull();
    expect(shipFromStatuses([{ ...shipped, context: "ai-review/opus" }])).toBeNull();
    expect(shipFromStatuses([{ ...shipped, state: "pending" }])).toBeNull();
    expect(shipFromStatuses([{ ...shipped, creator: { login: "someone" } }])).toBeNull();
    expect(shipFromStatuses([{ ...shipped, description: "No risky paths touched" }])).toBeNull();
  });
});

describe("checkDiffBudget", () => {
  it("passes small diffs and ignores lockfiles", () => {
    const r = checkDiffBudget(
      [
        { path: "src/a.ts", additions: 10, deletions: 2 },
        { path: "package-lock.json", additions: 90000, deletions: 9000 },
      ],
      { maxFiles: 5, maxChangedLines: 100 },
    );
    expect(r.ok).toBe(true);
    expect(r.reviewFiles).toEqual(["src/a.ts"]);
  });

  it("fails when the diff is too large to review completely", () => {
    expect(
      checkDiffBudget([{ path: "src/a.ts", additions: 101, deletions: 0 }], { maxFiles: 5, maxChangedLines: 100 }).ok,
    ).toBe(false);
    const many = Array.from({ length: 6 }, (_, i) => ({ path: `src/${i}.ts`, additions: 1, deletions: 0 }));
    expect(checkDiffBudget(many, { maxFiles: 5, maxChangedLines: 100 }).ok).toBe(false);
  });
});

describe("evaluateReviewRun", () => {
  const ok = { conclusion: "success", changedFiles: CHANGED };

  it("passes only on an approve verdict with full coverage and no blockers", () => {
    const r = evaluateReviewRun({ ...ok, structuredOutput: verdictJson() });
    expect(r.state).toBe("success");
    expect(r.verdict.verdict).toBe("approve");
  });

  it("fails on a blocking verdict", () => {
    const r = evaluateReviewRun({ ...ok, structuredOutput: verdictJson({ verdict: "request_changes" }) });
    expect(r.state).toBe("failure");
    expect(r.description).toMatch(/blocking/i);
  });

  it("fails when an approve verdict still carries a blocking finding", () => {
    const r = evaluateReviewRun({
      ...ok,
      structuredOutput: verdictJson({
        findings: [
          { path: "src/engine/foo.ts", line: 3, severity: "blocking", law: "Law 4", title: "swallowed error", body: "x" },
        ],
      }),
    });
    expect(r.state).toBe("failure");
  });

  it("fails on an API or run error even if output exists", () => {
    const r = evaluateReviewRun({ ...ok, conclusion: "failure", structuredOutput: verdictJson() });
    expect(r.state).toBe("failure");
    expect(r.description).toMatch(/run/i);
  });

  it.each([[undefined], [""], ["not json"], ["{\"verdict\":\"approve\"}"], [JSON.stringify({ ...JSON.parse(verdictJson()), verdict: "lgtm" })]])(
    "fails on missing or unparseable output %#",
    (structuredOutput) => {
      const r = evaluateReviewRun({ ...ok, structuredOutput });
      expect(r.state).toBe("failure");
    },
  );

  it("fails when the reviewer did not cover every changed file (truncated review)", () => {
    const r = evaluateReviewRun({
      ...ok,
      structuredOutput: verdictJson({ files_reviewed: ["src/engine/foo.ts"] }),
    });
    expect(r.state).toBe("failure");
    expect(r.description).toMatch(/truncat|cover/i);
  });

  it("fails closed when the diff budget was exceeded", () => {
    const r = evaluateReviewRun({ ...ok, structuredOutput: verdictJson(), budget: { ok: false, reason: "too big" } });
    expect(r.state).toBe("failure");
    expect(r.description).toMatch(/too big/);
  });

  it("keeps descriptions within the GitHub status limit", () => {
    const changedFiles = Array.from({ length: 50 }, (_, i) => `src/some/long/path/file-${i}.ts`);
    const r = evaluateReviewRun({ ...ok, changedFiles, structuredOutput: verdictJson() });
    expect(r.description.length).toBeLessThanOrEqual(140);
  });
});

describe("commentableLines", () => {
  it("returns right-side lines for added and context lines only", () => {
    const patch = ["@@ -1,3 +1,4 @@", " a", "-b", "+c", "+d", " e", "@@ -10,2 +11,2 @@", " x", "+y"].join("\n");
    expect([...commentableLines(patch)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 11, 12]);
    expect(commentableLines(undefined).size).toBe(0);
  });
});

describe("buildReview", () => {
  it("anchors in-diff findings inline and moves the rest into the summary", () => {
    const evaluation = evaluateReviewRun({
      conclusion: "success",
      changedFiles: CHANGED,
      structuredOutput: verdictJson({
        verdict: "request_changes",
        findings: [
          { path: "src/engine/foo.ts", line: 2, severity: "blocking", law: "Law 4", title: "swallowed", body: "add catch" },
          { path: "src/engine/foo.ts", line: 99, severity: "non_blocking", law: "Maintainability", title: "far", body: "n" },
          { path: "src/engine/foo.ts", line: null, severity: "non_blocking", law: "Law 1", title: "general", body: "g" },
        ],
      }),
    });
    const review = buildReview(evaluation, { "src/engine/foo.ts": new Set([1, 2, 3]) });
    expect(review.comments).toEqual([
      expect.objectContaining({ path: "src/engine/foo.ts", line: 2, side: "RIGHT" }),
    ]);
    expect(review.comments[0].body).toMatch(/blocking/i);
    expect(review.body).toMatch(/far/);
    expect(review.body).toMatch(/general/);
    expect(review.body).toMatch(/npx vitest run src\/engine\/foo.test.ts/);
    expect(review.body).toMatch(/ai-review\/opus/);
  });

  it("produces a body explaining the failure when there is no verdict", () => {
    const evaluation = evaluateReviewRun({ conclusion: "failure", changedFiles: CHANGED, structuredOutput: undefined });
    const review = buildReview(evaluation, {});
    expect(review.comments).toEqual([]);
    expect(review.body).toMatch(/failure/i);
  });
});
