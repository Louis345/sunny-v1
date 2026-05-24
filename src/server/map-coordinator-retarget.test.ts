import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { NodeConfig, NodeResult } from "../shared/adventureTypes";
import { retargetFuturePracticeNodes } from "./map-coordinator";

describe("map coordinator target retargeting", () => {
  it("records evidence without rewriting future session-plan targets", () => {
    const completedNode: NodeConfig = {
      id: "n-mystery",
      type: "mystery",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 1,
      words: ["ahead", "away"],
    };
    const futurePractice: NodeConfig = {
      id: "n-monster-stampede",
      type: "monster-stampede",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 1,
      words: ["ahead", "away"],
    };
    const nodes: NodeConfig[] = [completedNode, futurePractice];
    const result: NodeResult = {
      nodeId: completedNode.id,
      completed: true,
      accuracy: 0.5,
      timeSpent_ms: 1000,
      wordsAttempted: 2,
      correctWords: ["away"],
      missedWords: ["ahead"],
      targetResults: [
        { target: "away", correct: true, attempts: 1 },
        { target: "ahead", correct: false, attempts: 2 },
      ],
    };

    const diff = retargetFuturePracticeNodes(nodes, completedNode, result);

    expect(diff.reason).toBe("session plan remains authoritative; evidence saved for next plan");
    expect(diff.changedNodeIds).toEqual([]);
    expect(futurePractice.words).toEqual(["ahead", "away"]);
  });

  it("does not keep source code paths that rewrite launched node targets", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/server/map-coordinator.ts"), "utf8");

    expect(source).not.toContain("[domain-oracle] [retarget]");
    expect(source).not.toContain("nextNode.words = selectedWords");
    expect(source).not.toContain("questNode.words =");
    expect(source).not.toContain("quest_words updated");
    expect(source).not.toContain("future practice retargeted");
  });

  it("does not keep runtime planner fallbacks or activity-plan repairs", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/server/map-coordinator.ts"), "utf8");

    expect(source).not.toContain("draftPsychologistExperiencePlan");
    expect(source).not.toContain("buildExperiencePlannerInput");
    expect(source).not.toContain("writeActiveSessionPlan");
    expect(source).not.toContain("activeSessionPlanRefreshReason");
    expect(source).not.toContain("validateHomeworkMapActivityPlan");
    expect(source).not.toContain("repairBlockedHomeworkMapActivityPlan");
    expect(source).not.toContain("homeworkOnlySelectionPlan");
    expect(source).not.toContain("selectHomeworkSessionWords");
    expect(source).not.toContain("buildMysteryChoiceNodeData");
    expect(source).not.toContain("[fallback-legacy]");
  });
});
