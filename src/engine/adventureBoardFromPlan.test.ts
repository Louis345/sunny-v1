import { describe, expect, it } from "vitest";
import {
  buildAdventureBoardFromActiveSessionPlan,
  type ActiveSessionPlanBoardSnapshot,
} from "../shared/adventureBoardFromPlan";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";

const theme: AdventureBoardJson["theme"] = {
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
};

const reinaMay24Plan: ActiveSessionPlanBoardSnapshot = {
  planId: "assignment-plan-reina-9e9fe934",
  childId: "reina",
  domain: "spelling",
  nodePlan: [
    {
      id: "baseline_silent_letters_spelling",
      type: "word-radar",
      activityId: "word-radar",
      targets: ["sign", "know", "write", "thumb", "comb", "gnat", "knock", "knife", "wrong", "climb"],
      targetLane: "silent_letters",
      locked: false,
      wordRadarConfig: {
        recallMode: "partial_visual_recall",
        inputMode: "letter-by-letter",
        speakStyle: "option-a",
        showTimer: false,
        hideWordDuringResponse: true,
        requiresCapturedResponse: true,
      },
    },
    {
      id: "baseline_high_frequency_recognition",
      type: "word-radar",
      activityId: "word-radar",
      targets: ["among", "building", "circle", "decided", "finally", "heavy", "include", "nothing", "special", "wheel"],
      targetLane: "high_frequency_words",
      locked: false,
      wordRadarConfig: {
        recallMode: "visible_read",
        inputMode: "whole-word",
        speakStyle: "option-a",
        showTimer: false,
        hideWordDuringResponse: false,
        requiresCapturedResponse: true,
      },
    },
    {
      id: "baseline_spelling_diagnostic",
      type: "spell-check",
      activityId: "spell-check",
      targets: ["sign", "know", "write", "thumb", "comb", "gnat", "knock", "knife", "wrong", "climb"],
      targetLane: "silent_letters",
      locked: false,
    },
    {
      id: "mystery_choice",
      type: "mystery",
      activityId: "mystery",
      targets: ["sign", "know", "write", "thumb", "comb", "gnat", "knock", "knife", "wrong", "climb", "among", "building", "circle", "decided", "finally", "heavy", "include", "nothing", "special", "wheel"],
      targetLane: "silent_letters",
      choiceMode: "choice_lab",
      locked: false,
    },
    {
      id: "quest_transfer",
      type: "quest",
      activityId: "quest",
      targets: ["sign", "know", "write", "thumb", "comb", "gnat", "knock", "knife", "wrong", "climb", "among", "building", "circle", "decided", "finally", "heavy", "include", "nothing", "special", "wheel"],
      targetLane: "silent_letters",
      locked: true,
      masteryUnlockState: "preparing",
    },
    {
      id: "boss_mastery",
      type: "boss",
      activityId: "boss",
      targets: [],
      targetLane: "silent_letters",
      locked: true,
      masteryUnlockState: "preparing",
    },
  ],
};

describe("buildAdventureBoardFromActiveSessionPlan", () => {
  it("preserves Reina May 24 planner node order and Word Radar configs", () => {
    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: reinaMay24Plan,
      boardId: "reina-current-homework",
      title: "Reina Current Homework",
      theme,
    });

    expect(board.nodes.map((node) => node.id)).toEqual([
      "baseline_silent_letters_spelling",
      "baseline_high_frequency_recognition",
      "baseline_spelling_diagnostic",
      "mystery_choice",
      "quest_transfer",
      "boss_mastery",
    ]);
    expect(board.nodes[0].activityId).toBe("word-radar");
    expect(board.nodes[0].target?.laneId).toBe("silent_letters");
    expect(board.nodes[0].target?.words).toEqual(reinaMay24Plan.nodePlan[0].targets);
    expect(board.nodes[0].wordRadarConfig).toEqual(reinaMay24Plan.nodePlan[0].wordRadarConfig);
    expect(board.nodes[1].target?.laneId).toBe("high_frequency_words");
    expect(board.nodes[1].wordRadarConfig).toEqual(reinaMay24Plan.nodePlan[1].wordRadarConfig);
    expect(board.nodes[4].state).toBe("locked");
    expect(board.nodes[5].state).toBe("locked");
  });

  it("does not invent missing Mystery, Quest, Boss, or modal choices", () => {
    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: {
        planId: "minimal-plan",
        childId: "reina",
        domain: "spelling",
        nodePlan: [
          {
            id: "planner_word_radar",
            type: "word-radar",
            activityId: "word-radar",
            targets: ["sign"],
            targetLane: "silent_letters",
            locked: false,
          },
          {
            id: "planner_spell_check",
            type: "spell-check",
            activityId: "spell-check",
            targets: ["sign"],
            targetLane: "silent_letters",
            locked: false,
          },
        ],
      },
      boardId: "minimal-board",
      theme,
    });

    expect(board.nodes.map((node) => node.id)).toEqual(["planner_word_radar", "planner_spell_check"]);
    expect(board.nodes.some((node) => ["mystery", "quest", "boss"].includes(node.kind))).toBe(false);
    expect(board.choiceSets ?? []).toHaveLength(0);
    expect(board.edges.map((edge) => [edge.from, edge.to])).toEqual([
      ["planner_word_radar", "planner_spell_check"],
    ]);
  });
});
