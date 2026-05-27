import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import type { ChildChart } from "../profiles/childChart";
import type { CapturedHomeworkContent } from "../scripts/contentAwareHomeworkPlanner";
import {
  ASSIGNMENT_PLANNER_TOOL_NAME,
  assignmentPlannerToolJsonSchema,
  buildAssignmentPlanningPacket,
  buildAssignmentPlannerPrompt,
  buildPlannerReadinessAudit,
  ASSIGNMENT_PLANNER_PERSONA,
  assignmentPlannerSourceImages,
  parseAssignmentPlannerToolUseResponse,
  normalizeAssignmentNodeType,
  parseAssignmentPlannerJson,
  summarizeAssignmentPlanForReview,
  validateAssignmentPlannerOutput,
  type AssignmentPlannerOutput,
  type AssignmentSourceExtraction,
} from "./assignmentPlanner";

const WORD_RADAR_LETTER_FILL_CONFIG = {
  recallMode: "partial_visual_recall" as const,
  inputMode: "letter-by-letter" as const,
  speakStyle: "option-a" as const,
  showTimer: false,
  hideWordDuringResponse: true,
  requiresCapturedResponse: true,
};

const CHOICE_SIGNAL = {
  algorithmFeed: "choicePolicy" as const,
  traits: ["story", "choice"],
  expectedEvidence: "shown/chosen/skipped/completed outcome for preference only",
  preferenceNotMastery: true as const,
};

function adventureSpineNodes(targets = ["sign", "know", "write"]): ActiveSessionPlan["nodePlan"] {
  return [
    {
      id: "mystery-choice",
      type: "mystery",
      activityId: "mystery",
      targets,
      difficulty: 2,
      source: "chart_planner",
      targetLane: "silent_letters",
      choiceMode: "choice_lab",
      locked: false,
    },
    {
      id: "quest-transfer",
      type: "quest",
      activityId: "quest",
      targets,
      difficulty: 2,
      source: "chart_planner",
      targetLane: "silent_letters",
      locked: true,
      masteryUnlockState: "preparing",
    },
    {
      id: "boss-mastery",
      type: "boss",
      activityId: "boss",
      targets: [],
      difficulty: 3,
      source: "chart_planner",
      locked: true,
      masteryUnlockState: "preparing",
    },
  ];
}

function extraction(): AssignmentSourceExtraction {
  return {
    sourceKind: "scanned_assignment_image",
    sourcePath: "/tmp/5_18_spelling.pdf",
    filename: "5_18_spelling.pdf",
    mediaType: "application/pdf",
    fileHash: "a".repeat(64),
    extractionMethod: "tesseract",
    pages: [
      {
        pageNumber: 1,
        text: "Benchmark Advance Spelling\nUnit 9 Week 3\nSilent Letters\nsign\nknow\nwrite\nHigh-Frequency Words\namong\nbuilding\ncircle",
      },
    ],
    fullText:
      "Benchmark Advance Spelling\nUnit 9 Week 3\nSilent Letters\nsign\nknow\nwrite\nHigh-Frequency Words\namong\nbuilding\ncircle",
    warnings: ["pdf_embedded_text_empty_used_ocr"],
  };
}

function chart(): ChildChart {
  return {
    childId: "reina",
    rootDir: process.cwd(),
    identity: { childId: "reina", displayName: "Reina" },
    adventureMapProfile: {
      defaultLayoutPreset: "horizontal-adventure-spine",
      companionSlot: "right",
      agencyNotes: ["Enjoys choice when it unlocks after work."],
      visualStyleNotes: ["Illustrated maps help her see progress."],
      staminaNotes: ["Keep the board compact when tired."],
    },
    learningProfile: {
      childId: "reina",
      name: "Reina",
      age: 9,
      grade: 3,
      diagnoses: [],
      learningGoals: [],
      preferences: {},
      strengths: [],
      challenges: [],
      notes: [],
      sessionHistory: [],
      totalSessions: 0,
      lastUpdated: "2026-05-20T00:00:00.000Z",
    },
    homework: { pending: null, selectedDomain: "spelling", lanes: {}, recent: [] },
    activeSessionPlan: null,
    carePlan: { current: null, source: "missing" },
    companion: { presetId: "matilda", config: {}, displayName: "Matilda" },
    companionCare: { plan: {}, view: {}, filePath: "", existed: true },
    artifacts: { contentCatalog: [] },
    activityResults: { latest: null, recent: [] },
    decisionTrace: [],
  } as unknown as ChildChart;
}

function planWithNodes(nodes: ActiveSessionPlan["nodePlan"]): ActiveSessionPlan {
  return {
    planId: "assignment-plan-reina",
    childId: "reina",
    createdAt: "2026-05-20T00:00:00.000Z",
    source: "ingest_human_loop",
    activeHomeworkId: "hw-spelling_test-demo",
    domain: "spelling",
    testDate: "2026-05-22",
    nodePlan: nodes,
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: "assignment-plan",
      previousCompletedNodeCount: 0,
    },
    companionPolicy: {
      companionId: "elli",
      displayName: "Elli",
      openingLinePolicy: "context_start_short",
      verbosity: "low",
      maxMicroProbes: 1,
    },
    evidenceUsed: [{ id: "source", type: "assignment_source", summary: "OCR source text" }],
    openQuestions: [],
    approvalStatus: "pending",
  };
}

function goodOutput(): AssignmentPlannerOutput {
  const capturedContent: CapturedHomeworkContent = {
    title: "Benchmark Advance Spelling Unit 9 Week 3",
    type: "spelling_test",
    rawText: extraction().fullText,
    words: ["sign", "know", "write", "among", "building", "circle"],
    questions: [],
    sourceDocuments: [{ filename: "5_18_spelling.pdf", mediaType: "application/pdf" }],
    contentProfile: {
      practiceDomain: "spelling",
      contentDomain: "language_arts",
      topic: "Silent letters and high-frequency words",
      primarySkill: "Spell silent-letter words and read high-frequency words fluently",
      assignmentFormat: "Grouped word list",
      concepts: ["Silent Letters", "High-Frequency Words"],
      sourceEvidence: ["OCR headings preserved source groups"],
    },
    wordGroups: [
      {
        id: "silent_letters",
        label: "Silent Letters",
        purpose: "spell_from_memory",
        words: ["sign", "know", "write"],
        confidence: 0.95,
        evidence: ["Heading says Silent Letters under spelling assignment."],
      },
      {
        id: "high_frequency_words",
        label: "High-Frequency Words",
        purpose: "read_fluently",
        words: ["among", "building", "circle"],
        confidence: 0.95,
        evidence: ["High-frequency heading means fluent reading unless source says spelling test."],
      },
    ],
  };

  return {
    capturedContent,
    assignmentInterpretation: {
      schemaVersion: 1,
      status: "ready",
      wordGroups: capturedContent.wordGroups!,
      assertions: [
        {
          id: "hf-reading",
          claim: "High-Frequency Words are reading/pronunciation targets, not spelling-production targets.",
          confidence: 0.95,
          evidence: ["Source label is High-Frequency Words, not spelling words."],
        },
      ],
      selectedTargets: [capturedContent.wordGroups![0]!],
      heldTargets: [capturedContent.wordGroups![1]!],
      clarificationQuestions: [],
      humanAnswers: [],
      memoryMatches: [],
    },
    homeworkWords: [
      { text: "sign", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
      { text: "know", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
      { text: "write", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
      { text: "among", sourceGroupId: "high_frequency_words", purpose: "read_fluently" },
      { text: "building", sourceGroupId: "high_frequency_words", purpose: "read_fluently" },
      { text: "circle", sourceGroupId: "high_frequency_words", purpose: "read_fluently" },
    ],
    activeSessionPlan: planWithNodes([
      {
        id: "pronunciation-high-frequency",
        type: "pronunciation",
        activityId: "pronunciation",
        targets: ["among", "building", "circle"],
        difficulty: 1,
        source: "chart_planner",
        targetLane: "high_frequency_words",
      },
      {
        id: "spell-check-silent-letters",
        type: "spell-check",
        activityId: "spell-check",
        targets: ["sign", "know", "write"],
        difficulty: 1,
        source: "chart_planner",
        targetLane: "silent_letters",
      },
      ...adventureSpineNodes(),
    ]),
    plannedMeasurements: [
      {
        id: "measure-pronunciation-high-frequency",
        activityId: "pronunciation",
        target: "high_frequency_words",
        evidenceType: "read_fluently",
        supportCriteria: "clean read-aloud attempts",
        reviseCriteria: "retries or hesitation",
        falsifyCriteria: "contaminated or missing attempts",
      },
    ],
    planTheory: {
      hypothesis: "Reina needs spelling production for silent letters and fluent reading for high-frequency words.",
      evidenceSummary: ["Source groups separate Silent Letters from High-Frequency Words."],
      intervention: "Route each source group to an activity that measures its actual purpose.",
      supportCriteria: ["silent letters spelled from memory", "high-frequency words read aloud"],
      reviseCriteria: ["mixed performance"],
      falsifyCriteria: ["grouping contradicted by source or parent correction"],
    },
    reviewQuestions: [
      "High-frequency words are being used to check fluent reading/pronunciation, not spelling-production mastery.",
    ],
  };
}

function plannerDraftWithAdventureBoard(adventureBoard: unknown): unknown {
  return {
    capturedContent: {
      title: "Demo",
      type: "spelling_test",
      rawText: "Silent Letters\nsign",
      words: ["sign"],
      questions: [],
      wordGroups: [{ id: "silent_letters", label: "Silent Letters", purpose: "spell_from_memory", words: ["sign"], confidence: 0.95, evidence: ["source"] }],
      contentProfile: { practiceDomain: "spelling", contentDomain: "language_arts", topic: "Demo", primarySkill: "spelling", assignmentFormat: "word list", concepts: [], sourceEvidence: [] },
      sourceDocuments: [{ filename: "demo.pdf", mediaType: "application/pdf" }],
    },
    homeworkWords: [{ text: "sign", sourceGroupId: "silent_letters", purpose: "spell_from_memory" }],
    activeSessionPlan: {
      nodePlan: [{
        id: "word-radar-silent",
        type: "word-radar",
        activityId: "word-radar",
        targets: ["sign"],
        difficulty: 1,
        targetLane: "silent_letters",
        wordRadarConfig: WORD_RADAR_LETTER_FILL_CONFIG,
      }],
      adventureBoard,
    },
    plannedMeasurements: [{ id: "m", activityId: "word-radar", target: "sign", evidenceType: "practice", supportCriteria: "correct", reviseCriteria: "miss", falsifyCriteria: "missing" }],
    planTheory: { hypothesis: "h", evidenceSummary: ["e"], intervention: "i", supportCriteria: ["s"], reviseCriteria: ["r"], falsifyCriteria: ["f"] },
    reviewQuestions: ["Review?"],
  };
}

describe("assignment planner", () => {
  it("parses the first planner JSON object even when the model adds trailing text", () => {
    const parsed = parseAssignmentPlannerJson(`\n${JSON.stringify({
      capturedContent: {
        title: "Demo",
        type: "spelling_test",
        rawText: "Silent Letters\nsign",
        words: ["sign"],
        questions: [],
        wordGroups: [{ id: "silent_letters", label: "Silent Letters", purpose: "spell_from_memory", words: ["sign"], confidence: 0.95, evidence: ["source"] }],
        contentProfile: { practiceDomain: "spelling", contentDomain: "language_arts", topic: "Demo", primarySkill: "spelling", assignmentFormat: "word list", concepts: [], sourceEvidence: [] },
        sourceDocuments: [{ filename: "demo.pdf", mediaType: "application/pdf" }],
      },
      homeworkWords: [{ text: "sign", sourceGroupId: "silent_letters", purpose: "spell_from_memory" }],
      activeSessionPlan: { nodePlan: [{ id: "spell", type: "spell-check", activityId: "spell-check", targets: ["sign"], difficulty: 1, targetLane: "silent_letters" }] },
      plannedMeasurements: [{ id: "m", activityId: "spell-check", target: "sign", evidenceType: "spell_from_memory", supportCriteria: "correct", reviseCriteria: "miss", falsifyCriteria: "missing" }],
      planTheory: { hypothesis: "h", evidenceSummary: ["e"], intervention: "i", supportCriteria: ["s"], reviseCriteria: ["r"], falsifyCriteria: ["f"] },
      reviewQuestions: ["Review?"],
    })}\nExtra note that should not crash ingestion.`);

    expect(parsed.activeSessionPlan.nodePlan[0]?.activityId).toBe("spell-check");
  });

  it("preserves planner-authored Word Radar config through schema parsing", () => {
    const parsed = parseAssignmentPlannerJson(`\n${JSON.stringify({
      capturedContent: {
        title: "Demo",
        type: "spelling_test",
        rawText: "High-Frequency Words\namong",
        words: ["among"],
        questions: [],
        wordGroups: [{ id: "high_frequency_words", label: "High-Frequency Words", purpose: "read_fluently", words: ["among"], confidence: 0.95, evidence: ["source"] }],
        contentProfile: { practiceDomain: "spelling", contentDomain: "language_arts", topic: "Demo", primarySkill: "fluency", assignmentFormat: "word list", concepts: [], sourceEvidence: [] },
        sourceDocuments: [{ filename: "demo.pdf", mediaType: "application/pdf" }],
      },
      homeworkWords: [{ text: "among", sourceGroupId: "high_frequency_words", purpose: "read_fluently" }],
      activeSessionPlan: {
        nodePlan: [{
          id: "word-radar-high-frequency",
          type: "word-radar",
          activityId: "word-radar",
          targets: ["among"],
          difficulty: 2,
          targetLane: "high_frequency_words",
          wordRadarConfig: WORD_RADAR_LETTER_FILL_CONFIG,
        }],
      },
      plannedMeasurements: [{ id: "m", activityId: "word-radar", target: "among", evidenceType: "practice:partial_visual_recall", supportCriteria: "letters fill", reviseCriteria: "miss", falsifyCriteria: "missing" }],
      planTheory: { hypothesis: "h", evidenceSummary: ["e"], intervention: "i", supportCriteria: ["s"], reviseCriteria: ["r"], falsifyCriteria: ["f"] },
      reviewQuestions: ["Review?"],
    })}`);

    expect(parsed.activeSessionPlan.nodePlan[0]?.wordRadarConfig).toEqual(WORD_RADAR_LETTER_FILL_CONFIG);
  });

  it("preserves planner-authored child-facing adventureBoard through schema parsing", () => {
    const parsed = parseAssignmentPlannerJson(`\n${JSON.stringify({
      capturedContent: {
        title: "Demo",
        type: "spelling_test",
        rawText: "Silent Letters\nsign",
        words: ["sign"],
        questions: [],
        wordGroups: [{ id: "silent_letters", label: "Silent Letters", purpose: "spell_from_memory", words: ["sign"], confidence: 0.95, evidence: ["source"] }],
        contentProfile: { practiceDomain: "spelling", contentDomain: "language_arts", topic: "Demo", primarySkill: "spelling", assignmentFormat: "word list", concepts: [], sourceEvidence: [] },
        sourceDocuments: [{ filename: "demo.pdf", mediaType: "application/pdf" }],
      },
      homeworkWords: [{ text: "sign", sourceGroupId: "silent_letters", purpose: "spell_from_memory" }],
      activeSessionPlan: {
        nodePlan: [{
          id: "word-radar-silent",
          type: "word-radar",
          activityId: "word-radar",
          targets: ["sign"],
          difficulty: 1,
          targetLane: "silent_letters",
          wordRadarConfig: WORD_RADAR_LETTER_FILL_CONFIG,
        }],
        adventureBoard: {
          schemaVersion: 1,
          boardId: "planner-board",
          planId: "planner-demo",
          childId: "reina",
          domain: "spelling",
          theme: {
            background: { type: "solid", value: "#10233f" },
            palette: {
              path: "#ffffff",
              completed: "#2f9f6f",
              available: "#7058f4",
              locked: "#aeb7c2",
              current: "#ef9825",
              preview: "#d5dde5",
              text: "#ffffff",
              panel: "rgba(21, 31, 50, 0.80)",
            },
          },
          layout: { preset: "horizontal-adventure-spine", companionSlot: "right", routeChoiceBehavior: "exclusive" },
          plannerRationale: {
            agencyDesign: "Show one baseline node, then a child-facing choice.",
            evidenceDesign: "The board choices collect preference evidence.",
            layoutChoice: "Horizontal route leaves room for Matilda.",
          },
          nodes: [
            { id: "start", kind: "start", label: "Start", slot: "1", state: "completed" },
            { id: "word-radar-silent", kind: "activity", activityId: "word-radar", label: "Know / Write", slot: "2", state: "current" },
            { id: "mystery-choice", kind: "mystery", activityId: "mystery", label: "Mystery", slot: "6", state: "available", choiceSetId: "mystery-options" },
          ],
          edges: [
            { id: "e-start-radar", from: "start", to: "word-radar-silent", state: "completed" },
            { id: "e-radar-mystery", from: "word-radar-silent", to: "mystery-choice", state: "available" },
          ],
          choiceSets: [{
            id: "mystery-options",
            kind: "mystery",
            title: "Pick a challenge",
            options: [
              { id: "story", label: "Story", state: "available", choiceSignal: CHOICE_SIGNAL },
              { id: "speed", label: "Speed", state: "available", choiceSignal: CHOICE_SIGNAL },
            ],
          }],
        },
      },
      plannedMeasurements: [{ id: "m", activityId: "word-radar", target: "sign", evidenceType: "practice", supportCriteria: "correct", reviseCriteria: "miss", falsifyCriteria: "missing" }],
      planTheory: { hypothesis: "h", evidenceSummary: ["e"], intervention: "i", supportCriteria: ["s"], reviseCriteria: ["r"], falsifyCriteria: ["f"] },
      reviewQuestions: ["Review?"],
    })}`);

    expect(parsed.activeSessionPlan.adventureBoard?.nodes.map((node) => node.id)).toEqual([
      "start",
      "word-radar-silent",
      "mystery-choice",
    ]);
    expect(parsed.activeSessionPlan.adventureBoard?.choiceSets?.[0]?.options).toHaveLength(2);
  });

  it("rejects invalid adventureBoard enums instead of accepting a loose board blob", () => {
    expect(() => parseAssignmentPlannerJson(JSON.stringify(plannerDraftWithAdventureBoard({
      schemaVersion: 1,
      boardId: "planner-board",
      planId: "planner-demo",
      childId: "reina",
      domain: "spelling",
      theme: {
        background: { type: "image", value: "/generated/adventure-board-demo/silent-letter-world.jpeg" },
        palette: {
          path: "#ffffff",
          completed: "#2f9f6f",
          available: "#7058f4",
          locked: "#aeb7c2",
          current: "#ef9825",
          preview: "#d5dde5",
          text: "#ffffff",
          panel: "rgba(21, 31, 50, 0.80)",
        },
      },
      layout: { preset: "horizontal-adventure-spine", companionSlot: "right", routeChoiceBehavior: "exclusive" },
      nodes: [
        { id: "start", kind: "portal", label: "Start", state: "completed" },
      ],
      edges: [],
    })))).toThrow();
  });

  it("normalizes null optional board fields without inventing target lanes", () => {
    const parsed = parseAssignmentPlannerJson(JSON.stringify(plannerDraftWithAdventureBoard({
      schemaVersion: 1,
      boardId: "planner-board",
      planId: "planner-demo",
      childId: "reina",
      domain: "spelling",
      theme: {
        background: { type: "image", value: "/generated/adventure-board-demo/silent-letter-world.jpeg" },
        palette: {
          path: "#ffffff",
          completed: "#2f9f6f",
          available: "#7058f4",
          locked: "#aeb7c2",
          current: "#ef9825",
          preview: "#d5dde5",
          text: "#ffffff",
          panel: "rgba(21, 31, 50, 0.80)",
        },
      },
      layout: { preset: "horizontal-adventure-spine", companionSlot: "right", routeChoiceBehavior: "exclusive" },
      nodes: [
        {
          id: "start",
          kind: "start",
          activityId: null,
          label: "Start",
          state: "completed",
          slot: "1",
          target: { laneId: null, skill: "mixed", words: ["sign"] },
          choiceSetId: null,
          thumbnailUrl: "/thumbnails/activities/word-radar.svg",
          layout: { role: "start", order: 1 },
        },
      ],
      edges: [],
    })));

    expect(parsed.activeSessionPlan.adventureBoard?.nodes[0]?.activityId).toBeUndefined();
    expect(parsed.activeSessionPlan.adventureBoard?.nodes[0]?.choiceSetId).toBeUndefined();
    expect(parsed.activeSessionPlan.adventureBoard?.nodes[0]?.target).toBeUndefined();
  });

  it("normalizes harmless planner JSON shape mistakes but still requires Word Radar config", () => {
    const parsed = parseAssignmentPlannerJson(`\n${JSON.stringify({
      capturedContent: {
        title: "Demo",
        type: "spelling_test",
        rawText: "Silent Letters\nsign\nknow",
        words: ["sign", "know"],
        questions: [],
        wordGroups: [{ id: "silent_letters", label: "Silent Letters", purpose: "spell_from_memory", words: ["sign", "know"], confidence: 0.95, evidence: ["source"] }],
        contentProfile: { practiceDomain: "spelling", contentDomain: "language_arts", topic: "Demo", primarySkill: "spelling", assignmentFormat: "word list", concepts: [], sourceEvidence: [] },
        sourceDocuments: [{ filename: "demo.pdf", mediaType: "application/pdf" }],
      },
      homeworkWords: [
        { text: "sign", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
        { text: "know", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
      ],
      activeSessionPlan: {
        nodePlan: [
          {
            id: "spell-check",
            type: "spell-check",
            activityId: "spell-check",
            targets: "sign, know",
            difficulty: 1,
            targetLane: "silent_letters",
            wordRadarConfig: null,
          },
          {
            id: "word-radar",
            type: "word-radar",
            activityId: "word-radar",
            targets: ["sign"],
            difficulty: 2,
            targetLane: "silent_letters",
            wordRadarConfig: null,
          },
        ],
      },
      plannedMeasurements: [{ id: "m", activityId: "spell-check", target: "sign", evidenceType: "spell_from_memory", supportCriteria: "correct", reviseCriteria: "miss", falsifyCriteria: "missing" }],
      planTheory: { hypothesis: "h", evidenceSummary: ["e"], intervention: "i", supportCriteria: ["s"], reviseCriteria: ["r"], falsifyCriteria: ["f"] },
      reviewQuestions: ["Review?"],
    })}`);

    expect(parsed.activeSessionPlan.nodePlan[0]?.targets).toEqual(["sign", "know"]);
    expect(parsed.activeSessionPlan.nodePlan[0]?.wordRadarConfig).toBeUndefined();
    expect(validateAssignmentPlannerOutput({
      ...goodOutput(),
      activeSessionPlan: planWithNodes(parsed.activeSessionPlan.nodePlan.map((node) => ({
        ...node,
        type: normalizeAssignmentNodeType(node.type, node.activityId),
        difficulty: node.difficulty ?? 1,
        source: "chart_planner" as const,
      }))),
    }, {
      extraction: extraction(),
      activityCatalog: buildAssignmentPlanningPacket({
        childId: "reina",
        extraction: extraction(),
        childChart: chart(),
      }).activityCatalog,
    })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing_word_radar_config" })]));
  });

  it("normalizes planner node labels to app node slugs at the boundary", () => {
    expect(normalizeAssignmentNodeType("Pronunciation Practice", "pronunciation")).toBe("pronunciation");
    expect(normalizeAssignmentNodeType("Word Radar", "word-radar")).toBe("word-radar");
    expect(normalizeAssignmentNodeType("Spell Check", "spell-check")).toBe("spell-check");
    expect(normalizeAssignmentNodeType("evaluator", "spelling-recall")).toBe("letter-rush");
  });

  it("builds one canonical planner input with every cataloged activity and the slot board template", () => {
    const packet = buildAssignmentPlanningPacket({
      childId: "reina",
      extraction: extraction(),
      childChart: chart(),
      currentEvidenceSummary: ["No recent Reina session evidence."],
    });

    expect(packet.sourceDocument.fullText).toContain("High-Frequency Words");
    expect(packet.childChart.childId).toBe("reina");
    expect(packet.childChart.adventureMapProfile?.defaultLayoutPreset).toBe("horizontal-adventure-spine");
    expect(packet.activityCatalog.some((card) => card.activityId === "pronunciation")).toBe(true);
    expect(packet.activityCatalog.some((card) => card.activityId === "mystery")).toBe(true);
    expect(packet.activityCatalog.some((card) => card.activityId === "quest")).toBe(true);
    expect(packet.activityCatalog.some((card) => card.activityId === "boss")).toBe(true);
    expect(packet.activityCatalog.some((card) => card.activityId === "word-builder")).toBe(true);
    expect(packet.activityCatalog.some((card) => card.activityId === "wordle")).toBe(true);
    expect(packet.activityCatalog.every((card) => card.sentToPlanner)).toBe(true);
    expect(packet.activityCatalog.find((card) => card.activityId === "word-builder")?.launchable).toBe(true);
    expect(packet.activityCatalog.find((card) => card.activityId === "wordle")?.launchable).toBe(false);
    expect(packet.activityCatalog.find((card) => card.activityId === "word-radar")?.launchable).toBe(true);
    expect("activityCatalog" in packet.boardPlanning).toBe(false);
    expect(packet.activityCatalog
      .find((card) => card.activityId === "word-radar")
      ?.capabilityModes.find((mode) => mode.id === "partial_visual_recall")
      ?.config).toMatchObject(WORD_RADAR_LETTER_FILL_CONFIG);
    expect(packet.boardPlanning.algorithmContracts.choicePolicy.outputs).toContain("shown_chosen_skipped_outcome");
    expect(packet.boardPlanning.algorithmContracts.spacedRepetition.guardrails).toContain("preference_is_not_mastery");
    expect(packet.boardPlanning.boardTemplate.preset).toBe("horizontal-adventure-spine");
    expect(packet.boardPlanning.boardTemplate.slots["5a.1"]).toBe("upper-route");
    expect(packet.boardPlanning.boardTemplate.slots["5c.1"]).toBe("middle-route");
    expect(packet.boardPlanning.boardTemplate.palette.text).toBe("#ffffff");
    expect(packet.boardPlanning.boardTemplate.palette.path).toBe("#ffffff");
    expect(JSON.stringify(packet.boardPlanning.boardTemplate)).not.toContain("routeChoiceCount");
    expect(JSON.stringify(packet.boardPlanning.boardTemplate)).not.toContain("mysteryChoiceCount");
    expect(JSON.stringify(packet.boardPlanning.boardTemplate)).not.toContain("questWrapperChoiceCount");
    expect(JSON.stringify(packet.boardPlanning.boardTemplate)).not.toContain("bossWrapperChoiceCount");
    expect(packet.boardPlanning.runtimeConstraints.noRuntimePlanning).toBe(true);
    expect(packet.boardPlanning.criticPolicy.semanticAudit).toBe("always");
    expect(packet.plannerInstruction).toContain("mastered targets get smaller spaced checks");
    expect(packet.plannerInstruction).toContain("strictly more academic support than mastered targets");
    expect(packet.plannerInstruction).toContain("first academic node should probe those exact contradictory targets");
    expect(packet.plannerInstruction).toContain("Count target placements before returning");
    expect(packet.plannerInstruction).toContain("count consecutive activity runs");
    expect(packet.plannerInstruction).toContain("visible_read or pronunciation");
    expect(packet.plannerInstruction).toContain("long run of Word Radar");
    expect(packet.plannerInstruction).toContain("Decide agency and route density from chart evidence");
    expect(packet.plannerInstruction).not.toContain("High-Frequency Words must");
    expect(JSON.stringify(packet)).not.toContain("ANTHROPIC_API_KEY");
  });

  it("exposes a strict slot-based board contract to the planner tool", () => {
    const schema = assignmentPlannerToolJsonSchema();
    const activeSessionPlan = (schema.properties as Record<string, any>).activeSessionPlan;
    const adventureBoard = activeSessionPlan.properties.adventureBoard;
    const nodeSchema = adventureBoard.properties.nodes.items;
    const nodeLayoutSchema = nodeSchema.properties.layout;
    const choiceSetSchema = adventureBoard.properties.choiceSets.items;
    const choiceOptionSchema = choiceSetSchema.properties.options.items;
    const progressSchema = adventureBoard.properties.progress;

    expect(activeSessionPlan.required).toEqual(expect.arrayContaining(["nodePlan", "adventureBoard"]));
    expect(nodeSchema.properties.position).toBeUndefined();
    expect(nodeSchema.required).toEqual(expect.arrayContaining([
      "id",
      "kind",
      "label",
      "thumbnailUrl",
      "slot",
      "layout",
      "state",
    ]));
    expect(nodeSchema.required).not.toContain("position");
    expect(nodeSchema.properties.slot.enum).toEqual(expect.arrayContaining(["1", "4", "5a.1", "5b.1", "5c.1", "8"]));
    expect(nodeLayoutSchema.required).toEqual(expect.arrayContaining(["role", "lane", "order"]));
    expect(choiceSetSchema.additionalProperties).toBe(false);
    expect(choiceSetSchema.properties.choiceSetId).toBeUndefined();
    expect(choiceSetSchema.properties.choices).toBeUndefined();
    expect(choiceSetSchema.required).toEqual(["id", "kind", "title", "options"]);
    expect(choiceOptionSchema.properties.choiceId).toBeUndefined();
    expect(choiceOptionSchema.required).toEqual(expect.arrayContaining([
      "id",
      "label",
      "description",
      "thumbnailUrl",
      "state",
      "choiceSignal",
    ]));
    expect(choiceOptionSchema.required).not.toContain("lock");
    expect(choiceOptionSchema.required).not.toContain("nodeId");
    expect(progressSchema.required).toEqual(["completedNodeIds"]);
  });

  it("prints a planner readiness audit table for the full activity catalog", () => {
    const packet = buildAssignmentPlanningPacket({
      childId: "reina",
      extraction: extraction(),
      childChart: chart(),
    });
    const audit = buildPlannerReadinessAudit(packet.activityCatalog);

    expect(audit.markdown).toContain("| activity | sent_to_planner | launchable | domains | purposes | config_source | modes | required_config | evidence_policy | status |");
    expect(audit.rows.map((row) => row.activity)).toEqual(
      expect.arrayContaining(["word-radar", "pronunciation", "spell-check", "letter-rush", "monster-stampede", "wheel-of-fortune", "mystery", "quest", "boss"]),
    );
    expect(audit.rows.find((row) => row.activity === "word-radar")).toMatchObject({
      sentToPlanner: true,
      launchable: true,
      status: "ok",
    });
  });

  it("rejects model responses that do not call the adventure session plan tool", () => {
    expect(() => parseAssignmentPlannerToolUseResponse({
      content: [{ type: "text", text: JSON.stringify(plannerDraftWithAdventureBoard(undefined)) }],
    } as never)).toThrow(`assignment_planner_tool_missing:${ASSIGNMENT_PLANNER_TOOL_NAME}`);
  });

  it("accepts the forced adventure session plan tool input as the planner output object", () => {
    const draft = plannerDraftWithAdventureBoard(undefined);
    const parsed = parseAssignmentPlannerToolUseResponse({
      content: [{
        type: "tool_use",
        id: "toolu_1",
        name: ASSIGNMENT_PLANNER_TOOL_NAME,
        input: draft,
      }],
    } as never);

    expect(parsed.activeSessionPlan.nodePlan[0]?.activityId).toBe("word-radar");
  });

  it("uses the adaptive game-director persona without hardcoding choice-count rules", () => {
    const packet = buildAssignmentPlanningPacket({
      childId: "reina",
      extraction: extraction(),
      childChart: chart(),
    });
    const prompt = buildAssignmentPlannerPrompt(packet);

    expect(ASSIGNMENT_PLANNER_PERSONA).toContain("pediatric learning psychologist and adaptive game director");
    expect(prompt).toContain("Decide how much agency/route choice to show from chart evidence");
    expect(prompt).toContain("Explain why each visible route or modal choice is worth the child's attention today");
    expect(prompt).toContain("Edges must flow from the prior required baseline node into the gate");
    expect(prompt).toContain("Do not put Choose Path immediately after Start");
    expect(prompt).toContain("Start must connect to the first baseline activity, never directly to a route gate");
    expect(prompt).toContain("choice gate's incoming edge must come from the last required baseline activity");
    expect(prompt).toContain("Use packet.boardPlanning.boardTemplate.palette exactly");
    expect(prompt).toContain("Good horizontal spine skeleton");
    expect(prompt).toContain("Bad horizontal spine skeleton");
    expect(prompt).toContain("boardPlanning");
    expect(prompt).toContain("choicePolicy");
    expect(prompt).toContain("route choice after required baseline evidence");
    expect(prompt).toContain("preference evidence, not mastery");
    expect(prompt).toContain("planner decides how many route, Mystery, Quest, or Boss choices");
    expect(prompt).not.toContain("Mystery modal choice: 3");
    expect(prompt).not.toContain("Quest wrapper choices: 2");
    expect(prompt).not.toContain("Boss wrapper choices: 2");
    expect(prompt).toContain("activeSessionPlan.adventureBoard");
    expect(prompt).toContain("adventureMapProfile");
    expect(prompt).not.toContain("maxVisibleChoices");
    expect(prompt).not.toContain("paradox of choice");
  });

  it("keeps lesson-to-lesson adaptation guidance in the planner prompt without adding deterministic category blockers", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/assignmentPlanner.ts"), "utf8");

    expect(source).toContain("Use recent canonical activity evidence as lesson-to-lesson labs");
    expect(source).toContain("Mastery evidence should shrink redundant baseline work");
    expect(source).toContain("Light spaced reinforcement means fewer mastered targets");
    expect(source).toContain("prefer pronunciation or visible_read-style recognition evidence");
    expect(source).toContain("Do not split one lane into a long run of consecutive Word Radar nodes");
    expect(source).not.toContain("if (purpose === \"read_fluently\")");
    expect(source).not.toContain("if (group.label === \"High-Frequency Words\")");
  });

  it("keeps source page images available for image-first planning", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-assignment-planner-"));
    const imagePath = path.join(dir, "page.png");
    fs.writeFileSync(imagePath, Buffer.from("fake image bytes"));
    const packet = buildAssignmentPlanningPacket({
      childId: "reina",
      extraction: {
        ...extraction(),
        pages: [{ pageNumber: 1, text: extraction().fullText, imagePath }],
      },
      childChart: chart(),
    });

    expect(assignmentPlannerSourceImages(packet)).toEqual([{
      mediaType: "image/png",
      data: Buffer.from("fake image bytes").toString("base64"),
    }]);
  });

  it("accepts a plan that routes each source group to activities matching declared purpose", () => {
    expect(validateAssignmentPlannerOutput(goodOutput(), {
      extraction: extraction(),
      activityCatalog: buildAssignmentPlanningPacket({
        childId: "reina",
        extraction: extraction(),
        childChart: chart(),
      }).activityCatalog,
    })).toEqual([]);
  });

  it("requires planner-owned Mystery, Quest, and Boss destinations", () => {
    const output = goodOutput();
    output.activeSessionPlan = planWithNodes(output.activeSessionPlan.nodePlan.filter((node) =>
      node.type !== "mystery" && node.type !== "quest" && node.type !== "boss",
    ));
    const issues = validateAssignmentPlannerOutput(output, {
      extraction: extraction(),
      activityCatalog: buildAssignmentPlanningPacket({
        childId: "reina",
        extraction: extraction(),
        childChart: chart(),
      }).activityCatalog,
    });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "missing_mystery_choice",
      "missing_quest_destination",
      "missing_boss_destination",
    ]));
  });

  it("does not block a planner choice with deterministic educational compatibility rules", () => {
    const output = goodOutput();
    output.activeSessionPlan = planWithNodes([
      {
        id: "spell-check-silent-letters",
        type: "spell-check",
        activityId: "spell-check",
        targets: ["sign", "know", "write"],
        difficulty: 1,
        source: "chart_planner",
        targetLane: "silent_letters",
      },
      ...adventureSpineNodes(),
    ]);

    expect(validateAssignmentPlannerOutput(output, {
      extraction: extraction(),
      activityCatalog: buildAssignmentPlanningPacket({
        childId: "reina",
        extraction: extraction(),
        childChart: chart(),
      }).activityCatalog,
    })).toEqual([]);
  });

  it("leaves target-purpose/activity fit to planner reasoning instead of hardcoding a special word category", () => {
    const output = goodOutput();
    output.activeSessionPlan.nodePlan.push({
      id: "spell-check-leak",
      type: "spell-check",
      activityId: "spell-check",
      targets: ["among"],
      difficulty: 1,
      source: "chart_planner",
      targetLane: "high_frequency_words",
    });

    expect(validateAssignmentPlannerOutput(output, {
      extraction: extraction(),
      activityCatalog: buildAssignmentPlanningPacket({
        childId: "reina",
        extraction: extraction(),
        childChart: chart(),
      }).activityCatalog,
    })).toEqual([]);
  });

  it("rejects invented targetLane names when targets match a source word group", () => {
    const output = goodOutput();
    output.activeSessionPlan.nodePlan[0] = {
      ...output.activeSessionPlan.nodePlan[0]!,
      targetLane: "high-frequency-recognition",
    };

    expect(validateAssignmentPlannerOutput(output, {
      extraction: extraction(),
      activityCatalog: buildAssignmentPlanningPacket({
        childId: "reina",
        extraction: extraction(),
        childChart: chart(),
      }).activityCatalog,
    })).toEqual([expect.objectContaining({ code: "target_lane_mismatch" })]);
  });

  it("validates planner-owned board JSON without repairing fake agency", () => {
    const output = goodOutput();
    output.activeSessionPlan.adventureBoard = {
      schemaVersion: 1,
      boardId: "bad-board",
      planId: output.activeSessionPlan.planId,
      childId: "reina",
      domain: "spelling",
      theme: {
        background: { type: "solid", value: "#123" },
        palette: {
          path: "#fff",
          completed: "#2f9f6f",
          available: "#7058f4",
          locked: "#aeb7c2",
          current: "#ef9825",
          preview: "#d5dde5",
          text: "#ffffff",
          panel: "rgba(21, 31, 50, 0.80)",
        },
      },
      nodes: [
        { id: "baseline_spelling_diagnostic", kind: "activity", activityId: "spell-check", label: "Verify", state: "completed" },
        { id: "choice_after_verify", kind: "choice-gate", label: "Choose Path", state: "available", choiceSetId: "route-options" },
        { id: "fake", kind: "activity", activityId: "fake-game", label: "Fake", state: "available" },
      ],
      edges: [
        { id: "e-fake", from: "baseline_spelling_diagnostic", to: "missing", state: "available" },
      ],
      choiceSets: [{
        id: "route-options",
        kind: "baseline-route",
        title: "Choose your path",
        options: [{ id: "fake", label: "Fake", state: "available", nodeId: "missing" }],
      }],
    };

    const issues = validateAssignmentPlannerOutput(output, {
      extraction: extraction(),
      activityCatalog: buildAssignmentPlanningPacket({
        childId: "reina",
        extraction: extraction(),
        childChart: chart(),
      }).activityCatalog,
    });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "board_missing_edge_endpoint",
      "board_choice_option_missing_node",
      "board_unknown_activity_id",
      "board_fake_agency",
      "board_learning_node_missing_node_plan_reference",
    ]));
  });

  it("rejects target lanes that contain words outside their source group", () => {
    const output = goodOutput();
    output.activeSessionPlan.nodePlan[0] = {
      ...output.activeSessionPlan.nodePlan[0]!,
      targetLane: "silent_letters",
      targets: ["sign", "among"],
    };

    expect(validateAssignmentPlannerOutput(output, {
      extraction: extraction(),
      activityCatalog: buildAssignmentPlanningPacket({
        childId: "reina",
        extraction: extraction(),
        childChart: chart(),
      }).activityCatalog,
    })).toEqual([expect.objectContaining({ code: "target_lane_mismatch" })]);
  });

  it("prints source groups, chosen nodes, target lanes, and plain-language reasoning for parent review", () => {
    const review = summarizeAssignmentPlanForReview(goodOutput());

    expect(review).toContain("Silent Letters");
    expect(review).toContain("High-Frequency Words");
    expect(review).toContain("pronunciation-high-frequency");
    expect(review).toContain("target lane: high_frequency_words");
    expect(review).toContain("High-frequency words are being used to check fluent reading/pronunciation");
  });
});
