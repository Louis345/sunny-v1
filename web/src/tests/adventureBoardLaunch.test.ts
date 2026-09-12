import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import {
  isDirectDiscoveryPacket,
  hasPendingLearningGeneration,
  resolveDiscoveryCompletionHandoff,
  resolvePlannerBoardSessionScope,
  resolvePersistedDiscoveryHandoff,
  resolveDiscoveryEngagementDelivery,
  runDiscoveryExitSequence,
  resolveDirectDiscoverySurface,
  resolveDirectDiscoveryLaunchNode,
  resolvePlannerBoardLaunchNode,
} from "../utils/adventureBoardLaunch";

function packet(planId: string, nodes: Array<Record<string, unknown>>): ChildExperiencePacket {
  return {
    activeSessionPlan: {
      planId,
      domain: "math",
      activeHomeworkId: "hw-1",
      nodePlan: nodes,
      adventureBoard: {
        boardId: planId,
        planId,
        title: "Discovery",
        background: { imageUrl: "/generated/discovery.svg" },
        nodes: nodes.map((node, index) => ({
          id: String(node.id),
          label: String(node.title ?? node.id),
          kind: index === 0 ? "start" : "activity",
          state: index === 0 ? "completed" : "ready",
          position: { x: 20 + index * 20, y: 50 },
          action: index === 0
            ? { type: "none" }
            : { type: "launch-activity", payloadId: String(node.id) },
        })),
      },
    },
  } as unknown as ChildExperiencePacket;
}

describe("direct Discovery entry", () => {
  it("passes frozen spelling identities to existing iframe games", () => {
    const current = packet("targeted:hw-1", [{ id: "wheel", type: "wheel-of-fortune", targets: ["night"] }]);
    current.activeSessionPlan!.domain = "spelling";
    current.spellingInstruments = { wheel: { assessment: false, items: [{ itemId: "frozen-night", display: "night", acceptedResponses: ["night"], label: "Spelling", subject: "spelling" }] } };
    const node = current.activeSessionPlan!.adventureBoard!.nodes[0]; node.state = "available"; node.action = { type: "launch-activity", payloadId: "wheel" };
    expect(resolvePlannerBoardLaunchNode(current, node)?.spellingItemBindings).toEqual([{ itemId: "frozen-night", word: "night" }]);
  });
  it("polls the same durable job for spelling and math without enabling legacy domains", () => {
    for (const domain of ["spelling", "math"]) {
      const current = packet("discovery:hw-1", []);
      current.activeSessionPlan!.domain = domain as "spelling" | "math";
      current.childChart = { learningCycle: { lifecycle: "evidence_ready" } } as never;
      expect(hasPendingLearningGeneration(current, false)).toBe(true);
      current.childChart.learningCycle!.lifecycle = "board_ready";
      expect(hasPendingLearningGeneration(current, false)).toBe(false);
    }
    const old = packet("legacy", []); old.activeSessionPlan!.domain = "reading";
    expect(hasPendingLearningGeneration(old, false)).toBe(false);
  });
  it("launches only unanswered frozen spelling items after resuming Discovery", () => {
    const discovery = packet("discovery:hw-1", [{ id: "start", type: "start" }, { id: "evaluation", type: "word-radar", targets: ["night", "light"] }]);
    discovery.activeSessionPlan!.domain = "spelling";
    discovery.spellingDiscovery = { nodeId: "evaluation", items: [{ itemId: "second", display: "light", acceptedResponses: ["light"], label: "Spelling", subject: "spelling" }] };
    expect(resolveDirectDiscoveryLaunchNode(discovery)?.wordRadarItems).toEqual([{ itemId: "second", display: "light", acceptedResponses: ["light"], label: "Spelling", subject: "spelling" }]);
    discovery.spellingDiscovery = undefined;
    expect(resolveDirectDiscoveryLaunchNode(discovery)).toBeNull();
  });
  it("never lets a homework runtime fall through to the generic companion canvas", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(source).toContain('const homeworkBoardMode = runtimeConfig.subject === "homework";');
    expect(source).toContain('error="homework_child_identity_required"');
  });
  it("connects native spelling assessment to canonical writes and the shared completion barrier", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(source).toContain("onAssessmentAttempt={handleSpellingDiscoveryAttempt}");
    expect(source.includes("assessmentMode={directDiscoveryMode || plannerBoardLaunch.node.spellingAssessment === true}")).toBe(true);
    expect(source.includes("enableLocalNarrationFallback={!directDiscoveryMode && !plannerBoardLaunch.node.spellingAssessment}")).toBe(true);
    expect(source).toContain(".flushForExit()");
  });
  it("opens the generated Discovery directly instead of showing its compatibility map", () => {
    const discovery = packet("discovery:hw-1", [
      { id: "start", type: "start", title: "Start" },
      {
        id: "discovery",
        type: "generated",
        title: "Show What You Know",
        gameHtmlPath: "/games/hw-1/discovery.html",
      },
    ]);

    expect(isDirectDiscoveryPacket(discovery)).toBe(true);
    expect(resolveDirectDiscoveryLaunchNode(discovery)).toEqual(
      expect.objectContaining({
        id: "discovery",
        gameHtmlPath: "/games/hw-1/discovery.html",
      }),
    );
  });

  it("does not bypass the map for a targeted teaching board", () => {
    const targeted = packet("targeted:hw-1", [
      { id: "start", type: "start", title: "Start" },
      { id: "N1", type: "generated", title: "First lesson", gameHtmlPath: "/games/hw-1/N1.html" },
    ]);

    expect(isDirectDiscoveryPacket(targeted)).toBe(false);
    expect(resolveDirectDiscoveryLaunchNode(targeted)).toBeNull();
  });

  it("keeps the familiar curtain mounted until Discovery is ready to launch", () => {
    // Human-caught invariant: node resolution passed while the live App rendered
    // a blank surface. No launch log appeared because removing the curtain also
    // removed the only transition that set sessionReady.
    expect(resolveDirectDiscoverySurface(false, true)).toBe("loading-curtain");
    expect(resolveDirectDiscoverySurface(true, true)).toBe("direct-discovery");
    expect(resolveDirectDiscoverySurface(true, false)).toBe("unavailable");
  });

  it("ends on a truthful handoff instead of an empty post-Discovery surface", () => {
    expect(resolveDiscoveryCompletionHandoff({ skippedPersistence: true })).toBe(
      "preview-complete",
    );
    expect(resolveDiscoveryCompletionHandoff({ targetedGenerationQueued: true })).toBe(
      "targeted-planning",
    );
  });

  it("does not treat a learning-cycle revision as a new board session", () => {
    // Human-caught invariant: completing Discovery refreshes the packet with a
    // new cycle revision. That refresh must preserve the completion handoff
    // instead of resetting state and auto-launching Discovery again.
    expect(resolvePlannerBoardSessionScope("ila", "hw-math-97976379")).toBe(
      resolvePlannerBoardSessionScope("ila", "hw-math-97976379"),
    );

    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const resetStart = source.indexOf("setPlannerBoardLaunch(null);");
    const resetEnd = source.indexOf("const launchPlannerBoardNode", resetStart);
    const resetEffect = source.slice(resetStart, resetEnd);
    expect(resetEffect).toContain("plannerBoardSessionScope");
    expect(resetEffect).not.toContain("activeSessionPlan?.planId");
  });

  it("restores the preparing handoff after reloading a completed Discovery", () => {
    expect(resolvePersistedDiscoveryHandoff(null, "evidence_ready")).toBe("targeted-planning");
    expect(resolvePersistedDiscoveryHandoff(null, "evaluation_active")).toBeNull();
    expect(resolvePersistedDiscoveryHandoff("preview-complete", "evaluation_ready")).toBe(
      "preview-complete",
    );
  });

  it("does not call queued or failed engagement evidence committed", () => {
    expect(resolveDiscoveryEngagementDelivery({ ok: true, applied: true })).toBe("committed");
    expect(resolveDiscoveryEngagementDelivery({ ok: true, skippedPersistence: true })).toBe("preview-skipped");
    expect(resolveDiscoveryEngagementDelivery({ ok: false, queued: true })).toBe("queued");
    expect(resolveDiscoveryEngagementDelivery({ ok: false })).toBe("failed");
  });

  it("starts academic completion independently of rating or Skip delivery", async () => {
    const order: string[] = [];
    const result = await runDiscoveryExitSequence({
      commitEngagement: async () => { order.push("engagement"); return { ok: true, applied: true }; },
      completeAcademic: async () => { order.push("complete"); return { targetedGenerationQueued: true }; },
    });
    expect(order).toEqual(["complete", "engagement"]);
    expect(result).toMatchObject({ targetedGenerationQueued: true });

    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const attemptBranchStart = source.indexOf('if (data.type === "evaluation_attempt")');
    const branchStart = source.indexOf('if (data.type === "evaluation_complete")');
    const branchEnd = source.indexOf('if (data.type !== "node_complete"', branchStart);
    const attemptBranch = source.slice(attemptBranchStart, branchStart);
    const branch = source.slice(branchStart, branchEnd);

    expect(attemptBranch).toContain("discovery_attempt_missing_provenance");
    expect(branch).toContain("startDiscoveryAcademicCompletion()");
    expect(branch).toContain("showPlannerBoardEngagementOverlay");
    expect(branch).toContain("discovery_completion_missing_provenance");
    expect(branch.indexOf("discovery_completion_missing_provenance"))
      .toBeLessThan(branch.indexOf("showPlannerBoardEngagementOverlay"));
    expect(branch.indexOf("return;"))
      .toBeLessThan(branch.indexOf("showPlannerBoardEngagementOverlay"));
  });

  it("completes academics when engagement evidence failed or is only queued", async () => {
    let completionCalls = 0;
    await expect(runDiscoveryExitSequence({
      commitEngagement: async () => ({ ok: false, queued: true }),
      completeAcademic: async () => { completionCalls += 1; return {}; },
    })).resolves.toEqual({});
    expect(completionCalls).toBe(1);
  });
});
