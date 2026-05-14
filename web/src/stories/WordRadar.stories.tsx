import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState } from "react";
import { WordRadar, type RadarItem } from "../components/WordRadar";
import { BaselineQaHarness } from "../storybook/BaselineQaHarness";
import {
  type BaselineFixtureState,
  baselineQaFixtures,
  fixtureStates,
} from "../storybook/baselineQaFixtures";

interface WordRadarStoryArgs {
  state: BaselineFixtureState;
}

const meta: Meta<WordRadarStoryArgs> = {
  title: "Baseline Instruments/Word Radar",
  parameters: { layout: "fullscreen" },
  argTypes: {
    state: { control: "select", options: fixtureStates },
  },
  args: {
    state: "easy",
  },
};

export default meta;
type Story = StoryObj<WordRadarStoryArgs>;

function radarItems(words: string[]): RadarItem[] {
  return words.map((word) => ({
    display: word,
    acceptedResponses: [word],
    label: "QA spelling",
    subject: "spelling",
  }));
}

function WordRadarFixture({ state }: { state: BaselineFixtureState }): React.ReactElement {
  const fixture = baselineQaFixtures["word-radar"][state];
  const [transcript, setTranscript] = useState("");
  return (
    <BaselineQaHarness
      fixture={fixture}
      transcript={transcript}
      onTranscript={setTranscript}
    >
      <WordRadar
        items={radarItems(fixture.words)}
        interimTranscript={transcript}
        sendMessage={(type, payload) => console.info("[storybook:word-radar]", type, payload)}
        timerSeconds={fixture.wordRadarConfig?.timerSeconds}
        showKeyboard={fixture.wordRadarConfig?.inputMode === "keyboard"}
        inputMode={fixture.wordRadarConfig?.inputMode}
        recallMode={fixture.wordRadarConfig?.recallMode}
        speakStyle={fixture.wordRadarConfig?.speakStyle}
        hideWordDuringResponse={fixture.wordRadarConfig?.hideWordDuringResponse}
        requiresCapturedResponse={fixture.wordRadarConfig?.requiresCapturedResponse}
        personalBests={{}}
        onComplete={(result) => console.info("[storybook:word-radar:complete]", result)}
        autoStart
        childId="qa"
      />
    </BaselineQaHarness>
  );
}

export const Easy: Story = {
  args: { state: "easy" },
  render: (args) => <WordRadarFixture state={args.state} />,
};

export const Medium: Story = {
  args: { state: "medium" },
  render: (args) => <WordRadarFixture state={args.state} />,
};

export const Hard: Story = {
  args: { state: "hard" },
  render: (args) => <WordRadarFixture state={args.state} />,
};

export const Support: Story = {
  args: { state: "support" },
  render: (args) => <WordRadarFixture state={args.state} />,
};

export const Complete: Story = {
  args: { state: "complete" },
  render: (args) => <WordRadarFixture state={args.state} />,
};
