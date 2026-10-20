import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { ChildProgressionSnapshot } from "../../../src/engine/progression";
import type { CompanionCommand } from "../../../src/shared/companions/companionContract";
import { LEVEL_REWARD_QUEUE } from "../../../src/shared/levelRewardCatalog";
import { XPBar } from "./XPBar";
import "./LevelPathExperience.css";

export type LevelPathExperienceProps = {
  childId: string | null;
  progression: ChildProgressionSnapshot | null;
  companionCommands: readonly CompanionCommand[];
  showTrigger?: boolean;
  initiallyOpen?: boolean;
};

function commandKey(command: CompanionCommand): string {
  return `${command.timestamp}|${command.childId}|${command.type}|${command.source}`;
}

function rewardStatus(level: number, currentLevel: number): string {
  if (level < currentLevel) return "Unlocked";
  if (level === currentLevel) return "Current level";
  if (level === currentLevel + 1) return "Next reward";
  return "Coming up";
}

export function LevelPathExperience({
  childId,
  progression,
  companionCommands,
  showTrigger = false,
  initiallyOpen = false,
}: LevelPathExperienceProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const processedCommandsRef = useRef(new Set<string>());
  const activeChildRef = useRef<string | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const nextChild = childId?.trim().toLowerCase() ?? null;
    if (activeChildRef.current === nextChild) return;
    activeChildRef.current = nextChild;
    processedCommandsRef.current.clear();
    setOpen(Boolean(initiallyOpen && nextChild && progression));
  }, [childId, initiallyOpen, progression]);

  useEffect(() => {
    if (progression) return;
    setOpen(false);
  }, [progression]);

  useEffect(() => {
    if (!childId || !progression) return;
    const normalizedChildId = childId.trim().toLowerCase();
    if (progression.childId.trim().toLowerCase() !== normalizedChildId) return;
    const command = [...companionCommands].reverse().find((candidate) => {
      if (candidate.type !== "show_level_path") return false;
      if (candidate.childId.trim().toLowerCase() !== normalizedChildId) return false;
      return !processedCommandsRef.current.has(commandKey(candidate));
    });
    if (!command) return;
    const key = commandKey(command);
    processedCommandsRef.current.add(key);
    if (processedCommandsRef.current.size > 64) {
      const oldest = processedCommandsRef.current.values().next().value;
      if (typeof oldest === "string") processedCommandsRef.current.delete(oldest);
    }
    setOpen(true);
    console.info(
      ` 🎮 [level-path] [open] [companion-command] child=${normalizedChildId} level=${progression.level}`,
    );
  }, [childId, companionCommands, progression]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      console.info(" 🎮 [level-path] [close] [escape]");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (
    !childId ||
    !progression ||
    progression.childId.trim().toLowerCase() !== childId.trim().toLowerCase()
  ) return null;
  const xpTarget = Math.max(1, progression.currentXP + progression.xpToNextLevel);

  const openFromBadge = () => {
    setOpen(true);
    console.info(
      ` 🎮 [level-path] [open] [level-badge] child=${childId.trim().toLowerCase()} level=${progression.level}`,
    );
  };

  const close = () => {
    setOpen(false);
    console.info(" 🎮 [level-path] [close] [button]");
  };

  return (
    <>
      {showTrigger ? (
        <XPBar
          level={progression.level}
          xp={progression.currentXP}
          xpToNext={progression.xpToNextLevel}
          onOpen={openFromBadge}
        />
      ) : null}
      <AnimatePresence>
        {open ? (
          <motion.div
            className="level-path-overlay"
            data-testid="level-path-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <motion.section
              aria-label="Level path"
              aria-modal="true"
              className="level-path-modal"
              role="dialog"
            >
              <header className="level-path-modal__header">
                <div>
                  <p>YOUR ADVENTURE</p>
                  <h2>Level Path</h2>
                  <span>Level {progression.level} • {progression.currentXP} / {xpTarget} XP</span>
                </div>
                <button type="button" onClick={close} aria-label="Close level path">×</button>
              </header>

              <div className="level-path-modal__progress" aria-label={`${progression.currentXP} of ${xpTarget} XP`}>
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (progression.currentXP / xpTarget) * 100)}%` }}
                  transition={{ duration: reduceMotion ? 0 : 0.65, ease: "easeOut" }}
                />
              </div>

              <div className="level-path-modal__queue" aria-label="Guaranteed level rewards">
                {LEVEL_REWARD_QUEUE.map((reward) => {
                  const status = rewardStatus(reward.level, progression.level);
                  return (
                    <article
                      className={`level-path-reward level-path-reward--${status.toLowerCase().replaceAll(" ", "-")}`}
                      data-testid="level-reward-row"
                      key={reward.rewardId}
                    >
                      <div className="level-path-reward__level">
                        <span>LVL</span>
                        <strong>{reward.level}</strong>
                      </div>
                      <div className="level-path-reward__icon" aria-hidden="true">{reward.icon}</div>
                      <div className="level-path-reward__copy">
                        <span>{status}</span>
                        <h3>{reward.name}</h3>
                        <p>{reward.description}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
              <footer>
                Guaranteed level rewards are shown here. Mystery treasures stay a surprise.
              </footer>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
