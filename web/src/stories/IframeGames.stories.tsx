import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState } from "react";
import {
  BaselineQaHarness,
  IframeInstrumentFrame,
} from "../storybook/BaselineQaHarness";
import {
  type BaselineFixtureState,
  type IframeBaselineActivityId,
  baselineQaFixtures,
  fixtureStates,
} from "../storybook/baselineQaFixtures";

const iframeActivities = ["letter-rush", "spell-check", "monster-stampede"] as const;

interface IframeGamesStoryArgs {
  activityId: IframeBaselineActivityId;
  state: BaselineFixtureState;
}

const meta: Meta<IframeGamesStoryArgs> = {
  title: "Baseline Instruments/Iframe Games",
  parameters: { layout: "fullscreen" },
  argTypes: {
    activityId: { control: "select", options: iframeActivities },
    state: { control: "select", options: fixtureStates },
  },
  args: {
    activityId: "letter-rush",
    state: "easy",
  },
};

export default meta;
type Story = StoryObj<IframeGamesStoryArgs>;

function IframeFixture({
  activityId,
  state,
}: {
  activityId: IframeBaselineActivityId;
  state: BaselineFixtureState;
}): React.ReactElement {
  const fixture = baselineQaFixtures[activityId][state];
  const [transcript, setTranscript] = useState("");
  return (
    <BaselineQaHarness
      fixture={fixture}
      transcript={transcript}
      onTranscript={setTranscript}
    >
      <IframeInstrumentFrame activityId={activityId} state={state} title={fixture.title} />
    </BaselineQaHarness>
  );
}

export const LetterRush: Story = {
  args: { activityId: "letter-rush", state: "medium" },
  render: (args) => <IframeFixture activityId={args.activityId} state={args.state} />,
};

export const SpellCheck: Story = {
  args: { activityId: "spell-check", state: "support" },
  render: (args) => <IframeFixture activityId={args.activityId} state={args.state} />,
};

export const MonsterStampede: Story = {
  args: { activityId: "monster-stampede", state: "hard" },
  render: (args) => <IframeFixture activityId={args.activityId} state={args.state} />,
};

export const CompletionStates: Story = {
  args: { activityId: "monster-stampede", state: "complete" },
  render: (args) => <IframeFixture activityId={args.activityId} state={args.state} />,
};
