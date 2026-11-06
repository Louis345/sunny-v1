import { useEffect, useRef, useState } from "react";
import "./BossDropReveal.css";

export type BossDropTier = "common" | "rare" | "epic" | "legendary";
const TIERS: Record<BossDropTier, { color: string; label: string }> = {
  common: { color: "#7ee08a", label: "COMMON" },
  rare: { color: "#4fa3ff", label: "RARE" },
  epic: { color: "#b46bff", label: "EPIC" },
  legendary: { color: "#ffa62b", label: "LEGENDARY" },
};
const ORDER: BossDropTier[] = ["common", "rare", "epic", "legendary"];

function play(name: string, rate = 1, volume = 1): void {
  try {
    const sound = new Audio(`/sfx/loot/${name}.mp3`);
    sound.playbackRate = rate;
    sound.volume = volume;
    void sound.play().catch(() => console.warn(` 🎮 [boss-drop] [sound] [blocked] ${name}`));
  } catch {
    console.warn(` 🎮 [boss-drop] [sound] [unavailable] ${name}`);
  }
}

/** The approved unlock-ceremony loot card (owner, 2026-11-03): face-down, its glow climbs through the
 * tiers with ticks speeding up, then it flips to the tier the server rolled and saved. */
export function BossDropReveal({ drop, onDone }: { drop: { tier: BossDropTier; coins: number }; onDone: () => void }) {
  const [phase, setPhase] = useState<"suspense" | "revealed">("suspense");
  const [glow, setGlow] = useState("#ffffff");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const later = (ms: number, run: () => void) => timers.current.push(setTimeout(run, ms));
    const steps = 8 + ORDER.indexOf(drop.tier) * 3;
    play("fanfare", 1, 0.7);
    for (let i = 0; i < steps; i += 1) later(200 + i * (80 + i * 4), () => { setGlow(TIERS[ORDER[i % 4]].color); play("tick", 1 + i * 0.04, 0.5); });
    later(200 + steps * (80 + steps * 4), () => {
      setGlow(TIERS[drop.tier].color);
      setPhase("revealed");
      play(drop.tier);
      console.log(` 🎮 [boss-drop] [revealed] tier=${drop.tier} coins=${drop.coins}`);
    });
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [drop.tier, drop.coins]);
  const tier = TIERS[drop.tier];
  return (
    <div className="boss-drop" data-testid="boss-drop" data-phase={phase} style={{ ["--tier" as string]: glow }}>
      <div className="boss-drop__title">BOSS DEFEATED!</div>
      <div className="boss-drop__card">
        <div className="boss-drop__inner">
          <div className="boss-drop__face boss-drop__back" aria-hidden="true">?</div>
          <div className="boss-drop__face boss-drop__front">
            {phase === "revealed" ? (<><span className="boss-drop__tier">{tier.label}</span><span className="boss-drop__coins">{`+${drop.coins} coins`}</span></>) : null}
          </div>
        </div>
      </div>
      {phase === "revealed" ? <button type="button" className="boss-drop__collect" onClick={onDone}>Collect</button> : null}
    </div>
  );
}
