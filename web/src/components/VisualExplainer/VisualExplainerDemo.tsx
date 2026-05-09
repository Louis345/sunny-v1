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
              state: {props.state}
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
  const [visualBriefId, setVisualBriefId] = useState<VisualBriefId>("erosion");
  const visualBrief = getVisualBrief(visualBriefId);
  const [config, setConfig] = useState(() =>
    validateVisualExplainerConfig(
      buildVisualExplainerConfigFromBrief(
        getVisualBrief("erosion"),
        props.mapNodeId ?? "demo-erosion-treatment",
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
              <div>
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
          <div className="rounded-lg border border-sky-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">
                  Teaching Intervention Room
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-normal text-slate-950">
                  {config.topic} Visual Explainer
                </h1>
                <p className="mt-2 max-w-3xl text-base leading-7 text-slate-700">
                  {config.learningGoal}
                </p>
              </div>
              <label className="grid min-w-56 gap-1 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
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
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-sky-50 p-4">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-sky-900">
                  Assumption
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-800">
                  {config.carePlanNote.assumption}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-4">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-900">
                  Intervention
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-800">
                  {config.carePlanNote.intervention}
                </p>
              </div>
            </div>
          </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div>
                <div
                  data-testid="visual-explainer-state"
                  className="text-xs font-black uppercase tracking-[0.18em] text-slate-500"
                >
                  State: {currentState}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-800">{config.childHook}</p>
              </div>
              <button
                type="button"
                onClick={start}
                className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-sm"
              >
                <Play size={16} />
                Start Treatment
              </button>
            </div>

            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="relative aspect-[16/9] min-h-[360px] p-4">
                <CarrierFlowScene
                  brief={visualBrief}
                  progress={progress}
                  isPlaying={isPlaying}
                />
                <motion.div
                  className="absolute bottom-5 left-5 right-5 rounded-lg bg-white/92 p-4 shadow-lg backdrop-blur"
                  initial={false}
                  animate={{ y: 0, opacity: 1 }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-bold text-slate-800">{checkpointCaption}</p>
                    <span className="text-xs font-black text-slate-500">
                      {Math.round(progress * 100)}%
                    </span>
                  </div>
                  <input
                    aria-label={`${config.topic} time scrubber`}
                    data-testid="visual-explainer-scrubber"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(progress * 100)}
                    onChange={(event) => setScrubProgress(Number(event.target.value) / 100)}
                    className="mt-3 w-full accent-sky-600"
                  />
                </motion.div>
              </div>

              <aside className="grid content-start gap-4 border-t border-slate-200 p-4 lg:border-l lg:border-t-0">
                {currentState === "intro" || currentState === "playing" ? (
                  <div className="rounded-lg bg-slate-50 p-4">
                    <h2 className="text-lg font-black">Watch for the evidence.</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      The model will pause before the reveal so the child commits to a prediction.
                    </p>
                  </div>
                ) : null}

                {currentState === "pausedForPrediction" ? (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
                    <h2
                      data-testid="visual-explainer-prediction-prompt"
                      className="text-xl font-black"
                    >
                      {config.prediction.prompt}
                    </h2>
                    <div className="mt-4 grid gap-2">
                      {config.prediction.options.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => answerPrediction(option)}
                          className="rounded-md border border-sky-200 bg-white px-3 py-3 text-left text-sm font-bold text-slate-900 shadow-sm hover:border-sky-500"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {currentState === "reveal" ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <h2 className="text-lg font-black text-emerald-950">Reveal</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-800">
                      {config.prediction.reveal}
                    </p>
                    <button
                      type="button"
                      onClick={() => actor.send({ type: "CONTINUE" })}
                      className="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm font-black text-white"
                    >
                      Continue
                    </button>
                  </div>
                ) : null}

                {currentState === "replayOrContinue" ? (
                  <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <button
                      type="button"
                      onClick={() => {
                        hasReachedPrediction.current = true;
                        setProgress(config.animation.predictionAt);
                        actor.send({ type: "REPLAY" });
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-black"
                    >
                      <RotateCcw size={16} />
                      Replay from reveal
                    </button>
                    <button
                      type="button"
                      onClick={() => actor.send({ type: "EXIT_READY" })}
                      className="rounded-md bg-slate-950 px-4 py-2 text-sm font-black text-white"
                    >
                      Exit Check
                    </button>
                  </div>
                ) : null}

                {currentState === "exitCheck" ? (
                  <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
                    <h2 className="text-lg font-black text-violet-950">
                      {config.exitCheck.prompt}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-800">
                      {config.exitCheck.answer}
                    </p>
                    <button
                      type="button"
                      onClick={finish}
                      className="mt-4 inline-flex items-center gap-2 rounded-md bg-violet-700 px-4 py-2 text-sm font-black text-white"
                    >
                      <CheckCircle2 size={16} />
                      Complete
                    </button>
                  </div>
                ) : null}

                {currentState === "complete" ? (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
                    <h2 className="text-lg font-black text-emerald-950">Treatment complete</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-800">
                      The demo has emitted the same kind of evidence a future map node can persist.
                    </p>
                  </div>
                ) : null}
              </aside>
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
