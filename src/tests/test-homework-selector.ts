import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import { hydratePendingHomeworkFromCycle } from "../scripts/homeworkSelector";
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
});
