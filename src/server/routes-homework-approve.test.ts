import express from "express";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/learningProfileIO", () => ({
  readLearningProfile: vi.fn(),
  writeLearningProfile: vi.fn(),
}));

vi.mock("../engine/adaptiveEvidenceSnapshot", () => ({
  buildAdaptiveEvidenceSnapshot: vi.fn(),
  questGateFromSnapshot: vi.fn(() => ({
    canOpenQuest: false,
    needsHumanReview: true,
    reason: "Quest gate blocked: missing baseline_measurements.",
    requiredMissingEvidence: ["baseline_measurements"],
  })),
}));

import { setupRoutes } from "./routes";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";

const mockedReadLearningProfile = vi.mocked(readLearningProfile);
const mockedWriteLearningProfile = vi.mocked(writeLearningProfile);

describe("POST /api/homework/approve", () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    vi.clearAllMocks();
  });

  async function postJson(route: string, body: Record<string, unknown>) {
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      body: await res.json() as Record<string, unknown>,
    };
  }

  async function postApprove(body: Record<string, unknown>) {
    return postJson("/api/homework/approve", body);
  }

  it("blocks quest approval when the adaptive evidence gate is not open", async () => {
    mockedReadLearningProfile.mockReturnValue({
      childId: "reina",
      bondPatterns: {
        topics: [],
        bondStyle: "unknown",
        averageBondTurns: 0,
        lastBondQuality: "moderate",
        topicFrequency: {},
      },
      algorithmParams: {
        difficulty: {
          targetAccuracy: 0.7,
          easyThreshold: 0.85,
          hardThreshold: 0.5,
          breakThreshold: 0.4,
          windowSize: 8,
        },
      },
      moodAdjustment: false,
      pendingHomework: {
        homeworkId: "hw-spelling-test",
        weekOf: "2026-05-05",
        title: "Spelling Test",
        wordList: ["shiny"],
        nodes: [
          {
            id: "n-quest-hw-spelling-test",
            type: "quest",
            words: ["shiny"],
          },
        ],
      },
    } as never);

    const out = await postApprove({
      childId: "reina",
      date: "2026-05-05",
      nodeId: "n-quest-hw-spelling-test",
    });

    expect(out.status).toBe(409);
    expect(out.body).toMatchObject({
      ok: false,
      error: "quest_gate_blocked",
      requiredMissingEvidence: ["baseline_measurements"],
    });
    expect(mockedWriteLearningProfile).not.toHaveBeenCalled();
  });

  it("saves parent homework clarification and replans from the confirmed interpretation", async () => {
    mockedReadLearningProfile.mockReturnValue({
      childId: "reina",
      bondPatterns: {
        topics: [],
        bondStyle: "unknown",
        averageBondTurns: 0,
        lastBondQuality: "moderate",
        topicFrequency: {},
      },
      algorithmParams: {
        difficulty: {
          targetAccuracy: 0.7,
          easyThreshold: 0.85,
          hardThreshold: 0.5,
          breakThreshold: 0.4,
          windowSize: 8,
        },
      },
      moodAdjustment: false,
      pendingHomework: {
        homeworkId: "hw-clarify",
        weekOf: "2026-05-08",
        testDate: "2026-05-09",
        wordList: ["shiny", "slowly"],
        capturedContent: {
          title: "Weekly Words",
          type: "spelling_test",
          rawText: "",
          words: ["shiny", "slowly"],
          questions: [],
          sourceDocuments: [],
          contentProfile: {
            practiceDomain: "spelling",
            contentDomain: "language_arts",
            topic: "Weekly Words",
            primarySkill: "unknown",
            assignmentFormat: "word list",
            concepts: [],
            sourceEvidence: ["Directions were not captured."],
          },
          assignmentInterpretation: {
            schemaVersion: 1,
            status: "needs_clarification",
            wordGroups: [
              {
                id: "weekly-words",
                label: "Weekly Words",
                purpose: "unknown",
                words: ["shiny", "slowly"],
                confidence: 0.5,
                evidence: ["Directions were not captured."],
              },
            ],
            assertions: [],
            selectedTargets: [],
            heldTargets: [],
            clarificationQuestions: [
              {
                id: "clarify-weekly-words-purpose",
                prompt: "What should Sunny do with Weekly Words?",
                options: ["spell_from_memory", "read_fluently"],
                targetGroupIds: ["weekly-words"],
                reason: "Missing directions.",
                confidenceBefore: 0.5,
              },
            ],
            humanAnswers: [],
            memoryMatches: [],
          },
          wordGroups: [],
        },
        nodes: [],
      },
    } as never);

    const out = await postJson("/api/homework/clarification", {
      childId: "reina",
      date: "2026-05-08",
      questionId: "clarify-weekly-words-purpose",
      answer: "spell_from_memory",
      answeredBy: "parent",
    });

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ ok: true });
    expect(mockedWriteLearningProfile).toHaveBeenCalledOnce();
    const saved = mockedWriteLearningProfile.mock.calls[0]?.[1] as {
      pendingHomework?: { nodes?: Array<{ type?: string }> };
      homeworkInterpretationMemory?: unknown[];
    };
    expect(saved.pendingHomework?.nodes?.map((node) => node.type)).toEqual([
      "letter-rush",
      "letter-rush",
      "letter-rush",
    ]);
    expect(saved.homeworkInterpretationMemory).toHaveLength(1);
  });
});
