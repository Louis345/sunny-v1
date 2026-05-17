import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyWordBank } from "../context/schemas/wordBank";
import { getChildChart } from "../profiles/childChart";
import {
  appendDecisionTrace,
  migrateLearningProfileToWaterfall,
  readWaterfallContentCatalog,
} from "../profiles/chartWaterfall";
import { initializeLearningProfile, readLearningProfile } from "../utils/learningProfileIO";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-child-chart-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

describe("getChildChart", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("assembles Reina's chart from the child_profile cover sheet and attached records", () => {
    const chart = getChildChart("reina");

    expect(chart.childId).toBe("reina");
    expect(chart.identity.displayName).toBe("Reina");
    expect(chart.identity.ttsName).toBe("Ray-nah");
    expect(chart.companion.presetId).toBe("matilda");
    expect(chart.learningProfile.childId).toBe("reina");
    expect(chart.wordBankSummary.totalWords).toBeGreaterThanOrEqual(0);
    expect(chart.attention.currentWindow_ms).toBeGreaterThan(0);
    expect(chart.economy.coinBalance).toBeGreaterThanOrEqual(0);
    expect(chart.links.learningProfile).toContain("learning_profile.json");
    expect(chart.links.wordBank).toContain("word_bank.json");
    expect(chart.links.carePlans).toContain("care_plans");
    expect(chart.links.vitals).toContain("vitals");
  });

  it("falls back safely when child_profile.json is missing", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "fallbackkid";
    const profile = initializeLearningProfile({
      childId,
      age: 7,
      grade: 1,
      diagnoses: [],
      learningGoals: [],
    });
    profile.plannerTrust = {
      approvedCount: 5,
      rejectedCount: 1,
      autoPlanEnabled: true,
      autoPlanThreshold: 5,
      lastDecision: {
        planId: "plan-5",
        status: "approved",
        reviewer: "jamal",
        decidedAt: "2026-05-13T12:00:00.000Z",
      },
    };
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, createEmptyWordBank(childId));

    const chart = getChildChart(childId, { rootDir: root });

    expect(chart.childId).toBe(childId);
    expect(chart.manifestSource).toBe("fallback");
    expect(chart.identity.displayName).toBe("Fallbackkid");
    expect(chart.identity.ttsName).toBe("Fallbackkid");
    expect(chart.demographics.age).toBe(7);
    expect(chart.links.learningProfile).toContain("learning_profile.json");
    expect(chart.plannerTrust?.autoPlanEnabled).toBe(true);
    expect(chart.plannerTrust?.approvedCount).toBe(5);
  });

  it("uses the configured default companion instead of child-name fallback branches", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "newchild";
    const profile = initializeLearningProfile({
      childId,
      age: 7,
      grade: 1,
      diagnoses: [],
      learningGoals: [],
    });
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, createEmptyWordBank(childId));
    writeJson(root, "children.config.json", {
      defaultCompanionId: "matilda",
      childCompanionIds: {},
      companions: {
        matilda: {
          id: "matilda",
          vrmUrl: "/companions/matilda.vrm",
          expressions: {
            idle: "neutral",
            happy: "happy",
            thinking: "lookDown",
            celebrating: "happy",
            concerned: "sad",
            winking: "blinkLeft",
            surprised: "surprised",
            angry: "angry",
            blink: "blink",
          },
          faceCamera: {
            position: [0, 1.4, 0.8],
            target: [0, 1.4, 0],
          },
          dopamineGames: ["space-frogger"],
        },
      },
    });

    const chart = getChildChart(childId, { rootDir: root });

    expect(chart.companion.presetId).toBe("matilda");
  });

  it("falls back to a neutral default companion when no child config exists", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = initializeLearningProfile({
      childId,
      age: 7,
      grade: 1,
      diagnoses: [],
      learningGoals: [],
    });
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, createEmptyWordBank(childId));

    const chart = getChildChart(childId, { rootDir: root });

    expect(chart.companion.presetId).toBe("elli");
  });

  it("uses chart identity ahead of legacy child config when a cover sheet exists", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "chartkid";
    const profile = initializeLearningProfile({
      childId,
      age: 9,
      grade: 3,
      diagnoses: [],
      learningGoals: [],
    });
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, createEmptyWordBank(childId));
    writeJson(root, `src/context/${childId}/child_profile.json`, {
      childId,
      identity: {
        displayName: "Chart Kid",
        ttsName: "Chartie",
        avatarImagePath: "/characters/chart-kid.png",
      },
      demographics: {
        age: 9,
        grade: 3,
        diagnoses: [],
        iepActive: false,
      },
      companion: {
        companionId: "elli",
      },
      economy: {
        coinBalance: 42,
      },
      links: {
        learningProfile: "learning_profile.json",
        wordBank: "word_bank.json",
        homework: "homework/",
        attempts: "attempts/",
        vitals: "vitals/",
        carePlans: "care_plans/",
      },
    });

    const chart = getChildChart(childId, { rootDir: root });

    expect(chart.manifestSource).toBe("manifest");
    expect(chart.identity.ttsName).toBe("Chartie");
    expect(chart.identity.avatarImagePath).toBe("/characters/chart-kid.png");
    expect(chart.companion.presetId).toBe("elli");
    expect(chart.economy.coinBalance).toBe(42);
  });

  it("exposes the child chart waterfall from linked profile files", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "waterfallkid";
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    profile.pendingHomework = {
      weekOf: "2026-05-15",
      homeworkId: "hw-waterfall",
      testDate: "2026-05-22",
      wordList: ["above"],
      generatedAt: "2026-05-15T12:00:00.000Z",
      nodes: [],
    };
    profile.activeSessionPlan = {
      planId: "plan-waterfall",
      childId,
      createdAt: "2026-05-15T12:00:00.000Z",
      source: "ingest_human_loop",
      activeHomeworkId: "hw-waterfall",
      domain: "spelling",
      testDate: "2026-05-22",
      wordPlan: { cohortSize: 1, orderStrategy: "homework_order", words: [] },
      nodePlan: [],
      variationPolicy: {
        avoidExactPreviousNodeOrder: true,
        avoidExactPreviousWordOrder: true,
        seed: "seed",
        previousCompletedNodeCount: 0,
      },
      companionPolicy: {
        companionId: "elli",
        displayName: "Elli",
        openingLinePolicy: "context_start_short",
        verbosity: "low",
        maxMicroProbes: 1,
      },
      evidenceUsed: [{ id: "evidence-1", type: "test", summary: "baseline" }],
      openQuestions: [],
      planTheory: {
        hypothesis: "Practice should improve recall.",
        evidenceSummary: ["baseline"],
        intervention: "word-radar",
        supportCriteria: ["accuracy >= .85"],
        reviseCriteria: ["accuracy .65-.85"],
        falsifyCriteria: ["accuracy < .65"],
      },
      plannedMeasurements: [],
    };
    profile.aiContentCatalog = [{
      contentId: "content-1",
      childId,
      type: "game",
      source: "generated",
      title: "Quest",
      algorithmTargets: ["retrieval-practice"],
      targetSkills: ["spelling"],
      targetConcepts: [],
      targetWords: ["above"],
      engagementHooks: ["challenge"],
      inputEvidence: { activityEvidenceIds: ["evidence-1"] },
      reuseStatus: "candidate",
      reuseReason: "Needs validation.",
    }];
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, createEmptyWordBank(childId));
    writeJson(root, `src/context/${childId}/todays_plan.json`, { todaysPlan: [{ activity: "Spelling", priority: 1 }] });

    const migration = migrateLearningProfileToWaterfall(childId, { rootDir: root, now: new Date("2026-05-15T12:00:00.000Z") });
    appendDecisionTrace(childId, {
      traceId: "trace-1",
      eventType: "activity_choice",
      evidenceRead: ["evidence-1"],
      theoryUsed: "Practice should improve recall.",
      changeSummary: "Selected Word Radar.",
      reason: "Baseline spelling target needs retrieval.",
      writesTo: [migration.files.currentSessionPlan],
      createdAt: "2026-05-15T12:00:00.000Z",
    }, { rootDir: root, now: new Date("2026-05-15T12:00:00.000Z") });

    const chart = getChildChart(childId, { rootDir: root });

    expect(chart.learningProfile.chartLinks?.currentSessionPlan).toBe("plans/active_session_plan.json");
    expect(chart.todayPlan.existed).toBe(true);
    expect(chart.todayPlan.data).toMatchObject({ todaysPlan: [{ activity: "Spelling" }] });
    expect(chart.carePlan.existed).toBe(true);
    expect(chart.carePlan.current?.theory?.hypothesis).toBe("Practice should improve recall.");
    expect(chart.homework.pending?.homeworkId).toBe("hw-waterfall");
    expect(chart.homework.currentFile).toContain("homework/current.json");
    expect(chart.activeSessionPlan?.planId).toBe("plan-waterfall");
    expect(chart.sessionPlan.existed).toBe(true);
    expect(chart.contentCatalog.summary.total).toBe(1);
    expect(chart.contentCatalog.summary.candidates).toBe(1);
    expect(chart.decisionTrace.latest?.traceId).toBe("trace-1");
    expect(chart.evidence.links.attempts).toContain("attempts");
    expect(readWaterfallContentCatalog(childId, { rootDir: root }).items[0]?.contentId).toBe("content-1");
  });

  it("slims migrated learning profiles while hydrating legacy fields from waterfall records", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "slimkid";
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    profile.pendingHomework = {
      weekOf: "2026-05-15",
      homeworkId: "hw-slim",
      testDate: "2026-05-22",
      wordList: ["above"],
      generatedAt: "2026-05-15T12:00:00.000Z",
      nodes: [],
    };
    profile.activeSessionPlan = {
      planId: "plan-slim",
      childId,
      createdAt: "2026-05-15T12:00:00.000Z",
      source: "ingest_human_loop",
      activeHomeworkId: "hw-slim",
      domain: "spelling",
      testDate: "2026-05-22",
      wordPlan: { cohortSize: 1, orderStrategy: "homework_order", words: [] },
      nodePlan: [],
      variationPolicy: {
        avoidExactPreviousNodeOrder: true,
        avoidExactPreviousWordOrder: true,
        seed: "seed",
        previousCompletedNodeCount: 0,
      },
      companionPolicy: {
        companionId: "elli",
        displayName: "Elli",
        openingLinePolicy: "context_start_short",
        verbosity: "low",
        maxMicroProbes: 1,
      },
      evidenceUsed: [],
      openQuestions: [],
    };
    profile.aiContentCatalog = [{
      contentId: "content-slim",
      childId,
      type: "game",
      source: "generated",
      title: "Slim Quest",
      algorithmTargets: ["retrieval-practice"],
      targetSkills: ["spelling"],
      targetConcepts: [],
      targetWords: ["above"],
      engagementHooks: [],
      inputEvidence: {},
      reuseStatus: "candidate",
      reuseReason: "Needs validation.",
    }];
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, createEmptyWordBank(childId));

    migrateLearningProfileToWaterfall(childId, {
      rootDir: root,
      slimProfile: true,
      now: new Date("2026-05-15T12:00:00.000Z"),
    });

    const raw = JSON.parse(
      fs.readFileSync(path.join(root, `src/context/${childId}/learning_profile.json`), "utf8"),
    );
    expect(raw.pendingHomework).toBeUndefined();
    expect(raw.activeSessionPlan).toBeUndefined();
    expect(raw.aiContentCatalog).toBeUndefined();
    expect(raw.chartLinks.currentHomework).toBe("homework/current.json");

    const chart = getChildChart(childId, { rootDir: root });
    expect(chart.learningProfile.pendingHomework?.homeworkId).toBe("hw-slim");
    expect(chart.learningProfile.activeSessionPlan?.planId).toBe("plan-slim");
    expect(chart.learningProfile.aiContentCatalog?.[0]?.contentId).toBe("content-slim");
    expect(readLearningProfile(childId, { rootDir: root })?.pendingHomework?.homeworkId).toBe("hw-slim");
  });
});
