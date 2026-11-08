import { useEffect, useMemo, useState, type ReactNode } from "react";
import "./CreatureEncounter.css";
import { CREATURE_CATALOG } from "../../../src/shared/capturedMonsterCatalog";
import type { CompanionConfig } from "../../../src/shared/companionTypes";
import { CreatureEncounterReveal } from "./CreatureEncounterReveal";
import { SparkOrbLearningShell } from "./SparkOrbLearningShell";
import { resolveCreatureEncounter } from "../utils/creatureApi";

type Stage = "reveal" | "orb" | "caught" | "away";

/**
 * A creature encounter in her real session (owner, 2026-11-08): after the chest, the creature the server
 * rolled appears; she catches it with the throws she earned on that stop, or lets it go. The catch or the
 * let-go is saved on the server. A reward only: nothing here is learning evidence.
 */
export function LiveCreatureEncounter({
  childId,
  encounter,
  companion,
  onDone,
}: {
  childId: string;
  encounter: { encounterId: string; creatureId: string; charges: number; isNew: boolean };
  companion: CompanionConfig;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<Stage>("reveal");
  const creature = useMemo(() => CREATURE_CATALOG.find((species) => species.id === encounter.creatureId), [encounter.creatureId]);
  const throws = Math.max(1, encounter.charges);

  const record = (outcome: "caught" | "let_go") =>
    resolveCreatureEncounter(childId, encounter.encounterId, outcome).catch((error: unknown) => {
      // Never holds her back: the encounter stays waiting on the server and can be resolved later.
      console.error(` 🎮 [creatures] [encounter] [save-failed] encounter=${encounter.encounterId}`, error);
      return null;
    });

  if (!creature) {
    console.warn(` 🎮 [creatures] [encounter] [unknown-creature] id=${encounter.creatureId}`);
    onDone();
    return null;
  }

  const screen = { position: "fixed" as const, inset: 0, zIndex: 130, overflow: "auto", background: "#0b0820", color: "white", fontFamily: "Lexend, system-ui, sans-serif" };
  const button = { padding: "14px 28px", borderRadius: 999, border: 0, font: "900 18px Lexend, system-ui, sans-serif", cursor: "pointer", background: "linear-gradient(180deg,#ffe680,#ffc21a)", color: "#231400" };

  if (stage === "reveal") {
    return (
      <div style={{ ...screen, padding: 16 }} data-testid="live-creature-encounter" data-stage="reveal">
        <CreatureEncounterReveal
          creature={creature}
          isNew={encounter.isNew}
          charges={throws}
          stakes={`You earned ${throws} throw${throws === 1 ? "" : "s"} on that stop!`}
          onCatch={() => setStage("orb")}
          onRun={() => {
            void record("let_go").then(onDone);
          }}
        />
      </div>
    );
  }

  if (stage === "orb") {
    return (
      <div style={screen} data-testid="live-creature-encounter" data-stage="orb">
        <SparkOrbLearningShell
          childId={childId}
          childName={childId}
          companion={companion}
          phase="ready"
          chargeGoal={throws}
          chargeCount={throws}
          domain="reward"
          currentTarget={`creature:${creature.id}`}
          lastMoment="orb_ready"
          capturedCreature={creature}
          creatureName={creature.speciesName}
          statLabel={creature.statLabel}
          statValue={creature.statValue}
          catchRule={{ rarity: creature.rarity }}
          onCaptureCompleted={() => {
            void record("caught").then(() => setStage("caught"));
          }}
          onEscaped={() => {
            void record("let_go").then(() => setStage("away"));
          }}
        >
          <div style={{ display: "grid", gap: 10, padding: 20 }}>
            <strong style={{ fontSize: 13, letterSpacing: ".12em", color: "#3d7d8c" }}>CATCH IT!</strong>
            <h2 style={{ margin: 0, fontSize: 30 }}>{`Throw the orb at ${creature.speciesName}!`}</h2>
            <p style={{ margin: 0, fontWeight: 700 }}>{`${throws} throw${throws === 1 ? "" : "s"} from the words you got right.`}</p>
          </div>
        </SparkOrbLearningShell>
      </div>
    );
  }

  return (
    <div style={{ ...screen, display: "grid", placeItems: "center", gap: 16, padding: 24, textAlign: "center" }} data-testid="live-creature-encounter" data-stage={stage}>
      <h2 style={{ margin: 0, fontSize: 36 }}>
        {stage === "caught" ? `${creature.speciesName} joined your den!` : `${creature.speciesName} got away!`}
      </h2>
      <p style={{ margin: 0, fontWeight: 700, opacity: 0.85 }}>
        {stage === "caught" ? "Visit your den to name it, feed it, and bring it along." : "Rare ones are hard to catch. Keep going and you will meet it again."}
      </p>
      <button type="button" style={button} onClick={onDone}>
        Back to my map
      </button>
    </div>
  );
}

/**
 * The reward stage after a stop: her chest first (when there is one), then the creature the Planner placed
 * there (when one appeared), then back to her map.
 */
export function ChestThenCreature({
  renderChest,
  encounter,
  childId,
  companion,
  onFinish,
}: {
  renderChest: ((collect: () => void) => ReactNode) | null;
  encounter: { encounterId: string; creatureId: string; charges: number; isNew: boolean } | null;
  childId: string;
  companion: CompanionConfig | null;
  onFinish: () => void;
}) {
  const [chestDone, setChestDone] = useState(!renderChest);
  const creatureReady = Boolean(encounter && companion && childId);
  useEffect(() => {
    if (chestDone && !creatureReady) onFinish();
  }, [chestDone, creatureReady, onFinish]);
  if (!chestDone && renderChest) {
    return <>{renderChest(() => (creatureReady ? setChestDone(true) : onFinish()))}</>;
  }
  if (creatureReady) return <LiveCreatureEncounter childId={childId} encounter={encounter!} companion={companion!} onDone={onFinish} />;
  return null;
}
