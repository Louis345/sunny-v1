import { useCallback, useMemo, useState } from "react";
import type { RewardDiagEvent } from "../types/rewardDiag";

/** Stable labels for tests / snapshots. */
export const REWARD_TRIGGER_BUTTON_LABELS = [
  "+10 XP — correct attempt",
  "+25 XP — mastered word",
  "+5 XP  — session complete",
  "+50 XP — Wilson step",
  "+50 XP — castle bonus",
  "⚡ Level up",
] as const;

const TRIGGERS: Array<{
  type:
    | "correct_attempt"
    | "mastered_word"
    | "session_complete"
    | "wilson_step"
    | "castle_bonus"
    | "level_up";
  label: string;
}> = [
  { type: "correct_attempt", label: REWARD_TRIGGER_BUTTON_LABELS[0] },
  { type: "mastered_word", label: REWARD_TRIGGER_BUTTON_LABELS[1] },
  { type: "session_complete", label: REWARD_TRIGGER_BUTTON_LABELS[2] },
  { type: "wilson_step", label: REWARD_TRIGGER_BUTTON_LABELS[3] },
  { type: "castle_bonus", label: REWARD_TRIGGER_BUTTON_LABELS[4] },
  { type: "level_up", label: REWARD_TRIGGER_BUTTON_LABELS[5] },
];

type Flash = "ok" | "err" | null;

function resolveChildId(propChildId: string): string {
  const fromProp = propChildId.trim();
  if (fromProp) return fromProp.toLowerCase();
  if (typeof window === "undefined") return "";
  try {
    const q = new URLSearchParams(window.location.search).get("childId");
    return (q ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}

export function RewardTriggerPanel({
  childId,
  enabled = true,
}: {
  childId: string;
  /** When false, render nothing (for tests / gate). */
  enabled?: boolean;
}) {
  const [flashByType, setFlashByType] = useState<Record<string, Flash>>({});

  const effectiveChildId = useMemo(
    () => resolveChildId(childId),
    [childId],
  );

  const fire = useCallback(
    async (type: (typeof TRIGGERS)[number]["type"]) => {
      if (!effectiveChildId) {
        console.error(
          "  🎮 [RewardTriggerPanel] missing childId (prop or ?childId=)",
        );
        return;
      }
      try {
        const res = await fetch("/api/diag/trigger-reward", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, childId: effectiveChildId }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          event?: RewardDiagEvent;
          error?: string;
        };
        if (!res.ok || !data.ok || !data.event) {
          console.error("  🎮 [RewardTriggerPanel] trigger failed", res.status, data);
          setFlashByType((m) => ({ ...m, [type]: "err" }));
          window.setTimeout(() => {
            setFlashByType((m) => ({ ...m, [type]: null }));
          }, 450);
          return;
        }
        window.dispatchEvent(
          new CustomEvent<RewardDiagEvent>("sunny-reward-diag-push", {
            detail: data.event,
          }),
        );
        setFlashByType((m) => ({ ...m, [type]: "ok" }));
        window.setTimeout(() => {
          setFlashByType((m) => ({ ...m, [type]: null }));
        }, 450);
      } catch (e) {
        console.error("  🎮 [RewardTriggerPanel] request error", e);
        setFlashByType((m) => ({ ...m, [type]: "err" }));
        window.setTimeout(() => {
          setFlashByType((m) => ({ ...m, [type]: null }));
        }, 450);
      }
    },
    [effectiveChildId],
  );

  if (!enabled) return null;

  return (
    <div
      className="reward-trigger-panel"
      data-testid="reward-trigger-panel"
      style={{
        position: "fixed",
        left: 0,
        bottom: 0,
        zIndex: 9998,
        width: 200,
        padding: "0.5rem",
        pointerEvents: "auto",
        fontSize: "0.75rem",
        lineHeight: 1.25,
        background:
          "color-mix(in oklch, var(--reward-diag-surface, Canvas) 82%, transparent)",
        color: "var(--reward-diag-foreground, CanvasText)",
        border:
          "1px solid color-mix(in oklch, var(--reward-diag-foreground, CanvasText) 22%, transparent)",
        borderLeft: "none",
        borderBottom: "none",
        borderTopRightRadius: "var(--reward-diag-radius, 0.5rem)",
        boxShadow:
          "var(--reward-diag-shadow, 0 -4px 20px color-mix(in oklch, var(--reward-diag-foreground, CanvasText) 8%, transparent))",
      }}
    >
      <div
        className="font-semibold mb-1.5"
        style={{ color: "var(--reward-diag-foreground, CanvasText)" }}
      >
        Reward Triggers
      </div>
      <div className="flex flex-col gap-1">
        {TRIGGERS.map(({ type, label }) => {
          const flash = flashByType[type];
          const bg =
            "color-mix(in oklch, var(--reward-diag-foreground, CanvasText) 8%, transparent)";
          const outline =
            flash === "ok"
              ? "2px solid Highlight"
              : flash === "err"
                ? "2px solid Mark"
                : "2px solid transparent";
          return (
            <button
              key={type}
              type="button"
              disabled={!effectiveChildId}
              className="w-full text-left rounded px-2 py-1.5 transition-[outline-color] duration-300 disabled:opacity-40"
              style={{
                background: bg,
                color: "var(--reward-diag-foreground, CanvasText)",
                border:
                  "1px solid color-mix(in oklch, var(--reward-diag-foreground, CanvasText) 15%, transparent)",
                outline,
                outlineOffset: 1,
              }}
              onClick={() => void fire(type)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
