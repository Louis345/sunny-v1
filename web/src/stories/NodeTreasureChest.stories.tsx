import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { NodeTreasureChest, type ChestKind, type ChestLoot } from "../components/NodeTreasureChest";

const meta: Meta<typeof NodeTreasureChest> = {
  title: "Reward Encounters/Node Treasure Chest",
  component: NodeTreasureChest,
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "Prototype of the chest after each finished node. Its colour shows the rarity before she opens it; a mystery chest hides it. The roll is given to it: rolling, saving and paying belong to the server, and nothing here touches learning evidence." } },
  },
  args: { onCollect: fn() },
};
export default meta;
type Story = StoryObj<typeof NodeTreasureChest>;

const CHESTS: Array<{ rarity: ChestKind; bonusChance: number; loot: ChestLoot }> = [
  { rarity: "common", bonusChance: 0.1, loot: { coins: 20 } },
  { rarity: "rare", bonusChance: 0.25, loot: { coins: 35, item: { name: "Ribbon Bow", rarity: "rare", icon: "🎀" } } },
  { rarity: "epic", bonusChance: 0.5, loot: { coins: 60, item: { name: "Comet Cape", rarity: "epic", icon: "🧥" } } },
  { rarity: "legendary", bonusChance: 1, loot: { coins: 120, item: { name: "Star Crown", rarity: "legendary", icon: "👑" } } },
  { rarity: "mystery", bonusChance: 0.4, loot: { coins: 25, item: { name: "5 call minutes", rarity: "epic", icon: "🎥" } } },
];

function Gallery() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", background: "#05030f" }}>
      {CHESTS.map(chest => <NodeTreasureChest key={chest.rarity} {...chest} onCollect={() => {}} />)}
    </div>
  );
}

export const AllChests: Story = { name: "All chests (closed)", render: () => <Gallery /> };
export const AllChestsOpened: Story = {
  name: "All chests (opened)",
  render: () => <Gallery />,
  play: async ({ canvasElement }) => {
    for (const button of within(canvasElement).getAllByRole("button", { name: /tap to open/i })) await userEvent.click(button);
  },
};
export const Wooden: Story = { args: CHESTS[0] };
export const Rare: Story = { args: CHESTS[1] };
export const Epic: Story = { args: CHESTS[2] };
export const Legendary: Story = { args: CHESTS[3] };
export const Mystery: Story = { args: CHESTS[4] };
