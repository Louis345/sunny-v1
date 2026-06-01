import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { AssignmentPlannerOutput, AssignmentPlanningPacket } from "../engine/assignmentPlanner";
import {
  applyApprovedSunnyIngestDraft,
  applyHumanIngestEdits,
  buildSunnyDraftFromAssignmentPlan,
  buildSunnyPlannerDraft,
  formatSunnyIngestInterpretation,
  resolveSunnyIngestInputs,
  reviseSunnyPlannerDraft,
} from "./sunnyIngest";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-ingest-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeChild(root: string, childId: string): void {
  writeJson(root, "children.config.json", {
    childProfiles: {
      [childId]: { childId, name: childId, displayName: childId },
    },
  });
  writeJson(root, `src/context/${childId}/learning_profile.json`, {
    schemaVersion: 1,
    childId,
    demographics: { childId, age: 8, grade: 2, diagnoses: [], learningStyle: "mixed" },
    progression: { level: 1, xp: 0, streakDays: 0 },
    attention: { preferredSessionLengthMinutes: 10, bestTimeOfDay: "after_school" },
    subjects: {},
    iepTargets: [],
    activityAffinities: {},
    lastUpdated: "2026-06-01T00:00:00.000Z",
  });
  writeJson(root, `src/context/${childId}/word_bank.json`, {
    childId,
    version: 1,
    lastUpdated: "2026-06-01T00:00:00.000Z",
    words: [],
  });
  fs.mkdirSync(path.join(root, `src/context/${childId}`), { recursive: true });
  fs.writeFileSync(path.join(root, `src/context/${childId}/${childId}_context.md`), "# Context\n", "utf8");
}

function chart() {
  return {
    childId: "ila",
    identity: { displayName: "Ila" },
    demographics: { grade: 2 },
    companion: { presetId: "elli", displayName: "Elli" },
    homework: { pending: null },
    carePlan: { current: null },
    recentEvidence: [],
  } as never;
}

function extraction(root: string) {
  const imagePath = path.join(root, "page.png");
  fs.writeFileSync(imagePath, "fake image");
  return {
    sourceKind: "scanned_assignment_image" as const,
    sourcePath: path.join(root, "5_18_spelling.pdf"),
    filename: "5_18_spelling.pdf",
    mediaType: "application/pdf",
    fileHash: "a".repeat(64),
    extractionMethod: "tesseract" as const,
    pages: [{ pageNumber: 1, text: "", imagePath }],
    fullText: "",
    warnings: ["ocr_empty_page_image_available"],
  };
}

function plannerOutput(overrides: Partial<AssignmentPlannerOutput> = {}): AssignmentPlannerOutput {
  const wordGroups = [
    {
      id: "silent_letters",
      label: "Silent Letters",
      purpose: "spell_from_memory" as const,
      words: ["sign", "know", "write"],
      confidence: 0.95,
      evidence: ["Worksheet image labels this column Silent Letters."],
    },
    {
      id: "high_frequency",
      label: "High-Frequency Words",
      purpose: "recognize" as const,
      words: ["among", "building", "circle"],
      confidence: 0.94,
      evidence: ["Worksheet image labels this column High-Frequency Words."],
    },
  ];
  const nodePlan = [
    {
      id: "baseline-silent",
      type: "spell-check",
      activityId: "spell-check",
      targets: ["sign", "know", "write"],
      difficulty: 1,
      source: "chart_planner",
      targetLane: "silent_letters",
    },
    {
      id: "pronunciation-hfw",
      type: "pronunciation",
      activityId: "pronunciation",
      targets: ["among", "building", "circle"],
      difficulty: 1,
      source: "chart_planner",
      targetLane: "high_frequency",
    },
    {
      id: "mystery-choice",
      type: "mystery",
      activityId: "mystery",
      targets: ["sign", "know", "write"],
      difficulty: 1,
      source: "chart_planner",
      targetLane: "silent_letters",
      choiceMode: "choice_lab",
      locked: false,
    },
    {
      id: "quest-transfer",
      type: "quest",
      activityId: "quest",
      targets: ["sign", "know", "write"],
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
  const output = {
    capturedContent: {
      title: "Benchmark Advance Spelling Unit 9 Week 3",
      type: "spelling_test",
      rawText: "",
      words: ["sign", "know", "write", "among", "building", "circle"],
      questions: [],
      sourceDocuments: [{ filename: "5_18_spelling.pdf", mediaType: "application/pdf" }],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Silent letters and high-frequency words",
        primarySkill: "Spell silent-letter words and read high-frequency words fluently",
        assignmentFormat: "two-column worksheet",
        concepts: ["silent letters", "high-frequency words"],
        sourceEvidence: ["Planner read the scanned worksheet image."],
      },
      wordGroups,
      assignmentInterpretation: {
        schemaVersion: 1,
        status: "ready",
        wordGroups,
        assertions: [],
        selectedTargets: [wordGroups[0]],
        heldTargets: [wordGroups[1]],
        clarificationQuestions: [],
        reviewRecommendations: [],
        humanAnswers: [],
        memoryMatches: [],
      },
    },
    assignmentInterpretation: {
      schemaVersion: 1,
      status: "ready",
      wordGroups,
      assertions: [],
      selectedTargets: [wordGroups[0]],
      heldTargets: [wordGroups[1]],
      clarificationQuestions: [],
      reviewRecommendations: [],
      humanAnswers: [],
      memoryMatches: [],
    },
    homeworkWords: [
      { text: "sign", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
      { text: "know", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
      { text: "write", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
      { text: "among", sourceGroupId: "high_frequency", purpose: "recognize" },
      { text: "building", sourceGroupId: "high_frequency", purpose: "recognize" },
      { text: "circle", sourceGroupId: "high_frequency", purpose: "recognize" },
    ],
    activeSessionPlan: {
      planId: "assignment-plan-ila",
      childId: "ila",
      createdAt: "2026-06-01T00:00:00.000Z",
      source: "ingest_human_loop",
      domain: "spelling",
      testDate: null,
      nodePlan,
      variationPolicy: {
        avoidExactPreviousNodeOrder: true,
        avoidExactPreviousWordOrder: true,
        seed: "single-planner",
        previousCompletedNodeCount: 0,
      },
      companionPolicy: {
        companionId: "elli",
        displayName: "Elli",
        openingLinePolicy: "context_start_short",
        verbosity: "low",
        maxMicroProbes: 1,
      },
      evidenceUsed: [{ id: "source-image", type: "assignment_source", summary: "Planner read source worksheet image." }],
      openQuestions: [],
      approvalStatus: "pending",
    },
    plannedMeasurements: nodePlan.map((node) => ({
      id: `measure-${node.id}`,
      activityId: node.activityId,
      target: node.targetLane ?? node.id,
      evidenceType: node.activityId,
      supportCriteria: "target response supports the plan",
      reviseCriteria: "misses or hesitation",
      falsifyCriteria: "missing evidence",
    })),
    planTheory: {
      hypothesis: "Silent-letter words need spelling production; high-frequency words need recognition/pronunciation.",
      evidenceSummary: ["The source image has separate columns."],
      intervention: "Use one planner-owned plan with different instruments by source group.",
      supportCriteria: ["Silent-letter words spelled", "high-frequency words read aloud"],
      reviseCriteria: ["High-frequency spelling gap appears"],
      falsifyCriteria: ["Teacher says high-frequency column is also written spelling."],
    },
    reviewQuestions: [
      "High-Frequency Words are routed to pronunciation/recognition instead of spelling drill.",
      "The journey switches materials before Mystery so it does not feel like grind.",
    ],
  } as AssignmentPlannerOutput;
  return { ...output, ...overrides };
}

describe("sunny ingest front door", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves the single sunny ingest command inputs without choosing a homework subtype", async () => {
    const root = makeRoot();
    roots.push(root);
    const source = path.join(root, "homework.pdf");
    fs.writeFileSync(source, "fake pdf");
    const answers = ["ila", source];

    const resolved = await resolveSunnyIngestInputs([], async () => answers.shift() ?? "", root);

    expect(resolved.childId).toBe("ila");
    expect(resolved.sourceFile).toBe(source);
    expect(resolved.nonInteractive).toBe(false);
  });

  it("builds parent review from the single assignment planner output", () => {
    const draft = buildSunnyDraftFromAssignmentPlan({
      childId: "ila",
      sourceFile: "/tmp/5_18_spelling.pdf",
      output: plannerOutput(),
      reviewSummary: "Assignment planning review",
    });
    const text = formatSunnyIngestInterpretation(draft);

    expect(draft.classification.type).toBe("spelling_homework");
    expect(draft.proposedDestination).toBe("homework");
    expect(text).toContain("The planner thinks this is spelling homework.");
    expect(text).toContain("Silent Letters (spell_from_memory): sign, know, write");
    expect(text).toContain("High-Frequency Words (recognize): among, building, circle");
    expect(text).toContain("spell-check -> pronunciation -> mystery -> quest (locked) -> boss (locked)");
    expect(text).toContain("does not feel like grind");
  });

  it("passes scanned page images to the assignment planner packet when OCR text is empty", async () => {
    const root = makeRoot();
    roots.push(root);
    const seenPackets: AssignmentPlanningPacket[] = [];

    await buildSunnyPlannerDraft({
      childId: "ila",
      sourceFile: path.join(root, "5_18_spelling.pdf"),
      extraction: extraction(root),
      childChart: chart(),
      planAssignment: async (packet) => {
        seenPackets.push(packet);
        return plannerOutput();
      },
    });

    expect(seenPackets[0]?.sourceDocument.fullText).toBe("");
    expect(seenPackets[0]?.sourceDocument.pages[0]?.imagePath).toContain("page.png");
  });

  it("date edits update the approved planner output before save", () => {
    const draft = buildSunnyDraftFromAssignmentPlan({
      childId: "ila",
      sourceFile: "/tmp/5_18_spelling.pdf",
      output: plannerOutput(),
      reviewSummary: "Assignment planning review",
    });

    const edited = applyHumanIngestEdits(draft, [{ kind: "set_test_date", testDate: "2026-06-05" }]);

    expect(edited.proposedHomework?.testDate).toBe("2026-06-05");
    expect(edited.assignmentPlannerOutput?.activeSessionPlan.testDate).toBe("2026-06-05");
    expect(edited.humanEdits).toContain("set_test_date:2026-06-05");
  });

  it("revises through the same assignment planner when parent nuance changes meaning", async () => {
    const root = makeRoot();
    roots.push(root);
    const firstDraft = buildSunnyDraftFromAssignmentPlan({
      childId: "ila",
      sourceFile: path.join(root, "5_18_spelling.pdf"),
      output: plannerOutput(),
      reviewSummary: "Assignment planning review",
      assignmentSource: extraction(root),
      assignmentPlanningPacket: {
        packetVersion: 1,
        childId: "ila",
        masteryContext: {
          nowIso: "2026-06-01T00:00:00.000Z",
          localDate: "2026-06-01",
          timeZone: "America/New_York",
          testDate: null,
          testDateSource: "unknown",
          testDateConfirmed: false,
          daysUntilTest: null,
          goal: "assignment mastery",
          requiredAbilities: [],
          expectedSessionsRemaining: null,
          sessionIntensity: "build",
          questRole: "transfer proof",
          bossRole: "mastery gate",
          failureLoop: "teach then retest",
        },
        sourceDocument: extraction(root),
        childChart: { childId: "ila", displayName: "Ila", recentEvidence: [] },
        activityCatalog: [],
        boardPlanning: {
          algorithmContracts: {
            choicePolicy: { id: "choicePolicy", purpose: "choice", needs: [], outputs: [], guardrails: [] },
            spacedRepetition: { id: "spacedRepetition", purpose: "spacing", needs: [], outputs: [], guardrails: [] },
            questReadiness: { id: "questReadiness", purpose: "quest", needs: [], outputs: [], guardrails: [] },
            masteryGate: { id: "masteryGate", purpose: "boss", needs: [], outputs: [], guardrails: [] },
          },
          choicePolicyContext: { purpose: "choice", evidenceSignals: [], signalQualityNotes: [], plannerDecision: "small" },
          runtimeConstraints: { rendererOnly: true, noRuntimePlanning: true, outputMustBeSerializableJson: true },
          criticPolicy: { semanticAudit: "always", visualCritic: "risk_gated", riskSignals: [], retryLimit: 1 },
        },
        plannerInstruction: "Interpret assignment.",
      },
    });
    const revisedOutput = plannerOutput();
    revisedOutput.activeSessionPlan.nodePlan[1] = {
      ...revisedOutput.activeSessionPlan.nodePlan[1]!,
      id: "pronunciation-high-frequency-after-parent-note",
    };
    const seenPackets: AssignmentPlanningPacket[] = [];

    const revised = await reviseSunnyPlannerDraft({
      draft: firstDraft,
      parentNote: "High frequency words should be pronunciation, not spelling.",
      planAssignment: async (packet) => {
        seenPackets.push(packet);
        return revisedOutput;
      },
    });

    expect(seenPackets[0]?.parentDialogue?.at(-1)?.message).toBe("High frequency words should be pronunciation, not spelling.");
    expect(seenPackets[0]?.priorPlannerOutput?.activeSessionPlan.nodePlan[1]?.activityId).toBe("pronunciation");
    expect(revised.assignmentPlannerOutput?.activeSessionPlan.nodePlan[1]?.id).toBe("pronunciation-high-frequency-after-parent-note");
  });

  it("approved homework applies the existing planner output without a second planner call", async () => {
    const root = makeRoot();
    roots.push(root);
    writeChild(root, "ila");
    let plannedWrites = 0;
    let fallbackCalls = 0;
    const draft = buildSunnyDraftFromAssignmentPlan({
      childId: "ila",
      sourceFile: "/tmp/5_18_spelling.pdf",
      output: plannerOutput(),
      reviewSummary: "Assignment planning review",
    });

    const result = await applyApprovedSunnyIngestDraft(draft, {
      rootDir: root,
      reviewer: "parent",
      approvedAt: "2026-06-01T12:00:00.000Z",
      applyPlannedHomeworkIngest: async () => {
        plannedWrites += 1;
      },
      runHomeworkIngest: async () => {
        fallbackCalls += 1;
      },
    });
    const trace = fs.readFileSync(path.join(root, "src/context/ila/decision_traces/2026-06-01.ndjson"), "utf8");

    expect(result.applied).toBe(true);
    expect(plannedWrites).toBe(1);
    expect(fallbackCalls).toBe(0);
    expect(trace).toContain("\"route\":\"homework\"");
    expect(trace).toContain("\"plannerClassification\":\"spelling_homework\"");
  });

  it("cancel writes nothing", async () => {
    const root = makeRoot();
    roots.push(root);
    writeChild(root, "ila");
    const before = fs.readdirSync(path.join(root, "src/context/ila"));

    const result = await applyApprovedSunnyIngestDraft(buildSunnyDraftFromAssignmentPlan({
      childId: "ila",
      sourceFile: "/tmp/5_18_spelling.pdf",
      output: plannerOutput(),
      reviewSummary: "Assignment planning review",
    }), {
      rootDir: root,
      finalAction: "cancelled",
      applyPlannedHomeworkIngest: async () => {
        throw new Error("should_not_write");
      },
    });

    expect(result.applied).toBe(false);
    expect(fs.readdirSync(path.join(root, "src/context/ila"))).toEqual(before);
  });

  it("non-assignment routes are honestly unsupported in assignment-mastery V1", async () => {
    const root = makeRoot();
    roots.push(root);
    writeChild(root, "ila");
    const draft = buildSunnyDraftFromAssignmentPlan({
      childId: "ila",
      sourceFile: "/tmp/teacher-note.pdf",
      output: plannerOutput(),
      reviewSummary: "Assignment planning review",
    });
    draft.classification.type = "teacher_note";
    draft.proposedDestination = "child_context";

    const result = await applyApprovedSunnyIngestDraft(draft, {
      rootDir: root,
      reviewer: "parent",
      approvedAt: "2026-06-01T12:00:00.000Z",
    });
    const trace = fs.readFileSync(path.join(root, "src/context/ila/decision_traces/2026-06-01.ndjson"), "utf8");

    expect(result.applied).toBe(false);
    expect(result.reason).toContain("not_supported_assignment_ingest_v1");
    expect(trace).toContain("not_supported_assignment_ingest_v1");
  });
});
