import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type { CompanionCommand } from "../../../src/shared/companions/companionContract";
import { COMPANION_MANIFEST } from "../companion/companions.generated";
import {
  COMPANION_LIFE_LAB_MAX_SCRIPT_STEPS,
  COMPANION_LIFE_LAB_SCRIPT,
  COMPANION_SPEECH_GRACE_MS,
  createCompanionPresenceState,
  reduceCompanionPresence,
  type CompanionPresenceEvent,
  type CompanionPresencePhase,
} from "../companion/companionPresenceState";
import { CompanionLayer } from "../components/CompanionLayer";

const meta: Meta = {
  title: "Companion/Companion Life Lab",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Storybook-only Persona-inspired lab for testing Elli's real VRM across bounded listening, thinking, speaking, interruption, and recovery states.",
      },
    },
  },
};

export default meta;
type Story = StoryObj;
type WithoutAtMs<T> = T extends CompanionPresenceEvent ? Omit<T, "atMs"> : never;
type CompanionPresenceEventWithoutTime = WithoutAtMs<CompanionPresenceEvent>;

const PHASE_PRESENTATION: Record<
  CompanionPresencePhase,
  { animation: string; loop: boolean; label: string; detail: string; color: string }
> = {
  idle: {
    animation: "idle",
    loop: true,
    label: "Available",
    detail: "Quiet presence without demanding attention",
    color: "#a7f3d0",
  },
  listening: {
    animation: "idle_stand",
    loop: true,
    label: "Listening",
    detail: "The child has the floor",
    color: "#7dd3fc",
  },
  thinking: {
    animation: "think",
    loop: true,
    label: "Thinking",
    detail: "A visible response-preparation beat",
    color: "#c4b5fd",
  },
  speaking: {
    animation: "talking",
    loop: true,
    label: "Speaking",
    detail: "Body motion and simulated live mouth amplitude",
    color: "#fde68a",
  },
  celebrating: {
    animation: "dance_victory",
    loop: false,
    label: "Celebrating",
    detail: "A real success moment temporarily takes priority",
    color: "#f9a8d4",
  },
};

function createSimulatedSpeechAnalyser(): AnalyserNode {
  let sampleOffset = 0;
  return {
    fftSize: 256,
    getByteTimeDomainData(data: Uint8Array) {
      for (let index = 0; index < data.length; index += 1) {
        const envelope = 14 + 18 * Math.abs(Math.sin((sampleOffset + index) / 47));
        data[index] = Math.round(128 + Math.sin((sampleOffset + index) / 5) * envelope);
      }
      sampleOffset += 19;
    },
  } as unknown as AnalyserNode;
}

function CompanionLifeLab(): ReactElement {
  const elli = COMPANION_MANIFEST.find((entry) => entry.id === "elli");
  if (!elli) {
    throw new Error("companion_life_lab_missing_elli");
  }

  const [presence, dispatch] = useReducer(
    reduceCompanionPresence,
    undefined,
    createCompanionPresenceState,
  );
  const [commands, setCommands] = useState<CompanionCommand[]>([]);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const simulatedAnalyser = useMemo(createSimulatedSpeechAnalyser, []);
  const commandSequenceRef = useRef(0);
  const reactionRequestRef = useRef(1);
  const autoTimersRef = useRef<number[]>([]);
  const presentation = PHASE_PRESENTATION[presence.visiblePhase];

  function clearAutoTimers(): void {
    for (const timer of autoTimersRef.current) {
      window.clearTimeout(timer);
    }
    autoTimersRef.current = [];
  }

  function send(event: CompanionPresenceEvent): void {
    dispatch(event);
  }

  function sendAtNow(event: CompanionPresenceEventWithoutTime): void {
    send({ ...event, atMs: Math.round(performance.now()) } as CompanionPresenceEvent);
  }

  function startAutomaticDemo(): void {
    clearAutoTimers();
    sendAtNow({ type: "session_ended" });
    setAutoPlaying(true);
    const requestId = reactionRequestRef.current++;
    const steps = COMPANION_LIFE_LAB_SCRIPT.slice(
      0,
      COMPANION_LIFE_LAB_MAX_SCRIPT_STEPS,
    );

    autoTimersRef.current = steps.map((step, index) =>
      window.setTimeout(() => {
        const event =
          step.event.type === "success_reaction" ||
          step.event.type === "one_shot_finished"
            ? { ...step.event, requestId, atMs: Math.round(performance.now()) }
            : { ...step.event, atMs: Math.round(performance.now()) };
        send(event as CompanionPresenceEvent);
        if (index === steps.length - 1) {
          setAutoPlaying(false);
        }
      }, step.delayMs),
    );
  }

  function stopAutomaticDemo(): void {
    clearAutoTimers();
    setAutoPlaying(false);
    sendAtNow({ type: "session_ended" });
  }

  useEffect(
    () => () => {
      clearAutoTimers();
    },
    [],
  );

  useEffect(() => {
    analyserRef.current =
      presence.visiblePhase === "speaking" ? simulatedAnalyser : null;
  }, [presence.visiblePhase, simulatedAnalyser]);

  useEffect(() => {
    if (presence.speechGraceUntilMs === null) return;
    const remainingMs = Math.max(
      0,
      presence.speechGraceUntilMs - performance.now(),
    );
    const timer = window.setTimeout(() => {
      send({
        type: "time_advanced",
        atMs: presence.speechGraceUntilMs ?? performance.now(),
      });
    }, remainingMs);
    return () => window.clearTimeout(timer);
  }, [presence.speechGraceUntilMs]);

  useEffect(() => {
    const requestId = presence.activeOverrideRequestId;
    if (requestId === null) return;
    const timer = window.setTimeout(() => {
      send({
        type: "one_shot_finished",
        requestId,
        atMs: Math.round(performance.now()),
      });
    }, 1_900);
    return () => window.clearTimeout(timer);
  }, [presence.activeOverrideRequestId]);

  useEffect(() => {
    commandSequenceRef.current += 1;
    const command: CompanionCommand = {
      apiVersion: "1.0",
      type: "animate",
      payload: {
        animation: presentation.animation,
        loop: presentation.loop,
      },
      childId: "life-lab",
      timestamp: Date.now() * 100 + commandSequenceRef.current,
      source: "diag",
    };
    setCommands((current) => [...current.slice(-11), command]);
  }, [presentation.animation, presentation.loop]);

  useEffect(() => {
    if (!presence.lastTransition) return;
    const transition = presence.lastTransition;
    console.info(
      ` 🎮 [${transition.component}] [${transition.action}] [${transition.result}]`,
      transition,
    );
  }, [presence.lastTransition, presence.transitionCount]);

  const graceRemaining =
    presence.speechGraceUntilMs === null
      ? null
      : Math.max(0, Math.round(presence.speechGraceUntilMs - performance.now()));

  return (
    <main
      className="companion-life-lab"
      data-testid="companion-life-lab"
      data-phase={presence.visiblePhase}
    >
      <div className="companion-life-lab__atmosphere" aria-hidden="true" />
      <section className="companion-life-lab__panel">
        <div className="companion-life-lab__eyebrow">Sunny device presence study</div>
        <h1>What if Elli never feels frozen?</h1>
        <p className="companion-life-lab__intro">
          These controls send semantic moments into Sunny&apos;s real companion layer.
          Elli chooses no canned dialogue here; the lab only coordinates visible state.
        </p>

        <div
          className="companion-life-lab__status"
          style={{ "--phase-color": presentation.color } as React.CSSProperties}
        >
          <span className="companion-life-lab__pulse" />
          <div>
            <strong>{presentation.label}</strong>
            <span>{presentation.detail}</span>
          </div>
        </div>

        <div className="companion-life-lab__controls">
          <button type="button" onClick={() => sendAtNow({ type: "session_listening" })}>
            Child speaks
          </button>
          <button type="button" onClick={() => sendAtNow({ type: "response_thinking" })}>
            Elli thinks
          </button>
          <button type="button" onClick={() => sendAtNow({ type: "speech_started" })}>
            Elli answers
          </button>
          <button type="button" onClick={() => sendAtNow({ type: "speech_paused" })}>
            Sentence pause
          </button>
          <button
            type="button"
            onClick={() =>
              sendAtNow({
                type: "success_reaction",
                requestId: reactionRequestRef.current++,
              })
            }
          >
            Real success
          </button>
          <button type="button" onClick={() => sendAtNow({ type: "session_ended" })}>
            Settle
          </button>
        </div>

        <div className="companion-life-lab__automatic">
          <button type="button" onClick={startAutomaticDemo} disabled={autoPlaying}>
            {autoPlaying ? "Demo playing…" : "Play the 8-second sequence"}
          </button>
          <button type="button" onClick={stopAutomaticDemo}>
            Reset
          </button>
        </div>

        <dl className="companion-life-lab__readout">
          <div>
            <dt>Base state</dt>
            <dd>{presence.basePhase}</dd>
          </div>
          <div>
            <dt>Visible state</dt>
            <dd>{presence.visiblePhase}</dd>
          </div>
          <div>
            <dt>Resume target</dt>
            <dd>{presence.resumePhase ?? "none"}</dd>
          </div>
          <div>
            <dt>Speech grace</dt>
            <dd>{graceRemaining === null ? "inactive" : `${graceRemaining}ms / ${COMPANION_SPEECH_GRACE_MS}ms`}</dd>
          </div>
        </dl>
      </section>

      <div className="companion-life-lab__stage-copy">
        <span>REAL SUNNY VRM</span>
        <strong>{presentation.label}</strong>
        <p>Watch the body, face, eyes, and mouth—not a replacement avatar.</p>
      </div>

      <CompanionLayer
        childId="life-lab"
        companion={elli.companionConfig}
        toggledOff={false}
        mode="full"
        idlePose="center"
        companionCommands={commands}
        analyserNodeRef={analyserRef}
      />

      <style>{`
        .companion-life-lab {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          color: #f8fafc;
          background:
            radial-gradient(circle at 72% 38%, rgba(124, 58, 237, 0.3), transparent 31%),
            radial-gradient(circle at 78% 70%, rgba(14, 165, 233, 0.18), transparent 34%),
            linear-gradient(135deg, #07111f 0%, #11112d 48%, #160f2e 100%);
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        }

        .companion-life-lab__atmosphere {
          position: absolute;
          inset: 0;
          opacity: 0.22;
          background-image:
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: linear-gradient(90deg, black, transparent 80%);
        }

        .companion-life-lab__panel {
          position: relative;
          z-index: 100;
          box-sizing: border-box;
          width: min(440px, 42vw);
          min-height: 100vh;
          padding: 42px 38px;
          border-right: 1px solid rgba(255,255,255,0.11);
          background: linear-gradient(180deg, rgba(4, 11, 27, 0.92), rgba(8, 14, 34, 0.78));
          backdrop-filter: blur(18px);
          box-shadow: 28px 0 70px rgba(0,0,0,0.24);
        }

        .companion-life-lab__eyebrow,
        .companion-life-lab__stage-copy span {
          color: #a5b4fc;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .companion-life-lab h1 {
          max-width: 360px;
          margin: 10px 0 12px;
          font-size: clamp(30px, 3vw, 48px);
          line-height: 0.98;
          letter-spacing: -0.045em;
        }

        .companion-life-lab__intro {
          margin: 0;
          color: #cbd5e1;
          font-size: 14px;
          line-height: 1.55;
        }

        .companion-life-lab__status {
          display: flex;
          align-items: center;
          gap: 14px;
          margin: 26px 0 18px;
          padding: 16px;
          border: 1px solid color-mix(in srgb, var(--phase-color) 38%, transparent);
          border-radius: 18px;
          background: color-mix(in srgb, var(--phase-color) 10%, rgba(15,23,42,0.7));
        }

        .companion-life-lab__pulse {
          width: 13px;
          height: 13px;
          flex: none;
          border-radius: 50%;
          background: var(--phase-color);
          box-shadow: 0 0 0 7px color-mix(in srgb, var(--phase-color) 16%, transparent),
            0 0 24px var(--phase-color);
          animation: life-lab-pulse 1.8s ease-in-out infinite;
        }

        .companion-life-lab__status div {
          display: grid;
          gap: 3px;
        }

        .companion-life-lab__status strong {
          color: var(--phase-color);
          font-size: 18px;
        }

        .companion-life-lab__status span:last-child {
          color: #cbd5e1;
          font-size: 12px;
        }

        .companion-life-lab__controls {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 9px;
        }

        .companion-life-lab button {
          min-height: 43px;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          color: #f8fafc;
          background: rgba(255,255,255,0.075);
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
        }

        .companion-life-lab button:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: rgba(165,180,252,0.65);
          background: rgba(129,140,248,0.18);
        }

        .companion-life-lab button:disabled {
          cursor: default;
          opacity: 0.64;
        }

        .companion-life-lab__automatic {
          display: grid;
          grid-template-columns: 1fr 90px;
          gap: 9px;
          margin-top: 13px;
        }

        .companion-life-lab__automatic button:first-child {
          border-color: rgba(129,140,248,0.48);
          background: linear-gradient(135deg, rgba(79,70,229,0.72), rgba(126,34,206,0.72));
        }

        .companion-life-lab__readout {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1px;
          margin: 20px 0 0;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          background: rgba(255,255,255,0.08);
        }

        .companion-life-lab__readout div {
          padding: 11px 12px;
          background: rgba(5,10,25,0.82);
        }

        .companion-life-lab__readout dt {
          color: #64748b;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .companion-life-lab__readout dd {
          margin: 4px 0 0;
          color: #e2e8f0;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px;
        }

        .companion-life-lab__stage-copy {
          position: absolute;
          z-index: 4;
          right: 44px;
          bottom: 36px;
          display: grid;
          max-width: 280px;
          justify-items: end;
          text-align: right;
          pointer-events: none;
        }

        .companion-life-lab__stage-copy strong {
          margin-top: 5px;
          color: ${presentation.color};
          font-size: 28px;
        }

        .companion-life-lab__stage-copy p {
          margin: 5px 0 0;
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.45;
        }

        @keyframes life-lab-pulse {
          50% { transform: scale(0.82); opacity: 0.72; }
        }

        @media (max-width: 760px) {
          .companion-life-lab__panel {
            width: 100%;
            min-height: auto;
            padding: 24px;
            border-right: 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
          }

          .companion-life-lab h1 {
            font-size: 30px;
          }

          .companion-life-lab__readout {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}

export const ElliPresenceSequence: Story = {
  render: () => <CompanionLifeLab />,
};
