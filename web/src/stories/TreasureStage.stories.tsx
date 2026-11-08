import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PostActivityEngagementOverlay } from "../components/PostActivityEngagementOverlay";
import { NodeTreasureChest, chestFromServer, type ServerNodeChest } from "../components/NodeTreasureChest";
import { CallProgressBadge } from "../components/CallProgressBadge";

/** The end of a stop after Ila's 11/7 session: the chest alone, center stage, then the short summary. */
const meta: Meta<typeof PostActivityEngagementOverlay> = {
  title: "Reward Encounters/Treasure Stage",
  component: PostActivityEngagementOverlay,
  parameters: { layout: "fullscreen" },
  args: { title: "Letter Box Trek", outcome: { completed: true, accuracy: 0.75 }, onAction: fn(), onFunRating: fn() },
};
export default meta;
type Story = StoryObj<typeof PostActivityEngagementOverlay>;

const chest = (over: Partial<ServerNodeChest>): ServerNodeChest => ({ homeworkId: "hw", nodeId: "n", kind: "common", rarity: "common", coins: 9, bonusChance: 0.1, ...over });
const stage = (server: ServerNodeChest) => (finish: () => void) => <NodeTreasureChest {...chestFromServer(server)} companionName="Elli" onCollect={finish} />;

export const WoodenChest: Story = { args: { treasure: stage(chest({})) } };
export const BlueChestUpgrade: Story = { args: { treasure: stage(chest({ rarity: "rare", coins: 17, bonusChance: 0.2 })) } };
export const PurpleChestWithDress: Story = { args: { treasure: stage(chest({ kind: "epic", rarity: "epic", coins: 31, bonusChance: 0.5, bonus: { kind: "item", itemId: "outfit:teal-ribbon-dress" } })) } };
export const MapCounter: Story = { render: () => <div style={{ height: 120, background: "#1e293b" }}><CallProgressBadge stopsLeft={2} companionName="Elli" /></div> };
