import { useEffect, useMemo, useRef, useState } from "react";
import { CREATURE_CATALOG } from "../../../src/shared/capturedMonsterCatalog";
import type { CompanionConfig } from "../../../src/shared/companionTypes";
import type { GiftQuestion } from "../../../src/shared/companionCareTypes";
import { seasonOf, skyMoodNow } from "../../../src/shared/skyClock";
import { resolveCreatureEncounter } from "../utils/creatureApi";
import { playSfxFile } from "../utils/gameSfx";
import { OrbCatcher3D } from "./OrbCatcher3D";
import { CHAMPIONSHIP_PACK, MEADOW_PACK, YOKAI_NIGHT_PACK, type OrbThemePack } from "./orbThemePacks";

/** Each twin's world (from her soul file): Ila's yokai festival, Reina's championship ring. */
const THEME_BY_CHILD: Record<string, OrbThemePack> = { ila: YOKAI_NIGHT_PACK, reina: CHAMPIONSHIP_PACK };
/** How long the present takes to burst open when her birthday line is missing. */
const OPEN_MS = 1400;
/** Lets the catch animation and the announcer's catch call finish before the den screen. */
const AFTER_CATCH_MS = 3500;

type Stage = "present" | "opening" | "game" | "done";

/**
 * Her birthday gift (owner, 2026-11-21): a present after the stop she finished; tapping it opens Orb Catcher with
 * that stop's own questions, and the Starwhal she catches joins her den. A gift and practice: nothing here is evidence.
 */
export function BirthdayOrbGift({
  childId,
  encounter,
  companion,
  onDone,
}: {
  childId: string;
  encounter: { encounterId: string; creatureId: string; charges: number; questions?: GiftQuestion[] };
  companion: CompanionConfig;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<Stage>("present");
  const creature = useMemo(() => CREATURE_CATALOG.find((species) => species.id === encounter.creatureId) ?? CREATURE_CATALOG[0], [encounter.creatureId]);
  const questions = encounter.questions ?? [];
  const drill = useMemo(() => (questions.length ? { plannedRounds: questions.length, questions } : undefined), [questions]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const open = () => {
    if (stage !== "present") return;
    console.log(` 🎮 [birthday-gift] [opened] child=${childId} questions=${questions.length}`);
    setStage("opening");
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      setStage("game");
    };
    // Her recorded "Happy birthday!" plays as the present bursts; the game starts when it ends (or without it).
    const playing = playSfxFile(`/generated/announcer/${childId}/clips/slot-birthday.mp3`, { label: "birthday-line", volume: 1, onEnded: start });
    if (!playing) timers.current.push(window.setTimeout(start, OPEN_MS));
    timers.current.push(window.setTimeout(start, 9000)); // never stuck on the present
  };

  const finish = (outcome: "caught" | "escaped") => {
    void resolveCreatureEncounter(childId, encounter.encounterId, outcome === "caught" ? "caught" : "let_go")
      .catch((error: unknown) => {
        // Never holds her back: the gift stays waiting on the server and opens again after her next stop.
        console.error(` 🎮 [birthday-gift] [save-failed] encounter=${encounter.encounterId}`, error);
        return null;
      })
      .then(() => timers.current.push(window.setTimeout(() => setStage("done"), AFTER_CATCH_MS)));
  };

  const screen = { position: "fixed" as const, inset: 0, zIndex: 130, overflow: "hidden", background: "radial-gradient(circle at 50% 40%, #3b1d6e, #0b0820 70%)", color: "white", fontFamily: "Lexend, system-ui, sans-serif" };

  if (stage === "game") {
    return (
      <div style={screen} data-testid="birthday-gift" data-stage="game">
        <OrbCatcher3D
          creature={creature}
          throws={Math.max(3, encounter.charges)}
          theme={THEME_BY_CHILD[childId] ?? MEADOW_PACK}
          drill={drill}
          timeOfDay={skyMoodNow()}
          season={seasonOf(new Date())}
          companionVrmUrl={companion.vrmUrl}
          announcerChildId={childId}
          roll={() => 0}
          onResult={finish}
        />
      </div>
    );
  }

  const art = (size: number) => (
    <img
      src={creature.imageSrc}
      alt=""
      style={{ width: size, height: size, objectFit: "contain", filter: creature.placeholderHue ? `hue-rotate(${creature.placeholderHue}deg) drop-shadow(0 0 24px #9fd2ff)` : "drop-shadow(0 0 24px #9fd2ff)" }}
    />
  );

  return (
    <div style={{ ...screen, display: "grid", placeItems: "center", textAlign: "center" }} data-testid="birthday-gift" data-stage={stage}>
      <style>{`
        @keyframes bday-wiggle { 0%,100% { transform: rotate(0) scale(1) } 25% { transform: rotate(-8deg) scale(1.05) } 75% { transform: rotate(8deg) scale(1.05) } }
        @keyframes bday-burst { 0% { transform: scale(1); opacity: 1 } 60% { transform: scale(1.6); opacity: 1 } 100% { transform: scale(2.4); opacity: 0 } }
        @keyframes bday-fall { from { transform: translateY(-10vh) rotate(0) } to { transform: translateY(110vh) rotate(720deg) } }
        @keyframes bday-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
      `}</style>
      {Array.from({ length: 28 }, (_, index) => (
        <span
          key={index}
          aria-hidden
          style={{
            position: "absolute", top: 0, left: `${(index * 37) % 100}%`, width: 10, height: 16, borderRadius: 3,
            background: ["#ff6fb5", "#ffd84d", "#6fe3ff", "#9b7bff", "#7dff9b"][index % 5],
            animation: `bday-fall ${3 + (index % 5)}s linear ${(index % 7) * 0.4}s infinite`,
          }}
        />
      ))}
      {stage === "done" ? (
        <div style={{ display: "grid", gap: 18, placeItems: "center", animation: "bday-float 2.4s ease-in-out infinite" }}>
          {art(220)}
          <div style={{ fontSize: 56 }} aria-label={`${creature.speciesName} joined your den`}>🎂 ✨ 🏠</div>
          <button
            type="button"
            data-testid="birthday-done"
            onClick={onDone}
            style={{ padding: "16px 40px", borderRadius: 999, border: 0, fontSize: 36, cursor: "pointer", background: "linear-gradient(180deg,#ffe680,#ffc21a)" }}
            aria-label="Back to my map"
          >
            🗺️
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-testid="birthday-present"
          onClick={open}
          aria-label="Open your birthday present"
          style={{
            border: 0, background: "none", cursor: "pointer", fontSize: 180, lineHeight: 1,
            animation: stage === "opening" ? "bday-burst 1.2s ease-out forwards" : "bday-wiggle 1.2s ease-in-out infinite",
          }}
        >
          🎁
        </button>
      )}
    </div>
  );
}
