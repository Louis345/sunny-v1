import { describe, expect, it } from "vitest";
import {
  buildCurrentBoardSnapshot,
  buildCurrentBoardSnapshotContext,
  findCompanionTruthContradictions,
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

  it("gives Elli the AI-authored math activity and live challenge without exposing correctness", () => {
    const snapshot = buildCurrentBoardSnapshot({
      childId: "reina",
      sessionId: "voice-1",
      state: {
        game: "generated-baseline",
        activityId: "skip-count-glider",
        nodeId: "skip-count-glider",
        phase: "question",
        activityTitle: "Skyglider Skip-Count Run",
        learningFocus: "skip-counting by 2s, 5s, and 10s",
        mechanic: "tap the lantern that continues the count",
        currentChallenge: "Skip count by 5s: 5, 10, 15, __?",
        availableActions: ["20", "16", "25"],
        itemIndex: 0,
        totalItems: 3,
        answerVisibility: "hidden",
      },
    });

    expect(snapshot).toMatchObject({
      activityTitle: "Skyglider Skip-Count Run",
      learningFocus: "skip-counting by 2s, 5s, and 10s",
      mechanic: "tap the lantern that continues the count",
      currentChallenge: "Skip count by 5s: 5, 10, 15, __?",
      availableActions: ["20", "16", "25"],
    });
    const context = buildCurrentBoardSnapshotContext(snapshot);
    expect(context).toContain("Activity title: Skyglider Skip-Count Run");
    expect(context).toContain("Learning focus: skip-counting by 2s, 5s, and 10s");
    expect(context).toContain("Current challenge: Skip count by 5s: 5, 10, 15, __?");
    expect(context).toContain("Available child actions: 20 | 16 | 25");
    expect(context).not.toContain("Correct answer");
  });

  it("extracts the exact visible prompt from an object-shaped generated challenge", () => {
    const snapshot = buildCurrentBoardSnapshot({
      childId: "reina",
      sessionId: "voice-1",
      state: {
        game: "generated-math",
        activityId: "N1",
        nodeId: "N1",
        phase: "question",
        currentChallenge: {
          id: "N1-I1",
          prompt: "Which rectangle is cut into 3 equal parts?",
          mode: "selection",
          readAloudRequested: true,
        },
        availableActions: ["tap_rectangle_A", "tap_rectangle_B"],
        answerVisibility: "hidden",
      },
    });

    expect(snapshot.currentChallenge).toBe(
      "Which rectangle is cut into 3 equal parts?",
    );
    expect(buildCurrentBoardSnapshotContext(snapshot)).toContain(
      "Current challenge: Which rectangle is cut into 3 equal parts?",
    );
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

  it("detects companion claims that contradict the current truth packet", () => {
    const snapshot = buildCurrentBoardSnapshot({
      childId: "ila",
      sessionId: "voice-1",
      state: {
        game: "word-radar",
        activityId: "word-radar",
        phase: "complete",
        accuracy: 0.57,
        evidenceTier: "practice",
        masteryEligible: false,
        questState: "locked",
        bossState: "locked",
      },
    });

    const contradictions = findCompanionTruthContradictions(
      "You crushed Word Radar with 100% accuracy and the boss level is unlocked.",
      snapshot,
    );

    expect(contradictions).toContain("mastery_claim_contradicts_activity_result");
    expect(contradictions).toContain("boss_unlock_claim_contradicts_board_state");
  });
});
