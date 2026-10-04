import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import mysteryChestImage from "../stories/assets/mystery-chest.png";
import mysteryWorldImage from "../stories/assets/mystery-world.png";
import "./MysteryRewardShowcase.css";

export type MysteryRewardPhase = "xp" | "treasure" | "reveal";

export type MysteryReward = {
  id: string;
  name: string;
  imageSrc: string;
  kind: "companion_cosmetic" | "collectible" | "bonus_activity" | "world_event";
};

export type MysteryRewardDecision = {
  action: "equip" | "save";
  rewardId: string;
};

type MysteryRewardShowcaseProps = {
  level: number;
  currentXp: number;
  earnedXp: number;
  xpToNextLevel: number;
  reward: MysteryReward;
  initialPhase?: MysteryRewardPhase;
  onRewardDecision?: (decision: MysteryRewardDecision) => void;
};

const SPARKS = [
  { left: "13%", top: "22%", delay: 0.1, size: 8 },
  { left: "22%", top: "67%", delay: 0.8, size: 5 },
  { left: "38%", top: "16%", delay: 1.2, size: 7 },
  { left: "59%", top: "25%", delay: 0.4, size: 5 },
  { left: "72%", top: "72%", delay: 1.5, size: 8 },
  { left: "83%", top: "34%", delay: 0.9, size: 6 },
  { left: "91%", top: "61%", delay: 1.8, size: 4 },
  { left: "46%", top: "80%", delay: 0.2, size: 6 },
];

const phaseCopy: Record<MysteryRewardPhase, string> = {
  xp: "Adventure complete",
  treasure: "A mystery treasure appeared",
  reveal: "Treasure discovered",
};

export function MysteryRewardShowcase({
  level,
  currentXp,
  earnedXp,
  xpToNextLevel,
  reward,
  initialPhase = "xp",
  onRewardDecision,
}: MysteryRewardShowcaseProps) {
  const [phase, setPhase] = useState<MysteryRewardPhase>(initialPhase);
  const [decision, setDecision] = useState<MysteryRewardDecision["action"] | null>(null);
  const decisionCommitted = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setPhase(initialPhase);
    setDecision(null);
    decisionCommitted.current = false;
  }, [initialPhase, reward.id]);

  const safeTarget = Math.max(1, xpToNextLevel);
  const startPercent = Math.min(100, Math.max(0, (currentXp / safeTarget) * 100));
  const earnedPercent = Math.min(100, Math.max(0, ((currentXp + earnedXp) / safeTarget) * 100));
  const nextLevel = level + 1;
  const transitionDuration = reduceMotion ? 0 : 0.8;
  const status = decision === "equip" ? "Equipped" : decision === "save" ? "Saved" : null;

  const sparks = useMemo(
    () =>
      SPARKS.map((spark, index) => (
        <motion.span
          aria-hidden="true"
          className="mystery-reward__spark"
          key={`${spark.left}-${spark.top}`}
          style={{ left: spark.left, top: spark.top, width: spark.size, height: spark.size }}
          animate={
            reduceMotion
              ? undefined
              : {
                  opacity: [0.15, 0.95, 0.15],
                  scale: [0.7, 1.25, 0.7],
                  y: [0, index % 2 === 0 ? -10 : 10, 0],
                }
          }
          transition={{ duration: 2.8, repeat: Infinity, delay: spark.delay, ease: "easeInOut" }}
        />
      )),
    [reduceMotion],
  );

  function commitDecision(action: MysteryRewardDecision["action"]): void {
    if (decisionCommitted.current) return;
    decisionCommitted.current = true;
    setDecision(action);
    console.info(
      ` 🎮 [storybook:mystery-reward] [decision] [committed] action=${action} reward=${reward.id}`,
    );
    onRewardDecision?.({ action, rewardId: reward.id });
  }

  function enterPhase(nextPhase: MysteryRewardPhase): void {
    console.info(
      ` 🎮 [storybook:mystery-reward] [phase] [changed] from=${phase} to=${nextPhase}`,
    );
    setPhase(nextPhase);
  }

  return (
    <main
      className={`mystery-reward mystery-reward--${phase}`}
      data-reward-phase={phase}
      data-testid="mystery-reward-showcase"
    >
      <div
        className="mystery-reward__world"
        aria-hidden="true"
        style={{ backgroundImage: `url("${mysteryWorldImage}")` }}
      />
      <div className="mystery-reward__shade" aria-hidden="true" />
      <div className="mystery-reward__sparks" aria-hidden="true">
        {sparks}
      </div>

      <header className="mystery-reward__hud" aria-label={`Level ${level} progress`}>
        <div className="mystery-reward__level-badge">
          <span>LEVEL</span>
          <strong>{level}</strong>
        </div>
        <div className="mystery-reward__progress-copy">
          <div className="mystery-reward__progress-labels">
            <strong>{phaseCopy[phase]}</strong>
            <span>Level {nextLevel} ahead</span>
          </div>
          <div className="mystery-reward__progress-track">
            <motion.div
              className="mystery-reward__progress-fill"
              initial={{ width: `${startPercent}%` }}
              animate={{ width: `${earnedPercent}%` }}
              transition={{ duration: transitionDuration, ease: "easeOut", delay: reduceMotion ? 0 : 0.15 }}
            />
          </div>
          <span className="mystery-reward__xp-total">
            {Math.min(safeTarget, currentXp + earnedXp)} / {safeTarget} XP
          </span>
        </div>
      </header>

      <section className="mystery-reward__stage" aria-live="polite">
        <AnimatePresence initial={false}>
          {phase === "xp" ? (
            <motion.div
              className="mystery-reward__card mystery-reward__card--xp"
              key="xp"
              initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -18, scale: 1.04 }}
              transition={{ duration: transitionDuration, ease: "easeOut" }}
            >
              <motion.div
                aria-hidden="true"
                className="mystery-reward__completion-seal"
                animate={reduceMotion ? undefined : { rotate: [0, -4, 4, 0], scale: [1, 1.06, 1] }}
                transition={{ duration: 1.1, delay: 0.3 }}
              >
                ✓
              </motion.div>
              <p className="mystery-reward__eyebrow">NODE COMPLETE</p>
              <h1>Nice work!</h1>
              <motion.p
                className="mystery-reward__xp-earned"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.65 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 240, damping: 15, delay: reduceMotion ? 0 : 0.25 }}
              >
                +{earnedXp} XP
              </motion.p>
              <button className="mystery-reward__primary" type="button" onClick={() => enterPhase("treasure")}>
                Claim treasure
              </button>
            </motion.div>
          ) : null}

          {phase === "treasure" ? (
            <motion.div
              className="mystery-reward__card mystery-reward__card--treasure"
              key="treasure"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.82, y: 28 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, scale: 1.15 }}
              transition={{ type: "spring", stiffness: 180, damping: 18 }}
            >
              <p className="mystery-reward__eyebrow">MYSTERY TREASURE</p>
              <h1>Something is waiting…</h1>
              <motion.img
                className="mystery-reward__chest"
                src={mysteryChestImage}
                alt="Closed mystery treasure chest"
                animate={
                  reduceMotion
                    ? undefined
                    : { y: [0, -8, 0], rotate: [0, -1.5, 1.5, 0], filter: ["brightness(1)", "brightness(1.16)", "brightness(1)"] }
                }
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <button className="mystery-reward__primary mystery-reward__primary--gold" type="button" onClick={() => enterPhase("reveal")}>
                Open
              </button>
            </motion.div>
          ) : null}

          {phase === "reveal" ? (
            <motion.div
              className="mystery-reward__card mystery-reward__card--reveal"
              key="reveal"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.72, rotate: -3 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 175, damping: 16 }}
            >
              <div className="mystery-reward__burst" aria-hidden="true" />
              <p className="mystery-reward__eyebrow">YOU FOUND</p>
              <h1>{reward.name}</h1>
              <motion.img
                className="mystery-reward__reward"
                src={reward.imageSrc}
                alt={reward.name}
                initial={reduceMotion ? false : { y: 18, opacity: 0, scale: 0.82 }}
                animate={{ y: reduceMotion ? 0 : [0, -8, 0], opacity: 1, scale: 1 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { y: { duration: 2.5, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.35 }, scale: { duration: 0.5 } }
                }
              />
              {status ? (
                <div className="mystery-reward__resolved" role="status">
                  <span aria-hidden="true">✓</span> {status}
                </div>
              ) : null}
              <div className="mystery-reward__decisions">
                <button
                  className="mystery-reward__primary"
                  type="button"
                  disabled={decision !== null}
                  onClick={() => commitDecision("equip")}
                >
                  Equip
                </button>
                <button
                  className="mystery-reward__secondary"
                  type="button"
                  disabled={decision !== null}
                  onClick={() => commitDecision("save")}
                >
                  Save for later
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </main>
  );
}
