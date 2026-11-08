import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type ReactElement } from "react";
import { CREATURE_CATALOG, type CapturedMonsterConfig, type CreatureStopKind } from "../../../src/shared/capturedMonsterCatalog";
import { CreatureCollection } from "../components/CreatureCollection";
import { CreatureEncounterReveal } from "../components/CreatureEncounterReveal";
import {
  CHARGES_BY_RARITY,
  rollCreatureEncounter,
  type CreatureEncounterRoll,
} from "../../../src/shared/creatureEncounters";
import { NodeTreasureChest } from "../components/NodeTreasureChest";
import { SparkOrbLearningShell } from "../components/SparkOrbLearningShell";
import { resolveSparkOrbScene, type SparkOrbSeason, type SparkOrbTimeOfDay } from "../components/sparkOrbScenes";
import type { SparkOrbEncounterPhase } from "../components/SparkOrbEncounterPost";
import { companionForChild } from "../storybook/companionForChild";

type CreatureStoryArgs = {
  stopKind: CreatureStopKind;
  timeOfDay: SparkOrbTimeOfDay | "auto";
  season: SparkOrbSeason | "auto";
  /** The Planner placed an encounter on this stop (it chooses the moment; code caps 1 per board). */
  plannerPlaced: boolean;
  /** Boards she has finished: a milestone creature (Dewbun) is guaranteed at 5. */
  boardsCompleted: number;
  /** Demo control for weekly-drop and seasonal tries. */
  dropLuck: "random" | "always hit" | "always miss";
  creatureId: string;
  isNew: boolean;
};

const meta: Meta<CreatureStoryArgs> = {
  title: "Reward Encounters/Creature Encounter",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Creature loop, World of Warcraft model (owner, 2026-11-08): the Planner places an encounter on a stop (code caps it at 1 per board). Lumipuff is the starter; a milestone creature is guaranteed after enough boards; weekly drops get one try a week; seasonal creatures one try a day in season; otherwise a familiar friend appears. She answers to charge the orb and throws, and her Creature Dex shows every creature with what is left to do. Art is a recoloured Lumipuff until each species has its own.",
      },
    },
  },
  argTypes: {
    stopKind: { control: "select", options: ["common", "rare", "epic", "legendary", "mystery"] },
    timeOfDay: { control: "select", options: ["auto", "sunrise", "day", "golden", "twilight", "night"] },
    season: { control: "select", options: ["auto", "spring", "summer", "autumn", "halloween", "holiday", "winter"] },
    plannerPlaced: { control: "boolean" },
    boardsCompleted: { control: { type: "range", min: 0, max: 12, step: 1 } },
    dropLuck: { control: "select", options: ["random", "always hit", "always miss"] },
    creatureId: { control: "select", options: CREATURE_CATALOG.map((species) => species.id) },
    isNew: { control: "boolean" },
  },
  args: {
    stopKind: "epic",
    timeOfDay: "auto",
    season: "auto",
    plannerPlaced: true,
    boardsCompleted: 2,
    dropLuck: "random",
    creatureId: "glowmoth",
    isNew: true,
  },
};
export default meta;
type Story = StoryObj<CreatureStoryArgs>;

function sceneFromArgs(args: CreatureStoryArgs) {
  const scene = resolveSparkOrbScene({
    timeOfDay: args.timeOfDay === "auto" ? undefined : args.timeOfDay,
    season: args.season === "auto" ? undefined : args.season,
  });
  return { scene, creatureScene: { season: scene.season, timeOfDay: scene.timeOfDay } };
}

const speciesById = (id: string) => CREATURE_CATALOG.find((species) => species.id === id) ?? CREATURE_CATALOG[0];

/* ---------- The reveal on its own ---------- */

function RevealStory(args: CreatureStoryArgs): ReactElement {
  const creature = speciesById(args.creatureId);
  const [key, setKey] = useState(0);
  return (
    <div style={{ padding: 16, background: "#0b0820", minHeight: "100vh" }}>
      <CreatureEncounterReveal
        key={`${creature.id}-${key}`}
        creature={creature}
        isNew={args.isNew}
        charges={CHARGES_BY_RARITY[creature.rarity]}
        onCatch={() => setKey((value) => value + 1)}
        onRun={() => setKey((value) => value + 1)}
      />
    </div>
  );
}

export const RevealRareNew: Story = { name: "Reveal: rare, new", render: (args) => <RevealStory {...args} /> };
export const RevealLegendary: Story = {
  name: "Reveal: legendary",
  args: { creatureId: "starwhal" },
  render: (args) => <RevealStory {...args} />,
};
export const RevealCommonSeenBefore: Story = {
  name: "Reveal: common, seen before",
  args: { creatureId: "lumipuff", isNew: false },
  render: (args) => <RevealStory {...args} />,
};

/* ---------- The dex on its own ---------- */

function DexStory(args: CreatureStoryArgs & { seenIds: string[]; caughtIds: string[]; lastTryAt?: Record<string, string> }): ReactElement {
  const { creatureScene } = sceneFromArgs(args);
  return (
    <CreatureCollection
      history={{ seenIds: args.seenIds, caughtIds: args.caughtIds, boardsCompleted: args.boardsCompleted, encountersThisBoard: 0, lastTryAt: args.lastTryAt ?? {} }}
      scene={creatureScene}
    />
  );
}

export const DexBrandNew: Story = {
  name: "Dex: brand new",
  render: (args) => <DexStory {...args} seenIds={[]} caughtIds={[]} />,
};
export const DexAutumnNight: Story = {
  name: "Dex: a few caught, autumn night",
  args: { timeOfDay: "night", season: "autumn" },
  render: (args) => (
    <DexStory
      {...args}
      seenIds={["lumipuff", "dewbun", "glowmoth"]}
      caughtIds={["lumipuff", "dewbun"]}
      lastTryAt={{ glowmoth: new Date(Date.now() - 2 * 86_400_000).toISOString() }}
    />
  ),
};
export const DexWinterHoliday: Story = {
  name: "Dex: holiday week",
  args: { timeOfDay: "day", season: "holiday" },
  render: (args) => <DexStory {...args} seenIds={["lumipuff", "frostkit"]} caughtIds={["lumipuff"]} />,
};

/* ---------- The whole loop ---------- */

type FlowStage = "stop" | "chest" | "nothing" | "reveal" | "orb" | "dex";

const QUESTIONS = [
  { prompt: "7 × 8", answer: "56", choices: ["54", "56", "64"] },
  { prompt: "36 ÷ 4", answer: "9", choices: ["8", "9", "12"] },
  { prompt: "Round 347 to the nearest ten", answer: "350", choices: ["340", "350", "300"] },
  { prompt: "125 + 48", answer: "173", choices: ["163", "173", "183"] },
  { prompt: "6 × 9", answer: "54", choices: ["54", "56", "45"] },
  { prompt: "90 − 37", answer: "53", choices: ["53", "63", "47"] },
];

function orbPhase(charged: number, goal: number): SparkOrbEncounterPhase {
  if (charged >= goal) return "ready";
  if (charged >= 2) return "charge-2";
  if (charged >= 1) return "charge-1";
  return "idle";
}

function FullLoopStory(args: CreatureStoryArgs): ReactElement {
  const { scene, creatureScene } = sceneFromArgs(args);
  const { companion, companionName } = useMemo(() => companionForChild("ila"), []);
  const [stage, setStage] = useState<FlowStage>("stop");
  const [encounter, setEncounter] = useState<CreatureEncounterRoll | null>(null);
  const [seenIds, setSeenIds] = useState<string[]>(["lumipuff"]);
  const [caughtIds, setCaughtIds] = useState<string[]>(["lumipuff"]);
  const [boardsDone, setBoardsDone] = useState(args.boardsCompleted);
  const [encountersThisBoard, setEncountersThisBoard] = useState(0);
  const [lastTryAt, setLastTryAt] = useState<Record<string, string>>({});
  const [charged, setCharged] = useState(0);
  const [feedback, setFeedback] = useState("Each right answer charges the orb.");

  const creature: CapturedMonsterConfig | undefined = encounter?.creature;
  const goal = encounter?.charges ?? 3;

  function rollAfterChest(): void {
    const result = rollCreatureEncounter({
      plannerPlaced: args.plannerPlaced,
      stopKind: args.stopKind,
      scene: creatureScene,
      nowIso: new Date().toISOString(),
      history: { seenIds, caughtIds, boardsCompleted: boardsDone, encountersThisBoard, lastTryAt },
      roll: args.dropLuck === "always hit" ? () => 0 : args.dropLuck === "always miss" ? () => 0.999 : Math.random,
    });
    console.info(" 🎮 [storybook:creature-encounter] [roll] [done]", { stopKind: args.stopKind, reason: result.reason, creature: result.creature?.id, isNew: result.isNew });
    setEncounter(result);
    setLastTryAt(result.tries);
    if (result.appeared && result.creature) {
      setEncountersThisBoard((count) => count + 1);
      setSeenIds((ids) => (ids.includes(result.creature!.id) ? ids : [...ids, result.creature!.id]));
      setStage("reveal");
    } else {
      setStage("nothing");
    }
  }

  function answer(choice: string): void {
    const question = QUESTIONS[charged % QUESTIONS.length];
    if (choice !== question.answer) {
      setFeedback("Not quite. No charge this time; try the next one.");
      return;
    }
    const next = Math.min(goal, charged + 1);
    setCharged(next);
    setFeedback(next >= goal ? "The orb is full. Throw it!" : "Charged!");
  }

  const stageStyle = { padding: 16, background: "#0b0820", minHeight: "100vh", color: "white", fontFamily: "Lexend, system-ui, sans-serif" };
  const button = { padding: "12px 24px", borderRadius: 999, border: 0, font: "900 17px Lexend, system-ui, sans-serif", cursor: "pointer", background: "linear-gradient(180deg,#ffe680,#ffc21a)", color: "#231400" };

  if (stage === "stop") {
    return (
      <div style={{ ...stageStyle, display: "grid", placeItems: "center", gap: 16 }}>
        <h2 style={{ margin: 0 }}>Stop finished!</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>{`A ${args.stopKind} stop · ${scene.timeOfDay} · ${scene.season} · board ${boardsDone + 1} · ${encountersThisBoard} of 1 encounter used`}</p>
        <button type="button" style={button} onClick={() => setStage("chest")}>Open your chest</button>
      </div>
    );
  }
  if (stage === "chest") {
    return (
      <div style={stageStyle}>
        <NodeTreasureChest rarity={args.stopKind === "mystery" ? "mystery" : args.stopKind} bonusChance={0.25} loot={{ coins: 16, rarity: "rare" }} onCollect={rollAfterChest} />
      </div>
    );
  }
  if (stage === "nothing") {
    return (
      <div style={{ ...stageStyle, display: "grid", placeItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>The grass is quiet…</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>{`No creature this time (${encounter?.reason}).`}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" style={button} onClick={() => setStage("stop")}>Next stop</button>
          <button
            type="button"
            style={{ ...button, background: "#ffffff22", color: "white" }}
            onClick={() => {
              setBoardsDone((count) => count + 1);
              setEncountersThisBoard(0);
              setStage("stop");
            }}
          >
            Start a new board
          </button>
        </div>
      </div>
    );
  }
  if (stage === "reveal" && creature) {
    return (
      <div style={stageStyle}>
        <CreatureEncounterReveal
          creature={creature}
          isNew={encounter?.isNew ?? !caughtIds.includes(creature.id)}
          charges={goal}
          onCatch={() => {
            setCharged(0);
            setStage("orb");
          }}
          onRun={() => setStage("dex")}
        />
      </div>
    );
  }
  if (stage === "orb" && creature) {
    const question = QUESTIONS[charged % QUESTIONS.length];
    const full = charged >= goal;
    return (
      <SparkOrbLearningShell
        childId="ila"
        childName="Ila"
        companion={companion}
        companionName={companionName}
        phase={orbPhase(charged, goal)}
        chargeGoal={goal}
        chargeCount={charged}
        domain="math"
        currentTarget={`fact:${question.prompt}`}
        lastMoment={full ? "orb_ready" : "watching"}
        capturedCreature={creature}
        creatureName={creature.speciesName}
        statLabel={creature.statLabel}
        statValue={creature.statValue}
        scene={{ timeOfDay: scene.timeOfDay, season: scene.season }}
        onCaptureCompleted={() => {
          setCaughtIds((ids) => (ids.includes(creature.id) ? ids : [...ids, creature.id]));
          window.setTimeout(() => setStage("dex"), 1600);
        }}
      >
        <div style={{ display: "grid", gap: 10, padding: 18, fontFamily: "Lexend, system-ui, sans-serif" }}>
          <strong style={{ fontSize: 13, letterSpacing: ".12em", color: "#3d7d8c" }}>{`CHARGE THE ORB · ${charged} / ${goal}`}</strong>
          <h2 style={{ margin: 0, fontSize: 30 }}>{full ? "Orb full. Throw it!" : question.prompt}</h2>
          {full ? null : (
            <div style={{ display: "grid", gap: 8 }}>
              {question.choices.map((choice) => (
                <button key={choice} type="button" aria-label={choice} onClick={() => answer(choice)} style={{ padding: 12, borderRadius: 12, border: "2px solid #dfe5ea", background: "white", font: "800 18px Lexend, system-ui, sans-serif", textAlign: "left", cursor: "pointer" }}>
                  {choice}
                </button>
              ))}
            </div>
          )}
          <p style={{ margin: 0, padding: 12, borderRadius: 12, background: "#13202b", color: "#ffd84d", fontWeight: 800 }}>{feedback}</p>
        </div>
      </SparkOrbLearningShell>
    );
  }
  return (
    <div>
      <CreatureCollection
        history={{ seenIds, caughtIds, boardsCompleted: boardsDone, encountersThisBoard, lastTryAt }}
        scene={creatureScene}
      />
      <div style={{ padding: 16, background: "#0b0820", textAlign: "center" }}>
        <button
          type="button"
          style={button}
          onClick={() => {
            setEncounter(null);
            setBoardsDone((count) => count + 1);
            setEncountersThisBoard(0);
            setStage("stop");
          }}
        >
          Start a new board
        </button>
      </div>
    </div>
  );
}

export const FullLoop: Story = {
  name: "Full loop: stop → chest → creature → orb → dex",
  render: (args) => <FullLoopStory {...args} />,
};
