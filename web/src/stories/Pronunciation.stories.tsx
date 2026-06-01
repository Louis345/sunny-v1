import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useEffect, useMemo, useState } from "react";
import { PronunciationGameCanvas } from "../components/PronunciationGameCanvas";
import type { PronunciationNodeConfig } from "../../../src/shared/adventureTypes";
import { BaselineQaHarness } from "../storybook/BaselineQaHarness";
import {
  type BaselineFixtureState,
  baselineQaFixtures,
  fixtureStates,
} from "../storybook/baselineQaFixtures";
import { readPronunciationStoryWordsFromLocation } from "../storybook/pronunciationStoryQueryWords";

type RhythmPreset = "easy" | "medium" | "hard" | "custom";

interface PronunciationStoryArgs {
  state: BaselineFixtureState;
  rhythmPreset?: RhythmPreset;
  durationMs?: number;
  baseBeatMs?: number;
  minBeatMs?: number;
  rampEveryMs?: number;
  rampStepMs?: number;
  targetWords?: string;
  sfxMode?: "scored" | "visual-only";
}

const rhythmPresetConfigs: Record<
  Exclude<RhythmPreset, "custom">,
  Required<
    Pick<
      PronunciationStoryArgs,
      "durationMs" | "baseBeatMs" | "minBeatMs" | "rampEveryMs" | "rampStepMs"
    >
  >
> = {
  easy: {
    durationMs: 60_000,
    baseBeatMs: 1_100,
    minBeatMs: 700,
    rampEveryMs: 10_000,
    rampStepMs: 45,
  },
  medium: {
    durationMs: 45_000,
    baseBeatMs: 950,
    minBeatMs: 520,
    rampEveryMs: 8_000,
    rampStepMs: 60,
  },
  hard: {
    durationMs: 35_000,
    baseBeatMs: 820,
    minBeatMs: 430,
    rampEveryMs: 6_000,
    rampStepMs: 70,
  },
};

const meta: Meta<PronunciationStoryArgs> = {
  title: "Baseline Instruments/Pronunciation",
  parameters: { layout: "fullscreen" },
  argTypes: {
    state: { control: "select", options: fixtureStates },
    rhythmPreset: { control: "select", options: ["easy", "medium", "hard", "custom"] },
    durationMs: { control: { type: "number", min: 5_000, step: 1_000 } },
    baseBeatMs: { control: { type: "number", min: 300, step: 10 } },
    minBeatMs: { control: { type: "number", min: 250, step: 10 } },
    rampEveryMs: { control: { type: "number", min: 1_000, step: 500 } },
    rampStepMs: { control: { type: "number", min: 0, step: 5 } },
    targetWords: { control: "text" },
    sfxMode: { control: "radio", options: ["scored", "visual-only"] },
  },
  args: {
    state: "easy",
    rhythmPreset: "medium",
    durationMs: rhythmPresetConfigs.medium.durationMs,
    baseBeatMs: rhythmPresetConfigs.medium.baseBeatMs,
    minBeatMs: rhythmPresetConfigs.medium.minBeatMs,
    rampEveryMs: rhythmPresetConfigs.medium.rampEveryMs,
    rampStepMs: rhythmPresetConfigs.medium.rampStepMs,
    targetWords: "able, common, behind, carefully, whole",
    sfxMode: "scored",
  },
};

export default meta;
type Story = StoryObj<PronunciationStoryArgs>;

function targetWordsFromText(raw: string | undefined, fallback: string[]): string[] {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const delimiter = /[,\n]/.test(trimmed) ? /[,\n]+/ : /\s+/;
  const words = trimmed
    .split(delimiter)
    .map((word) => word.trim())
    .filter(Boolean);
  return words.length > 0 ? words : fallback;
}

function rhythmArgs(args: PronunciationStoryArgs) {
  const preset =
    args.rhythmPreset && args.rhythmPreset !== "custom"
      ? rhythmPresetConfigs[args.rhythmPreset]
      : undefined;
  return {
    durationMs: preset?.durationMs ?? args.durationMs,
    baseBeatMs: preset?.baseBeatMs ?? args.baseBeatMs,
    minBeatMs: preset?.minBeatMs ?? args.minBeatMs,
    rampEveryMs: preset?.rampEveryMs ?? args.rampEveryMs,
    rampStepMs: preset?.rampStepMs ?? args.rampStepMs,
  };
}

function configForMode(
  base: PronunciationNodeConfig | undefined,
  args: PronunciationStoryArgs,
  mode: "standard" | "rhythm",
): PronunciationNodeConfig | undefined {
  if (!base) return undefined;
  if (mode !== "rhythm") return base;
  return {
    ...base,
    mode: "rhythm",
    ...rhythmArgs(args),
    sfxMode: args.sfxMode ?? "scored",
  };
}

function PronunciationFixture(
  args: PronunciationStoryArgs & { mode?: "standard" | "rhythm" },
): React.ReactElement {
  const { state, mode = "standard" } = args;
  const fixture = baselineQaFixtures.pronunciation[state];
  const queryWords = useMemo(() => readPronunciationStoryWordsFromLocation(), []);
  const words =
    mode === "rhythm"
      ? targetWordsFromText(args.targetWords, fixture.words)
      : queryWords.wordsProvided
        ? queryWords.words
        : fixture.words;
  const replayWords =
    queryWords.replayWordsProvided
      ? queryWords.replayWords
      : [...words, "likely", "messy", "quickly", "rainy"];
  const currentWord = words[0] ?? fixture.currentWord;
  const pronunciationConfig = configForMode(fixture.pronunciationConfig, args, mode);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    if (!/help|support/i.test(transcript)) return;
    window.dispatchEvent(
      new CustomEvent("sunny_pronunciation_support", {
        detail: {
          word: currentWord,
          chunks: currentWord === "able" ? ["a", "ble"] : [currentWord],
          chunked: currentWord === "able" ? "a-ble" : currentWord,
          guidance:
            currentWord === "able"
              ? "Long A, then ble. Say able with me."
              : "One part at a time.",
          mode: "slow",
          durationMs: 3500,
        },
      }),
    );
  }, [currentWord, transcript]);

  function recordPronunciationEvent(type: string, payload?: Record<string, unknown>): void {
    const event = { type, payload, at: new Date().toISOString() };
    const targetWindow = window as typeof window & {
      __sunnyPronunciationEvents?: Array<typeof event>;
    };
    targetWindow.__sunnyPronunciationEvents ??= [];
    targetWindow.__sunnyPronunciationEvents.push(event);
    console.info("[storybook:pronunciation]", type, payload);
  }

  return (
    <BaselineQaHarness
      fixture={{
        ...fixture,
        title: mode === "rhythm" ? "Pronunciation Rhythm Playground" : fixture.title,
        purpose:
          mode === "rhythm"
            ? "Intense one-word reading sprint with adaptive rhythm evidence."
            : fixture.purpose,
        words,
        currentWord,
        completionTranscript: words.join(" "),
        pronunciationConfig,
      }}
      transcript={transcript}
      onTranscript={setTranscript}
    >
      <PronunciationGameCanvas
        words={words}
        replayWords={replayWords}
        pronunciationConfig={pronunciationConfig}
        interimTranscript={transcript}
        sendMessage={recordPronunciationEvent}
        onComplete={(result) => console.info("[storybook:pronunciation:complete]", result)}
        onExit={() => console.info("[storybook:pronunciation:exit]")}
      />
    </BaselineQaHarness>
  );
}

export const Easy: Story = {
  args: { state: "easy" },
  render: (args) => <PronunciationFixture {...args} />,
};

export const Medium: Story = {
  args: { state: "medium" },
  render: (args) => <PronunciationFixture {...args} />,
};

export const Hard: Story = {
  args: { state: "hard" },
  render: (args) => <PronunciationFixture {...args} />,
};

export const Support: Story = {
  args: { state: "support" },
  render: (args) => <PronunciationFixture {...args} />,
};

export const Complete: Story = {
  args: { state: "complete" },
  render: (args) => <PronunciationFixture {...args} />,
};

export const RhythmPlayground: Story = {
  args: {
    state: "medium",
    rhythmPreset: "medium",
    ...rhythmPresetConfigs.medium,
    targetWords: "able, common, behind, carefully, whole",
    sfxMode: "scored",
  },
  render: (args) => <PronunciationFixture {...args} mode="rhythm" />,
};
