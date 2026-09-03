import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import {
  isDirectDiscoveryPacket,
  resolveDiscoveryCompletionHandoff,
  resolveDiscoveryEngagementDelivery,
  runDiscoveryExitSequence,
  resolveDirectDiscoverySurface,
  resolveDirectDiscoveryLaunchNode,
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

  it("does not call queued or failed engagement evidence committed", () => {
    expect(resolveDiscoveryEngagementDelivery({ ok: true, applied: true })).toBe("committed");
    expect(resolveDiscoveryEngagementDelivery({ ok: true, skippedPersistence: true })).toBe("preview-skipped");
    expect(resolveDiscoveryEngagementDelivery({ ok: false, queued: true })).toBe("queued");
    expect(resolveDiscoveryEngagementDelivery({ ok: false })).toBe("failed");
  });

  it("waits for rating or Skip delivery before starting targeted planning", async () => {
    const order: string[] = [];
    const result = await runDiscoveryExitSequence({
      commitEngagement: async () => { order.push("engagement"); return { ok: true, applied: true }; },
      completeAcademic: async () => { order.push("complete"); return { targetedGenerationQueued: true }; },
    });
    expect(order).toEqual(["engagement", "complete"]);
    expect(result).toMatchObject({ targetedGenerationQueued: true });

    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const attemptBranchStart = source.indexOf('if (data.type === "evaluation_attempt")');
    const branchStart = source.indexOf('if (data.type === "evaluation_complete")');
    const branchEnd = source.indexOf('if (data.type !== "node_complete"', branchStart);
    const attemptBranch = source.slice(attemptBranchStart, branchStart);
    const branch = source.slice(branchStart, branchEnd);

    expect(attemptBranch).toContain("discovery_attempt_missing_provenance");
    expect(branch).not.toContain("startDiscoveryAcademicCompletion()");
    expect(branch).toContain("showPlannerBoardEngagementOverlay");
    expect(branch).toContain("discovery_completion_missing_provenance");
    expect(branch.indexOf("discovery_completion_missing_provenance"))
      .toBeLessThan(branch.indexOf("showPlannerBoardEngagementOverlay"));
    expect(branch.indexOf("return;"))
      .toBeLessThan(branch.indexOf("showPlannerBoardEngagementOverlay"));
  });

  it("does not start planning when engagement evidence failed or is only queued", async () => {
    let completionCalls = 0;
    await expect(runDiscoveryExitSequence({
      commitEngagement: async () => ({ ok: false, queued: true }),
      completeAcademic: async () => { completionCalls += 1; return {}; },
    })).rejects.toThrow("discovery_engagement_not_committed:queued");
    expect(completionCalls).toBe(0);
  });
});
