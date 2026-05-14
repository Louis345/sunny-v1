import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState } from "react";
import { KaraokeReadingCanvas } from "../components/KaraokeReadingCanvas";
import { BaselineQaHarness } from "../storybook/BaselineQaHarness";
import {
  type BaselineFixtureState,
  baselineQaFixtures,
  fixtureStates,
} from "../storybook/baselineQaFixtures";

interface StoryKaraokeStoryArgs {
  state: BaselineFixtureState;
}

const meta: Meta<StoryKaraokeStoryArgs> = {
  title: "Baseline Instruments/Story Karaoke",
  parameters: { layout: "fullscreen" },
  argTypes: {
    state: { control: "select", options: fixtureStates },
  },
  args: {
    state: "easy",
  },
};

export default meta;
type Story = StoryObj<StoryKaraokeStoryArgs>;

function StoryKaraokeFixture({ state }: { state: BaselineFixtureState }): React.ReactElement {
  const fixture = baselineQaFixtures["story-karaoke"][state];
  const [transcript, setTranscript] = useState("");
  return (
    <BaselineQaHarness
      fixture={fixture}
      transcript={transcript}
      onTranscript={setTranscript}
    >
      <KaraokeReadingCanvas
        words={fixture.words}
        interimTranscript={transcript}
        sendMessage={(type, payload) => console.info("[storybook:karaoke]", type, payload)}
        storyTitle={fixture.story?.title}
        storyText={fixture.story?.text}
        previewFinishEnabled
        childId="qa"
      />
    </BaselineQaHarness>
  );
}

export const Easy: Story = {
  args: { state: "easy" },
  render: (args) => <StoryKaraokeFixture state={args.state} />,
};

export const Medium: Story = {
  args: { state: "medium" },
  render: (args) => <StoryKaraokeFixture state={args.state} />,
};

export const Hard: Story = {
  args: { state: "hard" },
  render: (args) => <StoryKaraokeFixture state={args.state} />,
};

export const Support: Story = {
  args: { state: "support" },
  render: (args) => <StoryKaraokeFixture state={args.state} />,
};

export const Complete: Story = {
  args: { state: "complete" },
  render: (args) => <StoryKaraokeFixture state={args.state} />,
};
