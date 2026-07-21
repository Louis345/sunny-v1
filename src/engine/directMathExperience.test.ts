import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  EXPERIENCE_DESIGN_CONSTITUTION,
  DIRECT_MATH_PLANNER_TOOL_SCHEMA,
  askDirectMathPlanner,
  boardPosition,
  buildDirectActiveSessionPlan,
  buildDirectActivityCreatorPrompt,
  buildDirectLearningCycleInput,
  creatorPromptHash,
  hasReadyDirectMathExperience,
  isCompleteGeneratedHtml,
  parseDirectLearningExperiencePlan,
  routeNodePosition,
  shouldReuseDirectArtifact,
  normalizeGeneratedHtml,
} from "./directMathExperience";

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
        { id: "route-a", label: "Strategy Trail", promise: "Outthink the challenge", engagementVariable: "strategy", nodeIds: activities.filter((a) => a.routeId === "route-a").map((a) => a.id) },
        { id: "route-b", label: "Builder Trail", promise: "Build the solution", engagementVariable: "visual", nodeIds: activities.filter((a) => a.routeId === "route-b").map((a) => a.id) },
      ],
    },
    activities,
    quest: { title: "Quest", locked: true, teaser: "A hidden expedition awaits.", artworkPrompt: "Mysterious portal adventure icon" },
    boss: { title: "Boss", locked: true, teaser: "A legendary finale waits beyond the Quest.", artworkPrompt: "Epic child-safe fantasy guardian icon" },
  };
}

describe("direct math experience", () => {
  it("blocks an invalid Planner response without starting an AI repair loop", async () => {
    const validPlan = plan(4);
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", name: "create_learning_experience_plan", input: { ...validPlan, activities: [] } }],
    });
    await expect(askDirectMathPlanner({
      childId: "reina",
      chart: {
        identity: {}, demographics: {}, engagementTheory: null, factBankSummary: {},
        learningProfile: { rewardPreferences: [], sessionStats: {}, activityModel: {}, activityTraitModel: {} },
        decisionTrace: { latest: null },
      } as never,
      extraction: { fullText: "Multiplication assignment" } as never,
      client: { messages: { create } } as never,
    })).rejects.toThrow("direct_plan_requires_activities");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("includes prior prediction errors and theory decisions in the next Planner prompt", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "tool_use", name: "create_learning_experience_plan", input: plan(3) }] });
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
      client: { messages: { create } } as never,
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
    const schema = DIRECT_MATH_PLANNER_TOOL_SCHEMA as any;
    expect(schema.required).toContain("activities");
    expect(schema.properties.activities.minItems).toBe(1);
    expect(schema.properties.activities.maxItems).toBeUndefined();
    expect(schema.properties.activities.items.properties.items.maxItems).toBeUndefined();
    expect(schema.properties.activities.items.properties.mechanic.enum).toBeUndefined();
    expect(schema.properties.activities.items.properties.items.items.properties.response.oneOf).toHaveLength(4);
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
    expect(source).toContain("decompose the assignment into distinct learning responsibilities");
    expect(source).toContain("Give each activity one primary learning responsibility");
    expect(source).toContain("never return an empty activity list");
    expect(source).toContain("There is no fixed activity count");
    expect(source).not.toContain("Generate exactly four activities");
    expect(source).not.toContain("Both routes must cover every declared responsibility");
    expect(source).not.toContain("for every responsibility on each route");
    expect(source).not.toContain("bespoke vibrant game world");
    expect(source).not.toContain("Every math question must have exactly one correct answer");
    expect(source).toContain("Every responsibility, route, activity, item, and selection option must have its own non-empty stable id");
    expect(source).not.toContain("math.multiplication.equal_groups");
    expect(source).not.toContain("calibrated_mastery\"}");
    expect(source).toContain("SUNNY_PLANNER_MAX_TOKENS ?? 20000");
    expect(source).toContain("SUNNY_GENERATION_MAX_TOKENS ?? 12000");
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

  it("keeps usability constraints stable without fixing activity count, mechanics, or themes", () => {
    expect(EXPERIENCE_DESIGN_CONSTITUTION).toContain("visually dominant and readable");
    expect(EXPERIENCE_DESIGN_CONSTITUTION).toContain("Show me");
    expect(EXPERIENCE_DESIGN_CONSTITUTION).toContain("visible sound toggle");
    expect(EXPERIENCE_DESIGN_CONSTITUTION).toContain("Keep required input targets stationary");
    expect(EXPERIENCE_DESIGN_CONSTITUTION).toContain("visible activity title");
    expect(EXPERIENCE_DESIGN_CONSTITUTION).toContain("load the assigned artwork URL");
    expect(EXPERIENCE_DESIGN_CONSTITUTION).not.toContain("exactly two activities");
    expect(EXPERIENCE_DESIGN_CONSTITUTION).not.toContain("Gearlock");
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

  it("hands the exact Planner prompt and constitution to the Creator", () => {
    const activity = parseDirectLearningExperiencePlan(plan(3)).activities[0]!;
    const prompt = buildDirectActivityCreatorPrompt({
      activity,
      artworkUrl: "/generated/activity.jpeg",
      childId: "reina",
    });
    expect(prompt).toContain(EXPERIENCE_DESIGN_CONSTITUTION);
    expect(prompt).toContain(activity.creatorPrompt);
    expect(prompt).toContain("Keep the complete HTML under 18,000 characters");
    expect(prompt).toContain("must visibly render the assigned artwork URL");
    expect(prompt).not.toContain("Saved items/content:");
    expect(prompt).not.toContain("demoReplayCount");
    expect(prompt).not.toContain("sunny-qa-actions");
    expect(prompt).not.toContain("data-testid");
    expect(prompt).toContain('type:"activity_ready"');
    expect(prompt).toContain('type:"game_state_update"');
    expect(prompt).toContain("currentChallenge");
    expect(prompt).toContain("Never expose answers");
    expect(prompt).toContain('type:"progress_event"');
  });

  it("uses one bounded Creator attempt without an identical retry", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    const creator = source.slice(source.indexOf("async function generateActivityHtml"), source.indexOf("export async function generateDirectArtifacts"));
    expect(creator.match(/messages\.create\(/g)).toHaveLength(1);
    expect(creator).not.toContain("for (let attempt");
    expect(creator).not.toContain("generation-retry");
  });

  it("keeps ingestion validation to a launch-and-readiness smoke check", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    expect(source).toContain("NODE_REGISTRY");
    expect(source).toContain('message?.type === "activity_ready"');
    expect(source).toContain("artifact.title");
    expect(source).toContain("pageErrors");
    for (const removed of [
      "DirectQaAction",
      "extractDirectQaActions",
      "directArtifactContractFailures",
      "sunny-qa-actions",
      "primary_instruction_not_visible",
      "sound_toggle_not_visible",
      "artwork_not_rendered",
      "attempt_evidence_missing",
      "progress_evidence_missing",
      "completion_evidence_missing",
      "completion-badge",
    ]) expect(source).not.toContain(removed);
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
      content: [{ type: "tool_use", name: "create_learning_experience_plan", input: plan(3) }],
    });
    await askDirectMathPlanner({
      childId: "reina",
      chart: {
        identity: {}, demographics: {}, engagementTheory: null, factBankSummary: {},
        learningProfile: { rewardPreferences: [], sessionStats: {}, activityModel: {}, activityTraitModel: {} },
        decisionTrace: { latest: null },
      } as never,
      extraction: { fullText: "Multiplication assignment" } as never,
      client: { messages: { create } } as never,
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

  it("keeps the browser smoke check mechanic-agnostic and free of generated test scripts", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    expect(source).not.toContain("extractDirectQaActions");
    expect(source).not.toContain("action.testId");
    expect(source).not.toContain("sunny-qa-actions");
    for (const forbidden of ["acceptanceScript", "repairDirectArtifactsOnce", "runDirectAcceptanceRepairLoop", "applyDirectArtifactEdits"]) {
      expect(source).not.toContain(forbidden);
    }
    const entrypoint = fs.readFileSync(path.join(process.cwd(), "src/scripts/ingestMathDirect.ts"), "utf8");
    expect(entrypoint).not.toContain("repairDirectArtifactsOnce");
    expect(entrypoint).not.toContain("runDirectAcceptanceRepairLoop");
    expect(entrypoint.match(/runDirectPlaywrightAcceptance\(/g)).toHaveLength(1);
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

  it("gives the Planner and Creator the child-visible clarity and practice-only rules", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/directMathExperience.ts"), "utf8");
    for (const required of [
      "understandable within ten seconds",
      "optional visible demonstration",
      "A question asking “how many” must accept the final quantity",
      "one active problem at a time",
      "interaction, recovery, progress, and completion sounds",
      "teaching and practice evidence only",
      "Implement the saved ExperienceSpec faithfully",
    ]) expect(source).toContain(required);
    expect(source).not.toContain("Use the exact deterministic questions and answers from the specification.");
    expect(source).not.toContain("Sound may be included creatively but is not an acceptance requirement.");
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
});
