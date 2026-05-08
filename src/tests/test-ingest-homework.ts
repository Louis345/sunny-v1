import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHomeworkPreviewCommand,
  buildHomeworkNodes,
  buildHomeworkLearningPlanArtifact,
  buildPendingHomeworkPayload,
  ensureQuestHtmlContract,
  finalizePlannedHomeworkNodes,
  mergeNormalizedPlan,
  normalizeHomeworkType,
  nextFriday,
  parseCliArgs,
  pickIncomingHomeworkFile,
  resolveHomeworkTypeFromProfile,
  shouldGenerateBossNode,
} from "../scripts/ingestHomework";
import { buildCapturedHomeworkContent, normalizeContentProfile } from "../scripts/contentAwareHomeworkPlanner";

/** First `childProfiles` id from repo-root `children.config.json` (sorted for stability). */
function sampleChildIdFromConfig(): string {
  const p = path.join(process.cwd(), "children.config.json");
  const cfg = JSON.parse(fs.readFileSync(p, "utf8")) as { childProfiles?: Record<string, unknown> };
  const keys = Object.keys(cfg.childProfiles ?? {}).sort();
  if (keys.length === 0) {
    throw new Error("children.config.json: missing childProfiles");
  }
  return keys[0]!;
}

describe("ingestHomework", () => {
  it("parseCliArgs accepts --testDate flag", () => {
    const childId = sampleChildIdFromConfig();
    expect(parseCliArgs([`--child=${childId}`, "--testDate=2026-05-03"])).toEqual({
      childId,
      testDate: "2026-05-03",
      opus: false,
      pdfOverridePath: null,
    });
  });

  it("parseCliArgs accepts --pdf override path", () => {
    const childId = sampleChildIdFromConfig();
    const pdfPath = path.join(process.cwd(), "src", "context", childId, "homework", "incoming", "test.pdf");
    expect(parseCliArgs([`--child=${childId}`, `--pdf=${pdfPath}`])).toEqual({
      childId,
      testDate: null,
      opus: false,
      pdfOverridePath: pdfPath,
    });
  });

  it("parseCliArgs testDate defaults to null when absent", () => {
    const childId = sampleChildIdFromConfig();
    expect(parseCliArgs([`--child=${childId}`])).toEqual({
      childId,
      testDate: null,
      opus: false,
      pdfOverridePath: null,
    });
  });

  it("ingestHomework finds PDF in incoming/", () => {
    const picked = pickIncomingHomeworkFile([
      "/tmp/incoming/a.txt",
      "/tmp/incoming/b.PDF",
    ]);
    expect(picked?.toLowerCase().endsWith(".pdf")).toBe(true);
  });

  it("Haiku extraction returns correct type for spelling PDF", () => {
    expect(normalizeHomeworkType("spelling_test")).toBe("spelling_test");
    expect(normalizeHomeworkType("spelling")).toBe("spelling_test");
  });

  it("promotes science study guides from generic to reading homework", () => {
    const profile = normalizeContentProfile({
      title: "Erosion and Earth's Surface Study Guide",
      type: "generic",
      words: [],
      questions: [],
      contentProfile: {
        practiceDomain: "reading",
        contentDomain: "science",
        topic: "erosion",
        primarySkill: "reading_comprehension",
        assignmentFormat: "study_guide",
        concepts: ["erosion", "soil", "water"],
      },
    });

    expect(
      resolveHomeworkTypeFromProfile(
        "generic",
        profile,
        "Erosion and Earth's Surface Study Guide",
        [],
      ),
    ).toBe("reading");
  });

  it("preview command uses the current sunny:run path, not the removed homework preview script", () => {
    const command = buildHomeworkPreviewCommand("reina");
    expect(command.command).toBe("npm");
    expect(command.args).toEqual([
      "run",
      "sunny:run",
      "--",
      "--subject",
      "homework",
      "--child",
      "reina",
      "--session-mode",
      "as-child",
      "--preview",
      "free",
      "--node-access",
      "inspect-all",
    ]);
    expect(command.display).not.toContain("sunny:homework:preview");
  });

  it("node plan written to pending/", () => {
    const pending = buildPendingHomeworkPayload({
      weekOf: "2026-04-21",
      testDate: null,
      wordList: ["cat", "dog"],
      homeworkId: "hw-spelling_test-test0001",
      nodes: [
        {
          id: "hw-1",
          type: "quest",
          words: ["cat"],
          difficulty: 2,
          rationale: "test",
          gameFile: "quest-2026-04-21.html",
        },
      ],
    });
    expect(pending.nodes.length).toBe(1);
  });

  it("pendingHomework written to learning_profile.json", () => {
    const pending = buildPendingHomeworkPayload({
      weekOf: "2026-04-21",
      testDate: "2026-04-25",
      wordList: ["cat"],
      homeworkId: "hw-spelling_test-test0002",
      nodes: [],
    });
    expect(pending.weekOf).toBe("2026-04-21");
    expect(pending.testDate).toBe("2026-04-25");
  });

  it("pendingHomework stores captured content for future dynamic AI nodes", () => {
    const contentProfile = normalizeContentProfile({
      title: "Erosion Study Guide",
      type: "reading",
      words: ["erosion"],
      questions: [],
      contentProfile: {
        practiceDomain: "reading",
        contentDomain: "science",
        topic: "erosion",
        primarySkill: "reading_comprehension",
        assignmentFormat: "study_guide",
        concepts: ["erosion", "water", "soil"],
      },
    });
    const capturedContent = buildCapturedHomeworkContent({
      title: "Erosion Study Guide",
      type: "reading",
      rawText: "Water carries soil downhill.",
      words: ["erosion"],
      questions: [{ id: 1, question: "What carries soil?", correctAnswer: "water" }],
      sourceDocuments: [{ filename: "Test for May 6.pdf", mediaType: "application/pdf" }],
      contentProfile,
    });

    const pending = buildPendingHomeworkPayload({
      weekOf: "2026-04-21",
      testDate: "2026-04-25",
      wordList: ["erosion"],
      homeworkId: "hw-reading-erosion",
      nodes: [],
      contentProfile,
      capturedContent,
    });

    expect(pending.capturedContent?.rawText).toContain("Water carries soil");
    expect(pending.capturedContent?.sourceDocuments[0]?.filename).toBe("Test for May 6.pdf");
    expect(pending.capturedContent?.contentProfile.topic).toBe("erosion");
  });

  it("builds an auditable learning plan for the assignment", () => {
    const contentProfile = normalizeContentProfile({
      title: "Erosion Study Guide",
      type: "reading",
      words: [],
      questions: [],
      contentProfile: {
        practiceDomain: "reading",
        contentDomain: "science",
        topic: "erosion",
        primarySkill: "reading_comprehension",
        assignmentFormat: "study_guide",
        concepts: ["erosion", "water", "soil"],
      },
    });

    const artifact = buildHomeworkLearningPlanArtifact({
      homeworkId: "hw-reading-erosion",
      childId: "reina",
      title: "Erosion Study Guide",
      type: "reading",
      words: [],
      contentProfile,
      reinforcementWords: ["coldest"],
    });

    expect(artifact.plan.interventions.map((i) => i.type)).toEqual([
      "baseline-evaluator",
      "story",
      "pronunciation",
      "concept-builder",
      "exit-evaluator",
    ]);
    expect(artifact.plan.reinforcementWords).toEqual(["coldest"]);
    expect(artifact.markdown).toContain("Homework Learning Plan");
    expect(artifact.markdown).toContain("Baseline check");
    expect(artifact.markdown).toContain("exit-evaluator");
  });

  it("karaoke story embeds word list", () => {
    const words = ["cat", "dog"];
    const story = `The cat can hop.\nThe dog can run.`;
    for (const word of words) {
      expect(story.toLowerCase()).toContain(word);
    }
  });

  it("quest HTML includes #sunny-companion div", () => {
    const html = ensureQuestHtmlContract(
      "<html><head></head><body><h1>Game</h1></body></html>",
    );
    expect(html).toContain('<div id="sunny-companion"></div>');
  });

  it("quest HTML includes fireCompanionEvent calls", () => {
    const html = ensureQuestHtmlContract(
      "<html><head></head><body><h1>Game</h1></body></html>",
    );
    expect(html).toContain("fireCompanionEvent");
  });

  it("boss node skipped without --opus flag", () => {
    expect(shouldGenerateBossNode(false)).toBe(false);
  });

  it("karaoke node has storyText embedded in pendingHomework payload", () => {
    const pending = buildPendingHomeworkPayload({
      weekOf: "2026-04-21",
      testDate: null,
      wordList: ["cat"],
      homeworkId: "hw-spelling_test-test0003",
      nodes: [
        {
          id: "hw-karaoke",
          type: "karaoke",
          words: ["cat"],
          difficulty: 2,
          rationale: "read",
          gameFile: null,
          storyFile: "karaoke-story.txt",
          storyText: "The cat can hop.",
        },
      ],
    });
    expect(pending.nodes[0]?.storyText).toBe("The cat can hop.");
  });

  it("gameFile is filename only not full path", () => {
    const pending = buildPendingHomeworkPayload({
      weekOf: "2026-04-21",
      testDate: null,
      wordList: [],
      homeworkId: "hw-spelling_test-test0004",
      nodes: [
        {
          id: "hw-q",
          type: "quest",
          words: [],
          difficulty: 2,
          rationale: "play",
          gameFile: "src/context/ila/homework/pending/2026-04-21/quest-2026-04-21.html",
        },
      ],
    });
    expect(pending.nodes[0]?.gameFile).toBe("quest-2026-04-21.html");
  });

  it("spelling_test merge uses evaluator-first Letter Rush nodes before quest and boss", () => {
    const words = Array.from({ length: 20 }, (_, i) => `w${i}`);
    const out = mergeNormalizedPlan([], words, 2, {
      homeworkType: "spelling_test",
      daysUntilTest: 5,
    });
    expect(out[0]?.type).toBe("letter-rush");
    expect(out.map((n) => n.type)).toEqual([
      "letter-rush",
      "letter-rush",
      "letter-rush",
      "pronunciation",
      "word-builder",
      "quest",
      "boss",
    ]);
    expect(out.every((n) => n.words.length === 20)).toBe(true);
    const quest = out.find((n) => n.type === "quest");
    expect(quest?.rationale).toContain("AI-generated");
    expect(out[0]?.difficulty).toBe(1);
    expect((out[0]?.activityConfig as { mode?: string } | undefined)?.mode).toBe(
      "type-and-spell",
    );
  });

  it("pending homework payload preserves activity config paths for standalone engines", () => {
    const pending = buildPendingHomeworkPayload({
      weekOf: "2026-04-21",
      testDate: null,
      wordList: ["farmer"],
      homeworkId: "hw-spelling-week-5",
      nodes: [
        {
          id: "n-letter-rush-baseline",
          type: "letter-rush",
          words: ["farmer"],
          difficulty: 1,
          rationale: "baseline",
          gameFile: null,
          storyFile: null,
          activityConfigPath:
            "/api/activity-config/ila/hw-spelling-week-5/letter-rush-baseline.json",
        },
      ],
    });

    expect(pending.nodes[0]?.activityConfigPath).toBe(
      "/api/activity-config/ila/hw-spelling-week-5/letter-rush-baseline.json",
    );
  });

  it("boss placeholder appended when plan has no boss node", () => {
    const out = finalizePlannedHomeworkNodes(
      [
        {
          id: "hw-1",
          type: "quest",
          words: ["a"],
          difficulty: 2,
          rationale: "quest first",
        },
      ],
      ["spell", "word"],
      "2026-04-22",
    );
    expect(out[out.length - 1]?.type).toBe("boss");
    expect(out[out.length - 1]?.id).toBe("hw-boss");
    expect(out[out.length - 1]?.gameFile).toBeNull();
  });
});

describe("buildHomeworkNodes testDate urgency", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps imminent spelling tests in short playable bursts instead of serving all words", () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 26, 12, 0, 0)));
    const testDate = new Date(Date.UTC(2026, 3, 26, 12, 0, 0) + 3 * 86400000).toISOString().slice(0, 10);
    const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
    const childId = sampleChildIdFromConfig();
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words,
      homeworkId: "hw-urgent",
      childId,
      testDate,
    });
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((n) => n.words.length <= 5)).toBe(true);
    const baseline = nodes.find((n) => n.type === "letter-rush");
    expect(
      (baseline?.activityConfig as { words?: unknown[] } | undefined)?.words?.length,
    ).toBe(5);
  });

  it("caps at maxWords when test is more than 5 days away", () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 26, 12, 0, 0)));
    const testDate = new Date(Date.UTC(2026, 3, 26, 12, 0, 0) + 10 * 86400000).toISOString().slice(0, 10);
    const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
    const childId = sampleChildIdFromConfig();
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words,
      homeworkId: "hw-far",
      childId,
      testDate,
    });
    const maxWords = 5;
    expect(nodes.every((n) => n.words.length === maxWords)).toBe(true);
    const baseline = nodes.find((n) => n.type === "letter-rush");
    expect(
      (baseline?.activityConfig as { words?: unknown[] } | undefined)?.words?.length,
    ).toBe(maxWords);
  });
});

describe("nextFriday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never returns today when today is Friday", () => {
    vi.useFakeTimers();
    let t = new Date(2026, 0, 1, 12, 0, 0);
    while (t.getDay() !== 5) {
      t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1, 12, 0, 0);
    }
    vi.setSystemTime(t);
    const got = nextFriday();
    expect(got).not.toBe(t.toISOString().slice(0, 10));
    const exp = new Date(t);
    exp.setDate(t.getDate() + 7);
    expect(got).toBe(exp.toISOString().slice(0, 10));
  });
});
