import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useMemo } from "react";
import { mergeCompanionConfigWithDefaults } from "../../../src/shared/companionTypes";
import { COMPANION_MANIFEST } from "../companion/companions.generated";
import { AdventureBoard } from "../components/AdventureBoard";
import { CompanionLayer } from "../components/CompanionLayer";
import {
  bossReadyBoard,
  buildGrokFullExperienceBoard,
  choicePolicySpineBoard,
  denseSpellingBoard,
  forkMomentBoard,
  grokFullExperienceBoard,
  linearBaselineBoard,
  questLockedBoard,
  type AdventureBoardBranchDensity,
  type AdventureBoardChosenRoute,
} from "../storybook/adventureBoardFixtures";
import type { AdventureBoardJson } from "../../../src/shared/adventureBoardJson";
import type { CompanionBehavior } from "../context/companionCareBehavior";

type AdventureBoardStoryArgs = {
  scenario:
    | "linear"
    | "fork"
    | "choicePolicy"
    | "questLocked"
    | "bossReady"
    | "dense"
    | "grokFull";
  routeChoiceBehavior: "exclusive" | "parallel";
  branchDensity: AdventureBoardBranchDensity;
  chosenRoute: AdventureBoardChosenRoute;
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
};

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
    missingThumbnails: { control: "boolean" },
    questUnlocked: { control: "boolean" },
    longLabels: { control: "boolean" },
  },
  args: {
    scenario: "grokFull",
    routeChoiceBehavior: "exclusive",
    branchDensity: "one",
    chosenRoute: "none",
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
        : boards[args.scenario],
    [
      args.branchDensity,
      args.chosenRoute,
      args.longLabels,
      args.missingThumbnails,
      args.questUnlocked,
      args.routeChoiceBehavior,
      args.scenario,
    ],
  );
  const companionConfig = useMemo(() => {
    if (!board.companion) return null;
    const entry = COMPANION_MANIFEST.find((item) => item.id === board.companion?.id);
    return mergeCompanionConfigWithDefaults({
      ...(entry?.companionConfig ?? {}),
      companionId: entry?.id ?? board.companion.id,
      vrmUrl: entry?.companionConfig?.vrmUrl ?? entry?.vrmUrl,
      toggledOff: false,
    });
  }, [board]);

  return (
    <>
      <AdventureBoard
        board={board}
        onNodeClick={(node) => console.info("[storybook:adventure-board:node]", node)}
        onChoiceClick={(option) => console.info("[storybook:adventure-board:choice]", option)}
      />
      {companionConfig ? (
        <CompanionLayer
          childId={board.childId}
          companion={companionConfig}
          toggledOff={false}
          mode="full"
          idlePose="center"
          companionBehavior={playfulAdventureCompanionBehavior(board)}
        />
      ) : null}
    </>
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
  },
  render: (args) => <BoardFixture {...args} />,
};
