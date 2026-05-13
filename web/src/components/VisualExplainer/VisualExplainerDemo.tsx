import { useEffect, useMemo, useRef, useState } from "react";
import { createActor } from "xstate";
import { motion } from "framer-motion";
import { Play, RotateCcw, CheckCircle2, SlidersHorizontal } from "lucide-react";
import { CarrierFlowScene } from "./CarrierFlowScene";
import {
  buildVisualExplainerConfigFromBrief,
  getVisualBrief,
  visualBriefs,
} from "./visualBriefs";
import { getVisualStudioBrief } from "./studioBriefs";
import type { VisualBriefId } from "./visualBriefSchema";
import {
  validateVisualExplainerConfig,
  type VisualExplainerConfig,
  type VisualExplainerNarrationLine,
  type VisualExplainerOption,
} from "./visualExplainerSchema";
import {
  visualExplainerMachine,
  type ActivityCompleteEvent,
  type VisualExplainerEvidenceEvent,
} from "./visualExplainerMachine";
import {
  createBrowserNarrationControls,
  type BrowserNarrationStatus,
} from "./browserNarration";
import {
  createFlowGameEvents,
  type FlowGameSendMessage,
} from "../../utils/flowGameEvents";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function nearestCheckpoint(config: VisualExplainerConfig, progress: number): string {
  const ordered = [...config.checkpoints].sort((a, b) => a.t - b.t);
  return ordered.reduce((best, item) =>
    Math.abs(item.t - progress) < Math.abs(best.t - progress) ? item : best,
  ).caption;
}

function companionLineFor(
  config: VisualExplainerConfig,
  state: string,
  selectedOption: VisualExplainerOption | null,
): VisualExplainerNarrationLine {
  const stateKey =
    state === "reveal"
      ? selectedOption?.correct
        ? "reveal.correct"
        : "reveal.support"
      : state;
  return (
    config.companion.lines.find((line) => line.state === stateKey) ??
    config.companion.lines.find((line) => line.state === state) ??
    config.companion.lines[0]!
  );
}

function useVisualExplainerActor() {
  const actorRef = useRef(
    createActor(visualExplainerMachine, {
      input: { now: Date.now() },
    }),
  );
  const [snapshot, setSnapshot] = useState(actorRef.current.getSnapshot());

  useEffect(() => {
    const actor = actorRef.current;
    const sub = actor.subscribe((next) => setSnapshot(next));
    actor.start();
    return () => {
      sub.unsubscribe();
    };
  }, []);

  return { actor: actorRef.current, snapshot };
}

function getInitialVisualBriefId(): VisualBriefId {
  const candidate =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("brief");
  return candidate && Object.prototype.hasOwnProperty.call(visualBriefs, candidate)
    ? (candidate as VisualBriefId)
    : "erosion";
}

function EventConsole(props: { events: VisualExplainerEvidenceEvent[] }): React.ReactElement {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 p-4 text-slate-100">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-cyan-200">
          Evidence Stream
        </h3>
        <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs font-bold text-cyan-100">
          {props.events.length} event{props.events.length === 1 ? "" : "s"}
        </span>
      </div>
      <pre
        data-testid="visual-explainer-evidence-console"
        className="max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-200"
      >
        {props.events.length === 0
          ? "No events yet. Start the treatment and answer the prediction."
          : props.events.map((event) => JSON.stringify(event, null, 2)).join("\n\n")}
      </pre>
    </div>
  );
}

function CompanionCoach(props: {
  config: VisualExplainerConfig;
  line: VisualExplainerNarrationLine;
  state: string;
  compact?: boolean;
  narrationMuted: boolean;
  narrationStatus: BrowserNarrationStatus;
  narrationSupported: boolean;
  onToggleNarration: () => void;
}): React.ReactElement {
  const expressionLabel: Record<VisualExplainerNarrationLine["expression"], string> = {
    idle: "Watching",
    thinking: "Thinking",
    encouraging: "Coaching",
    celebrating: "Celebrating",
    supporting: "Supporting",
  };
  const expressionColor: Record<VisualExplainerNarrationLine["expression"], string> = {
    idle: "bg-slate-100 text-slate-700",
    thinking: "bg-sky-100 text-sky-800",
    encouraging: "bg-violet-100 text-violet-800",
    celebrating: "bg-emerald-100 text-emerald-800",
    supporting: "bg-amber-100 text-amber-900",
  };

  return (
    <div
      data-testid="visual-explainer-companion"
      className={
        props.compact
          ? "rounded-lg border border-white/70 bg-white/90 p-3 shadow-lg backdrop-blur"
          : "rounded-lg border border-violet-200 bg-white p-4 shadow-sm"
      }
    >
      <div className="flex items-start gap-3">
        <motion.div
          className={
            props.compact
              ? "grid h-12 w-12 shrink-0 place-items-center rounded-full bg-violet-100 text-3xl shadow-inner"
              : "grid h-16 w-16 shrink-0 place-items-center rounded-full bg-violet-100 text-4xl shadow-inner"
          }
          animate={
            props.line.expression === "thinking"
              ? { rotate: [-2, 2, -2] }
              : props.line.expression === "celebrating"
                ? { scale: [1, 1.08, 1] }
                : { y: [0, -2, 0] }
          }
          transition={{ duration: 1.4, repeat: Infinity }}
          aria-hidden="true"
        >
          {props.config.companion.avatar}
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-black text-slate-950">
              {props.config.companion.displayName}
            </h3>
            <span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-black uppercase tracking-[0.12em] text-violet-800">
              {props.config.companion.role}
            </span>
          </div>
          <div className="mt-2 rounded-lg bg-slate-950 p-3 text-sm font-semibold leading-6 text-white">
            {props.line.text}
          </div>
          <div className={props.compact ? "sr-only" : "mt-3 flex flex-wrap items-center gap-2 text-xs font-bold"}>
            <span className={`rounded-full px-2 py-1 ${expressionColor[props.line.expression]}`}>
              {expressionLabel[props.line.expression]}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              voice: {props.config.companion.provider}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              tts: {props.narrationSupported ? props.narrationStatus : "unsupported"}
            </span>
          </div>
          {props.compact ? null : (
            <button
              type="button"
              onClick={props.onToggleNarration}
              className="mt-3 rounded-md border border-violet-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-violet-800"
            >
              {props.narrationMuted ? "Unmute scratch voice" : "Mute scratch voice"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TweakPanel(props: {
  config: VisualExplainerConfig;
  onUpdate: (next: VisualExplainerConfig) => void;
}): React.ReactElement {
  const { config, onUpdate } = props;
  const setConfig = (next: VisualExplainerConfig) => {
    onUpdate(validateVisualExplainerConfig(next));
  };

  return (
    <details className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-slate-900">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-amber-900">
        <SlidersHorizontal size={16} />
        Tweak Panel
      </summary>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm font-bold">
          Child hook
          <textarea
            className="min-h-20 rounded-md border border-amber-300 bg-white p-2 font-normal"
            value={config.childHook}
            onChange={(event) => setConfig({ ...config, childHook: event.target.value })}
          />
        </label>
        <div className="grid gap-2 rounded-md border border-amber-200 bg-white/70 p-3">
          <div className="text-sm font-black">Companion</div>
          <label className="grid gap-1 text-xs font-bold">
            Provider
            <input
              className="rounded-md border border-amber-300 bg-white p-2 font-normal"
              value={config.companion.provider}
              onChange={(event) =>
                setConfig({
                  ...config,
                  companion: { ...config.companion, provider: event.target.value },
                })
              }
            />
          </label>
          <label className="grid gap-1 text-xs font-bold">
            Voice ID
            <input
              className="rounded-md border border-amber-300 bg-white p-2 font-normal"
              value={config.companion.voiceId ?? ""}
              onChange={(event) =>
                setConfig({
                  ...config,
                  companion: { ...config.companion, voiceId: event.target.value },
                })
              }
            />
          </label>
          <label className="grid gap-1 text-xs font-bold">
            Intro line
            <textarea
              className="min-h-20 rounded-md border border-amber-300 bg-white p-2 font-normal"
              value={config.companion.lines[0]?.text ?? ""}
              onChange={(event) => {
                const lines = [...config.companion.lines];
                if (!lines[0]) return;
                lines[0] = { ...lines[0], text: event.target.value };
                setConfig({
                  ...config,
                  companion: { ...config.companion, lines },
                });
              }}
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm font-bold">
          Prediction prompt
          <input
            className="rounded-md border border-amber-300 bg-white p-2 font-normal"
            value={config.prediction.prompt}
            onChange={(event) =>
              setConfig({
                ...config,
                prediction: { ...config.prediction, prompt: event.target.value },
              })
            }
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Animation duration: {Math.round(config.animation.durationMs / 1000)}s
          <input
            type="range"
            min={4000}
            max={14000}
            step={500}
            value={config.animation.durationMs}
            onChange={(event) =>
              setConfig({
                ...config,
                animation: {
                  ...config.animation,
                  durationMs: Number(event.target.value),
                },
              })
            }
          />
        </label>
        <div className="grid gap-2">
          <div className="text-sm font-bold">Checkpoint captions</div>
          {config.checkpoints.map((checkpoint, index) => (
            <input
              key={checkpoint.id}
              className="rounded-md border border-amber-300 bg-white p-2 text-sm"
              value={checkpoint.caption}
              onChange={(event) => {
                const checkpoints = [...config.checkpoints];
                checkpoints[index] = { ...checkpoint, caption: event.target.value };
                setConfig({ ...config, checkpoints });
              }}
            />
          ))}
        </div>
      </div>
    </details>
  );
}

export function VisualExplainerDemo(props: {
  childId?: string;
  mapNodeId?: string;
  mapMode?: boolean;
  sendMessage?: FlowGameSendMessage;
  onComplete?: (event: ActivityCompleteEvent) => void;
  onExit?: () => void;
} = {}): React.ReactElement {
  const [visualBriefId, setVisualBriefId] = useState<VisualBriefId>(() =>
    getInitialVisualBriefId(),
  );
  const visualBrief = getVisualBrief(visualBriefId);
  const studioBrief = getVisualStudioBrief(visualBriefId);
  const [config, setConfig] = useState(() =>
    validateVisualExplainerConfig(
      buildVisualExplainerConfigFromBrief(
        getVisualBrief(getInitialVisualBriefId()),
        props.mapNodeId ?? `demo-${getInitialVisualBriefId()}-treatment`,
      ),
    ),
  );
  const [progress, setProgress] = useState(0);
  const [events, setEvents] = useState<VisualExplainerEvidenceEvent[]>([]);
  const [narrationMuted, setNarrationMuted] = useState(false);
  const [narrationStatus, setNarrationStatus] = useState<BrowserNarrationStatus>("idle");
  const { actor, snapshot } = useVisualExplainerActor();
  const currentState = String(snapshot.value);
  const isPlaying = currentState === "playing";
  const hasReachedPrediction = useRef(false);
  const companionLine = companionLineFor(
    config,
    currentState,
    snapshot.context.selectedOption,
  );
  const narration = useMemo(
    () => createBrowserNarrationControls({ muted: narrationMuted }),
    [narrationMuted],
  );
  const flowEvents = useMemo(
    () =>
      props.sendMessage
        ? createFlowGameEvents({
            game: config.activityId,
            childId: props.childId ?? "unknown",
            sendMessage: props.sendMessage,
          })
        : null,
    [config.activityId, props.childId, props.sendMessage],
  );
  const showDeveloperPanels = props.mapMode !== true;

  const selectVisualBrief = (nextId: VisualBriefId) => {
    const nextBrief = getVisualBrief(nextId);
    setVisualBriefId(nextId);
    setConfig(
      validateVisualExplainerConfig(
        buildVisualExplainerConfigFromBrief(
          nextBrief,
          props.mapNodeId ?? `demo-${nextBrief.id}-treatment`,
        ),
      ),
    );
    hasReachedPrediction.current = false;
    setEvents([]);
    setProgress(0);
  };

  useEffect(() => {
    const status = narration.speak(companionLine.text);
    setNarrationStatus(status);
    return () => narration.stop();
  }, [companionLine.id, companionLine.text, narration]);

  useEffect(() => {
    flowEvents?.reportState(`Visual Explainer state: ${currentState}`, {
      activityId: config.activityId,
      nodeId: config.nodeId,
      phase: currentState,
      topic: config.topic,
      targetConcept: config.prediction.targetConcept,
      progressPct: Math.round(progress * 100),
      scaffoldLevel: currentState === "pausedForPrediction" ? 2 : 1,
    });
  }, [
    config.activityId,
    config.nodeId,
    config.prediction.targetConcept,
    config.topic,
    currentState,
    flowEvents,
    progress,
  ]);

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    const started = performance.now();
    const from = progress;
    const tick = (now: number) => {
      const elapsed = now - started;
      const next = clamp01(from + elapsed / config.animation.durationMs);
      setProgress(next);
      if (!hasReachedPrediction.current && next >= config.animation.predictionAt) {
        hasReachedPrediction.current = true;
        actor.send({ type: "REACH_PREDICTION", now: Date.now() });
        setProgress(config.animation.predictionAt);
        return;
      }
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [actor, config.animation.durationMs, config.animation.predictionAt, isPlaying, progress]);

  const checkpointCaption = useMemo(
    () => nearestCheckpoint(config, progress),
    [config, progress],
  );

  const start = () => {
    hasReachedPrediction.current = false;
    setEvents([]);
    setProgress(0);
    flowEvents?.reportState("Visual Explainer treatment started.", {
      activityId: config.activityId,
      nodeId: config.nodeId,
      phase: "playing",
      topic: config.topic,
      targetConcept: config.prediction.targetConcept,
      activeDuration_ms: 0,
      idleEvents: 0,
      reengagements: 0,
      frustrationSignals: [],
      flowSignals: ["started_visual_model"],
    });
    actor.send({ type: "START", now: Date.now() });
  };

  const setScrubProgress = (nextRaw: number) => {
    const next = clamp01(nextRaw);
    setProgress(next);
    if (
      currentState === "playing" &&
      !hasReachedPrediction.current &&
      next >= config.animation.predictionAt
    ) {
      hasReachedPrediction.current = true;
      actor.send({ type: "REACH_PREDICTION", now: Date.now() });
      setProgress(config.animation.predictionAt);
    }
  };

  const answerPrediction = (option: VisualExplainerOption) => {
    const correct = option.correct;
    actor.send({
      type: "ANSWER",
      now: Date.now(),
      option,
      activityId: config.activityId,
      nodeId: config.nodeId,
      roundId: config.prediction.roundId,
      targetConcept: config.prediction.targetConcept,
    });
    const nextSnapshot = actor.getSnapshot();
    const latest = nextSnapshot.context.targetResults.at(-1);
    if (latest) setEvents((prev) => [...prev, latest]);
    flowEvents?.reportAttempt({
      domain: "science",
      activityId: config.activityId,
      nodeId: config.nodeId,
      target: config.prediction.targetConcept,
      attemptedValue: option.label,
      correct,
      quality: correct ? 4 : 2,
      scaffoldLevel: 2,
      responseTimeMs: latest?.responseTime_ms,
      misconception: option.correct ? null : option.misconception ?? null,
      evidenceKind: "practice",
      masteryEligible: false,
    });
    flowEvents?.fireCompanionEvent(correct ? "correct_answer" : "wrong_answer", {
      game: config.activityId,
      nodeId: config.nodeId,
      targetConcept: config.prediction.targetConcept,
      attemptedValue: option.label,
      misconception: option.correct ? null : option.misconception ?? null,
      scaffoldLevel: 2,
    });
    flowEvents?.reportState(
      correct
        ? `Prediction answered correctly: ${visualBrief.actors.carrier.label} carries ${visualBrief.actors.payload.label}.`
        : `Prediction needs support: replay the ${visualBrief.actors.payload.label} movement.`,
      {
        activityId: config.activityId,
        nodeId: config.nodeId,
        phase: "feedback",
        targetConcept: config.prediction.targetConcept,
        correct,
        misconception: option.correct ? null : option.misconception ?? null,
        scaffoldLevel: 2,
      },
    );
  };

  const finish = () => {
    const now = Date.now();
    actor.send({
      type: "COMPLETE",
      now,
      activityId: config.activityId,
      nodeId: config.nodeId,
    });
    const nextSnapshot = actor.getSnapshot();
    if (nextSnapshot.context.completion) {
      const completion = nextSnapshot.context.completion;
      setEvents((prev) => [...prev, completion]);
      flowEvents?.reportState("Visual Explainer treatment complete.", {
        activityId: config.activityId,
        nodeId: config.nodeId,
        phase: "complete",
        accuracy: completion.accuracy,
        activeDuration_ms: completion.durationMs,
        idleEvents: 0,
        abandonments: 0,
        reengagements: 0,
        frustrationSignals: completion.accuracy < 1 ? ["needed_visual_support"] : [],
        flowSignals: completion.accuracy >= 1 ? ["completed_prediction"] : ["completed_with_support"],
      });
      flowEvents?.fireCompanionEvent("session_complete", {
        game: config.activityId,
        nodeId: config.nodeId,
        accuracy: completion.accuracy,
      });
      flowEvents?.complete({
        completed: true,
        activityId: config.activityId,
        nodeId: config.nodeId,
        accuracy: completion.accuracy,
        timeSpent_ms: completion.durationMs,
        wordsAttempted: completion.targetResults.length,
        purpose: "teaching_intervention",
        mode: completion.mechanic,
        vitalSigns: {
          activeDuration_ms: completion.durationMs,
          idleEvents: 0,
          abandonments: 0,
          reengagements: 0,
          frustrationSignals: completion.accuracy < 1 ? ["needed_visual_support"] : [],
          flowSignals: completion.accuracy >= 1 ? ["completed_prediction"] : ["completed_with_support"],
        },
      });
      props.onComplete?.(completion);
    }
  };

  return (
    <main
      className="min-h-screen text-slate-950"
      style={{ background: visualBrief.palette.page }}
    >
      <div
        className={
          showDeveloperPanels
            ? "mx-auto grid max-w-7xl gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_360px]"
            : "mx-auto grid max-w-6xl gap-4 px-4 py-4"
        }
      >
        <section className="grid gap-5">
          {props.mapMode && props.onExit ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Adventure Map Room
                </div>
                <div className="text-sm font-bold text-slate-800">
                  Visual Explainer opened from the care-plan path.
                </div>
              </div>
              <button
                type="button"
                onClick={props.onExit}
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-black text-white"
              >
                Back to map
              </button>
            </div>
          ) : null}
          {showDeveloperPanels ? (
          <div className="rounded-[1rem] border border-sky-200 bg-white/95 px-5 py-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">
                  Teaching Intervention Room
                </div>
                <h1 className="mt-1 text-2xl font-black tracking-normal text-slate-950 sm:text-3xl">
                  {config.topic} Visual Explainer
                </h1>
                <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-700">
                  {config.learningGoal}
                </p>
              </div>
              <label className="grid min-w-48 shrink-0 gap-1 text-xs font-black uppercase tracking-[0.14em] text-slate-500 sm:min-w-56">
                Preview Theme
                <select
                  data-testid="visual-brief-switcher"
                  value={visualBriefId}
                  onChange={(event) =>
                    selectVisualBrief(event.target.value as VisualBriefId)
                  }
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-black normal-case tracking-normal text-slate-900 shadow-sm"
                >
                  {Object.values(visualBriefs).map((brief) => (
                    <option key={brief.id} value={brief.id}>
                      {brief.topic}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-sky-50 px-3 py-2">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-900">
                  Assumption
                </div>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-800">
                  {config.carePlanNote.assumption}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 px-3 py-2">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-900">
                  Intervention
                </div>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-800">
                  {config.carePlanNote.intervention}
                </p>
              </div>
            </div>
            <div
              data-testid="visual-studio-plan"
              className="mt-3 rounded-lg border border-violet-100 bg-violet-50/70 px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-900">
                    Studio Plan
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-800">
                    Concept: {studioBrief.concept.target}
                  </p>
                </div>
                <div className="grid gap-1 text-right text-[11px] font-black uppercase tracking-[0.12em] text-violet-900">
                  <span>Template: {studioBrief.concept.mentalModel}</span>
                  <span>Next: {studioBrief.recall.template}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {studioBrief.evidence.writes.map((write) => (
                  <span
                    key={write}
                    className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-violet-900 shadow-sm"
                  >
                    {write}
                  </span>
                ))}
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-violet-900 shadow-sm">
                  {studioBrief.recall.questions.length} recall checks
                </span>
              </div>
            </div>
          </div>
          ) : null}

          <div className="overflow-hidden rounded-[1.25rem] border border-[#ece5f5] bg-white shadow-[0_24px_60px_-30px_rgba(20,16,46,0.35)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ece5f5] px-5 py-4">
              <div className="min-w-0">
                <div className="inline-flex rounded-full border border-[#ece5f5] bg-white px-4 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#5a5273] shadow-sm">
                  {currentState === "intro"
                    ? "Ready"
                    : currentState === "pausedForPrediction"
                      ? "Prediction"
                      : currentState === "complete"
                        ? "Complete"
                        : "In progress"}
                </div>
                <p className="mt-2 text-sm font-bold leading-6 text-[#1b1530]">
                  {config.childHook}
                </p>
              </div>
              {currentState === "intro" ? (
                <button
                  type="button"
                  onClick={start}
                  className="inline-flex min-h-12 items-center gap-2 rounded-[0.875rem] bg-[#1b1530] px-5 py-3 text-sm font-black text-white shadow-[0_12px_24px_-14px_rgba(20,16,46,0.9)]"
                >
                  <Play size={17} />
                  Start Treatment
                </button>
              ) : (
                <div className="rounded-[0.875rem] border border-[#ece5f5] bg-[#f7f2ff] px-4 py-3 text-sm font-black text-[#5a5273]">
                  {currentState === "pausedForPrediction"
                    ? "Answer the prediction below"
                    : currentState === "complete"
                      ? "Treatment complete"
                      : "Treatment running"}
                </div>
              )}
            </div>

            <div
              data-testid="visual-explainer-scene-band"
              className="bg-white px-4 py-5 sm:px-6 sm:py-6"
            >
              <div className="mx-auto aspect-[16/9] max-w-[1040px] overflow-hidden rounded-[1.5rem] bg-slate-100 shadow-[0_24px_60px_-20px_rgba(20,16,46,0.45)]">
                <CarrierFlowScene
                  brief={visualBrief}
                  progress={progress}
                  isPlaying={isPlaying}
                />
              </div>
            </div>

            <div
              data-testid="visual-explainer-controls-band"
              className="border-t border-[#ece5f5] bg-white px-5 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-lg font-semibold leading-7 text-[#1b1530] md:text-xl">
                  {checkpointCaption}
                </p>
                <span className="rounded-full bg-[#f7f2ff] px-3 py-1 text-xs font-black text-[#5a5273]">
                  {Math.round(progress * 100)}%
                </span>
              </div>
              <div className="mt-4 grid grid-cols-[56px_minmax(0,1fr)] items-center gap-4">
                <button
                  type="button"
                  onClick={start}
                  aria-label="Play visual explainer"
                  className="grid h-14 w-14 place-items-center rounded-full bg-[#1b1530] text-white shadow-[0_12px_24px_-14px_rgba(20,16,46,0.9)]"
                >
                  <Play size={18} />
                </button>
                <div className="relative min-h-14">
                  <div className="absolute left-0 right-0 top-5 h-2 rounded-full bg-[#ede7df]" />
                  <div
                    className="absolute left-0 top-5 h-2 rounded-full bg-[#6e3fcb]"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                  <input
                    aria-label={`${config.topic} time scrubber`}
                    data-testid="visual-explainer-scrubber"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(progress * 100)}
                    onChange={(event) => setScrubProgress(Number(event.target.value) / 100)}
                    className="absolute inset-x-0 top-0 h-11 w-full cursor-pointer opacity-0"
                  />
                  {config.checkpoints.map((checkpoint) => {
                    const pct = Math.round(checkpoint.t * 100);
                    const active = Math.abs(progress - checkpoint.t) < 0.08;
                    return (
                      <button
                        key={checkpoint.id}
                        type="button"
                        onClick={() => setScrubProgress(checkpoint.t)}
                        className="absolute top-2 grid min-h-11 min-w-11 -translate-x-1/2 place-items-center"
                        style={{ left: `${pct}%` }}
                        aria-label={`Jump to ${checkpoint.id}`}
                      >
                        <span
                          className={
                            active
                              ? "h-5 w-5 rounded-full border-4 border-white bg-[#6e3fcb] shadow-[0_0_0_4px_rgba(110,63,203,0.18)]"
                              : "h-4 w-4 rounded-full border-[3px] border-[#e5dcd1] bg-white"
                          }
                        />
                        <span className="absolute top-9 hidden whitespace-nowrap text-[11px] font-black uppercase tracking-[0.08em] text-[#8d8275] sm:block">
                          {visualBrief.checkpoints.find((item) => item.id === checkpoint.id)?.label ??
                            checkpoint.id}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="border-t border-[#ece5f5] bg-[#fbf9ff] px-5 py-4">
              {currentState === "intro" || currentState === "playing" ? (
                <div className="rounded-[1rem] bg-white p-4 shadow-[0_8px_18px_-14px_rgba(20,16,46,0.4)]">
                  <h2 className="text-lg font-black text-[#1b1530]">Watch for the evidence.</h2>
                  <p className="mt-2 text-sm leading-6 text-[#5a5273]">
                    The model will pause before the reveal so the child commits to a prediction.
                  </p>
                </div>
              ) : null}

              {currentState === "pausedForPrediction" ? (
                <motion.div
                  className="rounded-[1rem] border border-[#e4d8f7] bg-white p-5 shadow-[0_18px_38px_-24px_rgba(20,16,46,0.5)]"
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                >
                  <h2
                    data-testid="visual-explainer-prediction-prompt"
                    className="text-2xl font-black leading-tight text-[#1b1530]"
                  >
                    {config.prediction.prompt}
                  </h2>
                  <div className="mt-4 grid gap-2 md:grid-cols-3">
                    {config.prediction.options.map((option, index) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => answerPrediction(option)}
                        className="rounded-[0.875rem] border border-[#ece5f5] bg-[#fffcf7] px-4 py-4 text-left text-sm font-black text-[#1b1530] shadow-sm hover:border-[#6e3fcb]"
                      >
                        <span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-lg bg-white text-xs text-[#5a5273] shadow-inner">
                          {index + 1}
                        </span>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : null}

              {currentState === "reveal" ? (
                <div className="rounded-[1rem] border border-emerald-200 bg-white p-5">
                  <h2 className="text-lg font-black text-emerald-950">Reveal</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-800">
                    {config.prediction.reveal}
                  </p>
                  <button
                    type="button"
                    onClick={() => actor.send({ type: "CONTINUE" })}
                    className="mt-4 rounded-[0.875rem] bg-[#1b1530] px-4 py-2 text-sm font-black text-white"
                  >
                    Continue
                  </button>
                </div>
              ) : null}

              {currentState === "replayOrContinue" ? (
                <div className="flex flex-wrap gap-2 rounded-[1rem] border border-[#ece5f5] bg-white p-4">
                  <button
                    type="button"
                    onClick={() => {
                      hasReachedPrediction.current = true;
                      setProgress(config.animation.predictionAt);
                      actor.send({ type: "REPLAY" });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-[0.875rem] border border-[#ece5f5] bg-white px-4 py-2 text-sm font-black"
                  >
                    <RotateCcw size={16} />
                    Replay from reveal
                  </button>
                  <button
                    type="button"
                    onClick={() => actor.send({ type: "EXIT_READY" })}
                    className="rounded-[0.875rem] bg-[#1b1530] px-4 py-2 text-sm font-black text-white"
                  >
                    Exit Check
                  </button>
                </div>
              ) : null}

              {currentState === "exitCheck" ? (
                <div className="rounded-[1rem] border border-violet-200 bg-white p-5">
                  <h2 className="text-lg font-black text-violet-950">
                    {config.exitCheck.prompt}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-800">
                    {config.exitCheck.answer}
                  </p>
                  <button
                    type="button"
                    onClick={finish}
                    className="mt-4 inline-flex items-center gap-2 rounded-[0.875rem] bg-[#1b1530] px-4 py-2 text-sm font-black text-white"
                  >
                    <CheckCircle2 size={16} />
                    Complete
                  </button>
                </div>
              ) : null}

              {currentState === "complete" ? (
                <div className="rounded-[1rem] border border-emerald-300 bg-white p-5">
                  <h2 className="text-lg font-black text-emerald-950">Treatment complete</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-800">
                    The demo has emitted the same kind of evidence a future map node can persist.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {showDeveloperPanels ? (
          <aside className="grid content-start gap-5">
            <TweakPanel config={config} onUpdate={setConfig} />
            <CompanionCoach
              config={config}
              line={companionLine}
              state={currentState}
              narrationMuted={narrationMuted}
              narrationStatus={narrationStatus}
              narrationSupported={narration.supported}
              onToggleNarration={() => setNarrationMuted((value) => !value)}
            />
            <EventConsole events={events} />
          </aside>
        ) : null}
      </div>
    </main>
  );
}
