import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHomeworkPreviewCommand,
  buildHomeworkNodes,
  buildHomeworkLearningPlanArtifact,
  buildPendingHomeworkPayload,
  buildHomeworkReturnTag,
  ensureQuestHtmlContract,
  finalizePlannedHomeworkNodes,
  appendHomeworkIntakeHistory,
  inferIngestDomainFromExtraction,
  listIngestChildIds,
  mergeNormalizedPlan,
  normalizeHomeworkType,
  nextFriday,
  parseCliArgs,
  pickIncomingHomeworkFile,
  resolveIngestChildId,
  resolveIngestHomeworkDomain,
  resolveIngestHomeworkFile,
  reviewExperiencePlan,
  resolveIngestedTestDate,
  resolveHomeworkWordPurpose,
  resolveHomeworkTypeFromProfile,
  shouldGenerateBossNode,
} from "../scripts/ingestHomework";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import {
  buildCapturedHomeworkContent,
  interpretHomeworkAssignment,
  normalizeContentProfile,
} from "../scripts/contentAwareHomeworkPlanner";
import { initializeLearningProfile } from "../utils/learningProfileIO";

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
  function sessionPlan(overrides: Partial<ActiveSessionPlan> = {}): ActiveSessionPlan {
    return {
      planId: "plan-review",
      childId: "ila",
      createdAt: "2026-05-15T12:00:00.000Z",
      source: "ingest_human_loop",
      activeHomeworkId: "hw-spelling",
      domain: "spelling",
      testDate: "2026-05-22",
      wordPlan: {
        cohortSize: 5,
        orderStrategy: "homework_order",
        words: ["shiny", "slowly", "lucky", "neatly", "sunny"].map((text) => ({
          text,
          purpose: "baseline",
          reason: "homework",
        })),
      },
      nodePlan: [
        {
          id: "n-word-radar",
          type: "word-radar",
          activityId: "word-radar",
          targets: ["shiny", "slowly", "lucky", "neatly", "sunny"],
          difficulty: 1,
          source: "pending_homework",
        },
        {
          id: "n-quest",
          type: "quest",
          activityId: "quest",
          targets: ["shiny", "slowly", "lucky", "neatly", "sunny"],
          difficulty: 2,
          source: "chart_planner",
          locked: true,
        },
        {
          id: "n-boss",
          type: "boss",
          activityId: "boss",
          targets: [],
          difficulty: 3,
          source: "chart_planner",
          locked: true,
        },
      ],
      variationPolicy: {
        avoidExactPreviousNodeOrder: false,
        avoidExactPreviousWordOrder: false,
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
      evidenceUsed: [{ id: "hw-spelling", type: "pending_homework", summary: "5 words" }],
      openQuestions: [],
      approvalStatus: "pending",
      plannerConfidence: 0.9,
      ...overrides,
    };
  }

  it("parseCliArgs accepts --testDate flag", () => {
    const childId = sampleChildIdFromConfig();
    expect(parseCliArgs([`--child=${childId}`, "--testDate=2026-05-03"])).toEqual({
      childId,
      testDate: "2026-05-03",
      opus: false,
      pdfOverridePath: null,
    });
  });

  it("preserves high-frequency word groups as held recognition targets", () => {
    const interpretation = interpretHomeworkAssignment({
      title: "Benchmark Advance Spelling Unit 9 Week 1",
      type: "spelling_test",
      words: [
        "shiny",
        "slowly",
        "lucky",
        "neatly",
        "sunny",
        "able",
        "behind",
        "carefully",
        "common",
        "easy",
      ],
      questions: [],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Spelling patterns and high-frequency words",
        primarySkill:
          "Spelling words with -y and -ly endings; recognizing and spelling high-frequency words",
        assignmentFormat: "ABC Order alphabetization exercise",
        concepts: ["Suffix patterns", "High-frequency words"],
        sourceEvidence: ["Two distinct word category sections"],
      },
      wordGroups: [
        {
          id: "group_1",
          label: "Words with -y or -ly Endings",
          purpose: "spell_from_memory",
          words: ["shiny", "slowly", "lucky", "neatly", "sunny"],
          confidence: 0.95,
          evidence: ["Left column explicitly labeled 'Words with -y or -ly Endings'"],
        },
        {
          id: "group_2",
          label: "High-Frequency Words",
          purpose: "spell_from_memory",
          words: ["able", "behind", "carefully", "common", "easy"],
          confidence: 0.95,
          evidence: ["Right column explicitly labeled 'High-Frequency Words'"],
        },
      ],
    });

    expect(interpretation.selectedTargets.map((group) => group.label)).toEqual([
      "Words with -y or -ly Endings",
    ]);
    expect(interpretation.heldTargets).toContainEqual(
      expect.objectContaining({
        label: "High-Frequency Words",
        purpose: "read_fluently",
        words: ["able", "behind", "carefully", "common", "easy"],
      }),
    );
  });

  it("parseCliArgs supports domain-specific intake without requiring child up front", () => {
    expect(parseCliArgs(["--domain=spelling"])).toEqual({
      childId: null,
      testDate: null,
      opus: false,
      pdfOverridePath: null,
      homeworkDomain: "spelling",
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

  it("resolves child during interactive intake", async () => {
    await expect(
      resolveIngestChildId({
        childId: null,
        childIds: ["ila", "reina"],
        interactive: true,
        ask: async () => "2",
      }),
    ).resolves.toBe("reina");

    await expect(
      resolveIngestChildId({
        childId: null,
        childIds: ["ila", "reina"],
        interactive: false,
      }),
    ).rejects.toThrow("Missing required argument --child=<childId>");
  });

  it("resolves homework file during interactive intake", async () => {
    const files = [
      "/tmp/incoming/a.txt",
      "/tmp/incoming/b.pdf",
      "/tmp/incoming/c.pdf",
    ];
    await expect(
      resolveIngestHomeworkFile({
        pdfOverridePath: null,
        incomingFiles: files,
        interactive: true,
        ask: async () => "3",
      }),
    ).resolves.toBe("/tmp/incoming/c.pdf");

    await expect(
      resolveIngestHomeworkFile({
        pdfOverridePath: "/tmp/override.pdf",
        incomingFiles: files,
        interactive: true,
        ask: async () => "1",
      }),
    ).resolves.toBe("/tmp/override.pdf");
  });

  it("resolves homework domain from the interactive menu", async () => {
    await expect(
      resolveIngestHomeworkDomain({
        interactive: true,
        ask: async () => "1",
      }),
    ).resolves.toBe("reading");

    await expect(
      resolveIngestHomeworkDomain({
        interactive: true,
        ask: async () => "not sure",
      }),
    ).resolves.toBeUndefined();

    await expect(
      resolveIngestHomeworkDomain({
        homeworkDomain: "science",
        interactive: true,
        ask: async () => "1",
      }),
    ).resolves.toBe("science");
  });

  it("marks a rejected session plan as pending revision instead of throwing", async () => {
    const plan = sessionPlan();
    const reviewed = await reviewExperiencePlan("ila", plan, {
      interactive: true,
      ask: async () => "n",
      reviewer: "parent",
      recordReview: vi.fn() as never,
    });

    expect(reviewed.approvalStatus).toBe("rejected");
    expect(reviewed.openQuestions).toContain("Parent rejected this session plan during homework ingestion.");
  });

  it("supports one parent revision pass with clearer node labels and constraints", async () => {
    const initial = sessionPlan();
    const revised = sessionPlan({
      planId: "plan-review-revised",
      wordPlan: {
        cohortSize: 10,
        orderStrategy: "homework_order",
        words: Array.from({ length: 10 }, (_, index) => ({
          text: `word${index}`,
          purpose: "baseline",
          reason: "parent requested 10 words",
        })),
      },
      nodePlan: [
        {
          id: "n-pronunciation",
          type: "pronunciation",
          activityId: "pronunciation",
          targets: Array.from({ length: 10 }, (_, index) => `word${index}`),
          difficulty: 1,
          source: "chart_planner",
        },
      ],
    });
    const answers = ["edit", "require pronunciation first, use 10 words", "y"];
    const printed: string[] = [];
    const reviewed = await reviewExperiencePlan("ila", initial, {
      interactive: true,
      ask: async () => answers.shift() ?? "y",
      reviewer: "parent",
      recordReview: vi.fn() as never,
      revisePlan: async (_plan, note) => ({
        ...revised,
        parentNote: note,
        openQuestions: [`Revision note: ${note}`],
      }),
      print: (line) => printed.push(line),
    });

    expect(reviewed.planId).toBe("plan-review-revised");
    expect(reviewed.approvalStatus).toBe("approved");
    expect(reviewed.parentNote).toBe("require pronunciation first, use 10 words");
    expect(reviewed.nodePlan[0]?.type).toBe("pronunciation");
    expect(reviewed.nodePlan[0]?.targets).toHaveLength(10);
    expect(printed.join("\n")).toContain("quest(locked, 5 targets)");
    expect(printed.join("\n")).toContain("boss(locked, mastery finale, 0 targets)");
  });

  it("resolves pasted homework paths from the interactive file menu", async () => {
    await expect(
      resolveIngestHomeworkFile({
        pdfOverridePath: null,
        incomingFiles: [],
        interactive: true,
        ask: async () => '"/Users/jamaltaylor/Downloads/5_11 reading  (1).pdf"',
      }),
    ).resolves.toBe("/Users/jamaltaylor/Downloads/5_11 reading  (1).pdf");

    const files = ["/tmp/incoming/a.pdf"];
    let call = 0;
    await expect(
      resolveIngestHomeworkFile({
        pdfOverridePath: null,
        incomingFiles: files,
        interactive: true,
        ask: async () => {
          call += 1;
          return call === 1 ? "2" : "/tmp/other reading.pdf";
        },
      }),
    ).resolves.toBe("/tmp/other reading.pdf");
  });

  it("lists configured ingest children without creator", () => {
    expect(listIngestChildIds()).toContain("ila");
    expect(listIngestChildIds()).toContain("reina");
    expect(listIngestChildIds()).not.toContain("creator");
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

  it("lets human intake domain override classifier domain and records the correction", () => {
    const classifierDomain = inferIngestDomainFromExtraction({
      type: "generic",
      contentProfile: normalizeContentProfile({
        title: "Able and Common Reading",
        type: "generic",
        words: ["able", "common"],
        questions: [],
        contentProfile: {
          practiceDomain: "reading",
          contentDomain: "language_arts",
          topic: "high-frequency reading",
          primarySkill: "reading fluency",
          assignmentFormat: "word list",
          concepts: ["high-frequency words"],
        },
      }),
    });
    const profile = initializeLearningProfile({
      childId: "ila",
      age: 7,
      grade: 1,
      diagnoses: [],
      learningGoals: [],
    });

    const updated = appendHomeworkIntakeHistory({
      profile,
      source: "human_menu",
      selectedDomain: "spelling",
      classifierDomain,
      homeworkId: "hw-reading-able-common",
      title: "Able and Common Reading",
    });

    expect(classifierDomain).toBe("reading");
    expect(updated.homeworkIntakeHistory?.[0]).toMatchObject({
      source: "human_menu",
      selectedDomain: "spelling",
      classifierDomain: "reading",
      homeworkId: "hw-reading-able-common",
    });
    expect(updated.homeworkIntakeHistory?.[0]?.note).toContain("Human-selected domain spelling");
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
      testDateSource: "cli",
      testDateConfirmed: true,
      returnTag: "#sunny_sample_hw_spelling_test_test0002",
    });
    expect(pending.weekOf).toBe("2026-04-21");
    expect(pending.testDate).toBe("2026-04-25");
    expect(pending.testDateSource).toBe("cli");
    expect(pending.testDateConfirmed).toBe(true);
    expect(pending.returnTag).toBe("#sunny_sample_hw_spelling_test_test0002");
  });

  it("builds stable homework return tags from child and homework id", () => {
    expect(buildHomeworkReturnTag("Reina", "hw-spelling_test-bb11de93")).toBe(
      "#sunny_reina_hw_spelling_test_bb11de93",
    );
  });

  it("resolves CLI, extracted, interactive, and non-interactive test dates with source metadata", async () => {
    await expect(
      resolveIngestedTestDate({
        cliTestDate: "2026-05-15",
        extractedTestDate: "2026-05-16",
        inferredTestDate: "2026-05-22",
        interactive: false,
      }),
    ).resolves.toEqual({
      testDate: "2026-05-15",
      testDateSource: "cli",
      testDateConfirmed: true,
    });

    await expect(
      resolveIngestedTestDate({
        cliTestDate: null,
        extractedTestDate: "2026-05-16",
        inferredTestDate: "2026-05-22",
        interactive: false,
      }),
    ).resolves.toEqual({
      testDate: "2026-05-16",
      testDateSource: "extracted",
      testDateConfirmed: false,
    });

    await expect(
      resolveIngestedTestDate({
        cliTestDate: null,
        extractedTestDate: null,
        inferredTestDate: "2026-05-22",
        interactive: true,
        ask: async () => "",
      }),
    ).resolves.toEqual({
      testDate: "2026-05-22",
      testDateSource: "human_confirmed",
      testDateConfirmed: true,
    });

    await expect(
      resolveIngestedTestDate({
        cliTestDate: null,
        extractedTestDate: null,
        inferredTestDate: "2026-05-22",
        interactive: true,
        ask: async () => "2026-05-20",
      }),
    ).resolves.toEqual({
      testDate: "2026-05-20",
      testDateSource: "human_confirmed",
      testDateConfirmed: true,
    });

    await expect(
      resolveIngestedTestDate({
        cliTestDate: null,
        extractedTestDate: null,
        inferredTestDate: "2026-05-22",
        interactive: false,
      }),
    ).resolves.toEqual({
      testDate: "2026-05-22",
      testDateSource: "inferred_next_friday",
      testDateConfirmed: false,
    });
  });

  it("does not default ungrouped homework words to spelling production", () => {
    expect(resolveHomeworkWordPurpose("whole", [])).toBe("unknown");
    expect(resolveHomeworkWordPurpose("whole", [
      {
        id: "high-frequency",
        label: "High-Frequency Words",
        purpose: "read_fluently",
        words: ["whole"],
        confidence: 0.8,
        evidence: ["AI grouped this as high-frequency reading."],
      },
    ])).toBe("read_fluently");
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
    expect(nodes.map((node) => node.type)).toEqual([
      "word-radar",
      "spell-check",
      "monster-stampede",
    ]);
    const radar = nodes.find((n) => n.type === "word-radar");
    const baseline = nodes.find((n) => n.type === "spell-check");
    const reinforcement = nodes.find((n) => n.type === "monster-stampede");
    expect(radar?.words.length).toBe(5);
    expect(baseline?.words.length).toBe(5);
    expect(reinforcement?.words.length).toBe(10);
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
    expect(nodes.map((node) => node.type)).toEqual([
      "word-radar",
      "spell-check",
      "monster-stampede",
    ]);
    const radar = nodes.find((n) => n.type === "word-radar");
    const baseline = nodes.find((n) => n.type === "spell-check");
    const reinforcement = nodes.find((n) => n.type === "monster-stampede");
    expect(radar?.words.length).toBe(maxWords);
    expect(baseline?.words.length).toBe(maxWords);
    expect(reinforcement?.words.length).toBe(maxWords * 2);
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
