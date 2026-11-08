import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type ReactElement } from "react";
import { CREATURE_CATALOG, type CapturedMonsterConfig, type CreatureStopKind } from "../components/capturedMonsterCatalog";
import { CreatureCollection } from "../components/CreatureCollection";
import { CreatureEncounterReveal } from "../components/CreatureEncounterReveal";
import {
  CHARGES_BY_RARITY,
  rollCreatureEncounter,
  type CreatureEncounterRoll,
} from "../components/creatureEncounters";
import { NodeTreasureChest } from "../components/NodeTreasureChest";
import { SparkOrbLearningShell } from "../components/SparkOrbLearningShell";
import { resolveSparkOrbScene, type SparkOrbSeason, type SparkOrbTimeOfDay } from "../components/sparkOrbScenes";
import type { SparkOrbEncounterPhase } from "../components/SparkOrbEncounterPost";
import { companionForChild } from "../storybook/companionForChild";

type CreatureStoryArgs = {
  stopKind: CreatureStopKind;
  timeOfDay: SparkOrbTimeOfDay | "auto";
  season: SparkOrbSeason | "auto";
  /** Demo only: skip the dice so the reveal always plays. */
  forceEncounter: boolean;
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
          "Draft of the creature loop (owner, 2026-11-08): a finished stop opens its chest, sometimes a creature appears (rare stays rare, one guaranteed a week, one per board), she answers to charge the orb and throws, and her Creature Dex shows every species to chase. Art is a recoloured Lumipuff until each species has its own.",
      },
    },
  },
  argTypes: {
    stopKind: { control: "select", options: ["common", "rare", "epic", "legendary", "mystery"] },
    timeOfDay: { control: "select", options: ["auto", "sunrise", "day", "golden", "twilight", "night"] },
    season: { control: "select", options: ["auto", "spring", "summer", "autumn", "halloween", "holiday", "winter"] },
    forceEncounter: { control: "boolean" },
    creatureId: { control: "select", options: CREATURE_CATALOG.map((species) => species.id) },
    isNew: { control: "boolean" },
  },
  args: {
    stopKind: "epic",
    timeOfDay: "auto",
    season: "auto",
    forceEncounter: true,
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

function DexStory(args: CreatureStoryArgs & { seenIds: string[]; caughtIds: string[] }): ReactElement {
  const { creatureScene } = sceneFromArgs(args);
  return <CreatureCollection seenIds={args.seenIds} caughtIds={args.caughtIds} scene={creatureScene} />;
}

export const DexBrandNew: Story = {
  name: "Dex: brand new",
  render: (args) => <DexStory {...args} seenIds={[]} caughtIds={[]} />,
};
export const DexAutumnNight: Story = {
  name: "Dex: a few caught, autumn night",
  args: { timeOfDay: "night", season: "autumn" },
  render: (args) => <DexStory {...args} seenIds={["lumipuff", "dewbun", "glowmoth"]} caughtIds={["lumipuff", "dewbun"]} />,
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
  const [charged, setCharged] = useState(0);
  const [feedback, setFeedback] = useState("Each right answer charges the orb.");

  const creature: CapturedMonsterConfig | undefined = encounter?.creature;
  const goal = encounter?.charges ?? 3;

  function rollAfterChest(): void {
    const result = rollCreatureEncounter({
      stopKind: args.stopKind,
      scene: creatureScene,
      nowIso: new Date().toISOString(),
      history: { lastSightingAt: new Date().toISOString(), sightingsThisBoard: 0 },
      roll: args.forceEncounter ? (() => {
        let first = true;
        return () => (first ? ((first = false), 0) : Math.random());
      })() : Math.random,
    });
    console.info(" 🎮 [storybook:creature-encounter] [roll] [done]", { stopKind: args.stopKind, ...result, creature: result.creature?.id });
    setEncounter(result);
    if (result.appeared && result.creature) {
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
        <p style={{ margin: 0, opacity: 0.8 }}>{`A ${args.stopKind} stop · ${scene.timeOfDay} · ${scene.season}`}</p>
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
        <p style={{ margin: 0, opacity: 0.8 }}>{`No creature this time (${encounter?.reason}). Rare stays rare.`}</p>
        <button type="button" style={button} onClick={() => setStage("stop")}>Next stop</button>
      </div>
    );
  }
  if (stage === "reveal" && creature) {
    return (
      <div style={stageStyle}>
        <CreatureEncounterReveal
          creature={creature}
          isNew={!caughtIds.includes(creature.id)}
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
      <CreatureCollection seenIds={seenIds} caughtIds={caughtIds} scene={creatureScene} />
      <div style={{ padding: 16, background: "#0b0820", textAlign: "center" }}>
        <button
          type="button"
          style={button}
          onClick={() => {
            setEncounter(null);
            setStage("stop");
          }}
        >
          Play another stop
        </button>
      </div>
    </div>
  );
}

export const FullLoop: Story = {
  name: "Full loop: stop → chest → creature → orb → dex",
  render: (args) => <FullLoopStory {...args} />,
};
