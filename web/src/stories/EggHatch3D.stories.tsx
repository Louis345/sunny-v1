import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type ReactElement } from "react";
import { CREATURE_CATALOG } from "../../../src/shared/capturedMonsterCatalog";
import type { Season, SkyMood } from "../../../src/shared/skyClock";
import { EggHatch3D } from "../components/EggHatch3D";
import type { OrbQuestion } from "../components/OrbCatcher3D";
import { ORB_THEME_PACKS } from "../components/orbThemePacks";
import { companionForChild } from "../storybook/companionForChild";

type Args = {
  creatureId: string;
  child: "ila" | "reina";
  theme: string;
  subject: "spelling" | "math";
  /** How many items she already proved on an earlier check. */
  alreadyProven: number;
  /** "tomorrow" is a later day (counts); "same day" shows the egg refusing same-day proof. */
  checkDay: "tomorrow" | "same day";
  timeOfDay: SkyMood;
  season: Season;
};

const meta: Meta<Args> = {
  title: "Reward Encounters/Egg Hatch 3D (prototype)",
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "Prototype (owner, 2026-11-11): practice catches the creature, mastery hatches it. The egg holds the drilled items; only unassisted right answers on a later day crack it; when every item is proven it hatches into her pet. Storybook only." } },
  },
  argTypes: {
    creatureId: { control: "select", options: CREATURE_CATALOG.map((species) => species.id) },
    child: { control: "select", options: ["ila", "reina"] },
    theme: { control: "select", options: Object.keys(ORB_THEME_PACKS) },
    subject: { control: "select", options: ["spelling", "math"] },
    alreadyProven: { control: { type: "range", min: 0, max: 4, step: 1 } },
    checkDay: { control: "select", options: ["tomorrow", "same day"] },
    timeOfDay: { control: "select", options: ["sunrise", "day", "golden", "twilight", "night"] },
    season: { control: "select", options: ["spring", "summer", "autumn", "halloween", "holiday", "winter"] },
  },
  args: { creatureId: "lumipuff", child: "ila", theme: "meadow", subject: "spelling", alreadyProven: 0, checkDay: "tomorrow", timeOfDay: "day", season: "autumn" },
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
  const items = args.subject === "math" ? MATH : SPELLING;
  const creature = CREATURE_CATALOG.find((species) => species.id === args.creatureId) ?? CREATURE_CATALOG[0];
  const [round, setRound] = useState(0);
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <EggHatch3D
        key={`${round}:${creature.id}:${args.child}:${args.theme}:${args.subject}:${args.alreadyProven}:${args.checkDay}`}
        creature={creature}
        items={items}
        drilledOn="2026-11-11"
        proven={items.slice(0, args.alreadyProven).map((item) => item.id)}
        today={args.checkDay === "tomorrow" ? "2026-11-12" : "2026-11-11"}
        theme={ORB_THEME_PACKS[args.theme] ?? ORB_THEME_PACKS.meadow}
        timeOfDay={args.timeOfDay}
        season={args.season}
        companionVrmUrl={companion.vrmUrl}
        onHatched={() => console.info(" 🎮 [storybook:egg] [hatched]", round)}
      />
      <button type="button" onClick={() => setRound((value) => value + 1)} style={{ position: "fixed", bottom: 12, right: 12, zIndex: 9, opacity: 0.6 }}>
        Reset
      </button>
    </div>
  );
}

export const Playground: Story = { render: (args) => <Stage {...args} /> };
export const IlaYokaiEgg: Story = { render: (args) => <Stage {...args} />, args: { child: "ila", theme: "yokai-night", subject: "spelling", creatureId: "glowmoth", timeOfDay: "night", alreadyProven: 1 } };
export const ReinaChampionshipEgg: Story = { render: (args) => <Stage {...args} />, args: { child: "reina", theme: "championship", subject: "math", creatureId: "emberleaf", timeOfDay: "golden", alreadyProven: 2 } };
export const OneWordFromHatching: Story = { render: (args) => <Stage {...args} />, args: { child: "ila", theme: "yokai-night", subject: "spelling", creatureId: "glowmoth", timeOfDay: "twilight", alreadyProven: 3 } };
export const SameDayDoesNotCount: Story = { render: (args) => <Stage {...args} />, args: { checkDay: "same day", alreadyProven: 1 } };
