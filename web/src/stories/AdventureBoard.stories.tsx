import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useMemo } from "react";
import { cloneCompanionDefaults } from "../../../src/shared/companionTypes";
import { DEFAULT_ADVENTURE_MAP_PROFILE } from "../../../src/context/schemas/learningProfile";
import { AdventureBoardExperience } from "../components/AdventureBoardExperience";
import { AdventureBoard } from "../components/AdventureBoard";
import {
  bossReadyBoard,
  buildGrokFullExperienceBoard,
  choicePolicySpineBoard,
  denseSpellingBoard,
  forkMomentBoard,
  grokFullExperienceBoard,
  linearBaselineBoard,
  questLockedBoard,
  reinaCurrentHomeworkBoard,
  buildSlotLabBoard,
  type AdventureBoardBranchDensity,
  type AdventureBoardChosenRoute,
  type AdventureBoardQuestState,
  type AdventureBoardSlotChosenRoute,
  type AdventureBoardSlotRouteShape,
} from "../storybook/adventureBoardFixtures";
import rawHorizontalBoardJson from "../storybook/raw-horizontal-adventure-board.json";
import reinaChartPacketJson from "../storybook/reina-chart-experience-packet.json";
import anthropicAdventureBoardJson from "../storybook/anthropic-adventure-board.json";
import type {
  AdventureBoardJson,
  AdventureChoiceOption,
} from "../../../src/shared/adventureBoardJson";
import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import type { CompanionBehavior } from "../context/companionCareBehavior";

type AdventureBoardStoryArgs = {
  scenario:
    | "linear"
    | "fork"
    | "choicePolicy"
    | "questLocked"
    | "bossReady"
    | "dense"
    | "grokFull"
    | "rawJson"
    | "slotLab"
    | "reinaCurrent";
  routeChoiceBehavior: "exclusive" | "parallel";
  branchDensity: AdventureBoardBranchDensity;
  chosenRoute: AdventureBoardChosenRoute;
  routeShape: AdventureBoardSlotRouteShape;
  slotChosenRoute: AdventureBoardSlotChosenRoute;
  questState: AdventureBoardQuestState;
  showCompanion: boolean;
  missingThumbnails: boolean;
  questUnlocked: boolean;
  longLabels: boolean;
};

const boards: Record<AdventureBoardStoryArgs["scenario"], AdventureBoardJson> = {
  linear: linearBaselineBoard,
  fork: forkMomentBoard,
  choicePolicy: choicePolicySpineBoard,
  questLocked: questLockedBoard,
  bossReady: bossReadyBoard,
  dense: denseSpellingBoard,
  grokFull: grokFullExperienceBoard,
  rawJson: rawHorizontalBoardJson as AdventureBoardJson,
  slotLab: buildSlotLabBoard(),
  reinaCurrent: reinaCurrentHomeworkBoard,
};

const reinaChartPacket = reinaChartPacketJson as unknown as ChildExperiencePacket;
const anthropicAdventureBoard = anthropicAdventureBoardJson as AdventureBoardJson;

function playfulAdventureCompanionBehavior(board: AdventureBoardJson): CompanionBehavior {
  return {
    mood: "bright",
    presentationState: "bright",
    low: false,
    emote: "excited",
    intensity: 0.58,
    movementIntensity: 0.9,
    visualTreatment: { filter: "none", opacity: 1 },
    animationEventId: `adventure-board:${board.boardId}`,
  };
}

function childExperiencePacketForBoard(board: AdventureBoardJson): ChildExperiencePacket {
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
      adventureMapProfile: DEFAULT_ADVENTURE_MAP_PROFILE,
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
        seed: board.boardId,
        previousCompletedNodeCount: board.progress?.completedNodeIds.length ?? 0,
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

const meta: Meta<AdventureBoardStoryArgs> = {
  title: "Adventure Board/JSON Renderer",
  parameters: { layout: "fullscreen" },
  argTypes: {
    scenario: {
      control: "select",
      options: Object.keys(boards),
    },
    routeChoiceBehavior: {
      control: "inline-radio",
      options: ["exclusive", "parallel"],
    },
    branchDensity: {
      control: "inline-radio",
      options: ["none", "one", "two"],
    },
    chosenRoute: {
      control: "inline-radio",
      options: ["none", "upper", "lower"],
    },
    routeShape: {
      control: "select",
      options: ["none", "upper", "lower", "middle", "upper+lower", "three-way"],
      if: { arg: "scenario", eq: "slotLab" },
    },
    slotChosenRoute: {
      control: "inline-radio",
      options: ["none", "5a", "5b", "5c"],
      if: { arg: "scenario", eq: "slotLab" },
    },
    questState: {
      control: "inline-radio",
      options: ["locked", "preview", "available"],
      if: { arg: "scenario", eq: "slotLab" },
    },
    showCompanion: { control: "boolean" },
    missingThumbnails: { control: "boolean" },
    questUnlocked: { control: "boolean" },
    longLabels: { control: "boolean" },
  },
  args: {
    scenario: "grokFull",
    routeChoiceBehavior: "exclusive",
    branchDensity: "one",
    chosenRoute: "none",
    routeShape: "upper",
    slotChosenRoute: "none",
    questState: "preview",
    showCompanion: true,
    missingThumbnails: false,
    questUnlocked: false,
    longLabels: false,
  },
};

export default meta;
type Story = StoryObj<AdventureBoardStoryArgs>;

function BoardFixture(args: AdventureBoardStoryArgs): React.ReactElement {
  const board = useMemo(
    () =>
      args.scenario === "grokFull"
        ? buildGrokFullExperienceBoard({
            routeChoiceBehavior: args.routeChoiceBehavior,
            branchDensity: args.branchDensity,
            chosenRoute: args.chosenRoute,
            missingThumbnails: args.missingThumbnails,
            questUnlocked: args.questUnlocked,
            longLabels: args.longLabels,
          })
        : args.scenario === "slotLab"
          ? buildSlotLabBoard({
              routeShape: args.routeShape,
              chosenRoute: args.slotChosenRoute,
              routeChoiceBehavior: args.routeChoiceBehavior,
              questState: args.questState,
              missingThumbnails: args.missingThumbnails,
              longLabels: args.longLabels,
            })
        : boards[args.scenario],
    [
      args.branchDensity,
      args.chosenRoute,
      args.longLabels,
      args.missingThumbnails,
      args.questState,
      args.questUnlocked,
      args.routeChoiceBehavior,
      args.routeShape,
      args.scenario,
      args.showCompanion,
      args.slotChosenRoute,
    ],
  );

  const packet = useMemo(() => childExperiencePacketForBoard(board), [board]);

  const handleChoiceClick = (option: AdventureChoiceOption) => {
    console.info("[storybook:adventure-board:choice]", option);
  };

  return (
    <AdventureBoardExperience
      packet={packet}
      showCompanion={args.showCompanion}
      idlePose="center"
      companionBehavior={playfulAdventureCompanionBehavior(board)}
      onNodeClick={(node) => console.info("[storybook:adventure-board:node]", node)}
      onChoiceClick={handleChoiceClick}
    />
  );
}

export const Playground: Story = {
  render: (args) => <BoardFixture {...args} />,
};

export const LinearBaseline: Story = {
  args: { scenario: "linear" },
  render: (args) => <BoardFixture {...args} />,
};

export const ForkMoment: Story = {
  args: { scenario: "fork" },
  render: (args) => <BoardFixture {...args} />,
};

export const ChoicePolicySpine: Story = {
  args: { scenario: "choicePolicy" },
  render: (args) => <BoardFixture {...args} />,
};

export const LockedQuest: Story = {
  args: { scenario: "questLocked" },
  render: (args) => <BoardFixture {...args} />,
};

export const BossReady: Story = {
  args: { scenario: "bossReady" },
  render: (args) => <BoardFixture {...args} />,
};

export const DenseSpellingSession: Story = {
  args: { scenario: "dense" },
  render: (args) => <BoardFixture {...args} />,
};

export const GrokFullExperience: Story = {
  args: { scenario: "grokFull" },
  render: (args) => <BoardFixture {...args} />,
};

export const RawJsonContract: Story = {
  args: { scenario: "rawJson" },
  render: (args) => <BoardFixture {...args} />,
};

export const SlotTemplateLab: Story = {
  args: { scenario: "slotLab" },
  render: (args) => <BoardFixture {...args} />,
};

export const ReinaCurrentHomework: Story = {
  args: { scenario: "reinaCurrent" },
  render: (args) => <BoardFixture {...args} />,
};

export const ReinaChartPacket: Story = {
  args: { scenario: "grokFull" },
  render: (args) => {
    const board = reinaChartPacket.activeSessionPlan?.adventureBoard;
    return (
      <AdventureBoardExperience
        packet={reinaChartPacket}
        showCompanion={args.showCompanion}
        idlePose="center"
        companionBehavior={board ? playfulAdventureCompanionBehavior(board) : undefined}
        onNodeClick={(node) => console.info("[storybook:adventure-board:node]", node)}
        onChoiceClick={(option) => console.info("[storybook:adventure-board:choice]", option)}
      />
    );
  },
};

export const AnthropicFixture: Story = {
  args: { scenario: "grokFull" },
  render: (args) => (
    <AdventureBoardExperience
      packet={childExperiencePacketForBoard(anthropicAdventureBoard)}
      showCompanion={args.showCompanion}
      idlePose="center"
      companionBehavior={playfulAdventureCompanionBehavior(anthropicAdventureBoard)}
      onNodeClick={(node) => console.info("[storybook:adventure-board:node]", node)}
      onChoiceClick={(option) => console.info("[storybook:adventure-board:choice]", option)}
    />
  ),
};

export const AnthropicJsonDirect: Story = {
  args: { scenario: "grokFull" },
  render: () => (
    <div style={{ width: "100vw", height: "100vh" }}>
      <AdventureBoard
        board={anthropicAdventureBoard}
        onNodeClick={(node) => console.info("[storybook:adventure-board:node]", node)}
        onChoiceClick={(option) => console.info("[storybook:adventure-board:choice]", option)}
      />
    </div>
  ),
};

export const StressTwoRoutes: Story = {
  args: {
    scenario: "grokFull",
    branchDensity: "two",
    routeChoiceBehavior: "exclusive",
    chosenRoute: "upper",
  },
  render: (args) => <BoardFixture {...args} />,
};

export const StressNoExtraRoute: Story = {
  args: {
    scenario: "grokFull",
    branchDensity: "none",
  },
  render: (args) => <BoardFixture {...args} />,
};

export const StressParallelRoutes: Story = {
  args: {
    scenario: "grokFull",
    branchDensity: "two",
    routeChoiceBehavior: "parallel",
    chosenRoute: "upper",
  },
  render: (args) => <BoardFixture {...args} />,
};

export const StressMissingThumbnails: Story = {
  args: {
    scenario: "grokFull",
    missingThumbnails: true,
  },
  render: (args) => <BoardFixture {...args} />,
};

export const StressLongLabels: Story = {
  args: {
    scenario: "grokFull",
    branchDensity: "two",
    longLabels: true,
  },
  render: (args) => <BoardFixture {...args} />,
};

export const StressQuestUnlocked: Story = {
  args: {
    scenario: "grokFull",
    questUnlocked: true,
    chosenRoute: "upper",
  },
  render: (args) => <BoardFixture {...args} />,
};
