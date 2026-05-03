import { describe, expect, it } from "vitest";
import {
  buildCapturedHomeworkContent,
  buildContentAwareHomeworkNodes,
  buildDynamicContentBrief,
  buildVariableRewardPlan,
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
    const nodes = buildContentAwareHomeworkNodes({
      homeworkId: "hw-spelling_test-erosion",
      childId: isolatedChildId,
      type: "spelling_test",
      words: ["faster", "fastest", "slower", "slowest", "covered"],
      testDate: "2026-05-06",
      contentProfile: normalizeContentProfile({
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
      }),
    });

    expect(nodes.map((n) => n.type)).toEqual([
      "karaoke",
      "word-radar",
      "spell-check",
      "wheel-of-fortune",
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
  });

  it("uses Reina profile motivators without allowing generic erosion story mode", () => {
    const nodes = buildContentAwareHomeworkNodes({
      homeworkId: "hw-reading-erosion-reina",
      childId: "reina",
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
    const reinaMentions = story.match(/\bReina\b/g)?.length ?? 0;

    expect(storyNode?.type).toBe("karaoke");
    expect(nodes.map((n) => n.type)).toEqual([
      "word-radar",
      "karaoke",
      "pronunciation",
      "word-builder",
      "word-radar",
    ]);
    expect(nodes[0]?.carePlan?.role).toBe("baseline-evaluator");
    expect(nodes[0]?.wordRadarItems?.[0]?.label).toBe("Concept Check");
    expect(nodes[3]?.rationale).toMatch(/academic vocabulary/i);
    expect(nodes[4]?.carePlan?.role).toBe("exit-evaluator");
    expect(reinaMentions).toBeGreaterThanOrEqual(1);
    expect(story).toMatch(/\b(wrestling|challenge|competition|strategy|personal best)\b/i);
    expect(story).toMatch(/\b(mission|timer|round|training)\b/i);
    expect(imagePrompt).toMatch(/\bReina\b/);
    expect(imagePrompt).toMatch(/\berosion\b/i);
    expect(imagePrompt).not.toMatch(/\bchallenge challenge\b/i);
    expect(story).not.toContain("noticed the words  while");
    expect(story).not.toContain("The practice words are .");
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
