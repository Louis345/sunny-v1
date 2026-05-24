import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { ActiveSessionPlan, LearningProfile } from "../context/schemas/learningProfile";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import { runHomeworkSessionPreflight } from "./preflightHomeworkSession";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-preflight-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function profileWithWordRadarPlan(childId: string): LearningProfile {
  const profile = initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: ["spelling"],
  });
  profile.pendingHomework = {
    weekOf: "2026-05-23",
    homeworkId: "hw-word-radar-config",
    testDate: "2026-05-26",
    wordList: ["among"],
    generatedAt: "2026-05-23T12:00:00.000Z",
    contentProfile: {
      practiceDomain: "spelling",
      contentDomain: "language_arts",
      topic: "High frequency words",
      primarySkill: "word recognition",
      assignmentFormat: "word list",
      concepts: ["high-frequency words"],
      sourceEvidence: ["test fixture"],
    },
    capturedContent: null,
    completedAdventureNodeIds: [],
    nodes: [{
      id: "n-word-radar-hw-word-radar-config",
      type: "word-radar",
      words: ["among"],
      difficulty: 2,
      gameFile: null,
      storyFile: null,
    }],
  };
  profile.activeSessionPlan = {
    planId: "plan-missing-word-radar-config",
    childId,
    createdAt: "2026-05-23T12:00:00.000Z",
    source: "ingest_human_loop",
    activeHomeworkId: "hw-word-radar-config",
    domain: "spelling",
    testDate: "2026-05-26",
    nodePlan: [{
      id: "n-word-radar-hw-word-radar-config",
      type: "word-radar",
      activityId: "word-radar",
      targets: ["among"],
      difficulty: 2,
      source: "chart_planner",
    }],
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: "fixture",
      previousCompletedNodeCount: 0,
    },
    companionPolicy: {
      companionId: "elli",
      displayName: "Elli",
      openingLinePolicy: "context_start_short",
      verbosity: "low",
      maxMicroProbes: 1,
    },
    evidenceUsed: [{ id: "fixture", type: "assignment_source", summary: "Fixture" }],
    openQuestions: [],
    planTheory: {
      hypothesis: "Word Radar needs planner-authored mode config.",
      evidenceSummary: ["fixture"],
      intervention: "word radar",
      supportCriteria: ["config present"],
      reviseCriteria: ["config missing"],
      falsifyCriteria: ["runtime invents config"],
    },
  } satisfies ActiveSessionPlan;
  return profile;
}

function profileWithMissingAdventureSpine(childId: string): LearningProfile {
  const profile = profileWithWordRadarPlan(childId);
  profile.activeSessionPlan = {
    ...profile.activeSessionPlan!,
    planId: "plan-missing-adventure-spine",
    nodePlan: [{
      id: "n-word-radar-hw-word-radar-config",
      type: "word-radar",
      activityId: "word-radar",
      targets: ["among"],
      difficulty: 2,
      source: "chart_planner",
      wordRadarConfig: {
        recallMode: "partial_visual_recall",
        inputMode: "letter-by-letter",
        speakStyle: "option-a",
        showTimer: false,
        hideWordDuringResponse: true,
        requiresCapturedResponse: true,
      },
    }],
  };
  return profile;
}

describe("homework session preflight", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports missing planner-authored Word Radar config instead of letting runtime invent it", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithWordRadarPlan(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const report = runHomeworkSessionPreflight({ childId, rootDir: root });

    expect(report.issues.some((issue) => issue.code === "missing_word_radar_config")).toBe(true);
  });

  it("reports missing planner-owned Mystery, Quest, and Boss destinations", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithMissingAdventureSpine(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const report = runHomeworkSessionPreflight({ childId, rootDir: root });

    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "missing_mystery_choice",
      "missing_quest_destination",
      "missing_boss_destination",
    ]));
  });
});
