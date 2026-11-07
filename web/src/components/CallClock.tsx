import { useCallback, useEffect, useRef, useState } from "react";

/** Spending elsewhere in the call (the outfit shop) announces her new saved balance with this event. */
export const COINS_CHANGED_EVENT = "sunny:coins-changed";
export type CoinsChangedDetail = { childId: string; coins: number };

/** A moment Elli reacts to in her own words; the server supplies the facts. */
export type CallClockMoment = "minute_left" | "time_up" | "minutes_bought";

type Clock = { minutesLeft: number; coins: number; price: number; minutes: number; warnAtSecondsLeft: number };
type Phase = "loading" | "running" | "out" | "buying";
/** A call is a few minutes; this caps the paid minutes one call can ever request (Law 2). */
const MAX_MINUTES_PER_CALL = 120;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return response.json() as Promise<T>;
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * The earned call's clock (owner, 2026-11-07). Finishing a board earns free minutes; each minute is paid
 * on the server before it is used, so a reload cannot reset it. When time runs out she buys more with
 * coins or says goodbye, so coins mean something and she wants to come back and earn again.
 */
export function CallClock({ childId, callId, active, onMoment, onGoodbye }: {
  childId: string;
  callId: string;
  active: boolean;
  onMoment: (moment: CallClockMoment) => void;
  onGoodbye: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [clock, setClock] = useState<Clock | null>(null);
  const [secondsInMinute, setSecondsInMinute] = useState(0);
  const minuteIndex = useRef(0);
  const buyIndex = useRef(0);
  const warned = useRef(false);
  const paying = useRef(false);
  const onMomentRef = useRef(onMoment);
  onMomentRef.current = onMoment;

  const payNextMinute = useCallback(async (): Promise<boolean> => {
    if (paying.current || minuteIndex.current >= MAX_MINUTES_PER_CALL) return false;
    paying.current = true;
    minuteIndex.current += 1;
    const receiptId = `call:${callId}:${minuteIndex.current}`;
    try {
      const result = await postJson<{ ok: boolean; minutesLeft?: number; coins: number }>("/api/rewards/call/minute", { childId, receiptId });
      if (!result.ok) {
        minuteIndex.current -= 1;
        setClock((prior) => prior && { ...prior, minutesLeft: 0, coins: result.coins });
        setPhase("out");
        console.log(` 🎮 [call-clock] [minute] [out] child=${childId}`);
        onMomentRef.current("time_up");
        return false;
      }
      setClock((prior) => prior && { ...prior, minutesLeft: result.minutesLeft ?? 0, coins: result.coins });
      setSecondsInMinute(60);
      setPhase("running");
      console.log(` 🎮 [call-clock] [minute] [paid] child=${childId} receipt=${receiptId} left=${result.minutesLeft}`);
      return true;
    } catch (error) {
      minuteIndex.current -= 1;
      console.error(` 🎮 [call-clock] [minute] [failed] child=${childId}`, error);
      setPhase("out");
      return false;
    } finally {
      paying.current = false;
    }
  }, [callId, childId]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch(`/api/rewards/call/${encodeURIComponent(childId)}`)
      .then((response) => response.json() as Promise<Clock>)
      .then((loaded) => {
        if (cancelled) return;
        setClock(loaded);
        void payNextMinute();
      })
      .catch((error: unknown) => console.error(` 🎮 [call-clock] [load] [failed] child=${childId}`, error));
    return () => { cancelled = true; };
  }, [active, childId, payNextMinute]);

  useEffect(() => {
    const onCoins = (event: Event) => {
      const detail = (event as CustomEvent<CoinsChangedDetail>).detail;
      if (detail?.childId !== childId || !Number.isFinite(detail.coins)) return;
      setClock((prior) => prior && { ...prior, coins: detail.coins });
    };
    window.addEventListener(COINS_CHANGED_EVENT, onCoins);
    return () => window.removeEventListener(COINS_CHANGED_EVENT, onCoins);
  }, [childId]);

  useEffect(() => {
    if (!active || phase !== "running") return;
    const timer = window.setInterval(() => setSecondsInMinute((seconds) => seconds - 1), 1000);
    return () => window.clearInterval(timer);
  }, [active, phase]);

  useEffect(() => {
    if (phase !== "running" || !clock) return;
    const total = secondsInMinute + clock.minutesLeft * 60;
    if (!warned.current && total > 0 && total <= clock.warnAtSecondsLeft) {
      warned.current = true;
      onMomentRef.current("minute_left");
    }
    if (secondsInMinute <= 0) void payNextMinute();
  }, [clock, payNextMinute, phase, secondsInMinute]);

  const buyMinutes = async () => {
    if (!clock || clock.coins < clock.price || phase !== "out") return;
    setPhase("buying");
    buyIndex.current += 1;
    const receiptId = `call:${callId}:buy:${buyIndex.current}`;
    try {
      const result = await postJson<{ ok: boolean; balance?: number; callMinutes?: number }>("/api/rewards/purchase", {
        childId, receiptId, offer: { kind: "call_minutes", minutes: 5 },
      });
      if (!result.ok) {
        console.log(` 🎮 [call-clock] [buy] [refused] child=${childId}`);
        setPhase("out");
        return;
      }
      setClock((prior) => prior && { ...prior, coins: result.balance ?? prior.coins, minutesLeft: result.callMinutes ?? prior.minutesLeft });
      warned.current = false;
      console.log(` 🎮 [call-clock] [buy] [paid] child=${childId} receipt=${receiptId}`);
      if (await payNextMinute()) onMomentRef.current("minutes_bought");
    } catch (error) {
      console.error(` 🎮 [call-clock] [buy] [failed] child=${childId}`, error);
      setPhase("out");
    }
  };

  if (!active || !clock) return null;
  const total = phase === "running" ? secondsInMinute + clock.minutesLeft * 60 : 0;
  const short = Math.max(0, clock.price - clock.coins);
  return (
    <div className="pointer-events-auto fixed right-4 top-4 z-[1000] flex flex-col items-end gap-2" data-testid="call-clock">
      <div className="flex items-center gap-3 rounded-full bg-black/60 px-4 py-2 text-white shadow-lg">
        <span aria-label="Call time left" className={`font-mono text-lg ${total > 0 && total <= clock.warnAtSecondsLeft ? "text-amber-300" : ""}`}>
          {formatClock(total)}
        </span>
        <span aria-label="Coins" className="flex items-center gap-1 text-amber-200">
          <span aria-hidden>🪙</span><span>{clock.coins}</span>
        </span>
      </div>
      {(phase === "out" || phase === "buying") && (
        <div role="dialog" aria-label="Call time is up" className="w-72 rounded-2xl bg-white/95 p-4 text-slate-900 shadow-xl">
          <p className="text-lg font-bold">Time's up!</p>
          <button
            type="button"
            className="mt-3 w-full rounded-xl bg-amber-400 px-4 py-2 font-semibold disabled:opacity-50"
            disabled={short > 0 || phase === "buying"}
            onClick={() => void buyMinutes()}
          >
            5 more minutes · {clock.price} 🪙
          </button>
          {short > 0 && <p className="mt-2 text-sm text-slate-600">You need {short} more coins. Finish a board to earn more.</p>}
          <button type="button" className="mt-2 w-full rounded-xl bg-slate-200 px-4 py-2 font-semibold" onClick={onGoodbye}>
            Say goodbye
          </button>
        </div>
      )}
    </div>
  );
}
