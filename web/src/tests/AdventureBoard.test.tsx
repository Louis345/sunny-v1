import { fireEvent, render, screen, within } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AdventureBoard, HORIZONTAL_ADVENTURE_SLOTS } from "../components/AdventureBoard";
import { AdventureBoardExperience } from "../components/AdventureBoardExperience";
import {
  buildGrokFullExperienceBoard,
  choicePolicySpineBoard,
  grokFullExperienceBoard,
  reinaCurrentHomeworkBoard,
  buildSlotLabBoard,
} from "../storybook/adventureBoardFixtures";
import adventureBoardStoriesMeta, {
  ReinaChartPacket,
  StressQuestUnlocked,
} from "../stories/AdventureBoard.stories";
import rawHorizontalBoardJson from "../storybook/raw-horizontal-adventure-board.json";
import reinaChartPacketJson from "../storybook/reina-chart-experience-packet.json";
import type { AdventureBoardJson } from "../../../src/shared/adventureBoardJson";
import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import { DEFAULT_ADVENTURE_MAP_PROFILE } from "../../../src/context/schemas/learningProfile";
import { cloneCompanionDefaults } from "../../../src/shared/companionTypes";
import { buildNodeLaunchAction } from "../../../src/shared/homeworkNodeRouting";
import type { NodeConfig } from "../../../src/shared/adventureTypes";
import {
  resolvePlannerBoardChoiceLaunchNode,
  resolvePlannerBoardLaunchNode,
} from "../utils/adventureBoardLaunch";
import {
  buildAdventureBoardChoiceEventInput,
  buildAdventureBoardPostActivityChoiceEventInput,
} from "../utils/adventureBoardChoiceEvents";
import {
  buildAdventureBoardGeneratedChoiceRequest,
  buildAdventureBoardGeneratedChoiceLaunchNode,
} from "../utils/adventureBoardGeneratedChoices";

const rawHorizontalBoard = rawHorizontalBoardJson as AdventureBoardJson;
const reinaChartPacket = reinaChartPacketJson as unknown as ChildExperiencePacket;

vi.mock("../components/CompanionLayer", () => ({
  CompanionLayer: (props: {
    childId: string | null;
    companion: { companionId: string; vrmUrl: string } | null;
    toggledOff: boolean;
    idlePose?: string;
  }) => (
    <div
      data-testid="companion-layer"
      data-child-id={props.childId ?? ""}
      data-companion-id={props.companion?.companionId ?? ""}
      data-vrm-url={props.companion?.vrmUrl ?? ""}
      data-toggled-off={String(props.toggledOff)}
      data-idle-pose={props.idlePose ?? ""}
    />
  ),
}));

function packetForBoard(
  board: AdventureBoardJson,
  overrides: Partial<ChildExperiencePacket["childChart"]["adventureMapProfile"]> = {},
): ChildExperiencePacket {
  const companion = {
    ...cloneCompanionDefaults(),
    companionId: "matilda",
    vrmUrl: "/companions/matilda.vrm",
    toggledOff: false,
  };

  return {
    childChart: {
      childId: board.childId,
      identity: {
        displayName: "Reina",
        ttsName: "Ray-nah",
      },
      companion: {
        id: "matilda",
        displayName: "Matilda",
        config: companion,
      },
      companionCare: {
        plan: {},
        view: {
          childId: board.childId,
          companionId: "matilda",
          displayName: "Matilda",
        },
        filePath: "",
        existed: false,
      } as ChildExperiencePacket["childChart"]["companionCare"],
      economy: {
        coinBalance: 0,
      },
      adventureMapProfile: {
        ...DEFAULT_ADVENTURE_MAP_PROFILE,
        ...overrides,
      },
    },
    activeSessionPlan: {
      planId: board.planId,
      childId: board.childId,
      createdAt: "2026-05-26T00:00:00.000Z",
      source: "ingest_human_loop",
      domain: board.domain,
      testDate: null,
      nodePlan: [],
      adventureBoard: board,
      variationPolicy: {
        avoidExactPreviousNodeOrder: true,
        avoidExactPreviousWordOrder: true,
        seed: "test",
        previousCompletedNodeCount: 0,
      },
      companionPolicy: {
        companionId: "matilda",
        displayName: "Matilda",
        openingLinePolicy: "silent",
        verbosity: "low",
        maxMicroProbes: 0,
      },
      evidenceUsed: [],
      openQuestions: [],
    },
  };
}

function boardWithSpecialChoice(
  nodeId: "quest" | "boss",
  optionState: "available" | "locked" = "available",
): AdventureBoardJson {
  const choiceSetId = nodeId === "quest" ? "quest-choice" : "boss-choice";
  return {
    ...choicePolicySpineBoard,
    boardId: `test-${nodeId}-${optionState}`,
    nodes: choicePolicySpineBoard.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      const { lock: _lock, ...withoutLock } = node;
      return {
        ...withoutLock,
        state: "available",
        choiceSetId,
      };
    }),
    choiceSets: choicePolicySpineBoard.choiceSets?.map((choiceSet) => {
      if (choiceSet.id !== choiceSetId) return choiceSet;
      return {
        ...choiceSet,
        options: choiceSet.options.map((option) => ({
          ...option,
          state: optionState,
          description: option.description ?? `${option.label} adapts the same target in a different wrapper.`,
          ...(optionState === "locked"
            ? { lock: { reason: "needs-evidence", label: "Needs more evidence" } }
            : {}),
        })),
      };
    }),
  };
}

describe("AdventureBoard", () => {
  it("renders JSON-provided background and node thumbnails", () => {
    const { container } = render(<AdventureBoard board={grokFullExperienceBoard} />);

    const board = container.querySelector(".adventure-board") as HTMLElement | null;
    expect(board?.style.backgroundImage).toContain(
      "/generated/adventure-board-demo/silent-letter-world.jpeg",
    );
    expect(
      container.querySelector(
        'img.adventure-board__node-thumbnail[src="/generated/adventure-board-demo/word-radar.jpeg"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        'img.adventure-board__node-thumbnail[src="/generated/adventure-board-demo/mystery.jpeg"]',
      ),
    ).not.toBeNull();
  });

  it("renders raw JSON slots through the fixed horizontal template", () => {
    const { container } = render(<AdventureBoard board={rawHorizontalBoard} />);
    const wordRadar = screen.getByRole("button", { name: "Know / Write" });
    const boss = screen.getByRole("button", { name: /Boss/ });

    expect(rawHorizontalBoard.nodes.every((node) => node.position == null && node.slot != null)).toBe(true);
    expect(wordRadar).toHaveStyle({ left: "25%" });
    expect(boss).toHaveStyle({ left: "86%" });
    expect(container.querySelectorAll(".adventure-board__edge").length).toBeGreaterThan(0);
  });

  it("maps every horizontal adventure slot to the approved coordinate", () => {
    expect(HORIZONTAL_ADVENTURE_SLOTS).toEqual({
      "1": { x: 0.1, y: 0.82 },
      "2": { x: 0.25, y: 0.7 },
      "3": { x: 0.38, y: 0.56 },
      "4": { x: 0.52, y: 0.56 },
      "5a.1": { x: 0.44, y: 0.3 },
      "5a.2": { x: 0.58, y: 0.26 },
      "5b.1": { x: 0.46, y: 0.76 },
      "5b.2": { x: 0.58, y: 0.72 },
      "5c.1": { x: 0.57, y: 0.48 },
      "5c.2": { x: 0.61, y: 0.52 },
      "6": { x: 0.64, y: 0.46 },
      "7": { x: 0.76, y: 0.34 },
      "8": { x: 0.86, y: 0.18 },
    });
  });

  it("renders slot-based JSON without raw positions", () => {
    const slotBoard = buildSlotLabBoard({ routeShape: "upper" });
    render(<AdventureBoard board={slotBoard} />);

    expect(slotBoard.nodes.every((node) => node.position == null)).toBe(true);
    expect(screen.getByRole("button", { name: "Start" })).toHaveStyle({ left: "10%" });
    expect(screen.getByRole("button", { name: "Light Check" })).toHaveStyle({ left: "44%" });
  });

  it("renders a three-way slot route into Mystery", () => {
    const slotBoard = buildSlotLabBoard({ routeShape: "three-way" });
    render(<AdventureBoard board={slotBoard} />);

    expect(screen.getByRole("button", { name: "Light Check" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Story Spark" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Quick Jump" })).toBeVisible();
    expect(slotBoard.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "choose-path", to: "light-check" }),
        expect.objectContaining({ from: "choose-path", to: "story-spark" }),
        expect.objectContaining({ from: "choose-path", to: "quick-jump" }),
        expect.objectContaining({ from: "quick-jump", to: "mystery" }),
      ]),
    );
  });

  it("keeps slot-only Storybook controls tied to the slot lab", () => {
    expect(adventureBoardStoriesMeta.argTypes?.slotChosenRoute).toMatchObject({
      if: { arg: "scenario", eq: "slotLab" },
    });
    expect(adventureBoardStoriesMeta.argTypes?.routeShape).toMatchObject({
      if: { arg: "scenario", eq: "slotLab" },
    });
    expect(StressQuestUnlocked.args).not.toHaveProperty("slotChosenRoute");
    expect(StressQuestUnlocked.args).not.toHaveProperty("routeShape");
  });

  it("applies slotChosenRoute to the slot lab exclusive routes", () => {
    render(
      <AdventureBoard
        board={buildSlotLabBoard({
          routeShape: "three-way",
          chosenRoute: "5b",
          routeChoiceBehavior: "exclusive",
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Story Spark" })).not.toHaveClass(
      "adventure-board__node--locked",
    );
    expect(screen.getByRole("button", { name: "Light Check, Route not picked" })).toHaveClass(
      "adventure-board__node--locked",
    );
    expect(screen.getByRole("button", { name: "Quick Jump, Route not picked" })).toHaveClass(
      "adventure-board__node--locked",
    );
  });

  it("does not invent coordinates for nodes missing position and slot", () => {
    const boardWithoutStartPositionOrSlot: AdventureBoardJson = {
      ...rawHorizontalBoard,
      nodes: rawHorizontalBoard.nodes.map((node) => {
        if (node.id !== "start") return node;
        const { position: _position, slot: _slot, ...withoutPlacement } = node;
        return withoutPlacement;
      }),
    };

    render(<AdventureBoard board={boardWithoutStartPositionOrSlot} />);

    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });

  it("renders optional Verify to Choose Path route only when planner JSON includes it", () => {
    render(<AdventureBoard board={buildGrokFullExperienceBoard({ branchDensity: "none" })} />);

    expect(screen.queryByRole("button", { name: "Light Check" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose Path, Unlocks after current check" })).toBeNull();
  });

  it("disables sibling route nodes for exclusive route choices marked in JSON", () => {
    render(
      <AdventureBoard
        board={buildGrokFullExperienceBoard({
          branchDensity: "two",
          routeChoiceBehavior: "exclusive",
          chosenRoute: "upper",
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Audio Slots, Route not picked" })).toHaveClass(
      "adventure-board__node--locked",
    );
    expect(screen.getByRole("button", { name: "Light Check" })).not.toHaveClass(
      "adventure-board__node--locked",
    );
  });

  it("locks skipped sibling routes after an exclusive board choice", () => {
    const onChoiceClick = vi.fn();
    render(
      <AdventureBoard
        board={reinaCurrentHomeworkBoard}
        onChoiceClick={onChoiceClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Path" }));
    const dialog = screen.getByRole("dialog", { name: "Choose your path" });
    fireEvent.click(within(dialog).getByRole("button", { name: /Pronunciation/ }));

    expect(onChoiceClick).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Pronunciation" }),
      expect.objectContaining({ id: "baseline-route-options" }),
    );
    expect(screen.getByRole("button", { name: "Quick Read, Route not picked" })).toHaveClass(
      "adventure-board__node--locked",
    );
    expect(screen.getByRole("button", { name: "Pronunciation" })).not.toHaveClass(
      "adventure-board__node--locked",
    );
  });

  it("builds preference-only choice evidence from planner board route options", () => {
    const packet = packetForBoard(reinaCurrentHomeworkBoard);
    const choiceSet = reinaCurrentHomeworkBoard.choiceSets?.find(
      (set) => set.id === "baseline-route-options",
    );
    const option = choiceSet?.options.find((candidate) => candidate.label === "Pronunciation");

    expect(choiceSet).toBeDefined();
    expect(option).toBeDefined();
    const event = buildAdventureBoardChoiceEventInput(packet, choiceSet!, option!, {
      createdAt: "2026-05-27T12:00:00.000Z",
    });

    expect(event).toMatchObject({
      eventName: "option_selected",
      childId: "reina",
      choiceSetId: "baseline-route-options",
      context: "baseline_route",
      source: "child_choice",
      selectedOptionId: option!.id,
    });
    expect(event.skippedOptionIds).toEqual(
      choiceSet!.options
        .filter((candidate) => candidate.id !== option!.id)
        .map((candidate) => candidate.id),
    );
    expect(event.shownOptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        optionId: "choice-baseline-hf-recognition",
        activityId: "word-radar",
        nodeType: "word-radar",
        preferenceTraits: ["practice", "control"],
      }),
      expect.objectContaining({
        optionId: option!.id,
        activityId: "pronunciation",
        nodeType: "pronunciation",
        preferenceTraits: ["voice", "control"],
      }),
    ]));
  });

  it("builds post-activity engagement evidence from planner board launches", () => {
    const packet = packetForBoard(reinaCurrentHomeworkBoard);
    const node: NodeConfig = {
      id: "word-radar-baseline",
      type: "word-radar",
      isLocked: false,
      isCompleted: true,
      isGoal: false,
      difficulty: 1,
    };

    const replayEvent = buildAdventureBoardPostActivityChoiceEventInput(
      packet,
      node,
      "replay_same",
      {
        completed: true,
        accuracy: 0.88,
        activePlayTime_ms: 31_000,
        frustrationScore: 0.1,
      },
      { createdAt: "2026-05-27T12:05:00.000Z" },
    );
    const backEvent = buildAdventureBoardPostActivityChoiceEventInput(
      packet,
      node,
      "back_to_map",
      {
        completed: true,
        accuracy: 0.88,
        activePlayTime_ms: 31_000,
        frustrationScore: 0.1,
      },
      { createdAt: "2026-05-27T12:06:00.000Z" },
    );

    expect(replayEvent).toMatchObject({
      eventName: "replay_requested",
      postActivityAction: "replay_same",
      context: "homework_required",
      selectedOptionId: "word-radar-baseline:word-radar",
      completed: true,
      replayRequested: true,
      accuracy: 0.88,
    });
    expect(backEvent).toMatchObject({
      eventName: "activity_completed",
      postActivityAction: "back_to_map",
      completed: true,
      replayRequested: false,
    });
  });

  it("keeps sibling routes available for parallel route choices", () => {
    render(
      <AdventureBoard
        board={buildGrokFullExperienceBoard({
          branchDensity: "two",
          routeChoiceBehavior: "parallel",
          chosenRoute: "upper",
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Audio Slots" })).not.toHaveClass(
      "adventure-board__node--locked",
    );
  });

  it("renders JSON-provided choice thumbnails inside the choice modal", () => {
    const { container } = render(<AdventureBoard board={grokFullExperienceBoard} />);

    fireEvent.click(screen.getByRole("button", { name: "Mystery" }));

    expect(
      container.querySelector(
        'img[src="/thumbnails/activities/karaoke.svg"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        'img[src="/thumbnails/activities/speed-catcher.svg"]',
      ),
    ).not.toBeNull();
  });

  it("opens Quest wrapper choices in the shared card modal when Quest is available", () => {
    render(<AdventureBoard board={boardWithSpecialChoice("quest")} />);

    fireEvent.click(screen.getByRole("button", { name: "Quest" }));

    const modal = screen.getByTestId("adventure-choice-modal");
    expect(modal).toHaveAttribute("data-choice-kind", "quest-wrapper");
    expect(within(modal).getAllByTestId("adventure-choice-card")).toHaveLength(3);
    expect(within(modal).getByRole("button", { name: /Story Quest/ })).not.toBeDisabled();
  });

  it("opens Boss wrapper choices in the shared card modal when Boss is available", () => {
    render(<AdventureBoard board={boardWithSpecialChoice("boss")} />);

    fireEvent.click(screen.getByRole("button", { name: "Boss" }));

    const modal = screen.getByTestId("adventure-choice-modal");
    expect(modal).toHaveAttribute("data-choice-kind", "boss-wrapper");
    expect(within(modal).getAllByTestId("adventure-choice-card")).toHaveLength(3);
    expect(within(modal).getByRole("button", { name: /Showdown/ })).not.toBeDisabled();
  });

  it("renders locked Quest and Boss choice cards as disabled cards with visible lock copy", () => {
    render(<AdventureBoard board={boardWithSpecialChoice("quest", "locked")} />);

    fireEvent.click(screen.getByRole("button", { name: "Quest" }));
    const modal = screen.getByTestId("adventure-choice-modal");
    const storyQuest = within(modal).getByRole("button", { name: /Story Quest/ });

    expect(storyQuest).toBeDisabled();
    expect(within(storyQuest).getByText("Locked: Needs more evidence")).toBeVisible();
  });

  it("uses one shared modal/card pattern for Choose Path, Mystery, Quest, and Boss choices", () => {
    const scenarios: Array<{
      board: AdventureBoardJson;
      nodeLabel: string;
      kind: string;
    }> = [
      { board: reinaCurrentHomeworkBoard, nodeLabel: "Choose Path", kind: "baseline-route" },
      { board: grokFullExperienceBoard, nodeLabel: "Mystery", kind: "mystery" },
      { board: boardWithSpecialChoice("quest"), nodeLabel: "Quest", kind: "quest-wrapper" },
      { board: boardWithSpecialChoice("boss"), nodeLabel: "Boss", kind: "boss-wrapper" },
    ];

    for (const scenario of scenarios) {
      const { unmount } = render(<AdventureBoard board={scenario.board} />);
      fireEvent.click(screen.getByRole("button", { name: scenario.nodeLabel }));
      const modal = screen.getByTestId("adventure-choice-modal");
      const cards = within(modal).getAllByTestId("adventure-choice-card");

      expect(modal).toHaveClass("adventure-choice-modal");
      expect(modal).toHaveAttribute("data-choice-kind", scenario.kind);
      expect(cards[0]).toHaveClass("adventure-choice-modal__card");
      expect(within(modal).getByRole("button", { name: "Back to map" })).toBeVisible();
      unmount();
    }
  });

  it("renders real planner boards through the slot template without explicit positions", () => {
    render(<AdventureBoard board={reinaCurrentHomeworkBoard} />);

    expect(reinaCurrentHomeworkBoard.layout?.companionSlot).toBe("right");
    expect(reinaCurrentHomeworkBoard.nodes.some((node) => node.position == null)).toBe(true);
    expect(screen.getByRole("button", { name: /Start/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Letter Recall/ })).toBeVisible();
  });
});

describe("AdventureBoardExperience", () => {
  it("renders the board from the child experience packet", () => {
    render(<AdventureBoardExperience packet={packetForBoard(grokFullExperienceBoard)} />);

    expect(screen.getByRole("button", { name: "Start" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Mystery" })).toBeVisible();
  });

  it("renders the companion from the child chart packet", () => {
    render(<AdventureBoardExperience packet={packetForBoard(grokFullExperienceBoard)} />);

    expect(screen.getByTestId("companion-layer")).toHaveAttribute("data-child-id", "reina");
    expect(screen.getByTestId("companion-layer")).toHaveAttribute("data-companion-id", "matilda");
    expect(screen.getByTestId("companion-layer")).toHaveAttribute("data-vrm-url", "/companions/matilda.vrm");
  });

  it("hides the companion when the story visibility toggle is off", () => {
    render(
      <AdventureBoardExperience
        packet={packetForBoard(grokFullExperienceBoard)}
        showCompanion={false}
      />,
    );

    expect(screen.queryByTestId("companion-layer")).toBeNull();
  });

  it("hides the companion when the child chart reserves no companion slot", () => {
    render(
      <AdventureBoardExperience
        packet={packetForBoard(grokFullExperienceBoard, { companionSlot: "none" })}
      />,
    );

    expect(screen.queryByTestId("companion-layer")).toBeNull();
  });

  it("preserves board node and choice callbacks through the wrapper", () => {
    const nodeClick = vi.fn();
    const choiceClick = vi.fn();
    render(
      <AdventureBoardExperience
        packet={packetForBoard(grokFullExperienceBoard)}
        onNodeClick={nodeClick}
        onChoiceClick={choiceClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mystery" }));
    expect(nodeClick).toHaveBeenCalledWith(expect.objectContaining({ id: "mystery" }));

    fireEvent.click(screen.getByRole("button", { name: /Story Challenge/ }));
    expect(choiceClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "story-challenge" }),
      expect.objectContaining({ id: "dense-mystery-choice" }),
    );
  });

  it("resolves JSON board activity nodes into existing launch actions", () => {
    const board: AdventureBoardJson = {
      ...grokFullExperienceBoard,
      nodes: [
        {
          id: "wr-node",
          kind: "activity",
          activityId: "word-radar",
          label: "Silent Letters",
          state: "available",
          target: {
            laneId: "silent_letters",
            skill: "silent_letters",
            words: ["sign", "know"],
          },
          wordRadarConfig: {
            recallMode: "partial_visual_recall",
            inputMode: "letter-by-letter",
            speakStyle: "option-a",
            showTimer: false,
            hideWordDuringResponse: true,
            requiresCapturedResponse: true,
          },
          action: { type: "launch-activity", payloadId: "wr-node" },
        },
      ],
      edges: [],
      choiceSets: [],
    };
    const packet: ChildExperiencePacket = {
      ...packetForBoard(board),
      activeSessionPlan: {
        ...packetForBoard(board).activeSessionPlan!,
        nodePlan: [
          {
            id: "wr-node",
            type: "word-radar",
            activityId: "word-radar",
            targets: ["sign", "know"],
            difficulty: 2,
            source: "chart_planner",
            targetLane: "silent_letters",
            wordRadarConfig: board.nodes[0].wordRadarConfig as NonNullable<
              ChildExperiencePacket["activeSessionPlan"]
            >["nodePlan"][number]["wordRadarConfig"],
          },
        ],
      },
    };

    const node = resolvePlannerBoardLaunchNode(packet, board.nodes[0]);
    expect(node).toMatchObject({
      id: "wr-node",
      type: "word-radar",
      words: ["sign", "know"],
      targetLane: "silent_letters",
      difficulty: 2,
      wordRadarItems: [
        { display: "sign", acceptedResponses: ["sign"], label: "Spelling" },
        { display: "know", acceptedResponses: ["know"], label: "Spelling" },
      ],
    });

    const action = buildNodeLaunchAction(node!, {
      childId: "reina",
      companion: "matilda",
      isDiagMode: true,
      iframePreviewParam: "free",
    });
    expect(action).toMatchObject({
      kind: "canvas",
      payload: {
        type: "word_radar",
        wordRadarItems: [
          { display: "sign", acceptedResponses: ["sign"], label: "Spelling" },
          { display: "know", acceptedResponses: ["know"], label: "Spelling" },
        ],
      },
    });
  });

  it("lets available route choices launch visually locked target nodes", () => {
    const board: AdventureBoardJson = {
      ...grokFullExperienceBoard,
      nodes: [
        {
          id: "mystery-node",
          kind: "mystery",
          activityId: "mystery",
          label: "Mystery Reward",
          state: "locked",
          action: { type: "open-choice-set", payloadId: "choice-mystery-wrapper" },
          target: {
            laneId: "silent_letters",
            skill: "silent_letters",
            words: ["sign", "know"],
          },
        },
      ],
      edges: [],
      choiceSets: [
        {
          id: "route-choice",
          kind: "baseline-route",
          title: "Choose your path",
          options: [
            {
              id: "route-mystery",
              label: "Mystery",
              state: "available",
              nodeId: "mystery-node",
            },
          ],
        },
      ],
    };
    const packet: ChildExperiencePacket = {
      ...packetForBoard(board),
      activeSessionPlan: {
        ...packetForBoard(board).activeSessionPlan!,
        nodePlan: [
          {
            id: "mystery-node",
            type: "mystery",
            activityId: "mystery",
            targets: ["sign", "know"],
            difficulty: 2,
            source: "chart_planner",
            locked: true,
          },
        ],
      },
    };

    const node = resolvePlannerBoardChoiceLaunchNode(
      packet,
      board.choiceSets![0].options[0],
    );
    expect(node).toMatchObject({
      id: "mystery-node",
      type: "mystery",
      words: ["sign", "know"],
    });
  });

  it("turns Quest wrapper card selection into a validated regenerate request and launch node", () => {
    const board = boardWithSpecialChoice("quest");
    const packet: ChildExperiencePacket = {
      ...packetForBoard(board),
      activeSessionPlan: {
        ...packetForBoard(board).activeSessionPlan!,
        activeHomeworkId: "hw-spelling-smoke",
        createdAt: "2026-05-27T12:00:00.000Z",
        nodePlan: [
          {
            id: "quest",
            type: "quest",
            activityId: "quest",
            targets: ["sign", "know"],
            difficulty: 3,
            source: "chart_planner",
            locked: true,
          },
        ],
        generatedExperienceBriefs: [
          {
            briefId: "quest-story",
            experimentId: "experiment-quest-story",
            kind: "quest",
            title: "Story Quest",
            learningGoal: "Prove spelling transfer.",
            targetSkills: ["spelling recall"],
            targetConcepts: ["silent letters"],
            targetWords: ["sign", "know"],
            engagementHooks: ["story"],
            algorithmTargets: ["retrieval-practice"],
            evidenceUsed: ["baseline"],
            artifactStatus: "brief_only",
            validationRequired: true,
          },
        ],
      },
    };
    const choiceSet = board.choiceSets!.find((set) => set.id === "quest-choice")!;
    const option = choiceSet.options.find((candidate) => candidate.id === "quest-story")!;

    const request = buildAdventureBoardGeneratedChoiceRequest(packet, choiceSet, option);

    expect(request).toMatchObject({
      childId: "reina",
      date: "2026-05-27",
      nodeId: "quest",
      briefId: "quest-story",
      kind: "quest",
    });
    expect(request?.feedback).toContain("Story Quest");

    const launchNode = buildAdventureBoardGeneratedChoiceLaunchNode(packet, request!, {
      ok: true,
      newFile: "quest-quest-story.html",
      contentId: "content-quest-story",
      validationReport: {
        passed: true,
        score: 100,
        failures: [],
        warnings: [],
        attempts: 1,
        validatedAt: "2026-05-27T12:01:00.000Z",
        runtimeValidation: {
          engine: "playwright",
          passed: true,
          screenshotPaths: ["/tmp/quest.png"],
          consoleErrors: [],
          pageErrors: [],
          attemptedTargets: 2,
          completed: true,
          completionPayloads: [{ completed: true }],
          usedValidationHook: true,
        },
      },
    });

    expect(launchNode).toMatchObject({
      id: "quest",
      type: "quest",
      gameFile: "quest-quest-story.html",
      date: "2026-05-27",
      words: ["sign", "know"],
      adaptiveArtifact: {
        contentId: "content-quest-story",
        generationStage: "quest",
        validationStatus: "passed",
      },
    });
    expect(
      buildNodeLaunchAction(launchNode!, {
        childId: "reina",
        companion: "matilda",
        isDiagMode: true,
      }),
    ).toMatchObject({
      kind: "iframe",
      url: expect.stringContaining("/homework/reina/2026-05-27/quest-quest-story.html"),
    });
  });

  it("renders a serialized Reina chart packet with Matilda and an active board", () => {
    expect(reinaChartPacket.childChart.childId).toBe("reina");
    expect(reinaChartPacket.childChart.companion.id).toBe("matilda");
    expect(reinaChartPacket.childChart.companion.config.companionId).toBe("matilda");
    expect(reinaChartPacket.childChart.adventureMapProfile.companionSlot).toBe("right");
    expect(reinaChartPacket.activeSessionPlan?.adventureBoard?.nodes.length).toBeGreaterThan(0);

    render(<AdventureBoardExperience packet={reinaChartPacket} />);

    expect(screen.getByTestId("companion-layer")).toHaveAttribute("data-child-id", "reina");
    expect(screen.getByTestId("companion-layer")).toHaveAttribute("data-companion-id", "matilda");
    expect(screen.getByRole("button", { name: "Start" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Mystery" })).toBeVisible();
  });

  it("exports a Reina chart packet Storybook story", () => {
    expect(ReinaChartPacket.render).toBeTypeOf("function");
  });

  it("keeps Storybook from bypassing the child experience packet for companion identity", () => {
    const source = readFileSync(
      resolve(__dirname, "../stories/AdventureBoard.stories.tsx"),
      "utf8",
    );

    expect(source).not.toContain("COMPANION_MANIFEST");
    expect(source).not.toContain("mergeCompanionConfigWithDefaults");
  });

  it("wires the app board callbacks into the planner board launch path", () => {
    const source = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");

    expect(source).toContain("resolvePlannerBoardLaunchNode");
    expect(source).toContain("resolvePlannerBoardChoiceLaunchNode");
    expect(source).toContain("setPlannerBoardLaunch");
    expect(source).not.toContain('console.log(" 🎮 [AdventureBoard] node_click"');
  });

  it("uses the app companion layer instead of rendering a second board companion", () => {
    const source = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");

    expect(source).toContain("showCompanion={false}");
    expect(source).not.toContain("showCompanion\n            idlePose");
  });

  it("keeps live homework from falling through to the legacy AdventureMap", () => {
    const source = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    const runtimeBranch = source.slice(
      source.indexOf("if (plannerBoardRuntimeRequested && adventureChildId)"),
      source.indexOf("} else if (state.phase === \"picker\")"),
    );

    expect(source).toContain("homeworkBoardUnavailable");
    expect(runtimeBranch).toContain("plannerBoardRuntimeRequested");
    expect(runtimeBranch).toContain("AdventureBoardExperience");
    expect(runtimeBranch).toContain("homeworkBoardUnavailable");
    expect(runtimeBranch).not.toContain("<AdventureMap");
    expect(source).toContain(
      "Human-caught invariant: Storybook proves the JSON board can render, but only the live App branch can prove old-board fallback is gone.",
    );
  });

  it("removes the legacy AdventureMap frontend while keeping SlotMachine logged for rehome", () => {
    const appSource = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    const pmLog = readFileSync(resolve(__dirname, "../../../SUNNY_PM.md"), "utf8");
    const childConfig = readFileSync(resolve(__dirname, "../../../children.config.json"), "utf8");

    expect(existsSync(resolve(__dirname, "../components/AdventureMap.tsx"))).toBe(false);
    expect(existsSync(resolve(__dirname, "../components/AdventureMap.css"))).toBe(false);
    expect(existsSync(resolve(__dirname, "../components/SlotMachineOverlay.tsx"))).toBe(true);
    expect(existsSync(resolve(__dirname, "../utils/childQuestConfig.ts"))).toBe(false);
    expect(appSource).not.toContain("./components/AdventureMap");
    expect(appSource).not.toContain("<AdventureMap");
    expect(childConfig).not.toContain("questUnlocked");
    expect(pmLog).toContain("T011 - Rehome Slot Machine Variable Reward");
    expect(pmLog).toContain("Do not keep the old AdventureMap alive for this component.");
  });
});
