import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactElement } from "react";
import {
  CapturedMonsterCard,
  MonsterDenPreview,
  MonsterLifeLayer,
  type CapturedMonsterEvent,
} from "../components/CapturedMonsterDen";
import { LUMIPUFF_MONSTER } from "../components/capturedMonsterCatalog";

export type CapturedMonsterDenStoryArgs = {
  nickname: string;
  mood: "idle" | "curious" | "happy" | "sleep" | "celebrate";
  bond: number;
};

const meta: Meta<CapturedMonsterDenStoryArgs> = {
  title: "Reward Encounters/Captured Monster Den",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Storybook-only payoff after Spark Orb capture: name the captured creature, visit the den, and preview it as a living reward sidekick.",
      },
    },
  },
  argTypes: {
    nickname: { control: "text" },
    mood: {
      control: "select",
      options: ["idle", "curious", "happy", "sleep", "celebrate"],
    },
    bond: { control: { type: "range", min: 0, max: 100, step: 1 } },
  },
  args: {
    nickname: "Lumi",
    mood: "curious",
    bond: 18,
  },
};

export default meta;
type Story = StoryObj<CapturedMonsterDenStoryArgs>;

function logMonsterEvent(event: CapturedMonsterEvent): void {
  console.info(" 🎮 [storybook:captured-monster-den] [event] [reported]", event);
}

function CaptureToDenHandoffStory(args: CapturedMonsterDenStoryArgs): ReactElement {
  const [denOpen, setDenOpen] = useState(false);
  const [nickname, setNickname] = useState(args.nickname);

  return (
    <main className="captured-monster-story captured-monster-story--handoff">
      {denOpen ? (
        <MonsterDenPreview
          creature={LUMIPUFF_MONSTER}
          initialNickname={nickname}
          onEvent={logMonsterEvent}
        />
      ) : (
        <div className="captured-monster-story__center">
          <CapturedMonsterCard
            creature={LUMIPUFF_MONSTER}
            nickname={nickname}
            mood={args.mood}
            bond={args.bond}
            onEvent={(event) => {
              if (event.type === "monster_named") {
                setNickname(event.nickname);
              }
              logMonsterEvent(event);
            }}
            onVisitDen={(nextNickname) => {
              setNickname(nextNickname);
              setDenOpen(true);
            }}
          />
        </div>
      )}
      <StoryStyles />
    </main>
  );
}

function LivingDenPetStory(args: CapturedMonsterDenStoryArgs): ReactElement {
  return (
    <MonsterDenPreview
      creature={LUMIPUFF_MONSTER}
      initialNickname={args.nickname}
      onEvent={logMonsterEvent}
    />
  );
}

function BringAlongPreviewStory(args: CapturedMonsterDenStoryArgs): ReactElement {
  return (
    <main className="captured-monster-story captured-monster-story--bring-along">
      <section className="captured-monster-story__orb-card" aria-label="Bring-along preview">
        <img
          className="captured-monster-story__backdrop"
          src="/encounters/spark-orb/park-background.png"
          alt=""
          aria-hidden="true"
        />
        <div className="captured-monster-story__hud">
          <strong>Spark Orb sidekick</strong>
          <span>Elli stays the travel buddy. {args.nickname} reacts beside the adventure.</span>
        </div>
        <div className="captured-monster-story__orb">
          <img src="/encounters/spark-orb/spark-orb.png" alt="" aria-hidden="true" />
        </div>
        <div className="captured-monster-story__sidekick">
          <MonsterLifeLayer
            creature={LUMIPUFF_MONSTER}
            nickname={args.nickname}
            lifeState={args.mood}
          />
        </div>
      </section>
      <StoryStyles />
    </main>
  );
}

export const CaptureToDenHandoff: Story = {
  args: {
    nickname: "Lumi",
    mood: "curious",
    bond: 18,
  },
  render: (args) => <CaptureToDenHandoffStory {...args} />,
};

export const LivingDenPet: Story = {
  args: {
    nickname: "Sparkle",
    mood: "idle",
    bond: 22,
  },
  render: (args) => <LivingDenPetStory {...args} />,
};

export const BringAlongPreview: Story = {
  args: {
    nickname: "Lumi",
    mood: "happy",
    bond: 24,
  },
  render: (args) => <BringAlongPreviewStory {...args} />,
};

function StoryStyles(): ReactElement {
  return (
    <style>{`
      .captured-monster-story {
        background: #edf4f7;
        color: #10202d;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        min-height: 100vh;
      }

      .captured-monster-story__center {
        align-items: center;
        display: grid;
        justify-items: center;
        min-height: 100vh;
        padding: 24px;
      }

      .captured-monster-story--bring-along {
        align-items: center;
        display: grid;
        justify-items: center;
        padding: 24px;
      }

      .captured-monster-story__orb-card {
        border-radius: 24px;
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.18);
        height: min(760px, calc(100vh - 48px));
        max-width: 1180px;
        overflow: hidden;
        position: relative;
        width: 100%;
      }

      .captured-monster-story__backdrop {
        height: 100%;
        inset: 0;
        object-fit: cover;
        position: absolute;
        width: 100%;
      }

      .captured-monster-story__hud {
        background: rgba(16, 32, 45, 0.82);
        border-radius: 18px;
        color: #ffffff;
        display: grid;
        gap: 4px;
        left: 28px;
        max-width: 430px;
        padding: 14px 16px;
        position: absolute;
        top: 28px;
      }

      .captured-monster-story__hud strong {
        font-size: 22px;
        font-weight: 950;
      }

      .captured-monster-story__hud span {
        color: rgba(255, 255, 255, 0.78);
        font-size: 14px;
        font-weight: 750;
      }

      .captured-monster-story__orb {
        bottom: 86px;
        left: 50%;
        position: absolute;
        transform: translateX(-50%) rotate(-8deg) scale(0.6);
        width: 170px;
      }

      .captured-monster-story__orb img {
        filter: drop-shadow(0 16px 18px rgba(8, 51, 68, 0.28));
        width: 100%;
      }

      .captured-monster-story__sidekick {
        bottom: 76px;
        position: absolute;
        right: 48px;
        transform: scale(0.62);
        transform-origin: bottom right;
        width: 320px;
      }
    `}</style>
  );
}
