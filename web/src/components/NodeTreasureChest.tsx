import { useEffect, useRef, useState } from "react";
import "./NodeTreasureChest.css";
import { REWARD_CATALOG } from "../../../src/shared/rewardCatalog";

/** The chest's colour says what she earned before she opens it; a mystery chest hides it until the lid lifts. */
export type ChestRarity = "common" | "rare" | "epic" | "legendary";
export type ChestKind = ChestRarity | "mystery";
export type ChestLoot = { coins: number; rarity?: ChestRarity; item?: { name: string; rarity: ChestRarity; icon?: string; kind?: "outfit" | "game" | "minutes" } };
/** The chest the server rolled and saved, as the completion route returns it. */
export type ServerNodeChest = { homeworkId?: string; nodeId?: string; kind: ChestKind; rarity: ChestRarity; coins: number; bonusChance: number;
  bonus?: { kind: "call_minutes"; minutes: number } | { kind: "item"; itemId: string } };

/** A bonus as the chest shows it: a collection item by its catalog entry, or call minutes. */
function bonusItem(bonus: NonNullable<ServerNodeChest["bonus"]>, rarity: ChestRarity): NonNullable<ChestLoot["item"]> {
  if (bonus.kind === "call_minutes") return { name: `${bonus.minutes} call minutes`, rarity, icon: "🎥", kind: "minutes" };
  const item = REWARD_CATALOG.find(row => row.id === bonus.itemId);
  return item ? { name: item.name, rarity: item.rarity, icon: item.icon, kind: item.kind } : { name: "A new treasure", rarity, icon: "✦" };
}

export function chestFromServer(chest: ServerNodeChest): { rarity: ChestKind; bonusChance: number; loot: ChestLoot } {
  return {
    rarity: chest.kind,
    bonusChance: chest.bonusChance,
    loot: { coins: chest.coins, rarity: chest.rarity, ...(chest.bonus ? { item: bonusItem(chest.bonus, chest.rarity) } : {}) },
  };
}

export const CHEST_OPEN_MS = 1600;
const RARITY_NAME: Record<ChestRarity, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
const CHEST_NAME: Record<ChestKind, string> = { common: "Wooden chest", rare: "Rare chest", epic: "Epic chest", legendary: "Legendary chest", mystery: "Mystery chest" };
const COIN_SPRAY = 10;

function play(name: string, rate = 1, volume = 0.6): void {
  try {
    const sound = new Audio(`/sfx/loot/${name}.mp3`);
    sound.playbackRate = rate;
    sound.volume = volume;
    void sound.play().catch(() => console.warn(` 🎮 [node-chest] [sound] [blocked] ${name}`));
  } catch {
    console.warn(` 🎮 [node-chest] [sound] [unavailable] ${name}`);
  }
}

/** Storybook prototype of the reward after each finished node (owner, 2026-11-06). It only shows a roll it is
 * given: rolling, saving and paying belong to the server, and nothing here touches learning evidence. */
export function NodeTreasureChest({ rarity, loot, bonusChance, compact = false, companionName = "Elli", onOpened, onCollect }: { rarity: ChestKind; loot: ChestLoot; bonusChance?: number; compact?: boolean; companionName?: string; onOpened?: () => void; onCollect: () => void }) {
  const [phase, setPhase] = useState<"closed" | "shaking" | "open" | "collected">("closed");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const collected = useRef(false);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  // A mystery chest takes the colour of what it held once it opens.
  const shown: ChestKind = rarity === "mystery" && phase !== "closed" && phase !== "shaking" ? (loot.rarity ?? loot.item?.rarity ?? "common") : rarity;

  const open = () => {
    if (phase !== "closed") return;
    setPhase("shaking");
    play("fanfare", 1, 0.5);
    for (let i = 0; i < 8; i += 1) timers.current.push(setTimeout(() => play("tick", 1 + i * 0.06, 0.45), 120 + i * (150 - i * 8)));
    timers.current.push(setTimeout(() => {
      setPhase("open");
      onOpened?.();
      play(loot.rarity ?? loot.item?.rarity ?? (rarity === "mystery" ? "common" : rarity));
      console.log(` 🎮 [node-chest] [opened] chest=${rarity} coins=${loot.coins} item=${loot.item?.rarity ?? "none"}`);
    }, CHEST_OPEN_MS));
  };
  const collect = () => {
    if (collected.current) return;
    collected.current = true;
    setPhase("collected");
    console.log(` 🎮 [node-chest] [collected] chest=${rarity} coins=${loot.coins}`);
    onCollect();
  };
  const isOpen = phase === "open" || phase === "collected";

  return (
    <div className={compact ? "node-chest node-chest--compact" : "node-chest"} data-rarity={shown} data-kind={rarity} data-phase={phase}>
      <div className="node-chest__header">
        <span className="node-chest__name">{isOpen && rarity === "mystery" ? `${RARITY_NAME[shown as ChestRarity]} chest` : CHEST_NAME[rarity]}</span>
        {bonusChance !== undefined && !isOpen ? <span className="node-chest__odds">{`${Math.round(bonusChance * 100)}% bonus`}</span> : null}
      </div>
      <div className="node-chest__stage">
        <div className="node-chest__rays" aria-hidden="true" />
        <div className="node-chest__aura" aria-hidden="true" />
        <div className="node-chest__chest" aria-hidden="true">
          <div className="node-chest__lid"><span className="node-chest__band node-chest__band--left" /><span className="node-chest__band node-chest__band--right" /></div>
          <div className="node-chest__seam" />
          <div className="node-chest__body">
            <span className="node-chest__band node-chest__band--left" /><span className="node-chest__band node-chest__band--right" />
            <span className="node-chest__lock">{rarity === "mystery" && !isOpen ? "?" : ""}</span>
          </div>
        </div>
        {isOpen ? <div className="node-chest__coins" aria-hidden="true">{Array.from({ length: COIN_SPRAY }, (_, i) => <span key={i} style={{ ["--i" as string]: i }} />)}</div> : null}
        {isOpen && loot.item ? (
          <div className="node-chest__item" data-rarity={loot.item.rarity}>
            <span className="node-chest__item-icon" aria-hidden="true">{loot.item.icon ?? "✦"}</span>
            <span className="node-chest__item-rarity">{RARITY_NAME[loot.item.rarity]}</span>
            <span className="node-chest__item-name">{loot.item.name}</span>
            {loot.item.kind === "outfit" ? <span className="node-chest__item-note">{`A new look for ${companionName}! Try it on in your call.`}</span> : null}
          </div>
        ) : null}
      </div>
      {isOpen ? <div className="node-chest__payout">{`+${loot.coins} coins`}</div> : null}
      {phase === "closed" || phase === "shaking" ? (
        <button type="button" className="node-chest__button" onClick={open} disabled={phase === "shaking"}>{phase === "shaking" ? "Opening…" : "Tap to open"}</button>
      ) : compact ? null : (
        <button type="button" className="node-chest__button" onClick={collect} disabled={phase === "collected"}>{phase === "collected" ? "Collected" : "Collect"}</button>
      )}
    </div>
  );
}
