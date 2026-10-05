import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChildExperiencePacket } from "../../../../src/profiles/childExperiencePacket";
import type { GenerationStatus } from "../../hooks/useAdaptiveMathGenerationRefresh";
import { resolveDirectDiscoveryLaunchNode } from "../../utils/adventureBoardLaunch";
import { AdventurePreparationScreen } from "./AdventurePreparationScreen";
import type { PreparationMode, PreparationState } from "./adventurePreparationMachine";
import { isPreparationSlow, preparationElapsedLabel, preparationEventsFromStatus } from "./preparationStatusAdapter";
import { useAdventurePreparation } from "./useAdventurePreparation";

export type PreparationSurface = "chapter" | "held" | null;

/** Spelling only: right after Discovery (chapter end) or a next-session map still building. */
export function resolvePreparationSurface(input: {
  packet: ChildExperiencePacket | null;
  directDiscoveryMode: boolean;
  handoff: string | null | undefined;
  held: boolean;
  preview: boolean;
}): PreparationSurface {
  if (input.preview || input.packet?.activeSessionPlan?.domain !== "spelling") return null;
  if (input.directDiscoveryMode) return input.handoff === "targeted-planning" ? "chapter" : null;
  return input.held ? "held" : null;
}

export function preparationWords(packet: ChildExperiencePacket | null): string[] {
  const radar = resolveDirectDiscoveryLaunchNode(packet)?.wordRadarItems?.map(item => item.display);
  const words = radar?.length ? radar : packet?.activeSessionPlan?.nodePlan?.flatMap(node => node.targets ?? []) ?? [];
  return [...new Set(words.filter(word => typeof word === "string" && word.trim()))].slice(0, 16);
}

const REVIEW_DWELL_MS = 4000;
const REVIEW_STAGGER_MS = 150;

/**
 * Drives the preparation screen from real status. The learning contract opens the
 * Teaching Board in a later session, so a chapter that started at Discovery ends
 * calmly; only a next-session resume ends on "Let's go!".
 */
export function useAppAdventurePreparation(input: {
  surface: PreparationSurface;
  packet: ChildExperiencePacket | null;
  childId: string | null;
  homeworkId: string | null | undefined;
  status: GenerationStatus | null;
  finished: boolean;
  checkNow: () => void;
  onFinish: () => void;
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
}): { screen: ReactNode | null } {
  const scope = `${input.childId ?? ""}:${input.homeworkId ?? ""}`;
  const [modeByScope, setModeByScope] = useState<{ scope: string; mode: PreparationMode } | null>(null);
  useEffect(() => {
    if (!input.surface) return;
    setModeByScope(prev => (prev?.scope === scope ? prev : { scope, mode: input.surface === "chapter" ? "chapter" : "resume" }));
  }, [input.surface, scope]);
  const mode = modeByScope?.scope === scope ? modeByScope.mode : null;

  const wordsRef = useRef<{ scope: string; words: string[] }>({ scope: "", words: [] });
  const words = preparationWords(input.packet);
  if (words.length && wordsRef.current.scope !== scope) wordsRef.current = { scope, words };
  const items = useMemo(() => (wordsRef.current.scope === scope ? wordsRef.current.words : words).map(face => ({ face, spoken: face })), [scope, words.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // A resume waits for the first real status so it opens on the true step.
  const active = Boolean(mode) && !input.finished && (mode === "chapter" || input.status !== null);
  const { snapshot, send } = useAdventurePreparation({
    active, scopeKey: `${scope}:${mode}`, mode: mode ?? "live", subject: "spelling", say,
    initialStops: initialPlan?.type === "PLAN_DONE" ? initialPlan.stops : undefined,
    initialReady: initialReady?.type === "ACTIVITY_READY" ? initialReady.n : undefined,
  });
  const state = (snapshot?.value ?? null) as PreparationState | null;

  // Discovery is already saved when the chapter screen opens: show her words, then move on.
  useEffect(() => {
    if (state !== "look") return;
    send({ type: "REVIEW_STARTED", total: items.length });
    const timers = items.map((_, index) => setTimeout(() => send({ type: "REVIEW_ITEM", index }), REVIEW_DWELL_MS + index * REVIEW_STAGGER_MS));
    timers.push(setTimeout(() => send({ type: "REVIEW_DONE" }), REVIEW_DWELL_MS + items.length * REVIEW_STAGGER_MS + 1200));
    return () => timers.forEach(clearTimeout);
  }, [state === "look", items, send]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (snapshot) statusEvents.forEach(send); }, [statusEvents, snapshot !== null, send]); // eslint-disable-line react-hooks/exhaustive-deps

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => { if (isPreparationSlow(input.status?.startedAt, now)) send({ type: "SLOW" }); }, [input.status?.startedAt, now, send]);

  // The map became playable: a resume reveals it; a chapter keeps it for next time.
  const total = snapshot?.context.total ?? 0;
  useEffect(() => {
    if (!snapshot || input.surface) return;
    send({ type: "ACTIVITY_READY", n: Math.max(total, 1), total: Math.max(total, 1) });
  }, [input.surface, snapshot !== null, total, send]); // eslint-disable-line react-hooks/exhaustive-deps

  const [revealedScope, setRevealedScope] = useState<string | null>(null);
  const visible = Boolean(snapshot) && (mode === "chapter" || input.surface === "held" || (state === "ready" && revealedScope !== scope));
  if (!visible || !snapshot || !state) return { screen: null };
  const ctx = snapshot.context;
  const finishedBuilding = ctx.total > 0 && ctx.ready >= ctx.total;
  return {
    screen: (
      <div className="h-screen w-screen">
        <AdventurePreparationScreen
          state={state} items={items} reviewed={ctx.reviewed} stops={ctx.stops} ready={ctx.ready} line={ctx.line}
          grownUp={{ visible: true, elapsedLabel: preparationElapsedLabel(input.status?.startedAt, now, finishedBuilding) }}
          onHearItem={item => say(/[.!?]$/.test(item.spoken) ? item.spoken : `${item.spoken}.`, "preparation_word")}
          onHearLine={() => say(ctx.line, "preparation_hear_again")}
          onStop={() => send({ type: "STOP" })}
          onTryAgain={() => { send({ type: "RETRY" }); input.checkNow(); }}
          onFinishLater={input.onFinish}
          onBye={input.onFinish}
          onLetsGo={() => { console.log(" 🎮 [adventure-preparation] [reveal] [opened]"); setRevealedScope(scope); }}
        />
      </div>
    ),
  };
}
