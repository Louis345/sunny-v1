import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { getChildChart } from "../profiles/childChart";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import { buildExperiencePlannerInput, draftPsychologistExperiencePlan } from "./experiencePlanner";
import { buildExperienceContextPacket } from "./experienceContextPacket";

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function profile(childId: string): LearningProfile {
  const p = initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: ["spelling"],
  });
  p.pendingHomework = {
    weekOf: "2026-05-15",
    homeworkId: "hw-spelling-demo",
    testDate: "2026-05-16",
    wordList: ["above", "again", "around"],
    generatedAt: "2026-05-15T10:00:00.000Z",
    completedAdventureNodeIds: [],
    contentProfile: {
      practiceDomain: "spelling",
      contentDomain: "spelling",
      topic: "spelling demo",
      primarySkill: "Spelling recall",
      assignmentFormat: "spelling list",
      concepts: ["memory"],
      sourceEvidence: ["fixture"],
    },
    capturedContent: null,
    nodes: [
      {
        id: "n-word-radar-hw-spelling-demo",
        type: "word-radar",
        words: ["above", "again", "around"],
        difficulty: 1,
        gameFile: null,
        storyFile: null,
      },
    ],
  };
  p.activityModel = {
    "word-radar": {
      activityId: "word-radar",
      plays: 4,
      completions: 4,
      completionRate: 1,
      averageAccuracy: 0.96,
      engagementScore: 0.25,
      frustrationScore: 0.1,
      likedCount: 0,
      dislikedCount: 2,
      lastRating: "dislike",
      lastPlayed: "2026-05-15T11:00:00.000Z",
      domains: { spelling: 4 },
      missedWords: [],
    },
  };
  return p;
}

describe("experience context packet", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses one packet for psychologist, quest, and boss context", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-experience-packet-"));
    roots.push(root);
    const childId = "demo_adaptive";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plannerInput = buildExperiencePlannerInput(chart, { rootDir: root });
    const plan = draftPsychologistExperiencePlan(plannerInput);
    const packet = buildExperienceContextPacket(plannerInput, plan);

    expect(packet.psychologist.childId).toBe(childId);
    expect(packet.quest.sourcePacketId).toBe(packet.packetId);
    expect(packet.boss.sourcePacketId).toBe(packet.packetId);
    expect(packet.quest.carePlanTheory).toEqual(packet.psychologist.carePlanTheory);
    expect(packet.boss.carePlanTheory).toEqual(packet.psychologist.carePlanTheory);
    expect(packet.quest.evidenceUsed).toEqual(packet.psychologist.evidenceUsed);
    expect(packet.boss.plannedMeasurements).toEqual(packet.psychologist.plannedMeasurements);
  });
});
