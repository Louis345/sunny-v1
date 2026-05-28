import type { ReactNode } from "react";
import type { PostActivityAction } from "../../../src/engine/choiceEvents";

export type PostActivityOutcome = {
  completed: boolean;
  accuracy?: number;
  activePlayTimeMs?: number;
  frustrationScore?: number;
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
  children?: ReactNode;
  onAction: (action: PostActivityAction) => void;
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
  children,
  onAction,
}: PostActivityEngagementOverlayProps) {
  const fallbackStats: PostActivityStat[] = [
    ...(accuracyLabel(outcome.accuracy)
      ? [{ label: "accuracy", value: accuracyLabel(outcome.accuracy)! }]
      : []),
    ...(secondsLabel(outcome.activePlayTimeMs)
      ? [{ label: "time", value: secondsLabel(outcome.activePlayTimeMs)! }]
      : []),
  ];
  const visibleStats = stats ?? fallbackStats;

  return (
    <div
      data-testid="post-activity-engagement-overlay"
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center px-6 text-center text-white"
      style={{
        background: "rgba(5, 7, 12, 0.62)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        pointerEvents: "auto",
      }}
    >
      <div
        className="w-full max-w-3xl border border-white/15 bg-slate-950/80 p-8 shadow-2xl"
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

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {canReplay ? (
            <button
              type="button"
              className="bg-amber-400 px-5 py-3 text-lg font-black text-slate-950 shadow-lg"
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
          <button
            type="button"
            className="border border-white/25 bg-white/10 px-5 py-3 text-lg font-black text-white"
            style={{ borderRadius: 8 }}
            onClick={() => onAction("back_to_map")}
          >
            Back to map
          </button>
        </div>
      </div>
    </div>
  );
}
