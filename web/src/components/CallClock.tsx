import { useCallback, useEffect, useRef, useState } from "react";
import { REWARD_GAMES } from "../../../src/shared/gameRegistry.generated";
import { ARCADE_RULES } from "../../../src/shared/rewardCatalog";

/** Spending elsewhere in the call (the outfit shop) announces her new saved balance with this event. */
export const COINS_CHANGED_EVENT = "sunny:coins-changed";
export type CoinsChangedDetail = { childId: string; coins: number };

/** A moment Elli reacts to in her own words; the server supplies the facts. */
export type CallClockMoment = "minute_left" | "time_up" | "minutes_bought";

/** secondsLeft is the saved time in seconds (call time is earned in seconds, 2026-11-10); older servers send minutes. */
type Clock = { minutesLeft: number; secondsLeft?: number; coins: number; price: number; minutes: number; warnAtSecondsLeft: number };
const savedSeconds = (clock: Clock): number => clock.secondsLeft ?? clock.minutesLeft * 60;
type Phase = "loading" | "running" | "out" | "buying";
/** What the paid minutes are spent on; both kinds use one meter on the server (owner, 2026-11-08). */
export type PaidTimeKind = "call" | "arcade";
type PurchaseOffer = { kind: "call_minutes"; minutes: 5 } | { kind: "game_play"; itemId: string; trial: boolean };
type PurchaseResult = { ok: boolean; balance?: number; callMinutes?: number; callSeconds?: number; arcadeMinutes?: number };

/** A call or a game is a few minutes; this caps the paid minutes one of them can ever request (Law 2). */
const MAX_PAID_MINUTES: Record<PaidTimeKind, number> = { call: 120, arcade: 30 };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return response.json() as Promise<T>;
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * The paid-time meter shared by the earned call and reward games. Each minute is paid on the server before it
 * is used, so a reload cannot reset it; when time runs out she buys more with coins or stops.
 */
function usePaidTimeClock({
  kind,
  childId,
  meterId,
  active,
  startWithoutMinutes,
  freeSeconds = 0,
  offer,
  onMoment,
}: {
  kind: PaidTimeKind;
  childId: string;
  /** One call or one game launch; receipts are `${kind}:${meterId}:${n}`. */
  meterId: string;
  active: boolean;
  /** "pay" starts paying at once (the call); "wait" shows the insert-coin screen when nothing is saved (games). */
  startWithoutMinutes: "pay" | "wait";
  /** Earned seconds that run before any paid minute (a reward stop's first play). */
  freeSeconds?: number;
  offer: () => PurchaseOffer;
  onMoment?: (moment: CallClockMoment) => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [clock, setClock] = useState<Clock | null>(null);
  const [secondsInMinute, setSecondsInMinute] = useState(0);
  const [everRan, setEverRan] = useState(false);
  const minuteIndex = useRef(0);
  const buyIndex = useRef(0);
  const warned = useRef(false);
  const paying = useRef(false);
  const onMomentRef = useRef(onMoment);
  onMomentRef.current = onMoment;
  const offerRef = useRef(offer);
  offerRef.current = offer;
  const tag = `${kind}-clock`;

  const payNextMinute = useCallback(async (): Promise<boolean> => {
    if (paying.current || minuteIndex.current >= MAX_PAID_MINUTES[kind]) return false;
    paying.current = true;
    minuteIndex.current += 1;
    const receiptId = `${kind}:${meterId}:${minuteIndex.current}`;
    try {
      const result = await postJson<{ ok: boolean; minutesLeft?: number; secondsLeft?: number; secondsGranted?: number; coins: number }>(`/api/rewards/${kind}/minute`, { childId, receiptId });
      if (!result.ok) {
        minuteIndex.current -= 1;
        setClock((prior) => prior && { ...prior, minutesLeft: 0, secondsLeft: 0, coins: result.coins });
        setPhase("out");
        console.log(` 🎮 [${tag}] [minute] [out] child=${childId}`);
        onMomentRef.current?.("time_up");
        return false;
      }
      const minutesLeft = result.minutesLeft ?? 0;
      setClock((prior) => prior && { ...prior, minutesLeft, secondsLeft: result.secondsLeft ?? minutesLeft * 60, coins: result.coins });
      setSecondsInMinute(result.secondsGranted ?? 60);
      setPhase("running");
      setEverRan(true);
      console.log(` 🎮 [${tag}] [minute] [paid] child=${childId} receipt=${receiptId} granted=${result.secondsGranted ?? 60}s left=${result.secondsLeft ?? minutesLeft * 60}s`);
      return true;
    } catch (error) {
      minuteIndex.current -= 1;
      console.error(` 🎮 [${tag}] [minute] [failed] child=${childId}`, error);
      setPhase("out");
      return false;
    } finally {
      paying.current = false;
    }
  }, [childId, kind, meterId, tag]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch(`/api/rewards/${kind}/${encodeURIComponent(childId)}`)
      .then((response) => response.json() as Promise<Clock>)
      .then((loaded) => {
        if (cancelled) return;
        setClock(loaded);
        if (freeSeconds > 0) {
          setSecondsInMinute(Math.floor(freeSeconds));
          setPhase("running");
          setEverRan(true);
          console.log(` 🎮 [${tag}] [start] [earned] child=${childId} seconds=${Math.floor(freeSeconds)}`);
          return;
        }
        if (startWithoutMinutes === "wait" && savedSeconds(loaded) < 1) {
          setPhase("out");
          console.log(` 🎮 [${tag}] [start] [needs-coin] child=${childId}`);
          return;
        }
        void payNextMinute();
      })
      .catch((error: unknown) => console.error(` 🎮 [${tag}] [load] [failed] child=${childId}`, error));
    return () => { cancelled = true; };
    // freeSeconds is read once per meter: the earned time is granted at launch, never re-granted on a rerender.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, childId, kind, payNextMinute, startWithoutMinutes, tag]);

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
    const total = secondsInMinute + savedSeconds(clock);
    if (!warned.current && total > 0 && total <= clock.warnAtSecondsLeft) {
      warned.current = true;
      onMomentRef.current?.("minute_left");
    }
    if (secondsInMinute <= 0) void payNextMinute();
  }, [clock, payNextMinute, phase, secondsInMinute]);

  const buy = async () => {
    if (!clock || clock.coins < clock.price || phase !== "out") return;
    setPhase("buying");
    buyIndex.current += 1;
    const receiptId = `${kind}:${meterId}:buy:${buyIndex.current}`;
    try {
      const result = await postJson<PurchaseResult>("/api/rewards/purchase", { childId, receiptId, offer: offerRef.current() });
      if (!result.ok) {
        console.log(` 🎮 [${tag}] [buy] [refused] child=${childId}`);
        setPhase("out");
        return;
      }
      const minutes = kind === "call" ? result.callMinutes : result.arcadeMinutes;
      const seconds = kind === "call" && result.callSeconds !== undefined ? result.callSeconds : minutes !== undefined ? minutes * 60 : undefined;
      setClock((prior) => prior && {
        ...prior,
        coins: result.balance ?? prior.coins,
        minutesLeft: seconds !== undefined ? Math.floor(seconds / 60) : prior.minutesLeft,
        secondsLeft: seconds ?? savedSeconds(prior),
      });
      warned.current = false;
      console.log(` 🎮 [${tag}] [buy] [paid] child=${childId} receipt=${receiptId}`);
      if (await payNextMinute()) onMomentRef.current?.("minutes_bought");
    } catch (error) {
      console.error(` 🎮 [${tag}] [buy] [failed] child=${childId}`, error);
      setPhase("out");
    }
  };

  const total = phase === "running" && clock ? secondsInMinute + savedSeconds(clock) : 0;
  const short = clock ? Math.max(0, clock.price - clock.coins) : 0;
  return { phase, clock, total, short, everRan, buy };
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
  const { phase, clock, total, short, buy } = usePaidTimeClock({
    kind: "call",
    childId,
    meterId: callId,
    active,
    startWithoutMinutes: "pay",
    offer: () => ({ kind: "call_minutes", minutes: 5 }),
    onMoment,
  });

  if (!active || !clock) return null;
  return (
    // Bottom-left: the call's X, "Back to the call", Games and Go Shopping all live top-right (owner 2026-11-12).
    <>
    <div className="pointer-events-auto fixed bottom-4 left-4 z-[1000]" data-testid="call-clock">
      <div className="flex items-center gap-3 rounded-full bg-black/60 px-4 py-2 text-white shadow-lg">
        <span aria-label="Call time left" className={`font-mono text-lg ${total > 0 && total <= clock.warnAtSecondsLeft ? "text-amber-300" : ""}`}>
          {formatClock(total)}
        </span>
        <span aria-label="Coins" className="flex items-center gap-1 text-amber-200">
          <span aria-hidden>🪙</span><span>{clock.coins}</span>
        </span>
      </div>
    </div>
      {(phase === "out" || phase === "buying") && (
        <div className="pointer-events-auto fixed inset-0 z-[1000] flex items-center justify-center bg-black/30">
        <div role="dialog" aria-label="Call time is up" className="w-80 rounded-2xl bg-white/95 p-5 text-slate-900 shadow-xl">
          <p className="text-lg font-bold">Time's up!</p>
          <button
            type="button"
            className="mt-3 w-full rounded-xl bg-amber-400 px-4 py-2 font-semibold disabled:opacity-50"
            disabled={short > 0 || phase === "buying"}
            onClick={() => void buy()}
          >
            5 more minutes · {clock.price} 🪙
          </button>
          {short > 0 && <p className="mt-2 text-sm text-slate-600">You need {short} more coins. Finish a board to earn more.</p>}
          <button type="button" className="mt-2 w-full rounded-xl bg-slate-200 px-4 py-2 font-semibold" onClick={onGoodbye}>
            Say goodbye
          </button>
        </div>
        </div>
      )}
    </>
  );
}

/**
 * Whether the session canvas times this game (owner, 2026-11-08). Reward games Elli opens in the live session
 * cost coins: the canvas must carry the live session's child id. Board reward stops run in the App's
 * planner-board frame and are timed there (rewardBreakArcadeTerms). Teaching and learning games are never timed.
 */
export function shouldTimeArcadeGame(input: { arcadeChildId?: string; mode: string; gameUrl?: string }): boolean {
  return Boolean(input.arcadeChildId?.trim() && input.gameUrl && arcadeItemIdForMode(input.mode));
}

/**
 * A board stop's arcade terms (2026-11-10, after Ila replayed a finished mystery stop for free, without end): the
 * first play of a reward stop is earned by the stops before it and runs ARCADE_RULES.earnedMinutesFirstPlay free;
 * replaying a finished reward stop is paid on the arcade meter. Learning stops are not arcade time: null.
 */
export function rewardBreakArcadeTerms(node: { type: string; isCompleted?: boolean }): { freeSeconds: number } | null {
  if (node.type !== "mystery") return null;
  return { freeSeconds: node.isCompleted ? 0 : ARCADE_RULES.earnedMinutesFirstPlay * 60 };
}

/** Every registered reward game is timed (owner, 2026-11-08); teaching and learning games never are. */
export function arcadeItemIdForMode(mode: string): string | null {
  return Object.prototype.hasOwnProperty.call(REWARD_GAMES, mode) ? `game:${mode}` : null;
}

/**
 * The reward-game clock (owner, 2026-11-08): 25 coins buys 3 minutes on the call's paid-minute meter. The game
 * is blocked until she inserts a coin, warns at a minute left, and at time up asks for another coin or sends her
 * back to her map (the same game_complete the games send, so the session ends the reward game the normal way).
 */
export function ArcadeClock({ childId, playId, gameMode, active, freeSeconds = 0, onLeave }: {
  childId: string;
  /** Earned seconds before the paid meter starts (a reward stop's first play); 0 waits for a coin. */
  freeSeconds?: number;
  /** One game launch; receipts are arcade:${playId}:${n}. */
  playId: string;
  gameMode: string;
  active: boolean;
  onLeave: () => void;
}) {
  const itemId = arcadeItemIdForMode(gameMode) ?? `game:${gameMode}`;
  const [owned, setOwned] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch(`/api/rewards/wallet/${encodeURIComponent(childId)}`)
      .then((response) => response.json() as Promise<{ ownedRewardIds?: string[] }>)
      .then((wallet) => {
        if (!cancelled) setOwned(Boolean(wallet.ownedRewardIds?.includes(itemId)));
      })
      .catch((error: unknown) => console.error(` 🎮 [arcade-clock] [wallet] [failed] child=${childId}`, error));
    return () => { cancelled = true; };
  }, [active, childId, itemId]);

  const { phase, clock, total, short, everRan, buy } = usePaidTimeClock({
    kind: "arcade",
    childId,
    meterId: playId,
    active,
    startWithoutMinutes: "wait",
    freeSeconds,
    offer: () => ({ kind: "game_play", itemId, trial: !owned }),
  });

  if (!active) return null;
  const blocked = phase !== "running";
  const leave = () => {
    console.log(` 🎮 [arcade-clock] [leave] [back-to-map] child=${childId} game=${gameMode}`);
    onLeave();
    window.postMessage({ type: "game_complete", reason: "arcade_time_up" }, "*");
  };

  return (
    <>
      {clock && phase === "running" ? (
        <div className="pointer-events-none absolute right-3 top-3 z-[60] flex flex-col items-end gap-2" data-testid="arcade-clock">
          <div className="flex items-center gap-3 rounded-full bg-black/70 px-4 py-2 text-white shadow-lg">
            <span aria-label="Game time left" className={`font-mono text-lg ${total > 0 && total <= clock.warnAtSecondsLeft ? "text-amber-300" : ""}`}>
              {formatClock(total)}
            </span>
            <span aria-label="Coins" className="flex items-center gap-1 text-amber-200">
              <span aria-hidden>🪙</span><span>{clock.coins}</span>
            </span>
          </div>
          {/* Never cut off without warning: the last stretch is announced on screen before time is up. */}
          {total > 0 && total <= clock.warnAtSecondsLeft ? (
            <div role="status" className="rounded-full bg-amber-400 px-3 py-1 text-sm font-black text-slate-950 shadow-lg">
              {total > 60 ? `${Math.ceil(total / 60)} minutes left` : "1 minute left"}
            </div>
          ) : null}
        </div>
      ) : null}
      {blocked ? (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center rounded-lg bg-slate-950/80 backdrop-blur-sm"
          data-testid="arcade-clock-blocker"
        >
          {clock && phase !== "loading" ? (
            <div role="dialog" aria-label="Insert a coin" className="w-80 rounded-2xl bg-white p-5 text-center text-slate-900 shadow-2xl">
              <p className="text-2xl font-black">{everRan ? "Time's up!" : "Insert coin to play"}</p>
              <p className="mt-1 text-sm text-slate-600">{`${clock.minutes} minutes for ${clock.price} coins · you have ${clock.coins} 🪙`}</p>
              <button
                type="button"
                className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 text-lg font-black disabled:opacity-50"
                disabled={short > 0 || phase === "buying"}
                onClick={() => void buy()}
              >
                Insert coin · {clock.price} 🪙
              </button>
              {short > 0 && <p className="mt-2 text-sm text-slate-600">You need {short} more coins. Finish a board to earn more.</p>}
              <button type="button" className="mt-2 w-full rounded-xl bg-slate-200 px-4 py-2 font-semibold" onClick={leave}>
                Back to my map
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
