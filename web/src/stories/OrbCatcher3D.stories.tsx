import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type ReactElement } from "react";
import { CREATURE_CATALOG } from "../../../src/shared/capturedMonsterCatalog";
import type { Season, SkyMood } from "../../../src/shared/skyClock";
import { OrbCatcher3D, type OrbQuestion } from "../components/OrbCatcher3D";
import { ORB_THEME_PACKS } from "../components/orbThemePacks";
import { companionForChild } from "../storybook/companionForChild";

type Args = {
  creatureId: string;
  throws: number;
  timeOfDay: SkyMood;
  season: Season;
  luck: "random" | "always catch" | "always break free";
  theme: string;
  child: "ila" | "reina";
  /** 0 = no drill (throws as before); otherwise the round the Planner wants the catch on. */
  plannedRounds: number;
  subject: "spelling" | "math";
};

const meta: Meta<Args> = {
  title: "Reward Encounters/Orb Catcher 3D (prototype)",
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "Prototype (owner, 2026-11-11): the orb catcher rebuilt as a Three.js scene, like the Monster Math games. Same rules underneath (throws, shake catch odds); a lit meadow by sky clock and season, her companion in the scene, a glowing orb with a real arc, impact flash, shakes, and a burst or a click. Storybook only." } },
  },
  argTypes: {
    creatureId: { control: "select", options: CREATURE_CATALOG.map((species) => species.id) },
    throws: { control: { type: "range", min: 1, max: 6, step: 1 } },
    timeOfDay: { control: "select", options: ["sunrise", "day", "golden", "twilight", "night"] },
    season: { control: "select", options: ["spring", "summer", "autumn", "halloween", "holiday", "winter"] },
    luck: { control: "select", options: ["random", "always catch", "always break free"] },
    theme: { control: "select", options: Object.keys(ORB_THEME_PACKS) },
    child: { control: "select", options: ["ila", "reina"] },
    plannedRounds: { control: { type: "range", min: 0, max: 8, step: 1 } },
    subject: { control: "select", options: ["spelling", "math"] },
  },
  args: { creatureId: "lumipuff", throws: 3, timeOfDay: "day", season: "autumn", luck: "random", theme: "meadow", child: "ila", plannedRounds: 0, subject: "spelling" },
};
export default meta;
type Story = StoryObj<Args>;

const SPELLING: OrbQuestion[] = ["carnival", "dormant", "pardon", "charge"].map((word) => ({ id: `s:${word}`, kind: "spelling", prompt: word, answer: word }));
const MATH: OrbQuestion[] = [
  { id: "m:7x8", kind: "math", prompt: "7 × 8", answer: "56", choices: ["54", "56", "64"] },
  { id: "m:36/4", kind: "math", prompt: "36 ÷ 4", answer: "9", choices: ["8", "9", "12"] },
  { id: "m:6x9", kind: "math", prompt: "6 × 9", answer: "54", choices: ["54", "56", "45"] },
  { id: "m:90-37", kind: "math", prompt: "90 − 37", answer: "53", choices: ["53", "63", "47"] },
];

function Stage(args: Args): ReactElement {
  const { companion } = useMemo(() => companionForChild(args.child), [args.child]);
  const theme = ORB_THEME_PACKS[args.theme] ?? ORB_THEME_PACKS.meadow;
  const drill = useMemo(
    () => (args.plannedRounds > 0 ? { plannedRounds: args.plannedRounds, questions: args.subject === "math" ? MATH : SPELLING } : undefined),
    [args.plannedRounds, args.subject],
  );
  const creature = CREATURE_CATALOG.find((species) => species.id === args.creatureId) ?? CREATURE_CATALOG[0];
  const [round, setRound] = useState(0);
  const roll = args.luck === "always catch" ? () => 0 : args.luck === "always break free" ? () => 0.999 : undefined;
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <OrbCatcher3D
        key={`${round}:${creature.id}:${args.throws}:${args.theme}:${args.child}:${args.plannedRounds}:${args.subject}`}
        theme={theme}
        drill={drill}
        creature={creature}
        throws={args.throws}
        timeOfDay={args.timeOfDay}
        season={args.season}
        companionVrmUrl={companion.vrmUrl}
        roll={roll}
        onResult={(outcome) => {
          console.info(" 🎮 [storybook:orb-3d] [result]", outcome);
          window.setTimeout(() => setRound((value) => value + 1), 2500);
        }}
      />
    </div>
  );
}

export const Meadow: Story = { name: "Day meadow", render: (args) => <Stage {...args} /> };
export const Night: Story = { name: "Night (fireflies, glow)", args: { timeOfDay: "night", season: "summer", creatureId: "glowmoth" }, render: (args) => <Stage {...args} /> };
export const Snow: Story = { name: "Winter snow", args: { timeOfDay: "golden", season: "winter", creatureId: "frostkit" }, render: (args) => <Stage {...args} /> };

export const ReinaChampionshipDrill: Story = {
  name: "Reina: Championship drill (math, catch planned for round 4)",
  args: { child: "reina", theme: "championship", plannedRounds: 4, subject: "math", creatureId: "emberleaf", timeOfDay: "golden", season: "autumn" },
  render: (args) => <Stage {...args} />,
};
export const IlaYokaiNightDrill: Story = {
  name: "Ila: Yokai Night drill (spelling, catch planned for round 3)",
  args: { child: "ila", theme: "yokai-night", plannedRounds: 3, subject: "spelling", creatureId: "glowmoth", timeOfDay: "night", season: "autumn" },
  render: (args) => <Stage {...args} />,
};
