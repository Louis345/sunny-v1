import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactElement } from "react";
import {
  capturedMonsterCatalog,
  type CapturedMonsterConfig,
} from "../components/capturedMonsterCatalog";
import { SparkOrbCreatureLife } from "../components/SparkOrbCreatureLife";
import {
  resolveLifeProfile,
  type CreatureLifeReaction,
} from "../components/creatureLifeProfiles";

const meta: Meta = {
  title: "Reward Encounters/Creature Life Gallery",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Scalability proof for the creature life system: every catalog entry renders alive from data alone. Adding a new creature = one PNG + one catalog entry; no renderer or CSS changes.",
      },
    },
  },
};

export default meta;
type Story = StoryObj;

/**
 * Story-local demo entry proving "new animal = data only": same PNG, different
 * personality + profile, zero component changes. Not part of the real catalog.
 */
const DOZLE_DEMO_MONSTER: CapturedMonsterConfig = {
  id: "dozle-demo",
  speciesName: "Dozle (demo)",
  defaultNickname: "Dozle",
  rarity: "common",
  statLabel: "NAP",
  statValue: 88,
  imageSrc: "/encounters/spark-orb/lumipuff.png",
  collectionTitle: "Sleepy meadow friend",
  capturePersonality: "sleepy",
  personalityTags: ["drowsy", "gentle"],
  lifeStates: ["idle", "sleep"],
  lifeAnchors: {
    eyeLeft: { xPct: 39, yPct: 34 },
    eyeRight: { xPct: 61, yPct: 34 },
    eyeWidthPct: 13,
    eyeHeightPct: 11,
    lidColor: "#d9b8ea",
  },
  lifeProfile: {
    hover: { pxAmp: 3 },
    blink: { minGapMs: 5000, maxGapMs: 11000 },
  },
  sprite: {
    mode: "css-png",
    futureAtlasReady: true,
  },
};

const galleryCreatures: CapturedMonsterConfig[] = [
  ...capturedMonsterCatalog,
  DOZLE_DEMO_MONSTER,
];

const reactions: CreatureLifeReaction[] = ["perk", "concerned", "alert", "excited", "none"];

function CreatureLifeCell({ creature }: { creature: CapturedMonsterConfig }): ReactElement {
  const [reaction, setReaction] = useState<CreatureLifeReaction>("none");
  const [pulseKey, setPulseKey] = useState(0);
  const profile = resolveLifeProfile(creature);

  return (
    <div className="creature-life-gallery__cell">
      <div className="creature-life-gallery__stage">
        <SparkOrbCreatureLife
          profile={profile}
          reaction={reaction}
          reactionPulseKey={pulseKey}
        >
          <img
            className="creature-life-gallery__sprite"
            src={creature.imageSrc}
            alt={creature.speciesName}
          />
        </SparkOrbCreatureLife>
      </div>
      <strong>{creature.speciesName}</strong>
      <span>
        {creature.capturePersonality} · {creature.rarity}
      </span>
      <div className="creature-life-gallery__reactions" aria-label={`${creature.speciesName} reactions`}>
        {reactions.map((option) => (
          <button
            key={option}
            type="button"
            data-active={option === reaction ? "true" : "false"}
            onClick={() => {
              setReaction(option);
              setPulseKey((key) => key + 1);
            }}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function CreatureLifeGalleryStory(): ReactElement {
  return (
    <div className="creature-life-gallery">
      <header>
        <h1>Creature Life Gallery</h1>
        <p>
          Every creature below is animated by the same renderer from catalog data only.
          Watch for breathing, hover, irregular blinks, glances, and personality fidgets.
        </p>
      </header>
      <div className="creature-life-gallery__grid">
        {galleryCreatures.map((creature) => (
          <CreatureLifeCell key={creature.id} creature={creature} />
        ))}
      </div>
      <style>{`
        .creature-life-gallery {
          background: #edf4f7;
          color: #10202d;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          min-height: 100vh;
          padding: 26px;
        }

        .creature-life-gallery header {
          margin: 0 auto 22px;
          max-width: 860px;
          text-align: center;
        }

        .creature-life-gallery h1 {
          font-size: 30px;
          font-weight: 950;
          margin: 0 0 8px;
        }

        .creature-life-gallery p {
          color: rgba(16, 32, 45, 0.72);
          font-weight: 650;
          margin: 0;
        }

        .creature-life-gallery__grid {
          display: grid;
          gap: 20px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 380px));
          justify-content: center;
        }

        .creature-life-gallery__cell {
          align-items: center;
          background: #ffffff;
          border: 1px solid rgba(16, 32, 45, 0.12);
          border-radius: 22px;
          box-shadow: 0 16px 38px rgba(15, 23, 42, 0.1);
          display: grid;
          gap: 6px;
          justify-items: center;
          padding: 20px;
        }

        .creature-life-gallery__stage {
          background:
            radial-gradient(circle at 50% 84%, rgba(101, 185, 109, 0.22), transparent 62%),
            linear-gradient(180deg, #bfe6f7, #dcf3e2);
          border-radius: 18px;
          padding: 26px 34px 18px;
          width: 100%;
        }

        .creature-life-gallery__sprite {
          display: block;
          margin: 0 auto;
          width: min(200px, 72%);
        }

        .creature-life-gallery__cell strong {
          font-size: 20px;
          font-weight: 950;
          margin-top: 8px;
        }

        .creature-life-gallery__cell span {
          color: rgba(16, 32, 45, 0.62);
          font-size: 13px;
          font-weight: 800;
          text-transform: capitalize;
        }

        .creature-life-gallery__reactions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: center;
          margin-top: 8px;
        }

        .creature-life-gallery__reactions button {
          background: #f4f8fb;
          border: 1.5px solid rgba(16, 32, 45, 0.14);
          border-radius: 999px;
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 850;
          padding: 6px 12px;
        }

        .creature-life-gallery__reactions button[data-active="true"] {
          background: #10202d;
          border-color: #10202d;
          color: #ffe46b;
        }
      `}</style>
    </div>
  );
}

export const Gallery: Story = {
  render: () => <CreatureLifeGalleryStory />,
};
