import { describe, expect, it } from "vitest";
import {
  buildAdventureBoardFromActiveSessionPlan,
  resolveAdventureBoardForActiveSessionPlan,
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
  it("keeps generated activity labels on whole-word boundaries", () => {
    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: {
        ...reinaMay24Plan,
        nodePlan: [{
          ...reinaMay24Plan.nodePlan[0]!,
          title: "The Lighthouse Lens: Secret of the Shrinking Slice",
        }],
      },
      boardId: "generated-math-label",
      title: "Generated Math",
      theme,
    });

    expect(board.nodes.find((node) => node.id === "baseline_silent_letters_spelling")?.shortLabel)
      .toBe("The Lighthouse Lens");
  });

  it("ignores stale adventureBoard blobs and materializes from nodePlan", () => {
    const plannerBoard: AdventureBoardJson = {
      schemaVersion: 1,
      boardId: "stale-reina-board",
      planId: reinaMay24Plan.planId,
      childId: "reina",
      domain: "spelling",
      title: "Reina Current Homework",
      theme,
      layout: {
        preset: "horizontal-adventure-spine",
        companionSlot: "right",
        routeChoiceBehavior: "exclusive",
      },
      plannerRationale: {
        agencyDesign: "Start with baseline work, then use a visible route gate and Mystery modal choice.",
        evidenceDesign: "Each child-facing choice earns evidence without changing the learning targets.",
        layoutChoice: "Horizontal map leaves room for Matilda.",
      },
      nodes: [
        { id: "start", kind: "start", label: "Start", state: "completed" },
        { id: "baseline_silent_letters_spelling", kind: "activity", activityId: "word-radar", label: "Know / Write", state: "current" },
        { id: "choice_after_verify", kind: "choice-gate", label: "Choose Path", state: "locked" },
        { id: "mystery_choice", kind: "mystery", activityId: "mystery", label: "Mystery", state: "available", choiceSetId: "mystery-choice" },
      ],
      edges: [
        { id: "e-start-radar", from: "start", to: "baseline_silent_letters_spelling", state: "completed" },
        { id: "e-radar-choice", from: "baseline_silent_letters_spelling", to: "choice_after_verify", state: "locked", style: "dashed" },
        { id: "e-choice-mystery", from: "choice_after_verify", to: "mystery_choice", state: "locked", style: "dashed" },
      ],
      choiceSets: [
        {
          id: "mystery-choice",
          kind: "mystery",
          title: "Pick a challenge",
          options: [
            { id: "story", label: "Story Challenge", state: "available" },
            { id: "speed", label: "Speed Challenge", state: "available" },
          ],
        },
      ],
    };

    const board = resolveAdventureBoardForActiveSessionPlan({
      plan: {
        ...reinaMay24Plan,
        adventureBoard: plannerBoard,
      },
      boardId: "fallback-board",
      theme,
    });

    expect(board).not.toEqual(plannerBoard);
    expect(board.boardId).toBe("fallback-board");
    expect(board.nodes.filter((node) => node.kind === "start")).toHaveLength(1);
    expect(board.nodes.map((node) => node.id)).not.toContain("choice_after_verify");
    expect(board.nodes.map((node) => node.id)).toContain("baseline_silent_letters_spelling");
  });

  it("preserves Reina May 24 planner node order and Word Radar configs", () => {
    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: reinaMay24Plan,
      boardId: "reina-current-homework",
      title: "Reina Current Homework",
      theme,
    });

    expect(board.nodes.map((node) => node.id)).toEqual([
      "start",
      "baseline_silent_letters_spelling",
      "choose-path",
      "baseline_high_frequency_recognition",
      "baseline_spelling_diagnostic",
      "mystery_choice",
      "quest_transfer",
      "boss_mastery",
    ]);
    expect(board.nodes[0].kind).toBe("start");
    expect(board.nodes[1].activityId).toBe("word-radar");
    expect(board.nodes[1].target?.laneId).toBe("silent_letters");
    expect(board.nodes[1].target?.words).toEqual(reinaMay24Plan.nodePlan[0].targets);
    expect(board.nodes[1].wordRadarConfig).toEqual(reinaMay24Plan.nodePlan[0].wordRadarConfig);
    expect(board.nodes[3].target?.laneId).toBe("high_frequency_words");
    expect(board.nodes[3].wordRadarConfig).toEqual(reinaMay24Plan.nodePlan[1].wordRadarConfig);
    expect(board.nodes[6].state).toBe("locked");
    expect(board.nodes[7].state).toBe("locked");
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

    expect(board.nodes.map((node) => node.id)).toEqual(["start", "planner_word_radar", "planner_spell_check"]);
    expect(board.nodes.some((node) => ["mystery", "quest", "boss"].includes(node.kind))).toBe(false);
    expect(board.choiceSets ?? []).toHaveLength(0);
    expect(board.edges.map((edge) => [edge.from, edge.to])).toEqual([
      ["start", "planner_word_radar"],
      ["planner_word_radar", "planner_spell_check"],
    ]);
  });

  it("creates a real baseline route choice when two launchable route nodes exist", () => {
    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: reinaMay24Plan,
      boardId: "route-choice-board",
      title: "Reina Current Homework",
      theme,
    });

    const choiceGate = board.nodes.find((node) => node.kind === "choice-gate");
    const routeChoiceSet = board.choiceSets?.find((choiceSet) => choiceSet.kind === "baseline-route");
    const optionNodeIds = routeChoiceSet?.options.map((option) => option.nodeId);

    expect(choiceGate).toMatchObject({
      id: "choose-path",
      action: { type: "open-choice-set", payloadId: "baseline-route-options" },
      choiceSetId: "baseline-route-options",
    });
    expect(routeChoiceSet?.options).toHaveLength(2);
    expect(optionNodeIds).toEqual([
      "baseline_high_frequency_recognition",
      "baseline_spelling_diagnostic",
    ]);
    expect(board.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "baseline_silent_letters_spelling", to: "choose-path" }),
      expect.objectContaining({ from: "choose-path", to: "baseline_high_frequency_recognition" }),
      expect.objectContaining({ from: "choose-path", to: "baseline_spelling_diagnostic" }),
      expect.objectContaining({ from: "baseline_high_frequency_recognition", to: "mystery_choice" }),
      expect.objectContaining({ from: "baseline_spelling_diagnostic", to: "mystery_choice" }),
    ]));
    expect(board.progress?.activeChoiceSetId).toBe("baseline-route-options");
  });

  it("materializes explicit planner learning routes as named clickable choices", () => {
    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: {
        planId: "route-prescription-plan",
        childId: "reina",
        domain: "spelling",
        nodePlan: [
          {
            id: "baseline-silent-radar",
            type: "word-radar",
            activityId: "word-radar",
            targets: ["sign", "know", "write"],
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
            id: "baseline-hfw-spell",
            type: "spell-check",
            activityId: "spell-check",
            targets: ["among", "building", "circle"],
            targetLane: "high_frequency_words",
            locked: false,
          },
          {
            id: "route-pattern-showdown",
            type: "spell-check",
            activityId: "spell-check",
            targets: ["know", "knock", "knife"],
            targetLane: "silent_letters",
            locked: false,
          },
          {
            id: "route-champion-speed",
            type: "word-radar",
            activityId: "word-radar",
            targets: ["among", "building", "special"],
            targetLane: "high_frequency_words",
            locked: false,
            wordRadarConfig: {
              recallMode: "hidden_word_recall",
              inputMode: "keyboard",
              speakStyle: "option-a",
              showTimer: true,
              hideWordDuringResponse: true,
              requiresCapturedResponse: true,
            },
          },
          {
            id: "mystery-choice",
            type: "mystery",
            activityId: "mystery",
            targets: ["sign", "know", "among"],
            locked: false,
          },
          {
            id: "quest-transfer",
            type: "quest",
            activityId: "quest",
            targets: [],
            locked: true,
            masteryUnlockState: "preparing",
          },
          {
            id: "boss-mastery",
            type: "boss",
            activityId: "boss",
            targets: [],
            locked: true,
            masteryUnlockState: "preparing",
          },
        ],
        learningRoutes: [
          {
            id: "pattern-boss-path",
            label: "Pattern Boss Path",
            rationale: "Reina gets a direct strategy challenge for silent-letter patterns.",
            nodeIds: ["route-pattern-showdown"],
          },
          {
            id: "champion-speed-path",
            label: "Champion Speed Path",
            rationale: "Reina gets a competitive speed path for confident words.",
            nodeIds: ["route-champion-speed"],
          },
        ],
      } as never,
      boardId: "route-prescription-board",
      theme,
    });

    const routeChoice = board.choiceSets?.find((set) => set.id === "baseline-route-options");

    expect(board.nodes.map((node) => node.id)).toContain("choose-path");
    expect(routeChoice?.options).toEqual([
      expect.objectContaining({
        id: "choice-pattern-boss-path",
        label: "Pattern Boss Path",
        description: "Reina gets a direct strategy challenge for silent-letter patterns.",
        nodeId: "route-pattern-showdown",
        state: "available",
      }),
      expect.objectContaining({
        id: "choice-champion-speed-path",
        label: "Champion Speed Path",
        description: "Reina gets a competitive speed path for confident words.",
        nodeId: "route-champion-speed",
        state: "available",
      }),
    ]);
    expect(board.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "choose-path", to: "route-pattern-showdown" }),
      expect.objectContaining({ from: "choose-path", to: "route-champion-speed" }),
    ]));
  });

  it("does not turn shared baseline nodes into duplicate explicit route choices", () => {
    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: {
        planId: "plan-shared-routes",
        childId: "reina",
        domain: "spelling",
        nodePlan: [
          {
            id: "baseline-scan",
            type: "word-radar",
            activityId: "word-radar",
            targets: ["sign"],
            targetLane: "silent_letters",
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
            id: "route-a-spell",
            type: "spell-check",
            activityId: "spell-check",
            targets: ["sign"],
            targetLane: "silent_letters",
          },
          {
            id: "route-b-rush",
            type: "letter-rush",
            activityId: "letter-rush",
            targets: ["sign"],
            targetLane: "silent_letters",
          },
          { id: "mystery", type: "mystery", activityId: "mystery", targets: ["sign"] },
          { id: "quest", type: "quest", activityId: "quest", targets: ["sign"], locked: true },
          { id: "boss", type: "boss", activityId: "boss", targets: [], locked: true },
        ],
        learningRoutes: [
          {
            id: "precision-route",
            label: "Precision Route",
            rationale: "Shared scan, then spelling proof.",
            nodeIds: ["baseline-scan", "route-a-spell", "mystery", "quest", "boss"],
          },
          {
            id: "speed-route",
            label: "Speed Route",
            rationale: "Shared scan, then speed challenge.",
            nodeIds: ["baseline-scan", "route-b-rush", "mystery", "quest", "boss"],
          },
        ],
      },
      boardId: "board-shared-routes",
      theme,
    });

    const choiceSet = board.choiceSets?.find((set) => set.id === "baseline-route-options");

    expect(board.nodes.find((node) => node.id === "baseline-scan")?.layout?.role).toBe("baseline");
    expect(choiceSet?.options.map((option) => ({ id: option.id, label: option.label, nodeId: option.nodeId }))).toEqual([
      { id: "choice-precision-route", label: "Precision Route", nodeId: "route-a-spell" },
      { id: "choice-speed-route", label: "Speed Route", nodeId: "route-b-rush" },
    ]);
  });

  it("canonicalizes full-journey planner routes into baseline, route choices, then destinations", () => {
    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: {
        planId: "plan-full-journey-routes",
        childId: "reina",
        domain: "spelling",
        nodePlan: [
          {
            id: "node-baseline-sl",
            type: "word-radar",
            activityId: "word-radar",
            targets: ["sign"],
            targetLane: "silent_letters",
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
            id: "node-baseline-hfw",
            type: "word-radar",
            activityId: "word-radar",
            targets: ["among"],
            targetLane: "high_frequency_words",
            wordRadarConfig: {
              recallMode: "visible_read",
              inputMode: "whole-word",
              speakStyle: "option-a",
              showTimer: false,
              hideWordDuringResponse: false,
              requiresCapturedResponse: true,
            },
          },
          { id: "node-route-a-spell", type: "spell-check", activityId: "spell-check", targets: ["sign"], targetLane: "silent_letters" },
          { id: "node-route-b-pronunciation", type: "pronunciation", activityId: "pronunciation", targets: ["among"], targetLane: "high_frequency_words" },
          { id: "node-mystery", type: "mystery", activityId: "mystery", targets: ["sign", "among"] },
          { id: "node-quest", type: "quest", activityId: "quest", targets: ["sign"], locked: true, masteryUnlockState: "preparing" },
          { id: "node-boss", type: "boss", activityId: "boss", targets: [], locked: true, masteryUnlockState: "preparing" },
        ],
        learningRoutes: [
          {
            id: "spell-route",
            label: "Spell Route",
            rationale: "The planner described the whole journey, but only spell-check is the route choice.",
            nodeIds: ["node-baseline-sl", "node-route-a-spell", "node-mystery", "node-quest", "node-boss"],
          },
          {
            id: "read-route",
            label: "Read Route",
            rationale: "The planner described the whole journey, but only pronunciation is the route choice.",
            nodeIds: ["node-baseline-hfw", "node-route-b-pronunciation", "node-mystery", "node-quest", "node-boss"],
          },
        ],
      },
      boardId: "board-full-journey-routes",
      theme,
    });

    const choiceSet = board.choiceSets?.find((set) => set.id === "baseline-route-options");

    expect(board.nodes.map((node) => node.id)).toEqual([
      "start",
      "node-baseline-sl",
      "node-baseline-hfw",
      "choose-path",
      "node-route-a-spell",
      "node-route-b-pronunciation",
      "node-mystery",
      "node-quest",
      "node-boss",
    ]);
    expect(board.nodes.find((node) => node.id === "node-baseline-sl")?.layout?.role).toBe("baseline");
    expect(board.nodes.find((node) => node.id === "node-baseline-hfw")?.layout?.role).toBe("baseline");
    expect(choiceSet?.options.map((option) => ({ label: option.label, nodeId: option.nodeId }))).toEqual([
      { label: "Spell Route", nodeId: "node-route-a-spell" },
      { label: "Read Route", nodeId: "node-route-b-pronunciation" },
    ]);
    expect(board.nodes.find((node) => node.id === "node-route-a-spell")?.slot).toBe("5a.1");
    expect(board.nodes.find((node) => node.id === "node-route-b-pronunciation")?.slot).toBe("5b.1");
    expect(board.nodes.find((node) => node.id === "node-mystery")?.slot).toBe("6");
    expect(board.nodes.some((node) => node.slot === "5c.1" || node.slot === "5c.2")).toBe(false);
  });


  it("prefers the locked mastery-gated node when two quest-typed nodes exist", () => {
    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: {
        planId: "plan-dual-quest",
        childId: "demo-pashley",
        domain: "math",
        nodePlan: [
          { id: "baseline", type: "generated-baseline", activityId: "generated-baseline", targets: ["5x2"], targetLane: "multiplication" },
          { id: "route-quest-prep", type: "quest", activityId: "quest", targets: ["5x5"], targetLane: "multiplication", locked: false },
          { id: "mystery", type: "mystery", activityId: "mystery", targets: ["5x2"] },
          { id: "real-quest", type: "quest", activityId: "quest", targets: [], locked: true, masteryUnlockState: "preparing" },
          { id: "boss", type: "boss", activityId: "boss", targets: [], locked: true },
        ],
      },
      boardId: "board-dual-quest",
      theme,
    });

    const questNodes = board.nodes.filter((node) => node.kind === "quest");
    expect(questNodes.map((node) => node.id)).toEqual(["real-quest"]);
    expect(questNodes[0]?.state).toBe("locked");
  });

  it("keeps excess unique route nodes out of the cramped middle route lane", () => {
    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: {
        planId: "plan-route-overflow",
        childId: "ila",
        domain: "spelling",
        nodePlan: [
          { id: "baseline", type: "word-radar", activityId: "word-radar", targets: ["sign"], targetLane: "silent_letters" },
          { id: "route-a-primary", type: "spell-check", activityId: "spell-check", targets: ["sign"], targetLane: "silent_letters" },
          { id: "route-a-extra", type: "letter-rush", activityId: "letter-rush", targets: ["write"], targetLane: "silent_letters" },
          { id: "route-b-primary", type: "pronunciation", activityId: "pronunciation", targets: ["among"], targetLane: "high_frequency_words" },
          { id: "route-b-extra", type: "monster-stampede", activityId: "monster-stampede", targets: ["know"], targetLane: "silent_letters" },
          { id: "route-c-extra", type: "word-radar", activityId: "word-radar", targets: ["circle"], targetLane: "high_frequency_words" },
          { id: "mystery", type: "mystery", activityId: "mystery", targets: ["sign"] },
          { id: "quest", type: "quest", activityId: "quest", targets: ["sign"], locked: true },
          { id: "boss", type: "boss", activityId: "boss", targets: [], locked: true },
        ],
        learningRoutes: [
          { id: "route-a", label: "Route A", rationale: "First route has extra same-route work.", nodeIds: ["baseline", "route-a-primary", "route-a-extra", "mystery"] },
          { id: "route-b", label: "Route B", rationale: "Second route has extra same-route work.", nodeIds: ["baseline", "route-b-primary", "route-b-extra", "mystery"] },
          { id: "route-c", label: "Route C", rationale: "Third route should not be forced into Mystery's space.", nodeIds: ["baseline", "route-c-extra", "mystery"] },
        ],
      },
      boardId: "board-route-overflow",
      theme,
    });

    const choiceSet = board.choiceSets?.find((set) => set.id === "baseline-route-options");

    expect(choiceSet?.options.map((option) => option.nodeId)).toEqual(["route-a-primary", "route-b-primary"]);
    expect(board.nodes.some((node) => node.slot === "5c.1" || node.slot === "5c.2")).toBe(false);
    expect(board.nodes.find((node) => node.id === "route-a-extra")?.slot).toBe("5a.2");
    expect(board.nodes.find((node) => node.id === "route-b-extra")?.slot).toBe("5b.2");
    expect(board.nodes.find((node) => node.id === "route-c-extra")).toBeUndefined();
  });

  it("names generated-baseline and concept-check nodes after the concept, not the engine", () => {
    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: {
        planId: "plan-math-labels",
        childId: "demo-pashley",
        domain: "math",
        nodePlan: [
          { id: "n-thirds", type: "generated-baseline", activityId: "generated-baseline", targets: ["shade_one_third_rectangle"], targetLane: "fraction_shade_thirds" },
          { id: "n-fourths", type: "generated-baseline", activityId: "generated-baseline", targets: ["shade_one_fourth_circle"], targetLane: "fraction_shade_fourths" },
          { id: "n-compare", type: "concept-check", activityId: "concept-check", targets: ["compare_one_third_vs_one_fourth"], targetLane: "fraction_compare" },
          { id: "n-target-only", type: "generated-baseline", activityId: "generated-baseline", targets: ["shade_one_third_rectangle"] },
          { id: "n-bare", type: "generated-baseline", activityId: "generated-baseline", targets: [] },
          { id: "mystery", type: "mystery", activityId: "mystery", targets: ["1/3"] },
          { id: "quest", type: "quest", activityId: "quest", targets: ["1/3"], locked: true },
          { id: "boss", type: "boss", activityId: "boss", targets: [], locked: true },
        ],
      },
      boardId: "board-math-labels",
      theme,
    });

    const labelById = new Map(board.nodes.map((node) => [node.id, node.label]));
    expect(labelById.get("n-thirds")).toBe("Shade Thirds");
    expect(labelById.get("n-fourths")).toBe("Shade Fourths");
    expect(labelById.get("n-compare")).toBe("Fraction Face-Off");
    expect(labelById.get("n-target-only")).toBe("Shade Thirds");
    expect(labelById.get("n-bare")).toBe("Skill Builder");
    expect(board.nodes.some((node) => node.label.toLowerCase().includes("generated baseline"))).toBe(false);

    const thumbById = new Map(board.nodes.map((node) => [node.id, node.thumbnailUrl]));
    expect(thumbById.get("n-thirds")).toBe("/thumbnails/activities/math-shade-thirds.svg");
    expect(thumbById.get("n-fourths")).toBe("/thumbnails/activities/math-shade-fourths.svg");
    expect(thumbById.get("n-compare")).toBe("/thumbnails/activities/math-fraction-compare.svg");
    expect(thumbById.get("n-bare")).toBe("/thumbnails/activities/math-generic.svg");
  });

  it("preserves planner-provided experiment titles on the child-facing board", () => {
    const board = buildAdventureBoardFromActiveSessionPlan({
      plan: {
        planId: "plan-math-experiment-titles",
        childId: "reina",
        domain: "math",
        nodePlan: [
          { id: "facts", type: "generated-baseline", activityId: "generated-baseline", targets: ["5x2"], title: "Fact Blaster" },
          { id: "story", type: "generated-baseline", activityId: "generated-baseline", targets: ["5 pencils in 4 boxes"], title: "Story Solver" },
        ],
      },
      boardId: "board-math-experiment-titles",
      theme,
    });
    expect(board.nodes.find((node) => node.id === "facts")?.label).toBe("Fact Blaster");
    expect(board.nodes.find((node) => node.id === "story")?.label).toBe("Story Solver");
  });
});
