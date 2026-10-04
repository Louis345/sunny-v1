import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CompanionCommand } from "../../../src/shared/companions/companionContract";
import { LevelPathExperience } from "../components/LevelPathExperience";

const progression = {
  childId: "reina",
  level: 3,
  currentXP: 45,
  xpToNextLevel: 55,
  totalXP: 245,
  wordsMastered: 8,
  totalWords: 12,
  streakRecord: 2,
  recentTrend: "stable" as const,
};

const companionCommand: CompanionCommand = {
  apiVersion: "1.0",
  type: "show_level_path",
  payload: {},
  childId: "reina",
  timestamp: 1,
  source: "claude",
};

const meta = {
  title: "Reward Encounters/Level Path",
  component: LevelPathExperience,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ minHeight: "100vh", background: "radial-gradient(circle at 50% 35%, #244b91, #071431 72%)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LevelPathExperience>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LevelBadge: Story = {
  args: {
    childId: "reina",
    progression,
    companionCommands: [],
    showTrigger: true,
  },
};

export const OpenLevelPath: Story = {
  args: {
    childId: "reina",
    progression,
    companionCommands: [],
    initiallyOpen: true,
  },
};

export const OpenedByElli: Story = {
  args: {
    childId: "reina",
    progression,
    companionCommands: [companionCommand],
  },
};
