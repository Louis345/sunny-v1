import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { AdventureBoard } from "../components/AdventureBoard";
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
    scenario: "fork",
  },
};

export default meta;
type Story = StoryObj<AdventureBoardStoryArgs>;

function BoardFixture({ scenario }: AdventureBoardStoryArgs): React.ReactElement {
  return (
    <AdventureBoard
      board={boards[scenario]}
      onNodeClick={(node) => console.info("[storybook:adventure-board:node]", node)}
      onChoiceClick={(option) => console.info("[storybook:adventure-board:choice]", option)}
    />
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
