import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { RewardCollection } from "../components/RewardCollection";
import { REWARD_CATALOG } from "../../../src/shared/rewardCatalog";

const meta: Meta<typeof RewardCollection> = {
  title: "Reward Encounters/Collection",
  component: RewardCollection,
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "Everything she can earn, from the one reward catalog: owned in colour, the rest greyed out with the chest most likely to drop it and the real odds. New content is one more catalog entry." } },
  },
  args: { onUse: fn() },
};
export default meta;
type Story = StoryObj<typeof RewardCollection>;

export const BrandNew: Story = { name: "Brand new (nothing found yet)", args: { ownedIds: [] } };
export const AFewFound: Story = { name: "A few found", args: { ownedIds: ["game:asteroid", "outfit:cat-ears", "outfit:star-halo"] } };
export const AlmostComplete: Story = { name: "Almost complete", args: { ownedIds: REWARD_CATALOG.filter(item => item.id !== "game:space-invaders").map(item => item.id) } };
