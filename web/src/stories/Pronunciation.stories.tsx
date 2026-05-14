import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useEffect, useState } from "react";
import { PronunciationGameCanvas } from "../components/PronunciationGameCanvas";
import { BaselineQaHarness } from "../storybook/BaselineQaHarness";
import {
  type BaselineFixtureState,
  baselineQaFixtures,
  fixtureStates,
} from "../storybook/baselineQaFixtures";

interface PronunciationStoryArgs {
  state: BaselineFixtureState;
}

const meta: Meta<PronunciationStoryArgs> = {
  title: "Baseline Instruments/Pronunciation",
  parameters: { layout: "fullscreen" },
  argTypes: {
    state: { control: "select", options: fixtureStates },
  },
  args: {
    state: "easy",
  },
};

export default meta;
type Story = StoryObj<PronunciationStoryArgs>;

function PronunciationFixture({ state }: { state: BaselineFixtureState }): React.ReactElement {
  const fixture = baselineQaFixtures.pronunciation[state];
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    if (!/help|support/i.test(transcript)) return;
    window.dispatchEvent(
      new CustomEvent("sunny_pronunciation_support", {
        detail: {
          word: fixture.currentWord,
          chunks: fixture.currentWord === "able" ? ["a", "ble"] : [fixture.currentWord],
          chunked: fixture.currentWord === "able" ? "a-ble" : fixture.currentWord,
          guidance:
            fixture.currentWord === "able"
              ? "Long A, then ble. Say able with me."
              : "One part at a time.",
          mode: "slow",
          durationMs: 3500,
        },
      }),
    );
  }, [fixture.currentWord, transcript]);

  return (
    <BaselineQaHarness
      fixture={fixture}
      transcript={transcript}
      onTranscript={setTranscript}
    >
      <PronunciationGameCanvas
        words={fixture.words}
        replayWords={[...fixture.words, "likely", "messy", "quickly", "rainy"]}
        pronunciationConfig={fixture.pronunciationConfig}
        interimTranscript={transcript}
        sendMessage={(type, payload) => console.info("[storybook:pronunciation]", type, payload)}
        onComplete={(result) => console.info("[storybook:pronunciation:complete]", result)}
        onExit={() => console.info("[storybook:pronunciation:exit]")}
      />
    </BaselineQaHarness>
  );
}

export const Easy: Story = {
  args: { state: "easy" },
  render: (args) => <PronunciationFixture state={args.state} />,
};

export const Medium: Story = {
  args: { state: "medium" },
  render: (args) => <PronunciationFixture state={args.state} />,
};

export const Hard: Story = {
  args: { state: "hard" },
  render: (args) => <PronunciationFixture state={args.state} />,
};

export const Support: Story = {
  args: { state: "support" },
  render: (args) => <PronunciationFixture state={args.state} />,
};

export const Complete: Story = {
  args: { state: "complete" },
  render: (args) => <PronunciationFixture state={args.state} />,
};
