import { useCallback, useEffect, useRef, useState } from "react";
import type { RewardItem, VRREvent } from "../../../src/shared/vrrTypes";

const SYMBOLS = ["⭐", "💎", "👑", "⚡", "🌟", "🔮"];

/** Normalize timer handles when `@types/node` widens `setTimeout` return type. */
function st(cb: () => void, ms: number): number {
  return window.setTimeout(cb, ms) as unknown as number;
}
function si(cb: () => void, ms: number): number {
  return window.setInterval(cb, ms) as unknown as number;
}
function ct(id: number): void {
  window.clearTimeout(id);
}
function ci(id: number): void {
  window.clearInterval(id);
}

/** Fairy-shimmer style chime — short stacked sines. */
function playLockChime(): void {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    if (ac.state === "suspended") void ac.resume();
    const t0 = ac.currentTime;
    const scale = [523, 659, 784, 1047];
    scale.forEach((freq, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g);
      g.connect(ac.destination);
      o.type = "sine";
      o.frequency.setValueAtTime(freq, t0 + i * 0.08);
      g.gain.setValueAtTime(0, t0 + i * 0.08);
      g.gain.linearRampToValueAtTime(0.16, t0 + i * 0.08 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.08 + 0.22);
      o.start(t0 + i * 0.08);
      o.stop(t0 + i * 0.08 + 0.3);
    });
    setTimeout(() => ac.close(), 1200);
  } catch {
    /* ignore */
  }
}

type UiPhase = "dim" | "spin" | "pause" | "modal";

export interface SlotMachineOverlayProps {
  event: VRREvent | null;
  companionName: string;
  onClaim: (reward: RewardItem) => void;
  onPhase1Begin?: () => void;
}

/**
 * Four-phase VRR UI. `triggerReason` is never shown (analytics only).
 */
export function SlotMachineOverlay({
  event,
  companionName: _companionName,
  onClaim,
  onPhase1Begin,
}: SlotMachineOverlayProps) {
  void _companionName;
  const [phase, setPhase] = useState<UiPhase | null>(null);
  const [reels, setReels] = useState<[string, string, string]>(["⭐", "⭐", "⭐"]);
  const [locked, setLocked] = useState<[boolean, boolean, boolean]>([false, false, false]);
  /** Browser timer ids (DOM `number`). */
  const timersRef = useRef<number[]>([]);
  const intervalRef = useRef<number | null>(null);

  const clearTimers = () => {
    for (const t of timersRef.current) ct(t);
    timersRef.current = [];
    if (intervalRef.current != null) {
      ci(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const runSequence = useCallback(() => {
    if (!event) return;
    clearTimers();
    setPhase("dim");
    onPhase1Begin?.();
    timersRef.current.push(
      st(() => {
        setPhase("spin");
        setLocked([false, false, false]);
        let ticks = 0;
        intervalRef.current = si(() => {
          ticks++;
          setReels([
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!,
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!,
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!,
          ]);
          if (ticks > 24) {
            if (intervalRef.current != null) {
              ci(intervalRef.current);
            }
            intervalRef.current = null;
            playLockChime();
            setLocked([true, false, false]);
            setReels((r) => [event.reward.icon, r[1]!, r[2]!]);
            timersRef.current.push(
              st(() => {
                playLockChime();
                setLocked([true, true, false]);
                setReels((r) => [r[0]!, event.reward.icon, r[2]!]);
                timersRef.current.push(
                  st(() => {
                    playLockChime();
                    setLocked([true, true, true]);
                    setReels([
                      event.reward.icon,
                      event.reward.icon,
                      event.reward.icon,
                    ]);
                    timersRef.current.push(
                      st(() => {
                        setPhase("pause");
                        timersRef.current.push(st(() => setPhase("modal"), 300));
                      }, 320),
                    );
                  }, 700),
                );
              }, 700),
            );
          }
        }, 80);
      }, 500),
    );
  }, [event, onPhase1Begin]);

  useEffect(() => {
    if (!event) {
      setPhase(null);
      clearTimers();
      return;
    }
    runSequence();
    return () => {
      clearTimers();
    };
  }, [event, runSequence]);

  if (!event || !phase) return null;

  const tierLabel = `Tier ${event.tier}`;

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center pointer-events-auto">
      <div
        className={`absolute inset-0 transition-[background] duration-500 ${
          phase === "dim" ? "bg-black/70" : "bg-black/80"
        }`}
        aria-hidden
      />

      {phase !== "modal" && (
        <div className="relative z-10 max-w-xl px-6 text-center">
          {phase === "dim" && (
            <p className="animate-[vrrFadeIn_0.5s_ease-out_forwards] text-xl font-bold tracking-wide text-white opacity-0 drop-shadow-lg sm:text-2xl">
              SOMETHING SPECIAL JUST HAPPENED…
            </p>
          )}
          {(phase === "spin" || phase === "pause") && (
            <div className="mt-6 flex justify-center gap-5">
              {reels.map((s, i) => (
                <div
                  key={i}
                  className={`flex h-28 w-20 items-center justify-center rounded-xl border-2 text-5xl leading-none shadow-lg transition-[box-shadow,border-color] duration-200 ${
                    locked[i]
                      ? "border-amber-400 bg-indigo-950 shadow-[0_0_20px_rgba(251,191,36,0.45)]"
                      : "border-indigo-700 bg-indigo-950/80"
                  }`}
                >
                  {s}
                </div>
              ))}
            </div>
          )}
          {phase === "pause" && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              aria-hidden
            >
              <div className="animate-[vrrConfetti_0.45s_ease-out_forwards] text-6xl">
                ✨
              </div>
            </div>
          )}
        </div>
      )}

      {phase === "modal" && (
        <div className="relative z-20 mx-4 w-full max-w-md animate-[vrrFadeIn_0.35s_ease-out_forwards] rounded-2xl bg-zinc-900 p-8 text-center text-white shadow-2xl ring-1 ring-amber-500/40">
          <div className="mb-2 text-6xl" aria-hidden>
            {event.reward.icon}
          </div>
          <h2 className="text-2xl font-bold">{event.reward.name}</h2>
          <p className="mt-2 text-sm text-zinc-300">{event.reward.description}</p>
          <div className="mt-4 inline-block rounded-full bg-amber-500/20 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100">
            {tierLabel}
          </div>
          <button
            type="button"
            className="mt-8 w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-4 text-lg font-extrabold text-zinc-900 shadow-lg transition hover:brightness-110 active:scale-[0.99]"
            onClick={() => onClaim(event.reward)}
          >
            TAP TO CLAIM ✨
          </button>
        </div>
      )}

      <style>{`
        @keyframes vrrFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes vrrConfetti {
          0% { opacity: 0; transform: scale(0.5) rotate(-8deg); }
          50% { opacity: 1; transform: scale(1.2) rotate(4deg); }
          100% { opacity: 0.85; transform: scale(1) rotate(0); }
        }
      `}</style>
    </div>
  );
}
