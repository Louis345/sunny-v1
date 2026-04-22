import type { RewardDiagEvent } from "../types/rewardDiag";

const MAX_VISIBLE = 6;
const PANEL_W = 280;

const fadeKeyframes = `
@keyframes reward-diag-row-fade {
  0%, 94% { opacity: 1; }
  100% { opacity: 0; }
}
`;

function sortNewestFirst(events: RewardDiagEvent[]): RewardDiagEvent[] {
  return [...events].sort((a, b) => b.timestamp - a.timestamp);
}

export function RewardDiagOverlay({ events }: { events: RewardDiagEvent[] }) {
  const visible = sortNewestFirst(events).slice(0, MAX_VISIBLE);

  return (
    <div
      className="reward-diag-overlay"
      data-testid="reward-diag-overlay"
      style={{
        position: "fixed",
        right: 0,
        bottom: 0,
        zIndex: 9999,
        width: PANEL_W,
        maxHeight: "min(70vh, 28rem)",
        padding: "0.5rem",
        fontSize: "0.7rem",
        lineHeight: 1.3,
        pointerEvents: "none",
        overflow: "auto",
        // Semantic tokens; override in parent/theme via these variables
        // (no hardcoded fill colors — use system / CSS colors only)
        background: "color-mix(in oklch, var(--reward-diag-surface, Canvas) 82%, transparent)",
        color: "var(--reward-diag-foreground, CanvasText)",
        border: "1px solid color-mix(in oklch, var(--reward-diag-foreground, CanvasText) 22%, transparent)",
        borderRight: "none",
        borderBottom: "none",
        fontFamily: "var(--reward-diag-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)",
        borderTopLeftRadius: "var(--reward-diag-radius, 0.5rem)",
        boxShadow: "var(--reward-diag-shadow, 0 -4px 20px color-mix(in oklch, var(--reward-diag-foreground, CanvasText) 8%, transparent))",
      }}
    >
      <style>{fadeKeyframes}</style>
      <ul className="m-0 list-none p-0 flex flex-col gap-1.5">
        {visible.map((ev) => (
          <li
            key={ev.diagId ?? `${ev.timestamp}\u00a0${ev.type}\u00a0${jsonKey(ev.payload)}`}
            data-testid="reward-diag-entry"
            className="reward-diag-entry rounded px-1.5 py-1"
            style={{
              background: "color-mix(in oklch, var(--reward-diag-entry-bg, var(--reward-diag-foreground, CanvasText)) 6%, transparent)",
              animation: "reward-diag-row-fade 8s linear forwards",
            }}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className="shrink-0 rounded px-1 py-0.5 text-[0.65rem] uppercase tracking-wide"
                style={{
                  background: "color-mix(in oklch, var(--reward-diag-badge, var(--reward-diag-foreground, CanvasText)) 14%, transparent)",
                  color: "var(--reward-diag-foreground, CanvasText)",
                }}
              >
                {ev.type}
              </span>
            </div>
            <pre
              className="m-0 max-h-24 overflow-auto text-[0.65rem] whitespace-pre-wrap break-all"
              style={{ color: "var(--reward-diag-foreground, CanvasText)" }}
            >
              {stringifyPayload(ev.payload)}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}

function jsonKey(p: Record<string, unknown>): string {
  try {
    return JSON.stringify(p);
  } catch {
    return String(p);
  }
}

function stringifyPayload(p: Record<string, unknown>): string {
  try {
    return JSON.stringify(p, null, 2);
  } catch {
    return String(p);
  }
}
