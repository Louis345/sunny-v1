import React from "react";
import "./UnlockCeremony.css";

/** The approved Quest/Boss unlock ceremony (owner, 2026-11-03, experiments/unlock-ceremony): the board dims and
 * leans in, shakes, a light pillar drops, the node bursts out of the ground, coins draw the new path, then the
 * banner slams in. The board owns the timeline; this overlay only draws the effects for the current stage. */
export const UNLOCK_CEREMONY_STAGES = [
  { stage: "dim", at: 0 },
  { stage: "shake", at: 450 },
  { stage: "pillar", at: 900 },
  { stage: "rise", at: 1250 },
  { stage: "open", at: 1900 },
  { stage: "banner", at: 2200 },
] as const;
export const UNLOCK_CEREMONY_END_MS = 4400;
export type UnlockCeremonyStage = (typeof UNLOCK_CEREMONY_STAGES)[number]["stage"];

export function stageReached(current: UnlockCeremonyStage, wanted: UnlockCeremonyStage): boolean {
  const order = UNLOCK_CEREMONY_STAGES.map((entry) => entry.stage as UnlockCeremonyStage);
  return order.indexOf(current) >= order.indexOf(wanted);
}

/** The world holds its breath: drawn under the nodes layer so the unlocking node bursts out above it. */
export function UnlockCeremonyDim({ stage }: { stage: UnlockCeremonyStage }): React.ReactElement {
  return <i aria-hidden="true" className={`unlock-ceremony__dim${stageReached(stage, "open") ? " unlock-ceremony__dim--lifting" : ""}`} />;
}

export type CeremonyPoint = { x: number; y: number };

const SPARKS = 56;
const COINS = 12;

export function UnlockCeremony({
  kind,
  stage,
  at,
  from,
}: {
  kind: "quest" | "boss";
  stage: UnlockCeremonyStage;
  at: CeremonyPoint;
  from: CeremonyPoint | null;
}): React.ReactElement {
  const boss = kind === "boss";
  const origin = from ?? { x: at.x, y: at.y + 160 };
  return (
    <div className={`unlock-ceremony unlock-ceremony--${kind}`} aria-hidden="true">
      {stageReached(stage, "pillar") && !stageReached(stage, "open") ? (
        <i className="unlock-ceremony__pillar" style={{ left: at.x, height: at.y }} />
      ) : null}
      {stageReached(stage, "rise") ? (
        <>
          <i className="unlock-ceremony__flash" />
          <i className="unlock-ceremony__ring" style={{ left: at.x, top: at.y }} />
          <i className="unlock-ceremony__ring unlock-ceremony__ring--inner" style={{ left: at.x, top: at.y }} />
          {Array.from({ length: SPARKS }, (_, index) => {
            const angle = (index / SPARKS) * Math.PI * 2 + (index % 3) * 0.37;
            const distance = (boss ? 150 : 115) + ((index * 37) % 90);
            return (
              <i
                key={index}
                className="unlock-ceremony__spark"
                style={{
                  left: at.x,
                  top: at.y,
                  "--spark-dx": `${Math.cos(angle) * distance}px`,
                  "--spark-dy": `${Math.sin(angle) * distance - 40}px`,
                  "--spark-size": `${4 + (index % 4) * 2}px`,
                  "--spark-delay": `${(index % 5) * 30}ms`,
                } as React.CSSProperties}
              />
            );
          })}
        </>
      ) : null}
      {stageReached(stage, "open")
        ? Array.from({ length: COINS }, (_, index) => {
          const t = (index + 1) / COINS;
          return (
            <i
              key={index}
              className="unlock-ceremony__coin"
              style={{
                left: origin.x + (at.x - origin.x) * t,
                top: origin.y + (at.y - origin.y) * t - Math.sin(t * Math.PI) * 40,
                "--coin-delay": `${(index + 1) * 70}ms`,
              } as React.CSSProperties}
            />
          );
        })
        : null}
      {stageReached(stage, "banner") ? (
        <div className="unlock-ceremony__banner">
          <small>{boss ? "YOU WOKE IT UP" : "A NEW PATH OPENS"}</small>
          <strong>{boss ? "BOSS AWAKENS!" : "QUEST UNLOCKED!"}</strong>
        </div>
      ) : null}
    </div>
  );
}
