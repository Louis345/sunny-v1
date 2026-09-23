import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DISCOVERY_VERIFIER_VERSION,
  DiscoveryReviewNeedsAttentionError,
  reviewDiscoveryCandidate,
  type JourneyCapture,
} from "./discoveryVisualReview";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

function dir(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-repair-authorization-"));
  roots.push(value);
  return value;
}

function capture(outputDir: string, overrides: Partial<JourneyCapture> & Pick<JourneyCapture, "kind">): JourneyCapture {
  const name = `journey-sunny-${overrides.kind}-${Math.random().toString(16).slice(2)}.png`;
  const file = path.join(outputDir, name);
  fs.writeFileSync(file, `screen:${name}`);
  return {
    path: file,
    label: name,
    viewport: "sunny",
    verifierVersion: DISCOVERY_VERIFIER_VERSION,
    observedItemId: null,
    promptVisible: false,
    ...overrides,
  };
}

/** Browser proof for a two-screen journey: the confirmed first question and completion. */
function passingJourney(outputDir: string) {
  const captures = [
    capture(outputDir, { kind: "transition", expectedItemId: "one", itemIndex: 0 }),
    capture(outputDir, { kind: "academic_item", expectedItemId: "one", itemIndex: 0, observedItemId: "one", promptVisible: true }),
    capture(outputDir, { kind: "completion" }),
  ];
  return { captures, verify: vi.fn(async () => Object.assign(captures.map(item => item.path), { captures })) };
}

const openingOnly = async () => Object.assign([] as string[], { issues: [] as string[] });

function readHistory(outputDir: string): Array<Record<string, unknown>> {
  return fs.readFileSync(path.join(outputDir, "review-history.jsonl"), "utf8")
    .trim().split("\n").map(line => JSON.parse(line) as Record<string, unknown>);
}

describe("Discovery repair authorization", () => {
  it("does not ask the blind reviewer and repairs only the deterministic defect when browser verification fails", async () => {
    const outputDir = dir();
    const failure = capture(outputDir, { kind: "failure" });
    const verify = vi.fn(async (html: string) => {
      if (html === "broken") {
        throw Object.assign(new Error("sunny:math_journey_control_not_actionable;item=one;selector=#answer"), { screenshotPaths: [failure.path], captures: [failure] });
      }
      return passingJourney(outputDir).verify();
    });
    const judge = vi.fn(async (_input: { html: string }) => ({ decision: "approve" as const, findings: [] }));
    const repair = vi.fn(async () => "fixed");

    const result = await reviewDiscoveryCandidate({ html: "broken", outputDir, render: openingOnly, verify, judge, repair });

    expect(result.html).toBe("fixed");
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair).toHaveBeenCalledWith(expect.objectContaining({
      issues: ["sunny:math_journey_control_not_actionable;item=one;selector=#answer"],
      screenshotPaths: [failure.path],
    }));
    expect(judge).toHaveBeenCalledTimes(1);
    expect(judge.mock.calls[0]?.[0]).toMatchObject({ html: "fixed" });
  });

  it("stops without any repair when the harness itself cannot produce browser evidence", async () => {
    const outputDir = dir();
    const repair = vi.fn(async () => "never");
    const judge = vi.fn(async () => ({ decision: "approve" as const, findings: [] }));

    await expect(reviewDiscoveryCandidate({
      html: "<html>any</html>",
      outputDir,
      render: async () => { throw new Error("browserType.launch: Executable doesn't exist at /ms-playwright/chromium"); },
      judge,
      repair,
    })).rejects.toMatchObject({ name: "DiscoveryReviewNeedsAttentionError", category: "harness_failure" });

    expect(repair).not.toHaveBeenCalled();
    expect(judge).not.toHaveBeenCalled();
  });

  it("stops as NEEDS_ATTENTION with zero repairs when the reviewer contradicts browser capture evidence", async () => {
    const outputDir = dir();
    const { verify } = passingJourney(outputDir);
    const repair = vi.fn(async () => "never");
    const judge = vi.fn(async () => ({
      decision: "reject" as const,
      findings: [{ screen: 2, claim: "content_missing" as const, observation: "Item 1 is missing; only an opening screen is shown." }],
    }));

    const run = reviewDiscoveryCandidate({ html: "<html>complete</html>", outputDir, render: openingOnly, verify, judge, repair });
    await expect(run).rejects.toBeInstanceOf(DiscoveryReviewNeedsAttentionError);
    await expect(run).rejects.toMatchObject({ category: "reviewer_disagreement" });

    expect(repair).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(path.join(outputDir, "visual-review.json"), "utf8"))).toMatchObject({ status: "needs_attention" });
    expect(readHistory(outputDir).at(-1)).toMatchObject({ repairAuthorized: false, attribution: { category: "reviewer_disagreement" } });
  });

  it.each([
    ["an unconfirmed screen", "capture_defect", (outputDir: string) => [capture(outputDir, { kind: "unconfirmed", expectedItemId: "one" })], 1],
    ["no screen at all", "reviewer_disagreement", (outputDir: string) => passingJourney(outputDir).captures, null],
    ["a screen outside the reviewed packet", "reviewer_disagreement", (outputDir: string) => passingJourney(outputDir).captures, 9],
    ["a screen captured by an older verifier", "verifier_incompatible", (outputDir: string) => [capture(outputDir, { kind: "academic_item", expectedItemId: "one", observedItemId: "one", promptVisible: true, verifierVersion: DISCOVERY_VERIFIER_VERSION - 1 })], 1],
  ] as const)("does not buy a repair for a finding that cites %s", async (_label, category, makeCaptures, screen) => {
    const outputDir = dir();
    const captures = makeCaptures(outputDir);
    const repair = vi.fn(async () => "never");

    await expect(reviewDiscoveryCandidate({
      html: "<html>candidate</html>",
      outputDir,
      render: openingOnly,
      verify: async () => Object.assign(captures.map(item => item.path), { captures }),
      judge: async () => ({ decision: "reject" as const, findings: [{ screen, claim: "visual_defect" as const, observation: "Something looks wrong." }] }),
      repair,
    })).rejects.toMatchObject({ category });

    expect(repair).not.toHaveBeenCalled();
  });

  it("keeps a genuine defect on a confirmed question eligible for one bounded repair", async () => {
    const outputDir = dir();
    const { verify } = passingJourney(outputDir);
    const repair = vi.fn(async () => "<html>repaired</html>");
    const judge = vi.fn(async ({ html }: { html: string }) => html === "<html>repaired</html>"
      ? { decision: "approve" as const, findings: [] }
      : { decision: "reject" as const, findings: [{ screen: 2, claim: "visual_defect" as const, observation: "The basket labels overlap the answer buttons." }] });

    const result = await reviewDiscoveryCandidate({ html: "<html>overlap</html>", outputDir, render: openingOnly, verify, judge, repair });

    expect(result.html).toBe("<html>repaired</html>");
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair).toHaveBeenCalledWith(expect.objectContaining({
      repairAttempt: 1,
      issues: ["child_visual_review:screen=2:The basket labels overlap the answer buttons."],
    }));
    expect(readHistory(outputDir).map(row => row.repairAuthorized)).toEqual([true, false]);
  });

  it("does not buy a content repair for a defect reported on a transition screen", async () => {
    const outputDir = dir();
    const { verify } = passingJourney(outputDir);
    const repair = vi.fn(async () => "<html>repaired</html>");
    const judge = vi.fn(async ({ html }: { html: string }) => html === "<html>repaired</html>"
      ? { decision: "approve" as const, findings: [] }
      : { decision: "reject" as const, findings: [{ screen: 1, claim: "visual_defect" as const, observation: "The Begin button is hidden behind the title art." }] });

    await expect(reviewDiscoveryCandidate({ html: "<html>intro</html>", outputDir, render: openingOnly, verify, judge, repair }))
      .rejects.toMatchObject({ category: "capture_defect" });
    expect(repair).not.toHaveBeenCalled();
  });

  it("preserves every reviewer verdict and authorization decision across rounds and restarts", async () => {
    const outputDir = dir();
    const { verify } = passingJourney(outputDir);
    const reject = { decision: "reject" as const, findings: [{ screen: 2, claim: "visual_defect" as const, observation: "Numbers are too small to read." }] };
    const judge = vi.fn(async () => reject);

    await expect(reviewDiscoveryCandidate({
      html: "<html>small</html>", outputDir, render: openingOnly, verify, judge,
      repair: async () => { throw new Error("interrupted_after_review"); },
    })).rejects.toThrow("interrupted_after_review");
    await expect(reviewDiscoveryCandidate({
      html: "<html>small</html>", outputDir, render: openingOnly, verify, judge,
      repair: async ({ repairAttempt }) => `<html>repair-${repairAttempt}</html>`,
    })).rejects.toThrow("discovery_visual_review_failed_after_bounded_repair");

    const history = readHistory(outputDir);
    expect(history.length).toBeGreaterThanOrEqual(3);
    expect(history[0]).toMatchObject({
      iteration: 1,
      verifierVersion: DISCOVERY_VERIFIER_VERSION,
      verdict: reject,
      attribution: { category: "generated_content_defect" },
      repairAuthorized: true,
    });
    expect(history.every(row => typeof row.htmlHash === "string" && typeof row.recordedAt === "string")).toBe(true);
    expect(history.at(-1)).toMatchObject({ repairAuthorized: false });
  });
});
