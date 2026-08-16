import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { createLearningCycle, getLearningCycle, transitionLearningCycle, type CreateLearningCycleInput } from "./learningCycleRepository";
import { advanceCanonicalCycleFromEvidence, baselineQuestEvidenceEligibility, parseCanonicalProgressionDecision, questBossEvidenceEligibility, recordCanonicalNodeCompletion } from "./learningCycleRuntime";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cycle-runtime-"));
}

function writeChildChartFixture(rootDir: string): void {
  const childDir = path.join(rootDir, "src", "context", "reina");
  fs.mkdirSync(childDir, { recursive: true });
  fs.writeFileSync(path.join(childDir, "child_profile.json"), JSON.stringify({
    childId: "reina",
    identity: { displayName: "Reina", ttsName: "Reina" },
    links: { learningProfile: "learning_profile.json" },
  }));
  fs.writeFileSync(path.join(childDir, "learning_profile.json"), JSON.stringify({
    childId: "reina",
    rewardPreferences: { preferred: [] },
  }));
}

function node(id: string, role: "baseline" | "quest" | "boss", state: "ready" | "locked" = "ready") {
  const title = role === "quest" ? "Quest" : role === "boss" ? "Boss" : id === "facts" ? "Fact Blaster" : "Story Solver";
  return {
    nodeId: id,
    role,
    title,
    state,
    academicTarget: { domain: "math", skill: "multiplication", targets: [id] },
    algorithmOwner: role === "baseline" ? "retrieval-practice" : "mastery-gating",
    theoryId: "theory-1",
    experimentId: `experiment-${id}`,
    mechanic: role === "baseline" ? id : `generated-after-${role === "quest" ? "baseline" : "quest"}`,
    theme: "math adventure",
    openingScreen: { title, purpose: `Practice ${id}` },
    generationPrompt: null,
    artifactBinding: role === "baseline" ? {
      contentId: `content-${id}`,
      artifactId: `artifact-${id}`,
      localArtifactPath: `/games/${id}.html`,
      localArtworkPath: `/generated/${id}.png`,
      contractFingerprint: `contract-${id}`,
      validationStatus: "passed" as const,
    } : null,
    artwork: { status: "ready" as const, localPath: `/generated/${id}.png`, prompt: null },
    sfxContract: ["tap", "correct", "incorrect", "progress", "complete"],
    companionContract: { events: ["session_complete"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true },
    evidenceIds: [],
  };
}

function input(): CreateLearningCycleInput {
  return {
    childId: "reina",
    homeworkId: "hw-runtime",
    domain: "math",
    assignment: { title: "Multiplication", contentFingerprint: "fp", capturedEvidenceIds: ["pdf:1"], targets: ["facts", "story"] },
    academicTheory: { theoryId: "theory-1", revision: 1, hypothesis: "Measure recall and transfer", supportCriteria: ["accuracy >= .8"], reviseCriteria: ["accuracy < .8"], falsifyCriteria: ["accuracy < .5"] },
    engagementTheory: null,
    nodes: [node("facts", "baseline"), node("story", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
  };
}

function finalizeSession(rootDir: string, nodeId: string, choiceEventId: string): void {
  const cycle = getLearningCycle("reina", "hw-runtime", { rootDir });
  if (!cycle) throw new Error("test_cycle_missing");
  transitionLearningCycle("reina", "hw-runtime", cycle.revision, {
    type: "session_finalized",
    nodeId,
    choiceEventId,
    engagement: { postActivityAction: "back_to_map" },
  }, { rootDir });
}

async function reachQuestEvaluation(scenario: {
  rootDir: string;
  questTarget?: string;
  questCorrect: boolean;
  scaffoldLevel?: number;
  companionInteractions?: string[];
}): Promise<void> {
  createLearningCycle({
    ...input(),
    nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
  }, { rootDir: scenario.rootDir });
  recordCanonicalNodeCompletion({
    childId: "reina",
    homeworkId: "hw-runtime",
    sessionId: "session:baseline",
    nodeId: "facts",
    result: {
      completed: true,
      accuracy: 1,
      timeSpent_ms: 1_000,
      targetResults: [{ target: "baseline-item", correct: true }],
    },
  }, { rootDir: scenario.rootDir });
  finalizeSession(scenario.rootDir, "facts", "modal:boss-boundary:baseline");
  const questGenerating = await advanceCanonicalCycleFromEvidence({
    childId: "reina",
    homeworkId: "hw-runtime",
    decide: async () => ({
      status: "supported",
      reason: "Collect unseen transfer evidence.",
      progressionAction: "generate_quest",
      preserve: [],
      change: [],
      testNext: ["unseen transfer"],
      nextEvidenceRequired: ["Quest scorecard"],
    }),
  }, { rootDir: scenario.rootDir });
  transitionLearningCycle("reina", "hw-runtime", questGenerating.revision, {
    type: "artifact_bound",
    nodeId: "quest",
    artifact: {
      contentId: "quest",
      artifactId: "quest",
      localArtifactPath: "/games/quest.html",
      localArtworkPath: "/generated/quest.png",
      contractFingerprint: "quest",
      validationStatus: "passed",
    },
  }, { rootDir: scenario.rootDir });
  recordCanonicalNodeCompletion({
    childId: "reina",
    homeworkId: "hw-runtime",
    sessionId: "session:quest",
    nodeId: "quest",
    result: {
      completed: true,
      accuracy: scenario.questCorrect ? 1 : 0,
      timeSpent_ms: 1_000,
      targetResults: [{
        target: scenario.questTarget ?? "fresh-quest-item",
        correct: scenario.questCorrect,
        ...(scenario.scaffoldLevel ? { scaffoldLevel: scenario.scaffoldLevel } : {}),
      }],
      ...(scenario.companionInteractions ? { companionInteractions: scenario.companionInteractions } : {}),
    },
  }, { rootDir: scenario.rootDir });
  finalizeSession(scenario.rootDir, "quest", "modal:boss-boundary:quest");
}

describe("canonical learning cycle runtime", () => {
  it("hydrates the existing shared-entry math cycle into an agency experiment", () => {
    const rootDir = root();
    const routedNode = (id: string, routeId: string) => ({
      ...node(id, "baseline"),
      title: id,
      openingScreen: { title: id, purpose: `Practice ${id}` },
      routeId,
    });
    createLearningCycle({
      ...input(),
      nodes: [
        routedNode("N1", "route-shared-entry"),
        routedNode("N2", "route-shared-entry"),
        routedNode("N3A", "route-a"),
        routedNode("N3B", "route-b"),
        node("quest", "quest", "locked"),
        node("boss", "boss", "locked"),
      ],
    }, { rootDir });

    expect(getLearningCycle("reina", "hw-runtime", { rootDir })?.agencyExperiment).toEqual({
      experimentId: "hw-runtime:agency:legacy-route-projection",
      sharedNodeIds: ["N1", "N2"],
      routes: [
        { routeId: "route-a", nodeIds: ["N3A"] },
        { routeId: "route-b", nodeIds: ["N3B"] },
      ],
    });
  });

  it("keeps shared teaching active until the child selects and completes one agency route", () => {
    const rootDir = root();
    const routedNode = (id: string, state: "ready" | "locked", routeId: string) => ({
      ...node(id, "baseline", state),
      title: id,
      openingScreen: { title: id, purpose: `Practice ${id}` },
      routeId,
      experimentId: "agency-1",
    });
    const sharedOne = routedNode("N1", "ready", "route-shared-entry");
    const sharedTwo = routedNode("N2", "locked", "route-shared-entry");
    const routeA = routedNode("N3A", "locked", "route-a");
    const routeB = routedNode("N3B", "locked", "route-b");
    createLearningCycle({
      ...input(),
      agencyExperiment: {
        experimentId: "agency-1",
        sharedNodeIds: ["N1", "N2"],
        routes: [
          { routeId: "route-a", nodeIds: ["N3A"] },
          { routeId: "route-b", nodeIds: ["N3B"] },
        ],
      },
      nodes: [sharedOne, sharedTwo, routeA, routeB, node("quest", "quest", "locked"), node("boss", "boss", "locked")],
    }, { rootDir });

    const afterN1 = recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "N1",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir });
    expect(afterN1?.lifecycle).toBe("baseline_active");
    expect(afterN1?.nodes.find((item) => item.nodeId === "N2")?.state).toBe("ready");

    const afterN2 = recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "N2",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir });
    expect(afterN2?.lifecycle).toBe("baseline_active");
    expect(afterN2?.nodes.find((item) => item.nodeId === "N3A")?.state).toBe("locked");
    expect(afterN2?.nodes.find((item) => item.nodeId === "N3B")?.state).toBe("locked");

    const selectedA = transitionLearningCycle("reina", "hw-runtime", afterN2!.revision, {
      type: "route_selected",
      experimentId: "agency-1",
      routeId: "route-a",
      choiceEventId: "choice-a",
    }, { rootDir });
    expect(selectedA.routeSelection?.selectedRouteId).toBe("route-a");
    expect(selectedA.nodes.find((item) => item.nodeId === "N3A")?.state).toBe("ready");
    expect(selectedA.nodes.find((item) => item.nodeId === "N3B")?.state).toBe("locked");

    expect(() => recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "N3B",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir })).toThrow("learning_cycle_node_not_launchable:N3B");

    const selectedB = transitionLearningCycle("reina", "hw-runtime", selectedA.revision, {
      type: "route_selected",
      experimentId: "agency-1",
      routeId: "route-b",
      choiceEventId: "choice-b",
    }, { rootDir });
    expect(selectedB.routeSelection?.selectedRouteId).toBe("route-b");
    expect(selectedB.routeSelection?.history).toHaveLength(2);
    expect(selectedB.nodes.find((item) => item.nodeId === "N3A")?.state).toBe("locked");
    expect(selectedB.nodes.find((item) => item.nodeId === "N3B")?.state).toBe("ready");

    const routeComplete = recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "N3B",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir });
    expect(routeComplete?.lifecycle).toBe("baseline_evaluating");
    expect(routeComplete?.nodes.find((item) => item.nodeId === "N3A")?.state).toBe("locked");
    expect(routeComplete?.nodes.find((item) => item.nodeId === "quest")?.state).toBe("locked");
    expect(routeComplete?.nodes.find((item) => item.nodeId === "boss")?.state).toBe("locked");
  });

  it("normalizes a missing technical node id without changing the Planner's support prescription", () => {
    const decision = parseCanonicalProgressionDecision({
      status: "revised",
      reason: "Equal partitioning remains unclear.",
      progressionAction: "generate_support",
      preserve: [], change: ["partition support"], testNext: ["equal parts"], nextEvidenceRequired: ["unassisted partition"],
      nextNodeId: null,
      nextTitle: "The Cove Wreck",
      nextAcademicTarget: "Build equal parts",
      nextMechanic: "drag cut lines",
      nextTheme: "shipwreck",
      nextOpeningPurpose: "Judge a lopsided partition.",
      nextCreatorPrompt: "Build the prescribed support instrument.",
    });
    expect(decision.nextInstrument).toMatchObject({
      nodeId: "generated-support-the-cove-wreck",
      title: "The Cove Wreck",
      academicTarget: "Build equal parts",
    });
  });

  it("evaluates the completed legacy route without requiring the child to finish both routes", () => {
    const rootDir = root();
    const routedNode = (id: string, experimentId: string) => ({
      ...node(id, "baseline"),
      title: id,
      openingScreen: { title: id, purpose: `Practice ${id}` },
      experimentId,
    });
    const speedFact = routedNode("speed-fact", "hw-runtime:route-speed:speed");
    const speedStory = routedNode("speed-story", "hw-runtime:route-speed:speed");
    const puzzleFact = routedNode("puzzle-fact", "hw-runtime:route-puzzle:puzzle");
    const puzzleStory = routedNode("puzzle-story", "hw-runtime:route-puzzle:puzzle");
    createLearningCycle({
      ...input(),
      nodes: [speedFact, speedStory, puzzleFact, puzzleStory, node("quest", "quest", "locked"), node("boss", "boss", "locked")],
    }, { rootDir });

    const first = recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "speed-fact", result: { completed: true, accuracy: 1, timeSpent_ms: 1000 } }, { rootDir });
    expect(first?.lifecycle).toBe("baseline_active");
    const routeComplete = recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "speed-story", result: { completed: true, accuracy: 1, timeSpent_ms: 1000 } }, { rootDir });

    expect(routeComplete?.lifecycle).toBe("baseline_evaluating");
    expect(routeComplete?.nodes.find((item) => item.nodeId === "puzzle-fact")?.state).toBe("locked");
    expect(routeComplete?.nodes.find((item) => item.nodeId === "puzzle-story")?.state).toBe("locked");
  });

  it("records factual baseline scorecards before one Planner decision generates Quest", async () => {
    const rootDir = root();
    const cycleInput = input();
    cycleInput.nodes.find((item) => item.role === "quest")!.academicTarget.targets = [];
    cycleInput.nodes.find((item) => item.role === "boss")!.academicTarget.targets = [];
    createLearningCycle(cycleInput, { rootDir });
    const first = recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "facts", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "2x5", correct: true }], companionInteractions: ["Asked Elli to repeat the directions."] } }, { rootDir });
    expect(first?.lifecycle).toBe("baseline_active");
    expect(first?.nodes.find((item) => item.nodeId === "quest")?.generationPrompt).toBeNull();

    const second = recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "story", result: { completed: true, accuracy: 0.8, timeSpent_ms: 1800, targetResults: [{ target: "groups", correct: true }] } }, { rootDir });
    expect(second?.lifecycle).toBe("baseline_evaluating");
    expect(second?.observations).toHaveLength(2);
    expect(second?.decisionHistory.filter((item) => item.eventType === "theory_decided")).toHaveLength(0);
    finalizeSession(rootDir, "story", "modal:s1:story");

    const decided = await advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      decide: async () => ({
        status: "supported",
        reason: "The practice evidence is sufficient to test unseen transfer.",
        progressionAction: "generate_quest",
        preserve: ["visual representations"],
        change: [],
        testNext: ["unseen transfer"],
        nextEvidenceRequired: ["Quest results"],
        nextInstrument: {
          nodeId: "quest",
          title: "Lantern Rescue",
          academicTarget: "unseen equal-groups transfer",
          mechanic: "route-planning simulation",
          theme: "storm-lit harbor rescue",
          openingPurpose: "Plan a rescue route by applying multiplication in unfamiliar situations.",
          creatorPrompt: "Create a multi-stage harbor rescue with a visible destination, consequential choices, and an earned finale.",
          stakesDesign: "The tide claims one stranded boat for every wrong route.",
          failureMode: "Lose all three boats and the rescue run ends; the harbor stays dark until she runs it again.",
          escalation: "Each leg adds one more boat to route in the same tide window.",
          mechanicSpec: "Drag a rope between docks; the rope tightens and boats slide into equal rows, or slackens and a boat drifts out to sea.",
          mathematicalHook: "Six rows of five is the same crowd of boats as five rows of six, just moored sideways.",
        },
      }),
    }, { rootDir });

    expect(decided.lifecycle).toBe("quest_generating");
    expect(decided.nodes.find((item) => item.nodeId === "quest")?.generationPrompt?.createdFromEvidenceIds)
      .toEqual(expect.arrayContaining(["s1:facts:completion", "s1:story:completion"]));
    expect(decided.nodes.find((item) => item.nodeId === "quest")?.generationPrompt?.createdFromEvidenceIds)
      .not.toContain("s1:facts:completion:companion:1");
    expect(decided.nodes.find((item) => item.nodeId === "quest")?.generationPrompt?.text)
      .toContain("must not be reused verbatim");
    // The Planner named this node "Lantern Rescue"; the child sees that, not "Quest".
    expect(decided.nodes.find((item) => item.nodeId === "quest")).toMatchObject({
      role: "quest",
      title: "Lantern Rescue",
      academicTarget: {
        skill: "unseen equal-groups transfer",
        targets: ["facts", "story"],
      },
      mechanic: "route-planning simulation",
      theme: "storm-lit harbor rescue",
      openingScreen: {
        title: "Lantern Rescue",
        purpose: "Plan a rescue route by applying multiplication in unfamiliar situations.",
      },
      design: {
        stakes: "The tide claims one stranded boat for every wrong route.",
        failureMode: "Lose all three boats and the rescue run ends; the harbor stays dark until she runs it again.",
        escalation: "Each leg adds one more boat to route in the same tide window.",
        mechanicSpec: "Drag a rope between docks; the rope tightens and boats slide into equal rows, or slackens and a boat drifts out to sea.",
        mathematicalHook: "Six rows of five is the same crowd of boats as five rows of six, just moored sideways.",
      },
    });
    expect(decided.nodes.find((item) => item.nodeId === "quest")?.generationPrompt?.text)
      .toContain("multi-stage harbor rescue");
    expect(decided.decisionHistory.filter((item) => item.eventType === "theory_decided")).toHaveLength(1);

    const questReady = transitionLearningCycle("reina", "hw-runtime", decided.revision, {
      type: "artifact_bound",
      nodeId: "quest",
      artifact: {
        contentId: "content-quest",
        artifactId: "artifact-quest",
        localArtifactPath: "/games/quest.html",
        localArtworkPath: "/generated/quest.png",
        contractFingerprint: "quest-contract",
        validationStatus: "passed",
      },
    }, { rootDir });
    const observed = recordCanonicalNodeCompletion({
      childId: "reina",
      homeworkId: "hw-runtime",
      sessionId: "quest-session",
      nodeId: "quest",
      result: {
        completed: true,
        accuracy: 1,
        timeSpent_ms: 1_000,
        targetResults: [{ target: "fresh-transfer-item", correct: true }],
      },
    }, { rootDir });
    expect(questReady.nodes.find((item) => item.nodeId === "quest")?.academicTarget.targets)
      .toEqual(["facts", "story"]);
    expect(observed?.observations.at(-1)?.constructLinks[0]?.constructId).toBe("facts");
  });

  it("refuses to invoke the Planner while the completion modal is unresolved", async () => {
    const rootDir = root();
    createLearningCycle({
      ...input(),
      nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
    }, { rootDir });
    recordCanonicalNodeCompletion({
      childId: "reina",
      homeworkId: "hw-runtime",
      sessionId: "pending-modal",
      nodeId: "facts",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir });
    const decide = vi.fn();

    await expect(advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      decide,
    }, { rootDir })).rejects.toThrow("canonical_progression_session_not_finalized:baseline_evaluating");
    expect(decide).not.toHaveBeenCalled();
  });

  it("keeps delayed node modals separate and authorizes only the current frontier finalization", async () => {
    const rootDir = root();
    createLearningCycle(input(), { rootDir });
    recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "facts",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir });
    recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "s2", nodeId: "story",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir });
    let cycle = getLearningCycle("reina", "hw-runtime", { rootDir })!;
    expect(cycle.pendingSessionNodeIds).toEqual(["facts", "story"]);
    expect(cycle.evaluationNodeId).toBe("story");

    transitionLearningCycle("reina", "hw-runtime", cycle.revision, {
      type: "session_finalized",
      nodeId: "facts",
      choiceEventId: "modal:late:facts",
      engagement: { postActivityAction: "back_to_map" },
    }, { rootDir });
    cycle = getLearningCycle("reina", "hw-runtime", { rootDir })!;
    expect(cycle.pendingSessionNodeIds).toEqual(["story"]);
    expect(cycle.evaluationSessionFinalizationId).toBeUndefined();
    await expect(advanceCanonicalCycleFromEvidence({
      childId: "reina", homeworkId: "hw-runtime", decide: vi.fn(),
    }, { rootDir })).rejects.toThrow("canonical_progression_session_not_finalized");

    finalizeSession(rootDir, "story", "modal:current:story");
    const decide = vi.fn(async () => ({
      status: "inconclusive" as const,
      reason: "Collect one more independent observation.",
      progressionAction: "collect_more_evidence" as const,
      preserve: [], change: [], testNext: ["independent response"], nextEvidenceRequired: ["one response"],
    }));
    await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide }, { rootDir });
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it("durably claims one finalized packet before concurrent Planner requests", async () => {
    const rootDir = root();
    createLearningCycle({
      ...input(),
      nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
    }, { rootDir });
    recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "claim", nodeId: "facts",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir });
    finalizeSession(rootDir, "facts", "modal:claim:facts");
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const decide = vi.fn(async () => {
      await held;
      return {
        status: "inconclusive" as const,
        reason: "Collect one more observation.",
        progressionAction: "collect_more_evidence" as const,
        preserve: [], change: [], testNext: [], nextEvidenceRequired: ["one response"],
      };
    });

    const first = advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide }, { rootDir });
    await vi.waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    await expect(advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide }, { rootDir }))
      .rejects.toThrow("canonical_progression_decision_in_flight");
    expect(decide).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it("recovers a stale Planner claim after a process restart", async () => {
    const rootDir = root();
    createLearningCycle({
      ...input(),
      nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
    }, { rootDir });
    recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "stale", nodeId: "facts",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir });
    finalizeSession(rootDir, "facts", "modal:stale:facts");
    const finalized = getLearningCycle("reina", "hw-runtime", { rootDir });
    if (!finalized) throw new Error("test_cycle_missing");
    transitionLearningCycle("reina", "hw-runtime", finalized.revision, {
      type: "progression_decision_claimed",
      finalizationId: "modal:stale:facts",
      claimId: "stale-process",
    }, { rootDir, now: new Date(Date.now() - (11 * 60 * 1000)) });
    const decide = vi.fn(async () => ({
      status: "inconclusive" as const,
      reason: "Collect one more observation.",
      progressionAction: "collect_more_evidence" as const,
      preserve: [], change: [], testNext: [], nextEvidenceRequired: ["one response"],
    }));

    await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide }, { rootDir });

    expect(decide).toHaveBeenCalledTimes(1);
    expect(getLearningCycle("reina", "hw-runtime", { rootDir })?.progressionDecisionClaim).toBeUndefined();
  });

  it("commits one Planner decision after a delayed earlier-node modal advances the revision", async () => {
    const rootDir = root();
    createLearningCycle(input(), { rootDir });
    recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "facts", nodeId: "facts",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir });
    recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "story", nodeId: "story",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir });
    finalizeSession(rootDir, "story", "modal:story");
    const decide = vi.fn(async () => {
      finalizeSession(rootDir, "facts", "modal:facts:delayed");
      return {
        status: "inconclusive" as const,
        reason: "Collect one more observation.",
        progressionAction: "collect_more_evidence" as const,
        preserve: [], change: [], testNext: [], nextEvidenceRequired: ["one response"],
      };
    });

    const decided = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide }, { rootDir });

    expect(decide).toHaveBeenCalledTimes(1);
    expect(decided.progressionDecisionClaim).toBeUndefined();
    expect(decided.sessionFinalizations.map((item) => item.choiceEventId)).toEqual(["modal:story", "modal:facts:delayed"]);
  });

  it("preserves an already-produced Planner result through brief canonical transition contention", async () => {
    const rootDir = root();
    createLearningCycle({
      ...input(),
      nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
    }, { rootDir });
    recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "contention", nodeId: "facts",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir });
    finalizeSession(rootDir, "facts", "modal:contention");
    const lockDir = path.join(rootDir, "src/context/reina/homework/cycles/hw-runtime.json.transition-lock");
    const decide = vi.fn(async () => {
      fs.mkdirSync(lockDir);
      setTimeout(() => fs.rmSync(lockDir, { recursive: true, force: true }), 40);
      return {
        status: "inconclusive" as const,
        reason: "Collect one more observation.",
        progressionAction: "collect_more_evidence" as const,
        preserve: [], change: [], testNext: [], nextEvidenceRequired: ["one response"],
      };
    });

    const decided = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide }, { rootDir });

    expect(decide).toHaveBeenCalledTimes(1);
    expect(decided.progressionDecisionClaim).toBeUndefined();
  });

  it("preserves a failed Planner claim and allows one later retry", async () => {
    const rootDir = root();
    createLearningCycle({
      ...input(),
      nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
    }, { rootDir });
    recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "retry", nodeId: "facts",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir });
    finalizeSession(rootDir, "facts", "modal:retry:facts");

    await expect(advanceCanonicalCycleFromEvidence({
      childId: "reina", homeworkId: "hw-runtime", decide: async () => { throw new Error("provider unavailable"); },
    }, { rootDir })).rejects.toThrow("provider unavailable");
    expect(getLearningCycle("reina", "hw-runtime", { rootDir })?.progressionDecisionClaim).toMatchObject({
      finalizationId: "modal:retry:facts",
      status: "failed",
      lastError: "provider unavailable",
    });

    const decide = vi.fn(async () => ({
      status: "inconclusive" as const,
      reason: "Collect one more observation.",
      progressionAction: "collect_more_evidence" as const,
      preserve: [], change: [], testNext: [], nextEvidenceRequired: ["one response"],
    }));
    await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide }, { rootDir });
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it("does not turn an uncaptured spoken explanation into correct academic evidence", () => {
    const rootDir = root();
    createLearningCycle(input(), { rootDir });

    const cycle = recordCanonicalNodeCompletion({
      childId: "reina",
      homeworkId: "hw-runtime",
      sessionId: "spoken-explanation",
      nodeId: "facts",
      result: {
        completed: true,
        accuracy: 1,
        timeSpent_ms: 1000,
        targetResults: [{
          target: "explain-equal-parts",
          correct: true,
          attemptedValue: "no_—_(spoken_aloud,_not_transcribed)",
        }],
      },
    }, { rootDir });

    expect(cycle?.observations[0]?.result).toEqual({
      observedErrorType: "response_not_captured",
    });
    expect(cycle?.observations[0]?.confounds).toContain("response_not_captured");
    expect(cycle?.evidence.academic[0]?.accuracy).toBeUndefined();
  });

  it("continues after instrument ambiguity without creating mastery or Quest eligibility", () => {
    const rootDir = root();
    createLearningCycle(input(), { rootDir });

    const cycle = recordCanonicalNodeCompletion({
      childId: "reina",
      homeworkId: "hw-runtime",
      sessionId: "ambiguous-instrument",
      nodeId: "facts",
      result: {
        completed: true,
        accuracy: 0,
        timeSpent_ms: 1000,
        targetResults: [
          {
            target: "explain-factors",
            attemptedValue: "8 wagons and 5 lanterns equal 40",
            correct: false,
            attemptId: "attempt-27",
          },
          {
            target: "explain-factors",
            attemptedValue: "8 wagons and 5 lanterns equal 40",
            observedErrorType: "instrument_ambiguous",
            assistanceStatus: "assisted",
            confounds: ["instrument_ambiguous", "elli_resolution"],
            resolutionId: "friction:ambiguous-instrument:facts:explain-factors",
            supersedesAttemptId: "attempt-27",
          },
        ],
      },
    }, { rootDir });

    expect(cycle?.observations[0]).toMatchObject({
      result: { observedErrorType: "instrument_ambiguous" },
      assistance: { status: "assisted" },
      confounds: expect.arrayContaining(["instrument_ambiguous", "assistance_present"]),
    });
    expect(cycle?.observations).toHaveLength(1);
    expect(cycle && baselineQuestEvidenceEligibility(cycle)).toMatchObject({
      eligible: false,
      independentCorrectObservationCount: 0,
    });
    expect(cycle?.evidence.academic[0]?.accuracy).toBeUndefined();
  });

  it("lets the Planner prescribe one harder support instrument instead of Quest", async () => {
    const rootDir = root();
    createLearningCycle({ ...input(), nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")] }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "facts", result: { completed: true, accuracy: 0.4, timeSpent_ms: 1000, targetResults: [{ target: "2x5", correct: false }] } }, { rootDir });
    finalizeSession(rootDir, "facts", "modal:s1:facts");

    const decided = await advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      decide: async () => ({
        status: "revised",
        reason: "The representation link remains unclear.",
        progressionAction: "generate_support",
        preserve: [],
        change: ["representation"],
        testNext: ["array to notation"],
        nextEvidenceRequired: ["unassisted construction"],
        nextInstrument: {
          nodeId: "support-array-link",
          title: "Array Bridge",
          academicTarget: "Connect arrays to multiplication notation",
          mechanic: "visual construction",
          theme: "bridge workshop",
          openingPurpose: "Build an array, then name its multiplication fact.",
          creatorPrompt: "Create a concise visual construction activity using unseen values.",
        },
      }),
    }, { rootDir });

    expect(decided.lifecycle).toBe("baseline_generating");
    expect(decided.nodes.find((item) => item.nodeId === "support-array-link")).toMatchObject({
      role: "baseline",
      state: "generating",
      title: "Array Bridge",
    });
  });

  it.each([
    {
      label: "all answers are incorrect",
      result: {
        completed: true,
        accuracy: 0,
        timeSpent_ms: 1000,
        targetResults: [{ target: "2x5", correct: false }],
      },
    },
    {
      label: "correct work is entirely assisted",
      result: {
        completed: true,
        accuracy: 1,
        timeSpent_ms: 1000,
        targetResults: [{ target: "2x5", correct: true, scaffoldLevel: 2 }],
        companionInteractions: ["Elli demonstrated an analogous example."],
      },
    },
  ])("does not allow Quest when $label", async ({ result }) => {
    const rootDir = root();
    createLearningCycle({
      ...input(),
      nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
    }, { rootDir });
    recordCanonicalNodeCompletion({
      childId: "reina",
      homeworkId: "hw-runtime",
      sessionId: "weak-baseline",
      nodeId: "facts",
      result,
    }, { rootDir });
    finalizeSession(rootDir, "facts", `modal:weak:${result.accuracy}`);

    await expect(advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      decide: async () => ({
        status: "supported",
        reason: "Generate transfer from completion alone.",
        progressionAction: "generate_quest",
        preserve: [],
        change: [],
        testNext: ["transfer"],
        nextEvidenceRequired: ["Quest"],
        nextInstrument: {
          nodeId: "quest",
          title: "Quest",
          academicTarget: "unseen transfer",
          mechanic: "AI selected",
          theme: "AI selected",
          openingPurpose: "Apply the concept.",
          creatorPrompt: "Create unseen transfer.",
        },
      }),
    }, { rootDir })).rejects.toThrow("canonical_progression_quest_requires_eligible_baseline_evidence");
  });

  it("recognizes qualifying evidence from an adaptive support node whose id contains colons", () => {
    const rootDir = root();
    createLearningCycle({
      ...input(),
      nodes: [node("support:equal-groups", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
    }, { rootDir });
    const observed = recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "session:support", nodeId: "support:equal-groups",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "fresh-support-item", correct: true }] },
    }, { rootDir });
    expect(observed && baselineQuestEvidenceEligibility(observed)).toMatchObject({
      eligible: true,
      independentCorrectObservationCount: 1,
    });
  });

  it("does not attribute a colon-suffixed support source to a shorter Quest node id", () => {
    const rootDir = root();
    createLearningCycle({
      ...input(),
      nodes: [node("support:quest", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
    }, { rootDir });
    const observed = recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "session:support", nodeId: "support:quest",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "fresh-support-item", correct: true }] },
    }, { rootDir });

    expect(observed && questBossEvidenceEligibility(observed)).toMatchObject({
      eligible: false,
      targetAlignedObservationCount: 0,
    });
  });

  it("uses canonical observation node identity when session and node suffixes are ambiguous", () => {
    const rootDir = root();
    const questNode = node("quest", "quest");
    questNode.artifactBinding = {
      contentId: "quest", artifactId: "quest", localArtifactPath: "/games/quest.html",
      localArtworkPath: "/generated/quest.png", contractFingerprint: "quest", validationStatus: "passed",
    };
    createLearningCycle({
      ...input(),
      nodes: [node("session:quest", "baseline"), questNode, node("boss", "boss", "locked")],
    }, { rootDir });
    const observed = recordCanonicalNodeCompletion({
      childId: "reina", homeworkId: "hw-runtime", sessionId: "session", nodeId: "quest",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "fresh-quest-item", correct: true }] },
    }, { rootDir });

    expect(observed && questBossEvidenceEligibility(observed)).toMatchObject({
      eligible: true,
      qualifyingObservationCount: 1,
    });
  });

  it("gives the Planner a concrete decision envelope instead of an unconstrained empty object", async () => {
    const rootDir = root();
    fs.mkdirSync(path.join(rootDir, "src", "context", "reina"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "src", "context", "reina", "child_profile.json"), JSON.stringify({
      childId: "reina",
      identity: { displayName: "Reina", ttsName: "Reina" },
      links: { learningProfile: "learning_profile.json" },
    }));
    fs.writeFileSync(path.join(rootDir, "src", "context", "reina", "learning_profile.json"), JSON.stringify({
      childId: "reina",
      rewardPreferences: { preferred: ["novel visual discovery"] },
      activityTraitModel: { puzzle: { weight: 6, confidence: 0.84 } },
    }));
    createLearningCycle({ ...input(), nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")] }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "facts", result: { completed: true, accuracy: 1, timeSpent_ms: 1000 } }, { rootDir });
    finalizeSession(rootDir, "facts", "modal:envelope:facts");
    let request: Record<string, unknown> | undefined;
    const client = {
      messages: {
        create: async (payload: Record<string, unknown>) => {
          request = payload;
          return {
            content: [{
              type: "tool_use",
              name: "decide_learning_cycle_progression",
              input: {
                status: "supported",
                reason: "Practice evidence supports an unseen transfer test.",
                progressionAction: "generate_quest",
                preserve: ["clear visual grouping"],
                change: [],
                testNext: ["unseen transfer"],
                nextEvidenceRequired: ["Quest scorecard"],
                nextInstrument: {
                  nodeId: "quest",
                  title: "Quest",
                  academicTarget: "unseen multiplication transfer",
                  mechanic: "AI-selected transfer experience",
                  theme: "AI-selected world",
                  openingPurpose: "Apply multiplication in a new situation.",
                  creatorPrompt: "Create an ambitious unseen-transfer Quest.",
                },
              },
            }],
          };
        },
      },
    };

    await advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      client: client as never,
    }, { rootDir });

    const inputSchema = ((request?.tools as Array<{ input_schema: { required?: string[] } }>)[0]?.input_schema);
    const prompt = String((request?.messages as Array<{ content?: unknown }>)[0]?.content ?? "");
    expect(prompt).toContain("Child chart context");
    expect(prompt).toContain('"sessionFinalizations"');
    expect(prompt).toContain("modal:envelope:facts");
    expect(prompt).not.toContain("novel visual discovery");
    expect(prompt).not.toContain("activityTraitModel");
    expect(inputSchema.required).toEqual(expect.arrayContaining([
      "status",
      "reason",
      "progressionAction",
      "preserve",
      "change",
      "testNext",
      "nextEvidenceRequired",
    ]));
    expect(inputSchema.required).toEqual(expect.arrayContaining([
      "nextNodeId",
      "nextAcademicTarget",
      "nextMechanic",
      "nextCreatorPrompt",
    ]));
  });

  it("excludes stored directives and synthetic QA records from the Quest Planner prompt", async () => {
    const rootDir = root();
    fs.mkdirSync(path.join(rootDir, "src", "context", "reina"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "src", "context", "reina", "child_profile.json"), JSON.stringify({
      childId: "reina",
      identity: { displayName: "Reina", ttsName: "Reina" },
      links: { learningProfile: "learning_profile.json" },
    }));
    fs.writeFileSync(path.join(rootDir, "src", "context", "reina", "learning_profile.json"), JSON.stringify({
      childId: "reina",
      rewardPreferences: { preferred: ["visible progress"] },
      activityTraitModel: {},
    }));
    fs.writeFileSync(path.join(rootDir, "src", "context", "reina", "engagement_theory.json"), JSON.stringify({
      theoryId: "engagement-1",
      hypothesis: "Generated interpretation that must not become policy.",
      dimensions: {
        competition: {
          dimension: "competition",
          positiveWeight: 0,
          negativeWeight: 0.25,
          mixedWeight: 0,
          evidenceCount: 1,
          confidence: 0.25,
          lastUpdated: "2026-07-12T18:48:55.239Z",
        },
      },
      preferredDimensions: [],
      avoidedDimensions: ["competition"],
      promptDirectives: {
        prefer: [],
        avoid: ["Avoid high-pressure competition presentation unless explicitly tested."],
        vary: [],
        holdConstant: [],
      },
      evidence: [{
        id: "choice-one",
        kind: "choice",
        summary: "One competitive route was skipped.",
        createdAt: "2026-07-12T18:48:55.239Z",
      }],
    }));
    createLearningCycle({
      ...input(),
      engagementTheory: JSON.parse(fs.readFileSync(
        path.join(rootDir, "src", "context", "reina", "engagement_theory.json"),
        "utf8",
      )),
      nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")],
    }, { rootDir });
    recordCanonicalNodeCompletion({
      childId: "reina",
      homeworkId: "hw-runtime",
      sessionId: "s1",
      nodeId: "facts",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1000 },
    }, { rootDir });
    finalizeSession(rootDir, "facts", "modal:prompt-filter:facts");
    const cycleFile = path.join(rootDir, "src", "context", "reina", "homework", "cycles", "hw-runtime.json");
    const stored = JSON.parse(fs.readFileSync(cycleFile, "utf8"));
    stored.evidence.engagement.push({
      evidenceId: "synthetic-quest-preview:completion:engagement",
      summary: "Synthetic browser completed the activity.",
    });
    fs.writeFileSync(cycleFile, JSON.stringify(stored));

    let request: Record<string, unknown> | undefined;
    await advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      client: {
        messages: {
          create: async (payload: Record<string, unknown>) => {
            request = payload;
            return {
              content: [{
                type: "tool_use",
                name: "decide_learning_cycle_progression",
                input: {
                  status: "supported",
                  reason: "Real practice evidence supports transfer testing.",
                  progressionAction: "generate_quest",
                  preserve: [],
                  change: [],
                  testNext: ["unseen transfer"],
                  nextEvidenceRequired: ["Quest scorecard"],
                  nextNodeId: "quest",
                  nextTitle: "Quest",
                  nextAcademicTarget: "unseen multiplication transfer",
                  nextMechanic: "AI-selected transfer experience",
                  nextTheme: "AI-selected world",
                  nextOpeningPurpose: "Apply multiplication in a new situation.",
                  nextCreatorPrompt: "Create an unseen-transfer Quest.",
                },
              }],
            };
          },
        },
      } as never,
    }, { rootDir });

    const prompt = String((request?.messages as Array<{ content?: unknown }>)[0]?.content ?? "");
    // One observation at confidence 0.25 is withheld: shown to the Planner it
    // became "(avoid competition/control pressure per her chart)" and stripped
    // the stakes out of the generated Quest.
    expect(prompt).not.toContain('"dimension": "competition"');
    expect(prompt).not.toContain('"negativeWeight": 0.25');
    expect(prompt).toContain('"unmeasuredDimensions"');
    expect(prompt).toContain("not a prohibition");
    expect(prompt).toContain("choice-one");
    expect(prompt).not.toContain("promptDirectives");
    expect(prompt).not.toContain("avoidedDimensions");
    expect(prompt).not.toContain("Avoid high-pressure");
    expect(prompt).not.toContain("synthetic-quest-preview");
    expect(prompt).not.toContain("Synthetic browser completed");
    expect(prompt).not.toContain("activityTraitModel");
    expect(prompt).not.toContain("activityModel");
  });

  it("uses Quest evidence for a Boss decision and Boss evidence only to await calibration", async () => {
    const rootDir = root();
    createLearningCycle({ ...input(), nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")] }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "facts", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "2x5", correct: true }] } }, { rootDir });
    finalizeSession(rootDir, "facts", "modal:full-loop:facts");
    const questGenerating = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide: async () => ({ status: "supported", reason: "Test transfer.", progressionAction: "generate_quest", preserve: [], change: [], testNext: ["transfer"], nextEvidenceRequired: ["Quest"] }) }, { rootDir });
    transitionLearningCycle("reina", "hw-runtime", questGenerating.revision, { type: "artifact_bound", nodeId: "quest", artifact: { contentId: "quest", artifactId: "quest", localArtifactPath: "/games/quest.html", localArtworkPath: "/generated/quest.png", contractFingerprint: "quest", validationStatus: "passed" } }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s2", nodeId: "quest", result: { completed: true, accuracy: 0.9, timeSpent_ms: 1000, targetResults: [{ target: "transfer-1", correct: true }] } }, { rootDir });
    finalizeSession(rootDir, "quest", "modal:full-loop:quest");
    const bossGenerating = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide: async () => ({ status: "supported", reason: "Transfer held on unseen material.", progressionAction: "generate_boss", preserve: [], change: [], testNext: ["synthesis"], nextEvidenceRequired: ["Boss"] }) }, { rootDir });
    expect(bossGenerating.lifecycle).toBe("boss_generating");

    transitionLearningCycle("reina", "hw-runtime", bossGenerating.revision, { type: "artifact_bound", nodeId: "boss", artifact: { contentId: "boss", artifactId: "boss", localArtifactPath: "/games/boss.html", localArtworkPath: "/generated/boss.png", contractFingerprint: "boss", validationStatus: "passed" } }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s3", nodeId: "boss", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "synthesis-1", correct: true }] } }, { rootDir });
    finalizeSession(rootDir, "boss", "modal:full-loop:boss");
    const awaiting = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide: async () => ({ status: "awaiting_calibration", reason: "In-app synthesis is provisional.", progressionAction: "await_calibration", preserve: [], change: [], testNext: [], nextEvidenceRequired: ["returned graded work"] }) }, { rootDir });
    expect(awaiting.lifecycle).toBe("awaiting_calibration");
    expect(awaiting.decisionHistory.at(-1)?.readinessAssessment).toMatchObject({
      status: "predicted_ready",
      scope: { homeworkId: "hw-runtime" },
      evidenceIds: expect.any(Array),
      uncertainty: expect.stringMatching(/returned|external|calibrat/i),
    });
  });

  it("refuses Boss when every unseen unassisted Quest response is incorrect", async () => {
    const rootDir = root();
    writeChildChartFixture(rootDir);
    await reachQuestEvaluation({ rootDir, questCorrect: false });

    await expect(advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      decide: async () => ({
        status: "revised",
        reason: "Quest transfer was not correct.",
        progressionAction: "generate_boss",
        preserve: [],
        change: ["target the unresolved transfer"],
        testNext: ["fresh transfer"],
        nextEvidenceRequired: ["correct independent Quest evidence"],
      }),
    }, { rootDir })).rejects.toThrow(/canonical_progression_boss_requires_(eligible|unseen)_quest_evidence/);

    let request: Record<string, unknown> | undefined;
    await advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      client: {
        messages: {
          create: async (payload: Record<string, unknown>) => {
            request = payload;
            return {
              content: [{
                type: "tool_use",
                name: "decide_learning_cycle_progression",
                input: {
                  status: "revised",
                  reason: "Collect more independent transfer evidence.",
                  progressionAction: "generate_support",
                  preserve: [],
                  change: ["reteach transfer"],
                  testNext: ["fresh transfer"],
                  nextEvidenceRequired: ["correct independent Quest evidence"],
                  nextNodeId: "support-after-quest",
                  nextTitle: "Transfer Workshop",
                  nextAcademicTarget: "multiplication transfer",
                  nextMechanic: "AI-selected support experience",
                  nextTheme: "AI-selected world",
                  nextOpeningPurpose: "Practice the unresolved transfer.",
                  nextCreatorPrompt: "Create the targeted support experience.",
                },
              }],
            };
          },
        },
      } as never,
    }, { rootDir });
    const allowedActions = ((request?.tools as Array<{
      input_schema: { properties: { progressionAction: { enum: string[] } } };
    }>)[0]?.input_schema.properties.progressionAction.enum) ?? [];
    expect(allowedActions).not.toContain("generate_boss");
  });

  it("refuses Boss when the only correct Quest response used assistance", async () => {
    const rootDir = root();
    await reachQuestEvaluation({ rootDir, questCorrect: true, scaffoldLevel: 1 });

    await expect(advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      decide: async () => ({
        status: "inconclusive",
        reason: "Correct work required a scaffold.",
        progressionAction: "generate_boss",
        preserve: ["successful scaffold"],
        change: [],
        testNext: ["unassisted transfer"],
        nextEvidenceRequired: ["unassisted Quest evidence"],
      }),
    }, { rootDir })).rejects.toThrow(/canonical_progression_boss_requires_(eligible|unseen)_quest_evidence/);
  });

  it("refuses Boss when the correct Quest item was already exposed in baseline", async () => {
    const rootDir = root();
    await reachQuestEvaluation({ rootDir, questTarget: "baseline-item", questCorrect: true });

    await expect(advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      decide: async () => ({
        status: "inconclusive",
        reason: "The correct item was already practiced.",
        progressionAction: "generate_boss",
        preserve: [],
        change: [],
        testNext: ["unseen transfer"],
        nextEvidenceRequired: ["unseen Quest evidence"],
      }),
    }, { rootDir })).rejects.toThrow(/canonical_progression_boss_requires_(eligible|unseen)_quest_evidence/);
  });

  it("offers Boss to the Planner only after fresh correct unassisted Quest evidence and never transitions automatically", async () => {
    const rootDir = root();
    writeChildChartFixture(rootDir);
    await reachQuestEvaluation({ rootDir, questCorrect: true });
    const beforeDecision = getLearningCycle("reina", "hw-runtime", { rootDir });
    expect(beforeDecision?.lifecycle).toBe("quest_evaluating");
    expect(beforeDecision?.nodes.find((item) => item.role === "boss")?.state).toBe("locked");

    let request: Record<string, unknown> | undefined;
    await advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      client: {
        messages: {
          create: async (payload: Record<string, unknown>) => {
            request = payload;
            return {
              content: [{
                type: "tool_use",
                name: "decide_learning_cycle_progression",
                input: {
                  status: "revised",
                  reason: "Use a targeted support chapter before synthesis.",
                  progressionAction: "generate_support",
                  preserve: ["independent transfer"],
                  change: ["strengthen explanation"],
                  testNext: ["fresh transfer"],
                  nextEvidenceRequired: ["another independent observation"],
                  nextNodeId: "support-after-quest",
                  nextTitle: "Transfer Workshop",
                  nextAcademicTarget: "explain multiplication transfer",
                  nextMechanic: "AI-selected support experience",
                  nextTheme: "AI-selected world",
                  nextOpeningPurpose: "Explain a fresh transfer situation.",
                  nextCreatorPrompt: "Create the targeted support experience.",
                },
              }],
            };
          },
        },
      } as never,
    }, { rootDir });

    const allowedActions = ((request?.tools as Array<{
      input_schema: { properties: { progressionAction: { enum: string[] } } };
    }>)[0]?.input_schema.properties.progressionAction.enum) ?? [];
    expect(allowedActions).toContain("generate_boss");
  });

  it("lets the Boss lifecycle resolve a contradictory second-Boss action when the Planner already chose awaiting calibration", async () => {
    const rootDir = root();
    createLearningCycle({ ...input(), nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")] }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "facts", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "2x5", correct: true }] } }, { rootDir });
    finalizeSession(rootDir, "facts", "modal:boss-normalize:facts");
    const questGenerating = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide: async () => ({ status: "supported", reason: "Test transfer.", progressionAction: "generate_quest", preserve: [], change: [], testNext: ["transfer"], nextEvidenceRequired: ["Quest"] }) }, { rootDir });
    transitionLearningCycle("reina", "hw-runtime", questGenerating.revision, { type: "artifact_bound", nodeId: "quest", artifact: { contentId: "quest", artifactId: "quest", localArtifactPath: "/games/quest.html", localArtworkPath: "/generated/quest.png", contractFingerprint: "quest", validationStatus: "passed" } }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s2", nodeId: "quest", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "unseen-transfer", correct: true }] } }, { rootDir });
    finalizeSession(rootDir, "quest", "modal:boss-normalize:quest");
    const bossGenerating = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide: async () => ({ status: "supported", reason: "Transfer held.", progressionAction: "generate_boss", preserve: [], change: [], testNext: ["synthesis"], nextEvidenceRequired: ["Boss"] }) }, { rootDir });
    transitionLearningCycle("reina", "hw-runtime", bossGenerating.revision, { type: "artifact_bound", nodeId: "boss", artifact: { contentId: "boss", artifactId: "boss", localArtifactPath: "/games/boss.html", localArtworkPath: "/generated/boss.png", contractFingerprint: "boss", validationStatus: "passed" } }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s3", nodeId: "boss", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "unseen-synthesis", correct: true }] } }, { rootDir });
    finalizeSession(rootDir, "boss", "modal:boss-normalize:boss");

    const awaiting = await advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      decide: async () => ({
        status: "awaiting_calibration",
        reason: "Boss evidence is strong but external calibration is still required.",
        progressionAction: "generate_boss",
        preserve: [],
        change: [],
        testNext: [],
        nextEvidenceRequired: ["returned graded work"],
        nextNodeId: "boss-2",
      }),
    }, { rootDir });

    expect(awaiting.lifecycle).toBe("awaiting_calibration");
    expect(awaiting.nodes.filter((item) => item.role === "boss")).toHaveLength(1);
    expect(awaiting.decisionHistory.at(-1)?.nextAction).toBe("await_calibration");
  });

  it("downgrades a repeated Quest item to practice and refuses to use it to authorize Boss", async () => {
    const rootDir = root();
    createLearningCycle({ ...input(), nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")] }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "facts", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "same-item", correct: true }] } }, { rootDir });
    finalizeSession(rootDir, "facts", "modal:repeat:facts");
    const questGenerating = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide: async () => ({ status: "supported", reason: "Test transfer.", progressionAction: "generate_quest", preserve: [], change: [], testNext: ["transfer"], nextEvidenceRequired: ["Quest"] }) }, { rootDir });
    transitionLearningCycle("reina", "hw-runtime", questGenerating.revision, { type: "artifact_bound", nodeId: "quest", artifact: { contentId: "quest", artifactId: "quest", localArtifactPath: "/games/quest.html", localArtworkPath: "/generated/quest.png", contractFingerprint: "quest", validationStatus: "passed" } }, { rootDir });
    const observed = recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s2", nodeId: "quest", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "same-item", correct: true }] } }, { rootDir });
    finalizeSession(rootDir, "quest", "modal:repeat:quest");

    expect(observed?.observations.find((item) => item.sourceId === "activity:s2:quest")).toMatchObject({
      exposure: "previously_practiced",
      provenance: "practice",
      confounds: expect.arrayContaining(["item_previously_exposed"]),
    });
    await expect(advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      decide: async () => ({ status: "supported", reason: "Repeated item was correct.", progressionAction: "generate_boss", preserve: [], change: [], testNext: ["synthesis"], nextEvidenceRequired: ["Boss"] }),
    }, { rootDir })).rejects.toThrow("canonical_progression_boss_requires_eligible_quest_evidence");
  });

  it("is idempotent for a repeated completion evidence id", () => {
    const rootDir = root();
    createLearningCycle({ ...input(), nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")] }, { rootDir });
    const payload = { childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "facts", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [] } };
    const first = recordCanonicalNodeCompletion(payload, { rootDir });
    const repeated = recordCanonicalNodeCompletion(payload, { rootDir });
    expect(repeated?.revision).toBe(first?.revision);
    expect(repeated?.decisionHistory).toHaveLength(first?.decisionHistory.length ?? 0);
  });
});
