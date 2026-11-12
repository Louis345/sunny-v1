import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type ReactElement } from "react";
import { CREATURE_CATALOG } from "../../../src/shared/capturedMonsterCatalog";
import type { Season, SkyMood } from "../../../src/shared/skyClock";
import { OrbCatcher3D } from "../components/OrbCatcher3D";
import { companionForChild } from "../storybook/companionForChild";

type Args = { creatureId: string; throws: number; timeOfDay: SkyMood; season: Season; luck: "random" | "always catch" | "always break free" };

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
  },
  args: { creatureId: "lumipuff", throws: 3, timeOfDay: "day", season: "autumn", luck: "random" },
};
export default meta;
type Story = StoryObj<Args>;

function Stage(args: Args): ReactElement {
  const { companion } = useMemo(() => companionForChild("ila"), []);
  const creature = CREATURE_CATALOG.find((species) => species.id === args.creatureId) ?? CREATURE_CATALOG[0];
  const [round, setRound] = useState(0);
  const roll = args.luck === "always catch" ? () => 0 : args.luck === "always break free" ? () => 0.999 : undefined;
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <OrbCatcher3D
        key={`${round}:${creature.id}:${args.throws}`}
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
