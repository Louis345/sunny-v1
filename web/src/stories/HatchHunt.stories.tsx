import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactElement } from "react";
import { COMPANION_MANIFEST } from "../companion/companions.generated";
import { MonsterDenPreview } from "../components/CapturedMonsterDen";
import {
  answerHatchChaseQuestion,
  answerHatchChaseRecovery,
  completeHatchChaseWorkedSupport,
  createHatchChaseSession,
  expireHatchChaseTimer,
  recordHatchChaseThrow,
  type HatchChaseEvent,
  type HatchChaseQuestion,
  type HatchChaseState,
} from "../components/HatchChaseEngine";
import { HatchHuntExperience } from "../components/HatchHuntExperience";
import {
  FULL_TOUR_CUES,
  advanceHatchHuntFullTour,
  completeHatchHuntFullTour,
  createHatchHuntFullTour,
  pauseHatchHuntFullTour,
  resumeHatchHuntFullTour,
  setHatchHuntFullTourSpeed,
  type HatchHuntFullTourCue,
  type HatchHuntFullTourSpeed,
  type HatchHuntFullTourState,
} from "../components/HatchHuntFullTour";
import type { HatchHuntQuestion, HatchHuntState } from "../components/HatchHuntEngine";
import { captureSoundForStage, playHatchHuntSfx } from "../components/HatchHuntPolish";
import {
  SparkOrbLearningShell,
  type SparkOrbLearningEncounterEvent,
} from "../components/SparkOrbLearningShell";
import { MOSSBACK_MONSTER } from "../components/capturedMonsterCatalog";
import {
  createPersistentStorybookMonsterInventory,
  createStorybookMonsterInventory,
  recordCapturedCreatureReward,
  storybookReceiptForInventoryRecord,
  type CapturedCreatureRewardGatewayReceipt,
  type OrbCaptureCompletedEvent,
  type StorybookMonsterInventory,
} from "../components/capturedMonsterReward";
import {
  publishNativeActiveCreature,
  readNativeActiveCreatureSelection,
  returnNativeCreatureToFarmSafely,
  selectionIdForReceipt,
} from "../components/nativeCreatureBridge";

export const MOSSY_HATCH_HUNT_QUESTIONS: HatchHuntQuestion[] = [
  {
    id: "guardian-equal-groups",
    prompt: "Which multiplication fact makes exactly 42 fireflies?",
    answers: ["6 × 7", "5 × 8", "9 × 4"],
    correctAnswer: "6 × 7",
    difficulty: "guardian",
    seconds: null,
  },
  {
    id: "crack-eight-sevens",
    prompt: "The egg warms with 8 groups of 7. How many sparks is that?",
    answers: ["54", "56", "64"],
    correctAnswer: "56",
    difficulty: "stretch",
    seconds: 15,
  },
  {
    id: "crack-nine-sixes",
    prompt: "Nine glowing rings hold 6 runes each. How many runes?",
    answers: ["45", "54", "63"],
    correctAnswer: "54",
    difficulty: "stretch",
    seconds: 12,
  },
  {
    id: "crack-twelve-fours",
    prompt: "Final seal: what is 12 × 4?",
    answers: ["44", "46", "48"],
    correctAnswer: "48",
    difficulty: "challenge",
    seconds: 9,
  },
  {
    id: "rescue-eight-sevens",
    prompt: "Rescue the warmth: build 8 × 7 from seven groups plus one more.",
    answers: ["49 + 7", "48 + 7", "42 + 7"],
    correctAnswer: "49 + 7",
    difficulty: "recovery",
    seconds: null,
  },
];

export const MOSSY_CHASE_QUESTIONS: HatchChaseQuestion[] = [
  {
    id: "word:because",
    prompt: "Spell the word you hear",
    answers: ["because", "becuase", "becuse"],
    correctAnswer: "because",
    seconds: 15,
    recovery: {
      prompt: "Elli's clue: because begins with be and keeps cause at the end.",
      answers: ["be + cause", "bec + ause", "be + cauze"],
      correctAnswer: "be + cause",
      workedAnswer: "Join be and cause: be + cause = because.",
    },
  },
  {
    id: "word:garden",
    prompt: "Choose the garden word",
    answers: ["gardan", "garden", "gardin"],
    correctAnswer: "garden",
    seconds: 12,
    recovery: {
      prompt: "Elli's clue: the last syllable sounds like den.",
      answers: ["gar + den", "gar + dan", "gar + din"],
      correctAnswer: "gar + den",
      workedAnswer: "Join gar and den: gar + den = garden.",
    },
  },
  {
    id: "word:spark",
    prompt: "Finish the spark word",
    answers: ["spack", "spark", "shark"],
    correctAnswer: "spark",
    seconds: 9,
    recovery: {
      prompt: "Elli's clue: listen for the r before the final k.",
      answers: ["spa + rk", "spa + ck", "sha + rk"],
      correctAnswer: "spa + rk",
      workedAnswer: "Join spa and rk: spa + rk = spark.",
    },
  },
];

const DEMO_SPELLING_STEMS: Record<string, string> = {
  "word:because": "becau_e",
  "word:garden": "gar_en",
  "word:spark": "spa_k",
};

type EncounterPhase =
  | "hatch"
  | "escape"
  | "chase_questions"
  | "capture_ready"
  | "capturing"
  | "retreated";
type EscapeAnimationStage = "hatching" | "reacting" | "escaping" | "handoff-ready";
type CaptureAnimationStage = "targeting" | "orb-flight" | "impact" | "pull" | "lock" | "capture-complete";
type AnimationStage = EscapeAnimationStage | CaptureAnimationStage;
type AnimationPreview = "hatch" | "escape" | "capture";
type HatchHuntSurface = "encounter" | "arrival" | "farm" | "continued";
type FarmPresentationStatus = "idle" | "starting" | "active" | "resting";
const CAPTURE_TO_ARRIVAL_DELAY_MS = 6_000;

export function initialFarmPresentationState({
  creatureId,
  persistedActiveCreatureId,
  visibleCreatureId,
}: {
  creatureId: string;
  persistedActiveCreatureId: string | null;
  visibleCreatureId: string | null;
}): { active: boolean; presentationStatus: FarmPresentationStatus } {
  const active = persistedActiveCreatureId === creatureId && visibleCreatureId === creatureId;
  return {
    active,
    presentationStatus: active ? "active" : "idle",
  };
}

export function farmPresentationStateFromNativeSelection({
  childId,
  creatureId,
  persistedActiveCreatureId,
  nativeSelectionId,
}: {
  childId: string;
  creatureId: string;
  persistedActiveCreatureId: string | null;
  nativeSelectionId: string | null;
}): { active: boolean; presentationStatus: FarmPresentationStatus } {
  return initialFarmPresentationState({
    creatureId,
    persistedActiveCreatureId,
    visibleCreatureId:
      nativeSelectionId === `active:${childId}:${creatureId}` ? creatureId : null,
  });
}

function inventoryForDemo(): StorybookMonsterInventory {
  return typeof window === "undefined"
    ? createStorybookMonsterInventory({ childId: "ila" })
    : createPersistentStorybookMonsterInventory({ childId: "ila" });
}

function elliForDemo() {
  const entry =
    COMPANION_MANIFEST.find((candidate) => candidate.id === "elli") ??
    COMPANION_MANIFEST[0];
  if (!entry) throw new Error("hatch_chase_missing_elli_companion");
  return entry;
}

function phaseForCharge(chargedOrbs: number) {
  if (chargedOrbs <= 0) return "idle" as const;
  if (chargedOrbs === 1) return "charge-1" as const;
  if (chargedOrbs === 2) return "charge-2" as const;
  return "ready" as const;
}

function StorybookTestControls({
  canCharge,
  captureSafe,
  forceExpanded,
  onCharge,
  onOpenCapture,
  onPlayCaptureAnimation,
  onPlayEscapeAnimation,
  onPlayHatchAnimation,
  onPauseTour,
  onPlayTour,
  onReset,
  onSpeedChange,
  tour,
  tourSpeed,
}: {
  canCharge: boolean;
  captureSafe: boolean;
  forceExpanded: boolean;
  onCharge: () => void;
  onOpenCapture: () => void;
  onPlayCaptureAnimation: () => void;
  onPlayEscapeAnimation: () => void;
  onPlayHatchAnimation: () => void;
  onPauseTour: () => void;
  onPlayTour: () => void;
  onReset: () => void;
  onSpeedChange: (speed: HatchHuntFullTourSpeed) => void;
  tour: HatchHuntFullTourState | null;
  tourSpeed: HatchHuntFullTourSpeed;
}): ReactElement {
  const paused = tour?.status === "paused";
  const playing = tour?.status === "playing";
  const compact = !forceExpanded && (playing || paused);
  return (
    <aside
      className="hatch-hunt-test-controls"
      data-testid="hatch-hunt-test-controls"
      data-tour-layout={captureSafe ? "capture-safe" : compact ? "compact" : "expanded"}
    >
      {captureSafe ? (
        <div>
          {canCharge ? <button type="button" onClick={onCharge}>Charge 3 Sparks</button> : null}
          <button type="button" onClick={onReset}>Reset Demo</button>
        </div>
      ) : compact ? (
        <div className="hatch-hunt-test-controls__playback">
          <strong>{paused ? "TOUR PAUSED" : `FULL TOUR · ${tourSpeed}×`}</strong>
          <button type="button" onClick={onPauseTour}>
            {paused ? "Resume Tour" : "Pause Tour"}
          </button>
        </div>
      ) : (
        <>
          <strong>STORYBOOK TEST CONTROLS</strong>
          <span>Preview only · no child evidence</span>
          <div>
            <button type="button" onClick={onPlayTour}>Play Full Tour</button>
            <button type="button" onClick={onPlayHatchAnimation}>Hatch Animation Only</button>
            <button type="button" onClick={onPlayEscapeAnimation}>Escape Animation Only</button>
            <button type="button" onClick={onPlayCaptureAnimation}>Capture Animation Only</button>
            <button type="button" disabled onClick={onPauseTour}>Pause Tour</button>
            <label>
              Tour speed
              <select
                aria-label="Tour speed"
                value={tourSpeed}
                onChange={(event) => onSpeedChange(Number(event.target.value) as HatchHuntFullTourSpeed)}
              >
                <option value={0.5}>0.5×</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
              </select>
            </label>
            <button type="button" onClick={onOpenCapture}>Open Capture Screen</button>
            <button type="button" disabled={!canCharge} onClick={onCharge}>Charge 3 Sparks</button>
            <button type="button" onClick={onReset}>Reset Demo</button>
          </div>
        </>
      )}
      <style>{testControlStyles}</style>
    </aside>
  );
}

function ChaseProblemPanel({
  state,
  questionStartedAt,
  onChange,
}: {
  state: HatchChaseState;
  questionStartedAt: MutableRefObject<number>;
  onChange: (next: HatchChaseState) => void;
}): ReactElement {
  const question = state.currentQuestion;

  if (state.phase === "capture_ready" || state.phase === "capturing") {
    return (
      <div className="mossy-chase-question mossy-chase-question--ready">
        <span>ORB CATCHER</span>
        <h2>Three orbs are ready</h2>
        <p>Watch Mossy pause, then pull back and release toward her.</p>
      </div>
    );
  }

  if (!question) {
    return <div className="mossy-chase-question"><h2>Follow Mossy!</h2></div>;
  }

  if (state.phase === "worked_support") {
    return (
      <div className="mossy-chase-question" aria-live="polite">
        <span>ELLI SHOWS THE PATH</span>
        <h2>{question.recovery.workedAnswer}</h2>
        <p>This is assisted practice, so it helps the next step without becoming a mastery claim.</p>
        <button type="button" onClick={() => onChange(completeHatchChaseWorkedSupport(state))}>
          Complete the step
        </button>
      </div>
    );
  }

  const recovery = state.phase === "recovery";
  const prompt = recovery ? question.recovery.prompt : question.prompt;
  const answers = recovery ? question.recovery.answers : question.answers;

  if (!recovery) {
    return (
      <div className="spark-orb-story-problem" aria-live="polite">
        <div className="spark-orb-story-problem__label">
          Spelling · Question {state.currentQuestionIndex + 1} of 3
        </div>
        <h2>{prompt}</h2>
        <div className="spark-orb-story-problem__body">
          <div className="spark-orb-story-problem__write-box">
            {DEMO_SPELLING_STEMS[question.id] ?? question.id}
          </div>
          <div className="spark-orb-story-problem__choice-grid">
            {answers.map((answer) => (
              <button
                type="button"
                aria-label={answer}
                className="spark-orb-story-problem__choice"
                data-correct={answer === question.correctAnswer ? "true" : "false"}
                key={answer}
                onClick={() =>
                  onChange(answerHatchChaseQuestion(state, {
                    answer,
                    latencyMs: Date.now() - questionStartedAt.current,
                  }))
                }
              >
                <span>{answer}</span>
                {answer === question.correctAnswer ? <strong>+1</strong> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="spark-orb-story-problem__feedback">
          Correct answer: +1 spark. Three sparks unlock the Sunny Orb.
        </div>
      </div>
    );
  }

  return (
    <div className="mossy-chase-question" aria-live="polite">
      <div className="mossy-chase-question__topline">
        <span>{recovery ? "UNTIMED SUPPORT" : `CHASE ${state.currentQuestionIndex + 1} OF 3`}</span>
        <strong>{recovery ? "Elli is helping" : `${question.seconds} seconds`}</strong>
      </div>
      {!recovery ? (
        <div className="mossy-chase-question__timer" aria-label={`${question.seconds} second chase timer`}>
          <i
            key={question.id}
            style={{ animationDuration: `${question.seconds}s` }}
            onAnimationEnd={() => onChange(expireHatchChaseTimer(state))}
          />
        </div>
      ) : null}
      <h2>{prompt}</h2>
      <div className="mossy-chase-question__answers">
        {answers.map((answer) => (
          <button
            type="button"
            key={answer}
            onClick={() =>
              onChange(
                recovery
                  ? answerHatchChaseRecovery(state, {
                      answer,
                      latencyMs: Date.now() - questionStartedAt.current,
                    })
                  : answerHatchChaseQuestion(state, {
                      answer,
                      latencyMs: Date.now() - questionStartedAt.current,
                    }),
              )
            }
          >
            {answer}
          </button>
        ))}
      </div>
      <div className="mossy-chase-question__orbs" aria-label={`${state.chargedOrbs} of 3 chase orbs charged`}>
        {[1, 2, 3].map((orb) => <i key={orb} data-charged={orb <= state.chargedOrbs} />)}
      </div>
    </div>
  );
}

export function MossyHatchHuntDemoStory(): ReactElement {
  const inventoryRef = useRef<StorybookMonsterInventory | null>(null);
  if (!inventoryRef.current) inventoryRef.current = inventoryForDemo();
  const inventory = inventoryRef.current;
  const elli = elliForDemo();
  const initialPresentation = initialFarmPresentationState({
    creatureId: MOSSBACK_MONSTER.id,
    persistedActiveCreatureId: inventory.state().activeCreatureId,
    visibleCreatureId: null,
  });
  const [surface, setSurface] = useState<HatchHuntSurface>("encounter");
  const [encounterPhase, setEncounterPhase] = useState<EncounterPhase>("hatch");
  const [attempt, setAttempt] = useState(1);
  const encounterId = `mossy-whispering-grove-${attempt}`;
  const [chaseState, setChaseState] = useState<HatchChaseState | null>(null);
  const [targetOffsetX, setTargetOffsetX] = useState(0);
  const [receipt, setReceipt] = useState<CapturedCreatureRewardGatewayReceipt | null>(null);
  const [arrivalPending, setArrivalPending] = useState(false);
  const [active, setActive] = useState(initialPresentation.active);
  const [presentationStatus, setPresentationStatus] = useState<FarmPresentationStatus>(
    initialPresentation.presentationStatus,
  );
  const nativeSyncGeneration = useRef(0);
  const questionStartedAt = useRef(Date.now());
  const captureRecorded = useRef(false);
  const [tour, setTour] = useState<HatchHuntFullTourState | null>(null);
  const [tourSpeed, setTourSpeed] = useState<HatchHuntFullTourSpeed>(1);
  const [animationOnly, setAnimationOnly] = useState(false);
  const [animationPreview, setAnimationPreview] = useState<AnimationPreview | null>(null);
  const [animationStage, setAnimationStage] = useState<AnimationStage | null>(null);
  const tourRetryCount = useRef(0);

  useEffect(() => {
    questionStartedAt.current = Date.now();
  }, [chaseState?.currentQuestion?.id, chaseState?.phase]);

  useEffect(() => {
    if (surface !== "farm") return;
    let cancelled = false;
    const generation = nativeSyncGeneration.current;
    void readNativeActiveCreatureSelection()
      .then((nativeSelectionId) => {
        if (cancelled) return;
        if (generation !== nativeSyncGeneration.current) {
          console.info(" 🎮 [sunny-buddy] [screen-sync] [ignored_stale]", {
            childId: "ila",
            creatureId: MOSSBACK_MONSTER.id,
            generation,
            currentGeneration: nativeSyncGeneration.current,
          });
          return;
        }
        const next = farmPresentationStateFromNativeSelection({
          childId: "ila",
          creatureId: MOSSBACK_MONSTER.id,
          persistedActiveCreatureId: inventory.state().activeCreatureId,
          nativeSelectionId,
        });
        setActive(next.active);
        setPresentationStatus(next.presentationStatus);
        console.info(" 🎮 [sunny-buddy] [screen-sync] [resolved]", {
          childId: "ila",
          creatureId: MOSSBACK_MONSTER.id,
          nativeSelectionId,
          active: next.active,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(" 🎮 [sunny-buddy] [screen-sync] [failed]", error);
      });
    return () => {
      cancelled = true;
    };
  }, [inventory, surface]);

  useEffect(() => {
    if (!arrivalPending || !receipt) return;
    const timer = window.setTimeout(() => {
      setArrivalPending(false);
      setSurface("arrival");
      console.info(" 🎮 [hatch-chase] [farm_arrival_viewed] [recorded]", {
        encounterId,
        childId: receipt.childId,
        creatureId: receipt.creatureId,
        delayMs: CAPTURE_TO_ARRIVAL_DELAY_MS,
      });
    }, CAPTURE_TO_ARRIVAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [arrivalPending, encounterId, receipt]);

  useEffect(() => {
    if (encounterPhase !== "escape") return;
    const timer = window.setTimeout(() => setEncounterPhase("chase_questions"), 1_250);
    return () => window.clearTimeout(timer);
  }, [encounterPhase]);

  useEffect(() => {
    if (animationPreview !== "escape" || !animationStage || animationStage === "handoff-ready") return;
    const nextStage: Record<Exclude<EscapeAnimationStage, "handoff-ready">, {
      delayMs: number;
      stage: EscapeAnimationStage;
    }> = {
      hatching: { delayMs: 2_700, stage: "reacting" },
      reacting: { delayMs: 850, stage: "escaping" },
      escaping: { delayMs: 1_800, stage: "handoff-ready" },
    };
    const next = nextStage[animationStage as Exclude<EscapeAnimationStage, "handoff-ready">];
    const timer = window.setTimeout(() => {
      setAnimationStage(next.stage);
      console.info(" 🎮 [hatch-hunt-preview] [escape_animation_frame] [storybook_only]", {
        stage: next.stage,
        evidencePersisted: false,
        nativePresentationRequested: false,
      });
    }, next.delayMs);
    return () => window.clearTimeout(timer);
  }, [animationPreview, animationStage]);

  useEffect(() => {
    const captureAnimationActive = animationPreview === "capture";
    if (!captureAnimationActive || !animationStage || animationStage === "capture-complete") return;
    const nextStage: Record<Exclude<CaptureAnimationStage, "capture-complete">, {
      delayMs: number;
      stage: CaptureAnimationStage;
    }> = {
      targeting: { delayMs: 700, stage: "orb-flight" },
      "orb-flight": { delayMs: 950, stage: "impact" },
      impact: { delayMs: 550, stage: "pull" },
      pull: { delayMs: 1_100, stage: "lock" },
      lock: { delayMs: 1_300, stage: "capture-complete" },
    };
    const next = nextStage[animationStage as Exclude<CaptureAnimationStage, "capture-complete">];
    const timer = window.setTimeout(() => {
      setAnimationStage(next.stage);
      const sound = captureSoundForStage(next.stage);
      if (sound) playHatchHuntSfx(sound);
      console.info(" 🎮 [hatch-hunt-preview] [capture_animation_frame] [storybook_only]", {
        stage: next.stage,
        evidencePersisted: false,
        nativePresentationRequested: false,
      });
    }, next.delayMs);
    return () => window.clearTimeout(timer);
  }, [animationPreview, animationStage]);

  useEffect(() => {
    if (!tour || tour.status !== "playing") return;
    const cue = FULL_TOUR_CUES[tour.cueIndex];
    if (!cue) throw new Error("hatch_hunt_full_tour_cue_missing");

    function findButton(label: string): HTMLButtonElement | null {
      return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
        button.getAttribute("aria-label") === label || button.textContent?.trim() === label,
      ) ?? null;
    }

    function advance(): void {
      tourRetryCount.current = 0;
      setTour((current) => current ? advanceHatchHuntFullTour(current) : current);
    }

    function retry(): void {
      tourRetryCount.current += 1;
      if (tourRetryCount.current > 10) {
        console.error(" 🎮 [hatch-hunt-preview] [full_tour] [cue_timeout]", { cue });
        setTour((current) => current ? { ...current, status: "paused" } : current);
        return;
      }
      setTour((current) => current ? { ...current } : current);
    }

    const labels: Partial<Record<HatchHuntFullTourCue, string>> = {
      choose_egg: "Choose fern egg",
      answer_guardian: "6 × 7",
      answer_crack_one: "56",
      answer_crack_two: "54",
      answer_crack_three: "48",
      answer_because: "because",
      answer_garden: "garden",
      answer_spark: "spark",
    };
    const actionDelay = Math.round(460 / tour.speed);
    const delay = cue === "watch_hatch"
      ? 1_900
      : cue === "watch_escape"
        ? 1_500
        : cue === "watch_capture"
          ? 5_500
          : actionDelay;

    const timer = window.setTimeout(() => {
      if (cue === "farm_arrival") {
        if (surface !== "arrival") {
          retry();
          return;
        }
        console.info(" 🎮 [hatch-hunt-preview] [full_tour] [farm_arrival]", {
          encounterId,
          evidencePersisted: false,
          nativePresentationRequested: false,
        });
        setTour((current) => current ? completeHatchHuntFullTour(current) : current);
        return;
      }
      if (cue === "watch_hatch" || cue === "watch_escape") {
        advance();
        return;
      }
      if (cue === "watch_capture") {
        surface === "arrival" ? advance() : retry();
        return;
      }
      if (cue === "launch_orb") {
        const launch = document.querySelector<HTMLButtonElement>("[data-testid='spark-orb-launch-control']");
        if (!launch) {
          retry();
          return;
        }
        launch.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
        advance();
        return;
      }
      const label = labels[cue];
      const button = label ? findButton(label) : null;
      if (!button) {
        retry();
        return;
      }
      button.click();
      advance();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [encounterId, surface, tour]);

  useEffect(() => {
    if (!["capture_ready", "capturing"].includes(encounterPhase)) return;
    const positions = [-92, 68, 0, 84, -54, 0, -76, 52];
    const timers = positions.map((position, index) =>
      window.setTimeout(() => setTargetOffsetX(position), index * 2_700),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [encounterPhase]);

  function applyChaseState(next: HatchChaseState): void {
    const newEvents = next.events.slice(chaseState?.events.length ?? 0);
    newEvents.forEach((event: HatchChaseEvent) => {
      console.info(` 🎮 [hatch-chase] [${event.type}] [recorded]`, event);
    });
    setChaseState(next);
    if (next.phase === "capture_ready") {
      setEncounterPhase("capture_ready");
    }
    if (next.phase === "capturing") setEncounterPhase("capturing");
    if (next.phase === "retreated") setEncounterPhase("retreated");
  }

  function beginChase(state: HatchHuntState): void {
    if (!state.discovery || state.discovery.next !== "orb_chase") {
      throw new Error("hatch_chase_discovery_required");
    }
    const next = createHatchChaseSession({
      encounterId: state.discovery.encounterId,
      childId: state.discovery.childId,
      creatureId: state.discovery.creatureId,
      questions: MOSSY_CHASE_QUESTIONS,
      orbCount: 3,
    });
    setChaseState(next);
    setEncounterPhase("escape");
    console.info(" 🎮 [hatch-chase] [creature_discovered] [chase_ready]", state.discovery);
  }

  function handleOrbEvent(event: SparkOrbLearningEncounterEvent): void {
    console.info(` 🎮 [hatch-chase] [${event.type}] [reported]`, event);
    if (event.type !== "release_miss" || !chaseState) return;
    applyChaseState(recordHatchChaseThrow(chaseState, {
      result: "miss",
      hitDistance: event.hitDistance ?? 999,
    }));
  }

  function handleCaptureCompleted(event: OrbCaptureCompletedEvent): void {
    if (captureRecorded.current) {
      console.info(" 🎮 [hatch-chase] [orb_capture_completed] [duplicate_ignored]", {
        encounterId,
      });
      return;
    }
    if (!chaseState || event.encounterId !== chaseState.encounterId) {
      throw new Error("hatch_chase_capture_encounter_mismatch");
    }
    if (event.source !== "hatch_hunt_orb_capture") {
      throw new Error("hatch_chase_capture_source_required");
    }
    captureRecorded.current = true;
    applyChaseState(recordHatchChaseThrow(chaseState, {
      result: "capture",
      hitDistance: event.hitDistance ?? 0,
    }));
    const recorded = recordCapturedCreatureReward({ mode: "storybook_only", event, inventory });
    setReceipt(recorded);
    setArrivalPending(true);
    console.info(" 🎮 [hatch-chase] [orb_capture_completed] [settling]", {
      encounterId,
      childId: recorded.childId,
      creatureId: recorded.creatureId,
      inventoryWritten: true,
      delayMs: CAPTURE_TO_ARRIVAL_DELAY_MS,
    });
  }

  function restartEncounter(): void {
    captureRecorded.current = false;
    setArrivalPending(false);
    setAttempt((current) => current + 1);
    setEncounterPhase("hatch");
    setChaseState(null);
    setTargetOffsetX(0);
    setReceipt(null);
    console.info(" 🎮 [hatch-chase] [restart] [egg_selection]", { previousEncounterId: encounterId });
  }

  function openCapturePreview(): void {
    setAnimationOnly(false);
    setAnimationPreview(null);
    setAnimationStage(null);
    captureRecorded.current = false;
    setArrivalPending(false);
    const previewSession = createHatchChaseSession({
      encounterId,
      childId: "ila",
      creatureId: MOSSBACK_MONSTER.id,
      questions: MOSSY_CHASE_QUESTIONS,
      orbCount: 3,
    });
    setReceipt(null);
    setSurface("encounter");
    setTargetOffsetX(0);
    setChaseState(previewSession);
    setEncounterPhase("chase_questions");
    console.info(" 🎮 [hatch-hunt-preview] [open_capture_screen] [storybook_only]", {
      encounterId,
      evidencePersisted: false,
    });
  }

  function chargePreviewOrbs(): void {
    if (!chaseState) return;
    let next = chaseState;
    let count = 0;
    while (next.phase !== "capture_ready") {
      if (count >= 3 || !next.currentQuestion) {
        throw new Error("hatch_hunt_preview_charge_guard_exceeded");
      }
      next = answerHatchChaseQuestion(next, {
        answer: next.currentQuestion.correctAnswer,
        latencyMs: 0,
      });
      count += 1;
    }
    applyChaseState(next);
    console.info(" 🎮 [hatch-hunt-preview] [charge_three_sparks] [storybook_only]", {
      encounterId,
      evidencePersisted: false,
    });
  }

  function resetPreview(): void {
    setAnimationOnly(false);
    setAnimationPreview(null);
    setAnimationStage(null);
    setTour(null);
    setSurface("encounter");
    restartEncounter();
  }

  function playFullTour(): void {
    setAnimationOnly(false);
    setAnimationPreview(null);
    setAnimationStage(null);
    captureRecorded.current = false;
    setSurface("encounter");
    restartEncounter();
    tourRetryCount.current = 0;
    setTour(createHatchHuntFullTour({ speed: tourSpeed }));
    console.info(" 🎮 [hatch-hunt-preview] [full_tour] [started]", {
      encounterId,
      evidencePersisted: false,
      nativePresentationRequested: false,
    });
  }

  function toggleTourPause(): void {
    setTour((current) => {
      if (!current) return current;
      return current.status === "paused"
        ? resumeHatchHuntFullTour(current)
        : pauseHatchHuntFullTour(current);
    });
  }

  function changeTourSpeed(speed: HatchHuntFullTourSpeed): void {
    setTourSpeed(speed);
    setTour((current) => current ? setHatchHuntFullTourSpeed(current, speed) : current);
  }

  function playHatchAnimationOnly(): void {
    captureRecorded.current = false;
    setTour(null);
    setSurface("encounter");
    setEncounterPhase("hatch");
    setChaseState(null);
    setTargetOffsetX(0);
    setReceipt(null);
    setAttempt((current) => current + 1);
    setAnimationOnly(true);
    setAnimationPreview("hatch");
    setAnimationStage(null);
    console.info(" 🎮 [hatch-hunt-preview] [animation_only] [started]", {
      encounterId,
      evidencePersisted: false,
      nativePresentationRequested: false,
    });
  }

  function playEscapeAnimationOnly(): void {
    captureRecorded.current = false;
    setTour(null);
    setSurface("encounter");
    setEncounterPhase("hatch");
    setChaseState(null);
    setTargetOffsetX(0);
    setReceipt(null);
    setAttempt((current) => current + 1);
    setAnimationOnly(true);
    setAnimationPreview("escape");
    setAnimationStage("hatching");
    console.info(" 🎮 [hatch-hunt-preview] [escape_animation_only] [started]", {
      encounterId,
      evidencePersisted: false,
      nativePresentationRequested: false,
    });
  }

  function playCaptureAnimationOnly(): void {
    captureRecorded.current = false;
    setTour(null);
    setSurface("encounter");
    setEncounterPhase("hatch");
    setChaseState(null);
    setTargetOffsetX(0);
    setReceipt(null);
    setAttempt((current) => current + 1);
    setAnimationOnly(true);
    setAnimationPreview("capture");
    setAnimationStage("targeting");
    console.info(" 🎮 [hatch-hunt-preview] [capture_animation_only] [started]", {
      encounterId,
      evidencePersisted: false,
      nativePresentationRequested: false,
    });
  }

  const testControls = (tour?.status === "playing" || animationOnly) && surface === "encounter" ? null : (
    <StorybookTestControls
      canCharge={surface === "encounter" && encounterPhase === "chase_questions"}
      captureSafe={surface === "arrival" || (surface === "encounter" && ["chase_questions", "capture_ready", "capturing"].includes(encounterPhase))}
      forceExpanded={surface !== "encounter"}
      onCharge={chargePreviewOrbs}
      onOpenCapture={openCapturePreview}
      onPlayCaptureAnimation={playCaptureAnimationOnly}
      onPlayEscapeAnimation={playEscapeAnimationOnly}
      onPlayHatchAnimation={playHatchAnimationOnly}
      onPauseTour={toggleTourPause}
      onPlayTour={playFullTour}
      onReset={resetPreview}
      onSpeedChange={changeTourSpeed}
      tour={tour}
      tourSpeed={tourSpeed}
    />
  );

  async function bringMossy(): Promise<void> {
    const record = inventory.list().find((candidate) => candidate.creatureId === MOSSBACK_MONSTER.id);
    if (!record) throw new Error("mossy_missing_from_farm");
    nativeSyncGeneration.current += 1;
    setPresentationStatus("starting");
    inventory.selectActiveCreature(record.creatureId);
    const selectedReceipt = storybookReceiptForInventoryRecord(record);
    try {
      await publishNativeActiveCreature(selectedReceipt);
      setActive(true);
      setPresentationStatus("active");
    } catch (error) {
      console.error(" 🎮 [hatch-chase] [active-creature-selected] [failed]", error);
      setPresentationStatus("resting");
      throw error;
    }
  }

  async function returnMossy(): Promise<void> {
    if (!receipt) return;
    nativeSyncGeneration.current += 1;
    try {
      await returnNativeCreatureToFarmSafely(
        { childId: receipt.childId, selectionId: selectionIdForReceipt(receipt) },
        {
          onAccepted() {
            inventory.returnActiveCreature();
            setActive(false);
            setPresentationStatus("idle");
          },
        },
      );
    } catch (error) {
      console.error(" 🎮 [hatch-chase] [active-creature-returned] [failed]", error);
      setPresentationStatus("resting");
      throw error;
    }
  }

  if (surface === "farm" && receipt) {
    return (
      <>
        <div style={{ minHeight: "100vh", background: "linear-gradient(#bde5c3,#f7eac3)", padding: 28 }}>
          <button type="button" onClick={() => setSurface("continued")} style={{ border: 0, borderRadius: 999, fontWeight: 900, marginBottom: 18, padding: "10px 18px" }}>
            Continue learning
          </button>
          <MonsterDenPreview
            creature={MOSSBACK_MONSTER}
            initialNickname={receipt.reward.inventoryRecord.nickname}
            initialBond={receipt.reward.inventoryRecord.bond}
            initialMood={receipt.reward.inventoryRecord.mood}
            active={active}
            presentationStatus={presentationStatus}
            onSelectActive={bringMossy}
            onReturnActive={returnMossy}
          />
        </div>
        {testControls}
      </>
    );
  }

  if (surface === "continued") {
    return (
      <>
        <main style={{ alignItems: "center", background: "#f8f3dc", display: "grid", minHeight: "100vh", placeContent: "center", textAlign: "center" }}>
          <div>
            <h1 style={{ color: "#24452f", fontSize: 46, margin: 0 }}>Hunt complete</h1>
            <p style={{ color: "#42604e", fontSize: 20, fontWeight: 800 }}>Mossy is safe in Whispering Grove. The next Sunny activity can begin.</p>
            <button type="button" onClick={() => setSurface("farm")}>Visit Farm</button>
          </div>
        </main>
        {testControls}
      </>
    );
  }

  if (surface === "arrival" && receipt) {
    const arrivalGradient = `radial-gradient(circle at 50% 18%, ${MOSSBACK_MONSTER.captureOrb.energy} 0%, ${MOSSBACK_MONSTER.captureOrb.primary} 52%, ${MOSSBACK_MONSTER.captureOrb.band} 100%)`;
    const arrivalTheme = {
      "--arrival-primary": MOSSBACK_MONSTER.captureOrb.primary,
      "--arrival-energy": MOSSBACK_MONSTER.captureOrb.energy,
      "--arrival-band": MOSSBACK_MONSTER.captureOrb.band,
      "--arrival-gradient": arrivalGradient,
    } as CSSProperties;
    return (
      <>
        <main
          role="dialog"
          aria-label="Mossy arrived at Sunny Farm"
          className="mossy-farm-arrival"
          data-creature-id={MOSSBACK_MONSTER.id}
          data-theme-source="creature-catalog"
          style={arrivalTheme}
        >
          <span>NEW FARM FRIEND</span>
          <img src={MOSSBACK_MONSTER.imageSrc} alt="Mossy" />
          <h1>Mossy landed safely!</h1>
          <p>Mossy now lives in Whispering Grove.</p>
          <strong>She will only leave the Farm when you choose Bring With Me.</strong>
          <div>
            <button type="button" onClick={() => setSurface("farm")}>Visit Farm</button>
            <button type="button" onClick={() => setSurface("continued")}>Continue</button>
          </div>
          <style>{arrivalStyles}</style>
        </main>
        {testControls}
      </>
    );
  }

  const continuationPhase = encounterPhase === "hatch"
    ? animationPreview === "capture"
      ? "capturing"
      : animationStage === "escaping" || animationStage === "handoff-ready"
        ? "escape"
        : "hatch"
    : encounterPhase === "retreated"
      ? "retreated"
      : encounterPhase === "capturing"
        ? "capturing"
        : encounterPhase === "escape"
          ? "escape"
          : "chase";
  const orbPhase = phaseForCharge(chaseState?.chargedOrbs ?? 0);

  return (
    <main
      className="mossy-hatch-chase"
      data-flow-phase={encounterPhase}
      data-animation-preview={animationPreview ?? undefined}
      data-animation-stage={animationStage ?? undefined}
      data-tour-paused={tour?.status === "paused" ? "true" : "false"}
    >
      {["hatch", "escape", "retreated"].includes(encounterPhase) ? (
        <HatchHuntExperience
          key={encounterId}
          encounterId={encounterId}
          childId="ila"
          creature={MOSSBACK_MONSTER}
          questions={MOSSY_HATCH_HUNT_QUESTIONS}
          continuationPhase={continuationPhase}
          chaseTargetOffsetX={targetOffsetX}
          animationOnly={animationOnly}
          animationPreview={animationPreview ?? undefined}
          animationStage={animationStage ?? undefined}
          onDiscovered={beginChase}
        />
      ) : null}

      {encounterPhase === "escape" ? (
        <section className="mossy-escape-card" aria-live="polite">
          <span>THE CHASE BEGINS</span>
          <h2>Mossy is on the move!</h2>
          <p>Stay close. Elli will help you charge three Sunny Orbs.</p>
        </section>
      ) : null}

      {chaseState && ["chase_questions", "capture_ready", "capturing"].includes(encounterPhase) ? (
        <section className="mossy-capture-screen" data-capture-template="main-spark-orb-learning-shell">
          <SparkOrbLearningShell
          childId="ila"
          childName="Ila"
          companion={elli.companionConfig}
          companionName={elli.name}
          phase={orbPhase}
          chargeGoal={3}
          domain="spelling"
          currentTarget={chaseState.currentQuestion?.id ?? "word:spark"}
          lastMoment={orbPhase === "ready" ? "orb_ready" : chaseState.phase === "recovery" ? "missed_try" : "spark_earned"}
          allowedRole="hint_only"
          creatureName={MOSSBACK_MONSTER.defaultNickname}
          capturedCreature={MOSSBACK_MONSTER}
          orbCount={chaseState.remainingOrbs}
          encounterId={encounterId}
          rewardSource="hatch_hunt_orb_capture"
          targetOffsetX={targetOffsetX}
          missPolicy="consume-orb"
          presentationMode="full"
          launchEnabled={encounterPhase === "capture_ready" || encounterPhase === "capturing"}
          onEncounterEvent={handleOrbEvent}
          onCaptureCompleted={handleCaptureCompleted}
        >
          <ChaseProblemPanel state={chaseState} questionStartedAt={questionStartedAt} onChange={applyChaseState} />
          </SparkOrbLearningShell>
          {arrivalPending ? (
            <div
              className="mossy-capture-settling"
              role="status"
              aria-label="Mossy capture settling"
              data-arrival-delay-ms={CAPTURE_TO_ARRIVAL_DELAY_MS}
            >
              <strong>Capture secured!</strong>
              <span>Mossy is settling into the Farm…</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {encounterPhase === "retreated" ? (
        <section className="mossy-retreat-card" role="dialog" aria-label="Mossy retreated into Whispering Grove">
          <span>THE GROVE GREW QUIET</span>
          <h2>Mossy slipped away.</h2>
          <p>No creature was added to your Farm. The next hunt begins with a new egg.</p>
          <button type="button" onClick={restartEncounter}>Restart Hunt</button>
        </section>
      ) : null}
      {testControls}
      <style>{encounterStyles}</style>
    </main>
  );
}

const testControlStyles = `
  .hatch-hunt-test-controls{background:rgba(20,24,43,.94);border:1px solid rgba(255,255,255,.75);border-radius:16px;box-shadow:0 12px 38px rgba(0,0,0,.28);color:#fff;display:grid;font-family:Inter,system-ui,sans-serif;gap:5px;max-width:560px;padding:10px 12px;position:fixed;right:14px;top:14px;z-index:100}
  .hatch-hunt-test-controls>strong{color:#ffe46b;font-size:11px;letter-spacing:.12em}
  .hatch-hunt-test-controls>span{font-size:11px;opacity:.74}
  .hatch-hunt-test-controls>div{display:flex;flex-wrap:wrap;gap:6px}
  .hatch-hunt-test-controls button{background:#fff;border:0;border-radius:999px;color:#182033;cursor:pointer;font-size:12px;font-weight:900;padding:7px 10px}
  .hatch-hunt-test-controls button:disabled{cursor:not-allowed;opacity:.42}
  .hatch-hunt-test-controls label{align-items:center;display:flex;font-size:11px;font-weight:900;gap:5px}
  .hatch-hunt-test-controls select{background:#fff;border:0;border-radius:999px;color:#182033;font-size:12px;font-weight:900;padding:6px 8px}
  .hatch-hunt-test-controls[data-tour-layout="compact"]{border-radius:999px;bottom:16px;max-width:none;padding:7px 8px 7px 14px;right:16px;top:auto}
  .hatch-hunt-test-controls[data-tour-layout="capture-safe"]{background:transparent;border:0;box-shadow:none;display:block;max-width:none;padding:0;right:14px;top:14px}
  .hatch-hunt-test-controls[data-tour-layout="capture-safe"] button{box-shadow:0 8px 24px rgba(0,0,0,.22)}
  .hatch-hunt-test-controls__playback{align-items:center;display:flex!important;flex-wrap:nowrap!important;gap:10px!important}
  .hatch-hunt-test-controls__playback>strong{color:#ffe46b;font-size:10px;letter-spacing:.1em;white-space:nowrap}
  [data-tour-paused="true"] *{animation-play-state:paused!important}
`;

const encounterStyles = `
  .mossy-hatch-chase{background:#84d5f3;min-height:100vh;overflow:hidden;position:relative}
  .mossy-capture-screen{min-height:100vh}
  .mossy-capture-settling{align-items:center;background:rgba(16,32,45,.9);border:1px solid rgba(255,184,77,.8);border-radius:999px;bottom:24px;box-shadow:0 14px 38px rgba(16,32,45,.28);color:#fff;display:flex;gap:10px;left:50%;padding:11px 18px;pointer-events:none;position:fixed;transform:translateX(-50%);z-index:20}.mossy-capture-settling strong{color:#ffcf75}.mossy-capture-settling span{font-weight:800}
  .mossy-escape-card,.mossy-retreat-card{backdrop-filter:blur(18px);background:rgba(255,253,242,.95);border:2px solid rgba(124,255,241,.82);border-radius:28px;bottom:38px;box-shadow:0 24px 70px rgba(16,32,45,.28),0 0 0 1px rgba(255,228,107,.62);left:50%;max-width:650px;padding:26px 32px;position:absolute;text-align:center;transform:translateX(-50%);width:calc(100vw - 40px);z-index:9}
  .mossy-escape-card span,.mossy-retreat-card span,.mossy-chase-question>span{color:#0e8f9f;font-size:12px;font-weight:950;letter-spacing:.17em}
  .mossy-escape-card h2,.mossy-retreat-card h2{font-size:clamp(34px,5vw,58px);margin:8px 0}
  .mossy-escape-card p,.mossy-retreat-card p{font-size:18px;font-weight:800;margin:6px 0}
  .mossy-retreat-card button,.mossy-chase-question button{background:linear-gradient(135deg,#fff,#e7fcff);border:2px solid rgba(14,143,159,.2);border-radius:16px;color:#10202d;cursor:pointer;font-size:17px;font-weight:950;padding:13px 16px}
  .mossy-chase-question{color:#10202d;display:grid;gap:13px}
  .mossy-chase-question h2{font-size:clamp(24px,3vw,36px);line-height:1.08;margin:2px 0}
  .mossy-chase-question p{font-size:16px;font-weight:750;line-height:1.45;margin:0}
  .mossy-chase-question__topline{align-items:center;color:#0e8f9f;display:flex;font-size:11px;font-weight:950;justify-content:space-between;letter-spacing:.1em;text-transform:uppercase}
  .mossy-chase-question__topline strong{color:#9b6b00}
  .mossy-chase-question__timer{background:rgba(16,32,45,.1);border-radius:999px;height:7px;overflow:hidden}
  .mossy-chase-question__timer i{animation:mossy-chase-timer linear forwards;background:linear-gradient(90deg,#6de6ff,#ffe46b,#ff7d62);display:block;height:100%;transform-origin:left}
  .mossy-chase-question__answers{display:grid;gap:9px;grid-template-columns:repeat(3,1fr)}
  .mossy-chase-question__answers button:hover{background:#ffe46b;transform:translateY(-2px)}
  .mossy-chase-question__orbs{display:flex;gap:8px;justify-content:center}
  .mossy-chase-question__orbs i{background:rgba(16,32,45,.12);border-radius:50%;height:18px;width:18px}
  .mossy-chase-question__orbs i[data-charged="true"]{background:#ffe46b;box-shadow:0 0 16px #ffb84d}
  .spark-orb-story-problem{align-content:start;display:grid;gap:16px;height:100%}
  .spark-orb-story-problem__label{color:#0e8f9f;font-size:13px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
  .spark-orb-story-problem h2{color:#10202d;font-size:clamp(30px,4vw,46px);font-weight:950;line-height:1.04;margin:0}
  .spark-orb-story-problem__body,.spark-orb-story-problem__choice-grid{display:grid;gap:12px}
  .spark-orb-story-problem__write-box{align-items:center;background:#f4f8fb;border:2px dashed rgba(16,32,45,.2);border-radius:16px;display:flex;font-size:40px;font-weight:850;height:96px;justify-content:center}
  .spark-orb-story-problem__choice{align-items:center;background:#fff;border:2px solid rgba(16,32,45,.12);border-radius:16px;color:#10202d;cursor:pointer;display:flex;font-size:18px;font-weight:850;justify-content:space-between;min-height:54px;padding:14px 16px;transition:transform 140ms ease,box-shadow 140ms ease}
  .spark-orb-story-problem__choice:hover,.spark-orb-story-problem__choice:focus-visible{border-color:rgba(14,143,159,.72);box-shadow:0 10px 22px rgba(14,143,159,.12);outline:none;transform:translateY(-1px)}
  .spark-orb-story-problem__choice[data-correct="true"]{background:#effdf5;border-color:rgba(101,185,109,.8)}
  .spark-orb-story-problem__feedback{background:#10202d;border-radius:18px;color:#ffe46b;font-size:18px;font-weight:950;line-height:1.25;padding:16px}
  @keyframes mossy-chase-timer{from{transform:scaleX(1)}to{transform:scaleX(0)}}
  @media(max-width:760px){.mossy-chase-question__answers{grid-template-columns:1fr}}
  @media(prefers-reduced-motion:reduce){.mossy-chase-question__timer i{animation-duration:30s!important}}
`;

const arrivalStyles = `
  .mossy-farm-arrival{align-items:center;background:var(--arrival-gradient);color:#fff;display:grid;gap:14px;min-height:100vh;place-content:center;text-align:center}
  .mossy-farm-arrival img{filter:drop-shadow(0 20px 32px color-mix(in srgb,var(--arrival-band) 52%,transparent))}.mossy-farm-arrival h1,.mossy-farm-arrival p,.mossy-farm-arrival>strong{text-shadow:0 3px 16px color-mix(in srgb,var(--arrival-band) 70%,transparent)}
  .mossy-farm-arrival>span{font-size:13px;font-weight:950;letter-spacing:.16em}.mossy-farm-arrival img{height:250px;justify-self:center}.mossy-farm-arrival h1{font-size:48px;margin:0}.mossy-farm-arrival p{font-size:21px;font-weight:850;margin:0}.mossy-farm-arrival>strong{font-weight:800}.mossy-farm-arrival>div{display:flex;gap:12px;justify-content:center;margin-top:8px}.mossy-farm-arrival button{border:0;border-radius:999px;font-size:17px;font-weight:900;padding:12px 20px}
`;

const meta: Meta = {
  title: "Reward Encounters/Hatch Hunt",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "A continuous Three.js learning encounter: hatch Mossy, follow her through Whispering Grove, charge three orbs with bounded support, capture her, then choose whether to visit Sunny Farm.",
      },
    },
  },
};

export default meta;
type Story = StoryObj;

export const MossyWhisperingGrove: Story = {
  render: () => <MossyHatchHuntDemoStory />,
};
