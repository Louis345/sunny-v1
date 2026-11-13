import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import type { ChildChart } from "../profiles/childChart";
import type { CapturedHomeworkContent } from "../scripts/contentAwareHomeworkPlanner";
import {
  ASSIGNMENT_PLANNER_PERSONA,
  buildAssignmentPlanningPacket,
  buildAssignmentPlannerPrompt,
  assignmentPlannerSourceImages,
  normalizeAssignmentNodeType,
  parseAssignmentPlannerJson,
  resolveAssignmentPlannerModel,
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

describe("assignment planner", () => {
  it("defaults to the current available Sonnet planner model", () => {
    expect(resolveAssignmentPlannerModel({}, {})).toBe("claude-sonnet-4-6");
  });

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

  it("builds a packet with source text, child chart, and a full activity catalog including Pronunciation", () => {
    const packet = buildAssignmentPlanningPacket({
      childId: "reina",
      extraction: extraction(),
      childChart: chart(),
      currentEvidenceSummary: ["No recent Reina session evidence."],
    });

    expect(packet.sourceDocument.fullText).toContain("High-Frequency Words");
    expect(packet.childChart.childId).toBe("reina");
    expect(packet.activityCatalog.some((card) => card.activityId === "pronunciation")).toBe(true);
    const sparkOrb = packet.activityCatalog.find((card) => card.activityId === "spark-orb-charge");
    expect(sparkOrb).toMatchObject({
      plannerVisibility: "wrapper",
      evidenceType: "practice",
    });
    expect(sparkOrb?.capabilityModes.map((mode) => mode.id)).toEqual([
      "charge_bridge",
      "domain_payload_wrapper",
    ]);
    expect(packet.activityCatalog.some((card) => card.activityId === "mystery")).toBe(true);
    expect(packet.activityCatalog.some((card) => card.activityId === "quest")).toBe(true);
    expect(packet.activityCatalog.some((card) => card.activityId === "boss")).toBe(true);
    expect(packet.activityCatalog.some((card) => card.activityId === "word-builder")).toBe(false);
    expect(packet.activityCatalog.some((card) => card.activityId === "wordle")).toBe(false);
    expect(packet.activityCatalog
      .find((card) => card.activityId === "word-radar")
      ?.capabilityModes.find((mode) => mode.id === "partial_visual_recall")
      ?.config).toMatchObject(WORD_RADAR_LETTER_FILL_CONFIG);
    const protocolDoc = (packet as any).plannerReferences?.find(
      (doc: { id?: string }) => doc.id === "activity-tool-protocol",
    );
    expect(protocolDoc).toMatchObject({
      path: "docs/activity-tool-protocol.md",
      configOwner: "src/engine/activityToolCatalog.ts",
    });
    expect(protocolDoc.plannerUse).toMatch(/assess whether a proposed class activity should enter Sunny/i);
    const sparkOrbDoc = (packet as any).plannerReferences?.find(
      (doc: { id?: string }) => doc.id === "spark-orb-learning-contract",
    );
    expect(sparkOrbDoc).toMatchObject({
      path: "docs/spark-orb-learning-contract.md",
      configOwner: "src/engine/activityToolCatalog.ts",
    });
    expect(packet.plannerInstruction).toContain("mastered targets get smaller spaced checks");
    expect(packet.plannerInstruction).toContain("plannerReferences");
    expect(packet.plannerInstruction).toContain("strictly more academic support than mastered targets");
    expect(packet.plannerInstruction).toContain("first academic node should probe those exact contradictory targets");
    expect(packet.plannerInstruction).toContain("visible_read or pronunciation");
    expect(packet.plannerInstruction).toContain("child-facing journey");
    expect(packet.plannerInstruction).not.toContain("High-Frequency Words must");
    expect(JSON.stringify(packet)).not.toContain("ANTHROPIC_API_KEY");
  });

  it("parses Spark Orb reward wrapper decisions without turning the orb into a node type", () => {
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
          id: "spell",
          type: "spell-check",
          activityId: "spell-check",
          targets: ["sign"],
          difficulty: 1,
          targetLane: "silent_letters",
          rewardWrapper: {
            activityId: "spark-orb-charge",
            mode: "domain_payload_wrapper",
            reason: "Use the orb as an earned shell around the spelling payload.",
          },
        }],
      },
      plannedMeasurements: [{ id: "m", activityId: "spell-check", target: "sign", evidenceType: "spell_from_memory", supportCriteria: "correct", reviseCriteria: "miss", falsifyCriteria: "missing" }],
      planTheory: { hypothesis: "h", evidenceSummary: ["e"], intervention: "i", supportCriteria: ["s"], reviseCriteria: ["r"], falsifyCriteria: ["f"] },
      reviewQuestions: ["Review?"],
    })}`);

    expect(parsed.activeSessionPlan.nodePlan[0]?.activityId).toBe("spell-check");
    expect(parsed.activeSessionPlan.nodePlan[0]?.type).toBe("spell-check");
    expect((parsed.activeSessionPlan.nodePlan[0] as any)?.rewardWrapper).toEqual({
      activityId: "spark-orb-charge",
      mode: "domain_payload_wrapper",
      reason: "Use the orb as an earned shell around the spelling payload.",
    });
  });

  it("keeps lesson-to-lesson adaptation guidance in the planner prompt without adding deterministic category blockers", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/assignmentPlanner.ts"), "utf8");

    expect(source).toContain("Use recent canonical activity evidence as lesson-to-lesson labs");
    expect(source).toContain("Mastery evidence should shrink redundant baseline work");
    expect(source).toContain("Light spaced reinforcement means fewer mastered targets");
    expect(source).toContain("prefer pronunciation or visible_read-style recognition evidence");
    expect(source).toContain("child-facing journey");
    expect(source).not.toContain("same-activity run exceeds");
    expect(source).not.toContain("Do not split one lane into a long run");
    expect(source).not.toContain("if (purpose === \"read_fluently\")");
    expect(source).not.toContain("if (group.label === \"High-Frequency Words\")");
  });

  it("uses a learning-journey persona instead of hardcoded engagement rules", () => {
    const packet = buildAssignmentPlanningPacket({
      childId: "reina",
      extraction: extraction(),
      childChart: chart(),
    });
    const prompt = buildAssignmentPlannerPrompt(packet);

    expect(ASSIGNMENT_PLANNER_PERSONA).toContain("learning journey designer");
    expect(ASSIGNMENT_PLANNER_PERSONA).toContain("homework as the reality anchor");
    expect(ASSIGNMENT_PLANNER_PERSONA).toContain("strong sense of taste");
    expect(ASSIGNMENT_PLANNER_PERSONA).toContain("The board is not a worksheet");
    expect(ASSIGNMENT_PLANNER_PERSONA).not.toContain("Before you return a plan");
    expect(ASSIGNMENT_PLANNER_PERSONA).not.toContain("read it as the child would");
    expect(prompt).toContain("Design today's learning journey");
    expect(prompt).toContain("explain why the journey you chose fits this child today");
    expect(prompt).not.toContain("Before you return a plan");
    expect(prompt).not.toContain("read it as the child would");
    expect(prompt).not.toContain("same activity shell appears more than once before Mystery");
    expect(prompt).not.toContain("why this will not feel like grind");
    expect(prompt).not.toContain("same-activity run exceeds");
    expect(prompt).not.toContain("Do not split one lane into a long run");
  });

  it("frames planning like a real tutor choosing materials, not code steering node choices", () => {
    const packet = buildAssignmentPlanningPacket({
      childId: "reina",
      extraction: extraction(),
      childChart: chart(),
    });
    const prompt = buildAssignmentPlannerPrompt(packet);

    expect(prompt).toContain("real tutoring session, not filling a board");
    expect(prompt).toContain("table full of materials");
    expect(prompt).toContain("master it by the due date");
    expect(prompt).toContain("without making the child feel like this is a grind");
    expect(prompt).toContain("check first");
    expect(prompt).toContain("teach or reveal the next thing");
    expect(prompt).toContain("switch the emotional texture");
    expect(prompt).toContain("The child experiences the activity, not your internal capability mode");
    expect(prompt).toContain("same game shell");
    expect(prompt).toContain("choose a different material or explain why the repetition is the right tutor move");
    expect(prompt).toContain("nodes exist to change the lived lesson");
    expect(prompt).not.toContain("Before you return a plan");
    expect(prompt).not.toContain("same activity shell appears more than once before Mystery");
    expect(prompt).not.toContain("why this will not feel like grind");
    expect(prompt).not.toContain("After the first clean measurement");
    expect(prompt).not.toContain("consider Letter Rush or Monster Stampede");
    expect(prompt).not.toContain("consider Spell Check");
  });

  it("does not ask the planner to put capability-mode ids into Word Radar recallMode", () => {
    const prompt = buildAssignmentPlannerPrompt(buildAssignmentPlanningPacket({
      childId: "reina",
      extraction: extraction(),
      childChart: chart(),
    }));

    expect(prompt).toContain("If you choose the catalog's audio_cued_letter_recall capability mode");
    expect(prompt).toContain("emit recallMode partial_visual_recall");
    expect(prompt).toContain("Never emit audio_cued_letter_recall as recallMode");
    expect(prompt).toContain("Capability mode ids may appear in rationale, not in wordRadarConfig.recallMode");
    expect(prompt).not.toContain("Use audio_cued_letter_recall when the child should fill slots");
  });

  it("keeps masteryUnlockState restricted to locked destination nodes", () => {
    const prompt = buildAssignmentPlannerPrompt(buildAssignmentPlanningPacket({
      childId: "reina",
      extraction: extraction(),
      childChart: chart(),
    }));

    expect(prompt).toContain("masteryUnlockState only on locked quest and boss nodes");
    expect(prompt).toContain("\"masteryUnlockState\": \"preparing\"");
    expect(prompt).not.toContain("\"masteryUnlockState\": \"preparing for locked quest/boss\"");
  });

  it("keeps adaptive evidence and activity materials visible together for iterative planning", () => {
    const packet = buildAssignmentPlanningPacket({
      childId: "reina",
      extraction: extraction(),
      childChart: chart(),
      currentEvidenceSummary: [
        "Last session: Letter Rush was high-engagement and clean for known words.",
        "Last session: Word Radar fatigue appeared after repeated similar nodes.",
      ],
    });
    const prompt = buildAssignmentPlannerPrompt(packet);

    expect(prompt).toContain("Letter Rush was high-engagement");
    expect(prompt).toContain("Word Radar fatigue");
    expect(packet.activityCatalog.some((card) => card.activityId === "letter-rush")).toBe(true);
    expect(packet.activityCatalog.some((card) => card.activityId === "monster-stampede")).toBe(true);
    expect(prompt).toContain("\"activityId\": \"letter-rush\"");
    expect(prompt).toContain("\"activityId\": \"monster-stampede\"");
    expect(prompt).toContain("What changed since the last session?");
    expect(prompt).toContain("What should this plan try differently because of that evidence?");
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

  it("accepts organic non-selection when Spark Orb is available but not chosen", () => {
    const packet = buildAssignmentPlanningPacket({
      childId: "reina",
      extraction: extraction(),
      childChart: chart(),
    });

    expect(packet.activityCatalog.some((card) => card.activityId === "spark-orb-charge")).toBe(true);
    expect(validateAssignmentPlannerOutput(goodOutput(), {
      extraction: extraction(),
      activityCatalog: packet.activityCatalog,
    })).toEqual([]);
  });

  it("accepts a valid Spark Orb wrapper on a domain-valid spelling node", () => {
    const output = goodOutput();
    output.activeSessionPlan.nodePlan[1] = {
      ...output.activeSessionPlan.nodePlan[1]!,
      rewardWrapper: {
        activityId: "spark-orb-charge",
        mode: "domain_payload_wrapper",
        reason: "Earned launch wraps the spelling payload after target evidence is captured.",
      },
    } as any;

    expect(validateAssignmentPlannerOutput(output, {
      extraction: extraction(),
      activityCatalog: buildAssignmentPlanningPacket({
        childId: "reina",
        extraction: extraction(),
        childChart: chart(),
      }).activityCatalog,
    })).toEqual([]);
  });

  it("rejects Spark Orb as a standalone mastery node instead of a wrapper", () => {
    const output = goodOutput();
    output.activeSessionPlan.nodePlan.unshift({
      id: "spark-orb-standalone",
      type: "spell-check",
      activityId: "spark-orb-charge",
      targets: ["sign"],
      difficulty: 1,
      source: "chart_planner",
      targetLane: "silent_letters",
    });

    expect(validateAssignmentPlannerOutput(output, {
      extraction: extraction(),
      activityCatalog: buildAssignmentPlanningPacket({
        childId: "reina",
        extraction: extraction(),
        childChart: chart(),
      }).activityCatalog,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "wrapper_activity_used_as_node" }),
    ]));
  });

  it("rejects domain payload wrappers on locked destinations", () => {
    const output = goodOutput();
    const questIndex = output.activeSessionPlan.nodePlan.findIndex((node) => node.type === "quest");
    output.activeSessionPlan.nodePlan[questIndex] = {
      ...output.activeSessionPlan.nodePlan[questIndex]!,
      rewardWrapper: {
        activityId: "spark-orb-charge",
        mode: "domain_payload_wrapper",
        reason: "Do not let a locked destination pretend it owns live target evidence.",
      },
    } as any;

    expect(validateAssignmentPlannerOutput(output, {
      extraction: extraction(),
      activityCatalog: buildAssignmentPlanningPacket({
        childId: "reina",
        extraction: extraction(),
        childChart: chart(),
      }).activityCatalog,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "reward_wrapper_requires_domain_payload_node" }),
    ]));
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

  it("prints source groups, chosen nodes, target lanes, and plain-language reasoning for parent review", () => {
    const review = summarizeAssignmentPlanForReview(goodOutput());

    expect(review).toContain("Silent Letters");
    expect(review).toContain("High-Frequency Words");
    expect(review).toContain("pronunciation-high-frequency");
    expect(review).toContain("target lane: high_frequency_words");
    expect(review).toContain("High-frequency words are being used to check fluent reading/pronunciation");
  });
});
