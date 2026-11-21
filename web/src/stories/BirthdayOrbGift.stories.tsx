import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type ReactElement } from "react";
import { ChestThenCreature } from "../components/LiveCreatureEncounter";
import { companionForChild } from "../storybook/companionForChild";

type Args = { child: string };

const meta: Meta<Args> = {
  title: "Rewards/Birthday Orb Gift",
  argTypes: { child: { control: "select", options: ["ila", "reina"] } },
  args: { child: "ila" },
};
export default meta;
type Story = StoryObj<Args>;

// What the server sends after the first stop she finishes on her birthday (owner, 2026-11-21). No server here,
// so the catch's save fails and is logged; the gift still finishes.
const QUESTIONS: Record<string, Array<{ id: string; kind: "spelling" | "math"; prompt: string; answer: string; choices?: string[] }>> = {
  ila: ["carnival", "dormant", "pardon"].map((word) => ({ id: word, kind: "spelling", prompt: word, answer: word })),
  reina: [
    { id: "m1", kind: "math", prompt: "Half of $8?", answer: "4" },
    { id: "m2", kind: "math", prompt: "Which is half of 10?", answer: "5", choices: ["5", "2", "20"] },
    { id: "m3", kind: "math", prompt: "Half of 50¢?", answer: "25" },
  ],
};

function Gift({ child }: Args): ReactElement {
  const { companion } = useMemo(() => companionForChild(child), [child]);
  const [round, setRound] = useState(0);
  return (
    <ChestThenCreature
      key={`${child}:${round}`}
      renderChest={null}
      encounter={{ encounterId: "birthday:2026", creatureId: "starwhal", charges: 3, isNew: true, gift: "birthday", questions: QUESTIONS[child] }}
      childId={child}
      companion={companion}
      onFinish={() => setRound((value) => value + 1)}
    />
  );
}

export const Ila: Story = { name: "Ila", args: { child: "ila" }, render: (args) => <Gift {...args} /> };
export const Reina: Story = { name: "Reina", args: { child: "reina" }, render: (args) => <Gift {...args} /> };
