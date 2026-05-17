import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { getChildChart } from "../profiles/childChart";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import { recordChildSignal } from "./childSignals";
import {
  buildExperiencePlannerInput,
  draftPsychologistExperiencePlan,
  recordPlannerReview,
} from "./experiencePlanner";

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
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-experience-planner-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function readProfile(root: string, childId: string): LearningProfile {
  return JSON.parse(
    fs.readFileSync(path.join(root, "src", "context", childId, "learning_profile.json"), "utf8"),
  ) as LearningProfile;
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
      "n-pronunciation-hw-spelling_test-bb11de93",
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
        id: "n-pronunciation-hw-spelling_test-bb11de93",
        type: "pronunciation",
        words: WORDS,
        difficulty: 2,
        gameFile: null,
        storyFile: null,
      },
    ],
  };
  profile.activityModel = {
    pronunciation: {
      activityId: "pronunciation",
      plays: 4,
      completions: 4,
      completionRate: 1,
      averageAccuracy: 1,
      averageTimePerTarget_ms: 900,
      engagementScore: 0.92,
      frustrationScore: 0.02,
      likedCount: 2,
      dislikedCount: 0,
      lastRating: "like",
      lastPlayed: "2026-05-13T00:20:00.000Z",
      domains: { spelling: 4 },
      missedWords: [],
    },
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
        frustrationScore: 0.02,
        strongEvidence: true,
        occurredAt: "2026-05-13T00:20:00.000Z",
      },
    },
  };
  return profile;
}

describe("AI psychologist experience planner", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("builds planner input from the child chart, activity cards, child signals, and homework goal", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });
    recordChildSignal({
      childId,
      activityId: "pronunciation",
      domain: "spelling",
      signalType: "stated_preference",
      dimension: "voice",
      valence: "positive",
      confidence: 0.8,
      evidenceText: "child said she likes saying the words out loud",
      source: "companion_micro_probe",
      createdAt: "2026-05-13T00:22:00.000Z",
    }, { rootDir: root });

    const chart = getChildChart(childId, { rootDir: root });
    const input = buildExperiencePlannerInput(chart, {
      rootDir: root,
      now: new Date("2026-05-13T12:00:00.000Z"),
    });

    expect(input.childId).toBe(childId);
    expect(input.homeworkGoal?.homeworkId).toBe("hw-spelling_test-bb11de93");
    expect(input.activityCards.some((card) => card.activityId === "pronunciation")).toBe(true);
    expect(input.activityCards.find((card) => card.activityId === "pronunciation")?.engagementHooks)
      .toEqual(expect.arrayContaining(["voice", "speed", "low-writing-load"]));
    const wordRadarCard = input.activityCards.find((card) => card.activityId === "word-radar");
    expect(wordRadarCard?.capabilityModes.map((mode) => mode.id)).toEqual([
      "visible_read",
      "partial_visual_recall",
      "hidden_word_recall",
    ]);
    expect(wordRadarCard?.validConfigOptions).toEqual(expect.arrayContaining([
      "recallMode",
      "hideWordDuringResponse",
      "requiresCapturedResponse",
    ]));
    expect(wordRadarCard?.measures.join(" ")).toMatch(/recognition|read/i);
    expect(wordRadarCard?.psychologistGuidance.join(" ")).toMatch(/visible|recall|mastery/i);
    const letterRushCard = input.activityCards.find((card) => card.activityId === "letter-rush");
    expect(letterRushCard?.gameIds).toContain("letter-rush");
    expect(letterRushCard?.configSource).toBe("activity-config-file");
    expect(letterRushCard?.configKnobs.join(" ")).toMatch(/fallDuration|distractors|targetWords/i);
    expect(input.traitSignalSummary.preferredDimensions.join(" ")).toContain("voice");
    expect(input.plannerTrust.autoPlanEnabled).toBe(false);
  });

  it("drafts a chart-attached active plan with a theory, measurements, approval state, and generated brief", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const input = buildExperiencePlannerInput(chart, {
      rootDir: root,
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    const plan = draftPsychologistExperiencePlan(input, {
      now: new Date("2026-05-13T12:00:00.000Z"),
    });

    expect(plan.approvalStatus).toBe("pending");
    expect(plan.plannerConfidence).toBeGreaterThanOrEqual(0.7);
    expect(plan.planTheory?.hypothesis).toMatch(/Reina|spelling|voice/i);
    expect(plan.plannedMeasurements?.length).toBeGreaterThan(0);
    expect(plan.generatedExperienceBriefs?.[0]).toMatchObject({
      kind: "quest",
      artifactStatus: "brief_only",
      validationRequired: true,
      experimentId: expect.stringMatching(/^experiment-/),
    });
    expect(plan.generatedExperienceBriefs?.[0]?.experimentId).toContain(plan.planId);
    expect(plan.learningExperiments?.[0]).toMatchObject({
      experimentId: plan.generatedExperienceBriefs?.[0]?.experimentId,
      status: "planned",
      hypothesis: expect.stringMatching(/adaptive|spelling|session/i),
      assignedActivityIds: expect.arrayContaining(["quest"]),
    });
    expect(plan.wordPlan.cohortSize).toBe(10);
    expect(plan.nodePlan.find((node) => node.type === "word-radar")?.wordRadarConfig?.recallMode)
      .toBe("hidden_word_recall");
    expect(plan.plannedMeasurements?.find((item) => item.activityId === "word-radar")?.evidenceType)
      .toMatch(/hidden_word_recall/);
    expect(plan.nodePlan.map((node) => node.type)).toContain("mystery");
  });

  it("records child-global planner approvals and enables auto-plan after five approvals", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    for (let i = 0; i < 5; i += 1) {
      recordPlannerReview(childId, {
        planId: `plan-${i}`,
        status: "approved",
        reviewer: "jamal",
        decidedAt: `2026-05-13T12:0${i}:00.000Z`,
      }, { rootDir: root });
    }

    const profile = readProfile(root, childId);
    expect(profile.plannerTrust?.approvedCount).toBe(5);
    expect(profile.plannerTrust?.rejectedCount).toBe(0);
    expect(profile.plannerTrust?.autoPlanEnabled).toBe(true);
    expect(profile.plannerTrust?.lastDecision?.planId).toBe("plan-4");
  });

  it("does not increment approval trust for rejected plans", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    recordPlannerReview(childId, {
      planId: "plan-rejected",
      status: "rejected",
      reviewer: "jamal",
      notes: "Too repetitive.",
      decidedAt: "2026-05-13T12:00:00.000Z",
    }, { rootDir: root });

    const profile = readProfile(root, childId);
    expect(profile.plannerTrust?.approvedCount).toBe(0);
    expect(profile.plannerTrust?.rejectedCount).toBe(1);
    expect(profile.plannerTrust?.autoPlanEnabled).toBe(false);
  });
});
