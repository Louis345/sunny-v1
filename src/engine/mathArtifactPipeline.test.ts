import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assignBaselineBuilderModels,
  assertDesignArtifactAcademicContract,
  buildDirectActivityCreatorPrompt,
  buildDirectLearningCycleInput,
  mathAcademicContractHash,
  type ExperienceDesignArtifactV1,
  type MathPlannedActivity,
} from "./directMathExperience";

function activity(id: string): MathPlannedActivity {
  return {
    id,
    routeId: "route-a",
    responsibilityId: `responsibility-${id}`,
    academicTarget: "Represent multiplication as equal groups",
    difficultyBoundary: {
      allowedConcepts: ["equal groups"],
      allowedRepresentations: ["arrays"],
      excludedExtensions: ["division"],
      startingSupport: "worked visual example",
      expectedIndependence: "construct an array without a hint",
    },
    items: [{
      id: `${id}-item`,
      prompt: "Build 3 equal groups of 4.",
      lineage: { sourceEvidenceIds: ["assignment:test"], exposure: "unseen" },
      response: {
        mode: "construction",
        expectedState: { groups: 3, perGroup: 4 },
        successDescription: "Three groups contain four objects each.",
      },
    }],
    academicPrediction: {
      constructId: "math.multiplication.equal_groups",
      context: "independent array construction",
      horizon: "next delayed probe",
      expectedMetric: { key: "academic.accuracy", min: 0.6, max: 0.9 },
      predictedErrorPatterns: ["unequal group sizes"],
      confidence: 0.65,
      evidenceIds: ["assignment:test"],
      intervention: "guided equal-group construction",
      evidenceLimit: "practice_only",
    },
    measurementKeys: ["academic.accuracy", "interaction.invalidActionCount"],
    catalogDecision: { action: "generate_new", reason: "No matching validated artifact." },
  };
}

function artifact(node: MathPlannedActivity): ExperienceDesignArtifactV1 {
  return {
    artifactId: `artifact-${node.id}`,
    nodeId: node.id,
    academicContractHash: mathAcademicContractHash(node),
    title: "Array Relay",
    audienceRationale: "Factual child context supports a visual, active presentation.",
    openingPromise: "Power the relay by building arrays.",
    firstThreeSeconds: "A clear empty array and one pulsing action are visible.",
    firstAction: "Place the first group.",
    interactionDemonstration: "A replayable hand demonstrates one placement.",
    coreInteraction: "Construct equal groups.",
    mathAsPower: "Correct arrays power the relay.",
    stakes: "The relay pauses when a group is uneven.",
    consequences: "An uneven group visibly loses power.",
    recovery: "The mismatched group is highlighted for correction.",
    progression: ["guided group", "independent array"],
    interactionContinuity: "The same placement language persists.",
    worldReaction: "The relay advances after valid construction.",
    payoff: "The completed array launches the relay.",
    replayVariation: "New factors produce new layouts.",
    visualDirection: "Bright readable track with large manipulatives.",
    motionDirection: "Short movement tied to each placement.",
    soundDirection: "Distinct placement, recovery, progress, and completion sounds.",
    usefulLibraries: [],
    engagementPrediction: "The child will begin within ten seconds and complete without abandonment.",
    falsifyingEvidence: "Long time to first action or repeated invalid placements.",
  };
}

describe("math artifact production boundary", () => {
  it("lets Fable use its supported default adaptive reasoning mode", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    const designer = source.slice(
      source.indexOf("export async function askMathExperienceDesigner"),
      source.indexOf("export async function askDirectMathPlanner"),
    );
    expect(designer).not.toContain('thinking: { type: "disabled" }');
  });

  it("balances Opus and GPT-5.5 and rotates the starting model by assignment", () => {
    const nodes = ["a", "b", "c", "d"].map(activity);
    const first = assignBaselineBuilderModels("assignment-0", nodes);
    const second = assignBaselineBuilderModels("assignment-1", nodes);

    expect(first.map((entry) => entry.model)).toEqual([
      "claude-opus-5",
      "gpt-5.5",
      "claude-opus-5",
      "gpt-5.5",
    ]);
    expect(second.map((entry) => entry.model)).toEqual([
      "gpt-5.5",
      "claude-opus-5",
      "gpt-5.5",
      "claude-opus-5",
    ]);
  });

  it("rejects a design artifact that changes the immutable academic contract", () => {
    const node = activity("node-1");
    const changed = { ...artifact(node), academicContractHash: "changed" };

    expect(() => assertDesignArtifactAcademicContract(node, changed)).toThrow(
      "math_design_artifact_academic_contract_changed:node-1",
    );
  });

  it("accepts variable activity and item counts without supplying pedagogy", () => {
    for (const count of [2, 4, 7]) {
      const nodes = Array.from({ length: count }, (_, index) => activity(`node-${index}`));
      expect(assignBaselineBuilderModels(`assignment-${count}`, nodes)).toHaveLength(count);
      expect(nodes.every((node) => node.items.length === 1)).toBe(true);
    }
  });

  it("gives both builder providers the same immutable implementation prompt", () => {
    const node = activity("node-1");
    const designed = {
      ...node,
      title: artifact(node).title,
      learningPurpose: "Connect equal groups to multiplication.",
      mechanic: artifact(node).coreInteraction,
      engagementVariable: "unknown until real play",
      visualMock: {
        scene: artifact(node).visualDirection,
        layout: artifact(node).firstThreeSeconds,
        artworkPrompt: artifact(node).visualDirection,
      },
      experience: {
        objective: artifact(node).openingPromise,
        childAction: artifact(node).firstAction,
        worldReaction: artifact(node).worldReaction,
        anticipation: artifact(node).stakes,
        progress: artifact(node).progression.join(" → "),
        recovery: artifact(node).recovery,
        reward: artifact(node).payoff,
      },
      acceptanceSteps: [],
      creatorPrompt: artifact(node).openingPromise,
      designPrediction: artifact(node).engagementPrediction,
      preserve: [],
      change: [],
      explore: [],
      avoid: [],
      designArtifact: artifact(node),
    };

    const opusPrompt = buildDirectActivityCreatorPrompt({
      activity: designed,
      artworkUrl: "/generated/board.jpeg",
      childId: "reina",
    });
    const gptPrompt = buildDirectActivityCreatorPrompt({
      activity: designed,
      artworkUrl: "/generated/board.jpeg",
      childId: "reina",
    });

    expect(opusPrompt).toBe(gptPrompt);
    expect(opusPrompt).toContain(mathAcademicContractHash(node));
  });

  it("carries model and artifact provenance into the canonical cycle", () => {
    const legacyPlan = {
      planId: "plan-1",
      title: "Array Relay",
      contentScopeRationale: "One grounded instrument.",
      concept: {
        conceptId: "math.multiplication.equal_groups",
        name: "Equal groups",
        statement: "Equal groups can be represented with multiplication.",
        instanceScope: "Grade-level factors",
        prerequisites: ["counting"],
        assumptions: ["The child can count equal groups."],
      },
      academicTheory: "Array construction will connect groups to notation.",
      profileEvidence: ["chart:reina"],
      boardWorld: { title: "Relay", narrative: "Power the relay.", backgroundPrompt: "Bright relay world" },
      learningResponsibilities: [{
        id: "responsibility-node-1",
        title: "Equal groups",
        purpose: "Connect equal groups to notation.",
        academicTarget: "Represent multiplication as equal groups",
      }],
      fork: {
        question: "Which route?",
        hypothesis: "Observe two routes.",
        heldConstant: ["academic scope"],
        routes: [
          { id: "route-a", label: "Build", promise: "Build arrays", engagementVariable: "construction", nodeIds: ["node-1"] },
          { id: "route-b", label: "Reason", promise: "Reason with arrays", engagementVariable: "reasoning", nodeIds: ["node-2"] },
        ],
      },
      activities: [] as any[],
      quest: { title: "Quest" as const, locked: true as const, teaser: "Locked", artworkPrompt: "Quest portal" },
      boss: { title: "Boss" as const, locked: true as const, teaser: "Locked", artworkPrompt: "Boss portal" },
    };
    const nodes = [activity("node-1"), { ...activity("node-2"), routeId: "route-b", responsibilityId: "responsibility-node-1" }];
    legacyPlan.activities = nodes.map((node) => {
      const design = artifact(node);
      return {
        ...node,
        title: design.title,
        learningPurpose: "Connect equal groups to notation.",
        mechanic: design.coreInteraction,
        engagementVariable: node.routeId === "route-a" ? "construction" : "reasoning",
        visualMock: { scene: design.visualDirection, layout: design.firstThreeSeconds, artworkPrompt: design.visualDirection },
        experience: {
          objective: design.openingPromise,
          childAction: design.firstAction,
          worldReaction: design.worldReaction,
          anticipation: design.stakes,
          progress: design.progression.join(" → "),
          recovery: design.recovery,
          reward: design.payoff,
        },
        acceptanceSteps: [],
        creatorPrompt: design.openingPromise,
        designPrediction: design.engagementPrediction,
        preserve: [],
        change: [],
        explore: [],
        avoid: [],
        designArtifact: design,
      };
    });
    const artifacts = legacyPlan.activities.map((node) => ({
      childId: "reina",
      homeworkId: "hw-new",
      nodeId: node.id,
      title: node.title,
      htmlPath: `/tmp/${node.id}.html`,
      artworkUrl: "/generated/board.jpeg",
      creatorPrompt: node.creatorPrompt,
      promptHash: `prompt-${node.id}`,
      plannerModel: "claude-opus-5",
      creatorModel: node.id === "node-1" ? "claude-opus-5" : "gpt-5.5",
      architectModel: "claude-fable-5",
      builderProvider: node.id === "node-1" ? "anthropic" as const : "openai" as const,
      builderModel: node.id === "node-1" ? "claude-opus-5" : "gpt-5.5",
      academicContractHash: node.designArtifact.academicContractHash,
      designArtifactHash: `design-${node.id}`,
      htmlHash: `html-${node.id}`,
      externalLibraryUrls: [],
      generationElapsedMs: 100,
      inputTokens: 10,
      outputTokens: 20,
    }));
    const nodePlan = legacyPlan.activities.map((node) => ({
      id: node.id,
      type: "generated-baseline",
      title: node.title,
      label: node.title,
      gameHtmlPath: `/tmp/${node.id}.html`,
      date: "hw-new",
    }));
    const cycle = buildDirectLearningCycleInput({
      childId: "reina",
      homeworkId: "hw-new",
      extraction: { fileHash: "new-fingerprint", fullText: "New assignment", filename: "new.pdf" } as never,
      plannerPlan: legacyPlan,
      activeSessionPlan: { nodePlan } as never,
      artifacts,
    });

    expect(cycle.nodes[0]?.artifactBinding?.creativeProvenance).toMatchObject({
      plannerModel: "claude-opus-5",
      architectModel: "claude-fable-5",
      builderProvider: "anthropic",
      builderModel: "claude-opus-5",
      generatedHtmlHash: "html-node-1",
    });
    expect(cycle.nodes.find((node) => node.role === "quest")?.state).toBe("locked");
    expect(cycle.nodes.find((node) => node.role === "boss")?.state).toBe("locked");
  });
});
