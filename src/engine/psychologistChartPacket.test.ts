import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import { getChildChart } from "../profiles/childChart";
import { appendDecisionTrace } from "../profiles/chartWaterfall";
import {
  buildExperiencePlannerInput,
  buildExperiencePlannerPrompt,
  resolveExperiencePlannerModel,
} from "./experiencePlanner";
import {
  buildPsychologistChartPacket,
  buildPsychologistPacketAudit,
} from "./psychologistChartPacket";
import {
  demoPronunciationScienceResults,
  writePronunciationScienceEvidence,
} from "./pronunciationScience";

const ROOTS: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-psychologist-packet-"));
  ROOTS.push(root);
  return root;
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function seedChart(root: string, childId = "reina", opts: { decisionTrace?: boolean } = {}): void {
  const profile = initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: ["spelling"],
  });
  profile.chartLinks = {
    learningProfile: "learning_profile.json",
    wordBank: "word_bank.json",
    todayPlan: "todays_plan.json",
    currentCarePlan: "care_plan/current.json",
    currentHomework: "homework/current.json",
    currentSessionPlan: "plans/active_session_plan.json",
    contentCatalog: "content_catalog.json",
    decisionTraces: "decision_traces/",
    homework: "homework/",
    attempts: "attempts/",
    ratings: "ratings/",
    vitals: "vitals/",
    sessionNotes: "session_notes/",
    companionCareDir: "companion_care/",
  };
  profile.companionCurrency = 42;
  profile.activityModel = {
    "word-radar": {
      activityId: "word-radar",
      plays: 4,
      completions: 4,
      completionRate: 1,
      averageAccuracy: 0.93,
      averageTimePerTarget_ms: 1200,
      engagementScore: 0.85,
      frustrationScore: 0.1,
      likedCount: 2,
      dislikedCount: 0,
      lastRating: "like",
      lastPlayed: "2026-05-14T12:00:00.000Z",
      domains: { spelling: 4 },
      missedWords: ["about"],
    },
  };
  writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
  writeJson(root, `src/context/${childId}/word_bank.json`, {
    childId,
    words: Array.from({ length: 80 }, (_, index) => ({
      id: `word-${index}`,
      word: index === 0 ? "secret-full-bank-word" : `word${index}`,
      tracks: {
        spelling: {
          nextReviewDate: "2026-05-14",
        },
      },
    })),
  });
  writeJson(root, `src/context/${childId}/homework/current.json`, {
    version: 1,
    childId,
    current: {
      weekOf: "2026-05-14",
      homeworkId: "hw-spelling-audit",
      testDate: "2026-05-20",
      testDateSource: "cli",
      testDateConfirmed: true,
      returnTag: "#sunny_reina_hw_spelling_audit",
      wordList: ["about", "again", "awake"],
      generatedAt: "2026-05-14T10:00:00.000Z",
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "spelling",
        topic: "schwa words",
        primarySkill: "spelling recall",
        assignmentFormat: "spelling test",
        concepts: ["schwa"],
        sourceEvidence: ["worksheet"],
      },
      capturedContent: {
        title: "Schwa homework",
        type: "spelling_test",
        rawText: "this raw text should not be copied into the packet",
        contentProfile: {
          practiceDomain: "spelling",
          contentDomain: "spelling",
          topic: "schwa words",
          primarySkill: "spelling recall",
          assignmentFormat: "spelling test",
          concepts: ["schwa"],
          sourceEvidence: ["worksheet"],
        },
      },
      completedAdventureNodeIds: [],
      nodes: [],
    },
    activeByDomain: {},
    updatedAt: "2026-05-14T10:00:00.000Z",
  });
  writeJson(root, `src/context/${childId}/homework/cycles/hw-spelling-audit.json`, {
    homeworkId: "hw-spelling-audit",
    contentFingerprint: "fingerprint-123",
    calibrationStatus: "unverified",
    ingestedAt: "2026-05-14T10:00:00.000Z",
  });
  writeJson(root, `src/context/${childId}/plans/active_session_plan.json`, {
    version: 1,
    childId,
    current: {
      planId: "plan-current",
      childId,
      domain: "spelling",
      source: "psychologist_sync",
      generatedAt: "2026-05-14T10:05:00.000Z",
      approvalStatus: "pending",
      nodePlan: [
        {
          id: "node-word-radar",
          type: "word-radar",
          activityId: "word-radar",
          targets: ["about", "again"],
          rationale: "Measure recall.",
        },
      ],
      evidenceUsed: [{ id: "evidence-homework", summary: "Active spelling homework." }],
      variationPolicy: { avoidExactPreviousWordOrder: true },
    },
    activeByDomain: {},
    updatedAt: "2026-05-14T10:05:00.000Z",
  });
  writeJson(root, `src/context/${childId}/care_plan/current.json`, {
    version: 1,
    childId,
    sourcePlanId: "plan-current",
    theory: {
      hypothesis: "Reina is ready for timed spelling recall with support.",
      evidenceSummary: ["Strong word radar accuracy.", "Current homework is schwa spelling."],
      intervention: "Tighten Word Radar and observe recall.",
      supportCriteria: ["accuracy >= 0.85"],
      reviseCriteria: ["accuracy between 0.65 and 0.85"],
      falsifyCriteria: ["accuracy below 0.65"],
    },
    plannedMeasurements: [
      {
        id: "measure-word-radar",
        activityId: "word-radar",
        target: "schwa words",
        evidenceType: "timed recall",
        supportCriteria: "accuracy >= 0.85",
        reviseCriteria: "mixed accuracy",
        falsifyCriteria: "low accuracy",
      },
    ],
    learningExperiments: [],
    updatedAt: "2026-05-14T10:05:00.000Z",
  });
  writeJson(root, `src/context/${childId}/content_catalog.json`, {
    version: 1,
    childId,
    items: [
      {
        contentId: "content-quest",
        homeworkId: "hw-spelling-audit",
        childId,
        type: "game",
        source: "generated",
        title: "Schwa Quest",
        algorithmTargets: ["retrieval-practice"],
        targetSkills: ["spelling recall"],
        targetConcepts: ["schwa"],
        targetWords: ["about"],
        engagementHooks: ["competition"],
        inputEvidence: { contentFingerprint: "fingerprint-123" },
        reuseStatus: "candidate",
        reuseReason: "needs validation",
      },
    ],
    updatedAt: "2026-05-14T10:05:00.000Z",
  });
  writeJson(root, `src/context/${childId}/todays_plan.json`, {
    todaysPlan: [{ activity: "Word Radar", priority: 1, required: true, reason: "homework", timeboxMinutes: 8 }],
    childProfile: "Likes competition.",
    stopAfter: "After recall check.",
    rewardPolicy: "Reward after homework.",
  });
  writeJson(root, `src/context/${childId}/vitals/latest.json`, {
    attentionWindowMinutes: 12,
    source: "measured",
  });
  writeJson(root, `src/context/${childId}/activity_results/latest.json`, {
    activityId: "word-radar",
    accuracy: 0.93,
    completed: true,
    evidenceTier: "mastery_candidate",
    targetResults: [
      { target: "ahead", correct: true, attempts: 1, mode: "hidden_word_recall", masteryEligible: true },
      { target: "again", correct: false, attempts: 2, attemptedValue: "agen", scaffoldLevel: 1 },
    ],
  });
  if (opts.decisionTrace !== false) {
    appendDecisionTrace(childId, {
      traceId: "trace-word-radar-config",
      eventType: "config_change",
      evidenceRead: ["care_plan/current.json", "word_bank.json"],
      theoryUsed: "timed recall readiness",
      changeSummary: "Word Radar moved toward hidden recall.",
      reason: "Strong recent accuracy.",
      writesTo: ["plans/active_session_plan.json"],
      createdAt: "2026-05-14T10:06:00.000Z",
    }, { rootDir: root, now: new Date("2026-05-14T10:06:00.000Z") });
  }
}

afterEach(() => {
  for (const root of ROOTS.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("PsychologistChartPacket", () => {
  it("includes the clean chart evidence needed by the AI psychologist", () => {
    const root = makeRoot();
    seedChart(root);
    const chart = getChildChart("reina", { rootDir: root });
    const input = buildExperiencePlannerInput(chart, {
      rootDir: root,
      now: new Date("2026-05-15T12:00:00.000Z"),
    });

    const packet = buildPsychologistChartPacket(input);

    expect(packet.child.displayName).toBe("Reina");
    expect(packet.homework.homeworkId).toBe("hw-spelling-audit");
    expect(packet.homework.contentFingerprint).toBe("fingerprint-123");
    expect(packet.currentCarePlan?.theory?.hypothesis).toMatch(/timed spelling recall/i);
    expect(packet.companionCare.status).toMatch(/ready|created|empty/);
    expect(packet.wordBank.totalWords).toBe(80);
    expect(packet.wordBank.dueWords.length).toBeLessThanOrEqual(12);
    expect(packet.latestActivityResult?.summary).toMatch(/word-radar|accuracy/i);
    expect(packet.latestActivityResult?.evidenceTier).toBe("mastery_candidate");
    expect(packet.latestActivityResult?.targetResults).toEqual([
      expect.objectContaining({ target: "ahead", correct: true, attempts: 1 }),
      expect.objectContaining({ target: "again", correct: false, attemptedValue: "agen" }),
    ]);
    expect(packet.decisionTrace?.changeSummary).toMatch(/Word Radar/);
    expect(packet.evidenceSources.some((source) => source.kind === "currentCarePlan")).toBe(true);
    expect(packet.evidenceSources.some((source) => source.kind === "wordBank")).toBe(true);
  });

  it("includes normalized pronunciation science summaries without raw provider payloads or audio", () => {
    const root = makeRoot();
    seedChart(root);
    writePronunciationScienceEvidence("reina", {
      sessionId: "session-pronunciation",
      homeworkId: "hw-spelling-audit",
      results: demoPronunciationScienceResults("2026-05-15T12:00:00.000Z"),
    }, {
      rootDir: root,
      now: new Date("2026-05-15T12:00:00.000Z"),
    });
    const chart = getChildChart("reina", { rootDir: root });
    const input = buildExperiencePlannerInput(chart, {
      rootDir: root,
      now: new Date("2026-05-15T12:00:00.000Z"),
    });

    const packet = buildPsychologistChartPacket(input);
    const packetText = JSON.stringify(packet);

    expect(packet.pronunciationScience.resultCount).toBe(2);
    expect(packet.pronunciationScience.providers).toEqual(expect.arrayContaining(["azure", "speechace"]));
    expect(packet.pronunciationScience.wilsonSignals).toContain("segmentation");
    expect(packet.pronunciationScience.summaries[0]).toMatch(/ahead/);
    expect(packet.evidenceSources.some((source) => source.kind === "pronunciationScience" && source.status === "read")).toBe(true);
    expect(packet.exclusions).toContain("raw pronunciation provider payloads");
    expect(packet.exclusions).toContain("raw child audio clips");
    expect(packetText).not.toContain("NBest");
    expect(packetText).not.toContain("audioBytes");
    expect(packetText).not.toContain("AZURE_SPEECH_KEY");
    expect(packetText).not.toContain("SPEECHACE_API_KEY");
  });

  it("links recent post-session truth packets as the psychologist source of reality", () => {
    const root = makeRoot();
    seedChart(root);
    const sessionDir = path.join(
      root,
      "logs",
      "sessions",
      "2026",
      "05",
      "2026-05-15T12-00-00_reina_homework_truth01",
    );
    fs.mkdirSync(sessionDir, { recursive: true });
    writeJson(root, path.relative(root, path.join(sessionDir, "post-session-truth.json")), {
      packetVersion: 2,
      sessionSummary: {
        childId: "reina",
        activityCount: 1,
      },
      activityReports: [
        {
          activityId: "word-radar",
          readings: 2,
          missedTargets: ["machine"],
          evidenceTiers: ["clean_recall"],
        },
      ],
      targetEvidence: [
        {
          target: "machine",
          targetPurpose: "read_fluently",
          missedCount: 1,
          lastStatus: "missed",
        },
      ],
      adaptationDecision: {
        status: "changed",
        reason: "Route machine to pronunciation support.",
      },
    });

    const chart = getChildChart("reina", { rootDir: root });
    const input = buildExperiencePlannerInput(chart, {
      rootDir: root,
      now: new Date("2026-05-15T12:00:00.000Z"),
    });

    const packet = buildPsychologistChartPacket(input);
    const packetText = JSON.stringify(packet);

    expect(packet.recentSessionTruthPackets).toEqual([
      expect.objectContaining({
        filePath: path.join(sessionDir, "post-session-truth.json"),
        activityReports: [
          expect.objectContaining({
            activityId: "word-radar",
            missedTargets: ["machine"],
          }),
        ],
        adaptationDecision: expect.objectContaining({
          status: "changed",
        }),
      }),
    ]);
    expect(packet.evidenceSources.some((source) => source.kind === "sessionTruthPackets" && source.status === "read")).toBe(true);
    expect(packetText).not.toContain("rawAudio");
    expect(packetText).not.toContain("providerPayload");
  });

  it("excludes raw oversized evidence, duplicated mirrors, and secrets from the packet and prompt", () => {
    const root = makeRoot();
    seedChart(root);
    const chart = getChildChart("reina", { rootDir: root });
    const input = buildExperiencePlannerInput(chart, {
      rootDir: root,
      now: new Date("2026-05-15T12:00:00.000Z"),
    });

    const packetText = JSON.stringify(buildPsychologistChartPacket(input));
    const prompt = buildExperiencePlannerPrompt(input);

    expect(packetText).not.toContain("secret-full-bank-word");
    expect(packetText).not.toContain("this raw text should not be copied");
    expect(packetText).not.toContain("ANTHROPIC_API_KEY");
    expect(packetText).not.toContain("OPENAI_API_KEY");
    expect(prompt).toContain("Psychologist chart packet:");
    expect(prompt).not.toContain("secret-full-bank-word");
    expect(prompt).not.toContain("this raw text should not be copied");
  });

  it("frames the psychologist prompt as accountable clinical hypothesis testing", () => {
    const root = makeRoot();
    seedChart(root);
    const chart = getChildChart("reina", { rootDir: root });
    const input = buildExperiencePlannerInput(chart, {
      rootDir: root,
      now: new Date("2026-05-15T12:00:00.000Z"),
    });

    const prompt = buildExperiencePlannerPrompt(input);

    expect(prompt).toMatch(/accountable to reality/i);
    expect(prompt).toMatch(/hypothesis until measured/i);
    expect(prompt).toMatch(/graded work|delayed reassessment/i);
    expect(prompt).toMatch(/support, revise, or falsify/i);
  });

  it("builds a non-mutating audit report with model, source, exclusion, and packet size details", () => {
    const root = makeRoot();
    seedChart(root);
    const before = fs.readFileSync(path.join(root, "src/context/reina/learning_profile.json"), "utf8");
    const chart = getChildChart("reina", { rootDir: root });
    const input = buildExperiencePlannerInput(chart, {
      rootDir: root,
      now: new Date("2026-05-15T12:00:00.000Z"),
    });

    const audit = buildPsychologistPacketAudit(input, {
      aiEnabled: true,
      model: "claude-sonnet-4-5",
    });

    expect(audit.childId).toBe("reina");
    expect(audit.provider).toBe("Anthropic");
    expect(audit.aiEnabled).toBe(true);
    expect(audit.model).toBe("claude-sonnet-4-5");
    expect(audit.packetBytes).toBeGreaterThan(100);
    expect(audit.fieldsSent).toContain("currentCarePlan");
    expect(audit.filesRead.some((file) => file.includes("care_plan/current.json"))).toBe(true);
    expect(audit.fieldsExcluded).toEqual(expect.arrayContaining([
      "full word_bank.json",
      "full attempts history",
      "API keys and environment values",
    ]));
    expect(audit.activeHomeworkId).toBe("hw-spelling-audit");
    expect(audit.carePlanTheorySummary).toMatch(/timed spelling recall/i);
    expect(audit.latestDecisionTraceSummary).toMatch(/Word Radar/);
    expect(fs.readFileSync(path.join(root, "src/context/reina/learning_profile.json"), "utf8")).toBe(before);
  });

  it("derives a latest trace from the active session plan when no trace file exists yet", () => {
    const root = makeRoot();
    seedChart(root, "reina", { decisionTrace: false });
    const chart = getChildChart("reina", { rootDir: root });
    const input = buildExperiencePlannerInput(chart, {
      rootDir: root,
      now: new Date("2026-05-15T12:00:00.000Z"),
    });

    const packet = buildPsychologistChartPacket(input);
    const audit = buildPsychologistPacketAudit(input, {
      aiEnabled: false,
      model: "claude-sonnet-4-5",
    });

    expect(packet.decisionTrace?.eventType).toBe("session_plan_write");
    expect(packet.decisionTrace?.changeSummary).toMatch(/Active session plan is plan-current/);
    expect(packet.decisionTrace?.reason).toMatch(/psychologist_sync selected 1 node/);
    expect(audit.latestDecisionTraceSummary).toMatch(/Active session plan is plan-current/);
    expect(fs.existsSync(path.join(root, "src/context/reina/decision_traces"))).toBe(false);
  });

  it("defaults AI psychologist planning to the stronger Sonnet model unless overridden", () => {
    expect(resolveExperiencePlannerModel({})).toBe("claude-sonnet-4-5");
    expect(resolveExperiencePlannerModel({ model: "claude-custom" })).toBe("claude-custom");
    expect(resolveExperiencePlannerModel({}, { SUNNY_EXPERIENCE_PLANNER_MODEL: "claude-env" }))
      .toBe("claude-env");
  });
});
