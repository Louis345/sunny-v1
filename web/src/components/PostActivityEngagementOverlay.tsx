import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PostActivityAction } from "../../../src/engine/choiceEvents";
import "./PostActivityEngagementOverlay.css";

export type PostActivityOutcome = {
  completed: boolean;
  /** Internal timestamp used to measure an explicit post-activity decision; never updated by hover. */
  decisionStartedAtMs?: number;
  accuracy?: number;
  activePlayTimeMs?: number;
  frustrationScore?: number;
  demoRequested?: boolean;
  demoReplayCount?: number;
  timeToFirstValidActionMs?: number;
  invalidActionCount?: number;
  soundMuted?: boolean;
};

export type PostActivityStat = {
  label: string;
  value: string | number;
};

export type PostActivityEngagementOverlayProps = {
  title: string;
  outcome: PostActivityOutcome;
  stats?: PostActivityStat[];
  canReplay?: boolean;
  canTryHarder?: boolean;
  showBackAction?: boolean;
  children?: ReactNode;
  onAction: (action: PostActivityAction) => void;
  /** A finished stop needs no summary (owner, 2026-11-10: no stars popup): after any treasure, she goes straight
   * back to her map. Called once; without it the summary panel is shown. */
  onFinished?: () => void;
  /** The stop's reward is still being saved (a Discovery or probe chest comes back after the result): wait for it,
   * so a chest never arrives on a screen that is already closing. */
  holdFinish?: boolean;
  coinAward?: { amount: number; balance: number } | null;
  onOpenVideoCall?: (() => void) | null;
  /** The chest she earned (owner, 2026-11-07): shown alone, center stage, before the summary. `finish` moves on. */
  treasure?: ((finish: () => void) => ReactNode) | null;
};

function accuracyLabel(value: number | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const ratio = value > 1 ? value / 100 : value;
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}

function secondsLabel(value: number | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Math.max(0, Math.round(value / 1000))}s`;
}

export function PostActivityEngagementOverlay({
  title,
  outcome,
  stats,
  canReplay = true,
  canTryHarder = false,
  showBackAction = true,
  children,
  onAction,
  onFinished,
  holdFinish = false,
  coinAward,
  onOpenVideoCall,
  treasure,
}: PostActivityEngagementOverlayProps) {
  const [treasureDone, setTreasureDone] = useState(false);
  const finishedRef = useRef(false);
  const finishesByItself = Boolean(outcome.completed && onFinished);
  const treasureShowing = Boolean(treasure && !treasureDone);
  useEffect(() => {
    if (!finishesByItself || holdFinish || treasureShowing || finishedRef.current) return;
    finishedRef.current = true;
    console.log(` 🎮 [post-activity] [finished] [back-to-map] title=${title}`);
    onFinished?.();
  }, [finishesByItself, holdFinish, onFinished, title, treasureShowing]);
  const fallbackStats: PostActivityStat[] = [
    ...(accuracyLabel(outcome.accuracy)
      ? [{ label: "accuracy", value: accuracyLabel(outcome.accuracy)! }]
      : []),
    ...(secondsLabel(outcome.activePlayTimeMs)
      ? [{ label: "time", value: secondsLabel(outcome.activePlayTimeMs)! }]
      : []),
  ];
  const visibleStats = stats ?? fallbackStats;

  if (treasure && !treasureDone) {
    return (
      <div
        data-testid="post-activity-treasure-stage"
        className="post-activity-treasure-stage fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden px-6 text-center text-white"
        style={{ pointerEvents: "auto" }}
      >
        <div className="post-activity-treasure-stage__sparkles" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => <span key={index} style={{ ["--i" as string]: index }} />)}
        </div>
        <p className="relative text-sm font-black uppercase tracking-widest text-amber-200">{title}</p>
        <h1 className="relative mt-1 text-4xl font-black">You found a treasure!</h1>
        <div className="relative mt-6">{treasure(() => setTreasureDone(true))}</div>
      </div>
    );
  }

  if (finishesByItself && holdFinish) {
    return (
      <div data-testid="post-activity-saving" className="post-activity-treasure-stage fixed inset-0 z-[120] flex flex-col items-center justify-center px-6 text-center text-white" style={{ pointerEvents: "auto" }}>
        <p className="text-sm font-black uppercase tracking-widest text-amber-200">{title}</p>
        <h1 className="mt-1 text-3xl font-black">Saving your treasure…</h1>
      </div>
    );
  }
  if (finishesByItself) return null;

  return (
    <div
      data-testid="post-activity-engagement-overlay"
      // Scrolls when its content is taller than the screen; my-auto centres it when it fits.
      className="fixed inset-0 z-[120] flex flex-col items-center overflow-y-auto px-6 py-6 text-center text-white"
      style={{
        background: "rgba(5, 7, 12, 0.62)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        pointerEvents: "auto",
      }}
    >
      <div
        className="my-auto w-full max-w-3xl border border-white/15 bg-slate-950/80 p-8 shadow-2xl"
        style={{ borderRadius: 8 }}
      >
        <p className="text-xs font-black uppercase text-amber-300">
          {outcome.completed ? "Run Complete" : "Run Stopped"}
        </p>
        <h1 className="mt-2 text-4xl font-black">{title}</h1>

        {visibleStats.length > 0 ? (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {visibleStats.map((stat) => (
              <div
                key={stat.label}
                className="min-w-28 border border-white/10 bg-white/10 px-5 py-4"
                style={{ borderRadius: 8 }}
              >
                <div className="text-3xl font-black leading-none">{stat.value}</div>
                <div className="mt-1 text-xs font-bold uppercase text-white/65">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {children ? <div className="mt-5">{children}</div> : null}

        {coinAward ? (
          <div className="mt-5" aria-label="Confirmed Sunny Coin award">
            <div className="text-2xl font-black text-amber-300">
              +{coinAward.amount} Sunny Coins
            </div>
            <div className="mt-1 text-sm font-bold text-white/70">
              Balance: {coinAward.balance}
            </div>
          </div>
        ) : null}

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {/* Moving on is the main choice; replay stays one tap away. */}
          {showBackAction ? (
            <button
              type="button"
              data-primary="true"
              className="bg-amber-400 px-5 py-3 text-lg font-black text-slate-950 shadow-lg"
              style={{ borderRadius: 8 }}
              onClick={() => onAction("back_to_map")}
            >
              Back to map
            </button>
          ) : null}
          {onOpenVideoCall ? (
            <button
              type="button"
              className="bg-cyan-400 px-5 py-3 text-lg font-black text-slate-950 shadow-lg"
              style={{ borderRadius: 8 }}
              onClick={onOpenVideoCall}
            >
              Call Elli
            </button>
          ) : null}
          {canReplay ? (
            <button
              type="button"
              className="border border-white/25 bg-white/10 px-5 py-3 text-lg font-black text-white"
              style={{ borderRadius: 8 }}
              onClick={() => onAction("replay_same")}
            >
              Play again
            </button>
          ) : null}
          {canTryHarder ? (
            <button
              type="button"
              aria-label="Harder replay"
              className="bg-violet-600 px-5 py-3 text-lg font-black text-white shadow-lg"
              style={{ borderRadius: 8 }}
              onClick={() => onAction("replay_harder")}
            >
              Try harder
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
