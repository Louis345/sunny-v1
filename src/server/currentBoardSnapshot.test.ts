import { describe, expect, it } from "vitest";
import {
  buildCurrentBoardSnapshot,
  buildCurrentBoardSnapshotContext,
} from "./currentBoardSnapshot";

describe("CurrentBoardSnapshot", () => {
  it("keeps child speech separate from the current board truth", () => {
    const snapshot = buildCurrentBoardSnapshot({
      childId: "ila",
      sessionId: "voice-1",
      state: {
        game: "spell-check",
        nodeId: "n-spell",
        activityId: "spell-check",
        phase: "spelling",
        currentWord: "above",
        itemIndex: 0,
        totalItems: 5,
        coins: 140,
      },
      allowedActivities: ["spell-check", "pronunciation", "mystery"],
    });

    expect(snapshot).toMatchObject({
      childId: "ila",
      sessionId: "voice-1",
      game: "spell-check",
      currentTarget: "above",
      targetIsSpeakable: true,
      answerVisibility: "visible",
      allowedActivities: ["spell-check", "pronunciation", "mystery"],
      coins: 140,
    });

    const context = buildCurrentBoardSnapshotContext(snapshot, {
      childSpeech: "what word is it?",
    });
    expect(context).toContain("[Internal live board state]");
    expect(context).toContain('Child speech: "what word is it?"');
    expect(context).toContain("Current game: spell-check");
    expect(context).toContain("Current target: above");
    expect(context).not.toContain("Word Radar");
  });

  it("does not expose hidden Wheel answers to Elli", () => {
    const snapshot = buildCurrentBoardSnapshot({
      childId: "ila",
      sessionId: "voice-1",
      state: {
        game: "Wheel of Fortune",
        phase: "picking",
        currentWord: "above",
        boardState: "_ B _ _ E",
        itemIndex: 2,
        totalItems: 5,
      },
    });

    expect(snapshot.answerVisibility).toBe("hidden");
    expect(snapshot.currentTarget).toBeUndefined();
    expect(snapshot.targetIsSpeakable).toBe(false);

    const context = buildCurrentBoardSnapshotContext(snapshot);
    expect(context).toContain("Answer visibility: hidden");
    expect(context).toContain("Board: _ B _ _ E");
    expect(context).not.toContain("above");
  });

  it("ignores raw and unknown fields while preserving exact reward fields", () => {
    const snapshot = buildCurrentBoardSnapshot({
      childId: "ila",
      sessionId: "voice-1",
      state: {
        game: "pronunciation",
        currentWord: "ahead",
        score: 20,
        coinsEarned: 5,
        inventedTotal: 12000,
        apiKey: "secret",
        rawAudio: "base64",
      },
    });

    const serialized = JSON.stringify(snapshot);
    expect(snapshot.score).toBe(20);
    expect(snapshot.coinsEarned).toBe(5);
    expect(serialized).not.toContain("12000");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("base64");
  });
});
