import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  MysteryRewardShowcase,
  type MysteryRewardPhase,
} from "../components/MysteryRewardShowcase";
import cometCapeImage from "./assets/comet-cape.png";

type StoryArgs = {
  initialPhase: MysteryRewardPhase;
  level: number;
  currentXp: number;
  earnedXp: number;
  xpToNextLevel: number;
};

const meta: Meta<StoryArgs> = {
  title: "Reward Encounters/Mystery Reward Ceremony",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Storybook-only variable-reward ceremony. XP is guaranteed and visible. The reward identity stays absent from the DOM until the treasure is opened.",
      },
    },
  },
  argTypes: {
    initialPhase: { control: "select", options: ["xp", "treasure", "reveal"] },
    level: { control: { type: "number", min: 1, max: 99 } },
    currentXp: { control: { type: "number", min: 0 } },
    earnedXp: { control: { type: "number", min: 0 } },
    xpToNextLevel: { control: { type: "number", min: 1 } },
  },
  args: {
    initialPhase: "xp",
    level: 7,
    currentXp: 650,
    earnedXp: 100,
    xpToNextLevel: 800,
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

const cometCape = {
  id: "comet-cape",
  name: "Comet Cape",
  imageSrc: cometCapeImage,
  kind: "companion_cosmetic" as const,
};

function renderCeremony(args: StoryArgs) {
  return (
    <MysteryRewardShowcase
      {...args}
      reward={cometCape}
      onRewardDecision={fn()}
    />
  );
}

export const FullCeremony: Story = {
  name: "1 — Full ceremony",
  render: renderCeremony,
};

export const XpGain: Story = {
  name: "2 — XP earned",
  args: { initialPhase: "xp" },
  render: renderCeremony,
};

export const MysteryTreasure: Story = {
  name: "3 — Mystery treasure",
  args: { initialPhase: "treasure" },
  render: renderCeremony,
};

export const RewardReveal: Story = {
  name: "4 — Reward reveal",
  args: { initialPhase: "reveal" },
  render: renderCeremony,
};
