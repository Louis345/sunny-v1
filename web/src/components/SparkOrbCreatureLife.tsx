import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { CapturedMonsterCapturePersonality } from "./capturedMonsterCatalog";
import type {
  CreatureFidgetMove,
  CreatureLifeReaction,
  ResolvedCreatureLifeProfile,
} from "./creatureLifeProfiles";

export type CreatureGazeDirection = "center" | "left" | "right" | "orb" | "child";

export interface CreatureLifeEvent {
  type: "blink" | "glance" | "fidget" | "reaction";
  detail: string;
  gapMs?: number;
  personality: CapturedMonsterCapturePersonality;
}

export interface SparkOrbCreatureLifeProps {
  profile: ResolvedCreatureLifeProfile;
  reaction?: CreatureLifeReaction;
  /** Bump this to replay the same reaction (e.g. two sparks in a row both perk). */
  reactionPulseKey?: number;
  /** True while the capture sequence owns the sprite: all life motion goes inert. */
  suppressed?: boolean;
  random?: () => number;
  onLifeEvent?: (event: CreatureLifeEvent) => void;
  children: ReactNode;
}

type LifeTimerChannel = "blink" | "glance" | "fidget" | "reaction";

const BLINK_HOLD_MS = 140;
const DOUBLE_BLINK_GAP_MS = 180;
const GLANCE_HOLD_MS = 1600;
const FIDGET_HOLD_MS = 1200;
const REACTION_PULSE_MS: Partial<Record<CreatureLifeReaction, number>> = {
  perk: 700,
  concerned: 1100,
};
const MAX_BLINK_DEPTH = 1;

const GAZE_POOL: CreatureGazeDirection[] = ["left", "right", "orb", "child"];

export function SparkOrbCreatureLife({
  profile,
  reaction = "none",
  reactionPulseKey = 0,
  suppressed = false,
  random = Math.random,
  onLifeEvent,
  children,
}: SparkOrbCreatureLifeProps) {
  const [blinking, setBlinking] = useState(false);
  const [gaze, setGaze] = useState<CreatureGazeDirection>("center");
  const [fidget, setFidget] = useState<CreatureFidgetMove | "none">("none");
  const [activeReaction, setActiveReaction] = useState<CreatureLifeReaction>("none");
  const timersRef = useRef<Record<LifeTimerChannel, number | null>>({
    blink: null,
    glance: null,
    fidget: null,
    reaction: null,
  });
  const lastFidgetRef = useRef<CreatureFidgetMove | null>(null);
  const randomRef = useRef(random);
  randomRef.current = random;
  const emitRef = useRef(onLifeEvent);
  emitRef.current = onLifeEvent;
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const emitLifeEvent = useCallback((event: CreatureLifeEvent): void => {
    console.info(` 🎮 [spark-orb-creature-life] [${event.type}] [${event.detail}]`, event);
    emitRef.current?.(event);
  }, []);

  const clearChannel = useCallback((channel: LifeTimerChannel): void => {
    const pending = timersRef.current[channel];
    if (pending !== null) {
      window.clearTimeout(pending);
      timersRef.current[channel] = null;
    }
  }, []);

  const armChannel = useCallback(
    (channel: LifeTimerChannel, delayMs: number, fn: () => void): void => {
      clearChannel(channel);
      timersRef.current[channel] = window.setTimeout(() => {
        timersRef.current[channel] = null;
        fn();
      }, delayMs);
    },
    [clearChannel],
  );

  const randomGap = useCallback((minGapMs: number, maxGapMs: number): number => {
    return Math.round(minGapMs + randomRef.current() * (maxGapMs - minGapMs));
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    if (suppressed) {
      setBlinking(false);
      setGaze("center");
      setFidget("none");
      return undefined;
    }

    function fireBlink(depth: number, gapMs: number): void {
      if (depth > MAX_BLINK_DEPTH) {
        throw new Error("creature_life_blink_depth_exceeded");
      }
      setBlinking(true);
      emitLifeEvent({
        type: "blink",
        detail: depth > 0 ? "double" : "single",
        gapMs,
        personality: profileRef.current.personality,
      });
      armChannel("blink", BLINK_HOLD_MS, () => {
        setBlinking(false);
        const doubleBlink =
          depth < MAX_BLINK_DEPTH &&
          randomRef.current() < profileRef.current.blink.doubleBlinkChance;
        if (doubleBlink) {
          armChannel("blink", DOUBLE_BLINK_GAP_MS, () =>
            fireBlink(depth + 1, DOUBLE_BLINK_GAP_MS),
          );
        } else {
          scheduleBlink();
        }
      });
    }

    function scheduleBlink(): void {
      const { minGapMs, maxGapMs } = profileRef.current.blink;
      const gapMs = randomGap(minGapMs, maxGapMs);
      armChannel("blink", gapMs, () => fireBlink(0, gapMs));
    }

    function scheduleGlance(): void {
      const { minGapMs, maxGapMs } = profileRef.current.glance;
      const gapMs = randomGap(minGapMs, maxGapMs);
      armChannel("glance", gapMs, () => {
        const pool = GAZE_POOL;
        const next = pool[Math.floor(randomRef.current() * pool.length)] ?? "left";
        setGaze(next);
        emitLifeEvent({
          type: "glance",
          detail: next,
          gapMs,
          personality: profileRef.current.personality,
        });
        armChannel("glance", GLANCE_HOLD_MS, () => {
          setGaze("center");
          scheduleGlance();
        });
      });
    }

    function scheduleFidget(): void {
      const { minGapMs, maxGapMs, moves } = profileRef.current.fidget;
      const gapMs = randomGap(minGapMs, maxGapMs);
      armChannel("fidget", gapMs, () => {
        const pool = moves.filter((move) => move !== lastFidgetRef.current);
        const source = pool.length > 0 ? pool : moves;
        const move = source[Math.floor(randomRef.current() * source.length)] ?? source[0];
        lastFidgetRef.current = move;
        setFidget(move);
        emitLifeEvent({
          type: "fidget",
          detail: move,
          gapMs,
          personality: profileRef.current.personality,
        });
        armChannel("fidget", FIDGET_HOLD_MS, () => {
          setFidget("none");
          scheduleFidget();
        });
      });
    }

    scheduleBlink();
    scheduleGlance();
    scheduleFidget();

    return () => {
      (Object.keys(timers) as LifeTimerChannel[]).forEach((channel) => {
        const pending = timers[channel];
        if (pending !== null) {
          window.clearTimeout(pending);
          timers[channel] = null;
        }
      });
    };
  }, [armChannel, emitLifeEvent, randomGap, suppressed]);

  useEffect(() => {
    clearChannel("reaction");
    if (suppressed || reaction === "none") {
      setActiveReaction("none");
      return;
    }
    setActiveReaction(reaction);
    emitLifeEvent({
      type: "reaction",
      detail: reaction,
      personality: profileRef.current.personality,
    });
    const pulseMs = REACTION_PULSE_MS[reaction];
    if (pulseMs !== undefined) {
      armChannel("reaction", pulseMs, () => setActiveReaction("none"));
    }
  }, [armChannel, clearChannel, emitLifeEvent, reaction, reactionPulseKey, suppressed]);

  const anchors = profile.anchors;
  const breatheScale = 1 + profile.breathe.scaleAmp;
  const lifeVars = {
    "--life-breathe-period": `${profile.breathe.periodMs}ms`,
    "--life-breathe-scale": `${breatheScale.toFixed(4)}`,
    "--life-breathe-scale-reduced": `${(1 + profile.breathe.scaleAmp / 2).toFixed(4)}`,
    "--life-hover-period": `${profile.hover.periodMs}ms`,
    "--life-hover-amp": `${profile.hover.pxAmp}px`,
    "--life-sway-period": `${profile.sway.periodMs}ms`,
    "--life-sway-deg": `${profile.sway.degAmp}deg`,
    "--life-reaction-amp": `${profile.reactionAmp}`,
    ...(anchors
      ? {
          "--life-eye-left-x": `${anchors.eyeLeft.xPct}%`,
          "--life-eye-left-y": `${anchors.eyeLeft.yPct}%`,
          "--life-eye-right-x": `${anchors.eyeRight.xPct}%`,
          "--life-eye-right-y": `${anchors.eyeRight.yPct}%`,
          "--life-eye-w": `${anchors.eyeWidthPct}%`,
          "--life-eye-h": `${anchors.eyeHeightPct}%`,
          "--life-lid-color": anchors.lidColor,
        }
      : {}),
  } as CSSProperties;

  return (
    <div
      className="creature-life"
      data-testid="creature-life"
      data-personality={profile.personality}
      data-blink={blinking ? "true" : "false"}
      data-gaze={gaze}
      data-fidget={fidget}
      data-reaction={activeReaction}
      data-suppressed={suppressed ? "true" : "false"}
      data-has-anchors={anchors ? "true" : "false"}
      style={lifeVars}
    >
      <div className="creature-life__breathe">
        <div className="creature-life__hover">
          <div className="creature-life__sway">
            <div className="creature-life__gaze">
              <div className="creature-life__fidget">
                <div className="creature-life__reaction">
                  <div className="creature-life__blink-squash">
                    {children}
                    {anchors ? (
                      <>
                        <span className="creature-life__lid creature-life__lid--left" aria-hidden="true" />
                        <span className="creature-life__lid creature-life__lid--right" aria-hidden="true" />
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .creature-life,
        .creature-life * {
          box-sizing: border-box;
        }

        .creature-life {
          height: 100%;
          width: 100%;
        }

        .creature-life__breathe,
        .creature-life__hover,
        .creature-life__sway,
        .creature-life__gaze,
        .creature-life__fidget,
        .creature-life__reaction,
        .creature-life__blink-squash {
          height: 100%;
          width: 100%;
        }

        .creature-life__blink-squash {
          position: relative;
          transition: transform 70ms ease-in;
        }

        .creature-life__breathe {
          animation: creatureLifeBreathe var(--life-breathe-period) ease-in-out infinite;
          transform-origin: 50% 100%;
        }

        .creature-life__hover {
          animation: creatureLifeHover var(--life-hover-period) ease-in-out infinite;
        }

        .creature-life__sway {
          animation: creatureLifeSway var(--life-sway-period) ease-in-out infinite;
          transform-origin: 50% 78%;
        }

        .creature-life__gaze {
          transition: transform 420ms cubic-bezier(0.34, 1.2, 0.4, 1);
        }

        .creature-life[data-gaze="left"] .creature-life__gaze {
          transform: translateX(-2.4%) rotate(-1.6deg);
        }

        .creature-life[data-gaze="right"] .creature-life__gaze {
          transform: translateX(2.4%) rotate(1.6deg);
        }

        .creature-life[data-gaze="orb"] .creature-life__gaze {
          transform: translateY(2.2%) rotate(1deg);
        }

        .creature-life[data-gaze="child"] .creature-life__gaze {
          transform: translateY(-1.4%) scale(1.012);
        }

        .creature-life[data-fidget="look-left"] .creature-life__fidget {
          animation: creatureLifeLookLeft 1.1s ease-in-out both;
        }

        .creature-life[data-fidget="look-right"] .creature-life__fidget {
          animation: creatureLifeLookRight 1.1s ease-in-out both;
        }

        .creature-life[data-fidget="hop"] .creature-life__fidget {
          animation: creatureLifeHop 0.9s cubic-bezier(0.28, 1.4, 0.42, 1) both;
        }

        .creature-life[data-fidget="shrink-peek"] .creature-life__fidget {
          animation: creatureLifeShrinkPeek 1.2s ease-in-out both;
        }

        .creature-life[data-fidget="sway"] .creature-life__fidget {
          animation: creatureLifeFidgetSway 1.2s ease-in-out both;
        }

        .creature-life[data-fidget="chest-up"] .creature-life__fidget {
          animation: creatureLifeChestUp 1.1s ease-in-out both;
          transform-origin: 50% 100%;
        }

        .creature-life[data-fidget="yawn"] .creature-life__fidget {
          animation: creatureLifeYawn 1.2s ease-in-out both;
          transform-origin: 50% 100%;
        }

        .creature-life[data-fidget="slow-sway"] .creature-life__fidget {
          animation: creatureLifeFidgetSway 1.2s ease-in-out both;
        }

        .creature-life[data-fidget="ear-wiggle"] .creature-life__fidget {
          animation: creatureLifeEarWiggle 0.8s ease-in-out both;
          transform-origin: 50% 30%;
        }

        .creature-life[data-reaction="perk"] .creature-life__reaction {
          animation: creatureLifePerk 0.65s cubic-bezier(0.3, 1.4, 0.42, 1) both;
          transform-origin: 50% 100%;
        }

        .creature-life[data-reaction="concerned"] .creature-life__reaction {
          animation: creatureLifeConcerned 1.05s ease-in-out both;
        }

        .creature-life[data-reaction="alert"] .creature-life__reaction {
          transform: scale(1.02);
          transition: transform 180ms ease-out;
        }

        .creature-life[data-reaction="alert"] .creature-life__fidget,
        .creature-life[data-reaction="alert"] .creature-life__gaze {
          animation: none;
          transform: none;
        }

        .creature-life[data-reaction="excited"] .creature-life__reaction {
          animation: creatureLifeExcited 0.92s ease-in-out infinite;
          transform-origin: 50% 92%;
        }

        .creature-life__lid {
          background: var(--life-lid-color);
          border-radius: 50%;
          display: block;
          height: var(--life-eye-h);
          opacity: 0;
          pointer-events: none;
          position: absolute;
          transform: translate(-50%, -50%) scaleY(0.3);
          transition: opacity 55ms ease-in, transform 55ms ease-in;
          width: var(--life-eye-w);
        }

        .creature-life__lid--left {
          left: var(--life-eye-left-x);
          top: var(--life-eye-left-y);
        }

        .creature-life__lid--right {
          left: var(--life-eye-right-x);
          top: var(--life-eye-right-y);
        }

        .creature-life[data-blink="true"] .creature-life__lid {
          opacity: 1;
          transform: translate(-50%, -50%) scaleY(1);
        }

        .creature-life[data-blink="true"][data-has-anchors="false"] .creature-life__blink-squash {
          transform: scaleY(0.94);
          transform-origin: 50% 100%;
        }

        .creature-life[data-suppressed="true"] .creature-life__breathe,
        .creature-life[data-suppressed="true"] .creature-life__hover,
        .creature-life[data-suppressed="true"] .creature-life__sway,
        .creature-life[data-suppressed="true"] .creature-life__gaze,
        .creature-life[data-suppressed="true"] .creature-life__fidget,
        .creature-life[data-suppressed="true"] .creature-life__reaction,
        .creature-life[data-suppressed="true"] .creature-life__blink-squash {
          animation: none;
          transform: none;
          transition: none;
        }

        .creature-life[data-suppressed="true"] .creature-life__lid {
          opacity: 0;
        }

        @keyframes creatureLifeBreathe {
          0%, 100% { transform: scale(1, 1); }
          50% { transform: scale(1, var(--life-breathe-scale)); }
        }

        @keyframes creatureLifeHover {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(calc(var(--life-hover-amp) * -1)); }
        }

        @keyframes creatureLifeSway {
          0%, 100% { transform: rotate(calc(var(--life-sway-deg) * -1)); }
          50% { transform: rotate(var(--life-sway-deg)); }
        }

        @keyframes creatureLifeLookLeft {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          40%, 70% { transform: translateX(-3%) rotate(-4deg); }
        }

        @keyframes creatureLifeLookRight {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          40%, 70% { transform: translateX(3%) rotate(4deg); }
        }

        @keyframes creatureLifeHop {
          0%, 100% { transform: translateY(0) scale(1, 1); }
          30% { transform: translateY(-6%) scale(0.98, 1.04); }
          62% { transform: translateY(0) scale(1.03, 0.95); }
        }

        @keyframes creatureLifeShrinkPeek {
          0%, 100% { transform: scale(1); }
          38% { transform: scale(0.94) translateY(2%); }
          72% { transform: scale(1.01) translateY(-1%); }
        }

        @keyframes creatureLifeFidgetSway {
          0%, 100% { transform: rotate(0deg); }
          32% { transform: rotate(-2.4deg); }
          68% { transform: rotate(2.4deg); }
        }

        @keyframes creatureLifeChestUp {
          0%, 100% { transform: scale(1, 1) translateY(0); }
          45% { transform: scale(0.99, 1.05) translateY(-2%); }
        }

        @keyframes creatureLifeYawn {
          0%, 100% { transform: scale(1, 1); }
          40% { transform: scale(0.98, 1.06); }
          74% { transform: scale(1.02, 0.96); }
        }

        @keyframes creatureLifeEarWiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-1.6deg); }
          50% { transform: rotate(1.6deg); }
          75% { transform: rotate(-1deg); }
        }

        @keyframes creatureLifePerk {
          0% { transform: translateY(0) scale(1); }
          38% { transform: translateY(-4%) scale(1.05); }
          70% { transform: translateY(-1%) scale(1.01); }
          100% { transform: translateY(0) scale(1); }
        }

        @keyframes creatureLifeConcerned {
          0%, 100% { transform: rotate(0deg) translateX(0); }
          35%, 70% { transform: rotate(-3deg) translateX(-2%); }
        }

        @keyframes creatureLifeExcited {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50% { transform: translateY(-3%) rotate(1deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .creature-life__breathe {
            animation-duration: calc(var(--life-breathe-period) * 2);
            animation-name: creatureLifeBreatheReduced;
          }

          .creature-life__hover,
          .creature-life__sway,
          .creature-life__fidget,
          .creature-life__reaction {
            animation: none;
          }

          .creature-life__gaze {
            transform: none;
            transition: none;
          }
        }

        @keyframes creatureLifeBreatheReduced {
          0%, 100% { transform: scale(1, 1); }
          50% { transform: scale(1, var(--life-breathe-scale-reduced)); }
        }
      `}</style>
    </div>
  );
}
