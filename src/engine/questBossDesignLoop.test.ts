import { describe, expect, it } from "vitest";
import type { ActiveSessionPlan, LearningProfile } from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import type { AdventureChoiceSet } from "../shared/adventureBoardJson";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import {
  buildDesignBriefV1,
  conceptToQuestSpecV1,
  scoreConceptCandidateQuality,
  validateConceptCandidateV1,
  type ConceptCandidateV1,
} from "./questBossDesignLoop";

const WORDS = ["sign", "know", "write"];

function choiceSet(): AdventureChoiceSet {
  return {
    id: "quest-choice",
    kind: "quest-wrapper",
    title: "Pick your Quest",
    options: [
      { id: "launch", label: "Launch Lab", state: "available", tags: ["charge-meter", "visual", "action"] },
      { id: "mystery", label: "Mystery Vault", state: "available", tags: ["mystery", "puzzle"] },
    ],
  };
}

function plan(domain: string): ActiveSessionPlan {
  return {
    planId: `plan-${domain}`,
    childId: "reina",
    createdAt: "2026-05-29T12:00:00.000Z",
    source: "ingest_human_loop",
    activeHomeworkId: `hw-${domain}`,
    domain,
    testDate: "2026-05-30",
    nodePlan: [
      {
        id: "n-quest",
        type: "quest",
        activityId: "quest",
        targets: domain === "spelling" ? WORDS : ["main idea", "text evidence"],
        difficulty: 2,
        source: "chart_planner",
      },
    ],
    adventureBoard: {
      schemaVersion: 1,
      boardId: `board-${domain}`,
      planId: `plan-${domain}`,
      childId: "reina",
      domain: domain === "reading" ? "reading" : "spelling",
      theme: {
        background: { type: "solid", value: "#064e3b" },
        palette: {
          path: "#fef3c7",
          completed: "#16a34a",
          available: "#7c3aed",
          locked: "#64748b",
          current: "#f59e0b",
          preview: "#60a5fa",
          text: "#1f0f2d",
          panel: "#fff7e1",
        },
      },
      nodes: [{ id: "n-quest", kind: "quest", label: "Quest", state: "available", choiceSetId: "quest-choice" }],
      edges: [],
      choiceSets: [choiceSet()],
    },
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: domain,
      previousCompletedNodeCount: 1,
    },
    companionPolicy: {
      companionId: "matilda",
      displayName: "Matilda",
      openingLinePolicy: "silent",
      verbosity: "low",
      maxMicroProbes: 0,
    },
    evidenceUsed: [{ id: "baseline", type: "activity_result", summary: "baseline evidence exists" }],
    openQuestions: [],
    planTheory: {
      hypothesis: "A stronger wrapper should keep effort high while preserving the proof loop.",
      evidenceSummary: ["Child tends to replay visual challenge loops."],
      intervention: "Offer concept cards and build the selected one.",
      supportCriteria: ["Child completes attempts."],
      reviseCriteria: ["Child abandons or asks for different."],
      falsifyCriteria: ["Wrapper hides the academic proof."],
    },
  };
}

function profile(domain: string): LearningProfile {
  const p = initializeLearningProfile({
    childId: "reina",
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: [domain],
  });
  p.activeSessionPlan = plan(domain);
  p.activityTraitModel = {
    visual: {
      dimension: "visual",
      positiveWeight: 2,
      negativeWeight: 0,
      mixedWeight: 0,
      evidenceCount: 3,
      confidence: 0.8,
      lastUpdated: "2026-05-29T11:00:00.000Z",
      activityCounts: { "letter-rush": 3 },
    },
    "charge-meter": {
      dimension: "charge-meter",
      positiveWeight: 1.5,
      negativeWeight: 0,
      mixedWeight: 0,
      evidenceCount: 2,
      confidence: 0.7,
      lastUpdated: "2026-05-29T11:00:00.000Z",
      activityCounts: { "sunny-lab": 2 },
    },
  };
  return p;
}

function spellingCycle(): HomeworkCycle {
  return {
    homeworkId: "hw-spelling",
    subject: "spelling_test",
    wordList: WORDS,
    capturedContent: {
      title: "Silent Letter Spelling Test",
      type: "spelling_test",
      rawText: "Spelling words: sign, know, write",
      words: WORDS,
      questions: [],
      sourceDocuments: [],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "silent-letter spelling",
        primarySkill: "spell words from memory",
        assignmentFormat: "spelling list",
        concepts: ["silent letters"],
        sourceEvidence: ["fixture"],
      },
    },
    contentFingerprint: "spelling",
    calibrationStatus: "unverified",
    ingestedAt: "2026-05-29",
    testDate: "2026-05-30",
    testDateSource: "cli",
    testDateConfirmed: true,
    assumptions: null,
    theory: null,
    interventionHistory: [],
    postAnalysis: null,
    scanResult: null,
    delta: null,
    metrics: null,
  } as unknown as HomeworkCycle;
}

function readingCycle(): HomeworkCycle {
  return {
    homeworkId: "hw-reading",
    subject: "reading",
    wordList: [],
    capturedContent: {
      title: "Erosion Reading Questions",
      type: "reading",
      rawText: "Water and wind can carry soil away. Plants can help hold soil in place.",
      words: [],
      questions: [{ id: 1, question: "What carries soil away?", correctAnswer: "water and wind" }],
      sourceDocuments: [],
      contentProfile: {
        practiceDomain: "reading",
        contentDomain: "science",
        topic: "erosion",
        primarySkill: "reading comprehension from text evidence",
        assignmentFormat: "short passage questions",
        concepts: ["erosion", "text evidence"],
        sourceEvidence: ["fixture"],
      },
    },
    contentFingerprint: "reading",
    calibrationStatus: "unverified",
    ingestedAt: "2026-05-29",
    testDate: "2026-05-30",
    testDateSource: "cli",
    testDateConfirmed: true,
    assumptions: null,
    theory: null,
    interventionHistory: [],
    postAnalysis: null,
    scanResult: null,
    delta: null,
    metrics: null,
  } as unknown as HomeworkCycle;
}

function validConcept(overrides: Partial<ConceptCandidateV1> = {}): ConceptCandidateV1 {
  return {
    schemaVersion: 1,
    conceptId: "concept-launch",
    optionId: "launch",
    title: "Orb Launch Lab",
    hook: "Charge an orb by proving each answer, then launch it.",
    artDirection: "Full-bleed bright field, one central orb, charge meter, tactile launch button.",
    interactionFantasy: "Each correct proof adds charge to a launch orb.",
    rewardLoop: "Charge three times, flick to launch, celebrate the arc.",
    domainProofPlan: "Use hidden spelling recall. The child hears or receives a non-answer prompt, types from memory, then sees feedback after the attempt.",
    childFitRationale: "Matches visual charge-meter and action-loop signals from the child profile.",
    supportCriteria: ["Completes attempts", "Uses replay after success"],
    reviseCriteria: ["Back to map after first attempt"],
    falsifyCriteria: ["Visible answers appear before attempt"],
    traits: ["visual", "charge-meter", "action"],
    estimatedMinutes: 4,
    companionMicroQuestion: {
      prompt: "What caught your eye: the orb, the launch, or the challenge?",
      answerType: "short_choice",
      options: ["orb", "launch", "challenge"],
    },
    ...overrides,
  };
}

describe("Quest/Boss design loop", () => {
  it("builds a spelling design brief from the real assignment and child preference theory", () => {
    const brief = buildDesignBriefV1({
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSet: choiceSet(),
      homeworkCycle: spellingCycle(),
      profile: profile("spelling"),
      targetWords: WORDS,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(brief.assignment.rawText).toContain("Spelling words");
    expect(brief.domainTemplate.domain).toBe("spelling");
    expect(brief.domainTemplate.proofLoop).toContain("hidden spelling recall");
    expect(brief.childPreferenceTheory.preferredTraits).toContain("charge-meter");
    expect(brief.successRubric).toContain("concept maps to assignment truth");
  });

  it("builds a reading design brief with a reading-specific proof template", () => {
    const brief = buildDesignBriefV1({
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSet: choiceSet(),
      homeworkCycle: readingCycle(),
      profile: profile("reading"),
      targetWords: ["main idea", "text evidence"],
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(brief.assignment.rawText).toContain("Water and wind");
    expect(brief.assignment.questions[0]?.question).toContain("What carries soil");
    expect(brief.domainTemplate.domain).toBe("reading");
    expect(brief.domainTemplate.proofLoop).toContain("passage evidence");
    expect(brief.domainTemplate.requiredEvidence).toContain("answer_from_text");
  });

  it("rejects concepts that leak answers, runtime code, or omit proof metrics", () => {
    const answerLeak = validateConceptCandidateV1(
      validConcept({ hook: "Spell sign to charge the orb." }),
      buildDesignBriefV1({
        childId: "reina",
        kind: "quest",
        nodeId: "n-quest",
        choiceSet: choiceSet(),
        homeworkCycle: spellingCycle(),
        profile: profile("spelling"),
        targetWords: WORDS,
      }),
    );
    expect(answerLeak.ok).toBe(false);
    expect(answerLeak.failures.join(" ")).toContain("target answer");

    const runtimeLeak = validateConceptCandidateV1(
      validConcept({ artDirection: "<script>window.sendNodeComplete()</script>" }),
      buildDesignBriefV1({
        childId: "reina",
        kind: "quest",
        nodeId: "n-quest",
        choiceSet: choiceSet(),
        homeworkCycle: spellingCycle(),
        profile: profile("spelling"),
        targetWords: WORDS,
      }),
    );
    expect(runtimeLeak.ok).toBe(false);
    expect(runtimeLeak.failures.join(" ")).toContain("runtime");

    const noMetrics = validateConceptCandidateV1(
      validConcept({ supportCriteria: [] }),
      buildDesignBriefV1({
        childId: "reina",
        kind: "quest",
        nodeId: "n-quest",
        choiceSet: choiceSet(),
        homeworkCycle: spellingCycle(),
        profile: profile("spelling"),
        targetWords: WORDS,
      }),
    );
    expect(noMetrics.ok).toBe(false);
    expect(noMetrics.failures.join(" ")).toContain("supportCriteria");
  });

  it("turns the selected concept into a safe QuestSpec while preserving Sunny runtime ownership", () => {
    const spec = conceptToQuestSpecV1({
      concept: validConcept(),
      kind: "quest",
      domain: "spelling",
      difficulty: 2,
    });

    expect(spec.title).toBe("Orb Launch Lab");
    expect(spec.visualWorld).toContain("Full-bleed bright field");
    expect(spec.challengeFrame).toContain("hidden spelling recall");
    expect(spec.scenes[0]?.prompt).toContain("without seeing the answer");
    expect(JSON.stringify(spec)).not.toContain("sendNodeComplete");
  });

  it("scores an assignment-aligned child-fit concept above a generic game wrapper", () => {
    const brief = buildDesignBriefV1({
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSet: choiceSet(),
      homeworkCycle: spellingCycle(),
      profile: profile("spelling"),
      targetWords: WORDS,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });
    const strong = scoreConceptCandidateQuality(validConcept(), brief);
    const generic = scoreConceptCandidateQuality(validConcept({
      title: "Championship Arena",
      hook: "Play a bright arena challenge and win points.",
      artDirection: "Generic stadium with lights and score numbers.",
      interactionFantasy: "Answer rounds to get points.",
      rewardLoop: "Collect points until the end.",
      domainProofPlan: "Answer the challenge questions.",
      childFitRationale: "Kids like games.",
      supportCriteria: ["finishes"],
      reviseCriteria: ["does not finish"],
      falsifyCriteria: ["does not finish"],
      traits: ["arena"],
    }), brief);

    expect(strong.passed).toBe(true);
    expect(strong.score).toBeGreaterThanOrEqual(80);
    expect(generic.passed).toBe(false);
    expect(strong.score - generic.score).toBeGreaterThanOrEqual(30);
    expect(generic.findings).toContain("domain_proof_missing_required_evidence");
    expect(generic.findings).toContain("child_fit_missing_profile_trait");
  });

  it("recognizes hidden-target typed production even when the concept does not use exact rubric wording", () => {
    const brief = buildDesignBriefV1({
      childId: "reina",
      kind: "quest",
      nodeId: "n-quest",
      choiceSet: choiceSet(),
      homeworkCycle: spellingCycle(),
      profile: profile("spelling"),
      targetWords: WORDS,
    });
    const score = scoreConceptCandidateQuality(validConcept({
      domainProofPlan: "Audio word prompts only. Hidden spelling targets until after attempt submission. Evidence collection through typed production and accuracy tracking.",
    }), brief);

    expect(score.findings).not.toContain("domain_proof_missing_required_evidence");
    expect(score.passed).toBe(true);
  });
});
