import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import {
  buildPlannerBoardIframeStartMessage,
  isDirectDiscoveryPacket,
  isProbeBoardPacket,
  hasPendingLearningGeneration,
  resolveProbeBoardCompletion,
  runProbeBoardCompletionHandoff,
  resolveDiscoveryCompletionHandoff,
  resolvePlannerBoardSessionScope,
  resolvePersistedDiscoveryHandoff,
  resolveDiscoveryEngagementDelivery,
  runDiscoveryExitSequence,
  resolveDirectDiscoverySurface,
  resolveDirectDiscoveryLaunchNode,
  resolveHomeworkVoiceSessionStart,
  resolveHomeworkVoiceAutostart,
  resolvePlannerBoardLaunchNode,
  shouldHoldTargetedBoardForPreparation,
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
  it("starts a mystery reward iframe instead of leaving it waiting", () => {
    // Human catch: the reward iframe rendered its waiting screen forever.
    // The prior lab verified the frame URL but never exercised its load handshake.
    expect(buildPlannerBoardIframeStartMessage({
      nodeType: "mystery",
      childName: "Learner",
      companionName: "Elli",
    })).toEqual({
      type: "start",
      childName: "Learner",
      companionName: "Elli",
      config: {},
    });
    expect(buildPlannerBoardIframeStartMessage({
      nodeType: "generated-baseline",
      childName: "Learner",
      companionName: "Elli",
    })).toBeNull();

    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(source).toContain("buildPlannerBoardIframeStartMessage");
    expect(source).toContain("onLoad={handlePlannerBoardIframeLoad}");
  });

  it("does not start homework voice until one exact assignment packet is validated", () => {
    const ready = packet("discovery:hw-1", [
      { id: "evaluation", type: "word-radar", title: "Show What You Know" },
    ]);
    ready.activeSessionPlan!.domain = "spelling";
    ready.childChart = {
      childId: "ila",
      learningCycle: { homeworkId: "hw-1" },
    } as never;

    expect(resolveHomeworkVoiceSessionStart(null, true)).toBeNull();
    expect(resolveHomeworkVoiceSessionStart(null, false)).toBeNull();

    const mismatched = structuredClone(ready);
    mismatched.childChart.learningCycle!.homeworkId = "hw-stale";
    expect(resolveHomeworkVoiceSessionStart(mismatched, false)).toBeNull();

    expect(resolveHomeworkVoiceSessionStart(ready, false)).toEqual({
      childId: "ila",
      homeworkId: "hw-1",
      domain: "spelling",
    });
  });

  it("does not open empty voice sessions while a successor board is preparing", () => {
    // Human catch: each waiting-screen reconnect opened and ended an empty
    // session. The packet identity test did not account for lifecycle state.
    const preparing = packet("discovery:hw-1", [
      { id: "evaluation", type: "word-radar", title: "Show What You Know" },
    ]);
    preparing.activeSessionPlan!.domain = "spelling";
    preparing.childChart = {
      childId: "reina",
      learningCycle: { homeworkId: "hw-1", lifecycle: "targeted_planning" },
    } as never;

    expect(resolveHomeworkVoiceSessionStart(preparing, false)).toBeNull();
  });

  it("does not auto-restart the same assignment after a fatal voice failure", () => {
    const first = resolveHomeworkVoiceAutostart({
      previousScope: null,
      childId: "ila",
      homeworkId: "hw-1",
      phase: "picker",
    });
    expect(first).toEqual({ scope: "ila:hw-1", shouldStart: true });

    expect(resolveHomeworkVoiceAutostart({
      previousScope: first.scope,
      childId: "ila",
      homeworkId: "hw-1",
      phase: "picker",
    })).toEqual({ scope: "ila:hw-1", shouldStart: false });

    expect(resolveHomeworkVoiceAutostart({
      previousScope: first.scope,
      childId: "ila",
      homeworkId: "hw-2",
      phase: "picker",
    })).toEqual({ scope: "ila:hw-2", shouldStart: true });
  });

  it("keeps a legacy reading board launchable without inventing a canonical cycle", () => {
    const legacy = packet("legacy:reading", []);
    legacy.activeSessionPlan!.domain = "reading";
    legacy.activeSessionPlan!.activeHomeworkId = "hw-reading-1";
    legacy.childChart = { childId: "ila", learningCycle: null } as never;

    expect(resolveHomeworkVoiceSessionStart(legacy, false)).toEqual({
      childId: "ila",
      homeworkId: "hw-reading-1",
      domain: "reading",
    });
  });

  it("never starts a homework voice session directly from the child picker", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const picker = source.slice(
      source.indexOf("<ChildPicker"),
      source.indexOf("</ChildPicker>") > -1
        ? source.indexOf("</ChildPicker>")
        : source.indexOf("</div>", source.indexOf("<ChildPicker")),
    );

    expect(picker).not.toContain("startSession(name, opts)");
    expect(source).toContain("resolveHomeworkVoiceSessionStart");
  });

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
  it("shows truthful preparation while one complete successor board is built between sessions", () => {
    for (const lifecycle of ["baseline_generating", "quest_generating", "boss_generating"]) {
      const current = packet("hw-1:board:2", []);
      current.activeSessionPlan!.domain = "math";
      current.childChart = { learningCycle: { lifecycle } } as never;
      expect(hasPendingLearningGeneration(current, false)).toBe(true);
    }
  });
  it("keeps watching a Probe Board while verified siblings are still locked", () => {
    const probe = packet("probe-board:hw-1", [
      { id: "probe-ready", type: "generated-baseline", title: "Ready" },
      { id: "probe-building", type: "generated-baseline", title: "Locked" },
    ]);
    probe.childChart = { learningCycle: { lifecycle: "evaluation_ready" } } as never;
    const nodes = probe.activeSessionPlan!.adventureBoard!.nodes;
    nodes[0]!.state = "current";
    nodes[1]!.state = "locked";
    nodes[1]!.action = { type: "show-locked-reason", payloadId: "probe-building" };
    nodes[1]!.lock = { reason: "artifact-not-ready", label: "Locked" };

    expect(hasPendingLearningGeneration(probe, false)).toBe(true);

    nodes[1]!.state = "available";
    nodes[1]!.action = { type: "launch-activity", payloadId: "probe-building" };
    delete nodes[1]!.lock;
    expect(hasPendingLearningGeneration(probe, false)).toBe(false);
  });
  it("launches only unanswered frozen spelling items after resuming Discovery", () => {
    const discovery = packet("discovery:hw-1", [{ id: "start", type: "start" }, { id: "evaluation", type: "word-radar", targets: ["night", "light"] }]);
    discovery.activeSessionPlan!.domain = "spelling";
    discovery.spellingDiscovery = { nodeId: "evaluation", items: [{ itemId: "second", display: "light", acceptedResponses: ["light"], label: "Spelling", subject: "spelling" }] };
    expect(resolveDirectDiscoveryLaunchNode(discovery)?.wordRadarItems).toEqual([{ itemId: "second", display: "light", acceptedResponses: ["light"], label: "Spelling", subject: "spelling" }]);
    discovery.spellingDiscovery = undefined;
    expect(resolveDirectDiscoveryLaunchNode(discovery)).toBeNull();
  });
  it("keeps the native spelling evaluation on the Discovery completion path after the canonical packet refreshes", () => {
    // Human catch: the twelfth answer refreshed the packet from a legacy
    // `discovery:` plan id to a canonical `learning-cycle:` id. The screen and
    // attempt logs remained healthy, so the lab never exercised the final
    // native Word Radar callback against that refreshed packet. Sunny then
    // called the ordinary lesson endpoint, which correctly rejected an
    // evaluation node and left the child stuck after completing every word.
    const discovery = packet("learning-cycle:hw-1:r16", [
      { id: "start", type: "start", title: "Start" },
      { id: "hw-1:discovery", type: "word-radar", title: "Show What You Know" },
    ]);
    discovery.activeSessionPlan!.domain = "spelling";
    discovery.childChart = {
      childId: "learner",
      learningCycle: {
        homeworkId: "hw-1",
        lifecycle: "evaluation_active",
        revision: 16,
      },
    } as never;
    discovery.spellingDiscovery = {
      nodeId: "hw-1:discovery",
      items: [],
    };

    expect(isDirectDiscoveryPacket(discovery)).toBe(true);
    expect(resolveDirectDiscoveryLaunchNode(discovery)?.id).toBe("hw-1:discovery");
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
    expect(source.includes("enableLocalNarrationFallback={!directDiscoveryMode && !plannerBoardLaunch.node.spellingAssessment}")).toBe(false);
    expect(source).toContain(".flushForExit()");
  });
  it("flushes Probe Board attempts before an early return to the map", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(source).toContain("if (directDiscoveryMode || probeBoardMode || plannerBoardLaunch?.node.spellingAssessment)");
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

  it("shows a Planner-authored Probe Board instead of auto-launching one evaluation", () => {
    // Human-caught invariant: the old lab proved one generated iframe, but not
    // the board-level wait caused by building only one evaluation node.
    const probe = packet("probe-board:hw-1", [
      { id: "probe-a", type: "generated-baseline", title: "Notice the Pattern" },
      { id: "probe-b", type: "generated-baseline", title: "Try Another Way" },
    ]);

    expect(isProbeBoardPacket(probe)).toBe(true);
    expect(isDirectDiscoveryPacket(probe)).toBe(false);
    expect(resolveDirectDiscoveryLaunchNode(probe)).toBeNull();
  });

  it("returns to the Probe Board between nodes and ends the session after the chapter", () => {
    expect(resolveProbeBoardCompletion({ probeChapterComplete: false })).toBe("continue-probe");
    expect(resolveProbeBoardCompletion({ probeChapterComplete: true, returnNextSession: true })).toBe("finish-session");
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const probeCompletion = source.slice(
      source.indexOf("if (probeBoardMode)"),
      source.indexOf("const handoff = resolveDiscoveryCompletionHandoff", source.indexOf("if (probeBoardMode)")),
    );
    expect(probeCompletion).toContain("runProbeBoardCompletionHandoff");
    expect(probeCompletion).toContain("finishSession: finishHomeworkSession");
    expect(probeCompletion).not.toContain("setDiscoveryCompletionHandoff");
  });

  it("never traps the child when the packet refresh fails after Probe completion", async () => {
    const refresh = async () => { throw new Error("packet unavailable"); };
    let continued = 0;
    let finished = 0;

    await expect(runProbeBoardCompletionHandoff({
      completion: { probeChapterComplete: false },
      refresh,
      continueProbe: () => { continued += 1; },
      finishSession: () => { finished += 1; },
    })).resolves.toBe("continue-probe");
    expect(continued).toBe(1);
    expect(finished).toBe(0);

    await expect(runProbeBoardCompletionHandoff({
      completion: { probeChapterComplete: true },
      refresh,
      continueProbe: () => { continued += 1; },
      finishSession: () => { finished += 1; },
    })).resolves.toBe("finish-session");
    expect(finished).toBe(1);
  });

  it("does not bypass the map for a targeted teaching board", () => {
    const targeted = packet("targeted:hw-1", [
      { id: "start", type: "start", title: "Start" },
      { id: "N1", type: "generated", title: "First lesson", gameHtmlPath: "/games/hw-1/N1.html" },
    ]);

    expect(isDirectDiscoveryPacket(targeted)).toBe(false);
    expect(resolveDirectDiscoveryLaunchNode(targeted)).toBeNull();
  });

  it("holds a targeted board when no activity is playable", () => {
    const targeted = packet("targeted:hw-1", [
      { id: "start", type: "start", title: "Start" },
      { id: "gear-secret", type: "generated", title: "The Gear Secret" },
    ]);
    const node = targeted.activeSessionPlan!.adventureBoard!.nodes[1]!;
    node.state = "locked";
    node.lock = { reason: "generation-needs-attention", label: "Parent help needed" };
    node.action = { type: "show-locked-reason", payloadId: node.id };

    expect(shouldHoldTargetedBoardForPreparation(targeted)).toBe(true);

    node.state = "current";
    node.lock = undefined;
    node.action = { type: "launch-activity", payloadId: node.id };
    expect(shouldHoldTargetedBoardForPreparation(targeted)).toBe(false);
  });

  it("renders preparation instead of mounting a targeted board with no playable activity", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const branch = source.slice(
      source.indexOf("} else if (plannerBoardPacket) {"),
      source.indexOf("} else if (plannerBoardPacketState.loading)"),
    );
    expect(branch).toContain(" targetedBoardHeldForPreparation ? (");
    expect(branch.indexOf("targetedBoardHeldForPreparation ? ("))
      .toBeLessThan(branch.indexOf("<AdventureBoardExperience"));
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

  // 2026-09-30 a child met the operational status panel as her session's ending.
  // 2026-10-05 the parent approved a designed alternative: spelling Discovery ends on
  // the child-facing preparation chapter (her words, the stepper filling from real
  // status, Elli speaking, "Stop for now" / "Bye for now"), never the operational panel.
  it("ends Discovery on the designed preparation chapter, never the operational status panel", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const discoveryBranchStart = source.indexOf("main = directDiscoveryMode ? (");
    const discoveryBranchEnd = source.indexOf("targetedBoardHeldForPreparation ? (", discoveryBranchStart);
    const discoveryBranch = source.slice(discoveryBranchStart, discoveryBranchEnd);

    expect(discoveryBranch).toContain("effectiveDiscoveryCompletionHandoff ? preparation.screen ?? (");
    expect(discoveryBranch).toContain("<DiscoveryCompletionChapter");
    expect(discoveryBranch).not.toContain("<LearningPreparationStatus");
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
    expect(branch).toContain("startDiscoveryAcademicCompletion(launch.node.id)");
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

it('notifies the server when the host closes a board launch with its exact token',()=>{
 const source=readFileSync(resolve(process.cwd(),'src/App.tsx'),'utf8');
 const close=source.slice(source.indexOf('const closePlannerBoardLaunch ='),source.indexOf('const launchPlannerBoardNode ='));
 expect(close).toContain('phase: "closed"');
 expect(close).toContain('launchToken: plannerBoardLaunch.completionId');
});
