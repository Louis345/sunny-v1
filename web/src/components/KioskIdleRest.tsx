import { useEffect, useRef, useState } from "react";

const CHILD_ACTIVITY_MESSAGES = new Set([
  "attempt_event",
  "correct",
  "round_complete",
  "round_failed",
  "game_complete",
  "back_to_map",
  "map_back",
]);

export interface UseKioskIdleRestOptions {
  enabled: boolean;
  timeoutMs: number;
  activitySignal: string;
  onIdle: () => void;
}

export function useKioskIdleRest({
  enabled,
  timeoutMs,
  activitySignal,
  onIdle,
}: UseKioskIdleRestOptions): { resting: boolean } {
  const [resting, setResting] = useState(false);
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled) {
      setResting(false);
      return;
    }
    if (resting) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setResting(true);
        onIdleRef.current();
      }, timeoutMs);
    };
    const onMessage = (event: MessageEvent) => {
      const type =
        event.data && typeof event.data === "object"
          ? (event.data as { type?: unknown }).type
          : null;
      if (typeof type === "string" && CHILD_ACTIVITY_MESSAGES.has(type)) arm();
    };

    arm();
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    window.addEventListener("message", onMessage);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
      window.removeEventListener("message", onMessage);
    };
  }, [activitySignal, enabled, resting, timeoutMs]);

  return { resting };
}

export function KioskRestingScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="relative grid h-screen w-screen place-items-center overflow-hidden bg-[#071426] px-6 text-white">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#036b78] to-[#0795a4] opacity-90 sm:w-24"
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#036b78] to-[#0795a4] opacity-90 sm:w-24"
      />
      <section className="relative z-10 w-full max-w-xl rounded-3xl border border-cyan-100/20 bg-slate-900/85 px-7 py-10 text-center shadow-2xl backdrop-blur sm:px-12">
        <div
          aria-hidden="true"
          className="mx-auto mb-5 grid h-28 w-28 place-items-center rounded-full border-4 border-amber-100 bg-gradient-to-br from-cyan-100 to-amber-50 text-5xl shadow-[0_0_36px_rgba(103,232,249,0.45)]"
        >
          ☀️
        </div>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Sunny is resting</h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-blue-100">
          Tap Start when you are ready to learn again.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-7 min-h-14 rounded-2xl bg-amber-300 px-9 py-3 text-xl font-black text-slate-900 shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          Start Sunny
        </button>
        <p className="mt-5 text-sm font-semibold text-slate-300">
          Your completed work is saved.
        </p>
      </section>
    </main>
  );
}

