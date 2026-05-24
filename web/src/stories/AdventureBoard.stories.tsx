import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useMemo } from "react";
import { mergeCompanionConfigWithDefaults } from "../../../src/shared/companionTypes";
import { COMPANION_MANIFEST } from "../companion/companions.generated";
import { AdventureBoard } from "../components/AdventureBoard";
import { CompanionLayer } from "../components/CompanionLayer";
import {
  bossReadyBoard,
  choicePolicySpineBoard,
  denseSpellingBoard,
  forkMomentBoard,
  linearBaselineBoard,
  questLockedBoard,
} from "../storybook/adventureBoardFixtures";
import type { AdventureBoardJson } from "../../../src/shared/adventureBoardJson";

type AdventureBoardStoryArgs = {
  scenario: "linear" | "fork" | "choicePolicy" | "questLocked" | "bossReady" | "dense";
};

const boards: Record<AdventureBoardStoryArgs["scenario"], AdventureBoardJson> = {
  linear: linearBaselineBoard,
  fork: forkMomentBoard,
  choicePolicy: choicePolicySpineBoard,
  questLocked: questLockedBoard,
  bossReady: bossReadyBoard,
  dense: denseSpellingBoard,
};

const meta: Meta<AdventureBoardStoryArgs> = {
  title: "Adventure Board/JSON Renderer",
  parameters: { layout: "fullscreen" },
  argTypes: {
    scenario: {
      control: "select",
      options: Object.keys(boards),
    },
  },
  args: {
    scenario: "dense",
  },
};

export default meta;
type Story = StoryObj<AdventureBoardStoryArgs>;

function BoardFixture({ scenario }: AdventureBoardStoryArgs): React.ReactElement {
  const board = boards[scenario];
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
        />
      ) : null}
    </>
  );
}

export const Playground: Story = {
  render: (args) => <BoardFixture scenario={args.scenario} />,
};

export const LinearBaseline: Story = {
  args: { scenario: "linear" },
  render: (args) => <BoardFixture scenario={args.scenario} />,
};

export const ForkMoment: Story = {
  args: { scenario: "fork" },
  render: (args) => <BoardFixture scenario={args.scenario} />,
};

export const ChoicePolicySpine: Story = {
  args: { scenario: "choicePolicy" },
  render: (args) => <BoardFixture scenario={args.scenario} />,
};

export const LockedQuest: Story = {
  args: { scenario: "questLocked" },
  render: (args) => <BoardFixture scenario={args.scenario} />,
};

export const BossReady: Story = {
  args: { scenario: "bossReady" },
  render: (args) => <BoardFixture scenario={args.scenario} />,
};

export const DenseSpellingSession: Story = {
  args: { scenario: "dense" },
  render: (args) => <BoardFixture scenario={args.scenario} />,
};
