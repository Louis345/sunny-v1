import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AnimationName,
  CameraAngle,
  CompanionCommand,
} from "../../../src/shared/companions/companionContract";
import {
  ANIMATION_IDS,
} from "../../../src/shared/companions/animations.generated";
import {
  COMPANION_EMOTES,
  type CompanionEmote,
} from "../../../src/shared/companionEmotes";
import type {
  CompanionCareAnimationIntent,
  CompanionCareView,
} from "../../../src/shared/companionCareTypes";
import type { CompanionConfig } from "../../../src/shared/companionTypes";
import { CompanionLayer } from "../components/CompanionLayer";
import { COMPANION_MANIFEST } from "../companion/companions.generated";
import {
  deriveCompanionBehavior,
  type CompanionBehavior,
} from "../context/companionCareBehavior";
import {
  applyTamagotchiPreviewAction,
  createTamagotchiPreviewState,
  type TamagotchiPreviewAction,
} from "../context/tamagotchiCarePreview";

type CareState = "steady" | "hungry" | "tired" | "restored";
type ControlledExpression = "auto" | CompanionEmote;
type ControlledAnimation = "auto" | AnimationName | "__missing_care_animation__";

type CompanionCareStoryArgs = {
  companionId: string;
  careState: CareState;
  hunger: number;
  energy: number;
  expression: ControlledExpression;
  baseAnimation: ControlledAnimation;
  playbackRate: number;
  movementIntensity: number;
  cameraFraming: CameraAngle;
  reducedMotion: boolean;
};

const CHILD_ID = "storybook-care";
const FEED_INTENT: CompanionCareAnimationIntent = {
  kind: "normal-feed",
  reference: "animation-a",
  itemId: "apple_bite",
};
const STATE_LABELS: Record<CareState, string> = {
  steady: "Steady",
  hungry: "Hungry",
  tired: "Tired",
  restored: "Restored",
};

function resolveCompanion(companionId: string): CompanionConfig {
  const entry =
    COMPANION_MANIFEST.find((candidate) => candidate.id === companionId) ??
    COMPANION_MANIFEST.find((candidate) => candidate.id === "elli") ??
    COMPANION_MANIFEST[0];
  if (!entry) {
    throw new Error("companion_care_story_missing_manifest");
  }
  return {
    ...entry.companionConfig,
    companionId: entry.id,
    vrmUrl: entry.vrmUrl,
    expressions: { ...entry.companionConfig.expressions },
  };
}

function careFixture(
  state: CareState,
  hunger: number,
  energy: number,
): CompanionCareView {
  const moodLabel: CompanionCareView["moodLabel"] =
    state === "restored" ? "bright" : state === "steady" ? "happy" : state;
  const hungry = state === "hungry";
  const tired = state === "tired";
  return {
    childId: CHILD_ID,
    companionId: "storybook-companion",
    displayName: "Storybook companion",
    vitals: {
      hunger,
      mood: state === "restored" ? 0.95 : state === "steady" ? 0.78 : 0.52,
      bond: 0.82,
      energy,
      usefulness: 0.8,
      thoughtClarity: tired ? 0.58 : 0.82,
      lastSeenAt: "2026-07-26T12:00:00.000Z",
      lastFedAt:
        state === "restored" ? "2026-07-26T11:59:58.000Z" : undefined,
    },
    economy: { coins: 0, storeUnlocks: [] },
    inventory: {
      food: [
        {
          id: "apple_bite",
          label: "Apple Bite",
          description: "Storybook-only care fixture",
          quantity: 1,
          rarity: "common",
        },
      ],
      careItems: [],
    },
    readiness: {
      hungry,
      lowEnergy: tired,
      lowBond: false,
      lowThoughtClarity: false,
      highEnergyReluctance: tired,
      canContinueTired: true,
      suggestedRepair: hungry ? "feed" : tired ? "rest" : "continue",
    },
    moodLabel,
    lastSeenLabel: "today",
  };
}

function applyStoryControls(
  derived: CompanionBehavior,
  args: CompanionCareStoryArgs,
): CompanionBehavior {
  const reducedRate = args.reducedMotion
    ? Math.min(args.playbackRate, 0.45)
    : args.playbackRate;
  return {
    ...derived,
    emote: args.expression === "auto" ? derived.emote : args.expression,
    baseAnimation:
      args.baseAnimation === "auto"
        ? derived.baseAnimation
        : (args.baseAnimation as AnimationName),
    playbackRate:
      args.playbackRate === 1
        ? args.reducedMotion
          ? Math.min(derived.playbackRate ?? 1, 0.45)
          : derived.playbackRate
        : reducedRate,
    movementIntensity: args.reducedMotion
      ? Math.min(args.movementIntensity, 0.25)
      : args.movementIntensity === 0.72
        ? derived.movementIntensity
        : args.movementIntensity,
    animation: args.reducedMotion ? undefined : derived.animation,
  };
}

function cameraCommand(cameraFraming: CameraAngle): CompanionCommand {
  return {
    apiVersion: "1.0",
    type: "camera",
    payload: { angle: cameraFraming, transition_ms: 0 },
    childId: CHILD_ID,
    timestamp: 10_000 + ["close-up", "mid-shot", "full-body", "wide"].indexOf(cameraFraming),
    source: "diag",
  };
}

function CareStage({
  args,
  state = args.careState,
  feedAnimation = null,
  animationEventId,
  reviewLabel,
  controls,
  additionalCommands = [],
}: {
  args: CompanionCareStoryArgs;
  state?: CareState;
  feedAnimation?: CompanionCareAnimationIntent | null;
  animationEventId?: string;
  reviewLabel?: string;
  controls?: ReactNode;
  additionalCommands?: CompanionCommand[];
}) {
  const companion = useMemo(
    () => resolveCompanion(args.companionId),
    [args.companionId],
  );
  const care = useMemo(
    () => careFixture(state, args.hunger, args.energy),
    [args.energy, args.hunger, state],
  );
  const behavior = useMemo(
    () =>
      applyStoryControls(
        deriveCompanionBehavior(care, feedAnimation, animationEventId),
        args,
      ),
    [animationEventId, args, care, feedAnimation],
  );
  const companionCommands = useMemo(
    () => [cameraCommand(args.cameraFraming), ...additionalCommands],
    [additionalCommands, args.cameraFraming],
  );

  return (
    <main
      data-testid="companion-care-story"
      data-care-state={state}
      data-base-animation={behavior.baseAnimation}
      data-playback-rate={behavior.playbackRate}
      style={{
        position: "relative",
        minHeight: "100vh",
        overflow: "hidden",
        color: "#e2e8f0",
        background:
          "radial-gradient(circle at 75% 40%, rgba(99,102,241,.24), transparent 34%), linear-gradient(145deg, #07111f, #16213d 55%, #0b1220)",
      }}
    >
      <section
        style={{
          position: "relative",
          zIndex: 13000,
          width: "min(430px, 42vw)",
          margin: 28,
          padding: 22,
          border: "1px solid rgba(148,163,184,.28)",
          borderRadius: 22,
          background: "rgba(8,15,29,.88)",
          boxShadow: "0 24px 80px rgba(0,0,0,.34)",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            color: "#a5b4fc",
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: ".12em",
            textTransform: "uppercase",
          }}
        >
          Human visual review · no persistence
        </div>
        <h1 style={{ margin: "10px 0 4px", fontSize: 34 }}>
          {reviewLabel ?? STATE_LABELS[state]}
        </h1>
        <p style={{ margin: 0, color: "#94a3b8", lineHeight: 1.5 }}>
          Watch for at least ten seconds. Judge posture, facial tone, movement,
          clipping, and whether the need is readable without this label.
        </p>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "max-content 1fr",
            gap: "8px 14px",
            margin: "18px 0 0",
            fontSize: 13,
          }}
        >
          <dt style={{ color: "#64748b" }}>Companion</dt>
          <dd style={{ margin: 0 }}>{companion.companionId}</dd>
          <dt style={{ color: "#64748b" }}>Animation</dt>
          <dd style={{ margin: 0 }}>{behavior.baseAnimation ?? "idle"}</dd>
          <dt style={{ color: "#64748b" }}>Expression</dt>
          <dd style={{ margin: 0 }}>{behavior.emote}</dd>
          <dt style={{ color: "#64748b" }}>Playback</dt>
          <dd style={{ margin: 0 }}>{behavior.playbackRate ?? 1}×</dd>
          <dt style={{ color: "#64748b" }}>Motion</dt>
          <dd style={{ margin: 0 }}>{behavior.movementIntensity}</dd>
        </dl>
        {controls}
      </section>

      <CompanionLayer
        childId={CHILD_ID}
        companion={companion}
        toggledOff={false}
        idlePose="center"
        companionBehavior={behavior}
        companionCommands={companionCommands}
        companionEvents={[]}
      />
    </main>
  );
}

function Meter({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 7,
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        <span>
          {icon} {label}
        </span>
        <span>{Math.round(value)}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        style={{
          height: 13,
          overflow: "hidden",
          borderRadius: 999,
          background: "rgba(148,163,184,.2)",
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: "100%",
            borderRadius: 999,
            background: color,
            transition: "width 700ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
      </div>
    </div>
  );
}

function TamagotchiCareLoopStage({
  args,
}: {
  args: CompanionCareStoryArgs;
}) {
  const [preview, setPreview] = useState(createTamagotchiPreviewState);
  const [showCareMeter, setShowCareMeter] = useState(true);
  const [showGiftProgress, setShowGiftProgress] = useState(true);
  const [reactionRun, setReactionRun] = useState(0);

  const dispatch = (action: TamagotchiPreviewAction) => {
    setPreview((current) => applyTamagotchiPreviewAction(current, action));
  };

  useEffect(() => {
    if (!preview.feedingActive) return;
    const timeout = window.setTimeout(
      () => dispatch({ type: "finish-feeding" }),
      1800,
    );
    return () => window.clearTimeout(timeout);
  }, [preview.feedingActive, preview.feedingEventId]);

  const reactionCommands = useMemo<CompanionCommand[]>(
    () =>
      reactionRun === 0
        ? []
        : [
            {
              apiVersion: "1.0",
              type: "animate",
              payload: { animation: "wave", loop: false },
              childId: CHILD_ID,
              timestamp: 20_000 + reactionRun,
              source: "diag",
            },
          ],
    [reactionRun],
  );
  const previewArgs: CompanionCareStoryArgs = {
    ...args,
    hunger: preview.hunger / 100,
    energy: 0.78,
  };
  const hasApple = preview.inventory.apple_bite > 0;

  return (
    <CareStage
      args={previewArgs}
      state={preview.careState}
      feedAnimation={preview.feedingActive ? FEED_INTENT : null}
      animationEventId={preview.feedingEventId ?? undefined}
      additionalCommands={reactionCommands}
      reviewLabel="Tamagotchi care loop"
      controls={
        <div data-testid="tamagotchi-care-loop-preview">
          <p style={{ margin: "16px 0", color: "#cbd5e1", lineHeight: 1.45 }}>
            No profile, inventory, or assignment APIs. Everything resets on
            refresh.
          </p>

          <div
            style={{
              display: "grid",
              gap: 14,
              padding: 16,
              borderRadius: 16,
              background: "rgba(15,23,42,.72)",
            }}
          >
            {showCareMeter ? (
              <Meter
                label="Care meter"
                value={preview.hunger}
                icon="🍎"
                color="linear-gradient(90deg, #fb7185, #fbbf24, #4ade80)"
              />
            ) : null}
            {showGiftProgress ? (
              <Meter
                label="Gift progress"
                value={preview.assignmentProgress}
                icon="🎁"
                color="linear-gradient(90deg, #818cf8, #c084fc)"
              />
            ) : null}
            <div
              aria-label="Storybook inventory"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 14,
              }}
            >
              <span>Lunchbox</span>
              <strong>
                🍎 Apple × {preview.inventory.apple_bite}
              </strong>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
              marginTop: 14,
            }}
          >
            <button
              type="button"
              data-testid="advance-time"
              onClick={() => dispatch({ type: "advance-time" })}
              style={buttonStyle("#475569")}
            >
              Advance time
            </button>
            <button
              type="button"
              data-testid="complete-assignment"
              onClick={() => dispatch({ type: "complete-assignment" })}
              style={buttonStyle("#7c3aed")}
            >
              Complete assignment
            </button>
            <button
              type="button"
              data-testid="give-apple"
              disabled={!hasApple || preview.careState !== "hungry"}
              onClick={() => dispatch({ type: "give-apple" })}
              style={buttonStyle(
                hasApple && preview.careState === "hungry"
                  ? "#ea580c"
                  : "#334155",
              )}
            >
              Give apple
            </button>
            <button
              type="button"
              data-testid="replay-feeding"
              disabled={preview.careState !== "restored"}
              onClick={() => dispatch({ type: "replay-feeding" })}
              style={buttonStyle(
                preview.careState === "restored" ? "#059669" : "#334155",
              )}
            >
              Replay feeding
            </button>
            <button
              type="button"
              data-testid="trigger-reaction"
              onClick={() => setReactionRun((value) => value + 1)}
              style={buttonStyle("#0369a1")}
            >
              Trigger reaction
            </button>
            <button
              type="button"
              data-testid="reset-preview"
              onClick={() => {
                dispatch({ type: "reset" });
                setReactionRun(0);
              }}
              style={buttonStyle("#be123c")}
            >
              Reset
            </button>
          </div>

          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}
          >
            <button
              type="button"
              onClick={() => setShowCareMeter((visible) => !visible)}
              style={buttonStyle("#334155")}
            >
              Care meter: {showCareMeter ? "shown" : "hidden"}
            </button>
            <button
              type="button"
              onClick={() => setShowGiftProgress((visible) => !visible)}
              style={buttonStyle("#334155")}
            >
              Gift progress: {showGiftProgress ? "shown" : "hidden"}
            </button>
          </div>

          <div
            data-testid="structured-care-event"
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 12,
              color: preview.lastEvent ? "#bbf7d0" : "#64748b",
              background: "rgba(2,6,23,.62)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              overflowWrap: "anywhere",
            }}
          >
            Event:{" "}
            {preview.lastEvent
              ? JSON.stringify(preview.lastEvent)
              : "companion_care_completed will appear after feeding"}
          </div>
        </div>
      }
    />
  );
}

function FeedingCareStage({ args }: { args: CompanionCareStoryArgs }) {
  const [phase, setPhase] = useState<"hungry" | "feeding" | "restored">(
    "hungry",
  );
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (phase !== "feeding") return;
    const timeout = window.setTimeout(() => setPhase("restored"), 1800);
    return () => window.clearTimeout(timeout);
  }, [phase, run]);

  const replay = () => {
    setRun((value) => value + 1);
    setPhase("feeding");
  };
  const reset = () => setPhase("hungry");

  return (
    <CareStage
      args={args}
      state={phase === "restored" ? "restored" : "hungry"}
      feedAnimation={phase === "feeding" ? FEED_INTENT : null}
      animationEventId={phase === "feeding" ? `storybook-feed-${run}` : undefined}
      controls={
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            type="button"
            data-testid="replay-feeding"
            onClick={replay}
            style={buttonStyle("#4f46e5")}
          >
            Feed / replay
          </button>
          <button
            type="button"
            data-testid="reset-feeding"
            onClick={reset}
            style={buttonStyle("#334155")}
          >
            Reset hungry
          </button>
        </div>
      }
    />
  );
}

function ComparisonCareStage({ args }: { args: CompanionCareStoryArgs }) {
  const [state, setState] = useState<CareState>("hungry");
  return (
    <CareStage
      args={args}
      state={state}
      controls={
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
          {(["steady", "hungry", "tired", "restored"] as const).map(
            (candidate) => (
              <button
                type="button"
                key={candidate}
                data-testid={`compare-${candidate}`}
                onClick={() => setState(candidate)}
                style={buttonStyle(state === candidate ? "#4f46e5" : "#334155")}
              >
                {STATE_LABELS[candidate]}
              </button>
            ),
          )}
        </div>
      }
    />
  );
}

function ExpressionAuditionStage({
  args,
}: {
  args: CompanionCareStoryArgs;
}) {
  const [expression, setExpression] = useState<CompanionEmote>("neutral");
  const auditionArgs = {
    ...args,
    expression,
    baseAnimation: "rejected" as const,
  };

  return (
    <CareStage
      args={auditionArgs}
      state="steady"
      reviewLabel="Rejected + expression"
      controls={
        <div
          aria-label="Expression audition"
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}
        >
          {COMPANION_EMOTES.map((emote) => (
            <button
              type="button"
              key={emote}
              data-testid={`expression-${emote}`}
              onClick={() => setExpression(emote)}
              style={buttonStyle(expression === emote ? "#4f46e5" : "#334155")}
            >
              {emote}
            </button>
          ))}
        </div>
      }
    />
  );
}

function buttonStyle(background: string) {
  return {
    border: "1px solid rgba(255,255,255,.16)",
    borderRadius: 12,
    padding: "10px 14px",
    background,
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
  } as const;
}

const companionOptions = COMPANION_MANIFEST.map((entry) => entry.id);

const meta: Meta<CompanionCareStoryArgs> = {
  title: "Companion/Care Demeanor Lab",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Storybook-only human review lab using the production CompanionLayer and CompanionMotor. Fixtures are local and never call care APIs or persist state.",
      },
    },
  },
  argTypes: {
    companionId: { control: "select", options: companionOptions },
    careState: {
      control: "inline-radio",
      options: ["steady", "hungry", "tired", "restored"],
    },
    hunger: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    energy: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    expression: {
      control: "select",
      options: ["auto", ...COMPANION_EMOTES],
    },
    baseAnimation: {
      control: "select",
      options: ["auto", ...ANIMATION_IDS],
    },
    playbackRate: {
      control: { type: "range", min: 0.25, max: 1.5, step: 0.01 },
    },
    movementIntensity: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
    },
    cameraFraming: {
      control: "inline-radio",
      options: ["close-up", "mid-shot", "full-body", "wide"],
    },
    reducedMotion: { control: "boolean" },
  },
  args: {
    companionId: "elli",
    careState: "steady",
    hunger: 0.78,
    energy: 0.78,
    expression: "auto",
    baseAnimation: "auto",
    playbackRate: 1,
    movementIntensity: 0.72,
    cameraFraming: "full-body",
    reducedMotion: false,
  },
  render: (args) => <CareStage args={args} />,
};

export default meta;
type Story = StoryObj<CompanionCareStoryArgs>;

export const Steady: Story = {
  args: { careState: "steady", hunger: 0.78, energy: 0.78 },
};

export const Hungry: Story = {
  args: { careState: "hungry", hunger: 0.16, energy: 0.66 },
};

export const Tired: Story = {
  args: { careState: "tired", hunger: 0.62, energy: 0.16 },
};

export const Restored: Story = {
  args: { careState: "restored", hunger: 0.95, energy: 0.92 },
};

export const HungryToRestoredFeeding: Story = {
  args: { careState: "hungry", hunger: 0.16, energy: 0.54 },
  render: (args) => <FeedingCareStage args={args} />,
};

export const StateComparison: Story = {
  args: { careState: "hungry", hunger: 0.16, energy: 0.16 },
  render: (args) => <ComparisonCareStage args={args} />,
};

export const TamagotchiCareLoopPreview: Story = {
  name: "Tamagotchi Care Loop Preview",
  args: {
    careState: "steady",
    hunger: 0.72,
    energy: 0.78,
  },
  render: (args) => <TamagotchiCareLoopStage args={args} />,
};

export const SadIdleCandidate: Story = {
  name: "Candidate · Sad Idle (human review only)",
  args: {
    careState: "steady",
    hunger: 0.78,
    energy: 0.78,
    expression: "neutral",
    baseAnimation: "sad_idle",
    playbackRate: 0.85,
    movementIntensity: 0.5,
  },
  render: (args) => (
    <CareStage args={args} state="steady" reviewLabel="Candidate: Sad Idle" />
  ),
};

export const RejectedCandidate: Story = {
  name: "Candidate · Rejected (human review only)",
  args: {
    careState: "steady",
    hunger: 0.78,
    energy: 0.78,
    expression: "neutral",
    baseAnimation: "rejected",
    playbackRate: 1,
    movementIntensity: 0.5,
  },
  render: (args) => (
    <CareStage args={args} state="steady" reviewLabel="Candidate: Rejected" />
  ),
};

export const RejectedExpressionAudition: Story = {
  name: "Candidate · Rejected + expression toggles",
  args: {
    careState: "steady",
    hunger: 0.78,
    energy: 0.78,
    expression: "neutral",
    baseAnimation: "rejected",
    playbackRate: 1,
    movementIntensity: 0.5,
  },
  render: (args) => <ExpressionAuditionStage args={args} />,
};

export const CompatibilityVrm: Story = {
  name: "Compatibility VRM",
  args: {
    companionId: "matilda",
    careState: "hungry",
    hunger: 0.16,
    energy: 0.66,
  },
};

export const ReducedMotion: Story = {
  args: {
    careState: "restored",
    hunger: 0.95,
    energy: 0.92,
    reducedMotion: true,
  },
};

export const MissingAnimationFallback: Story = {
  args: {
    careState: "hungry",
    hunger: 0.16,
    energy: 0.66,
    baseAnimation: "__missing_care_animation__",
  },
};
