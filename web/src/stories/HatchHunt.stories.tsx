import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  MossyHatchHuntEncounter,
  MOSSY_CHASE_QUESTIONS,
  MOSSY_HATCH_HUNT_QUESTIONS,
} from "../components/HatchHuntEncounter";

export {
  farmPresentationStateFromNativeSelection,
  initialFarmPresentationState,
  MOSSY_CHASE_QUESTIONS,
  MOSSY_HATCH_HUNT_QUESTIONS,
} from "../components/HatchHuntEncounter";

export function MossyHatchHuntDemoStory() {
  return (
    <MossyHatchHuntEncounter
      hatchQuestions={MOSSY_HATCH_HUNT_QUESTIONS}
      chaseQuestions={MOSSY_CHASE_QUESTIONS}
      testMode
    />
  );
}

const meta: Meta = {
  title: "Reward Encounters/Hatch Hunt",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "A continuous Three.js learning encounter: hatch Mossy, follow her through Whispering Grove, charge three orbs with bounded support, capture her, then choose whether to visit Sunny Farm.",
      },
    },
  },
};

export default meta;
type Story = StoryObj;

export const MossyWhisperingGrove: Story = {
  render: () => (
    <MossyHatchHuntEncounter
      hatchQuestions={MOSSY_HATCH_HUNT_QUESTIONS}
      chaseQuestions={MOSSY_CHASE_QUESTIONS}
      testMode
    />
  ),
};
