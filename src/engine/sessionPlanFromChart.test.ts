import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { getChildChart } from "../profiles/childChart";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import {
  buildAdventureMapFromSessionPlan,
  planHomeworkSessionFromChart,
  writeActiveSessionPlan,
} from "./sessionPlanFromChart";

const WORDS = [
  "above",
  "ago",
  "about",
  "ahead",
  "away",
  "alone",
  "alike",
  "awake",
  "along",
  "again",
];

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-chart-plan-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function profileWithHomework(childId: string): LearningProfile {
  const profile = initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: ["spelling"],
  });
  profile.pendingHomework = {
    weekOf: "2026-05-12",
    homeworkId: "hw-spelling_test-bb11de93",
    testDate: "2026-05-15",
    testDateSource: "cli",
    testDateConfirmed: true,
    returnTag: "#sunny_reina_hw_spelling_test_bb11de93",
    wordList: WORDS,
    generatedAt: "2026-05-12T10:00:00.000Z",
    contentProfile: {
      practiceDomain: "spelling",
      contentDomain: "spelling",
      topic: "Schwa sound and high-frequency words",
      primarySkill: "Spelling recall",
      assignmentFormat: "Spelling test",
      concepts: ["schwa", "high-frequency words"],
      sourceEvidence: ["worksheet"],
    },
    capturedContent: null,
    completedAdventureNodeIds: [
      "n-word-radar-hw-spelling_test-bb11de93",
      "n-spell-check-hw-spelling_test-bb11de93",
      "n-monster-stampede-hw-spelling_test-bb11de93",
      "n-pronunciation-hw-spelling_test-bb11de93",
      "n-mystery-hw-spelling_test-bb11de93",
    ],
    nodes: [
      {
        id: "n-word-radar-hw-spelling_test-bb11de93",
        type: "word-radar",
        words: WORDS.slice(0, 5),
        difficulty: 2,
        gameFile: null,
        storyFile: null,
      },
      {
        id: "n-spell-check-hw-spelling_test-bb11de93",
        type: "spell-check",
        words: WORDS.slice(5),
        difficulty: 2,
        gameFile: "spell-check.html",
        storyFile: null,
      },
      {
        id: "n-monster-stampede-hw-spelling_test-bb11de93",
        type: "monster-stampede",
        words: WORDS.slice(0, 5),
        difficulty: 2,
        gameFile: "monster-stampede.html",
        storyFile: null,
      },
      {
        id: "n-pronunciation-hw-spelling_test-bb11de93",
        type: "pronunciation",
        words: WORDS.slice(0, 5),
        difficulty: 2,
        gameFile: null,
        storyFile: null,
      },
      {
        id: "n-quest-hw-spelling_test-bb11de93",
        type: "quest",
        words: WORDS,
        difficulty: 3,
        gameFile: "quest.html",
        storyFile: null,
        adaptiveArtifact: {
          artifactId: "artifact-quest",
          contentId: "content-quest",
          homeworkId: "hw-spelling_test-bb11de93",
          theoryId: "theory-quest",
          generationStage: "quest",
          targetGroupIds: [],
          homeworkWordIds: [],
          baselineEvidenceIds: [],
          generatedPath: "quest.html",
          validationStatus: "failed",
          validationReport: {
            passed: false,
            score: 0.2,
            failures: ["answer leaked"],
            warnings: [],
            attempts: 2,
            validatedAt: "2026-05-12T10:30:00.000Z",
          },
        },
      },
    ],
  };
  profile.adaptiveLoadState = {
    spelling: {
      domain: "spelling",
      currentCohortSize: 10,
      maxRecentSuccessfulCohort: 10,
      challengeRecommendation: "expand_cohort",
      lastLoadEvidence: {
        activityId: "pronunciation",
        completed: true,
        accuracy: 1,
        targetCount: 10,
        frustrationScore: 0.05,
        strongEvidence: true,
        occurredAt: "2026-05-12T23:00:00.000Z",
      },
    },
  };
  return profile;
}

describe("patient-chart session plan", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes an active session plan onto the chart and exposes it through getChildChart", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-13T12:00:00.000Z"),
      parentNote: "Keep spelling active, but stop replaying the same five words.",
    });
    writeActiveSessionPlan(childId, plan, { rootDir: root });

    const updated = getChildChart(childId, { rootDir: root });

    expect(updated.activeSessionPlan?.planId).toBe(plan.planId);
    expect(updated.activeSessionPlan?.source).toBe("ingest_human_loop");
    expect(updated.activeSessionPlan?.activeHomeworkId).toBe("hw-spelling_test-bb11de93");
    expect(updated.activeSessionPlan?.companionPolicy.openingLinePolicy).toBe("context_start_short");
  });

  it("turns strong spelling evidence into a changed 10-word organic plan", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "runtime_fallback",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });

    expect(plan.wordPlan.cohortSize).toBe(10);
    expect(plan.wordPlan.words.map((word) => word.text)).toHaveLength(10);
    expect(plan.wordPlan.words.map((word) => word.text)).not.toEqual(WORDS.slice(0, 10));
    expect(plan.variationPolicy.avoidExactPreviousNodeOrder).toBe(true);
    expect(plan.nodePlan.map((node) => node.type).slice(0, 4)).toEqual([
      "word-radar",
      "monster-stampede",
      "spell-check",
      "pronunciation",
    ]);
  });

  it("renders the adventure map from the chart plan without making failed quest artifacts playable", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "runtime_fallback",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    const nodes = buildAdventureMapFromSessionPlan(chart, plan, {
      dopamineGames: ["space-frogger"],
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    const nodesAgain = buildAdventureMapFromSessionPlan(chart, plan, {
      dopamineGames: ["space-frogger"],
      now: new Date("2026-05-13T12:00:00.000Z"),
    });

    expect(nodesAgain).toEqual(nodes);
    expect(nodes.find((node) => node.type === "pronunciation")?.words).toHaveLength(10);
    expect(nodes.find((node) => node.type === "mystery")?.choiceOptions).toHaveLength(3);
    expect(
      nodes.find((node) => node.type === "mystery")?.choiceOptions?.map((option) => option.activityId),
    ).toContain("wheel-of-fortune");
    const quest = nodes.find((node) => node.type === "quest");
    expect(quest?.isLocked).toBe(true);
    expect(quest?.artifactStatus).toBe("preparing");
    expect(quest?.gameFile).toBeUndefined();
  });
});
