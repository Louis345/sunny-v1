import { describe, expect, it } from "vitest";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";
import {
  validateBoardActivityCatalogReferences,
  validateBoardChoices,
  validateBoardGraph,
  validateAdventureBoardJson,
  validateBoardVisualContract,
} from "../shared/adventureBoardValidation";

const theme: AdventureBoardJson["theme"] = {
  background: { type: "solid", value: "#123" },
  palette: {
    path: "#fff",
    completed: "#2f9f6f",
    available: "#7058f4",
    locked: "#aeb7c2",
    current: "#ef9825",
    preview: "#d5dde5",
    text: "#ffffff",
    panel: "rgba(21, 31, 50, 0.80)",
  },
};

function board(overrides: Partial<AdventureBoardJson> = {}): AdventureBoardJson {
  return {
    schemaVersion: 1,
    boardId: "planner-board",
    planId: "assignment-plan",
    childId: "reina",
    domain: "spelling",
    theme,
    layout: {
      preset: "horizontal-adventure-spine",
      companionSlot: "right",
      routeChoiceBehavior: "exclusive",
    },
    nodes: [
      {
        id: "baseline_spelling_diagnostic",
        kind: "activity",
        activityId: "spell-check",
        label: "Verify",
        state: "completed",
        evidenceRole: "baseline",
      },
      {
        id: "choice_after_verify",
        kind: "choice-gate",
        label: "Choose Path",
        state: "available",
        choiceSetId: "after-verify-route-options",
        evidenceRole: "preference",
      },
      {
        id: "light_check",
        kind: "activity",
        activityId: "word-radar",
        label: "Light Check",
        state: "available",
        evidenceRole: "baseline",
      },
      {
        id: "story_spark",
        kind: "reward",
        label: "Story Spark",
        state: "available",
        evidenceRole: "preference",
      },
      {
        id: "mystery_choice",
        kind: "mystery",
        activityId: "mystery",
        label: "Mystery",
        state: "available",
        choiceSetId: "mystery-options",
        evidenceRole: "preference",
      },
    ],
    edges: [
      { id: "e-verify-choice", from: "baseline_spelling_diagnostic", to: "choice_after_verify", state: "completed" },
      { id: "e-choice-light", from: "choice_after_verify", to: "light_check", state: "available" },
      { id: "e-light-mystery", from: "light_check", to: "mystery_choice", state: "available" },
      { id: "e-choice-story", from: "choice_after_verify", to: "story_spark", state: "available" },
      { id: "e-story-mystery", from: "story_spark", to: "mystery_choice", state: "available" },
    ],
    choiceSets: [
      {
        id: "after-verify-route-options",
        kind: "baseline-route",
        title: "Choose your path",
        options: [
          { id: "light", label: "Light Check", state: "available", nodeId: "light_check" },
          { id: "story", label: "Story Spark", state: "available", nodeId: "story_spark" },
          { id: "mystery", label: "Mystery", state: "available", nodeId: "mystery_choice" },
        ],
      },
      {
        id: "mystery-options",
        kind: "mystery",
        title: "Pick a challenge",
        options: [
          { id: "story", label: "Story", state: "available" },
          { id: "speed", label: "Speed", state: "available" },
          { id: "voice", label: "Voice", state: "available" },
        ],
      },
    ],
    ...overrides,
  };
}

describe("adventure board validation", () => {
  it("fails when an edge endpoint does not exist", () => {
    const issues = validateBoardGraph(board({
      edges: [
        { id: "bad-edge", from: "baseline_spelling_diagnostic", to: "missing_node", state: "available" },
      ],
    }));

    expect(issues).toEqual([expect.objectContaining({ code: "missing_edge_endpoint" })]);
  });

  it("fails when a choice option points to a missing node", () => {
    const valid = board();
    const issues = validateBoardChoices({
      ...valid,
      choiceSets: [
        {
          ...valid.choiceSets![0]!,
          options: [
            { id: "missing", label: "Missing", state: "available", nodeId: "missing_node" },
          ],
        },
      ],
    });

    expect(issues).toEqual([expect.objectContaining({ code: "choice_option_missing_node" })]);
  });

  it("fails academic nodes with unknown activity ids", () => {
    const issues = validateBoardActivityCatalogReferences(board({
      nodes: [
        {
          id: "fake_activity",
          kind: "activity",
          activityId: "fake-game",
          label: "Fake",
          state: "available",
          evidenceRole: "baseline",
        },
      ],
    }), new Set(["word-radar", "spell-check", "mystery", "quest", "boss"]));

    expect(issues).toEqual([expect.objectContaining({ code: "unknown_board_activity_id" })]);
  });

  it("fails fake agency when Verify does not route into Choose Path", () => {
    const valid = board();
    const issues = validateBoardChoices({
      ...valid,
      edges: valid.edges.filter((edge) => edge.id !== "e-verify-choice"),
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "choice_gate_missing_incoming_edge" }),
      ]),
    );
  });

  it("fails baseline route choices that do not identify their destination node", () => {
    const valid = board();
    const issues = validateBoardChoices({
      ...valid,
      choiceSets: [{
        id: "after-verify-route-options",
        kind: "baseline-route",
        title: "Choose your path",
        options: [
          { id: "light", label: "Light Check", state: "available" },
        ],
      }],
    });

    expect(issues).toEqual([expect.objectContaining({ code: "baseline_choice_missing_node" })]);
  });

  it("fails baseline route choices whose destination is not connected back to the adventure spine", () => {
    const valid = board();
    const issues = validateBoardChoices({
      ...valid,
      edges: valid.edges.filter((edge) => edge.id !== "e-light-mystery"),
    });

    expect(issues).toEqual([expect.objectContaining({ code: "baseline_choice_route_disconnected" })]);
  });

  it("fails horizontal spine boards that omit the approved visual contract", () => {
    const badBoard = board();
    badBoard.nodes[0] = {
      ...badBoard.nodes[0]!,
      label: "Start Your Spelling Adventure!",
    };
    const issues = validateBoardVisualContract(badBoard);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "board_background_not_image" }),
        expect.objectContaining({ code: "board_companion_missing" }),
        expect.objectContaining({ code: "board_node_thumbnail_missing" }),
        expect.objectContaining({ code: "board_node_layout_missing" }),
        expect.objectContaining({ code: "board_label_too_long" }),
        expect.objectContaining({ code: "board_choice_art_missing" }),
      ]),
    );
  });

  it("fails horizontal spine boards that put the route choice before baseline evidence", () => {
    const valid = board();
    const issues = validateBoardChoices({
      ...valid,
      edges: [
        { id: "e-start-choice", from: "start", to: "choice_after_verify", state: "available" },
        ...valid.edges.filter((edge) => edge.id !== "e-verify-choice"),
      ],
    });

    expect(issues).toEqual([expect.objectContaining({ code: "choice_gate_missing_baseline_incoming_edge" })]);
  });

  it("accepts a choice gate after a layout-role baseline even when evidenceRole is omitted", () => {
    const valid = board();
    const issues = validateBoardChoices({
      ...valid,
      nodes: valid.nodes.map((node) =>
        node.id === "baseline_spelling_diagnostic"
          ? {
              ...node,
              evidenceRole: undefined,
              layout: { role: "baseline", lane: "main", order: 1 },
            }
          : node,
      ),
    });

    expect(issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "choice_gate_missing_baseline_incoming_edge" }),
      ]),
    );
  });

  it("fails horizontal spine route lanes that skip their first layout order", () => {
    const valid = board();
    const issues = validateBoardVisualContract({
      ...valid,
      nodes: valid.nodes.map((node) =>
        node.id === "light_check"
          ? {
              ...node,
              thumbnailUrl: "/generated/adventure-board-demo/word-radar.jpeg",
              layout: { role: "evidence-route", lane: "upper", order: 3 },
            }
          : {
              ...node,
              thumbnailUrl: "/thumbnails/activities/word-radar.svg",
              layout: { role: node.kind === "choice-gate" ? "choice-gate" : "baseline", order: 1 },
            },
      ),
      theme: {
        ...valid.theme,
        background: { type: "image", value: "/generated/adventure-board-demo/silent-letter-world.jpeg" },
      },
      companion: { id: "matilda", name: "Matilda" },
      choiceSets: valid.choiceSets?.map((choiceSet) => ({
        ...choiceSet,
        options: choiceSet.options.map((option) => ({ ...option, icon: "sparkles" })),
      })),
    });

    expect(issues).toEqual([expect.objectContaining({ code: "board_route_layout_order_gap" })]);
  });

  it("fails horizontal spine baseline lanes that skip their first layout order", () => {
    const valid = board();
    const issues = validateBoardVisualContract({
      ...valid,
      nodes: valid.nodes.map((node) => ({
        ...node,
        thumbnailUrl: "/thumbnails/activities/word-radar.svg",
        layout: {
          role: node.id === "choice_after_verify"
            ? "choice-gate"
            : node.id === "mystery_choice"
              ? "mystery"
              : "baseline",
          lane: "main",
          order: 2,
        },
      })),
      theme: {
        ...valid.theme,
        background: { type: "image", value: "/generated/adventure-board-demo/silent-letter-world.jpeg" },
      },
      companion: { id: "matilda", name: "Matilda" },
      choiceSets: valid.choiceSets?.map((choiceSet) => ({
        ...choiceSet,
        options: choiceSet.options.map((option) => ({ ...option, icon: "sparkles" })),
      })),
    });

    expect(issues).toEqual([expect.objectContaining({ code: "board_baseline_layout_order_gap" })]);
  });

  it("fails horizontal spine boards with a low-contrast planner palette", () => {
    const valid = board();
    const issues = validateBoardVisualContract({
      ...valid,
      theme: {
        ...valid.theme,
        background: { type: "image", value: "/generated/adventure-board-demo/silent-letter-world.jpeg" },
        palette: {
          ...valid.theme.palette,
          path: "#8B7355",
          text: "#212121",
        },
      },
      companion: { id: "matilda", name: "Matilda" },
      nodes: valid.nodes.map((node) => ({
        ...node,
        thumbnailUrl: "/thumbnails/activities/word-radar.svg",
        layout: { role: node.kind === "choice-gate" ? "choice-gate" : "baseline", order: 1 },
      })),
      choiceSets: valid.choiceSets?.map((choiceSet) => ({
        ...choiceSet,
        options: choiceSet.options.map((option) => ({ ...option, icon: "sparkles" })),
      })),
    });

    expect(issues).toEqual([expect.objectContaining({ code: "board_palette_not_approved" })]);
  });

  it("accepts planner-chosen choice counts when every route is connected and explainable", () => {
    const valid = board({
      theme: {
        ...theme,
        background: { type: "image", value: "/generated/adventure-board-demo/silent-letter-world.jpeg" },
      },
      companion: { id: "matilda", name: "Matilda" },
      nodes: board().nodes.map((node) => ({
        ...node,
        thumbnailUrl: "/generated/adventure-board-demo/word-radar.jpeg",
        layout:
          node.id === "choice_after_verify"
            ? { role: "choice-gate", order: 1 }
            : node.id === "light_check"
              ? { role: "evidence-route", lane: "upper", order: 1, routeGroupId: "after-verify-route" }
              : node.id === "story_spark"
                ? { role: "evidence-route", lane: "lower", order: 1, routeGroupId: "after-verify-route" }
                : node.id === "mystery_choice"
                  ? { role: "mystery", order: 1 }
                  : { role: "baseline", lane: "main", order: 1 },
      })),
      choiceSets: [
        {
          id: "after-verify-route-options",
          kind: "baseline-route",
          title: "Choose your path",
          options: [
            { id: "light", label: "Light Check", state: "available", nodeId: "light_check", icon: "radar" },
            { id: "story", label: "Story Spark", state: "available", nodeId: "story_spark", icon: "book" },
          ],
        },
        {
          id: "mystery-options",
          kind: "mystery",
          title: "Pick a challenge",
          options: [
            { id: "story", label: "Story", state: "available", icon: "book" },
          ],
        },
      ],
    });

    expect(validateAdventureBoardJson(
      valid,
      new Set(["word-radar", "spell-check", "mystery", "quest", "boss"]),
    )).toEqual([]);
  });
});
