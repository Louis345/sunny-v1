import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChildExperiencePacket } from "../../../../src/profiles/childExperiencePacket";
import type { GenerationStatus } from "../../hooks/useAdaptiveMathGenerationRefresh";
import { resolveDirectDiscoveryLaunchNode } from "../../utils/adventureBoardLaunch";
import { AdventurePreparationScreen } from "./AdventurePreparationScreen";
import type { PreparationMode, PreparationState } from "./adventurePreparationMachine";
import { isPreparationSlow, isPublishedStatus, preparationElapsedLabel, preparationEventsFromStatus } from "./preparationStatusAdapter";
import { COMPANION_API_VERSION, type CompanionCommand } from "../../../../src/shared/companions/companionContract";
import { useAdventurePreparation } from "./useAdventurePreparation";

export type PreparationSurface = "chapter" | "held" | null;

/** The waiting screen's own words and real progress, as reported to Elli. */
export type PreparationWaitingReport = { step: string; detail: string; ready: number; total: number };

/** Right after spelling Discovery, after a finished board (spelling or math), or a next-session map still building. */
export function resolvePreparationSurface(input: {
  packet: ChildExperiencePacket | null;
  directDiscoveryMode: boolean;
  handoff: string | null | undefined;
  held: boolean;
  /** The server reports the board published; a published board is never held behind the waiting screen. */
  published?: boolean;
  /** She finished a board this session: the same screen shows what she did while the next one is made. */
  boardFinished?: boolean;
  preview: boolean;
}): PreparationSurface {
  const domain = input.packet?.activeSessionPlan?.domain;
  if (input.preview || (domain !== "spelling" && domain !== "math")) return null;
  if (input.boardFinished) return input.published ? null : "chapter";
  if (domain !== "spelling") return input.held && !input.published ? "held" : null;
  if (input.directDiscoveryMode) return input.handoff === "targeted-planning" ? "chapter" : null;
  return input.held && !input.published ? "held" : null;
}

export function preparationWords(packet: ChildExperiencePacket | null): string[] {
  const radar = resolveDirectDiscoveryLaunchNode(packet)?.wordRadarItems?.map(item => item.display);
  const words = radar?.length ? radar : packet?.activeSessionPlan?.nodePlan?.flatMap(node => node.targets ?? []) ?? [];
  return [...new Set(words.filter(word => typeof word === "string" && word.trim()))].slice(0, 16);
}

/**
 * When her next map is ready on the waiting screen, Elli raises her hand (BUGS.md 2026-11-12). No scripted words:
 * if she taps Elli, Elli sees the ready screen in her screen report and answers in her own words.
 */
export function boardReadyRaiseHand(childId: string, readyAt: number | null): CompanionCommand | null {
  if (readyAt === null) return null;
  return { apiVersion: COMPANION_API_VERSION, type: "check_back_in", payload: { how: "raise_hand", why: "her next map is ready" }, childId, timestamp: readyAt, source: "diag" };
}

const REVIEW_DWELL_MS = 4000;
/** Her results are the point of this screen after a finished board, so they stay up longer. */
const FINISHED_BOARD_DWELL_MS = 9000;
const REVIEW_STAGGER_MS = 150;

/**
 * Drives preparation from real status. A complete Teaching Board is optional
 * continuation; leaving preserves it for the next session.
 */
export function useAppAdventurePreparation(input: {
  surface: PreparationSurface;
  packet: ChildExperiencePacket | null;
  childId: string | null;
  homeworkId: string | null | undefined;
  status: GenerationStatus | null;
  /** The board she just finished; each finished board opens this screen once. */
  finishedBoardId?: string | null;
  finished: boolean;
  checkNow: () => void;
  onFinish: () => void;
  /** "Let's go!" on a next board: the published board has to be read before it can show. */
  onReveal?: () => void;
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
}): { screen: ReactNode | null; waiting: PreparationWaitingReport | null; readyAt: number | null } {
  const scope = `${input.childId ?? ""}:${input.homeworkId ?? ""}:${input.finishedBoardId ?? ""}`;
  const [modeByScope, setModeByScope] = useState<{ scope: string; mode: PreparationMode } | null>(null);
  useEffect(() => {
    // The next board may publish before she leaves her last game, so a finished board opens with no surface too.
    if (!input.surface && !input.finishedBoardId) return;
    setModeByScope(prev => (prev?.scope === scope ? prev : { scope, mode: input.surface === "held" ? "resume" : "chapter" }));
  }, [input.surface, input.finishedBoardId, scope]);
  const mode = modeByScope?.scope === scope ? modeByScope.mode : null;

  // One screen for every subject: spelling shows her words; math shows each problem as her answer, read aloud on tap.
  const subject = input.packet?.activeSessionPlan?.domain === "math" ? "math" : "spelling";
  const mathResults = subject === "math" && input.finishedBoardId ? input.packet?.mathBoardResults?.[input.finishedBoardId] : undefined;
  const wordsRef = useRef<{ scope: string; words: string[] }>({ scope: "", words: [] });
  const words = subject === "math" ? [] : preparationWords(input.packet);
  if (words.length && wordsRef.current.scope !== scope) wordsRef.current = { scope, words };
  const results: Array<{ display: string; firstTry?: boolean; correct?: boolean }> | undefined = mode !== "chapter" ? undefined
    : input.finishedBoardId ? input.packet?.spellingBoardResults : input.packet?.spellingEvaluationResults;
  const resultsKey = JSON.stringify(subject === "math" ? mathResults : results);
  const items = useMemo(() => subject === "math"
    ? (mathResults ?? []).map(result => ({ face: result.display, spoken: result.spoken, correct: result.correct, improved: result.firstTry === false && result.correct === true }))
    : (wordsRef.current.scope === scope ? wordsRef.current.words : words).map(face => {
      const result = results?.find(item => item.display === face);
      return { face, spoken: face, correct: result?.correct, improved: result?.firstTry === false && result.correct === true };
    }), [scope, subject, words.join("|"), resultsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const activityTypes = useMemo(() => new Map(
    (input.packet?.activeSessionPlan?.adventureBoard?.nodes ?? []).map(node => [node.id, node.activityId ?? node.kind] as [string, string]),
  ), [input.packet]);
  const statusEvents = useMemo(() => preparationEventsFromStatus(input.status, activityTypes), [input.status, activityTypes]);
  const initialPlan = statusEvents.find(event => event.type === "PLAN_DONE");
  const initialReady = statusEvents.find(event => event.type === "ACTIVITY_READY");

  const { childId, sendMessage } = input;
  const say = useCallback((text: string, reason = "preparation_line") => {
    console.log(` 🎮 [adventure-preparation] [speak] [${reason}]`);
    sendMessage("game_event", { event: { type: "narration_request", payload: { game: "adventure-preparation", childId: childId ?? "unknown", text, reason } } });
  }, [childId, sendMessage]);

  const exit = (button: string) => sendMessage("game_event", { event: { type: "preparation_exit", payload: { button } } });

  // A resume waits for the first real status so it opens on the true step.
  const active = Boolean(mode) && !input.finished && (mode === "chapter" || input.status !== null);
  const { snapshot, send } = useAdventurePreparation({
    active, scopeKey: `${scope}:${mode}`, mode: mode ?? "live", subject, say: () => undefined,
    initialStops: initialPlan?.type === "PLAN_DONE" ? initialPlan.stops : undefined,
    initialReady: initialReady?.type === "ACTIVITY_READY" ? initialReady.n : undefined,
  });
  const state = (snapshot?.value ?? null) as PreparationState | null;

  // Discovery is already saved when the chapter screen opens: show her words, then move on.
  useEffect(() => {
    if (state !== "look") return;
    send({ type: "REVIEW_STARTED", total: items.length });
    const dwell = input.finishedBoardId ? FINISHED_BOARD_DWELL_MS : REVIEW_DWELL_MS;
    const timers = items.map((_, index) => setTimeout(() => send({ type: "REVIEW_ITEM", index }), dwell + index * REVIEW_STAGGER_MS));
    timers.push(setTimeout(() => send({ type: "REVIEW_DONE" }), dwell + items.length * REVIEW_STAGGER_MS + 1200));
    return () => timers.forEach(clearTimeout);
  }, [state === "look", items, send]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ready means the server published the board, never a guess from the screen's surface (BUGS.md 2026-11-12).
  const published = isPublishedStatus(input.status);
  // A next board can already be published when she gets here: she still sees her results first.
  const holdForResults = Boolean(input.finishedBoardId) && state === "look";
  useEffect(() => { if (snapshot && !holdForResults) statusEvents.forEach(event => send(event.type === "ACTIVITY_READY" ? {...event, published:input.surface === null && published} : event)); }, [statusEvents, input.surface, published, snapshot !== null, holdForResults, send]); // eslint-disable-line react-hooks/exhaustive-deps

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => { if (isPreparationSlow(input.status?.startedAt, now)) send({ type: "SLOW" }); }, [input.status?.startedAt, now, send]);

  // The complete map became playable; keep its explicit reveal control visible.
  const total = snapshot?.context.total ?? 0;
  useEffect(() => {
    if (!snapshot || input.surface || holdForResults || !published) return;
    send({ type: "ACTIVITY_READY", n: Math.max(total, 1), total: Math.max(total, 1), published: true });
  }, [input.surface, published, snapshot !== null, total, holdForResults, send]); // eslint-disable-line react-hooks/exhaustive-deps

  const [revealedScope, setRevealedScope] = useState<string | null>(null);
  const ctx = snapshot?.context;
  const contextLine = ctx?.line ?? "";
  const contextReady = ctx?.ready ?? 0;
  const contextTotal = ctx?.total ?? 0;
  const finishedBuilding = input.surface === null && contextTotal > 0 && contextReady >= contextTotal;
  const elapsedLabel = preparationElapsedLabel(input.status?.startedAt, now, finishedBuilding);
  const visible = Boolean(snapshot) && revealedScope !== scope && (mode === "chapter" || input.surface === "held" || state === "ready" || state === "stop");

  // What the waiting screen shows, for the kiosk's one screen report to Elli (never a separate message).
  // Elapsed time and "remaining time is not known" keep her from inventing completion estimates.
  const waiting: PreparationWaitingReport | null = visible && active && state && ctx ? {
    step: contextLine,
    detail: [
      contextTotal > 0 ? `${contextReady} of ${contextTotal} map activities ready.` : null,
      elapsedLabel ? `Elapsed: ${elapsedLabel}.` : null,
      finishedBuilding ? null : "Remaining time is not known.",
      items.some(item => item.improved) ? `New since her first try: ${items.filter(item => item.improved).map(item => item.face).join(", ")}.` : null,
    ].filter(Boolean).join(" "),
    ready: contextReady,
    total: contextTotal,
  } : null;

  const [readySeen, setReadySeen] = useState<{ scope: string; at: number } | null>(null);
  const showingReady = visible && active && state === "ready";
  useEffect(() => {
    if (!showingReady || readySeen?.scope === scope) return;
    console.log(` 🎮 [adventure-preparation] [ready] [shown] child=${input.childId ?? "unknown"} homework=${input.homeworkId ?? "unknown"}`);
    setReadySeen({ scope, at: Date.now() });
  }, [showingReady, readySeen?.scope, scope, input.childId, input.homeworkId]);
  const readyAt = showingReady && readySeen?.scope === scope ? readySeen.at : null;

  if (!visible || !snapshot || !state || !ctx) return { screen: null, waiting: null, readyAt: null };
  return {
    screen: (
      <div className="h-screen w-screen">
        <AdventurePreparationScreen
          state={state} items={items} reviewed={ctx.reviewed} stops={ctx.stops} ready={ctx.ready}
          elapsedLabel={elapsedLabel}
          onHearItem={item => say(/[.!?]$/.test(item.spoken) ? item.spoken : `${item.spoken}.`, "preparation_word")}
          onStop={() => { exit("stop_for_now"); send({ type: "STOP" }); }}
          onTryAgain={() => { send({ type: "RETRY" }); input.checkNow(); }}
          onBye={() => { exit(state === "stop" ? "bye_for_now" : "save_for_next_time"); input.onFinish(); }}
          onLetsGo={() => { if(input.surface || state !== "ready") { console.log(" 🎮 [adventure-preparation] [reveal] [waiting-for-publication]"); return; } console.log(" 🎮 [adventure-preparation] [reveal] [opened]"); exit("lets_go"); setRevealedScope(scope); input.onReveal?.(); }}
        />
      </div>
    ),
    waiting,
    readyAt,
  };
}
