import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type ReactElement } from "react";
import { CompanionLayer } from "../components/CompanionLayer";
import { CREATURE_CATALOG } from "../components/capturedMonsterCatalog";
import { MonsterDenPreview } from "../components/CapturedMonsterDen";
import { LUMIPUFF_MONSTER } from "../components/capturedMonsterCatalog";
import { CreatureDen } from "../components/CreatureDen";
import { dismissSidekick, type DenState } from "../components/creatureDenRules";
import { SidekickBuddy } from "../components/SidekickBuddy";
import { companionForChild } from "../storybook/companionForChild";

const meta: Meta = {
  title: "Reward Encounters/Creature Den",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Draft den (owner, 2026-11-08): every creature she caught roams the park; tap one for its den card (bond, food, pet, recall as her sidekick next to Elli or send home). Food is store food she owns (no free treats). Storybook only; nothing is saved yet.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const STARTER: DenState = {
  creatures: [
    { creatureId: "lumipuff", nickname: "Lumi", bond: 46, caughtAt: "2026-11-01T18:00:00.000Z" },
    { creatureId: "glowmoth", nickname: "Glow", bond: 18, caughtAt: "2026-11-08T21:00:00.000Z" },
    { creatureId: "frostkit", nickname: "Frosty", bond: 72, caughtAt: "2026-12-12T17:00:00.000Z" },
  ],
  sidekickId: "lumipuff",
  food: { apple_bite: 3, star_candy: 1, mystery_snack: 0 },
};

function logDen(next: DenState): void {
  console.info(" 🎮 [storybook:creature-den] [state] [changed]", {
    sidekick: next.sidekickId,
    food: next.food,
    bonds: next.creatures.map((creature) => `${creature.creatureId}:${creature.bond}`),
  });
}

function DenOnlyStory({ initial }: { initial: DenState }): ReactElement {
  const [state, setState] = useState(initial);
  return (
    <CreatureDen
      state={state}
      onChange={(next) => {
        logDen(next);
        setState(next);
      }}
    />
  );
}

export const Den: Story = { name: "Den: three creatures in the park", render: () => <DenOnlyStory initial={STARTER} /> };
export const DenOutOfFood: Story = {
  name: "Den: out of food",
  render: () => <DenOnlyStory initial={{ ...STARTER, food: { apple_bite: 0, star_candy: 0, mystery_snack: 0 } }} />,
};
export const DenEmpty: Story = {
  name: "Den: nobody yet",
  render: () => <DenOnlyStory initial={{ creatures: [], sidekickId: null, food: { apple_bite: 3 } }} />,
};

function DenWithSessionStory(): ReactElement {
  const [state, setState] = useState(STARTER);
  const [cheerKey, setCheerKey] = useState(0);
  const { companion } = useMemo(() => companionForChild("ila"), []);
  const sidekick = state.creatures.find((creature) => creature.creatureId === state.sidekickId);
  const species = sidekick ? CREATURE_CATALOG.find((entry) => entry.id === sidekick.creatureId) : undefined;
  const update = (next: DenState) => {
    logDen(next);
    setState(next);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 1fr)", minHeight: "100vh", background: "#0b0820" }}>
      <CreatureDen state={state} onChange={update} />
      <section
        aria-label="Session preview"
        style={{
          position: "relative",
          background: "linear-gradient(180deg,#cfe6ff,#f6f1ff)",
          display: "grid",
          alignContent: "start",
          gap: 14,
          padding: 20,
          fontFamily: "Lexend, system-ui, sans-serif",
        }}
      >
        <strong style={{ fontSize: 13, letterSpacing: ".12em", color: "#3d7d8c" }}>SESSION PREVIEW</strong>
        <h2 style={{ margin: 0, fontSize: 28, color: "#13202b" }}>7 × 8 = ?</h2>
        <button
          type="button"
          onClick={() => setCheerKey((key) => key + 1)}
          style={{ justifySelf: "start", padding: "12px 22px", borderRadius: 999, border: 0, font: "900 16px Lexend, system-ui, sans-serif", background: "#3fbf6a", color: "white", cursor: "pointer" }}
        >
          She got it right!
        </button>
        <p style={{ margin: 0, color: "#4a5a68", fontWeight: 700 }}>
          {sidekick ? `${sidekick.nickname} rides with Elli. Tap ${sidekick.nickname} to send it home.` : "Nobody is riding along. Recall a creature from the den."}
        </p>
        {sidekick && species ? (
          <SidekickBuddy creature={species} nickname={sidekick.nickname} cheerKey={cheerKey} onDismiss={() => update(dismissSidekick(state))} />
        ) : null}
        <CompanionLayer childId="ila" companion={companion} toggledOff={companion.toggledOff} mode="portrait" />
      </section>
    </div>
  );
}

export const DenWithSession: Story = {
  name: "Recall and dismiss: den beside a session",
  render: () => <DenWithSessionStory />,
};

/* ---------- Old prototype vs new den, side by side ---------- */

function CompareStory(): ReactElement {
  const [state, setState] = useState(STARTER);
  const label = (text: string) => (
    <div style={{ padding: "10px 16px", background: "#13202b", color: "#ffd84d", font: "900 14px Lexend, system-ui, sans-serif", letterSpacing: ".08em" }}>
      {text}
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", background: "#0b0820" }}>
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", minWidth: 0 }}>
        {label("OLD PROTOTYPE · one creature in a room")}
        <div style={{ padding: 16, background: "#eef2f6" }}>
          <MonsterDenPreview creature={LUMIPUFF_MONSTER} initialNickname="Lumi" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", minWidth: 0, overflow: "hidden" }}>
        {label("NEW · all her creatures in the park, tap one for its den card")}
        <CreatureDen
          state={state}
          onChange={(next) => {
            logDen(next);
            setState(next);
          }}
        />
      </div>
    </div>
  );
}

export const CompareOldAndNew: Story = {
  name: "Compare: old prototype vs new den",
  render: () => <CompareStory />,
};
