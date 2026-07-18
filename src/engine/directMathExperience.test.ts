import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  EXPERIENCE_DESIGN_CONSTITUTION,
  askDirectMathPlanner,
  applyDirectArtifactEdits,
  acceptanceScriptBody,
  boardPosition,
  buildDirectActiveSessionPlan,
  buildDirectActivityCreatorPrompt,
  buildDirectActivityRepairPrompt,
  buildDirectLearningCycleInput,
  creatorPromptHash,
  directArtifactContractFailures,
  hasReadyDirectMathExperience,
  isCompleteGeneratedHtml,
  parseDirectLearningExperiencePlan,
  routeNodePosition,
  shouldReuseDirectArtifact,
  normalizeDirectArtifactEdits,
  normalizeGeneratedHtml,
  runDirectAcceptanceRepairLoop,
} from "./directMathExperience";

function plan(activityCount = 3) {
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
    questions: [{ id: "q1", prompt: "5 x 2 = ?", options: [{ label: "10", correct: true }, { label: "15", correct: false }] }],
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
      evidenceLimit: "calibrated_mastery",
    },
    preserve: ["clear progress"],
    change: ["make the learning target larger"],
    explore: ["short optional demonstration"],
    avoid: ["hidden drag mechanics"],
    measurementKeys: ["interaction.timeToFirstValidActionMs", "interaction.demoRequested"],
    acceptanceScript: `
      const wrong = document.querySelector('[data-testid="answer-wrong"]');
      const correct = document.querySelector('[data-testid="answer-correct"]');
      if (!(wrong instanceof HTMLElement) || !(correct instanceof HTMLElement)) throw new Error('answers missing');
      wrong.click();
      correct.click();
      return { passed: true };
    `,
  }));
  return {
    planId: "direct-plan-1",
    title: "Multiplication Adventure",
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
  it("asks the same Planner once to complete an invalid board instead of blocking ingestion", async () => {
    const validPlan = plan(4);
    const create = vi.fn()
      .mockResolvedValueOnce({ content: [{ type: "tool_use", name: "create_learning_experience_plan", input: { ...validPlan, activities: [] } }] })
      .mockResolvedValueOnce({ content: [{ type: "tool_use", name: "create_learning_experience_plan", input: validPlan }] });
    const parsed = await askDirectMathPlanner({
      childId: "reina",
      chart: {
        identity: {}, demographics: {}, engagementTheory: null, factBankSummary: {},
        learningProfile: { rewardPreferences: [], sessionStats: {}, activityModel: {}, activityTraitModel: {} },
        decisionTrace: { latest: null },
      } as never,
      extraction: { fullText: "Multiplication assignment" } as never,
      client: { messages: { create } } as never,
    });
    expect(parsed.activities).toHaveLength(4);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0]?.messages?.[0]?.content).toContain("direct_plan_requires_activities");
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

  it("keeps the planner-selected activity count instead of forcing two nodes", () => {
    expect(parseDirectLearningExperiencePlan(plan(3)).activities).toHaveLength(3);
    expect(parseDirectLearningExperiencePlan(plan(5)).activities).toHaveLength(5);
  });

  it("preregisters academic predictions separately from UX design predictions", () => {
    const parsed = parseDirectLearningExperiencePlan(plan(3));
    const artifacts = parsed.activities.map((activity) => ({
      childId: "reina", homeworkId: "hw-math-test", nodeId: activity.id, title: activity.title,
      htmlPath: `/games/${activity.id}.html`, artworkUrl: `/art/${activity.id}.png`,
      acceptanceScript: activity.acceptanceScript, creatorPrompt: activity.creatorPrompt, promptHash: activity.id,
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
    expect(source).toContain("SUNNY_PLANNER_MAX_TOKENS ?? 20000");
    expect(source).toContain("SUNNY_GENERATION_MAX_TOKENS ?? 12000");
  });

  it("requires every route to cover every AI-declared responsibility in a coherent order", () => {
    const complete = plan(4);
    complete.learningResponsibilities = [
      { id: "facts", title: "Fact Relationships", purpose: "Reason through x2, x5, and x10 facts.", academicTarget: "multiplication facts" },
      { id: "stories", title: "Equal-Group Stories", purpose: "Translate equal-group stories into multiplication.", academicTarget: "word problems" },
    ];
    complete.activities.forEach((activity, index) => {
      const responsibility = index < 2 ? complete.learningResponsibilities[0]! : complete.learningResponsibilities[1]!;
      activity.responsibilityId = responsibility.id;
      activity.academicTarget = responsibility.academicTarget;
    });
    const parsed = parseDirectLearningExperiencePlan(complete);
    expect(parsed.activities).toHaveLength(4);
    expect(parsed.activities.map((activity) => activity.learningPurpose)).toEqual([
      complete.learningResponsibilities[0]!.purpose,
      complete.learningResponsibilities[0]!.purpose,
      complete.learningResponsibilities[1]!.purpose,
      complete.learningResponsibilities[1]!.purpose,
    ]);

    const incomplete = structuredClone(complete);
    incomplete.activities[3]!.responsibilityId = "facts";
    incomplete.activities[3]!.academicTarget = "multiplication facts";
    expect(() => parseDirectLearningExperiencePlan(incomplete))
      .toThrow("direct_plan_route_missing_responsibility:route-b:stories");

    const outOfOrder = structuredClone(complete);
    [outOfOrder.activities[0]!.responsibilityId, outOfOrder.activities[2]!.responsibilityId] = [
      outOfOrder.activities[2]!.responsibilityId,
      outOfOrder.activities[0]!.responsibilityId,
    ];
    [outOfOrder.activities[0]!.academicTarget, outOfOrder.activities[2]!.academicTarget] = [
      outOfOrder.activities[2]!.academicTarget,
      outOfOrder.activities[0]!.academicTarget,
    ];
    expect(() => parseDirectLearningExperiencePlan(outOfOrder))
      .toThrow("direct_plan_route_responsibility_order_invalid:route-a");
  });

  it("accepts an AI-selected curriculum with three responsibilities and six activities", () => {
    const variable = plan(6);
    variable.learningResponsibilities = [
      { id: "facts", title: "Fact Relationships", purpose: "Reason through multiplication facts.", academicTarget: "facts" },
      { id: "groups", title: "Equal Groups", purpose: "Build equal groups.", academicTarget: "groups" },
      { id: "stories", title: "Story Translation", purpose: "Translate stories into multiplication.", academicTarget: "stories" },
    ];
    variable.activities.forEach((activity, index) => {
      const responsibility = variable.learningResponsibilities[Math.floor(index / 2)]!;
      activity.responsibilityId = responsibility.id;
      activity.academicTarget = responsibility.academicTarget;
    });
    expect(parseDirectLearningExperiencePlan(variable).activities).toHaveLength(6);
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
      acceptanceScript: activity.acceptanceScript,
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
    expect(prompt).toContain(JSON.stringify(activity.questions, null, 2));
    expect(prompt).toContain("render the next question synchronously");
    expect(prompt).toContain("separate reward marker");
    expect(prompt).toContain('data-testid="primary-instruction"');
    expect(prompt).toContain('data-testid="sound-toggle"');
    expect(prompt).toContain('type:"activity_ready"');
    expect(prompt).toContain('type:"game_state_update"');
    expect(prompt).toContain("currentChallenge");
    expect(prompt).toContain("Never include which action is correct");
    expect(prompt).toContain('type:"progress_event"');
  });

  it("requires generated artifacts to contain sound and the factual runtime protocol", () => {
    const valid = `<!doctype html><html><body><p data-testid="primary-instruction">Tap a group to begin.</p><button data-testid="sound-toggle">Sound</button><script>const audio=new AudioContext();window.parent.postMessage({type:"activity_ready"},"*");window.parent.postMessage({type:"game_state_update"},"*");window.parent.postMessage({type:"attempt_event"},"*");window.parent.postMessage({type:"progress_event"},"*");window.parent.postMessage({type:"node_complete"},"*");</script></body></html>`;
    expect(directArtifactContractFailures(valid)).toEqual([]);
    expect(directArtifactContractFailures("<!doctype html><html><body></body></html>")).toEqual([
      "primary_instruction_missing",
      "sound_toggle_missing",
      "audio_implementation_missing",
      "activity_ready_event_missing",
      "game_state_update_missing",
      "attempt_event_missing",
      "progress_event_missing",
      "node_complete_event_missing",
    ]);
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

  it("gives the same Creator one bounded implementation-only repair prompt", () => {
    const activity = parseDirectLearningExperiencePlan(plan(3)).activities[0]!;
    const prompt = buildDirectActivityRepairPrompt({
      activity,
      html: "<!doctype html><html><body>broken</body></html>",
      failures: ["activity-1:browser_error:missing element"],
    });
    expect(prompt).toContain("implementation only");
    expect(prompt).toContain("activity-1:browser_error:missing element");
    expect(prompt).toContain(activity.creatorPrompt);
    expect(prompt).toContain("Do not change the questions");
    expect(prompt).toContain("oldText");
    expect(prompt).toContain("next tested state must be usable synchronously");
    expect(prompt).toContain("stationary interactive hit target");
    expect(prompt).not.toContain("Return one complete raw HTML document");
  });

  it("applies only unique exact replacements to a generated artifact", () => {
    const html = "<!doctype html><html><style>.answer{animation:bob 2s infinite}</style><button>7</button></html>";
    expect(applyDirectArtifactEdits(html, [{
      oldText: ".answer{animation:bob 2s infinite}",
      newText: ".answer{animation:none}",
    }])).toBe("<!doctype html><html><style>.answer{animation:none}</style><button>7</button></html>");
  });

  it("rejects ambiguous or invented surgical repair anchors", () => {
    expect(() => applyDirectArtifactEdits("same same", [{ oldText: "same", newText: "fixed" }]))
      .toThrow("direct_activity_repair_anchor_ambiguous");
    expect(() => applyDirectArtifactEdits("<html></html>", [{ oldText: "missing", newText: "fixed" }]))
      .toThrow("direct_activity_repair_anchor_missing");
  });

  it("normalizes harmless AI tool wrappers before validating exact edits", () => {
    const edit = { oldText: "animation:bob", newText: "animation:none" };
    expect(normalizeDirectArtifactEdits({ edits: { "0": edit } })).toEqual([edit]);
    expect(normalizeDirectArtifactEdits({ edits: JSON.stringify([edit]) })).toEqual([edit]);
    expect(normalizeDirectArtifactEdits({ edits: `\`\`\`json\n${JSON.stringify([edit])}\n\`\`\`` })).toEqual([edit]);
  });

  it("repairs and reruns the same frozen acceptance until it passes", async () => {
    let runs = 0;
    const repair = vi.fn(async () => 1);
    const report = await runDirectAcceptanceRepairLoop({
      runAcceptance: async () => ({ passed: ++runs >= 3, failures: runs >= 3 ? [] : [`node:failure-${runs}`], screenshots: [] }),
      repair,
      maxRepairs: 5,
    });
    expect(report.passed).toBe(true);
    expect(repair).toHaveBeenCalledTimes(2);
  });

  it("caps surgical repair attempts instead of looping forever", async () => {
    const repair = vi.fn(async () => 1);
    const report = await runDirectAcceptanceRepairLoop({
      runAcceptance: async () => ({ passed: false, failures: ["node:still-broken"], screenshots: [] }),
      repair,
      maxRepairs: 5,
    });
    expect(report.passed).toBe(false);
    expect(repair).toHaveBeenCalledTimes(5);
  });

  it("keeps the bounded browser loop alive when one AI patch names a missing anchor", async () => {
    let runs = 0;
    const repair = vi.fn()
      .mockRejectedValueOnce(new Error("direct_activity_repair_anchor_missing"))
      .mockResolvedValue(1);
    const report = await runDirectAcceptanceRepairLoop({
      runAcceptance: async () => ({ passed: ++runs >= 3, failures: runs >= 3 ? [] : ["node:contract-failure"], screenshots: [] }),
      repair,
      maxRepairs: 5,
    });
    expect(report.passed).toBe(true);
    expect(repair).toHaveBeenCalledTimes(2);
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

  it("requires the planner to author an executable acceptance test before UI generation", () => {
    const missing = plan();
    delete (missing.activities[0] as Partial<(typeof missing.activities)[number]>).acceptanceScript;
    expect(() => parseDirectLearningExperiencePlan(missing)).toThrow("direct_plan_missing_acceptanceScript");
  });

  it("unwraps a planner-authored async acceptance function before execution", () => {
    const wrapped = "async function({ page, BASE_URL }) { await page.goto(BASE_URL); return { passed: true }; }";
    const body = acceptanceScriptBody(wrapped);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

    expect(body).toBe("await page.goto(BASE_URL); return { passed: true };");
    expect(() => new AsyncFunction("page", "BASE_URL", body)).not.toThrow();
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

  it("loads prior direct outcomes before asking the Planner for a new program", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/ingestMathDirect.ts"), "utf8");
    expect(source).toContain("interpretPendingDirectExperienceOutcomes");
    expect(source).toContain("readDirectFeedbackContext");
    expect(source).toContain("priorOutcomes");
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
      "AI Planner's saved questions and correct answers faithfully",
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
