import { describe, expect, it } from "vitest";
import { getChildChart } from "../profiles/childChart";
import {
  detectBaselineShellGap,
  formatBaselineShellGapMessage,
  selectPreferredBaselineShell,
  baselineShellMatchesNodeContract,
  type BaselineShellMatch,
} from "./baselineShellGap";
import type { ContentFeedbackLesson } from "./contentFeedbackMemory";

describe("baselineShellGap", () => {
  it("reuses clock-game and coin-counter for time/money homework", () => {
    const chart = getChildChart("qa_map");
    const gap = detectBaselineShellGap({
      chart,
      homeworkId: "hw-math-1",
      domain: "math",
      title: "Telling Time and Money",
      conceptText: "Read the clock and count coins for each word problem.",
    });
    expect(gap.needsGeneration).toBe(false);
    expect(gap.matchedShells).toEqual(expect.arrayContaining(["clock-game", "coin-counter"]));
    expect(formatBaselineShellGapMessage(gap)).toContain("Matched existing baseline shells");
  });

  it("detects multiplication gap", () => {
    const chart = getChildChart("qa_map");
    const gap = detectBaselineShellGap({
      chart,
      homeworkId: "hw-math-2",
      domain: "math",
      title: "Multiplication Facts x2 x5 x10",
      conceptText: "Solve equal groups multiplication facts within 100.",
    });
    expect(gap.needsGeneration).toBe(true);
    expect(gap.skillTarget).toBe("multiplication_fluency");
    expect(formatBaselineShellGapMessage(gap)).toContain("generating candidates");
  });

  it("recognizes approved generated math shells by their cataloged skill target", () => {
    const chart = getChildChart("reina");
    const gap = detectBaselineShellGap({
      chart,
      homeworkId: "hw-math-6b68e575",
      domain: "math",
      title: "Pashley multiplication facts",
      conceptText: "5 x 2, 5 x 5, 5 x 10, and equal-groups word problems.",
    });

    expect(gap.needsGeneration).toBe(false);
    expect(gap.matchedShells).toContain("generated-baseline");
  });
});

describe("selectPreferredBaselineShell", () => {
  const shells: BaselineShellMatch[] = [
    {
      activityId: "generated-baseline",
      nodeType: "generated-baseline",
      source: "generated_shell",
      contentId: "hw-1:generated-baseline:brief-a",
      gameHtmlPath: "/tmp/a.html",
      title: "Shell A",
    },
    {
      activityId: "generated-baseline",
      nodeType: "generated-baseline",
      source: "generated_shell",
      contentId: "hw-1:generated-baseline:brief-b",
      gameHtmlPath: "/tmp/b.html",
      title: "Shell B",
    },
  ];
  const lesson = (partial: Partial<ContentFeedbackLesson>): ContentFeedbackLesson => ({
    ts: "2026-07-10T00:00:00.000Z",
    childId: "demo-pashley",
    source: "vitality",
    ...partial,
  });

  it("excludes retired shells", () => {
    const picked = selectPreferredBaselineShell(shells, [
      lesson({ contentId: "hw-1:generated-baseline:brief-a", verdict: "retire" }),
    ]);
    expect(picked?.contentId).toBe("hw-1:generated-baseline:brief-b");
  });

  it("prefers strong-verdict shells", () => {
    const picked = selectPreferredBaselineShell(shells, [
      lesson({ contentId: "hw-1:generated-baseline:brief-b", verdict: "strong" }),
    ]);
    expect(picked?.contentId).toBe("hw-1:generated-baseline:brief-b");
  });

  it("child choice lessons boost the chosen shell", () => {
    const picked = selectPreferredBaselineShell(shells, [
      lesson({ contentId: "hw-1:generated-baseline:brief-b", source: "child_choice", decision: "approve" }),
      lesson({ contentId: "hw-1:generated-baseline:brief-b", source: "child_choice", decision: "approve" }),
    ]);
    expect(picked?.contentId).toBe("hw-1:generated-baseline:brief-b");
  });

  it("returns undefined when every shell is retired", () => {
    const picked = selectPreferredBaselineShell(shells, [
      lesson({ contentId: "hw-1:generated-baseline:brief-a", verdict: "retire" }),
      lesson({ contentId: "hw-1:generated-baseline:brief-b", decision: "reject", source: "human_review" }),
    ]);
    expect(picked).toBeUndefined();
  });
});

describe("exact baseline contract reuse", () => {
  it("rejects config-only reuse when visible identity or runtime contracts differ", () => {
    const contract = {
      nodeId: "facts", role: "baseline" as const, title: "Fact Blaster", state: "blocked" as const,
      academicTarget: { domain: "math", skill: "multiplication_fluency", targets: ["2x5"] }, algorithmOwner: "retrieval-practice",
      theoryId: "theory", experimentId: "experiment", mechanic: "fact-retrieval-speed", theme: "space arcade",
      openingScreen: { title: "Fact Blaster", purpose: "Practice facts" }, generationPrompt: null, artifactBinding: null,
      artwork: { status: "ready" as const, localPath: "/generated/facts.png", prompt: null },
      sfxContract: ["tap", "correct", "incorrect", "progress", "complete"], companionContract: { events: ["session_complete"] },
      evidenceContract: { academic: true, engagement: true, companionObservations: true }, evidenceIds: [],
    };
    const shell: BaselineShellMatch = { activityId: "generated-baseline", nodeType: "generated-baseline", source: "generated_shell", title: "Rocket Launch Countdown", domain: "math", skillTarget: "multiplication_fluency", mechanic: "countdown", theme: "space arcade", targetConcepts: ["2x5"], validationPassed: true, artworkStatus: "generated", sfxProfile: "tap-correct-incorrect-progress-complete", companionPolicy: "session_complete", evidenceHooks: ["academic", "engagement", "companion"] };
    expect(baselineShellMatchesNodeContract(shell, contract)).toEqual({ matches: false, reasons: expect.arrayContaining(["title", "mechanic"]) });
  });
});
