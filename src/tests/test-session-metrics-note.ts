import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import type { LearningProfile } from "../context/schemas/learningProfile";
import {
  formatAdventureMetricsBlock,
  updateLearningProfileFromSession,
  writeSessionNote,
  type SessionData,
} from "../engine/psychologistBridge";
import * as learningProfileIO from "../utils/learningProfileIO";

function minimalSession(over: Partial<SessionData> = {}): SessionData {
  return {
    childId: "qa_session_note",
    date: "2026-04-10T10:00:00.000Z",
    attempts: [],
    difficultySignals: [],
    bondExchangeCount: 0,
    bondTopics: [],
    bondQuality: "moderate",
    sessionDuration: 12,
    moodStart: "neutral",
    moodEnd: "neutral",
    mode: "spelling",
    wilsonStep: 1,
    wordsRegressed: [],
    rewardsFired: [],
    correctStreak: 0,
    totalCorrect: 2,
    totalAttempts: 3,
    ...over,
  };
}

describe("session note metrics (TASK-017)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writeSessionNote includes Metrics block with nodes and ratings summary", () => {
    const spy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    const md = formatAdventureMetricsBlock({
      nodesCompleted: 4,
      totalNodes: 5,
      castleReached: true,
      avgAccuracyPct: 78,
      avgCompletionMin: 4.2,
      likeCount: 3,
      dislikeCount: 1,
      nullCount: 1,
      theme: "default",
      mostEngagedNodeType: "bubble-pop",
      leastEngagedNodeType: "clock-game",
      banditStateLabel: "updated",
    });
    writeSessionNote("qa_session_note", {
      ...minimalSession(),
      adventureMetricsMarkdown: md,
    });
    expect(spy).toHaveBeenCalled();
    const written = String(spy.mock.calls[0][1]);
    expect(written).toContain("## Metrics");
    expect(written).toContain("Nodes completed: 4/5");
    expect(written).toContain("Ratings: 3 likes, 1 dislikes, 1 null");
    expect(written).toContain("Most engaged node type: bubble-pop");
    expect(written).toContain("Least engaged: clock-game");
  });

  it("updateLearningProfileFromSession tolerates profile JSON missing sessionStats (diag/creator)", () => {
    const writeSpy = vi.spyOn(learningProfileIO, "writeLearningProfile").mockImplementation(() => undefined);
    const readSpy = vi.spyOn(learningProfileIO, "readLearningProfile").mockReturnValue({
      childId: "creator",
      version: 1,
      createdAt: "2026-04-14T00:00:00.000Z",
      lastUpdated: "2026-04-14T00:00:00.000Z",
      moodHistory: [],
    } as unknown as LearningProfile);

    expect(() =>
      updateLearningProfileFromSession("creator", minimalSession({ totalCorrect: 0, totalAttempts: 0 })),
    ).not.toThrow();

    expect(writeSpy).toHaveBeenCalled();
    const written = writeSpy.mock.calls[0]![1] as LearningProfile;
    expect(written.sessionStats?.totalSessions).toBe(1);
    expect(written.bondPatterns?.topicFrequency).toEqual({});

    readSpy.mockRestore();
    writeSpy.mockRestore();
  });
});
