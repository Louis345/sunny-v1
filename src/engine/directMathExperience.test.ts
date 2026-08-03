import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  MATH_LEARNING_PROGRAM_TOOL_SCHEMA,
  askMathExperienceDesigner,
  askDirectMathPlanner,
  boardPosition,
  buildDirectActiveSessionPlan,
  buildDirectActivityCreatorPrompt,
  buildAdaptiveProgressionCreatorPrompt,
  buildMathCreativeChildContext,
  buildDirectLearningCycleInput,
  creatorPromptHash,
  generateAdaptiveProgressionActivityHtml,
  hasReadyDirectMathExperience,
  isCompleteGeneratedHtml,
  parseDirectLearningExperiencePlan,
  parseMathLearningProgram,
  routeNodePosition,
  shouldReuseDirectArtifact,
  normalizeGeneratedHtml,
  mathAcademicContractHash,
  readOpenAiResponseStream,
} from "./directMathExperience";

/** The Planner streams because a complete academic program can be large. */
function streamOf(create: (...args: never[]) => unknown) {
  return (...args: never[]) => ({ finalMessage: async () => create(...args) });
}

function plan(activityCount = 3): any {
  const activities = Array.from({ length: activityCount }, (_, index) => ({
    id: `activity-${index + 1}`,
    title: `Adventure ${index + 1}`,
    routeId: index % 2 === 0 ? "route-a" : "route-b",
    academicTarget: "multiplication",
    mechanic: `mechanic-${index + 1}`,
    engagementVariable: index % 2 === 0 ? "strategy" : "visual",
    responsibilityId: "equal-groups",
    visualMock: { scene: "A vivid interactive world", layout: "Clear play area", artworkPrompt: "Vibrant child-safe game icon" },
    experience: {
      objective: "Practice multiplication",
      childAction: "Manipulate the world",
      worldReaction: "The world visibly transforms",
      anticipation: "A mystery is gradually revealed",
      progress: "The scene grows",
      recovery: "A clue appears without revealing the answer",
      reward: "A finale animation appears",
    },
    items: [{
      id: "q1",
      prompt: "5 x 2 = ?",
      lineage: { sourceEvidenceIds: ["assignment:q1"], exposure: "unseen" },
      response: { mode: "selection", options: [{ id: "ten", label: "10", correct: true }, { id: "fifteen", label: "15", correct: false }] },
    }],
    acceptanceSteps: ["launch", "answer incorrectly", "recover", "answer correctly", "complete"],
    creatorPrompt: `Create a distinct ${index % 2 === 0 ? "strategy" : "visual"} multiplication experience.`,
    designPrediction: "The child will understand the first action without adult help.",
    academicPrediction: {
      constructId: "math.multiplication.equal_groups",
      context: "unassisted returned schoolwork",
      horizon: "within_7_days",
      expectedMetric: { key: "academic.accuracy", min: 0.7, max: 0.9 },
      predictedErrorPatterns: ["operation_selection"],
      confidence: 0.65,
      evidenceIds: ["chart:reina"],
      intervention: "equal-groups practice",
      evidenceLimit: "practice_only",
    },
    preserve: ["clear progress"],
    change: ["make the learning target larger"],
    explore: ["short optional demonstration"],
    avoid: ["hidden drag mechanics"],
    measurementKeys: ["interaction.timeToFirstValidActionMs", "interaction.demoRequested"],
  }));
  return {
    planId: "direct-plan-1",
    title: "Multiplication Adventure",
    contentScopeRationale: "Three focused instruments are sufficient to teach and observe this assignment without duplicating work.",
    concept: {
      conceptId: "multiplication_as_equal_groups",
      name: "Multiplication as equal groups",
      statement: "A multiplication tells you how many you get when the same amount is repeated a set number of times.",
      instanceScope: "factors of two, five and ten within fifty",
      prerequisites: ["skip counting", "repeated addition"],
      assumptions: ["The child can skip-count aloud but may not connect it to notation."],
    },
    academicTheory: "Measure multiplication understanding through meaningful play.",
    profileEvidence: ["chart:reina"],
    learningResponsibilities: [{
      id: "equal-groups",
      title: "Equal Groups",
      purpose: "Connect equal groups to multiplication and solve the resulting quantity.",
      academicTarget: "multiplication",
    }],
    boardWorld: { title: "The Hidden Signal", narrative: "Choose a route to restore the signal.", backgroundPrompt: "Magical strategy landscape" },
    fork: {
      question: "Which route should we explore?",
      hypothesis: "Compare strategy with visual construction.",
      heldConstant: ["multiplication targets"],
      routes: [
        { id: "route-a", label: "Strategy Trail", promise: "Outthink the challenge", childFacingActionCue: "Choose moves that restore the signal.", previewNodeId: activities.find((a) => a.routeId === "route-a")?.id, engagementVariable: "strategy", nodeIds: activities.filter((a) => a.routeId === "route-a").map((a) => a.id) },
        { id: "route-b", label: "Builder Trail", promise: "Build the solution", childFacingActionCue: "Arrange pieces to power the trail.", previewNodeId: activities.find((a) => a.routeId === "route-b")?.id, engagementVariable: "visual", nodeIds: activities.filter((a) => a.routeId === "route-b").map((a) => a.id) },
      ],
    },
    activities,
    quest: { title: "Quest", locked: true, teaser: "A hidden expedition awaits.", artworkPrompt: "Mysterious portal adventure icon" },
    boss: { title: "Boss", locked: true, teaser: "A legendary finale waits beyond the Quest.", artworkPrompt: "Epic child-safe fantasy guardian icon" },
  };
}

function learningProgram(activityCount = 3): any {
  const legacy = plan(activityCount);
  return {
    planId: legacy.planId,
    contentScopeRationale: legacy.contentScopeRationale,
    concept: {
      conceptId: legacy.concept.conceptId,
      name: legacy.concept.name,
      statement: legacy.concept.statement,
      instanceScope: legacy.concept.instanceScope,
      prerequisites: legacy.concept.prerequisites,
    },
    assumptions: [{
      assumptionId: "assumption-equal-groups",
      claim: legacy.concept.assumptions[0],
      evidenceIds: ["chart:reina"],
      confidence: 0.6,
      uncertainty: "No returned graded work yet.",
    }],
    academicTheory: legacy.academicTheory,
    profileEvidence: legacy.profileEvidence,
    learningResponsibilities: legacy.learningResponsibilities,
    fork: {
      hypothesis: legacy.fork.hypothesis,
      heldConstant: legacy.fork.heldConstant,
      routes: legacy.fork.routes.map((route: any) => ({
        id: route.id,
        academicRationale: `A valid route for ${route.label}.`,
        nodeIds: route.nodeIds,
      })),
    },
    activities: legacy.activities.map((activity: any) => ({
      purpose: "baseline",
      id: activity.id,
      routeId: activity.routeId,
      responsibilityId: activity.responsibilityId,
      academicTarget: activity.academicTarget,
      difficultyBoundary: {
        allowedConcepts: ["equal groups", "arrays"],
        allowedRepresentations: ["objects", "rows and columns", "equations"],
        excludedExtensions: ["division", "fractions"],
        startingSupport: "visual grouping",
        expectedIndependence: "independent equivalent practice",
      },
      items: activity.items,
      academicPrediction: activity.academicPrediction,
      measurementKeys: activity.measurementKeys,
      catalogDecision: { action: "generate_new", reason: "Fresh assignment requires a grounded instrument." },
    })),
  };
}

describe("assignment concept", () => {
  it("rejects a concept id that carries the assignment's numbers", () => {
    // Reina's cycle accumulated five ids like math.multiplication.fact_retrieval.x2x5x10
    // for three ideas, so nothing matched across cycles.
    const withInstance = learningProgram();
    withInstance.concept.conceptId = "multiplication_x2x5x10";
    expect(() => parseMathLearningProgram(withInstance))
      .toThrow(/concept_id_contains_instance/);
  });

  it("keeps the worksheet's numbers in instanceScope, not the identity", () => {
    const parsed = parseMathLearningProgram(learningProgram());
    expect(parsed.concept.conceptId).toBe("multiplication_as_equal_groups");
    expect(parsed.concept.conceptId).not.toMatch(/\d/);
    expect(parsed.concept.instanceScope).toContain("two, five and ten");
  });

  it("requires a concept before a board can be planned", () => {
    const withoutConcept = learningProgram();
    delete withoutConcept.concept;
    expect(() => parseMathLearningProgram(withoutConcept))
      .toThrow("math_learning_program_missing_concept");
  });
});

describe("optional reward contract", () => {
  it("keeps one practice-only bonus outside the baseline route frontier", () => {
    const raw = learningProgram(2);
    raw.activities.push({
      ...raw.activities[0],
      id: "bonus-fractions-play",
      purpose: "bonus",
      routeId: "bonus",
      items: raw.activities[0].items.map((item: any, index: number) => ({
        ...item,
        id: `bonus-item-${index + 1}`,
        lineage: { ...item.lineage, exposure: "unseen" },
      })),
      academicPrediction: {
        ...raw.activities[0].academicPrediction,
        evidenceLimit: "practice_only",
      },
    });

    const parsed = parseMathLearningProgram(raw);

    expect(parsed.activities.map((activity) => activity.id)).not.toContain("bonus-fractions-play");
    expect(parsed.fork.routes.flatMap((route) => route.nodeIds)).not.toContain("bonus-fractions-play");
    expect(parsed.bonusActivity).toMatchObject({
      id: "bonus-fractions-play",
      purpose: "bonus",
      routeId: "bonus",
      academicPrediction: { evidenceLimit: "practice_only" },
    });
  });
});

describe("direct math experience", () => {
  it("gives Fable a compact factual child packet without inherited creative policy", async () => {
    const program = parseMathLearningProgram(learningProgram(2));
    const artifacts = program.activities.map((activity) => ({
      artifactId: `artifact-${activity.id}`,
      nodeId: activity.id,
      academicContractHash: mathAcademicContractHash(activity),
      title: `Experience ${activity.id}`,
      audienceRationale: "Uses the resolved age and grade without assuming a preference.",
      openingPromise: "Make the signal move with mathematics.",
      firstThreeSeconds: "One goal and one obvious control are visible.",
      firstAction: "Tap the glowing object.",
      interactionDemonstration: "The object previews one movement.",
      coreInteraction: "Use equal groups to move the world.",
      mathAsPower: "Correct groups power visible movement.",
      stakes: "The rival advances when the child makes an incorrect claim.",
      consequences: "The world changes and the same mathematics remains available for recovery.",
      recovery: "The groups remain visible for recounting.",
      progression: ["guided", "independent"],
      interactionContinuity: "The same action deepens across the experience.",
      worldReaction: "The signal visibly advances.",
      payoff: "The restored world celebrates.",
      replayVariation: "Fresh equivalent groups appear.",
      visualDirection: "Readable, energetic child-facing world.",
      motionDirection: "Movement communicates progress.",
      soundDirection: "Actions and completion have distinct sounds.",
      usefulLibraries: [],
      engagementPrediction: "The child will continue after the first action.",
      falsifyingEvidence: "The child abandons before the second item.",
    }));
    const successfulResponse = {
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 200 },
      content: [{
        type: "tool_use",
        name: "create_math_design_packet",
        input: {
          boardCreativeSpine: {
            title: "Signal World",
            narrative: "Restore the world.",
            openingChoice: "Which route?",
            backgroundDirection: "Readable adventure map.",
            routeDirections: program.fork.routes.map((route) => ({
              routeId: route.id,
              label: route.id,
              promise: "A distinct experience.",
              childFacingActionCue: `Try ${route.id} with one clear action.`,
              previewNodeId: route.nodeIds[0],
              engagementVariable: "AI selected",
            })),
          },
          artifacts,
          rationale: "The chapter is coherent and audience-aware.",
        },
      }],
    };
    const finalMessage = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("Connection error."), {
        name: "APIConnectionError",
        cause: { code: "ECONNRESET" },
      }))
      .mockResolvedValueOnce(successfulResponse);
    const stream = vi.fn((..._args: any[]) => ({ finalMessage }));
    const childContext = buildMathCreativeChildContext({
      identity: { displayName: "Reina", ttsName: "Ray-nah" },
      demographics: { age: 8, grade: 2, learningStyle: "mixed", attentionSpan: "moderate" },
      engagementTheory: {
        theoryId: "engagement-1",
        domain: "math",
        dimensions: {
          puzzle: {
            dimension: "puzzle",
            positiveWeight: 5,
            negativeWeight: 0,
            mixedWeight: 0.5,
            evidenceCount: 6,
            confidence: 0.91,
            lastUpdated: "2026-07-12T18:48:55.239Z",
          },
        },
        preferredDimensions: ["puzzle"],
        avoidedDimensions: ["competition"],
        promptDirectives: { prefer: ["Use puzzles"], avoid: ["Avoid pressure"] },
        evidence: [{
          id: "choice-real",
          kind: "choice",
          summary: "The child selected a puzzle route; completion unknown.",
          sourcePath: "choice_events/2026-07-12.ndjson",
          createdAt: "2026-07-12T18:48:55.239Z",
        }, {
          id: "activity:generated-baseline:synthetic",
          kind: "activity",
          summary: "generated-baseline completed=true",
          sourcePath: "activity-evidence.ndjson",
          createdAt: "2026-07-12T18:49:55.239Z",
        }],
      },
      learningProfile: {
        rewardPreferences: { favoriteGames: [], celebrationStyle: "mixed" },
        activityTraitModel: {
          "puzzle — deliberate untimed construction generated prose": {
            positiveWeight: 0,
            negativeWeight: 20.3,
          },
        },
      },
    } as never);

    const designed = await askMathExperienceDesigner({
      childId: "reina",
      program,
      childContext,
      priorOutcomes: {
        observations: [{ id: "real-rating", funRating: 4 }],
        promptDirectives: ["Keep it low-pressure"],
        avoid: ["no penalty"],
      },
      client: { messages: { stream } } as never,
    });

    expect(stream).toHaveBeenCalledTimes(2);
    expect(finalMessage).toHaveBeenCalledTimes(2);
    const prompt = String(stream.mock.calls[0]?.[0]?.messages?.[0]?.content);
    expect(prompt).toContain('"age": 8');
    expect(prompt).toContain('"grade": 2');
    expect(prompt).toContain('"dimension": "puzzle"');
    expect(prompt).toContain('"evidenceCount": 6');
    expect(prompt).toContain('"confidence": 0.91');
    expect(prompt).toContain('"id": "choice-real"');
    expect(prompt).toContain('"funRating": 4');
    expect(prompt).toContain("specific child can understand immediately");
    expect(prompt).toContain("Mathematics must visibly change");
    expect(prompt).toContain("Do not default to consequence-free play");
    expect(prompt).toContain("You independently choose mechanics, stakes, consequences, recovery, pacing, and payoff");
    expect(prompt).not.toContain("activityTraitModel");
    expect(prompt).not.toContain("generated-baseline completed");
    expect(prompt).not.toContain("preferredDimensions");
    expect(prompt).not.toContain("avoidedDimensions");
    expect(prompt).not.toContain("promptDirectives");
    expect(prompt).not.toContain("Avoid pressure");
    expect(prompt).not.toContain("Keep it low-pressure");
    expect(prompt).not.toContain("no penalty");
    expect(prompt).not.toContain("wrestling");
    expect(prompt).not.toContain("Caravan Rush");
    expect(designed.packet.boardCreativeSpine.routeDirections).toEqual(
      program.fork.routes.map((route) => expect.objectContaining({
        routeId: route.id,
        childFacingActionCue: `Try ${route.id} with one clear action.`,
        previewNodeId: route.nodeIds[0],
      })),
    );
  });

  it("places artifact design before generation without a review pause or quality harness", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/ingestMathDirect.ts"), "utf8");
    const designer = source.indexOf("await askMathExperienceDesigner");
    const generation = source.indexOf("await generateDirectArtifacts");
    expect(designer).toBeGreaterThan(-1);
    expect(designer).toBeLessThan(generation);
    expect(source).not.toContain("askDirectCreativeDirector");
    expect(source).not.toContain("safeRunDirectTasteReview");
    expect(source).not.toContain("DESIGN_REVIEW_REQUIRED");
  });

  it("does not expose legacy board-rejection outcomes in math ingestion", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/ingestMathDirect.ts"), "utf8");
    expect(source).not.toContain("Done — BLOCKED");
    expect(source).not.toContain("Done — GENERATION_INCOMPLETE");
    expect(source).not.toContain("Done — NEEDS_REVIEW");
    expect(source).toContain("Provider unavailable");
  });

  it("keeps adaptive Creator calls subordinate to the Planner without leaking source questions", () => {
    const prompt = buildAdaptiveProgressionCreatorPrompt({
      cycle: {
        childId: "reina",
        homeworkId: "hw-math",
        assignment: { title: "Multiplication", rawText: "Solve equal-groups stories." },
        academicTheory: { hypothesis: "Connect equal groups to notation." },
        engagementTheory: { hypothesis: "Reina may prefer visible strategy choices." },
        observations: [{ itemId: "practice-3x4" }],
      } as never,
      node: {
        nodeId: "quest",
        title: "Quest",
        role: "quest",
        academicTarget: { skill: "novel transfer" },
        openingScreen: { title: "Quest", purpose: "Test transfer in a new context." },
        mechanic: "AI selected",
        theme: "AI selected",
        generationPrompt: { text: "Create unseen transfer and do not reuse practice-3x4." },
        artwork: { localPath: "/generated/quest.jpeg" },
      } as never,
      childContext: { identity: { displayName: "Reina" }, motivators: ["strategy"] },
    });

    expect(prompt).toContain("Create unseen transfer and do not reuse practice-3x4");
    expect(prompt).toContain("practice-3x4");
    expect(prompt).not.toContain("Solve equal-groups stories.");
    expect(prompt).not.toContain("Experience Design Constitution");
    expect(prompt).toContain('<script src="/games/_contract.js"></script>');
    expect(prompt).toContain("window.GAME_PARAMS");
    expect(prompt).toContain("window.fireAttemptEvent");
    expect(prompt).toContain("window.sendNodeComplete");
    expect(prompt).toContain("window.fireCompanionEvent");
    expect(prompt).toContain("window.SUNNY_VALIDATION_HOOKS");
    expect(prompt).toContain("Never hardcode the child identity");
    expect(prompt).toContain("Every DOM element queried by JavaScript must exist");
    expect(prompt).not.toContain("Reina");
    expect(prompt).toContain("voluntarily replay");
    expect(prompt).toContain("mathematics must be the power");
    expect(prompt.indexOf("voluntarily replay")).toBeLessThan(prompt.indexOf("Runtime contract appendix"));
    expect(prompt).toContain("under 24,000 characters");
    for (const reference of ["Skyglider", "Crane", "Vault", "Moonlit Cargo", "Tidepool", "Rope-and-Peg"]) {
      expect(prompt).not.toContain(reference);
    }
  });

  it("uses adaptive thinking supported by the configured frontier Creator model", async () => {
    const finalMessage = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "<!doctype html><html><body>Quest</body></html>" }],
      stop_reason: "end_turn",
    });
    const stream = vi.fn().mockReturnValue({ finalMessage });
    const create = vi.fn();

    await generateAdaptiveProgressionActivityHtml({
      cycle: {
        childId: "reina",
        homeworkId: "hw-math",
        assignment: { title: "Multiplication", contentFingerprint: "fp", targets: ["equal groups"] },
        academicTheory: { hypothesis: "Connect equal groups to notation." },
        observations: [],
      } as never,
      node: {
        nodeId: "quest",
        title: "Quest",
        role: "quest",
        academicTarget: { skill: "novel transfer", targets: ["equal groups"] },
        openingScreen: { title: "Quest", purpose: "Test unseen transfer." },
        mechanic: "AI selected",
        generationPrompt: { text: "Create unseen transfer." },
        artwork: { localPath: "/generated/quest.jpeg" },
      } as never,
      childContext: {},
      client: { messages: { create, stream } } as never,
    });

    expect(create).not.toHaveBeenCalled();
    expect(stream.mock.calls[0]?.[0]).toMatchObject({
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
    });
    expect(finalMessage).toHaveBeenCalledOnce();
  });

  it("requires generated activities to return a complete factual scorecard", () => {
    const prompt = buildDirectActivityCreatorPrompt({
      activity: plan(2).activities[0],
      artworkUrl: "/generated/math.png",
      childId: "reina",
    });

    expect(prompt).toContain("target,correct,attemptedValue,responseTimeMs,scaffoldLevel");
    expect(prompt).toContain("accuracy,targetResults,timeSpent_ms");
    expect(prompt).not.toContain("targetId,correct,responseTimeMs");
  });

  it("blocks an invalid Planner response without starting an AI repair loop", async () => {
    const validPlan = learningProgram(4);
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", name: "create_math_learning_program", input: { ...validPlan, activities: [] } }],
    });
    await expect(askDirectMathPlanner({
      childId: "reina",
      chart: {
        identity: {}, demographics: {}, engagementTheory: null, factBankSummary: {},
        learningProfile: { rewardPreferences: [], sessionStats: {}, activityModel: {}, activityTraitModel: {} },
        decisionTrace: { latest: null },
      } as never,
      extraction: { fullText: "Multiplication assignment" } as never,
      client: { messages: { create, stream: streamOf(create) } } as never,
    })).rejects.toThrow("math_learning_program_requires_activities");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("includes prior prediction errors and theory decisions in the next Planner prompt", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "tool_use", name: "create_math_learning_program", input: learningProgram(3) }] });
    await askDirectMathPlanner({
      childId: "reina",
      chart: {
        identity: {}, demographics: {}, engagementTheory: null, factBankSummary: {},
        learningProfile: { rewardPreferences: [], sessionStats: {}, activityModel: {}, activityTraitModel: {} },
        decisionTrace: { latest: null },
        learningHistory: {
          childId: "reina",
          constructs: {
            "math.multiplication.equal_groups": {
              constructId: "math.multiplication.equal_groups",
              predictions: [{ predictionId: "prediction:prior" }],
              observations: [{ observationId: "observation:returned" }],
              evaluations: [{ evaluationId: "evaluation:prior", predictionError: 0.2 }],
              decisions: [{ decisionId: "decision:prior", change: ["operation selection"] }],
            },
          },
          recentDecisions: [{ decisionId: "decision:prior" }],
          pendingInterpretation: [],
        },
      } as never,
      extraction: { fullText: "New multiplication assignment" } as never,
      client: { messages: { create, stream: streamOf(create) } } as never,
    });
    const prompt = String(create.mock.calls[0]?.[0]?.messages?.[0]?.content);
    expect(prompt).toContain("prediction:prior");
    expect(prompt).toContain("evaluation:prior");
    expect(prompt).toContain("decision:prior");
  });

  it("keeps AI-selected activity and item counts", () => {
    expect(parseDirectLearningExperiencePlan(plan(2)).activities).toHaveLength(2);
    expect(parseDirectLearningExperiencePlan(plan(4)).activities).toHaveLength(4);
    expect(parseDirectLearningExperiencePlan(plan(7)).activities).toHaveLength(7);
    for (const itemCount of [1, 3, 8]) {
      const variable = plan(2);
      variable.activities[0]!.items = Array.from({ length: itemCount }, (_, index) => ({
        id: `item-${index + 1}`,
        prompt: `Solve item ${index + 1}`,
        lineage: { sourceEvidenceIds: [`assignment:item-${index + 1}`], exposure: "unseen" },
        response: { mode: "numeric", expected: index + 1 },
      }));
      expect(parseDirectLearningExperiencePlan(variable).activities[0]?.items).toHaveLength(itemCount);
    }
  });

  it("constrains only Planner structure, never activity count, item count, or mechanics", () => {
    const schema = MATH_LEARNING_PROGRAM_TOOL_SCHEMA as any;
    expect(schema.required).toContain("activities");
    expect(schema.properties.activities.minItems).toBe(1);
    expect(schema.properties.activities.maxItems).toBeUndefined();
    expect(schema.properties.activities.items.properties.items.maxItems).toBeUndefined();
    expect(schema.properties.activities.items.properties.items.items.properties.response.oneOf).toHaveLength(4);
    expect(schema.properties.activities.items.properties).not.toHaveProperty("mechanic");
    expect(schema.properties.activities.items.properties).not.toHaveProperty("visualMock");
    expect(schema.properties.activities.items.properties).not.toHaveProperty("creatorPrompt");
  });

  it("preregisters academic predictions separately from UX design predictions", () => {
    const parsed = parseDirectLearningExperiencePlan(plan(3));
    const artifacts = parsed.activities.map((activity) => ({
      childId: "reina", homeworkId: "hw-math-test", nodeId: activity.id, title: activity.title,
      htmlPath: `/games/${activity.id}.html`, artworkUrl: `/art/${activity.id}.png`,
      creatorPrompt: activity.creatorPrompt, promptHash: activity.id,
      plannerModel: "planner", creatorModel: "creator",
    }));
    const cycle = buildDirectLearningCycleInput({
      childId: "reina",
      homeworkId: "hw-math-test",
      extraction: { fileHash: "hash", fullText: "equal groups", filename: "math.pdf" } as never,
      plannerPlan: parsed,
      activeSessionPlan: buildDirectActiveSessionPlan({
        childId: "reina", homeworkId: "hw-math-test", plan: parsed, artifacts,
        backgroundUrl: "/background.png", questArtworkUrl: "/quest.png", bossArtworkUrl: "/boss.png",
        report: { passed: true, failures: [], screenshots: [] },
      }),
      artifacts,
    });
    expect(cycle.academicPredictions).toHaveLength(3);
    expect(cycle.academicPredictions?.[0]).toMatchObject({
      constructId: "math.multiplication.equal_groups",
      expectedMetric: { min: 0.7, max: 0.9 },
    });
    expect(cycle.nodes[0]?.prediction?.claim).toBe("The child will understand the first action without adult help.");
  });

  it("requires coherent learning responsibilities without fixing the activity count", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    expect(source).toContain("Prescribe the smallest coherent learning program");
    expect(source).toContain("Choose any educationally sufficient activity and item counts");
    expect(source).toContain("Distribute responsibilities across the whole board");
    expect(source).not.toContain("Generate exactly four activities");
    expect(source).not.toContain("Both routes must cover every declared responsibility");
    expect(source).not.toContain("for every responsibility on each route");
    expect(source).not.toContain("bespoke vibrant game world");
    expect(source).not.toContain("Every math question must have exactly one correct answer");
    expect(source).toContain("Every responsibility, route, activity, item, assumption, and selection option has a non-empty stable ID");
    expect(source).not.toContain("math.multiplication.equal_groups");
    expect(source).not.toContain("calibrated_mastery\"}");
    expect(source).toContain("SUNNY_PLANNER_MAX_TOKENS ?? 20000");
    expect(source).toContain("SUNNY_GENERATION_MAX_TOKENS ?? 32000");
  });

  it("covers each responsibility across the board without duplicating it on every route", () => {
    const complete = plan(4);
    complete.learningResponsibilities = [
      { id: "facts", title: "Fact Relationships", purpose: "Reason through x2, x5, and x10 facts.", academicTarget: "multiplication facts" },
      { id: "stories", title: "Equal-Group Stories", purpose: "Translate equal-group stories into multiplication.", academicTarget: "word problems" },
    ];
    complete.activities.forEach((activity: any, index: number) => {
      const responsibility = index % 2 === 0 ? complete.learningResponsibilities[0]! : complete.learningResponsibilities[1]!;
      activity.responsibilityId = responsibility.id;
      activity.academicTarget = responsibility.academicTarget;
    });
    const parsed = parseDirectLearningExperiencePlan(complete);
    expect(parsed.activities).toHaveLength(4);
    expect(parsed.activities.map((activity) => activity.learningPurpose)).toEqual([
      complete.learningResponsibilities[0]!.purpose,
      complete.learningResponsibilities[1]!.purpose,
      complete.learningResponsibilities[0]!.purpose,
      complete.learningResponsibilities[1]!.purpose,
    ]);

    const missingAcrossBoard = structuredClone(complete);
    missingAcrossBoard.activities.forEach((activity: any) => {
      activity.responsibilityId = "facts";
      activity.academicTarget = "multiplication facts";
    });
    expect(() => parseDirectLearningExperiencePlan(missingAcrossBoard))
      .toThrow("direct_plan_missing_responsibility:stories");
  });

  it("accepts an AI-selected curriculum with three responsibilities and six activities", () => {
    const variable = plan(6);
    variable.learningResponsibilities = [
      { id: "facts", title: "Fact Relationships", purpose: "Reason through multiplication facts.", academicTarget: "facts" },
      { id: "groups", title: "Equal Groups", purpose: "Build equal groups.", academicTarget: "groups" },
      { id: "stories", title: "Story Translation", purpose: "Translate stories into multiplication.", academicTarget: "stories" },
    ];
    variable.activities.forEach((activity: any, index: number) => {
      const responsibility = variable.learningResponsibilities[index % variable.learningResponsibilities.length]!;
      activity.responsibilityId = responsibility.id;
      activity.academicTarget = responsibility.academicTarget;
    });
    expect(parseDirectLearningExperiencePlan(variable).activities).toHaveLength(6);
  });

  it("supports selection, numeric, construction, and explanation response contracts", () => {
    const variable = plan(2);
    variable.activities[0]!.items = [
      { id: "selection", prompt: "Which picture shows three equal groups?", lineage: { sourceEvidenceIds: ["assignment:selection"], exposure: "unseen" }, response: { mode: "selection", options: [{ id: "a", label: "A", correct: true }, { id: "b", label: "B", correct: false }] } },
      { id: "numeric", prompt: "How many objects altogether?", lineage: { sourceEvidenceIds: ["assignment:numeric"], exposure: "unseen" }, response: { mode: "numeric", expected: 20 } },
      { id: "construction", prompt: "Build four equal groups of five.", lineage: { sourceEvidenceIds: ["assignment:construction"], exposure: "unseen" }, response: { mode: "construction", expectedState: { groups: 4, perGroup: 5 }, successDescription: "Four groups each contain five objects." } },
      { id: "explanation", prompt: "Explain how the groups show multiplication.", lineage: { sourceEvidenceIds: ["assignment:explanation"], exposure: "unseen" }, response: { mode: "explanation", rubric: ["names equal groups", "connects groups to total"] } },
    ];
    expect(parseDirectLearningExperiencePlan(variable).activities[0]?.items.map((item) => item.response.mode))
      .toEqual(["selection", "numeric", "construction", "explanation"]);
  });

  it("rejects initial activities that claim more than practice evidence", () => {
    const invalid = plan(2);
    invalid.activities[0]!.academicPrediction.evidenceLimit = "calibrated_mastery";
    expect(() => parseDirectLearningExperiencePlan(invalid))
      .toThrow("direct_plan_initial_activity_must_be_practice_only");
  });

  it("rejects item contracts without source lineage", () => {
    const invalid = plan(2);
    delete (invalid.activities[0]!.items[0] as { lineage?: unknown }).lineage;
    expect(() => parseDirectLearningExperiencePlan(invalid)).toThrow("direct_plan_invalid_item_lineage");
  });

  it("identifies the exact authored identity missing from an invalid plan", () => {
    const invalid = plan(2);
    delete invalid.activities[0]!.items[0]!.id;
    expect(() => parseDirectLearningExperiencePlan(invalid))
      .toThrow("direct_plan_missing_item_id");
  });

  it("treats locked Quest and Boss as board furniture when the Planner omits teasers", () => {
    const plannerOutput = plan(2);
    delete plannerOutput.quest;
    delete plannerOutput.boss;

    const parsed = parseDirectLearningExperiencePlan(plannerOutput);
    const artifacts = parsed.activities.map((activity) => ({
      childId: "reina",
      homeworkId: "hw-math-assignment",
      nodeId: activity.id,
      title: activity.title,
      htmlPath: `/tmp/${activity.id}.html`,
      artworkUrl: `/generated/${activity.id}.jpeg`,
      creatorPrompt: activity.creatorPrompt,
      promptHash: `hash-${activity.id}`,
      plannerModel: "claude-sonnet-5",
      creatorModel: "claude-sonnet-5",
    }));
    const session = buildDirectActiveSessionPlan({
      childId: "reina",
      homeworkId: "hw-math-assignment",
      plan: parsed,
      artifacts,
      backgroundUrl: "/generated/background.jpeg",
      questArtworkUrl: "/generated/quest-placeholder.jpeg",
      bossArtworkUrl: "/generated/boss-placeholder.jpeg",
      report: { passed: true, failures: [], screenshots: [] },
    });

    expect(parsed.quest).toMatchObject({ title: "Quest", locked: true });
    expect(parsed.boss).toMatchObject({ title: "Boss", locked: true });
    expect(session.adventureBoard?.nodes.find((node) => node.id === "quest"))
      .toMatchObject({ label: "Quest", state: "locked" });
    expect(session.adventureBoard?.nodes.find((node) => node.id === "boss"))
      .toMatchObject({ label: "Boss", state: "locked" });
  });

  it("projects every AI-selected node and prediction into one canonical assignment cycle", () => {
    const plannerPlan = parseDirectLearningExperiencePlan(plan(3));
    const artifacts = plannerPlan.activities.map((activity) => ({
      childId: "reina",
      homeworkId: "hw-math-assignment",
      nodeId: activity.id,
      title: activity.title,
      htmlPath: `/tmp/${activity.id}.html`,
      artworkUrl: `/generated/${activity.id}.jpeg`,
      creatorPrompt: activity.creatorPrompt,
      promptHash: `hash-${activity.id}`,
      plannerModel: "claude-sonnet-5",
      creatorModel: "claude-sonnet-5",
    }));
    const activeSessionPlan = buildDirectActiveSessionPlan({
      childId: "reina",
      homeworkId: "hw-math-assignment",
      plan: plannerPlan,
      artifacts,
      backgroundUrl: "/generated/background.jpeg",
      questArtworkUrl: "/generated/quest.jpeg",
      bossArtworkUrl: "/generated/boss.jpeg",
      report: { passed: true, failures: [], screenshots: [] },
      createdAt: "2026-07-17T12:00:00.000Z",
    });
    const cycle = buildDirectLearningCycleInput({
      childId: "reina",
      homeworkId: "hw-math-assignment",
      extraction: {
        sourceKind: "embedded_text_pdf",
        sourcePath: "/tmp/assignment.pdf",
        filename: "assignment.pdf",
        mediaType: "application/pdf",
        fileHash: "assignment-file-hash",
        extractionMethod: "unpdf",
        pages: [{ pageNumber: 1, text: "Multiplication facts and equal groups" }],
        fullText: "Multiplication facts and equal groups",
        warnings: [],
      },
      plannerPlan,
      activeSessionPlan,
      artifacts,
      createdAt: "2026-07-17T12:00:00.000Z",
    });
    expect(cycle.homeworkId).toBe("hw-math-assignment");
    expect(cycle.assignment.contentFingerprint).toBe("assignment-file-hash");
    expect(cycle.assignment.returnTag).toBe("#sunny_reina_hw_math_assignment");
    expect(cycle.nodes.filter((node) => node.role === "baseline")).toHaveLength(3);
    expect(cycle.nodes.find((node) => node.nodeId === "activity-1")?.prediction?.claim)
      .toBe(plannerPlan.activities[0]?.designPrediction);
    expect(cycle.nodes.find((node) => node.role === "quest")?.state).toBe("locked");
    expect(cycle.nodes.find((node) => node.role === "boss")?.state).toBe("locked");
  });

  it("does not impose a hidden game-design constitution on the Planner or Creator", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    for (const forbidden of [
      "EXPERIENCE_DESIGN_CONSTITUTION",
      "Make the first required action understandable within ten seconds",
      "Show one active problem",
      "Use drag only when",
      "Keep required input targets stationary",
      "provide visible toggleable “Show me”",
      "Premium vibrant child-centered educational artwork",
      "cinematic lighting",
    ]) expect(source).not.toContain(forbidden);
  });

  it("preserves different Planner-authored Creator prompts and adaptive directives", () => {
    const parsed = parseDirectLearningExperiencePlan(plan(3));
    expect(parsed.activities[0]?.creatorPrompt).not.toBe(parsed.activities[1]?.creatorPrompt);
    expect(parsed.activities[0]).toMatchObject({
      designPrediction: "The child will understand the first action without adult help.",
      preserve: ["clear progress"],
      change: ["make the learning target larger"],
      explore: ["short optional demonstration"],
      avoid: ["hidden drag mechanics"],
    });
  });

  it("hands the immutable academic contract and approved artifact to the builder", () => {
    const activity = parseDirectLearningExperiencePlan(plan(3)).activities[0]!;
    const prompt = buildDirectActivityCreatorPrompt({
      activity,
      artworkUrl: "/generated/activity.jpeg",
      childId: "reina",
    });
    expect(prompt).toContain("Immutable academic contract:");
    expect(prompt).toContain("Approved design artifact:");
    expect(prompt).not.toContain("Experience Design Constitution");
    expect(prompt).not.toContain("Use drag only when");
    expect(prompt).not.toContain("Show one active problem");
    expect(prompt).toContain("Keep the complete HTML under 45,000 characters");
    expect(prompt).toContain("This optional board-world asset is available");
    expect(prompt).not.toContain("Saved items/content:");
    expect(prompt).not.toContain("demoReplayCount");
    expect(prompt).not.toContain("sunny-qa-actions");
    expect(prompt).not.toContain("sunny-qa-journey");
    expect(prompt).not.toContain("data-testid");
    expect(prompt).not.toContain("acceptance journey");
    expect(prompt).toContain('type:"activity_ready"');
    expect(prompt).toContain('type:"game_state_update"');
    expect(prompt).toContain("currentChallenge");
    expect(prompt).toContain("Never expose answers");
    expect(prompt).toContain('type:"progress_event"');
  });

  it("gives the math Planner factual engagement evidence without inherited creative directives", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", name: "create_math_learning_program", input: learningProgram(3) }],
    });
    await askDirectMathPlanner({
      childId: "reina",
      chart: {
        identity: {}, demographics: {}, factBankSummary: {},
        engagementTheory: {
          theoryId: "engagement-1",
          hypothesis: "Generated interpretation that must not become policy.",
          preferredDimensions: ["story"],
          avoidedDimensions: ["competition"],
          promptDirectives: {
            prefer: ["Prefer story mechanics or presentation."],
            avoid: ["Avoid high-pressure competition presentation unless explicitly tested."],
            vary: ["mechanic"],
            holdConstant: ["academic target"],
          },
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
          evidence: [{
            id: "choice-one",
            kind: "choice",
            summary: "One competitive route was skipped.",
            createdAt: "2026-07-12T18:48:55.239Z",
          }],
        },
        learningProfile: {
          rewardPreferences: [],
          sessionStats: {},
          activityModel: {},
          activityTraitModel: {},
        },
        decisionTrace: { latest: null },
      } as never,
      extraction: { fullText: "Multiplication assignment" } as never,
      priorOutcomes: {
        directExperience: {
          observations: [{ choiceEventId: "event-one", engagement: { funRating: 2 } }],
          decisions: [{
            creatorPrompt: "Keep it low-pressure and use no score comparison.",
            nextPromptDirectives: ["no penalty"],
          }],
        },
      },
      client: { messages: { create, stream: streamOf(create) } } as never,
    });

    const prompt = String(create.mock.calls[0]?.[0]?.messages?.[0]?.content);
    // competition here is one observation at confidence 0.25 — below the bar to
    // reach a prompt at all, because a model reads a weak negative as a ban.
    expect(prompt).not.toContain('"dimension": "competition"');
    expect(prompt).not.toContain('"negativeWeight": 0.25');
    expect(prompt).toContain('"unmeasuredDimensions"');
    expect(prompt).toContain("not a prohibition");
    expect(prompt).toContain('"id": "choice-one"');
    expect(prompt).toContain('"funRating": 2');
    expect(prompt).not.toContain("promptDirectives");
    expect(prompt).not.toContain("preferredDimensions");
    expect(prompt).not.toContain("avoidedDimensions");
    expect(prompt).not.toContain("Avoid high-pressure");
    expect(prompt).not.toContain("Keep it low-pressure");
    expect(prompt).not.toContain("no score comparison");
    expect(prompt).not.toContain("no penalty");
    expect(prompt).not.toContain("nextPromptDirectives");
    expect(prompt).not.toContain("activityTraitModel");
    expect(prompt).not.toContain("activityModel");
  });

  it("gives the Planner concept-not-content authority and optional existing instruments", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", name: "create_math_learning_program", input: learningProgram(3) }],
    });
    await askDirectMathPlanner({
      childId: "reina",
      chart: {
        identity: {}, demographics: {}, engagementTheory: null, factBankSummary: {},
        learningProfile: { rewardPreferences: [], sessionStats: {}, activityModel: {}, activityTraitModel: {} },
        decisionTrace: { latest: null },
      } as never,
      extraction: { fullText: "Mrs. K puts 5 pencils in each of 4 boxes." } as never,
      client: { messages: { create, stream: streamOf(create) } } as never,
    });

    const prompt = String(create.mock.calls[0]?.[0]?.messages?.[0]?.content);
    expect(prompt).toContain("Teach the concept the teacher is targeting rather than copying");
    expect(prompt).toContain("Available reusable instruments");
    expect(prompt).toContain("spark-orb-charge");
    expect(prompt).toContain("vault-cracker");
    expect(prompt).toContain("reuse, revise, generate_new, or retire");
    expect(prompt).toContain("You own only the educational prescription");
    expect(prompt).not.toContain("You own the complete creative design");
    expect(prompt).not.toContain("Show one active problem");
    expect(prompt).not.toContain("Wrong tap");
    expect(prompt).not.toContain("no penalty");
  });

  it("uses one bounded Creator attempt without an identical retry", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    const creator = source.slice(source.indexOf("async function generateActivityHtml"), source.indexOf("async function mapConcurrent"));
    expect(creator).toContain("https://api.openai.com/v1/responses");
    expect(creator).toContain("input.client.messages.stream");
    expect(creator).not.toContain("for (let attempt");
    expect(creator).not.toContain("generation-retry");
  });

  it("streams long OpenAI builder output and preserves final usage", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"type":"response.output_text.delta","delta":"<!doctype html><html>"}\n\n',
      'data: {"type":"response.output_text.delta","delta":"<body>ready</body></html>"}\n\n',
      'data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":321,"output_tokens":654}}}\n\n',
      "data: [DONE]\n\n",
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });

    await expect(readOpenAiResponseStream(new Response(body))).resolves.toEqual({
      raw: "<!doctype html><html><body>ready</body></html>",
      inputTokens: 321,
      outputTokens: 654,
      stopReason: "completed",
    });
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    const creator = source.slice(source.indexOf("async function generateActivityHtml"), source.indexOf("async function mapConcurrent"));
    expect(creator).toContain("stream: true");
  });

  it("keeps ingestion validation to an opening browser smoke check", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    expect(source).toContain("NODE_REGISTRY");
    expect(source).toContain("activity_ready");
    expect(source).toContain("pageErrors");
    for (const removed of [
      "directArtifactContractFailures",
      "repairDirectArtifactsOnce",
      "runDirectAcceptanceRepairLoop",
    ]) expect(source).not.toContain(removed);
    expect(source).not.toContain("qa_visible_control_missing");
    expect(source).toContain("first_action_not_visible");
    expect(source).toContain("primary_control_clipped");
    expect(source).not.toContain("Published after Playwright runtime verification");
    expect(source).toContain("Published after a non-blocking opening browser smoke check");
  });

  it("regenerates HTML when adaptive Planner directives change", () => {
    const activity = parseDirectLearningExperiencePlan(plan(3)).activities[0]!;
    const originalHash = creatorPromptHash(activity, "claude-sonnet-5", "claude-sonnet-5");
    expect(shouldReuseDirectArtifact({ htmlComplete: true, savedPromptHash: originalHash, expectedPromptHash: originalHash })).toBe(true);
    const changed = { ...activity, change: [...activity.change, "replace drag with tapping"] };
    const changedHash = creatorPromptHash(changed, "claude-sonnet-5", "claude-sonnet-5");
    expect(changedHash).not.toBe(originalHash);
    expect(shouldReuseDirectArtifact({ htmlComplete: true, savedPromptHash: originalHash, expectedPromptHash: changedHash })).toBe(false);
  });

  it("checkpoints each complete artifact immediately so resume does not regenerate it", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    const generation = source.slice(source.indexOf("export async function generateDirectArtifacts"), source.indexOf("export function persistDirectExperience"));
    expect(generation).toContain("fs.writeFileSync(metadataPath");
    expect(generation.indexOf("fs.writeFileSync(htmlPath")).toBeLessThan(generation.indexOf("fs.writeFileSync(metadataPath"));
    expect(source).toContain("const isContinuation = Boolean(checkpoint.boardCreativeSpine)");
  });

  it("rechecks implementation prompt hashes while reusing frozen board artwork", () => {
    const ingestion = fs.readFileSync(path.join(process.cwd(), "src/scripts/ingestMathDirect.ts"), "utf8");
    expect(ingestion).toContain("existingBuild");
    expect(ingestion).toContain("existingArtworkUrls");
    expect(ingestion).toContain("await generateDirectArtifacts");
    expect(ingestion).not.toContain("let generated = fs.existsSync(buildFile)");

    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    expect(source).toContain("existingArtworkUrls?:");
    expect(source).toContain("input.existingArtworkUrls ?? await mapConcurrent");
  });

  it("requires a genuine mandatory fork and enforces locked static Quest/Boss product roles", () => {
    const invalid = plan();
    invalid.fork.routes = [invalid.fork.routes[0]!];
    expect(() => parseDirectLearningExperiencePlan(invalid)).toThrow("direct_plan_requires_two_routes");
    const unlocked = plan();
    unlocked.quest.locked = false;
    unlocked.quest.title = "Multiplication Expedition";
    expect(parseDirectLearningExperiencePlan(unlocked).quest).toMatchObject({ title: "Quest", locked: true });
  });

  it("keeps executable browser code out of the Planner contract", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", name: "create_math_learning_program", input: learningProgram(3) }],
    });
    await askDirectMathPlanner({
      childId: "reina",
      chart: {
        identity: {}, demographics: {}, engagementTheory: null, factBankSummary: {},
        learningProfile: { rewardPreferences: [], sessionStats: {}, activityModel: {}, activityTraitModel: {} },
        decisionTrace: { latest: null },
      } as never,
      extraction: { fullText: "Multiplication assignment" } as never,
      client: { messages: { create, stream: streamOf(create) } } as never,
    });
    const prompt = String(create.mock.calls[0]?.[0]?.messages?.[0]?.content);
    expect(prompt).not.toContain("acceptanceScript");
    expect(prompt).not.toContain("Playwright JavaScript");
    expect(parseDirectLearningExperiencePlan(plan(3)).activities[0]).not.toHaveProperty("acceptanceScript");
  });

  it("derives route membership from each planner-authored activity instead of a duplicate node list", () => {
    const withStaleRouteList = plan(4);
    withStaleRouteList.fork.routes[0]!.nodeIds = ["stale-node"];
    const parsed = parseDirectLearningExperiencePlan(withStaleRouteList);
    expect(parsed.fork.routes[0]!.nodeIds).toEqual(["activity-1", "activity-3"]);
  });

  it("keeps legacy middlemen out of the direct ingestion entry point", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/ingestMathDirect.ts"), "utf8");
    for (const forbidden of [
      "assignmentPlanner",
      "baselineShellIngestPipeline",
      "baselineGameFactory",
      "fullExperienceReadiness",
      "learningCycleRepository",
      "generatedArtifactRuntimeValidator",
      "judgeBaselineShellDesign",
    ]) expect(source).not.toContain(forbidden);
  });

  it("does not expose BLOCKED as a math-ingestion outcome", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/ingestMathDirect.ts"), "utf8");
    expect(source).not.toContain("Done — BLOCKED");
    expect(source).toContain("Existing board was not changed");
  });

  it("keeps Elli child-neutral while runtime supplies the active child and activity context", () => {
    const elli = fs.readFileSync(path.join(process.cwd(), "src/companions/elli.md"), "utf8");
    const personality = fs.readFileSync(path.join(process.cwd(), "src/prompts/companions/elli/personality.md"), "utf8");
    expect(elli).not.toMatch(/Ila(?:'s)?/);
    expect(personality).not.toMatch(/Ila(?:'s)?/);
    const sessionManager = fs.readFileSync(path.join(process.cwd(), "src/server/session-manager.ts"), "utf8");
    const responseRunner = fs.readFileSync(path.join(process.cwd(), "src/server/companion-response-runner.ts"), "utf8");
    expect(sessionManager).toContain("childName");
    expect(responseRunner).toContain("takePendingGameContextMessages");
    expect(responseRunner).toContain("injecting game context into Claude call");
  });

  it("keeps generated math audio semantic and Elli help child-invoked", () => {
    const prompt = buildDirectActivityCreatorPrompt({
      activity: parseDirectLearningExperiencePlan(plan(2)).activities[0]!,
      artworkUrl: "/generated/math-world.jpeg",
      childId: "reina",
    });
    expect(prompt).toContain('type:"sunny_sfx"');
    for (const cue of ["interaction", "recovery", "progress", "completion"]) {
      expect(prompt).toContain(`"${cue}"`);
    }
    expect(prompt).toContain('type:"sunny_sound_toggle"');
    expect(prompt).toContain("Do not use speechSynthesis");
    expect(prompt).toContain("Do not create AudioContext oscillators");
    expect(prompt).toContain("1365×768");
    expect(prompt).toContain("title and first required action");
    expect(prompt).toContain("primary controls");
    expect(prompt).toContain("readAloudRequested");
    expect(prompt).toContain('type:"sunny_companion_presence"');
    expect(prompt).toContain("Pause activity timers and input while summoned");
    expect(prompt).toContain("right-side companion safe area");
    expect(prompt).toContain("essential instructions, mathematical representations, and primary controls outside it");

    const elli = fs.readFileSync(path.join(process.cwd(), "src/companions/elli.md"), "utf8");
    expect(elli).toContain("only after the child asks");
    expect(elli).toContain("Never reveal the active answer");
    expect(elli).toContain("recordChildSignal");
    expect(elli).toContain("help_needed");
  });

  it("projects the active child's companion instead of stamping Elli into every math board", () => {
    const parsed = parseDirectLearningExperiencePlan(plan(2));
    const artifacts = parsed.activities.map((activity) => ({
      childId: "reina", homeworkId: "hw-math-companion", nodeId: activity.id, title: activity.title,
      htmlPath: `/games/${activity.id}.html`, artworkUrl: `/art/${activity.id}.png`,
      creatorPrompt: activity.creatorPrompt, promptHash: activity.id,
      plannerModel: "planner", creatorModel: "creator",
    }));
    const session = buildDirectActiveSessionPlan({
      childId: "reina",
      homeworkId: "hw-math-companion",
      plan: parsed,
      artifacts,
      backgroundUrl: "/background.png",
      questArtworkUrl: "/quest.png",
      bossArtworkUrl: "/boss.png",
      report: { passed: true, failures: [], screenshots: [] },
      companion: { id: "matilda", name: "Matilda" },
    });
    expect(session.companionPolicy).toMatchObject({ companionId: "matilda", displayName: "Matilda" });
    expect(session.adventureBoard?.companion).toEqual({ id: "matilda", name: "Matilda" });
  });

  it("documents the single math prompt chain without authorizing another system", () => {
    const agents = fs.readFileSync(path.join(process.cwd(), "AGENTS.md"), "utf8");
    expect(agents).toContain("Math Prompt Chain Boundary");
    expect(agents).toContain("Planner and Experience Creator");
    expect(agents).toContain("No new math production module, model call, fallback, renderer, or pipeline");
  });

  it("loads prior outcomes without replaying deferred AI feedback before planning", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/ingestMathDirect.ts"), "utf8");
    expect(source).not.toContain("interpretPendingDirectExperienceOutcomes");
    expect(source).toContain("readDirectFeedbackContext");
    expect(source).toContain("priorOutcomes");
  });

  it("limits browser diagnostics to a non-blocking opening smoke check", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    expect(source).not.toContain("parseDirectQaJourney");
    expect(source).not.toContain("sunny-qa-journey");
    expect(source).not.toContain("qa_visible_control_missing");
    expect(source).not.toContain("incorrect_recovery_evidence_missing");
    expect(source).not.toContain("completion_evidence_missing");
    expect(source).toContain("first_action_not_visible");
    expect(source).toContain("primary_control_clipped");
    expect(source).toContain("browser_error");
    for (const forbidden of ["acceptanceScript", "repairDirectArtifactsOnce", "runDirectAcceptanceRepairLoop", "applyDirectArtifactEdits"]) {
      expect(source).not.toContain(forbidden);
    }
    const entrypoint = fs.readFileSync(path.join(process.cwd(), "src/scripts/ingestMathDirect.ts"), "utf8");
    expect(entrypoint).not.toContain("repairDirectArtifactsOnce");
    expect(entrypoint).not.toContain("runDirectAcceptanceRepairLoop");
    expect(entrypoint.match(/runDirectBrowserSmokeCheck\(/g)).toHaveLength(1);
    expect(entrypoint).not.toContain("forceNodeIds: failedNodeIds");
    expect(entrypoint).not.toContain("runtime_provider_contract_failed");
    expect(entrypoint).toContain("[runtime-diagnostics]");
  });

  it("validates the registered homework launch URL instead of a private artifact shortcut", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    expect(source).not.toContain('url.pathname.startsWith("/artifact/")');
    expect(source).toContain("NODE_REGISTRY");
  });

  it("does not reuse a model response truncated before the activity document finishes", () => {
    expect(isCompleteGeneratedHtml("<!doctype html><html><body>ready</body></html>")).toBe(true);
    expect(isCompleteGeneratedHtml("<!doctype html><html><style>.game{")).toBe(false);
    expect(isCompleteGeneratedHtml("Here is the fix:\n<!doctype html><html><body>ready</body></html>")).toBe(false);
  });

  it("normalizes only a missing closing document wrapper", () => {
    expect(normalizeGeneratedHtml("<!doctype html><html><body><script>window.ready=true;</script>"))
      .toBe("<!doctype html><html><body><script>window.ready=true;</script></body></html>");
    expect(normalizeGeneratedHtml("<!doctype html><html><body><script>window.ready="))
      .toBe("<!doctype html><html><body><script>window.ready=");
  });

  it("separates academic Planner authority from creative design authority", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    for (const required of [
      "You own only the educational prescription",
      "Teach the concept the teacher is targeting rather than copying",
      "reuse, revise, generate_new, or retire",
      "A separate Experience Creator owns those choices",
      "You own the complete creative design",
    ]) expect(source).toContain(required);
    expect(source).toContain("Keep initial nodes practice_only");
    expect(source).not.toContain("Generate exactly four activities");
  });

  it("lets a FULL direct math plan bypass the stale legacy homework-cycle selector", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-direct-math-"));
    const directDir = path.join(rootDir, "src", "context", "reina", "homework");
    fs.mkdirSync(directDir, { recursive: true });
    fs.writeFileSync(path.join(directDir, "direct_experience_plan.json"), JSON.stringify({
      childId: "reina",
      activeSessionPlan: { domain: "math" },
      playwrightReport: { passed: true },
    }));
    expect(hasReadyDirectMathExperience("reina", rootDir)).toBe(true);
    expect(hasReadyDirectMathExperience("ila", rootDir)).toBe(false);
    fs.writeFileSync(path.join(directDir, "direct_experience_plan.json"), JSON.stringify({
      childId: "reina",
      activeSessionPlan: { domain: "math" },
      playwrightReport: { passed: false, failures: ["diagnostic timing mismatch"] },
    }));
    expect(hasReadyDirectMathExperience("reina", rootDir)).toBe(true);
  });

  it("launches a ready direct math board without requiring an explicit domain flag", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/sunnyRun.ts"), "utf8");
    expect(source).toContain("const directMathReady = Boolean(args.childId)");
    expect(source).not.toContain('args.homeworkDomain === "math"');
  });

  it("writes board coordinates in the renderer's normalized 0-to-1 space", () => {
    expect(boardPosition(8, 78)).toEqual({ x: 0.08, y: 0.78 });
    expect(routeNodePosition(0, 4, 0).x).toBeLessThan(routeNodePosition(3, 4, 0).x);
    expect(routeNodePosition(3, 4, 0).x).toBeLessThan(0.82);
  });

  it("keeps the shared learning path and choice gate visually separated", () => {
    const rawPlan = plan(4);
    rawPlan.activities[0].title = "The Tide Pool Test";
    rawPlan.activities[1].title = "The Lighthouse Lens: Secret of the Shifting Slice";
    const parsed = parseDirectLearningExperiencePlan(rawPlan);
    parsed.activities[0]!.routeId = "route-shared-entry";
    parsed.activities[1]!.routeId = "route-shared-entry";
    parsed.fork.routes[0]!.nodeIds = [parsed.activities[2]!.id];
    parsed.fork.routes[1]!.nodeIds = [parsed.activities[3]!.id];
    parsed.fork.routes[0]!.previewNodeId = parsed.activities[2]!.id;
    parsed.fork.routes[1]!.previewNodeId = parsed.activities[3]!.id;
    const artifacts = parsed.activities.map((activity) => ({
      childId: "reina",
      homeworkId: "hw-math-layout",
      nodeId: activity.id,
      title: activity.title,
      htmlPath: `/tmp/${activity.id}.html`,
      artworkUrl: `/generated/${activity.id}.jpeg`,
      creatorPrompt: activity.creatorPrompt,
      promptHash: `hash-${activity.id}`,
      plannerModel: "claude-opus-5",
      creatorModel: "claude-fable-5",
    }));
    const board = buildDirectActiveSessionPlan({
      childId: "reina",
      homeworkId: "hw-math-layout",
      plan: parsed,
      artifacts,
      backgroundUrl: "/generated/background.jpeg",
      questArtworkUrl: "/generated/quest.jpeg",
      bossArtworkUrl: "/generated/boss.jpeg",
      report: { passed: true, failures: [], screenshots: [] },
    }).adventureBoard!;
    const sharedPath = ["start", "activity-1", "activity-2", "choose-path"]
      .map((id) => board.nodes.find((node) => node.id === id)!);

    for (let index = 1; index < sharedPath.length; index += 1) {
      const previous = sharedPath[index - 1]!.position!;
      const current = sharedPath[index]!.position!;
      expect(Math.hypot(current.x - previous.x, current.y - previous.y)).toBeGreaterThanOrEqual(0.15);
    }
    expect(sharedPath[1]!.shortLabel).toBe("The Tide Pool Test");
    expect(sharedPath[2]!.shortLabel).toBe("The Lighthouse Lens");
    expect(sharedPath[3]!.shortLabel).toBe("Choose Path");
  });

  it("publishes a gated exclusive route choice with opening previews", () => {
    const rawPlan = plan(4);
    rawPlan.fork.question = "A long AI-authored explanation that should not become the child-facing heading";
    rawPlan.fork.routes[0]!.promise = "Build fair shares with your own hands — no clock, only sharp eyes, and a wax seal when the cut is true.";
    rawPlan.fork.routes[1]!.promise = "Spot the bigger fair slice before the gull swoops — fast eyes win the crowd, but the bird never steals your turn.";
    rawPlan.fork.routes[0]!.childFacingActionCue = "Cut the chart into fair shares.";
    rawPlan.fork.routes[0]!.previewNodeId = "activity-3";
    rawPlan.fork.routes[1]!.childFacingActionCue = "Spot the bigger fair slice.";
    rawPlan.fork.routes[1]!.previewNodeId = "activity-4";
    const parsed = parseDirectLearningExperiencePlan(rawPlan);
    parsed.activities[0]!.routeId = "route-shared-entry";
    parsed.activities[1]!.routeId = "route-shared-entry";
    parsed.fork.routes[0]!.nodeIds = [parsed.activities[2]!.id];
    parsed.fork.routes[1]!.nodeIds = [parsed.activities[3]!.id];
    const artifacts = parsed.activities.map((activity) => ({
      childId: "reina",
      homeworkId: "hw-math-choice",
      nodeId: activity.id,
      title: activity.title,
      htmlPath: `/tmp/${activity.id}.html`,
      artworkUrl: `/generated/${activity.id}.jpeg`,
      creatorPrompt: activity.creatorPrompt,
      promptHash: `hash-${activity.id}`,
      plannerModel: "claude-opus-5",
      creatorModel: "claude-fable-5",
    }));
    const report = {
      passed: true,
      failures: [],
      screenshots: parsed.activities.slice(2).map((activity) =>
        `/app/web/public/generated/direct-math/hw-math-choice-previews/${activity.id}-opening.png`),
    };

    const session = buildDirectActiveSessionPlan({
      childId: "reina",
      homeworkId: "hw-math-choice",
      plan: parsed,
      artifacts,
      backgroundUrl: "/generated/background.jpeg",
      questArtworkUrl: "/generated/quest.jpeg",
      bossArtworkUrl: "/generated/boss.jpeg",
      report,
    });
    const board = session.adventureBoard!;

    expect(board.layout?.routeChoiceBehavior).toBe("exclusive");
    expect(board.choiceSets?.[0]?.title).toBe("Choose your path");
    expect(board.choiceSets?.[0]?.options.every((option) => option.state === "locked")).toBe(true);
    expect(board.choiceSets?.[0]?.options.map((option) => option.thumbnailUrl)).toEqual([
      "/generated/direct-math/hw-math-choice-previews/activity-3-opening.png",
      "/generated/direct-math/hw-math-choice-previews/activity-4-opening.png",
    ]);
    expect(board.choiceSets?.[0]?.options.map((option) => option.description)).toEqual([
      "Cut the chart into fair shares.",
      "Spot the bigger fair slice.",
    ]);
    expect(board.nodes.find((node) => node.id === "activity-1")?.state).toBe("current");
    expect(board.nodes.find((node) => node.id === "activity-2")?.state).toBe("locked");
    expect(board.nodes.find((node) => node.id === "choose-path")?.state).toBe("locked");
    expect(board.nodes.find((node) => node.id === "activity-3")?.state).toBe("locked");
    expect(session.nodePlan.find((node) => node.id === "activity-3")?.locked).toBe(true);
  });
});
