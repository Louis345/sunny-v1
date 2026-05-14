import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import { ensureFreshPendingHomework, hydratePendingHomeworkFromCycle } from "../scripts/homeworkSelector";
import { normalizeContentProfile } from "../scripts/contentAwareHomeworkPlanner";
import { initializeLearningProfile, readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import { writeWordBank } from "../utils/wordBankIO";

describe("homeworkSelector", () => {
  const childId = "selector-test";
  const ctxDir = path.join(process.cwd(), "src", "context", childId);

  afterEach(() => {
    fs.rmSync(ctxDir, { recursive: true, force: true });
  });

  function writeCycle(cycle: HomeworkCycle): void {
    const dir = path.join(ctxDir, "homework", "cycles");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${cycle.homeworkId}.json`), JSON.stringify(cycle, null, 2));
  }

  it("hydrates spelling homework from a saved cycle without deleting the erosion cycle", () => {
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    writeLearningProfile(childId, profile);
    writeWordBank(childId, {
      childId,
      version: 1,
      lastUpdated: new Date().toISOString(),
      words: [
        { word: "erosion", addedAt: "2026-05-01", source: "homework", homeworkPriority: true, tracks: {} },
        { word: "because", addedAt: "2026-05-01", source: "homework", homeworkPriority: false, tracks: {} },
      ],
    });

    writeCycle({
      homeworkId: "hw-reading-erosion",
      subject: "reading",
      wordList: ["erosion"],
      contentProfile: normalizeContentProfile({
        title: "Erosion Test",
        type: "reading",
        words: ["erosion"],
        questions: [],
        contentProfile: {
          practiceDomain: "reading",
          contentDomain: "science",
          topic: "erosion",
          primarySkill: "reading_comprehension",
          assignmentFormat: "study_guide",
          concepts: ["erosion"],
        },
      }),
      capturedContent: null,
      ingestedAt: "2026-05-01",
      testDate: "2026-05-06",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });
    writeCycle({
      homeworkId: "hw-spelling_test-week",
      subject: "spelling_test",
      wordList: ["because", "friend"],
      contentProfile: normalizeContentProfile({
        title: "Spelling Words",
        type: "spelling_test",
        words: ["because", "friend"],
        questions: [],
        contentProfile: {
          practiceDomain: "spelling",
          contentDomain: "language_arts",
          topic: "weekly spelling",
          primarySkill: "spelling",
          assignmentFormat: "word_list",
          concepts: ["spelling"],
        },
      }),
      capturedContent: null,
      ingestedAt: "2026-05-02",
      testDate: "2026-05-08",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });

    const selected = hydratePendingHomeworkFromCycle(childId, { domain: "spelling" });

    expect(selected.homeworkId).toBe("hw-spelling_test-week");
    expect(readLearningProfile(childId)?.pendingHomework?.homeworkId).toBe("hw-spelling_test-week");
    expect(fs.existsSync(path.join(ctxDir, "homework", "cycles", "hw-reading-erosion.json"))).toBe(true);
  });

  it("repairs a stale active spelling-test pointer whose nodes were pronunciation-only", () => {
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    writeLearningProfile(childId, {
      ...profile,
      pendingHomework: {
        weekOf: "2026-05-12",
        testDate: "2026-05-15",
        testDateSource: "cli",
        testDateConfirmed: true,
        returnTag: "#sunny_selector_test_hw_spelling_test_bb11de93",
        wordList: [
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
          "government",
          "half",
          "machine",
          "pair",
          "quickly",
        ],
        homeworkId: "hw-spelling_test-bb11de93",
        generatedAt: "2026-05-12T00:00:00.000Z",
        nodes: [
          {
            id: "n-pronunciation-hw-spelling_test-bb11de93",
            type: "pronunciation",
            words: ["above", "ago", "about", "ahead", "away"],
            difficulty: 1,
            gameFile: null,
            storyFile: null,
          },
        ],
      },
    });
    writeWordBank(childId, {
      childId,
      version: 1,
      lastUpdated: new Date().toISOString(),
      words: [],
    });

    const words = [
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
      "government",
      "half",
      "machine",
      "pair",
      "quickly",
    ];
    const contentProfile = normalizeContentProfile({
      title: "Benchmark Advance Spelling Unit 9 Week 2",
      type: "spelling_test",
      words,
      questions: [],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Schwa sound and high-frequency words",
        primarySkill: "Spelling words with schwa vowel and high-frequency fluency",
        assignmentFormat: "Spelling word list with categorization exercises",
        concepts: ["Schwa sound", "High-frequency words", "Vowel sounds"],
      },
    });
    writeCycle({
      homeworkId: "hw-spelling_test-bb11de93",
      subject: "spelling_test",
      wordList: words,
      contentProfile,
      capturedContent: {
        title: "Benchmark Advance Spelling Unit 9 Week 2",
        type: "spelling_test",
        rawText: "",
        words,
        homeworkWords: [],
        questions: [],
        wordGroups: [
          {
            id: "schwa_words",
            label: "Schwa Words",
            purpose: "recognize",
            words: [
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
            ],
            confidence: 0.95,
            evidence: ["Section labeled 'Schwa'"],
          },
          {
            id: "high_frequency_words",
            label: "High-Frequency Words",
            purpose: "recognize",
            words: ["government", "half", "machine", "pair", "quickly"],
            confidence: 0.95,
            evidence: ["Section explicitly labeled 'High-Frequency Words'"],
          },
        ],
        sourceDocuments: [],
        contentProfile,
      },
      ingestedAt: "2026-05-12",
      testDate: "2026-05-15",
      testDateSource: "cli",
      testDateConfirmed: true,
      returnTag: "#sunny_selector_test_hw_spelling_test_bb11de93",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });

    const pending = ensureFreshPendingHomework(childId, { domain: "spelling" });

    expect(pending.nodes.map((node) => node.type)).toEqual([
      "word-radar",
      "spell-check",
      "monster-stampede",
      "pronunciation",
    ]);
    expect(readLearningProfile(childId)?.pendingHomework?.nodes.map((node) => node.type)).toEqual([
      "word-radar",
      "spell-check",
      "monster-stampede",
      "pronunciation",
    ]);
  });

  it("keeps the soonest due non-spelling homework as default homework", () => {
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    writeLearningProfile(childId, profile);
    writeWordBank(childId, {
      childId,
      version: 1,
      lastUpdated: new Date().toISOString(),
      words: [],
    });

    writeCycle({
      homeworkId: "hw-spelling_test-week",
      subject: "spelling_test",
      wordList: ["because"],
      ingestedAt: "2026-05-01",
      testDate: "2026-05-08",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });
    writeCycle({
      homeworkId: "hw-reading-erosion",
      subject: "reading",
      wordList: ["erosion"],
      ingestedAt: "2026-05-02",
      testDate: "2026-05-06",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });

    const selected = hydratePendingHomeworkFromCycle(childId);

    expect(selected.homeworkId).toBe("hw-reading-erosion");
    expect(readLearningProfile(childId)?.pendingHomework?.homeworkId).toBe("hw-reading-erosion");
  });

  it("does not overwrite active pending homework when running default homework mode", () => {
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    profile.pendingHomework = {
      weekOf: "2026-05-11",
      testDate: "2026-05-15",
      wordList: ["above", "ago"],
      homeworkId: "hw-spelling_test-active",
      generatedAt: "2026-05-11T21:00:00.000Z",
      nodes: [
        {
          id: "n-letter-rush-active",
          type: "letter-rush",
          words: ["above", "ago"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
          date: "2026-05-11",
          approved: false,
        },
      ],
    };
    writeLearningProfile(childId, profile);
    writeWordBank(childId, {
      childId,
      version: 1,
      lastUpdated: new Date().toISOString(),
      words: [],
    });

    writeCycle({
      homeworkId: "hw-reading-erosion",
      subject: "reading",
      wordList: ["erosion"],
      ingestedAt: "2026-05-04",
      testDate: "2026-05-06",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });
    writeCycle({
      homeworkId: "hw-spelling_test-active",
      subject: "spelling_test",
      wordList: ["above", "ago"],
      ingestedAt: "2026-05-11",
      testDate: "2026-05-15",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });

    const selected = hydratePendingHomeworkFromCycle(childId);

    expect(selected.homeworkId).toBe("hw-spelling_test-active");
    expect(readLearningProfile(childId)?.pendingHomework?.homeworkId).toBe("hw-spelling_test-active");
  });

  it("preserves saved assignment word groups when hydrating from a cycle", () => {
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    writeLearningProfile(childId, profile);
    writeWordBank(childId, {
      childId,
      version: 1,
      lastUpdated: new Date().toISOString(),
      words: [],
    });

    writeCycle({
      homeworkId: "hw-spelling_test-schwa",
      subject: "spelling_test",
      wordList: ["above", "ago", "ago", "wait"],
      contentProfile: normalizeContentProfile({
        title: "Schwa and High-Frequency Words",
        type: "spelling_test",
        words: ["above", "ago", "ago", "wait"],
        questions: [],
        contentProfile: {
          practiceDomain: "spelling",
          contentDomain: "language_arts",
          topic: "Schwa and high-frequency words",
          primarySkill: "spelling and recognition",
          assignmentFormat: "two-column word list",
          concepts: ["Schwa", "High-frequency words"],
        },
      }),
      capturedContent: {
        title: "Schwa and High-Frequency Words",
        type: "spelling_test",
        rawText: "",
        words: ["above", "ago", "ago", "wait"],
        questions: [],
        sourceDocuments: [],
        contentProfile: normalizeContentProfile({
          title: "Schwa and High-Frequency Words",
          type: "spelling_test",
          words: ["above", "ago", "ago", "wait"],
          questions: [],
          contentProfile: {
            practiceDomain: "spelling",
            contentDomain: "language_arts",
            topic: "Schwa and high-frequency words",
            primarySkill: "spelling and recognition",
            assignmentFormat: "two-column word list",
            concepts: ["Schwa", "High-frequency words"],
          },
        }),
        wordGroups: [
          {
            id: "schwa",
            label: "Schwa",
            purpose: "spell_from_memory",
            words: ["above", "ago"],
            confidence: 0.95,
            evidence: ["Schwa column"],
          },
          {
            id: "high_frequency",
            label: "High-Frequency Words",
            purpose: "recognize",
            words: ["ago", "wait"],
            confidence: 0.9,
            evidence: ["High-frequency column"],
          },
        ],
      },
      ingestedAt: "2026-05-11",
      testDate: "2026-05-15",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });

    const selected = hydratePendingHomeworkFromCycle(childId, { domain: "spelling" });
    const agoOccurrences = selected.capturedContent?.homeworkWords?.filter(
      (word) => word.normalizedText === "ago",
    );

    expect(selected.capturedContent?.wordGroups?.map((group) => group.id)).toEqual([
      "schwa",
      "high_frequency",
    ]);
    expect(agoOccurrences).toHaveLength(2);
    expect(agoOccurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ wordGroupId: "schwa", purpose: "spell_from_memory" }),
        expect.objectContaining({ wordGroupId: "high_frequency", purpose: "recognize" }),
      ]),
    );
    expect(selected.nodes.map((node) => node.type)).toEqual([
      "spell-check",
      "pronunciation",
    ]);
  });

  it("ignores expired homework when selecting the default cycle", () => {
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    writeLearningProfile(childId, profile);
    writeWordBank(childId, {
      childId,
      version: 1,
      lastUpdated: new Date().toISOString(),
      words: [],
    });

    writeCycle({
      homeworkId: "hw-spelling_test-expired",
      subject: "spelling_test",
      wordList: ["older"],
      ingestedAt: "2026-05-01",
      testDate: "2026-05-01",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });
    writeCycle({
      homeworkId: "hw-reading-erosion",
      subject: "reading",
      wordList: ["erosion"],
      ingestedAt: "2026-05-05",
      testDate: "2026-05-06",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });

    const selected = hydratePendingHomeworkFromCycle(childId);

    expect(selected.homeworkId).toBe("hw-reading-erosion");
  });

  it("selects the latest ingested spelling cycle for explicit spelling mode", () => {
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    writeLearningProfile(childId, profile);

    writeCycle({
      homeworkId: "hw-spelling_test-old",
      subject: "spelling_test",
      wordList: ["older"],
      ingestedAt: "2026-05-01",
      testDate: "2026-05-06",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });
    writeCycle({
      homeworkId: "hw-spelling_test-new",
      subject: "spelling_test",
      wordList: ["shiny"],
      ingestedAt: "2026-05-05",
      testDate: "2026-05-09",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });

    const selected = hydratePendingHomeworkFromCycle(childId, { domain: "spelling" });

    expect(selected.homeworkId).toBe("hw-spelling_test-new");
  });

  it("replaces expired active spelling homework with the latest spelling cycle", () => {
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    profile.pendingHomework = {
      weekOf: "2026-05-05",
      testDate: "2026-05-09",
      wordList: ["shiny", "slowly"],
      homeworkId: "hw-spelling_test-adaptive",
      generatedAt: "2026-05-05T12:00:00.000Z",
      nodes: [],
    };
    writeLearningProfile(childId, profile);
    writeWordBank(childId, {
      childId,
      version: 1,
      lastUpdated: new Date().toISOString(),
      words: [],
    });

    writeCycle({
      homeworkId: "hw-spelling_test-adaptive",
      subject: "spelling_test",
      wordList: ["shiny", "slowly"],
      ingestedAt: "2026-05-05",
      testDate: "2026-05-09",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });
    writeCycle({
      homeworkId: "hw-spelling_test-bb11de93",
      subject: "spelling_test",
      wordList: ["above", "ago", "about", "ahead", "away", "alone", "alike", "awake", "along", "again"],
      ingestedAt: "2026-05-11",
      testDate: "2026-05-15",
      testDateSource: "human_confirmed",
      testDateConfirmed: true,
      returnTag: "#sunny_reina_hw_spelling_test_bb11de93",
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });

    const selected = ensureFreshPendingHomework(childId, { domain: "spelling" });

    expect(selected.homeworkId).toBe("hw-spelling_test-bb11de93");
    expect(selected.testDate).toBe("2026-05-15");
    expect(selected.returnTag).toBe("#sunny_reina_hw_spelling_test_bb11de93");
    expect(readLearningProfile(childId)?.pendingHomework?.homeworkId).toBe("hw-spelling_test-bb11de93");
  });
});
