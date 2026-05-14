import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { ActiveSessionPlan, LearningProfile } from "../context/schemas/learningProfile";
import type { HomeworkCycle, LearningTheory } from "../context/schemas/homeworkCycle";
import { getChildChart } from "../profiles/childChart";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import { buildAdventureMapFromSessionPlan } from "./sessionPlanFromChart";
import { generateExperienceArtifactFromChart } from "./generatedExperienceArtifact";

const CHILD_ID = "reina";
const HOMEWORK_ID = "hw-spelling_test-artifact";
const WORDS = ["above", "ago", "about", "ahead", "away"];

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-experience-artifact-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function readJson<T>(root: string, rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")) as T;
}

function theory(): LearningTheory {
  return {
    theoryId: `${HOMEWORK_ID}:pre_quest:2026-05-13T12:00:00.000Z`,
    stage: "pre_quest",
    createdAt: "2026-05-13T12:00:00.000Z",
    hypothesis: "Reina knows the a- words but needs a transfer check under retrieval pressure.",
    predictedPattern: "schwa_retrieval_transfer",
    predictedRiskWords: ["about", "ahead"],
    intervention: "retrieval practice with desirable difficulty",
    successCriteria: { minAccuracy: 0.85, minImprovement: 0.1 },
    evidence: ["Word Radar and Spell Check were both strong."],
    status: "pending",
    markdown: "## Hypothesis\nReina knows the a- words but needs transfer evidence.",
  };
}

function cycle(): HomeworkCycle {
  const baseTheory = theory();
  return {
    homeworkId: HOMEWORK_ID,
    subject: "spelling_test",
    wordList: WORDS,
    capturedContent: {
      title: "Benchmark Advance Spelling Unit 9 Week 2",
      type: "spelling_test",
      rawText: "above ago about ahead away",
      words: WORDS,
      questions: [],
      homeworkWords: WORDS.map((word, index) => ({
        homeworkWordId: `${HOMEWORK_ID}:spell-from-memory:${word}:${index}`,
        text: word,
        normalizedText: word,
        wordGroupId: "spell-from-memory",
        purpose: "spell_from_memory",
        positionIndex: index,
      })),
      wordGroups: [
        {
          id: "spell-from-memory",
          wordGroupId: "spell-from-memory",
          label: "Schwa A Words",
          purpose: "spell_from_memory",
          words: WORDS,
          homeworkWordIds: WORDS.map((word, index) => `${HOMEWORK_ID}:spell-from-memory:${word}:${index}`),
          confidence: 0.93,
          evidence: ["Worksheet spelling list."],
        },
      ],
      assignmentInterpretation: {
        schemaVersion: 1,
        status: "ready",
        wordGroups: [
          {
            id: "spell-from-memory",
            wordGroupId: "spell-from-memory",
            label: "Schwa A Words",
            purpose: "spell_from_memory",
            words: WORDS,
            homeworkWordIds: WORDS.map((word, index) => `${HOMEWORK_ID}:spell-from-memory:${word}:${index}`),
            confidence: 0.93,
            evidence: ["Worksheet spelling list."],
          },
        ],
        assertions: [],
        selectedTargets: [],
        heldTargets: [],
        clarificationQuestions: [],
        humanAnswers: [],
        memoryMatches: [],
      },
      sourceDocuments: [{ filename: "spelling.pdf", mediaType: "application/pdf" }],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Schwa sound and high-frequency words",
        primarySkill: "spelling recall",
        assignmentFormat: "spelling test",
        concepts: ["schwa", "high-frequency words"],
        sourceEvidence: ["worksheet"],
      },
    },
    contentFingerprint: "fingerprint-artifact",
    calibrationStatus: "unverified",
    ingestedAt: "2026-05-13",
    testDate: "2026-05-15",
    testDateSource: "cli",
    testDateConfirmed: true,
    returnTag: "#sunny_reina_hw_spelling_test_artifact",
    assumptions: baseTheory.markdown,
    theory: baseTheory,
    interventionHistory: [
      {
        nodeId: "n-word-radar-hw-spelling_test-artifact",
        nodeType: "word-radar",
        measuredAt: "2026-05-13T12:05:00.000Z",
        baselineAccuracy: 1,
        interventionAccuracy: 1,
        improvement: 0,
        predictionMet: true,
        status: "supported",
      },
    ],
    postAnalysis: null,
    scanResult: null,
    delta: null,
    metrics: null,
  };
}

function activePlan(): ActiveSessionPlan {
  return {
    planId: "plan-reina-artifact",
    childId: CHILD_ID,
    createdAt: "2026-05-13T12:00:00.000Z",
    source: "ingest_human_loop",
    activeHomeworkId: HOMEWORK_ID,
    domain: "spelling",
    testDate: "2026-05-15",
    wordPlan: {
      cohortSize: 5,
      orderStrategy: "chart_seeded_rotation",
      words: WORDS.map((word) => ({
        text: word,
        purpose: "challenge",
        reason: "quest artifact test",
      })),
    },
    nodePlan: [
      {
        id: "n-word-radar-hw-spelling_test-artifact",
        type: "word-radar",
        activityId: "word-radar",
        targets: WORDS,
        difficulty: 2,
        source: "pending_homework",
      },
      {
        id: "n-quest-hw-spelling_test-artifact",
        type: "quest",
        activityId: "quest",
        targets: WORDS,
        difficulty: 3,
        source: "pending_homework",
        masteryUnlockState: "preparing",
        locked: true,
      },
    ],
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: "artifact-seed",
      previousCompletedNodeCount: 1,
    },
    companionPolicy: {
      companionId: "matilda",
      displayName: "Matilda",
      openingLinePolicy: "context_start_short",
      verbosity: "low",
      maxMicroProbes: 1,
    },
    evidenceUsed: [{ id: "n-word-radar-hw-spelling_test-artifact", type: "activity_result", summary: "100%" }],
    openQuestions: [],
    plannerConfidence: 0.82,
    approvalStatus: "approved",
    planTheory: {
      hypothesis: "A generated quest should test transfer after baseline mastery.",
      evidenceSummary: ["Baseline was perfect."],
      intervention: "bespoke retrieval quest",
      supportCriteria: ["quest accuracy >= 85%"],
      reviseCriteria: ["slow completion"],
      falsifyCriteria: ["quest accuracy < 70%"],
    },
    plannedMeasurements: [
      {
        id: "m-quest-transfer",
        activityId: "quest",
        target: "spelling transfer",
        evidenceType: "mastery_gate",
        supportCriteria: "accuracy >= 85%",
        reviseCriteria: "accuracy 70-84%",
        falsifyCriteria: "accuracy < 70%",
      },
    ],
    generatedExperienceBriefs: [
      {
        briefId: "brief-quest-transfer",
        kind: "quest",
        title: "Schwa Transfer Quest",
        learningGoal: "Test spelling transfer under retrieval pressure.",
        targetSkills: ["spelling recall"],
        targetConcepts: ["schwa"],
        targetWords: WORDS,
        engagementHooks: ["competition", "quick rounds"],
        algorithmTargets: ["retrieval-practice", "desirable-difficulty"],
        evidenceUsed: ["n-word-radar-hw-spelling_test-artifact"],
        artifactStatus: "brief_only",
        validationRequired: true,
      },
    ],
  };
}

function profile(): LearningProfile {
  const p = initializeLearningProfile({
    childId: CHILD_ID,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: ["spelling"],
  });
  p.pendingHomework = {
    weekOf: "2026-05-13",
    homeworkId: HOMEWORK_ID,
    testDate: "2026-05-15",
    testDateSource: "cli",
    testDateConfirmed: true,
    returnTag: "#sunny_reina_hw_spelling_test_artifact",
    wordList: WORDS,
    generatedAt: "2026-05-13T12:00:00.000Z",
    contentProfile: {
      practiceDomain: "spelling",
      contentDomain: "language_arts",
      topic: "Schwa sound and high-frequency words",
      primarySkill: "spelling recall",
      assignmentFormat: "spelling test",
      concepts: ["schwa", "high-frequency words"],
      sourceEvidence: ["worksheet"],
    },
    capturedContent: null,
    nodes: [
      {
        id: "n-word-radar-hw-spelling_test-artifact",
        type: "word-radar",
        words: WORDS,
        difficulty: 2,
        gameFile: null,
        storyFile: null,
      },
      {
        id: "n-quest-hw-spelling_test-artifact",
        type: "quest",
        words: WORDS,
        difficulty: 3,
        gameFile: null,
        storyFile: null,
        date: "2026-05-13",
      },
    ],
  };
  p.activeSessionPlan = activePlan();
  return p;
}

function validHtml(): string {
  return `<!doctype html>
<html>
<head><script src="/games/_contract.js"></script></head>
<body>
<div id="sunny-companion"></div>
<button id="start">Start</button>
<script>
const params = window.GAME_PARAMS || {};
function finish() {
  fireAttemptEvent({ word: (params.words || ["target"])[0], correct: true });
  fireCompanionEvent("correct_answer", {});
  sendNodeComplete({ completed: true, accuracy: 1, timeSpent_ms: 1000, wordsAttempted: 1 });
}
document.getElementById("start").addEventListener("click", finish);
</script>
</body>
</html>`;
}

describe("generated experience artifact from chart", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("validates, writes, catalogs, and attaches an approved quest brief", async () => {
    const root = makeRoot();
    roots.push(root);
    writeJson(root, `src/context/${CHILD_ID}/learning_profile.json`, profile());
    writeJson(root, `src/context/${CHILD_ID}/word_bank.json`, { childId: CHILD_ID, words: [] });
    writeJson(root, `src/context/${CHILD_ID}/homework/cycles/${HOMEWORK_ID}.json`, cycle());

    const result = await generateExperienceArtifactFromChart({
      childId: CHILD_ID,
      rootDir: root,
      now: new Date("2026-05-13T13:00:00.000Z"),
      briefId: "brief-quest-transfer",
      generateHtml: () => validHtml(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(result.validationReport).toMatchObject({ passed: true, attempts: 1 });

    const updated = readJson<LearningProfile>(root, `src/context/${CHILD_ID}/learning_profile.json`);
    const quest = updated.pendingHomework?.nodes.find((node) => node.type === "quest");
    expect(quest?.gameFile).toBe(result.filename);
    expect(quest?.date).toBe("2026-05-13");
    expect(quest?.adaptiveArtifact).toMatchObject({
      contentId: result.contentId,
      validationStatus: "passed",
      validationReport: { passed: true },
    });
    expect(updated.aiContentCatalog?.[0]).toMatchObject({
      contentId: result.contentId,
      reuseStatus: "candidate",
      validationStatus: "passed",
    });
    expect(updated.activeSessionPlan?.generatedExperienceBriefs?.[0]?.artifactStatus).toBe("validated");

    const chart = getChildChart(CHILD_ID, { rootDir: root });
    const nodes = buildAdventureMapFromSessionPlan(chart, chart.activeSessionPlan!);
    const mapQuest = nodes.find((node) => node.type === "quest");
    expect(mapQuest).toMatchObject({
      gameFile: result.filename,
      date: "2026-05-13",
      contentId: result.contentId,
      artifactStatus: "ready",
      masteryUnlockState: "pending_ceremony",
      isLocked: true,
    });
  });

  it("does not attach a generated quest when validation fails", async () => {
    const root = makeRoot();
    roots.push(root);
    writeJson(root, `src/context/${CHILD_ID}/learning_profile.json`, profile());
    writeJson(root, `src/context/${CHILD_ID}/word_bank.json`, { childId: CHILD_ID, words: [] });
    writeJson(root, `src/context/${CHILD_ID}/homework/cycles/${HOMEWORK_ID}.json`, cycle());

    const result = await generateExperienceArtifactFromChart({
      childId: CHILD_ID,
      rootDir: root,
      now: new Date("2026-05-13T13:00:00.000Z"),
      briefId: "brief-quest-transfer",
      generateHtml: () => "<html><body>broken</body></html>",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.reason).toBe("generated_game_validation_failed");
    expect(result.validationReport?.passed).toBe(false);

    const updated = readJson<LearningProfile>(root, `src/context/${CHILD_ID}/learning_profile.json`);
    const quest = updated.pendingHomework?.nodes.find((node) => node.type === "quest");
    expect(quest?.gameFile).toBeNull();
    expect(quest?.adaptiveArtifact).toBeUndefined();
    expect(updated.activeSessionPlan?.generatedExperienceBriefs?.[0]?.artifactStatus).toBe("failed");
    expect(updated.aiContentCatalog?.[0]).toMatchObject({
      reuseStatus: "retire",
      validationStatus: "failed",
    });
  });
});
