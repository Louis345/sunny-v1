import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { ensureFreshPendingHomework, hydratePendingHomeworkFromCycle } from "../scripts/homeworkSelector";
import { normalizeContentProfile } from "../scripts/contentAwareHomeworkPlanner";
import { initializeLearningProfile, readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import { readWordBank, writeWordBank } from "../utils/wordBankIO";

describe("homeworkSelector", () => {
  const childId = "selector-test";
  const ctxDir = path.join(process.cwd(), "src", "context", childId);

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(ctxDir, { recursive: true, force: true });
  });

  function defaultSavedNodes(cycle: HomeworkCycle): NonNullable<LearningProfile["pendingHomework"]>["nodes"] {
    return [
      {
        id: `n-${cycle.subject === "reading" ? "concept" : "word-radar"}-${cycle.homeworkId}`,
        type: cycle.subject === "reading" ? "concept-check" : "word-radar",
        words: cycle.wordList.slice(0, 5),
        difficulty: 1,
        gameFile: null,
        storyFile: null,
      },
    ];
  }

  function writeCycle(
    cycle: HomeworkCycle & { nodes?: NonNullable<LearningProfile["pendingHomework"]>["nodes"] },
    opts: { allowMissingNodes?: boolean } = {},
  ): void {
    const dir = path.join(ctxDir, "homework", "cycles");
    fs.mkdirSync(dir, { recursive: true });
    const withNodes = opts.allowMissingNodes || (cycle as { nodes?: unknown }).nodes
      ? cycle
      : { ...cycle, nodes: defaultSavedNodes(cycle) };
    fs.writeFileSync(path.join(dir, `${cycle.homeworkId}.json`), JSON.stringify(withNodes, null, 2));
  }

  it("reads homework cycles through SUNNY_CONTEXT_ROOT for sandbox children", () => {
    const sandboxRoot = fs.mkdtempSync(path.join(process.cwd(), ".tmp-selector-sandbox-"));
    const sandboxContextRoot = path.join(sandboxRoot, "context");
    const sandboxChild = "sandbox-selector";
    const previousRoot = process.env.SUNNY_CONTEXT_ROOT;
    process.env.SUNNY_CONTEXT_ROOT = sandboxContextRoot;
    try {
      const profile = initializeLearningProfile({
        childId: sandboxChild,
        age: 8,
        grade: 2,
        diagnoses: [],
        learningGoals: [],
      });
      writeLearningProfile(sandboxChild, profile);
      writeWordBank(sandboxChild, {
        childId: sandboxChild,
        version: 1,
        lastUpdated: new Date().toISOString(),
        words: [],
      });
      const cycleDir = path.join(sandboxContextRoot, sandboxChild, "homework", "cycles");
      fs.mkdirSync(cycleDir, { recursive: true });
      fs.writeFileSync(
        path.join(cycleDir, "hw-spelling_test-sandbox.json"),
        JSON.stringify(
          {
            homeworkId: "hw-spelling_test-sandbox",
            subject: "spelling_test",
            wordList: ["above", "again"],
            ingestedAt: "2026-05-18",
      testDate: "2026-05-22",
      nodes: [
        {
          id: "n-pronunciation-hw-spelling_test-sandbox",
          type: "pronunciation",
          words: ["above", "again"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
      ],
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
          } as HomeworkCycle,
          null,
          2,
        ),
      );

      const selected = ensureFreshPendingHomework(sandboxChild, { domain: "spelling" });

      expect(selected.homeworkId).toBe("hw-spelling_test-sandbox");
      expect(readLearningProfile(sandboxChild)?.pendingHomework?.homeworkId).toBe(
        "hw-spelling_test-sandbox",
      );
      expect(fs.existsSync(path.join(process.cwd(), "src", "context", sandboxChild))).toBe(false);
    } finally {
      if (previousRoot === undefined) delete process.env.SUNNY_CONTEXT_ROOT;
      else process.env.SUNNY_CONTEXT_ROOT = previousRoot;
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

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
      nodes: [
        {
          id: "n-word-radar-hw-spelling_test-week",
          type: "word-radar",
          words: ["because", "friend"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
      ],
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

  it("requires replan instead of rebuilding missing planner nodes from legacy helpers", () => {
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

    writeCycle(
      {
        homeworkId: "hw-spelling_test-missing-plan",
        subject: "spelling_test",
        wordList: ["because", "friend"],
        ingestedAt: "2026-05-02",
        testDate: "2026-05-08",
        assumptions: null,
        postAnalysis: null,
        scanResult: null,
        delta: null,
        metrics: null,
      },
      { allowMissingNodes: true },
    );

    expect(() => hydratePendingHomeworkFromCycle(childId, { domain: "spelling" })).toThrow(
      "homework_cycle_requires_replan:hw-spelling_test-missing-plan",
    );
  });

  it("keeps active planner-authored homework when the matching cycle has no saved nodes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-23T12:00:00.000Z"));
    const activeNode: NonNullable<LearningProfile["pendingHomework"]>["nodes"][number] = {
      id: "node-1-silent-letters-baseline",
      type: "word-radar",
      words: ["sign", "know"],
      difficulty: 1,
      gameFile: null,
      storyFile: null,
      wordRadarConfig: {
        recallMode: "partial_visual_recall",
        inputMode: "letter-by-letter",
        speakStyle: "option-a",
        showTimer: false,
        hideWordDuringResponse: true,
        requiresCapturedResponse: true,
      },
    };
    const activePending: NonNullable<LearningProfile["pendingHomework"]> = {
      weekOf: "2026-05-23",
      testDate: "2026-05-26",
      testDateSource: "cli",
      testDateConfirmed: true,
      returnTag: "#sunny_selector_active_plan",
      wordList: ["sign", "know"],
      homeworkId: "hw-spelling_test-active-plan",
      generatedAt: "2026-05-23T12:00:00.000Z",
      nodes: [activeNode],
    };
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    writeLearningProfile(childId, {
      ...profile,
      selectedHomeworkDomain: "spelling",
      pendingHomework: activePending,
      activeHomeworkByDomain: {
        spelling: activePending,
      },
    });
    writeWordBank(childId, {
      childId,
      version: 1,
      lastUpdated: new Date().toISOString(),
      words: [],
    });
    writeCycle(
      {
        homeworkId: "hw-spelling_test-active-plan",
        subject: "spelling_test",
        wordList: ["sign", "know"],
        ingestedAt: "2026-05-23",
        testDate: "2026-05-26",
        testDateSource: "cli",
        testDateConfirmed: true,
        returnTag: "#sunny_selector_active_plan",
        assumptions: null,
        postAnalysis: null,
        scanResult: null,
        delta: null,
        metrics: null,
      },
      { allowMissingNodes: true },
    );

    const selected = ensureFreshPendingHomework(childId, { domain: "spelling" });

    expect(selected.homeworkId).toBe("hw-spelling_test-active-plan");
    expect(selected.nodes).toEqual([activeNode]);
    expect(selected.nodes[0]?.wordRadarConfig?.inputMode).toBe("letter-by-letter");
  });

  it("keeps reading and spelling homework lanes isolated while switching domains", () => {
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    writeLearningProfile(childId, {
      ...profile,
      activeHomeworkByDomain: {
        spelling: {
          weekOf: "2026-05-02",
          homeworkId: "hw-spelling_test-week",
          testDate: "2026-05-20",
          wordList: ["because", "friend"],
          generatedAt: "2026-05-02T10:00:00.000Z",
          completedAdventureNodeIds: ["n-word-radar-hw-spelling_test-week"],
          nodes: [
            {
              id: "n-word-radar-hw-spelling_test-week",
              type: "word-radar",
              words: ["because", "friend"],
              difficulty: 1,
              gameFile: null,
              storyFile: null,
            },
          ],
        },
      },
      selectedHomeworkDomain: "spelling",
      pendingHomework: {
        weekOf: "2026-05-02",
        homeworkId: "hw-spelling_test-week",
        testDate: "2026-05-20",
        wordList: ["because", "friend"],
        generatedAt: "2026-05-02T10:00:00.000Z",
        completedAdventureNodeIds: ["n-word-radar-hw-spelling_test-week"],
        nodes: [
          {
            id: "n-word-radar-hw-spelling_test-week",
            type: "word-radar",
            words: ["because", "friend"],
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
      words: [
        {
          word: "because",
          addedAt: "2026-05-01",
          source: "homework",
          homeworkPriority: true,
          testDate: "2026-05-20",
          homeworkTargets: {
            spelling: {
              homeworkId: "hw-spelling_test-week",
              testDate: "2026-05-20",
              priority: true,
              purpose: "spell_from_memory",
            },
          },
          tracks: {},
        },
      ],
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
      testDate: "2026-05-20",
      nodes: [
        {
          id: "n-word-radar-hw-spelling_test-week",
          type: "word-radar",
          words: ["because", "friend"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
      ],
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });

    writeCycle({
      homeworkId: "hw-reading-erosion",
      subject: "reading",
      wordList: ["erosion", "deposition"],
      contentProfile: normalizeContentProfile({
        title: "Erosion Study Guide",
        type: "reading",
        words: ["erosion", "deposition"],
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
      ingestedAt: "2026-05-03",
      testDate: "2026-05-09",
      nodes: [
        {
          id: "n-concept-hw-reading-erosion",
          type: "concept-check",
          words: ["erosion", "deposition"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
      ],
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });

    const reading = hydratePendingHomeworkFromCycle(childId, { domain: "reading" });
    expect(reading.homeworkId).toBe("hw-reading-erosion");
    let updated = readLearningProfile(childId);
    expect(updated?.selectedHomeworkDomain).toBe("reading");
    expect(updated?.pendingHomework?.homeworkId).toBe("hw-reading-erosion");
    expect(updated?.activeHomeworkByDomain?.reading?.homeworkId).toBe("hw-reading-erosion");
    expect(updated?.activeHomeworkByDomain?.spelling?.homeworkId).toBe("hw-spelling_test-week");
    expect(updated?.activeHomeworkByDomain?.spelling?.completedAdventureNodeIds).toEqual([
      "n-word-radar-hw-spelling_test-week",
    ]);
    expect(readWordBank(childId).words.find((word) => word.word === "because")?.homeworkTargets?.spelling?.priority).toBe(true);

    const spelling = ensureFreshPendingHomework(childId, { domain: "spelling" });
    expect(spelling.homeworkId).toBe("hw-spelling_test-week");
    updated = readLearningProfile(childId);
    expect(updated?.selectedHomeworkDomain).toBe("spelling");
    expect(updated?.pendingHomework?.completedAdventureNodeIds).toEqual([
      "n-word-radar-hw-spelling_test-week",
    ]);
    expect(updated?.activeHomeworkByDomain?.reading?.homeworkId).toBe("hw-reading-erosion");
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
      nodes: [
        {
          id: "n-word-radar-hw-spelling_test-bb11de93",
          type: "word-radar",
          words: ["above", "ago", "about"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
        {
          id: "n-spell-check-hw-spelling_test-bb11de93",
          type: "spell-check",
          words: ["ahead", "away", "alone"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
        {
          id: "n-monster-hw-spelling_test-bb11de93",
          type: "monster-stampede",
          words: ["alike", "awake", "along"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
        {
          id: "n-pronunciation-hw-spelling_test-bb11de93",
          type: "pronunciation",
          words: ["government", "half", "machine", "pair", "quickly"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
      ],
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    profile.pendingHomework = {
      weekOf: "2026-05-11",
      testDate: "2026-05-22",
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
      testDate: "2026-05-22",
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
      nodes: [
        {
          id: "n-spell-check-hw-spelling_test-schwa",
          type: "spell-check",
          words: ["above", "ago"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
        {
          id: "n-pronunciation-hw-spelling_test-schwa",
          type: "pronunciation",
          words: ["ago", "wait"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
      ],
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

  it("preserves a saved cycle node plan instead of rebuilding generic nodes", () => {
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

    const savedNodes = [
      {
        id: "n-word-radar-hw-lab",
        type: "word-radar",
        words: ["above", "again"],
        difficulty: 1,
        gameFile: null,
        storyFile: null,
        wordRadarItems: [
          {
            display: "above",
            acceptedResponses: ["above"],
            label: "Spelling",
            subject: "spelling",
          },
        ],
      },
      {
        id: "n-spell-check-hw-lab",
        type: "spell-check",
        words: ["around", "away"],
        difficulty: 1,
        gameFile: "spell-check.html",
        storyFile: null,
      },
      {
        id: "n-pronunciation-hw-lab",
        type: "pronunciation",
        words: ["the", "and"],
        difficulty: 1,
        gameFile: null,
        storyFile: null,
      },
    ] satisfies NonNullable<LearningProfile["pendingHomework"]>["nodes"];

    const cycle = {
      homeworkId: "hw-spelling_test-lab",
      subject: "spelling_test",
      wordList: ["above", "again", "around", "away", "the", "and"],
      ingestedAt: "2026-05-18",
      testDate: "2026-05-22",
      nodes: savedNodes,
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    } as HomeworkCycle & { nodes: typeof savedNodes };
    writeCycle(cycle);

    const selected = hydratePendingHomeworkFromCycle(childId, { domain: "spelling" });

    expect(selected.nodes.map((node) => node.type)).toEqual([
      "word-radar",
      "spell-check",
      "pronunciation",
    ]);
    expect(selected.nodes[0]?.wordRadarItems?.[0]?.display).toBe("above");
    expect(readLearningProfile(childId)?.pendingHomework?.nodes.map((node) => node.type)).toEqual([
      "word-radar",
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

  it("keeps active spelling homework available through its local test date", () => {
    const previousTz = process.env.TZ;
    process.env.TZ = "America/New_York";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T16:00:00.000Z"));

    try {
      const profile = initializeLearningProfile({
        childId,
        age: 8,
        grade: 2,
        diagnoses: [],
        learningGoals: [],
      });
      const activeNodes = [
        {
          id: "n-word-radar-hw-spelling_test-today",
          type: "word-radar",
          words: ["today"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
      ] satisfies NonNullable<LearningProfile["pendingHomework"]>["nodes"];
      const activeHomework = {
        weekOf: "2026-05-20",
        testDate: "2026-05-22",
        wordList: ["today"],
        homeworkId: "hw-spelling_test-today",
        generatedAt: "2026-05-20T12:00:00.000Z",
        nodes: activeNodes,
      };
      writeLearningProfile(childId, {
        ...profile,
        pendingHomework: activeHomework,
        activeHomeworkByDomain: { spelling: activeHomework },
        selectedHomeworkDomain: "spelling",
      });
      writeWordBank(childId, {
        childId,
        version: 1,
        lastUpdated: new Date().toISOString(),
        words: [],
      });

      writeCycle({
        homeworkId: "hw-spelling_test-today",
        subject: "spelling_test",
        wordList: ["today"],
        ingestedAt: "2026-05-20",
        testDate: "2026-05-22",
        nodes: activeNodes,
        assumptions: null,
        postAnalysis: null,
        scanResult: null,
        delta: null,
        metrics: null,
      });
      writeCycle({
        homeworkId: "hw-spelling_test-next",
        subject: "spelling_test",
        wordList: ["next"],
        ingestedAt: "2026-05-21",
        testDate: "2026-05-23",
        assumptions: null,
        postAnalysis: null,
        scanResult: null,
        delta: null,
        metrics: null,
      });

      const selected = ensureFreshPendingHomework(childId, { domain: "spelling" });

      expect(selected.homeworkId).toBe("hw-spelling_test-today");
      expect(readLearningProfile(childId)?.pendingHomework?.homeworkId).toBe(
        "hw-spelling_test-today",
      );
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });

  it("keeps started active homework even when its archived cycle has no saved nodes", () => {
    const profile = initializeLearningProfile({
      childId,
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    const activeNodes = [
      {
        id: "n-spell-check-hw-spelling_test-started",
        type: "spell-check",
        words: ["above", "again"],
        difficulty: 1,
        gameFile: null,
        storyFile: null,
      },
    ] satisfies NonNullable<LearningProfile["pendingHomework"]>["nodes"];
    const activeHomework = {
      weekOf: "2026-05-20",
      testDate: "2099-05-22",
      wordList: ["above", "again"],
      homeworkId: "hw-spelling_test-started",
      generatedAt: "2026-05-20T12:00:00.000Z",
      completedAdventureNodeIds: ["n-spell-check-hw-spelling_test-started"],
      nodes: activeNodes,
    };
    writeLearningProfile(childId, {
      ...profile,
      pendingHomework: activeHomework,
      activeHomeworkByDomain: { spelling: activeHomework },
      selectedHomeworkDomain: "spelling",
    });
    writeWordBank(childId, {
      childId,
      version: 1,
      lastUpdated: new Date().toISOString(),
      words: [],
    });
    writeCycle(
      {
        homeworkId: "hw-spelling_test-started",
        subject: "spelling_test",
        wordList: ["above", "again"],
        ingestedAt: "2026-05-20",
        testDate: "2099-05-22",
        assumptions: null,
        postAnalysis: null,
        scanResult: null,
        delta: null,
        metrics: null,
      },
      { allowMissingNodes: true },
    );

    const selected = ensureFreshPendingHomework(childId, { domain: "spelling" });

    expect(selected.homeworkId).toBe("hw-spelling_test-started");
    expect(selected.nodes?.map((node) => node.type)).toEqual(["spell-check"]);
    expect(readLearningProfile(childId)?.pendingHomework?.completedAdventureNodeIds).toEqual([
      "n-spell-check-hw-spelling_test-started",
    ]);
  });
});
