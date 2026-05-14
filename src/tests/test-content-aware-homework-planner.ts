import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  applyHomeworkClarificationAnswer,
  buildCapturedHomeworkContent,
  buildContentAwareHomeworkNodes,
  buildDynamicContentBrief,
  buildVariableRewardPlan,
  interpretHomeworkAssignment,
  normalizeContentProfile,
  recommendBaselineActivities,
} from "../scripts/contentAwareHomeworkPlanner";

describe("content-aware homework planner", () => {
  const isolatedChildId = "qa_content_planner";

  it("keeps practice domain separate from content domain", () => {
    const profile = normalizeContentProfile({
      title: "Benchmark Advance Spelling Unit 8 Week 3",
      type: "spelling_test",
      words: ["faster", "fastest", "slower", "slowest"],
      questions: [],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "science",
        topic: "erosion",
        primarySkill: "comparative_and_superlative_adjectives",
        assignmentFormat: "picture_code_decode",
        concepts: ["erosion", "water", "wind", "landforms"],
      },
    });

    expect(profile.practiceDomain).toBe("spelling");
    expect(profile.contentDomain).toBe("science");
    expect(profile.topic).toBe("erosion");
    expect(profile.primarySkill).toBe("comparative_and_superlative_adjectives");
  });

  it("captures source homework content for future dynamic AI nodes", () => {
    const contentProfile = normalizeContentProfile({
      title: "Erosion Study Guide",
      type: "reading",
      words: ["erosion", "soil"],
      questions: [
        {
          id: 1,
          question: "What happens when water carries soil down a hill?",
          type: "written",
          options: null,
          correctAnswer: "erosion",
          hint: "Look for moved soil.",
        },
      ],
      contentProfile: {
        practiceDomain: "reading",
        contentDomain: "science",
        topic: "erosion",
        primarySkill: "reading_comprehension",
        assignmentFormat: "study_guide",
        concepts: ["erosion", "water", "soil"],
        sourceEvidence: ["Teacher page says water carries soil downhill."],
      },
    });

    const captured = buildCapturedHomeworkContent({
      title: "Erosion Study Guide",
      type: "reading",
      rawText:
        "Read about erosion. Water can carry soil down a hill. Answer the questions.",
      words: ["erosion", "soil"],
      questions: [
        {
          id: 1,
          question: "What happens when water carries soil down a hill?",
          type: "written",
          options: null,
          correctAnswer: "erosion",
          hint: "Look for moved soil.",
        },
      ],
      sourceDocuments: [
        { filename: "Test for May 6.pdf", mediaType: "application/pdf" },
        { filename: "Reading Mode Standalone.html", mediaType: "text/html" },
      ],
      contentProfile,
    });

    expect(captured.rawText).toContain("Water can carry soil down a hill");
    expect(captured.sourceDocuments.map((d) => d.filename)).toEqual([
      "Reading Mode Standalone.html",
      "Test for May 6.pdf",
    ]);
    expect(captured.words).toEqual(["erosion", "soil"]);
    const firstQuestion = captured.questions[0] as { question?: string } | undefined;
    expect(firstQuestion?.question).toContain("water carries soil");
    expect(captured.contentProfile.topic).toBe("erosion");
    expect(captured.contentProfile.sourceEvidence).toContain(
      "Teacher page says water carries soil downhill.",
    );
  });

  it("preserves worksheet word groups so high-frequency words are not flattened into spelling production", () => {
    const interpretation = interpretHomeworkAssignment({
      title: "Benchmark Advance Spelling Unit 9 Week 1",
      type: "spelling_test",
      words: [
        "shiny",
        "slowly",
        "lucky",
        "neatly",
        "sunny",
        "likely",
        "messy",
        "quickly",
        "rainy",
        "friendly",
        "able",
        "behind",
        "carefully",
        "common",
        "easy",
        "fact",
        "remember",
        "sure",
        "vowel",
        "whole",
      ],
      questions: [],
      wordGroups: [
        {
          id: "y-ly-spelling",
          label: "Words with -y or -ly Endings",
          purpose: "spell_from_memory",
          words: [
            "shiny",
            "slowly",
            "lucky",
            "neatly",
            "sunny",
            "likely",
            "messy",
            "quickly",
            "rainy",
            "friendly",
          ],
          confidence: 0.94,
          evidence: ["Left column header: 'Words with -y or -ly Endings'"],
        },
        {
          id: "high-frequency",
          label: "High-Frequency Words",
          purpose: "read_fluently",
          words: [
            "able",
            "behind",
            "carefully",
            "common",
            "easy",
            "fact",
            "remember",
            "sure",
            "vowel",
            "whole",
          ],
          confidence: 0.88,
          evidence: ["Right column header: 'High-Frequency Words'"],
          scheduleAfter: "spelling_measured",
        },
      ],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Words with -y or -ly Endings and High-Frequency Words",
        primarySkill: "Spelling words with -y and -ly endings; recognizing high-frequency words",
        assignmentFormat: "Spelling word list with writing practice lines",
        concepts: [
          "Adjectives ending in -y",
          "Adverbs ending in -ly",
          "High-frequency sight words",
          "Word spelling patterns",
        ],
        sourceEvidence: [
          "Left column header: 'Words with -y or -ly Endings'",
          "Right column header: 'High-Frequency Words'",
          "Words like 'shiny', 'slowly', 'lucky', 'neatly' show -y/-ly pattern",
          "High-frequency words include 'able', 'behind', 'common', 'easy', 'fact', 'remember', 'sure', 'vowel', 'whole'",
        ],
      },
    });

    const spellingGroup = interpretation.wordGroups.find((group) => group.purpose === "spell_from_memory");
    const highFrequencyGroup = interpretation.wordGroups.find((group) => group.label === "High-Frequency Words");

    expect(spellingGroup?.words).toEqual([
      "shiny",
      "slowly",
      "lucky",
      "neatly",
      "sunny",
      "likely",
      "messy",
      "quickly",
      "rainy",
      "friendly",
    ]);
    expect(highFrequencyGroup).toMatchObject({
      purpose: "read_fluently",
      scheduleAfter: "spelling_measured",
    });
    expect(highFrequencyGroup?.words).toEqual([
      "able",
      "behind",
      "carefully",
      "common",
      "easy",
      "fact",
      "remember",
      "sure",
      "vowel",
      "whole",
    ]);
    expect(interpretation.assertions.map((assertion) => assertion.id)).toContain(
      "high-frequency-source-interpretation",
    );
    expect(interpretation.status).toBe("ready");
    expect(interpretation.clarificationQuestions).toEqual([]);
  });

  it("repairs spelling-test interpretations that mislabeled every group as recognition", () => {
    const captured = buildCapturedHomeworkContent({
      title: "Benchmark Advance Spelling Unit 9 Week 2",
      type: "spelling_test",
      rawText: "",
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
        "government",
        "half",
        "machine",
        "pair",
        "quickly",
        "scientist",
        "thousand",
        "understood",
        "wait",
      ],
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
          words: [
            "government",
            "half",
            "machine",
            "pair",
            "quickly",
            "scientist",
            "thousand",
            "understood",
            "wait",
          ],
          confidence: 0.95,
          evidence: ["Section explicitly labeled 'High-Frequency Words'"],
        },
      ],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Schwa sound and high-frequency words",
        primarySkill:
          "Spelling words with schwa vowel and common high-frequency vocabulary",
        assignmentFormat: "Spelling word list with categorization exercises",
        concepts: [
          "Schwa sound",
          "Word families beginning with 'a'",
          "High-frequency words",
          "Vowel sounds",
        ],
        sourceEvidence: ["Benchmark Advance Spelling curriculum"],
      },
    });

    const interpretation = captured.assignmentInterpretation!;
    expect(interpretation.selectedTargets).toContainEqual(
      expect.objectContaining({
        id: "schwa_words",
        purpose: "spell_from_memory",
      }),
    );
    expect(interpretation.heldTargets).toContainEqual(
      expect.objectContaining({
        id: "high_frequency_words",
        purpose: "recognize",
      }),
    );

    const capturedGroups = captured.wordGroups ?? [];
    const staleCaptured = {
      ...captured,
      wordGroups: capturedGroups.map((group) => ({
        ...group,
        purpose: "recognize" as const,
      })),
      assignmentInterpretation: {
        ...interpretation,
        wordGroups: capturedGroups.map((group) => ({
          ...group,
          purpose: "recognize" as const,
        })),
        selectedTargets: [],
        heldTargets: capturedGroups.map((group) => ({
          ...group,
          purpose: "recognize" as const,
        })),
      },
    } satisfies typeof captured;
    const nodes = buildContentAwareHomeworkNodes({
      type: "spelling_test",
      words: captured.words,
      homeworkId: "hw-spelling_test-bb11de93",
      childId: isolatedChildId,
      testDate: "2026-05-15",
      contentProfile: captured.contentProfile,
      capturedContent: staleCaptured,
    });

    expect(nodes.map((node) => node.type)).toEqual([
      "word-radar",
      "spell-check",
      "monster-stampede",
      "pronunciation",
    ]);
    expect(nodes.find((node) => node.type === "pronunciation")?.words).toEqual([
      "government",
      "half",
      "machine",
      "pair",
      "quickly",
    ]);
  });

  it("assigns stable homework word ids so identical text can carry different assignment meanings", () => {
    const highFrequency = buildCapturedHomeworkContent({
      title: "Benchmark Advance Spelling Unit 9 Week 1",
      type: "spelling_test",
      words: ["whole"],
      questions: [],
      wordGroups: [
        {
          id: "high-frequency",
          label: "High-Frequency Words",
          purpose: "read_fluently",
          words: ["whole"],
          confidence: 0.88,
          evidence: ["AI extracted this as a high-frequency word group."],
          scheduleAfter: "spelling_measured",
        },
      ],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "High-frequency words",
        primarySkill: "reading fluency",
        assignmentFormat: "two-column word list",
        concepts: ["High-frequency sight words"],
        sourceEvidence: ["The word appears under High-Frequency Words."],
      },
    });
    const spelling = buildCapturedHomeworkContent({
      title: "Benchmark Advance Spelling Unit 10 Week 1",
      type: "spelling_test",
      words: ["whole"],
      questions: [],
      wordGroups: [
        {
          id: "spelling-pattern",
          label: "Spelling Words",
          purpose: "spell_from_memory",
          words: ["whole"],
          confidence: 0.9,
          evidence: ["AI extracted this as a spelling production group."],
        },
      ],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Spelling words",
        primarySkill: "spelling production",
        assignmentFormat: "word list",
        concepts: ["Word spelling patterns"],
        sourceEvidence: ["The word appears under Spelling Words."],
      },
    });

    const highFrequencyWord = highFrequency.homeworkWords?.[0];
    const spellingWord = spelling.homeworkWords?.[0];

    expect(highFrequencyWord).toMatchObject({
      text: "whole",
      wordGroupId: "high-frequency",
      purpose: "read_fluently",
      normalizedText: "whole",
    });
    expect(spellingWord).toMatchObject({
      text: "whole",
      wordGroupId: "spelling-pattern",
      purpose: "spell_from_memory",
      normalizedText: "whole",
    });
    expect(highFrequencyWord?.homeworkWordId).not.toBe(spellingWord?.homeworkWordId);
    expect(highFrequency.assignmentInterpretation?.heldTargets).toContainEqual(
      expect.objectContaining({ id: "high-frequency", purpose: "read_fluently" }),
    );
    expect(spelling.assignmentInterpretation?.selectedTargets).toContainEqual(
      expect.objectContaining({ id: "spelling-pattern", purpose: "spell_from_memory" }),
    );
  });

  it("creates separate homework word occurrences when the same text appears in two groups on one worksheet", () => {
    const captured = buildCapturedHomeworkContent({
      title: "Benchmark Advance Spelling Unit 9 Week 2",
      type: "spelling_test",
      words: ["above", "ago", "government"],
      questions: [],
      wordGroups: [
        {
          id: "schwa_words",
          label: "Schwa Words",
          purpose: "recognize",
          words: ["above", "ago"],
          confidence: 0.95,
          evidence: ["Words listed under Schwa section."],
        },
        {
          id: "high_frequency_words",
          label: "High-Frequency Words",
          purpose: "spell_from_memory",
          words: ["ago", "government"],
          confidence: 0.95,
          evidence: ["Words listed under High-Frequency Words section."],
        },
      ],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Schwa and high-frequency words",
        primarySkill: "assignment-scoped spelling and recognition",
        assignmentFormat: "two-column word list",
        concepts: ["Schwa", "High-frequency words"],
        sourceEvidence: ["The worksheet lists ago in both groups."],
      },
    });

    const agoOccurrences = captured.homeworkWords?.filter((word) => word.normalizedText === "ago");
    const schwaGroup = captured.wordGroups?.find((group) => group.id === "schwa_words");
    const highFrequencyGroup = captured.wordGroups?.find((group) => group.id === "high_frequency_words");

    expect(agoOccurrences).toHaveLength(2);
    expect(agoOccurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ wordGroupId: "schwa_words", purpose: "recognize" }),
        expect.objectContaining({ wordGroupId: "high_frequency_words", purpose: "spell_from_memory" }),
      ]),
    );
    expect(new Set(agoOccurrences?.map((word) => word.homeworkWordId)).size).toBe(2);
    expect(schwaGroup?.homeworkWordIds).toEqual(
      expect.arrayContaining([expect.stringContaining(":schwa_words:ago:")]),
    );
    expect(highFrequencyGroup?.homeworkWordIds).toEqual(
      expect.arrayContaining([expect.stringContaining(":high_frequency_words:ago:")]),
    );
  });

  it("asks for human clarification instead of flattening ambiguous spelling words", () => {
    const interpretation = interpretHomeworkAssignment({
      title: "Weekly Words",
      type: "spelling_test",
      words: ["shiny", "slowly", "able", "behind"],
      questions: [],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Weekly Words",
        primarySkill: "unknown word practice",
        assignmentFormat: "word list",
        concepts: [],
        sourceEvidence: ["The worksheet only shows a word list; directions were not captured."],
      },
    });

    expect(interpretation.status).toBe("needs_clarification");
    expect(interpretation.selectedTargets).toEqual([]);
    expect(interpretation.heldTargets[0]).toMatchObject({
      purpose: "unknown",
      words: ["shiny", "slowly", "able", "behind"],
    });
    expect(interpretation.clarificationQuestions[0]).toMatchObject({
      id: "clarify-weekly-words-purpose",
      targetGroupIds: ["weekly-words"],
    });

    const nodes = buildContentAwareHomeworkNodes({
      homeworkId: "hw-ambiguous-spelling",
      childId: isolatedChildId,
      type: "spelling_test",
      words: ["shiny", "slowly", "able", "behind"],
      contentProfile: normalizeContentProfile({
        title: "Weekly Words",
        type: "spelling_test",
        words: ["shiny", "slowly", "able", "behind"],
        questions: [],
        contentProfile: {
          practiceDomain: "spelling",
          contentDomain: "language_arts",
          topic: "Weekly Words",
          primarySkill: "unknown word practice",
          assignmentFormat: "word list",
          concepts: [],
          sourceEvidence: ["The worksheet only shows a word list; directions were not captured."],
        },
      }),
    });

    expect(nodes.filter((node) => node.type === "letter-rush")).toEqual([]);
  });

  it("applies parent clarification and replans from the confirmed target purpose", () => {
    const interpretation = interpretHomeworkAssignment({
      title: "Weekly Words",
      type: "spelling_test",
      words: ["shiny", "slowly", "able", "behind"],
      questions: [],
    });

    const clarified = applyHomeworkClarificationAnswer(interpretation, {
      questionId: "clarify-weekly-words-purpose",
      answer: "spell_from_memory",
      answeredBy: "parent",
      answeredAt: "2026-05-08T00:00:00.000Z",
    });

    expect(clarified.status).toBe("human_confirmed");
    expect(clarified.humanAnswers).toHaveLength(1);
    expect(clarified.selectedTargets[0]).toMatchObject({
      purpose: "spell_from_memory",
      words: ["shiny", "slowly", "able", "behind"],
      confidence: 0.99,
    });
    expect(clarified.clarificationQuestions).toEqual([]);
  });

  it("records memory matches so confirmed worksheet patterns ask for less help later", () => {
    const interpretation = interpretHomeworkAssignment({
      title: "Benchmark Advance Spelling Unit 9 Week 1",
      type: "spelling_test",
      words: ["shiny", "slowly", "able", "behind"],
      questions: [],
      wordGroups: [
        {
          id: "y-ly-spelling",
          label: "Words with -y or -ly Endings",
          purpose: "spell_from_memory",
          words: ["shiny", "slowly"],
          confidence: 0.78,
          evidence: ["Left column header matched prior parent-confirmed worksheet pattern."],
        },
        {
          id: "high-frequency",
          label: "High-Frequency Words",
          purpose: "read_fluently",
          words: ["able", "behind"],
          confidence: 0.76,
          evidence: ["Right column header matched prior parent-confirmed worksheet pattern."],
          scheduleAfter: "spelling_measured",
        },
      ],
      interpretationMemoryMatches: [
        {
          patternKey: "benchmark-advance-y-ly-high-frequency",
          confirmedAt: "2026-05-08T00:00:00.000Z",
          useCount: 2,
          confidenceBoost: 0.12,
          evidence: ["Parent confirmed the same two-column pattern before."],
        },
      ],
    });

    expect(interpretation.status).toBe("ready");
    expect(interpretation.memoryMatches[0]?.patternKey).toBe(
      "benchmark-advance-y-ly-high-frequency",
    );
  });

  it("routes baseline activities by homework domain instead of attaching every prototype", () => {
    const readingContent = buildCapturedHomeworkContent({
      title: "Erosion Study Guide",
      type: "reading",
      rawText: "Read the passage about erosion, then explain how water carries soil.",
      words: ["erosion", "soil"],
      questions: [
        {
          id: 1,
          question: "How does water change the hill?",
          correctAnswer: "It carries soil away.",
        },
      ],
      contentProfile: normalizeContentProfile({
        title: "Erosion Study Guide",
        type: "reading",
        words: ["erosion", "soil"],
        questions: [],
        contentProfile: {
          practiceDomain: "reading",
          contentDomain: "science",
          topic: "erosion",
          primarySkill: "reading_comprehension",
          assignmentFormat: "study_guide",
          concepts: ["erosion", "water", "soil"],
        },
      }),
    });

    const activities = recommendBaselineActivities(readingContent);

    expect(activities.map((a) => a.id)).toEqual([
      "reading-mode",
      "countdown-comprehension",
    ]);
    expect(activities[0]?.sourcePrototype).toBe("Reading Mode Standalone.html");
    expect(activities[1]?.sourcePrototype).toBe("Countdown Standalone.html");
    expect(activities.every((a) => a.reason.includes("erosion"))).toBe(true);
  });

  it("does not route reading/countdown prototypes onto unrelated math assignments", () => {
    const mathContent = buildCapturedHomeworkContent({
      title: "Two Digit Addition",
      type: "math",
      rawText: "Solve 24 + 17 and 31 + 8.",
      words: [],
      questions: [
        {
          id: 1,
          question: "What is 24 + 17?",
          correctAnswer: "41",
        },
      ],
      contentProfile: normalizeContentProfile({
        title: "Two Digit Addition",
        type: "math",
        words: [],
        questions: [],
        contentProfile: {
          practiceDomain: "math",
          contentDomain: "math",
          topic: "two digit addition",
          primarySkill: "addition_with_regrouping",
          assignmentFormat: "worksheet",
          concepts: ["addition", "regrouping"],
        },
      }),
    });

    const activities = recommendBaselineActivities(mathContent);

    expect(activities).toEqual([]);
  });

  it("builds a dynamic content brief from captured work, flow hooks, and measured gaps", () => {
    const captured = buildCapturedHomeworkContent({
      title: "Erosion Study Guide",
      type: "reading",
      rawText: "Water can carry soil down a hill and change the landform.",
      words: ["erosion", "soil"],
      questions: [
        {
          id: 1,
          question: "What moves soil down the hill?",
          correctAnswer: "water",
        },
      ],
      contentProfile: normalizeContentProfile({
        title: "Erosion Study Guide",
        type: "reading",
        words: ["erosion", "soil"],
        questions: [],
        contentProfile: {
          practiceDomain: "reading",
          contentDomain: "science",
          topic: "erosion",
          primarySkill: "reading_comprehension",
          assignmentFormat: "study_guide",
          concepts: ["erosion", "water", "soil"],
        },
      }),
    });

    const brief = buildDynamicContentBrief({
      childId: "reina",
      captured,
      childEngagementTags: ["competition", "strategy"],
      struggleSignals: [
        {
          skill: "reading_comprehension",
          evidence: "Missed the question about water moving soil.",
          severity: 2,
        },
        {
          skill: "pronunciation",
          evidence: "Hesitated on erosion.",
          severity: 1,
        },
      ],
    });

    expect(brief.childId).toBe("reina");
    expect(brief.assignment.topic).toBe("erosion");
    expect(brief.flowHooks).toEqual(["competition", "strategy"]);
    expect(brief.gapPlan.map((gap) => gap.skill)).toEqual([
      "reading_comprehension",
      "pronunciation",
    ]);
    expect(brief.allowedActivities.map((activity) => activity.id)).toEqual([
      "reading-mode",
      "countdown-comprehension",
    ]);
    expect(brief.generationGoals).toContain(
      "Create engaging content about erosion that keeps the academic concept accurate.",
    );
    expect(brief.generationGoals).toContain(
      "Use competition, strategy as the flow-state wrapper, then target reading_comprehension, pronunciation underneath.",
    );
  });

  it("plans a variable reward quest after strong erosion baseline performance", () => {
    const captured = buildCapturedHomeworkContent({
      title: "Erosion Study Guide",
      type: "reading",
      rawText: "Water can carry soil down a hill and change the landform.",
      words: ["erosion", "soil"],
      questions: [{ id: 1, question: "What moves soil?", correctAnswer: "water" }],
      contentProfile: normalizeContentProfile({
        title: "Erosion Study Guide",
        type: "reading",
        words: ["erosion", "soil"],
        questions: [],
        contentProfile: {
          practiceDomain: "reading",
          contentDomain: "science",
          topic: "erosion",
          primarySkill: "reading_comprehension",
          assignmentFormat: "study_guide",
          concepts: ["erosion", "water", "soil"],
        },
      }),
    });
    const brief = buildDynamicContentBrief({
      childId: "reina",
      captured,
      childEngagementTags: ["competition", "strategy"],
      struggleSignals: [
        {
          skill: "reading_comprehension",
          evidence: "Needs to explain water carrying soil.",
          severity: 2,
        },
      ],
    });

    const plan = buildVariableRewardPlan({
      brief,
      evidence: {
        completedBaselineActivities: ["reading-mode", "countdown-comprehension"],
        latestAccuracy: 0.9,
        recoveredAfterMiss: true,
        streakCount: 2,
      },
      rewardRoll: 0.2,
    });

    expect(plan.nextSteps.map((step) => step.type)).toEqual([
      "story-image-finale",
      "mystery-reward",
      "generate-quest",
      "boss-teaser",
    ]);
    expect(plan.questDecision.status).toBe("generate");
    expect(plan.variableReward.triggered).toBe(true);
    expect(plan.rationale.join(" ")).toContain("erosion");
  });

  it("routes weak baseline performance to support before quest generation", () => {
    const captured = buildCapturedHomeworkContent({
      title: "Erosion Study Guide",
      type: "reading",
      rawText: "Water can carry soil down a hill and change the landform.",
      words: ["erosion", "sediment"],
      questions: [{ id: 1, question: "What is erosion?", correctAnswer: "soil moving" }],
      contentProfile: normalizeContentProfile({
        title: "Erosion Study Guide",
        type: "reading",
        words: ["erosion", "sediment"],
        questions: [],
        contentProfile: {
          practiceDomain: "reading",
          contentDomain: "science",
          topic: "erosion",
          primarySkill: "reading_comprehension",
          assignmentFormat: "study_guide",
          concepts: ["erosion", "sediment", "soil"],
        },
      }),
    });
    const brief = buildDynamicContentBrief({
      childId: "reina",
      captured,
      childEngagementTags: ["challenge"],
      struggleSignals: [
        {
          skill: "pronunciation",
          evidence: "Hesitated on sediment.",
          severity: 3,
        },
      ],
    });

    const plan = buildVariableRewardPlan({
      brief,
      evidence: {
        completedBaselineActivities: ["reading-mode"],
        latestAccuracy: 0.45,
        recoveredAfterMiss: false,
        streakCount: 0,
      },
      rewardRoll: 0.9,
    });

    expect(plan.nextSteps.map((step) => step.type)).toEqual([
      "story-image-finale",
      "targeted-support",
      "boss-teaser",
    ]);
    expect(plan.questDecision.status).toBe("hold");
    expect(plan.variableReward.triggered).toBe(false);
    expect(plan.nextSteps[1]?.targetSkills).toEqual(["pronunciation"]);
  });

  it("does not use the reading reward path for unrelated math content", () => {
    const captured = buildCapturedHomeworkContent({
      title: "Two Digit Addition",
      type: "math",
      rawText: "Solve 24 + 17.",
      words: [],
      questions: [{ id: 1, question: "What is 24 + 17?", correctAnswer: "41" }],
      contentProfile: normalizeContentProfile({
        title: "Two Digit Addition",
        type: "math",
        words: [],
        questions: [],
        contentProfile: {
          practiceDomain: "math",
          contentDomain: "math",
          topic: "two digit addition",
          primarySkill: "addition_with_regrouping",
          assignmentFormat: "worksheet",
          concepts: ["addition", "regrouping"],
        },
      }),
    });
    const brief = buildDynamicContentBrief({
      childId: "reina",
      captured,
      childEngagementTags: ["competition"],
      struggleSignals: [],
    });

    const plan = buildVariableRewardPlan({
      brief,
      evidence: {
        completedBaselineActivities: [],
        latestAccuracy: 1,
        recoveredAfterMiss: false,
        streakCount: 3,
      },
      rewardRoll: 0.1,
    });

    expect(plan.nextSteps.map((step) => step.type)).toEqual(["boss-teaser"]);
    expect(plan.questDecision.status).toBe("not_applicable");
    expect(plan.variableReward.triggered).toBe(false);
  });

  it("creates a karaoke concept-builder before spelling drills for erosion spelling homework", () => {
    const contentProfile = normalizeContentProfile({
      title: "Erosion spelling",
      type: "spelling_test",
      words: ["faster", "fastest", "slower", "slowest", "covered"],
      questions: [],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "science",
        topic: "erosion",
        primarySkill: "comparative_and_superlative_adjectives",
        assignmentFormat: "picture_code_decode",
        concepts: ["erosion", "water", "wind", "rocks", "soil"],
      },
    });
    const nodes = buildContentAwareHomeworkNodes({
      homeworkId: "hw-spelling_test-erosion",
      childId: isolatedChildId,
      type: "spelling_test",
      words: ["faster", "fastest", "slower", "slowest", "covered"],
      testDate: "2026-05-06",
      contentProfile,
      capturedContent: buildCapturedHomeworkContent({
        title: "Erosion spelling",
        type: "spelling_test",
        rawText: "Picture code spelling practice for erosion words.",
        words: ["faster", "fastest", "slower", "slowest", "covered"],
        questions: [],
        wordGroups: [
          {
            id: "erosion-spelling-production",
            label: "Erosion spelling words",
            purpose: "spell_from_memory",
            words: ["faster", "fastest", "slower", "slowest", "covered"],
            confidence: 0.91,
            evidence: ["AI interpretation: picture code page asks for spelling production."],
          },
        ],
        contentProfile,
      }),
    });

    expect(nodes.map((n) => n.type)).toEqual([
      "karaoke",
      "spell-check",
    ]);
    expect(nodes[0]?.storyText?.toLowerCase()).toContain("erosion");
    expect(nodes[0]?.storyText?.toLowerCase()).toContain("water");
    expect(nodes[0]?.storyText?.toLowerCase()).toContain("faster");
    expect(nodes[0]?.words.length).toBeGreaterThan(10);
    expect(nodes[1]?.words).toEqual([
      "faster",
      "fastest",
      "slower",
      "slowest",
      "covered",
    ]);
    expect(nodes[1]?.rationale).toContain("independent recall");
  });

  it("uses a cohort plan for spelling-production words and holds high-frequency words for recognition", () => {
    const capturedContent = buildCapturedHomeworkContent({
      title: "Benchmark Advance Spelling Unit 9 Week 1",
      type: "spelling_test",
      rawText: "",
      words: [
        "shiny",
        "slowly",
        "lucky",
        "neatly",
        "sunny",
        "likely",
        "messy",
        "quickly",
        "rainy",
        "friendly",
        "able",
        "behind",
        "carefully",
        "common",
        "easy",
        "fact",
        "remember",
        "sure",
        "vowel",
        "whole",
      ],
      questions: [],
      wordGroups: [
        {
          id: "y-ly-spelling",
          label: "Words with -y or -ly Endings",
          purpose: "spell_from_memory",
          words: [
            "shiny",
            "slowly",
            "lucky",
            "neatly",
            "sunny",
            "likely",
            "messy",
            "quickly",
            "rainy",
            "friendly",
          ],
          confidence: 0.94,
          evidence: ["Left column header: 'Words with -y or -ly Endings'"],
        },
        {
          id: "high-frequency",
          label: "High-Frequency Words",
          purpose: "read_fluently",
          words: [
            "able",
            "behind",
            "carefully",
            "common",
            "easy",
            "fact",
            "remember",
            "sure",
            "vowel",
            "whole",
          ],
          confidence: 0.88,
          evidence: ["Right column header: 'High-Frequency Words'"],
          scheduleAfter: "spelling_measured",
        },
      ],
      contentProfile: normalizeContentProfile({
        title: "Benchmark Advance Spelling Unit 9 Week 1",
        type: "spelling_test",
        words: [],
        questions: [],
        contentProfile: {
          practiceDomain: "spelling",
          contentDomain: "language_arts",
          topic: "Words with -y or -ly Endings and High-Frequency Words",
          primarySkill: "Spelling words with -y and -ly endings; recognizing high-frequency words",
          assignmentFormat: "Spelling word list with writing practice lines",
          concepts: ["Adjectives ending in -y", "Adverbs ending in -ly", "High-frequency sight words"],
          sourceEvidence: [
            "Left column header: 'Words with -y or -ly Endings'",
            "Right column header: 'High-Frequency Words'",
            "High-frequency words include 'able', 'behind', 'common', 'easy', 'fact', 'remember', 'sure', 'vowel', 'whole'",
          ],
        },
      }),
    });

    const nodes = buildContentAwareHomeworkNodes({
      homeworkId: "hw-spelling_test-unit9",
      childId: isolatedChildId,
      type: "spelling_test",
      words: capturedContent.words,
      testDate: "2026-05-08",
      contentProfile: capturedContent.contentProfile,
      capturedContent,
    });

    expect(nodes.map((node) => node.type)).toEqual([
      "word-radar",
      "spell-check",
      "monster-stampede",
      "pronunciation",
    ]);
    const wordRadarNode = nodes.find((node) => node.type === "word-radar");
    const spellCheckNode = nodes.find((node) => node.type === "spell-check");
    const arcadeNode = nodes.find((node) => node.type === "monster-stampede");
    const pronunciationNode = nodes.find((node) => node.type === "pronunciation");
    expect(wordRadarNode?.words).toEqual([
      "shiny",
      "slowly",
      "lucky",
      "neatly",
      "sunny",
    ]);
    expect(spellCheckNode?.words).toEqual([
      "likely",
      "messy",
      "quickly",
      "rainy",
      "friendly",
    ]);
    expect(arcadeNode?.words).toEqual([
      "shiny",
      "slowly",
      "lucky",
      "neatly",
      "sunny",
      "likely",
      "messy",
      "quickly",
      "rainy",
      "friendly",
    ]);
    expect(arcadeNode?.rationale).toContain("cohort memory");
    expect(pronunciationNode?.words).toEqual([
      "able",
      "behind",
      "carefully",
      "common",
      "easy",
    ]);
    expect(wordRadarNode?.adaptivePlan?.heldTargets).toContainEqual(
      expect.objectContaining({
        purpose: "read_fluently",
        words: expect.arrayContaining(["able", "behind", "whole"]),
      }),
    );
  });

  it("uses learned adaptive load to start pronunciation with 10 held fluency words", () => {
    const adaptiveChildId = "qa_content_planner_adaptive_load";
    const adaptiveContextDir = path.join(
      process.cwd(),
      "src",
      "context",
      adaptiveChildId,
    );
    fs.mkdirSync(adaptiveContextDir, { recursive: true });
    fs.writeFileSync(
      path.join(adaptiveContextDir, "learning_profile.json"),
      JSON.stringify(
        {
          childId: adaptiveChildId,
          version: 1,
          createdAt: "2026-05-12T00:00:00.000Z",
          lastUpdated: "2026-05-12T00:00:00.000Z",
          adaptiveLoadState: {
            spelling: {
              domain: "spelling",
              currentCohortSize: 10,
              maxRecentSuccessfulCohort: 10,
              challengeRecommendation: "harder_valid_node",
              lastLoadEvidence: {
                activityId: "spell-check",
                completed: true,
                accuracy: 1,
                targetCount: 5,
                frustrationScore: 0.1,
                strongEvidence: true,
                occurredAt: "2026-05-12T00:00:00.000Z",
              },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    try {
      const spellingWords = [
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
      const fluencyWords = [
        "government",
        "half",
        "machine",
        "pair",
        "quickly",
        "scientist",
        "thousand",
        "understood",
        "wait",
        "young",
      ];
      const capturedContent = buildCapturedHomeworkContent({
        title: "Benchmark Advance Spelling Unit 9 Week 2",
        type: "spelling_test",
        rawText: "",
        words: [...spellingWords, ...fluencyWords],
        questions: [],
        wordGroups: [
          {
            id: "schwa_words",
            label: "Schwa Words",
            purpose: "spell_from_memory",
            words: spellingWords,
            confidence: 0.95,
            evidence: ["Left column header: Schwa Words"],
          },
          {
            id: "high_frequency_words",
            label: "High-Frequency Words",
            purpose: "read_fluently",
            words: fluencyWords,
            confidence: 0.95,
            evidence: ["Right column header: High-Frequency Words"],
          },
        ],
        contentProfile: normalizeContentProfile({
          title: "Benchmark Advance Spelling Unit 9 Week 2",
          type: "spelling_test",
          words: [],
          questions: [],
          contentProfile: {
            practiceDomain: "spelling",
            contentDomain: "language_arts",
            topic: "Schwa sound and high-frequency words",
            primarySkill: "spelling_recall_and_read_fluently",
            assignmentFormat: "two-column word list",
            concepts: ["Schwa", "High-frequency words"],
          },
        }),
      });

      const nodes = buildContentAwareHomeworkNodes({
        homeworkId: "hw-spelling_test-adaptive-pronunciation",
        childId: adaptiveChildId,
        type: "spelling_test",
        words: capturedContent.words,
        testDate: "2026-05-15",
        contentProfile: capturedContent.contentProfile,
        capturedContent,
      });

      expect(nodes.find((node) => node.type === "pronunciation")?.words).toEqual(
        fluencyWords,
      );
    } finally {
      fs.rmSync(adaptiveContextDir, { recursive: true, force: true });
    }
  });

  it("routes recognition-only spelling homework to pronunciation instead of creating no practice", () => {
    const capturedContent = buildCapturedHomeworkContent({
      title: "Benchmark Advance Spelling Unit 9 Week 2",
      type: "spelling_test",
      rawText: "",
      words: ["above", "ago", "government", "wait"],
      questions: [],
      wordGroups: [
        {
          id: "schwa",
          label: "Schwa",
          purpose: "recognize",
          words: ["above", "ago"],
          confidence: 0.95,
          evidence: ["Worksheet section asks Reina to recognize schwa patterns."],
        },
        {
          id: "high_frequency",
          label: "High-Frequency Words",
          purpose: "read_fluently",
          words: ["government", "wait"],
          confidence: 0.9,
          evidence: ["Worksheet section labels these as high-frequency words."],
        },
      ],
      contentProfile: normalizeContentProfile({
        title: "Benchmark Advance Spelling Unit 9 Week 2",
        type: "spelling_test",
        words: [],
        questions: [],
        contentProfile: {
          practiceDomain: "spelling",
          contentDomain: "language_arts",
          topic: "Schwa Sounds and High-Frequency Words",
          primarySkill: "recognizing schwa and reading high-frequency words",
          assignmentFormat: "two-column word list",
          concepts: ["Schwa", "High-frequency words"],
        },
      }),
    });

    const nodes = buildContentAwareHomeworkNodes({
      homeworkId: "hw-spelling_test-recognition",
      childId: isolatedChildId,
      type: "spelling_test",
      words: capturedContent.words,
      testDate: "2026-05-15",
      contentProfile: capturedContent.contentProfile,
      capturedContent,
    });

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: "pronunciation",
      words: ["above", "ago", "government", "wait"],
    });
    expect(nodes[0]?.rationale).toContain("recognition/fluency");
  });

  it("uses Reina profile motivators without allowing generic erosion story mode", () => {
    const nodes = buildContentAwareHomeworkNodes({
      homeworkId: "hw-reading-erosion-reina",
      childId: "reina",
      type: "reading",
      words: [],
      capturedContent: buildCapturedHomeworkContent({
        title: "Erosion reading comprehension",
        type: "reading",
        rawText:
          "Erosion happens when wind, water, or ice wear away rocks and soil. Rivers flow downhill from mountains to oceans or lakes.",
        words: ["erosion", "wear away", "rocks", "soil", "wind", "water", "ice", "rivers"],
        questions: [
          {
            id: 1,
            question: "What is erosion?",
            correctAnswer:
              "Erosion happens when wind, water, or ice wear away rocks and soil",
          },
          {
            id: 2,
            question: "How do rivers usually flow?",
            correctAnswer: "Downhill, from mountains to oceans or lakes",
          },
        ],
        contentProfile: normalizeContentProfile({
          title: "Erosion reading comprehension",
          type: "reading",
          words: [],
          questions: [],
          contentProfile: {
            practiceDomain: "reading",
            contentDomain: "science",
            topic: "erosion",
            primarySkill: "reading_comprehension",
            assignmentFormat: "study_guide",
            concepts: ["erosion", "water", "wind", "rocks", "soil", "landforms"],
          },
        }),
      }),
      contentProfile: normalizeContentProfile({
        title: "Erosion reading comprehension",
        type: "reading",
        words: [],
        questions: [],
        contentProfile: {
          practiceDomain: "reading",
          contentDomain: "science",
          topic: "erosion",
          primarySkill: "reading_comprehension",
          assignmentFormat: "study_guide",
          concepts: ["erosion", "water", "wind", "rocks", "soil", "landforms"],
        },
      }),
    });

    const storyNode = nodes.find((node) => node.type === "karaoke");
    const story = storyNode?.storyText ?? "";
    const imagePrompt = storyNode?.storyImagePrompt ?? "";
    const reinaMentions = story.match(/\bReina\b/g)?.length ?? 0;

    expect(storyNode?.type).toBe("karaoke");
    expect(nodes.map((n) => n.type)).toEqual([
      "concept-check",
      "karaoke",
      "pronunciation",
      "word-builder",
      "concept-check",
    ]);
    expect(nodes[0]?.carePlan?.role).toBe("baseline-evaluator");
    expect(nodes[0]?.activityConfigPath).toBe(
      "/api/activity-config/reina/hw-reading-erosion-reina/concept-check-baseline.json",
    );
    expect((nodes[0]?.activityConfig as { activityId?: string } | undefined)?.activityId).toBe(
      "concept-check",
    );
    expect(nodes[3]?.rationale).toMatch(/academic vocabulary/i);
    expect(nodes[4]?.carePlan?.role).toBe("exit-evaluator");
    expect(nodes[4]?.activityConfigPath).toBe(
      "/api/activity-config/reina/hw-reading-erosion-reina/concept-check-exit.json",
    );
    expect(reinaMentions).toBeGreaterThanOrEqual(1);
    expect(story).toMatch(/wind, water, or ice wear away rocks and soil/i);
    expect(story).toMatch(/downhill/i);
    expect(story).toMatch(/\b(wrestling|challenge|competition|strategy|personal best)\b/i);
    expect(story).toMatch(/\b(mission|timer|round|training)\b/i);
    expect(imagePrompt).toMatch(/\bReina\b/);
    expect(imagePrompt).toMatch(/\berosion\b/i);
    expect(imagePrompt).toMatch(/\bcentral visible character\b/i);
    expect(imagePrompt).toMatch(/\bbackground\b/i);
    expect(imagePrompt).toMatch(/\bcontrast\b/i);
    expect(imagePrompt).not.toMatch(/\bchallenge challenge\b/i);
    expect(story).not.toContain("noticed the words  while");
    expect(story).not.toContain("The practice words are .");
    expect(story).not.toContain("Reina stepped into the muddy training valley like it was a wrestling mat");
  });

  it("personalizes non-Reina stories without Reina-specific framing", () => {
    const nodes = buildContentAwareHomeworkNodes({
      homeworkId: "hw-reading-erosion-ila",
      childId: "ila",
      type: "reading",
      words: [],
      contentProfile: normalizeContentProfile({
        title: "Erosion reading comprehension",
        type: "reading",
        words: [],
        questions: [],
        contentProfile: {
          practiceDomain: "reading",
          contentDomain: "science",
          topic: "erosion",
          primarySkill: "reading_comprehension",
          assignmentFormat: "study_guide",
          concepts: ["erosion", "water", "wind", "rocks", "soil", "landforms"],
        },
      }),
    });

    const storyNode = nodes.find((node) => node.type === "karaoke");
    const story = storyNode?.storyText ?? "";
    const imagePrompt = storyNode?.storyImagePrompt ?? "";

    expect(story).toMatch(/\bIla\b/);
    expect(imagePrompt).toMatch(/\bIla\b/);
    expect(story).not.toMatch(/\bReina\b/);
    expect(story).not.toMatch(/\bwrestling mat\b/i);
  });
});
