import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  SparkOrbEncounterPost,
  type SparkOrbEncounterEvent,
  type SparkOrbEncounterPhase,
  type SparkOrbEncounterPostProps,
} from "../components/SparkOrbEncounterPost";

const phases: SparkOrbEncounterPhase[] = [
  "idle",
  "charge-1",
  "charge-2",
  "ready",
  "launching",
  "collected",
];

const autoRunSteps: Array<{ phase: SparkOrbEncounterPhase; delayMs: number }> = [
  { phase: "idle", delayMs: 0 },
  { phase: "charge-1", delayMs: 700 },
  { phase: "charge-2", delayMs: 1400 },
  { phase: "ready", delayMs: 2100 },
  { phase: "launching", delayMs: 3000 },
  { phase: "collected", delayMs: 4000 },
];

const meta: Meta<SparkOrbEncounterPostProps> = {
  title: "Reward Encounters/Spark Orb Post",
  component: SparkOrbEncounterPost,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Storybook-only v0 for the Sunny Spark Orb reward loop: charge the orb through evidence states, launch it, and reveal a collectible card.",
      },
    },
  },
  argTypes: {
    phase: { control: "select", options: phases },
    creatureName: { control: "text" },
    statLabel: { control: "text" },
    statValue: { control: { type: "number", min: 1, max: 999, step: 1 } },
    orbCount: { control: { type: "number", min: 0, max: 99, step: 1 } },
    attribution: { control: "text" },
    timestamp: { control: "text" },
    views: { control: "text" },
    hint: { control: "text" },
  },
  args: {
    phase: "ready",
    creatureName: "Lumipuff",
    statLabel: "SPARK",
    statValue: 214,
    orbCount: 7,
    attribution: "Sunny Lab",
    timestamp: "11:21 AM · Apr 24, 2026",
    views: "1,732 Views",
    hint: "Flick up to launch",
  },
};

export default meta;
type Story = StoryObj<SparkOrbEncounterPostProps>;

function logEncounter(event: SparkOrbEncounterEvent): void {
  console.info("[storybook:spark-orb]", event);
}

function logAutoPhase(phase: SparkOrbEncounterPhase): void {
  console.info(" 🎮 [spark-orb-storybook] [auto-phase] [shown]", { phase });
}

function StatefulPlayground(args: SparkOrbEncounterPostProps): ReactElement {
  const [phase, setPhase] = useState<SparkOrbEncounterPhase>(args.phase);

  useEffect(() => {
    setPhase(args.phase);
  }, [args.phase]);

  function handleEncounterEvent(event: SparkOrbEncounterEvent): void {
    logEncounter(event);
    if (event.type === "charge") {
      setPhase((current) => {
        if (current === "idle") return "charge-1";
        if (current === "charge-1") return "charge-2";
        if (current === "charge-2") return "ready";
        return current;
      });
    }
    if (event.type === "launch") setPhase("launching");
    if (event.type === "reset") setPhase("idle");
  }

  return (
    <>
      <SparkOrbEncounterPost
        {...args}
        phase={phase}
        onEncounterEvent={handleEncounterEvent}
      />
      <div
        style={{
          background: "#f7f9fb",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
          padding: "16px 12px 28px",
        }}
      >
        {phases.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setPhase(item)}
            style={{
              background: item === phase ? "#10202d" : "#ffffff",
              border: "1px solid rgba(16, 32, 45, 0.16)",
              borderRadius: 999,
              color: item === phase ? "#ffffff" : "#10202d",
              cursor: "pointer",
              fontWeight: 800,
              padding: "10px 14px",
            }}
          >
            {item}
          </button>
        ))}
      </div>
    </>
  );
}

function AutoRunPlayground(args: SparkOrbEncounterPostProps): ReactElement {
  const [phase, setPhase] = useState<SparkOrbEncounterPhase>("idle");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;

    const timers = autoRunSteps.map((step) =>
      window.setTimeout(() => {
        setPhase(step.phase);
        logAutoPhase(step.phase);
      }, step.delayMs),
    );
    const doneTimer = window.setTimeout(() => setRunning(false), 4600);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(doneTimer);
    };
  }, [running]);

  function handleRunFullEncounter(): void {
    setPhase("idle");
    setRunning(true);
  }

  return (
    <>
      <SparkOrbEncounterPost
        {...args}
        phase={phase}
        onEncounterEvent={logEncounter}
      />
      <div
        style={{
          alignItems: "center",
          background: "#f7f9fb",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          justifyContent: "center",
          padding: "16px 12px 28px",
        }}
      >
        <button
          type="button"
          onClick={handleRunFullEncounter}
          style={{
            background: running ? "#27566a" : "#10202d",
            border: "1px solid rgba(16, 32, 45, 0.18)",
            borderRadius: 999,
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
            color: "#ffffff",
            cursor: "pointer",
            fontWeight: 900,
            padding: "12px 18px",
          }}
        >
          Run full encounter
        </button>
        {phases.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setRunning(false);
              setPhase(item);
              logAutoPhase(item);
            }}
            style={{
              background: item === phase ? "#ffffff" : "transparent",
              border: "1px solid rgba(16, 32, 45, 0.14)",
              borderRadius: 999,
              color: item === phase ? "#10202d" : "#5c6b78",
              cursor: "pointer",
              fontWeight: 800,
              padding: "9px 12px",
            }}
          >
            {item}
          </button>
        ))}
      </div>
    </>
  );
}

export const Playground: Story = {
  render: (args) => <StatefulPlayground {...args} />,
};

export const AutoRunEncounter: Story = {
  args: { phase: "idle" },
  render: (args) => <AutoRunPlayground {...args} />,
};

export const LaunchMoment: Story = {
  args: { phase: "launching" },
  render: (args) => <SparkOrbEncounterPost {...args} onEncounterEvent={logEncounter} />,
};

export const Collected: Story = {
  args: { phase: "collected" },
  render: (args) => <SparkOrbEncounterPost {...args} onEncounterEvent={logEncounter} />,
};
