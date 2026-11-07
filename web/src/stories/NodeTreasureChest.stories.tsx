import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createStarterCompanionCarePlan, grantNodeChest, nodeChestKind } from "../../../src/engine/companionCareEngine";
import type { CompanionCarePlan, NodeChest } from "../../../src/shared/companionCareTypes";
import { fn, userEvent, within } from "storybook/test";
import { NodeTreasureChest, chestFromServer, type ChestKind, type ChestLoot } from "../components/NodeTreasureChest";

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

/** The real server roll (same odds, pity counter and saved balance) in the browser: finish stops and watch. */
const STOPS = [
  { role: "baseline", label: "Practice" },
  { role: "evaluation", label: "Independent check" },
  { role: "quest", label: "Quest" },
  { role: "mystery", label: "Mystery" },
];
function PlayABoard() {
  const [plan, setPlan] = useState<CompanionCarePlan>(() => createStarterCompanionCarePlan({ childId: "storybook", companionId: "elli" }));
  const [chest, setChest] = useState<NodeChest | null>(null);
  const [log, setLog] = useState<NodeChest[]>([]);
  const finish = (role: string) => {
    const opened = grantNodeChest(plan, { homeworkId: "storybook", nodeId: `stop-${log.length + 1}`, kind: nodeChestKind({ role }), nowIso: new Date().toISOString() });
    setPlan(opened.plan);
    setChest(opened.chest);
    setLog(rows => [opened.chest, ...rows]);
  };
  const pity = plan.economy.chestsSinceBonus ?? 0;
  const button = { padding: "12px 18px", border: 0, borderRadius: 999, font: "800 16px Lexend, system-ui", cursor: "pointer", background: "#ffd84d", color: "#231400" } as const;
  return (
    <div style={{ minHeight: "100vh", padding: 24, color: "#fff", font: "16px Lexend, system-ui", background: "radial-gradient(circle at 50% 30%, #2a1a5e, #05030f)" }}>
      <h2 style={{ margin: "0 0 6px" }}>Play a board</h2>
      <p style={{ margin: "0 0 18px", opacity: .8 }}>Each button finishes a stop and rolls its chest with the real server odds.</p>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 18, fontWeight: 800 }}>
        <span>🪙 {plan.economy.coins} coins</span><span>🎥 {plan.economy.callMinutes ?? 0} call minutes</span><span>🍀 pity: {pity} {pity ? `(+${pity * 10}% next bonus)` : ""}</span>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {STOPS.map(stop => <button key={stop.role} type="button" style={button} onClick={() => finish(stop.role)}>{`Finish ${stop.label}`}</button>)}
      </div>
      <ol style={{ opacity: .85, lineHeight: 1.7 }}>
        {log.map(row => <li key={row.nodeId}>{`${row.kind === "mystery" ? `mystery → ${row.rarity}` : row.rarity} chest: +${row.coins} coins${row.bonus ? `, +${row.bonus.minutes} call minutes` : ""} (bonus chance ${Math.round(row.bonusChance * 100)}%)`}</li>)}
      </ol>
      {chest ? (
        // As on the board: the chest sits inside the stop's "Run Complete" panel, and Back to map stays reachable.
        <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "rgba(5,7,12,.62)", backdropFilter: "blur(10px)" }}>
          <div style={{ width: "min(92vw, 720px)", padding: 28, borderRadius: 8, textAlign: "center", background: "rgba(2,6,23,.8)", border: "1px solid rgba(255,255,255,.15)" }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 900, color: "#fcd34d", textTransform: "uppercase" }}>Run Complete</p>
            <h1 style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 900 }}>Stop finished</h1>
            <NodeTreasureChest key={chest.nodeId} compact {...chestFromServer(chest)} onCollect={() => undefined} />
            <button type="button" style={{ ...button, marginTop: 12, background: "#fff" }} onClick={() => setChest(null)}>Back to map</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
export const PlayABoardStory: Story = { name: "Play a board (real roll)", render: () => <PlayABoard /> };
