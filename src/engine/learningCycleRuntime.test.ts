import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { createLearningCycle, getLearningCycle, transitionLearningCycle, type CreateLearningCycleInput } from "./learningCycleRepository";
import { advanceCanonicalCycleFromEvidence, parseCanonicalProgressionDecision, recordCanonicalNodeCompletion } from "./learningCycleRuntime";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-cycle-runtime-"));
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
    createLearningCycle(input(), { rootDir });
    const first = recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "facts", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "2x5", correct: true }], companionInteractions: ["Asked Elli to repeat the directions."] } }, { rootDir });
    expect(first?.lifecycle).toBe("baseline_active");
    expect(first?.nodes.find((item) => item.nodeId === "quest")?.generationPrompt).toBeNull();

    const second = recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "story", result: { completed: true, accuracy: 0.8, timeSpent_ms: 1800, targetResults: [{ target: "groups", correct: true }] } }, { rootDir });
    expect(second?.lifecycle).toBe("baseline_evaluating");
    expect(second?.observations).toHaveLength(2);
    expect(second?.decisionHistory.filter((item) => item.eventType === "theory_decided")).toHaveLength(0);

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
  });

  it("lets the Planner prescribe one harder support instrument instead of Quest", async () => {
    const rootDir = root();
    createLearningCycle({ ...input(), nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")] }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "facts", result: { completed: true, accuracy: 0.4, timeSpent_ms: 1000, targetResults: [{ target: "2x5", correct: false }] } }, { rootDir });

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
    const questGenerating = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide: async () => ({ status: "supported", reason: "Test transfer.", progressionAction: "generate_quest", preserve: [], change: [], testNext: ["transfer"], nextEvidenceRequired: ["Quest"] }) }, { rootDir });
    transitionLearningCycle("reina", "hw-runtime", questGenerating.revision, { type: "artifact_bound", nodeId: "quest", artifact: { contentId: "quest", artifactId: "quest", localArtifactPath: "/games/quest.html", localArtworkPath: "/generated/quest.png", contractFingerprint: "quest", validationStatus: "passed" } }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s2", nodeId: "quest", result: { completed: true, accuracy: 0.9, timeSpent_ms: 1000, targetResults: [{ target: "transfer-1", correct: true }] } }, { rootDir });
    const bossGenerating = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide: async () => ({ status: "supported", reason: "Transfer held on unseen material.", progressionAction: "generate_boss", preserve: [], change: [], testNext: ["synthesis"], nextEvidenceRequired: ["Boss"] }) }, { rootDir });
    expect(bossGenerating.lifecycle).toBe("boss_generating");

    transitionLearningCycle("reina", "hw-runtime", bossGenerating.revision, { type: "artifact_bound", nodeId: "boss", artifact: { contentId: "boss", artifactId: "boss", localArtifactPath: "/games/boss.html", localArtworkPath: "/generated/boss.png", contractFingerprint: "boss", validationStatus: "passed" } }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s3", nodeId: "boss", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "synthesis-1", correct: true }] } }, { rootDir });
    const awaiting = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide: async () => ({ status: "awaiting_calibration", reason: "In-app synthesis is provisional.", progressionAction: "await_calibration", preserve: [], change: [], testNext: [], nextEvidenceRequired: ["returned graded work"] }) }, { rootDir });
    expect(awaiting.lifecycle).toBe("awaiting_calibration");
  });

  it("lets the Boss lifecycle resolve a contradictory second-Boss action when the Planner already chose awaiting calibration", async () => {
    const rootDir = root();
    createLearningCycle({ ...input(), nodes: [node("facts", "baseline"), node("quest", "quest", "locked"), node("boss", "boss", "locked")] }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s1", nodeId: "facts", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "2x5", correct: true }] } }, { rootDir });
    const questGenerating = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide: async () => ({ status: "supported", reason: "Test transfer.", progressionAction: "generate_quest", preserve: [], change: [], testNext: ["transfer"], nextEvidenceRequired: ["Quest"] }) }, { rootDir });
    transitionLearningCycle("reina", "hw-runtime", questGenerating.revision, { type: "artifact_bound", nodeId: "quest", artifact: { contentId: "quest", artifactId: "quest", localArtifactPath: "/games/quest.html", localArtworkPath: "/generated/quest.png", contractFingerprint: "quest", validationStatus: "passed" } }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s2", nodeId: "quest", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "unseen-transfer", correct: true }] } }, { rootDir });
    const bossGenerating = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide: async () => ({ status: "supported", reason: "Transfer held.", progressionAction: "generate_boss", preserve: [], change: [], testNext: ["synthesis"], nextEvidenceRequired: ["Boss"] }) }, { rootDir });
    transitionLearningCycle("reina", "hw-runtime", bossGenerating.revision, { type: "artifact_bound", nodeId: "boss", artifact: { contentId: "boss", artifactId: "boss", localArtifactPath: "/games/boss.html", localArtworkPath: "/generated/boss.png", contractFingerprint: "boss", validationStatus: "passed" } }, { rootDir });
    recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s3", nodeId: "boss", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "unseen-synthesis", correct: true }] } }, { rootDir });

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
    const questGenerating = await advanceCanonicalCycleFromEvidence({ childId: "reina", homeworkId: "hw-runtime", decide: async () => ({ status: "supported", reason: "Test transfer.", progressionAction: "generate_quest", preserve: [], change: [], testNext: ["transfer"], nextEvidenceRequired: ["Quest"] }) }, { rootDir });
    transitionLearningCycle("reina", "hw-runtime", questGenerating.revision, { type: "artifact_bound", nodeId: "quest", artifact: { contentId: "quest", artifactId: "quest", localArtifactPath: "/games/quest.html", localArtworkPath: "/generated/quest.png", contractFingerprint: "quest", validationStatus: "passed" } }, { rootDir });
    const observed = recordCanonicalNodeCompletion({ childId: "reina", homeworkId: "hw-runtime", sessionId: "s2", nodeId: "quest", result: { completed: true, accuracy: 1, timeSpent_ms: 1000, targetResults: [{ target: "same-item", correct: true }] } }, { rootDir });

    expect(observed?.observations.find((item) => item.sourceId === "activity:s2:quest")).toMatchObject({
      exposure: "previously_practiced",
      provenance: "practice",
      confounds: expect.arrayContaining(["item_previously_exposed"]),
    });
    await expect(advanceCanonicalCycleFromEvidence({
      childId: "reina",
      homeworkId: "hw-runtime",
      decide: async () => ({ status: "supported", reason: "Repeated item was correct.", progressionAction: "generate_boss", preserve: [], change: [], testNext: ["synthesis"], nextEvidenceRequired: ["Boss"] }),
    }, { rootDir })).rejects.toThrow("canonical_progression_boss_requires_unseen_quest_evidence");
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
