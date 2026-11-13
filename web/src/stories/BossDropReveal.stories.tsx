import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { BossDropReveal, type BossDropTier } from "../components/BossDropReveal";
import { CompanionCurrencyHud } from "../components/CompanionCurrencyHud";

// The Boss loot card as the kiosk plays it (approved ceremony, owner 2026-11-03), with her coin counter, so the
// owner can watch every tier and see the coins land before a child does. Coins are the placeholder amounts.
const COINS: Record<BossDropTier, number> = { common: 15, rare: 30, epic: 60, legendary: 120 };
const roll = (): BossDropTier => { const x = Math.random(); return x < 0.6 ? "common" : x < 0.85 ? "rare" : x < 0.97 ? "epic" : "legendary"; };

function LootPreview({ startingCoins }: { startingCoins: number }) {
  const [coins, setCoins] = useState(startingCoins);
  const [drop, setDrop] = useState<{ tier: BossDropTier; coins: number; key: number } | null>(null);
  const play = (tier: BossDropTier) => setDrop({ tier, coins: COINS[tier], key: Date.now() });
  const button = (label: string, onClick: () => void, background: string) => (
    <button type="button" onClick={onClick} style={{ border: 0, borderRadius: 999, padding: "10px 14px", fontWeight: 800, cursor: "pointer", background, color: "#fff" }}>{label}</button>
  );
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: "url(/generated/adventure-board-demo/silent-letter-world.jpeg) center/cover, #10203d", overflow: "hidden" }}>
      <CompanionCurrencyHud companionCurrency={coins} />
      {drop ? null : (
        <div aria-label="Storybook loot controls" style={{ position: "absolute", left: 16, bottom: 16, display: "flex", gap: 8, flexWrap: "wrap", padding: 10, borderRadius: 14, background: "rgba(15,23,42,0.9)" }}>
          {button("▶ Beat the Boss (random roll)", () => play(roll()), "#ff3d6e")}
          {button("Common", () => play("common"), "#3f8f4f")}
          {button("Rare", () => play("rare"), "#2f7fe0")}
          {button("Epic", () => play("epic"), "#8a46e8")}
          {button("Legendary", () => play("legendary"), "#e8820f")}
        </div>
      )}
      {drop ? <BossDropReveal key={drop.key} drop={drop} onDone={() => { setCoins(value => value + drop.coins); setDrop(null); }} /> : null}
    </div>
  );
}

const meta: Meta<typeof LootPreview> = {
  title: "Reward Encounters/Boss Loot Drop",
  component: LootPreview,
  parameters: { layout: "fullscreen" },
  args: { startingCoins: 40 },
};
export default meta;

export const BossLootDrop: StoryObj<typeof LootPreview> = {};
