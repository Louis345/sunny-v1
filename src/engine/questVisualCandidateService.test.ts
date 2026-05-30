import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import { prepareQuestVisualCandidates } from "./questVisualCandidateService";
import type { LearningProfile } from "../context/schemas/learningProfile";

describe("quest visual candidate service", () => {
  const tmpRoots: string[] = [];

  afterEach(() => {
    for (const dir of tmpRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeProfile(profile: LearningProfile): string {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-quest-visual-"));
    tmpRoots.push(rootDir);
    const childDir = path.join(rootDir, "src", "context", profile.childId);
    fs.mkdirSync(childDir, { recursive: true });
    fs.writeFileSync(
      path.join(childDir, "learning_profile.json"),
      JSON.stringify(profile, null, 2),
      "utf8",
    );
    return rootDir;
  }

  it("keeps generated Quest choice cards attached to the current learning domain", async () => {
    const profile = initializeLearningProfile({
      childId: "reader",
      age: 8,
      grade: 3,
      diagnoses: [],
      learningGoals: [],
    });
    profile.pendingHomework = {
      weekOf: "2026-05-30",
      testDate: null,
      wordList: [],
      homeworkId: "reading-main-idea",
      generatedAt: "2026-05-30T00:00:00.000Z",
      nodes: [
        {
          id: "node-quest",
          type: "quest",
          words: [],
          difficulty: 2,
          gameFile: null,
          storyFile: null,
        },
      ],
    };
    profile.activeSessionPlan = {
      planId: "reading-plan",
      childId: "reader",
      createdAt: "2026-05-30T00:00:00.000Z",
      source: "ingest_human_loop",
      activeHomeworkId: "reading-main-idea",
      domain: "reading",
      testDate: null,
      nodePlan: [
        {
          id: "node-quest",
          type: "quest",
          activityId: "generated-quest",
          targets: ["main idea", "text evidence"],
          difficulty: 2,
          source: "chart_planner",
        },
      ],
      variationPolicy: {
        avoidExactPreviousNodeOrder: true,
        avoidExactPreviousWordOrder: true,
        seed: "reading",
        previousCompletedNodeCount: 0,
      },
      companionPolicy: {
        companionId: "matilda",
        displayName: "Matilda",
        openingLinePolicy: "context_start_short",
        verbosity: "low",
        maxMicroProbes: 1,
      },
      evidenceUsed: [],
      openQuestions: [],
    };
    const rootDir = writeProfile(profile);

    const result = await prepareQuestVisualCandidates({
      childId: "reader",
      kind: "quest",
      nodeId: "node-quest",
      rootDir,
      now: new Date("2026-05-30T12:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards).toHaveLength(3);
    expect(result.cards.every((card) => card.domain === "reading")).toBe(true);
  });

  it("blocks Boss visual candidates until Quest target evidence exists", async () => {
    const profile = initializeLearningProfile({
      childId: "reina",
      age: 8,
      grade: 3,
      diagnoses: [],
      learningGoals: [],
    });
    profile.pendingHomework = {
      weekOf: "2026-05-30",
      testDate: null,
      wordList: ["faster", "fastest"],
      homeworkId: "hw-spelling_test-2da310ad",
      generatedAt: "2026-05-30T00:00:00.000Z",
      nodes: [
        { id: "node-boss", type: "boss", words: ["faster", "fastest"], difficulty: 3, gameFile: null, storyFile: null },
      ],
    };
    const rootDir = writeProfile(profile);

    const result = await prepareQuestVisualCandidates({
      childId: "reina",
      kind: "boss",
      nodeId: "node-boss",
      rootDir,
      now: new Date("2026-05-30T12:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, error: "boss_quest_evidence_required" });
  });

  it("uses Quest target evidence to prepare Boss visual cards", async () => {
    const profile = initializeLearningProfile({
      childId: "reina",
      age: 8,
      grade: 3,
      diagnoses: [],
      learningGoals: [],
    });
    profile.pendingHomework = {
      weekOf: "2026-05-30",
      testDate: null,
      wordList: ["faster", "fastest", "slower"],
      homeworkId: "hw-spelling_test-2da310ad",
      generatedAt: "2026-05-30T00:00:00.000Z",
      nodes: [
        { id: "node-boss", type: "boss", words: ["faster", "fastest", "slower"], difficulty: 3, gameFile: null, storyFile: null },
      ],
    };
    const rootDir = writeProfile(profile);
    const resultsDir = path.join(rootDir, "src", "context", "reina", "activity_results");
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(
      path.join(resultsDir, "2026-05-30.ndjson"),
      `${JSON.stringify({
        type: "activity_node_result",
        recordedAt: "2026-05-30T12:00:00.000Z",
        nodeId: "node-quest",
        nodeType: "quest",
        contentId: "quest-visual-mystery-vault",
        completed: true,
        accuracy: 0.67,
        targetResults: [
          { target: "faster", correct: true, attempts: 1 },
          { target: "fastest", correct: false, attempts: 2, recovered: true },
          { target: "slower", correct: false, attempts: 1 },
        ],
      })}\n`,
      "utf8",
    );

    const result = await prepareQuestVisualCandidates({
      childId: "reina",
      kind: "boss",
      nodeId: "node-boss",
      rootDir,
      now: new Date("2026-05-30T12:05:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards).toHaveLength(3);
    expect(result.cards.every((card) => card.nodeType === "boss")).toBe(true);
    expect(result.candidates.every((candidate) => candidate.promptPath.includes("boss-node-boss-visuals"))).toBe(true);
  });
});
