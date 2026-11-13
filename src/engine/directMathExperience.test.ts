import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  MATH_LEARNING_PROGRAM_TOOL_SCHEMA,
  askMathExperienceDesigner,
  askDirectMathPlanner,
  mathAcademicCharterFromProgram,
  mathAcademicCharterHash,
  mathProgramBodyFromProgram,
  boardPosition,
  buildDirectActiveSessionPlan,
  buildDirectActivityCreatorPrompt,
  createDirectBoardThumbnailFilename,
  createDirectBoardBackgroundPrompt,
  createDirectBoardThumbnailPrompt,
  buildAdaptiveProgressionCreatorPrompt,
  designAdaptiveProgressionExperience,
  adaptiveProgressionAcademicContractHash,
  buildMathCreativeChildContext,
  buildDirectLearningCycleInput,
  creatorPromptHash,
  generateAdaptiveProgressionActivityHtml,
  hasReadyDirectMathExperience,
  isCompleteGeneratedHtml,
  parseDirectLearningExperiencePlan,
  parseMathLearningProgram,
  persistDirectExperience,
  routeNodePosition,
  shouldReuseDirectArtifact,
  normalizeGeneratedHtml,
  mathAcademicContractHash,
  mathPlannerChartContext,
  mapConcurrentSettled,
  mapConcurrentSettledWithCheckpoint,
  mergeActiveDomainProjection,
  preserveDirectArtifactGenerationMetrics,
  readOpenAiResponseStream,
} from "./directMathExperience";

describe("math Planner evidence doorway", () => {
  it("projects factual engagement evidence into the exact Planner-facing chart context", () => {
    const context = mathPlannerChartContext({
      identity: { displayName: "Reina", ttsName: "Ray-na" },
      demographics: { age: 9, grade: 3 },
      learningProfile: { sessionStats: {} },
      engagementTheory: {
        evidence: [{
          id: "choice_event_modal_1",
          source: "choice_event",
          summary: "Rated the visual puzzle 5/5 after completion.",
          weight: 1,
          createdAt: "2026-08-05T14:00:00.000Z",
        }],
        dimensions: {},
      },
      factBankSummary: { totalFacts: 0, dueFacts: 0 },
      decisionTrace: { latest: null },
      learningHistory: {},
      companionCare: { plan: { economy: { coins: 0 } } },
      economy: { coinBalance: 0 },
    } as never) as { engagementEvidence?: { evidence?: Array<{ id?: string }> } };

    expect(context.engagementEvidence?.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "choice_event_modal_1" })]),
    );
  });
});

describe("math publication domain preservation", () => {
  it("replaces only math while preserving spelling, reading, and science", () => {
    const existing = {
      spelling: { planId: "spelling-plan" },
      reading: { planId: "reading-plan" },
      science: { planId: "science-plan" },
      math: { planId: "old-math-plan" },
    };

    expect(mergeActiveDomainProjection(existing, "math", { planId: "new-math-plan" })).toEqual({
      spelling: { planId: "spelling-plan" },
      reading: { planId: "reading-plan" },
      science: { planId: "science-plan" },
      math: { planId: "new-math-plan" },
    });
  });
});

describe("math publication assumption ledger", () => {
  function publicationInput(rootDir: string) {
    const parsed = parseDirectLearningExperiencePlan(plan(2));
    const artifacts = parsed.activities.map((activity) => ({
      childId: "reina",
      homeworkId: "hw-math-ledger",
      nodeId: activity.id,
      title: activity.title,
      htmlPath: `/tmp/${activity.id}.html`,
      artworkUrl: "/generated/background.jpeg",
      creatorPrompt: activity.creatorPrompt,
      promptHash: `hash-${activity.id}`,
      plannerModel: "claude-opus-5",
      creatorModel: "claude-opus-5",
    }));
    const activeSessionPlan = buildDirectActiveSessionPlan({
      childId: "reina",
      homeworkId: "hw-math-ledger",
      plan: parsed,
      artifacts,
      backgroundUrl: "/generated/background.jpeg",
      questArtworkUrl: "/generated/quest.jpeg",
      bossArtworkUrl: "/generated/boss.jpeg",
      report: { passed: true, failures: [], screenshots: [] },
    });
    return {
      rootDir,
      childId: "reina",
      homeworkId: "hw-math-ledger",
      extraction: {
        sourceKind: "embedded_text_pdf" as const,
        sourcePath: "/tmp/assignment.pdf",
        filename: "assignment.pdf",
        mediaType: "application/pdf",
        fileHash: "assignment-hash",
        extractionMethod: "unpdf" as const,
        pages: [{ pageNumber: 1, text: "fractions" }],
        fullText: "fractions",
        warnings: [],
      },
      plannerPlan: parsed,
      activeSessionPlan,
      artifacts,
      report: { passed: true, failures: [], screenshots: [] },
    };
  }

  it("creates the preregistered ledger only as part of successful publication", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-publish-ledger-"));
    const contextDir = path.join(rootDir, "src/context/reina");
    fs.mkdirSync(contextDir, { recursive: true });
    fs.writeFileSync(path.join(contextDir, "learning_profile.json"), '{"aiContentCatalog":[]}\n');

    persistDirectExperience(publicationInput(rootDir));

    const ledgers = fs.readdirSync(path.join(contextDir, "assumptions"));
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]).toMatch(/hw-math-ledger-pre\.md$/);
  });

  it("publishes Math candidates into the shared catalog without removing Spelling", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-publish-catalog-"));
    const contextDir = path.join(rootDir, "src/context/reina");
    fs.mkdirSync(contextDir, { recursive: true });
    const spelling = {
      contentId: "hw-spelling:spell-check",
      childId: "reina",
      type: "quiz",
      source: "baseline",
      title: "Spell Check",
      domain: "spelling",
      algorithmTargets: ["retrieval-practice"],
      targetSkills: ["spell_from_memory"],
      targetConcepts: [],
      targetWords: ["knock"],
      engagementHooks: [],
      inputEvidence: {},
      reuseStatus: "candidate",
      reuseReason: "Awaiting evidence.",
    };
    fs.writeFileSync(path.join(contextDir, "learning_profile.json"), `${JSON.stringify({ aiContentCatalog: [spelling] })}\n`);
    fs.writeFileSync(path.join(contextDir, "content_catalog.json"), `${JSON.stringify({ version: 1, childId: "reina", items: [spelling] })}\n`);

    persistDirectExperience(publicationInput(rootDir));

    const shared = JSON.parse(fs.readFileSync(path.join(contextDir, "content_catalog.json"), "utf8")) as { items: Array<{ contentId: string; domain?: string }> };
    expect(shared.items.some((item) => item.contentId === spelling.contentId)).toBe(true);
    expect(shared.items.filter((item) => item.domain === "math")).toHaveLength(2);
  });

  it("rolls back the ledger when publication fails", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-publish-rollback-"));
    const contextDir = path.join(rootDir, "src/context/reina");
    fs.mkdirSync(contextDir, { recursive: true });
    fs.writeFileSync(path.join(contextDir, "learning_profile.json"), "not json");

    expect(() => persistDirectExperience(publicationInput(rootDir))).toThrow();
    const assumptionsDir = path.join(contextDir, "assumptions");
    expect(fs.existsSync(assumptionsDir) ? fs.readdirSync(assumptionsDir) : []).toEqual([]);
  });

  it.each([
    "baseline_ready",
    "baseline_active",
    "baseline_evaluating",
    "quest_ready",
    "quest_active",
    "boss_ready",
    "awaiting_calibration",
    "complete",
  ] as const)("does not rewrite a published same-assignment cycle in %s", (lifecycle) => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-same-assignment-"));
    const contextDir = path.join(rootDir, "src/context/reina");
    fs.mkdirSync(contextDir, { recursive: true });
    fs.writeFileSync(path.join(contextDir, "learning_profile.json"), '{"aiContentCatalog":[]}\n');
    const publication = publicationInput(rootDir);
    persistDirectExperience(publication);

    const cycleFile = path.join(contextDir, "homework", "cycles", `${publication.homeworkId}.json`);
    const cycle = JSON.parse(fs.readFileSync(cycleFile, "utf8")) as Record<string, any>;
    cycle.lifecycle = lifecycle;
    cycle.nodes[0].state = lifecycle === "baseline_ready" ? "ready" : "completed";
    cycle.nodes[0].evidenceIds = ["evidence:must-survive"];
    cycle.evidence.academic = [{
      evidenceId: "evidence:must-survive",
      summary: "Real child evidence must survive re-ingestion.",
      accuracy: 0.75,
    }];
    cycle.observations = [{
      observationId: "observation:must-survive",
      sourceId: "activity:real-session:activity-1",
      itemId: "fresh-item",
      constructLinks: [{ constructId: "math.multiplication", role: "primary", confidence: 1 }],
      result: { correct: true, score: 1 },
      assistance: { status: "unassisted", scaffolds: [] },
      exposure: "unseen",
      provenance: "independent_probe",
      observedAt: "2026-08-07T12:00:00.000Z",
      confounds: [],
    }];
    cycle.decisionHistory.push({
      decisionId: "decision:must-survive",
      eventType: "theory_decided",
      status: "supported",
      reason: "Preserve this decision.",
      nextAction: "collect_more_evidence",
      evidenceIds: ["evidence:must-survive"],
      fromLifecycle: lifecycle,
      toLifecycle: lifecycle,
      createdAt: "2026-08-07T12:01:00.000Z",
    });
    if (cycle.agencyExperiment?.routes?.[0]) {
      const route = cycle.agencyExperiment.routes[0];
      cycle.routeSelection = {
        experimentId: cycle.agencyExperiment.experimentId,
        selectedRouteId: route.routeId,
        selectedAt: "2026-08-07T12:00:30.000Z",
        choiceEventId: "choice:must-survive",
        history: [{
          routeId: route.routeId,
          selectedAt: "2026-08-07T12:00:30.000Z",
          choiceEventId: "choice:must-survive",
        }],
      };
    }
    fs.writeFileSync(cycleFile, `${JSON.stringify(cycle, null, 2)}\n`, "utf8");
    const before = fs.readFileSync(cycleFile);

    persistDirectExperience(publication);

    expect(fs.readFileSync(cycleFile)).toEqual(before);
  });
});

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

function stagedPlannerCreate(program = learningProgram(3)) {
  const charter = mathAcademicCharterFromProgram(program);
  const body = mathProgramBodyFromProgram(program, mathAcademicCharterHash(charter));
  return vi.fn()
    .mockResolvedValueOnce({
      content: [{ type: "tool_use", name: "create_math_academic_charter", input: charter }],
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 200 },
    })
    .mockResolvedValueOnce({
      content: [{ type: "tool_use", name: "create_math_program_body", input: body }],
      stop_reason: "tool_use",
      usage: { input_tokens: 300, output_tokens: 400 },
    });
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
  it("normalizes a valid JSON-encoded activities field from the Planner tool response", () => {
    const raw = learningProgram(4);
    raw.activities = JSON.stringify(raw.activities);

    const parsed = parseMathLearningProgram(raw);

    expect(parsed.activities).toHaveLength(4);
    expect(parsed.activities.map((activity) => activity.id)).toEqual([
      "activity-1",
      "activity-2",
      "activity-3",
      "activity-4",
    ]);
  });

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

  it("preserves the deferred bonus when a saved learning program is parsed again", () => {
    const raw = learningProgram(2);
    raw.activities.push({
      ...structuredClone(raw.activities[0]),
      id: "bonus-round-trip",
      purpose: "bonus",
      routeId: "bonus",
    });
    const saved = parseMathLearningProgram(raw);

    const resumed = parseMathLearningProgram(structuredClone(saved));

    expect(resumed.bonusActivity?.id).toBe("bonus-round-trip");
    expect(resumed.activities.map((activity) => activity.id)).not.toContain("bonus-round-trip");
  });
});

describe("direct math experience", () => {
  it("lets every concurrent node finish and reports failures without discarding siblings", async () => {
    const attempted: string[] = [];
    const settled = await mapConcurrentSettled(["N1", "N2", "N3"], 2, async (nodeId) => {
      attempted.push(nodeId);
      if (nodeId === "N2") throw new Error("provider timeout");
      return `${nodeId}:complete`;
    });

    expect(attempted).toEqual(expect.arrayContaining(["N1", "N2", "N3"]));
    expect(settled.results).toEqual(["N1:complete", undefined, "N3:complete"]);
    expect(settled.failures).toEqual([
      expect.objectContaining({ index: 1, error: expect.objectContaining({ message: "provider timeout" }) }),
    ]);
  });

  it("checkpoints a completed sibling before another concurrent builder failure is reported", async () => {
    const order: string[] = [];
    const settled = await mapConcurrentSettledWithCheckpoint(["N1", "N2"], 2, async (nodeId) => {
      if (nodeId === "N2") {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("provider timeout");
      }
      return `${nodeId}:complete`;
    }, async (artifact) => {
      order.push(`checkpoint:${artifact}`);
    });
    order.push("settled");

    expect(settled.results).toEqual(["N1:complete", undefined]);
    expect(settled.failures).toHaveLength(1);
    expect(order).toEqual(["checkpoint:N1:complete", "settled"]);
  });

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
      learningHistory: {
        recentSupportObservations: [{
          evidenceId: "support:session-1:N1:item-1:1",
          summary: "Child asked for a different explanation of equal partitions.",
          kind: "companion_support",
          homeworkId: "hw-math-prior",
          sessionId: "session-1",
          nodeId: "N1",
          itemId: "item-1",
          supportType: "explain",
          masteryEligible: false,
          resumedIndependently: true,
        }],
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
    expect(prompt).toContain('"evidenceId": "support:session-1:N1:item-1:1"');
    expect(prompt).toContain('"supportType": "explain"');
    expect(prompt).toContain('"resumedIndependently": true');
    expect(prompt).toContain('"masteryEligible": false');
    expect(prompt).toContain("specific child can understand immediately");
    expect(prompt).toContain("visually demonstrate the first required action");
    expect(prompt).toContain("Keep required reading before the first action brief");
    expect(prompt).toContain("Make optional help discoverable");
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

  it("gives a multi-node Fable packet enough output room to return every artifact", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    const designStage = source.slice(
      source.indexOf("export async function askMathExperienceDesigner"),
      source.indexOf("export function mathPlannerChartContext"),
    );
    expect(designStage).toContain("SUNNY_DIRECTOR_MAX_TOKENS ?? 48000");
    expect(designStage).not.toContain("SUNNY_DIRECTOR_MAX_TOKENS ?? 16000");
  });

  it("keeps an optional bonus contract in planning without making its design block the baseline", async () => {
    const program = parseMathLearningProgram(learningProgram(2));
    program.bonusActivity = {
      ...structuredClone(program.activities[0]!),
      purpose: "bonus",
      id: "bonus-deferred",
      routeId: "bonus",
    };
    const artifacts = program.activities.map((activity) => ({
      artifactId: `artifact-${activity.id}`,
      nodeId: activity.id,
      academicContractHash: mathAcademicContractHash(activity),
      title: `Experience ${activity.id}`,
      audienceRationale: "Age-aware without inventing preferences.",
      openingPromise: "Restore the signal.",
      firstThreeSeconds: "One goal and control are visible.",
      firstAction: "Tap the signal.",
      interactionDemonstration: "The signal previews movement.",
      coreInteraction: "Use equal groups to move the world.",
      mathAsPower: "Groups power movement.",
      stakes: "The signal can stall.",
      consequences: "The world responds.",
      recovery: "The groups remain visible.",
      progression: ["guided", "independent"],
      interactionContinuity: "The same action deepens.",
      worldReaction: "The signal advances.",
      payoff: "The world celebrates.",
      replayVariation: "Fresh groups appear.",
      visualDirection: "Readable child-facing world.",
      motionDirection: "Motion shows progress.",
      soundDirection: "Semantic cues only.",
      usefulLibraries: [],
      engagementPrediction: "The first action is clear.",
      falsifyingEvidence: "The child cannot start.",
    }));
    const response = {
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
            backgroundDirection: "Readable map.",
            routeDirections: program.fork.routes.map((route) => ({
              routeId: route.id,
              label: route.id,
              promise: "A distinct experience.",
              childFacingActionCue: `Try ${route.id}.`,
              previewNodeId: route.nodeIds[0],
              engagementVariable: "AI selected",
            })),
          },
          artifacts,
          rationale: "A coherent baseline.",
        },
      }],
    };
    const stream = vi.fn((_request: unknown) => ({
      finalMessage: vi.fn().mockResolvedValue(response),
    }));

    const designed = await askMathExperienceDesigner({
      childId: "reina",
      program,
      childContext: {},
      priorOutcomes: {},
      client: { messages: { stream } } as never,
    });

    expect(designed.packet.artifacts.map((artifact) => artifact.nodeId))
      .toEqual(program.activities.map((activity) => activity.id));
    expect(designed.plan.bonusActivity).toBeUndefined();
    const request = stream.mock.calls[0]?.[0] as {
      messages?: Array<{ content?: unknown }>;
    } | undefined;
    expect(String(request?.messages?.[0]?.content)).not.toContain("bonus-deferred");
  });

  it("places artifact design before generation without a review pause or quality harness", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/ingestMathDirect.ts"), "utf8");
    const designer = source.indexOf("askMathExperienceDesigner({");
    const generation = source.indexOf("generateDirectArtifacts({");
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
    expect(source).toContain("PROVIDER_PAUSED");
    expect(source).toContain("Run ingestion again; saved work will resume automatically.");
  });

  it("keeps adaptive Creator calls subordinate to the Planner without leaking source questions", () => {
    const node = {
      nodeId: "quest",
      title: "Quest",
      role: "quest",
      academicTarget: { skill: "novel transfer" },
      openingScreen: { title: "Quest", purpose: "Test transfer in a new context." },
      mechanic: "AI selected",
      theme: "AI selected",
      generationPrompt: { text: "Create unseen transfer and do not reuse practice-3x4." },
      artwork: { localPath: "/generated/quest.jpeg" },
    } as never;
    const designArtifact = {
      artifactId: "quest-design-v1",
      nodeId: "quest",
      academicContractHash: "frozen-contract",
      title: "Quest",
      audienceRationale: "Clear for the current child.",
      openingPromise: "Restore the arena before the rival reaches the core.",
      firstThreeSeconds: "The damaged arena, rival, and first movable cells are visible.",
      firstAction: "Arrange energy cells into equal formations.",
      interactionDemonstration: "A cell pulses toward an open formation.",
      coreInteraction: "Construct equal groups directly inside the arena.",
      mathAsPower: "Valid arrays charge shields and push the rival back.",
      stakes: "Incorrect formations advance the rival.",
      consequences: "A shield cracks and the rival visibly moves.",
      recovery: "The crack reveals the rows/groups mismatch.",
      progression: ["build groups", "recognize arrays", "complete the finale"],
      interactionContinuity: "The same construction action deepens.",
      worldReaction: "Shields illuminate and the rival changes position.",
      payoff: "The whole arena activates.",
      replayVariation: "Layouts vary.",
      visualDirection: "Vivid reactive arena.",
      motionDirection: "Cells snap and shields surge.",
      soundDirection: "Semantic Sunny cues.",
      usefulLibraries: [],
      engagementPrediction: "Visible stakes sustain attention.",
      falsifyingEvidence: "Early abandonment.",
    };
    const prompt = buildAdaptiveProgressionCreatorPrompt({
      cycle: {
        childId: "reina",
        homeworkId: "hw-math",
        assignment: { title: "Multiplication", rawText: "Solve equal-groups stories." },
        academicTheory: { hypothesis: "Connect equal groups to notation." },
        engagementTheory: { hypothesis: "Reina may prefer visible strategy choices." },
        observations: [{ itemId: "practice-3x4" }],
      } as never,
      node,
      childContext: { identity: { displayName: "Reina" }, motivators: ["strategy"] },
      designArtifact,
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
    expect(prompt).toContain("Approved design artifact is the creative authority");
    expect(prompt).toContain("Construct equal groups directly inside the arena");
    expect(prompt).toContain("Valid arrays charge shields and push the rival back");
    expect(prompt).toContain("The whole arena activates");
    expect(prompt).toContain("Do not collapse the artifact into answer buttons");
    expect(prompt.indexOf("voluntarily replay")).toBeLessThan(prompt.indexOf("Runtime contract appendix"));
    expect(prompt).toContain("under 24,000 characters");
    for (const reference of ["Skyglider", "Crane", "Vault", "Moonlit Cargo", "Tidepool", "Rope-and-Peg"]) {
      expect(prompt).not.toContain(reference);
    }
  });

  it("has Fable freeze one design artifact against the canonical progression contract", async () => {
    const cycle = {
      childId: "reina",
      homeworkId: "hw-math",
      assignment: { title: "Multiplication", contentFingerprint: "fp", targets: ["equal groups"] },
      academicTheory: { hypothesis: "Connect equal groups to notation." },
      observations: [],
    } as never;
    const node = {
      nodeId: "quest",
      title: "Quest",
      role: "quest",
      academicTarget: { skill: "novel transfer", targets: ["equal groups"] },
      openingScreen: { title: "Quest", purpose: "Test unseen transfer." },
      mechanic: "AI selected",
      generationPrompt: { text: "Create unseen transfer." },
      artwork: { localPath: "/generated/quest.jpeg" },
      evidenceContract: { academic: true },
      experimentId: "experiment-quest",
    } as never;
    const academicContractHash = adaptiveProgressionAcademicContractHash(cycle, node);
    const artifact = {
      artifactId: "quest-design-v1",
      nodeId: "quest",
      academicContractHash,
      title: "Quest",
      audienceRationale: "Clear for a nine-year-old.",
      openingPromise: "Restore the arena.",
      firstThreeSeconds: "A damaged shield and movable cells are visible.",
      firstAction: "Drag cells into equal groups.",
      interactionDemonstration: "One cell pulses.",
      coreInteraction: "Build equal groups in the arena.",
      mathAsPower: "Arrays charge shields.",
      stakes: "The rival advances.",
      consequences: "A shield cracks.",
      recovery: "The mismatch becomes visible.",
      progression: ["one shield", "several shields", "finale"],
      interactionContinuity: "Construction deepens.",
      worldReaction: "The arena reacts.",
      payoff: "The arena activates.",
      replayVariation: "Layouts vary.",
      visualDirection: "Bright reactive arena.",
      motionDirection: "Cells snap.",
      soundDirection: "Semantic cues.",
      usefulLibraries: [],
      engagementPrediction: "Visible progress sustains attention.",
      falsifyingEvidence: "Early abandonment.",
    };
    const finalMessage = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", name: "create_progression_design_artifact", input: artifact }],
      usage: { input_tokens: 100, output_tokens: 200 },
      stop_reason: "tool_use",
    });
    const stream = vi.fn().mockReturnValue({ finalMessage });

    const result = await designAdaptiveProgressionExperience({
      cycle,
      node,
      childContext: { demographics: { age: 9, grade: 3 } },
      client: { messages: { stream } } as never,
    });

    expect(stream.mock.calls[0]?.[0]).toMatchObject({
      model: "claude-fable-5",
      tool_choice: { type: "tool", name: "create_progression_design_artifact" },
    });
    expect(result).toEqual(artifact);
  });

  it("includes the preregistered prediction and evidence limit in the frozen academic hash", () => {
    const cycle = {
      homeworkId: "hw-math",
      assignment: { contentFingerprint: "fp", targets: ["equal groups"] },
    };
    const node = {
      nodeId: "quest", role: "quest", academicTarget: { skill: "transfer" },
      generationPrompt: { promptId: "quest-prompt", text: "Test transfer." },
      evidenceContract: { academic: true }, theoryId: "theory", experimentId: "experiment",
      prediction: { claim: "Transfer will hold.", createdAt: "2026-08-06T00:00:00.000Z", evidenceLimit: "provisional_transfer" },
    };
    const original = adaptiveProgressionAcademicContractHash(cycle as never, node as never);
    const changed = adaptiveProgressionAcademicContractHash(cycle as never, {
      ...node,
      prediction: { ...node.prediction, evidenceLimit: "calibrated_mastery" },
    } as never);
    expect(changed).not.toBe(original);
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
      designArtifact: {
        artifactId: "quest-design-v1", nodeId: "quest", academicContractHash: "hash", title: "Quest",
        audienceRationale: "Clear.", openingPromise: "Begin.", firstThreeSeconds: "Action visible.",
        firstAction: "Move an object.", interactionDemonstration: "Object pulses.", coreInteraction: "Build groups.",
        mathAsPower: "Math moves the world.", stakes: "Visible stakes.", consequences: "Visible consequence.",
        recovery: "Visible recovery.", progression: ["start", "finish"], interactionContinuity: "Continuous.",
        worldReaction: "World reacts.", payoff: "Finale.", replayVariation: "Variation.", visualDirection: "Vivid.",
        motionDirection: "Motion.", soundDirection: "Semantic cues.", usefulLibraries: [],
        engagementPrediction: "Continue.", falsifyingEvidence: "Abandon.",
      },
      client: { messages: { create, stream } } as never,
    });

    expect(create).not.toHaveBeenCalled();
    expect(stream.mock.calls[0]?.[0]).toMatchObject({
      max_tokens: 48000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
    });
    expect(finalMessage).toHaveBeenCalledOnce();
  });

  it("recovers a complete checkpointed activity when the provider disconnects after delivering HTML", async () => {
    const checkpoint = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sunny-progression-stream-")), "boss.partial.html");
    const completeHtml = "<!doctype html><html><body><button>Play</button><script>document.querySelector('button')</script></body></html>";
    let textListener: ((delta: string, snapshot: string) => void) | undefined;
    const messageStream = {
      on: vi.fn((event: string, listener: (delta: string, snapshot: string) => void) => {
        if (event === "text") textListener = listener;
        return messageStream;
      }),
      finalMessage: vi.fn(async () => {
        textListener?.(completeHtml, completeHtml);
        throw new Error("read ECONNRESET");
      }),
    };

    const html = await generateAdaptiveProgressionActivityHtml({
      cycle: { childId: "lab", homeworkId: "hw", assignment: { title: "Math", contentFingerprint: "fp", targets: [] }, academicTheory: { hypothesis: "Transfer." }, observations: [] } as never,
      node: { nodeId: "boss", role: "boss", title: "Boss", academicTarget: { skill: "synthesis", targets: [] }, openingScreen: { title: "Boss", purpose: "Synthesize." }, mechanic: "AI selected", generationPrompt: { text: "Build Boss." }, artwork: {} } as never,
      childContext: {},
      client: { messages: { stream: vi.fn(() => messageStream) } } as never,
      partialHtmlFile: checkpoint,
    });

    expect(html).toBe(completeHtml);
    expect(fs.readFileSync(checkpoint, "utf8")).toBe(completeHtml);
  });

  it("reserves the Opus builder policy for Quest and Boss while support keeps the existing model route", async () => {
    const finalMessage = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "<!doctype html><html><body>Support</body></html>" }],
      stop_reason: "end_turn",
    });
    const stream = vi.fn().mockReturnValue({ finalMessage });
    await generateAdaptiveProgressionActivityHtml({
      cycle: { childId: "reina", homeworkId: "hw", assignment: { contentFingerprint: "fp", targets: [] }, observations: [] } as never,
      node: { nodeId: "support", role: "support", title: "Support", academicTarget: { skill: "support" }, openingScreen: { title: "Support" }, generationPrompt: { text: "Teach." }, artwork: {} } as never,
      childContext: {},
      client: { messages: { stream } } as never,
    });
    expect(stream.mock.calls[0]?.[0]).toMatchObject({ model: "claude-sonnet-5" });
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

  it("requires the opening to be fully rendered and legible before activity_ready", () => {
    const prompt = buildDirectActivityCreatorPrompt({
      activity: plan(2).activities[0],
      artworkUrl: "/generated/math.png",
      childId: "reina",
    });

    expect(prompt).toContain("Do not emit activity_ready while the opening is empty");
    expect(prompt).toContain("first meaningful action must already be rendered, enabled, and visually obvious");
    expect(prompt).toContain("high-contrast text and controls");
  });

  it("requires a child-visible playthrough of every response mode through the final item", () => {
    const prompt = buildDirectActivityCreatorPrompt({
      activity: plan(2).activities[0],
      artworkUrl: "/generated/math.png",
      childId: "reina",
    });

    expect(prompt).toContain("replace the previous item's controls");
    expect(prompt).toContain("including the final item");
    expect(prompt).toContain("window.SUNNY_VALIDATION_HOOKS");
    expect(prompt).toContain("same handlers as the visible child controls");
    expect(prompt).toContain("measure the bounding rectangle of every enabled child control");
    expect(prompt).toContain("1280×720 embedded frame");
  });

  it("blocks an invalid Planner response without starting an AI repair loop", async () => {
    const validPlan = learningProgram(4);
    const charter = mathAcademicCharterFromProgram(validPlan);
    const create = vi.fn()
      .mockResolvedValueOnce({
        content: [{ type: "tool_use", name: "create_math_academic_charter", input: charter }],
      })
      .mockResolvedValueOnce({
        content: [{
          type: "tool_use",
          name: "create_math_program_body",
          input: { ...mathProgramBodyFromProgram(validPlan, mathAcademicCharterHash(charter)), activities: [] },
        }],
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
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("checkpoints a compact academic charter and resumes only the missing program body", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-staged-planner-"));
    const validPlan = learningProgram(4);
    const charter = mathAcademicCharterFromProgram(validPlan);
    const body = mathProgramBodyFromProgram(validPlan, mathAcademicCharterHash(charter));
    const firstCreate = vi.fn()
      .mockResolvedValueOnce({
        content: [{ type: "tool_use", name: "create_math_academic_charter", input: charter }],
        stop_reason: "tool_use",
        usage: { input_tokens: 100, output_tokens: 200 },
      })
      .mockResolvedValueOnce({
        content: [{ type: "tool_use", name: "create_math_program_body", input: { ...body, activities: [] } }],
        stop_reason: "tool_use",
        usage: { input_tokens: 300, output_tokens: 400 },
      });
    const plannerInput = {
      childId: "reina",
      chart: {
        identity: {}, demographics: {}, engagementTheory: null, factBankSummary: {},
        learningProfile: { rewardPreferences: [], sessionStats: {}, activityModel: {}, activityTraitModel: {} },
        decisionTrace: { latest: null },
      } as never,
      extraction: { fullText: "Multiplication assignment" } as never,
      plannerCheckpointDir: dir,
    };

    await expect(askDirectMathPlanner({
      ...plannerInput,
      client: { messages: { create: firstCreate, stream: streamOf(firstCreate) } } as never,
    })).rejects.toThrow("math_learning_program_requires_activities");
    expect(firstCreate).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "academic-charter.json"), "utf8")))
      .toEqual(charter);

    const resumeCreate = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", name: "create_math_program_body", input: body }],
      stop_reason: "tool_use",
      usage: { input_tokens: 300, output_tokens: 400 },
    });
    const resumed = await askDirectMathPlanner({
      ...plannerInput,
      client: { messages: { create: resumeCreate, stream: streamOf(resumeCreate) } } as never,
    });

    expect(resumed.activities).toHaveLength(4);
    expect(resumeCreate).toHaveBeenCalledTimes(1);
    expect(resumeCreate.mock.calls[0]?.[0]?.tools?.[0]?.name).toBe("create_math_program_body");
  });

  it("includes prior prediction errors and theory decisions in the next Planner prompt", async () => {
    const create = stagedPlannerCreate();
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

  it("sends the original PDF to the Planner so scanned worksheet meaning does not depend on OCR", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-planner-pdf-"));
    const sourcePath = path.join(dir, "coins.pdf");
    fs.writeFileSync(sourcePath, Buffer.from("original scanned assignment"));
    const create = stagedPlannerCreate();
    try {
      await askDirectMathPlanner({
        childId: "reina",
        chart: {
          identity: {}, demographics: {}, engagementTheory: null, factBankSummary: {},
          learningProfile: { rewardPreferences: [], sessionStats: {}, activityModel: {}, activityTraitModel: {} },
          decisionTrace: { latest: null },
        } as never,
        extraction: {
          sourcePath,
          mediaType: "application/pdf",
          filename: "coins.pdf",
          fullText: "Imperfect OCR fallback",
        } as never,
        client: { messages: { create, stream: streamOf(create) } } as never,
      });

      expect(create.mock.calls[0]?.[0]?.messages?.[0]?.content).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "document",
          source: expect.objectContaining({ type: "base64", media_type: "application/pdf" }),
        }),
        expect.objectContaining({ type: "text", text: expect.stringContaining("Imperfect OCR fallback") }),
      ]));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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

  it("tells the Planner to return structured tool fields directly instead of JSON-encoding them", () => {
    expect(askDirectMathPlanner.toString()).toContain("Do not JSON-encode arrays or objects into strings");
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
    expect(source).toContain("SUNNY_PLANNER_MAX_TOKENS ?? 32000");
    expect(source).toContain("SUNNY_GENERATION_MAX_TOKENS ?? 48000");
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

  it("keeps metacognitive surveys out of academic selection contracts", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    expect(source).toContain("Every selection item has exactly one academically correct option");
    expect(source).toContain("Do not encode a survey, strategy reflection, preference, or confidence check as a selection item");
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
    expect(prompt).toContain("After the final submission, completion state must not read the next item");
  });

  it("gives the math Planner factual engagement evidence without inherited creative directives", async () => {
    const create = stagedPlannerCreate();
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

    const prompt = create.mock.calls
      .map((call) => String(call[0]?.messages?.[0]?.content))
      .join("\n");
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
    const create = stagedPlannerCreate();
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

    const prompt = create.mock.calls
      .map((call) => String(call[0]?.messages?.[0]?.content))
      .join("\n");
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

  it("gives the board Planner the immutable opening-evaluation findings", async () => {
    const create = stagedPlannerCreate();
    await askDirectMathPlanner({
      childId: "lab-child",
      chart: {
        identity: {}, demographics: {}, engagementTheory: null, factBankSummary: {},
        learningProfile: { rewardPreferences: [], sessionStats: {}, activityModel: {}, activityTraitModel: {} },
        decisionTrace: { latest: null },
      } as never,
      extraction: { fullText: "Equal-groups assignment" } as never,
      adaptiveFindings: {
        findingsHash: "findings-hash-1",
        interventionDecisionId: "decision:factor-meaning-visual",
        decision: {
          version: 1,
          decisionId: "decision:factor-meaning-visual",
          findingsHash: "findings-hash-1",
          action: "visual_explainer",
          targetConstructIds: ["math.multiplication.factor_meaning"],
          evidenceIds: ["attempt:opening-item-1"],
          rationale: "Use a concrete group model.",
          confidence: 0.7,
          uncertainty: "One response.",
          falsifyingEvidence: ["Fresh evidence remains incorrect."],
          measurementKeys: ["fresh.factor_meaning"],
          nextEvidenceRequired: ["Fresh unassisted response."],
        },
        findings: {
          holes: [{
            constructId: "math.multiplication.factor_meaning",
            evidenceIds: ["attempt:opening-item-1"],
          }],
          demonstrated: [],
          assisted: [],
          ambiguities: [],
        },
        historicalEvidence: [{ evidenceId: "history:evaluation-7", summary: "Prior grouping was assisted." }],
      } as never,
      client: { messages: { create, stream: streamOf(create) } } as never,
    });

    const bodyPrompt = String(create.mock.calls[1]?.[0]?.messages?.[0]?.content);
    expect(bodyPrompt).toContain("Immutable opening-evaluation findings");
    expect(bodyPrompt).toContain("findings-hash-1");
    expect(bodyPrompt).toContain("attempt:opening-item-1");
    expect(bodyPrompt).toContain("Use a concrete group model");
    expect(bodyPrompt).toContain("Do not reinterpret an ambiguous or assisted result as mastery");
  });

  it("uses one bounded Creator attempt without an identical retry", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    const creator = source.slice(source.indexOf("async function generateActivityHtml"), source.indexOf("async function mapConcurrent"));
    expect(creator).toContain("https://api.openai.com/v1/responses");
    expect(creator).toContain("input.client.messages.stream");
    expect(creator).not.toContain("for (let attempt");
    expect(creator).not.toContain("generation-retry");
  });

  it("hashes the exact catalog HTML that was copied into the target node", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    const generation = source.slice(
      source.indexOf("export async function generateDirectArtifacts"),
      source.indexOf("export function persistDirectExperience"),
    );
    expect(generation).toContain("existingHtml = sourceHtml");
    expect(generation).toContain("const html = generated?.html ?? existingHtml");
    expect(generation).toContain('update(html).digest("hex")');
  });

  it("gives full activity builders the same ten-minute provider window as planning and design", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    const builder = source.slice(source.indexOf("async function generateActivityHtml"), source.indexOf("async function mapConcurrent"));
    expect(builder).not.toContain("SUNNY_AI_TIMEOUT_MS ?? 240000");
    expect(builder.match(/SUNNY_AI_TIMEOUT_MS \?\? 600000/g)).toHaveLength(2);
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

  it("reports an incomplete OpenAI stream with its provider stop reason", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          'data: {"type":"response.output_text.delta","delta":"<!doctype html><html>"}\n\n',
        ));
        controller.enqueue(encoder.encode(
          'data: {"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":100,"output_tokens":32000}}}\n\n',
        ));
        controller.close();
      },
    });

    await expect(readOpenAiResponseStream(new Response(body))).resolves.toMatchObject({
      stopReason: "max_output_tokens",
      inputTokens: 100,
      outputTokens: 32000,
    });
  });

  it("keeps ingestion validation bounded while exercising an available child-visible playthrough", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    expect(source).toContain("NODE_REGISTRY");
    expect(source).toContain("activity_ready");
    expect(source).toContain("pageErrors");
    expect(source).toContain("SUNNY_VALIDATION_HOOKS");
    expect(source).toContain("playthrough_completion_missing");
    for (const removed of [
      "directArtifactContractFailures",
      "repairDirectArtifactsOnce",
      "runDirectAcceptanceRepairLoop",
    ]) expect(source).not.toContain(removed);
    expect(source).not.toContain("qa_visible_control_missing");
    expect(source).toContain("first_action_not_visible");
    expect(source).toContain("primary_control_clipped");
    expect(source).toContain("{ width: 1280, height: 720 }");
    expect(source).toContain('htmlStyle.overflowX !== "hidden" && bodyStyle.overflowX !== "hidden"');
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

  it("does not rebuild complete prior-contract HTML merely because the opening contract improved", () => {
    expect(shouldReuseDirectArtifact({
      htmlComplete: true,
      savedPromptHash: "contract-13",
      expectedPromptHash: "contract-14",
      compatiblePromptHashes: ["contract-13"],
    })).toBe(true);
  });

  it("checkpoints each complete artifact immediately so resume does not regenerate it", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    const generation = source.slice(source.indexOf("export async function generateDirectArtifacts"), source.indexOf("export function persistDirectExperience"));
    expect(generation).toContain("fs.writeFileSync(metadataPath");
    expect(generation.indexOf("fs.writeFileSync(htmlPath")).toBeLessThan(generation.indexOf("fs.writeFileSync(metadataPath"));
    expect(source).toContain("const isContinuation = Boolean(checkpoint.boardCreativeSpine)");
  });

  it("preserves original paid generation metrics when an artifact is reused", () => {
    expect(preserveDirectArtifactGenerationMetrics(undefined, {
      generationElapsedMs: 321_000,
      inputTokens: 6_000,
      outputTokens: 18_000,
    })).toEqual({
      generationElapsedMs: 321_000,
      inputTokens: 6_000,
      outputTokens: 18_000,
    });

    expect(preserveDirectArtifactGenerationMetrics({
      html: "<!doctype html><html></html>",
      elapsedMs: 10_000,
      inputTokens: 100,
      outputTokens: 200,
    }, {
      generationElapsedMs: 321_000,
      inputTokens: 6_000,
      outputTokens: 18_000,
    })).toEqual({
      generationElapsedMs: 10_000,
      inputTokens: 100,
      outputTokens: 200,
    });
  });

  it("defers the optional bonus instead of building it during baseline ingestion", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    const generation = source.slice(
      source.indexOf("export async function generateDirectArtifacts"),
      source.indexOf("export function persistDirectExperience"),
    );
    expect(generation).not.toContain("[bonus-built]");
    expect(generation).not.toContain('purpose: "practice_only_bonus"');
  });

  it("rechecks implementation prompt hashes while reusing frozen board artwork", () => {
    const ingestion = fs.readFileSync(path.join(process.cwd(), "src/scripts/ingestMathDirect.ts"), "utf8");
    expect(ingestion).toContain("existingBuild");
    expect(ingestion).toContain("existingArtworkUrls");
    expect(ingestion).toContain("generateDirectArtifacts({");
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
    const create = stagedPlannerCreate();
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

  it("preserves Planner-authored shared foundation nodes outside both agency routes", () => {
    const program = learningProgram(5);
    program.activities[0].routeId = "shared";
    // Simulate the exact provider inconsistency caught by the coin ingestion:
    // a stale duplicated node list must not override the activity's authority.
    program.fork.routes[0].nodeIds = [program.activities[0].id, program.activities[2].id];

    const parsed = parseMathLearningProgram(program);

    expect(parsed.activities[0]).toMatchObject({ id: program.activities[0].id, routeId: "shared" });
    expect(parsed.fork.routes.flatMap((route) => route.nodeIds)).not.toContain(program.activities[0].id);
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

  it("uses dedicated board thumbnails instead of shrinking opening screenshots", () => {
    const parsed = parseDirectLearningExperiencePlan(plan(2));
    const artifacts = parsed.activities.map((activity) => ({
      childId: "reina",
      homeworkId: "hw-math-thumbnails",
      nodeId: activity.id,
      title: activity.title,
      htmlPath: `/tmp/${activity.id}.html`,
      artworkUrl: "/generated/background.jpeg",
      thumbnailUrl: `/generated/${activity.id}-thumbnail.jpeg`,
      creatorPrompt: activity.creatorPrompt,
      promptHash: `hash-${activity.id}`,
      plannerModel: "claude-opus-5",
      creatorModel: "claude-opus-5",
    }));
    const session = buildDirectActiveSessionPlan({
      childId: "reina",
      homeworkId: "hw-math-thumbnails",
      plan: parsed,
      artifacts,
      backgroundUrl: "/generated/background.jpeg",
      questArtworkUrl: "/generated/quest.jpeg",
      bossArtworkUrl: "/generated/boss.jpeg",
      report: {
        passed: true,
        failures: [],
        screenshots: parsed.activities.map((activity) => `/tmp/${activity.id}-opening.png`),
      },
    });

    expect(session.nodePlan[0]?.thumbnailUrl).toBe("/generated/activity-1-thumbnail.jpeg");
    expect(session.adventureBoard?.nodes.find((node) => node.id === "activity-1")?.thumbnailUrl)
      .toBe("/generated/activity-1-thumbnail.jpeg");
  });

  it("requests circular-safe destination art rather than UI screenshots", () => {
    const prompt = createDirectBoardThumbnailPrompt(plan(2).activities[0]);

    expect(prompt).toContain("strong foreground/background contrast");
    expect(prompt).toContain("cropped into a small circle");
    expect(prompt).toContain("Do not include words, letters, numbers, equations");
    expect(prompt).toContain("not an activity screenshot");
  });

  it("turns creative board direction into scenery-only artwork", () => {
    const prompt = createDirectBoardBackgroundPrompt(
      "A warm clocktower map. All text uses a rounded face and every prompt has a speaker icon that reads it aloud.",
    );

    expect(prompt).toContain("A warm clocktower map");
    expect(prompt).toContain("scenery only");
    expect(prompt).toContain("Do not include words, letters, numbers");
  });

  it("content-versions thumbnail filenames so replacement art cannot stay browser-cached", () => {
    const activity = plan(2).activities[0];
    const first = createDirectBoardThumbnailFilename("hw-math-cache", activity);
    const repeated = createDirectBoardThumbnailFilename("hw-math-cache", activity);
    const revised = createDirectBoardThumbnailFilename("hw-math-cache", {
      ...activity,
      title: `${activity.title} revised`,
    });

    expect(first).toBe(repeated);
    expect(first).toMatch(/^hw-math-cache-activity-1-thumbnail-[a-f0-9]{12}\.jpeg$/);
    expect(revised).not.toBe(first);
  });
});
