import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  EXPERIENCE_DESIGN_CONSTITUTION,
  applyDirectArtifactEdits,
  acceptanceScriptBody,
  boardPosition,
  buildDirectActivityCreatorPrompt,
  buildDirectActivityRepairPrompt,
  creatorPromptHash,
  hasReadyDirectMathExperience,
  isCompleteGeneratedHtml,
  parseDirectLearningExperiencePlan,
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
  it("keeps the planner-selected activity count instead of forcing two nodes", () => {
    expect(parseDirectLearningExperiencePlan(plan(3)).activities).toHaveLength(3);
    expect(parseDirectLearningExperiencePlan(plan(5)).activities).toHaveLength(5);
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
  });
});
