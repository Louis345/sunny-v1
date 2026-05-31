import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type {
  CapturedMonsterConfig,
  CapturedMonsterLifeState,
} from "./capturedMonsterCatalog";

export type CapturedMonsterEventType =
  | "monster_named"
  | "monster_selected_sidekick"
  | "monster_pet"
  | "monster_fed"
  | "monster_idle"
  | "monster_sleep"
  | "monster_wake"
  | "monster_celebrate";

export interface CapturedMonsterEvent {
  type: CapturedMonsterEventType;
  creatureId: string;
  speciesName: string;
  nickname: string;
  lifeState?: CapturedMonsterLifeState;
  bond?: number;
  source: "captured_monster_den_storybook";
}

export interface CapturedMonsterCardProps {
  creature: CapturedMonsterConfig;
  nickname: string;
  mood: CapturedMonsterLifeState;
  bond: number;
  onEvent?: (event: CapturedMonsterEvent) => void;
  onVisitDen?: (nickname: string) => void;
}

export interface MonsterLifeLayerProps {
  creature: CapturedMonsterConfig;
  nickname: string;
  lifeState: CapturedMonsterLifeState;
  onPet?: () => void;
}

export interface MonsterDenPreviewProps {
  creature: CapturedMonsterConfig;
  initialNickname?: string;
  onEvent?: (event: CapturedMonsterEvent) => void;
}

const sleepAfterMs = 6_000;

function eventFor(
  creature: CapturedMonsterConfig,
  type: CapturedMonsterEventType,
  nickname: string,
  lifeState?: CapturedMonsterLifeState,
  bond?: number,
): CapturedMonsterEvent {
  return {
    type,
    creatureId: creature.id,
    speciesName: creature.speciesName,
    nickname,
    lifeState,
    bond,
    source: "captured_monster_den_storybook",
  };
}

function rarityLabel(rarity: CapturedMonsterConfig["rarity"]): string {
  if (rarity === "rare") return "Rare";
  if (rarity === "uncommon") return "Uncommon";
  return "Common";
}

export function CapturedMonsterCard({
  creature,
  nickname,
  mood,
  bond,
  onEvent,
  onVisitDen,
}: CapturedMonsterCardProps): ReactElement {
  const [draftName, setDraftName] = useState(nickname);
  const normalizedName = draftName.trim() || creature.defaultNickname;

  function emit(type: CapturedMonsterEventType): void {
    const event = eventFor(
      creature,
      type,
      normalizedName,
      mood === "curious" ? "curious" : mood,
      bond,
    );
    console.info(" 🎮 [captured-monster-den] [event] [reported]", event);
    onEvent?.(event);
  }

  return (
    <section
      className="captured-monster-card"
      role="dialog"
      aria-label={`${creature.speciesName} captured`}
    >
      <div className="captured-monster-card__art">
        <img src={creature.imageSrc} alt="" aria-hidden="true" />
      </div>
      <div className="captured-monster-card__copy">
        <span className="captured-monster-card__eyebrow">Added to collection</span>
        <h2>{creature.collectionTitle}</h2>
        <p>
          {creature.speciesName} is now living in Sunny. Name it, visit the den,
          or bring it along as a tiny sidekick.
        </p>
        <div className="captured-monster-card__chips" aria-label="Captured monster details">
          <span>{rarityLabel(creature.rarity)}</span>
          <span>{creature.statLabel} {creature.statValue}</span>
          <span>Mood {mood}</span>
          <span>Bond {bond}</span>
        </div>
        <label className="captured-monster-card__name">
          <span>Monster nickname</span>
          <input
            aria-label="Monster nickname"
            value={draftName}
            onChange={(event) => setDraftName(event.currentTarget.value)}
          />
        </label>
        <div className="captured-monster-card__actions">
          <button type="button" onClick={() => emit("monster_named")}>
            Save name
          </button>
          <button
            type="button"
            onClick={() => {
              emit("monster_selected_sidekick");
            }}
          >
            Bring Along
          </button>
          <button type="button" onClick={() => onVisitDen?.(normalizedName)}>
            Visit Den
          </button>
        </div>
      </div>
      <MonsterDenStyles />
    </section>
  );
}

export function MonsterLifeLayer({
  creature,
  nickname,
  lifeState,
  onPet,
}: MonsterLifeLayerProps): ReactElement {
  return (
    <>
      <button
        type="button"
        className="monster-life-layer"
        data-testid="monster-life-layer"
        data-life-state={lifeState}
        aria-label={`Tap ${nickname}`}
        onClick={onPet}
      >
        <span className="monster-life-layer__glow" aria-hidden="true" />
        <img src={creature.imageSrc} alt="" aria-hidden="true" />
        <span className="monster-life-layer__shadow" aria-hidden="true" />
        <span className="monster-life-layer__name">{nickname}</span>
      </button>
      <MonsterDenStyles />
    </>
  );
}

export function MonsterDenPreview({
  creature,
  initialNickname,
  onEvent,
}: MonsterDenPreviewProps): ReactElement {
  const [nickname, setNickname] = useState(initialNickname ?? creature.defaultNickname);
  const [lifeState, setLifeState] = useState<CapturedMonsterLifeState>("idle");
  const [bond, setBond] = useState(18);
  const [sidekickSelected, setSidekickSelected] = useState(false);
  const activitySeqRef = useRef(0);

  const moodLabel = useMemo(() => {
    if (lifeState === "sleep") return "sleepy";
    if (lifeState === "celebrate") return "sparkly";
    return lifeState;
  }, [lifeState]);

  function emit(
    type: CapturedMonsterEventType,
    nextState = lifeState,
    nextBond = bond,
    nextNickname = nickname,
  ): void {
    const event = eventFor(creature, type, nextNickname, nextState, nextBond);
    console.info(" 🎮 [captured-monster-den] [event] [reported]", event);
    onEvent?.(event);
  }

  function markActivity(): void {
    activitySeqRef.current += 1;
  }

  function setStateWithEvent(
    nextState: CapturedMonsterLifeState,
    type: CapturedMonsterEventType,
    nextBond = bond,
  ): void {
    markActivity();
    setLifeState(nextState);
    setBond(nextBond);
    emit(type, nextState, nextBond);
  }

  useEffect(() => {
    if (lifeState === "sleep") return;
    const seq = activitySeqRef.current;
    const id = window.setTimeout(() => {
      if (activitySeqRef.current !== seq) return;
      setLifeState("sleep");
      emit("monster_sleep", "sleep", bond);
    }, sleepAfterMs);
    return () => window.clearTimeout(id);
  }, [bond, lifeState]);

  function petMonster(): void {
    if (lifeState === "sleep") {
      setStateWithEvent("curious", "monster_wake", bond);
      return;
    }
    setStateWithEvent("happy", "monster_pet", Math.min(100, bond + 2));
  }

  function feedMonster(): void {
    setStateWithEvent("celebrate", "monster_fed", Math.min(100, bond + 4));
  }

  function wakeMonster(): void {
    setStateWithEvent("curious", "monster_wake", bond);
  }

  return (
    <section
      className="monster-den-preview"
      data-testid="monster-den-preview"
      aria-label={`${nickname}'s den`}
    >
      <div className="monster-den-preview__room">
        <div className="monster-den-preview__sky" aria-hidden="true" />
        <div className="monster-den-preview__shelf" aria-hidden="true" />
        <MonsterLifeLayer
          creature={creature}
          nickname={nickname}
          lifeState={lifeState}
          onPet={petMonster}
        />
      </div>
      <aside className="monster-den-preview__panel">
        <span className="monster-den-preview__eyebrow">Sunny den</span>
        <h2>{nickname}'s den</h2>
        <p>
          A captured reward creature can live here, react to care, and later come
          along during Sunny sessions.
        </p>
        <label className="monster-den-preview__name">
          <span>Nickname</span>
          <input
            value={nickname}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setNickname(next);
              emit("monster_named", lifeState, bond, next);
            }}
          />
        </label>
        <div className="monster-den-preview__chips">
          <span>{rarityLabel(creature.rarity)}</span>
          <span>Mood {moodLabel}</span>
          <span>Bond {bond}</span>
          <span>{sidekickSelected ? "Sidekick selected" : "In den"}</span>
        </div>
        <div className="monster-den-preview__actions">
          <button type="button" onClick={petMonster}>
            Pet {nickname}
          </button>
          <button type="button" onClick={feedMonster}>
            Feed treat
          </button>
          <button type="button" onClick={wakeMonster}>
            Wake {nickname}
          </button>
          <button
            type="button"
            onClick={() => {
              setSidekickSelected(true);
              emit("monster_selected_sidekick");
            }}
          >
            Bring Along
          </button>
        </div>
      </aside>
      <MonsterDenStyles />
    </section>
  );
}

function MonsterDenStyles(): ReactElement {
  return (
    <style>{`
      .captured-monster-card,
      .monster-den-preview {
        box-sizing: border-box;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .captured-monster-card *,
      .monster-den-preview *,
      .monster-life-layer * {
        box-sizing: border-box;
      }

      .captured-monster-card {
        align-items: center;
        background:
          radial-gradient(circle at 22% 16%, rgba(255, 228, 107, 0.42), transparent 30%),
          linear-gradient(135deg, rgba(11, 143, 159, 0.96), rgba(16, 32, 45, 0.98));
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 28px;
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.26);
        color: #ffffff;
        display: grid;
        gap: 24px;
        grid-template-columns: minmax(180px, 0.52fr) minmax(280px, 1fr);
        max-width: 880px;
        padding: clamp(22px, 4vw, 34px);
      }

      .captured-monster-card__art {
        align-items: center;
        aspect-ratio: 1;
        background:
          radial-gradient(circle, rgba(255, 255, 255, 0.78), rgba(124, 255, 241, 0.3) 55%, transparent 70%);
        border-radius: 50%;
        display: grid;
        justify-items: center;
        min-width: 0;
      }

      .captured-monster-card__art img {
        filter: drop-shadow(0 16px 24px rgba(39, 31, 88, 0.28));
        width: min(86%, 260px);
      }

      .captured-monster-card__copy {
        display: grid;
        gap: 14px;
      }

      .captured-monster-card__eyebrow,
      .monster-den-preview__eyebrow {
        color: #ffe46b;
        font-size: 13px;
        font-weight: 950;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .captured-monster-card h2,
      .monster-den-preview h2 {
        font-size: clamp(30px, 5vw, 52px);
        font-weight: 950;
        letter-spacing: 0;
        line-height: 0.98;
        margin: 0;
      }

      .captured-monster-card p,
      .monster-den-preview p {
        color: rgba(255, 255, 255, 0.82);
        font-size: 16px;
        font-weight: 750;
        line-height: 1.45;
        margin: 0;
      }

      .captured-monster-card__chips,
      .monster-den-preview__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .captured-monster-card__chips span,
      .monster-den-preview__chips span {
        background: rgba(255, 255, 255, 0.14);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 999px;
        color: #ffffff;
        font-size: 13px;
        font-weight: 950;
        padding: 8px 10px;
      }

      .captured-monster-card__name,
      .monster-den-preview__name {
        display: grid;
        gap: 7px;
      }

      .captured-monster-card__name span,
      .monster-den-preview__name span {
        font-size: 13px;
        font-weight: 950;
      }

      .captured-monster-card__name input,
      .monster-den-preview__name input {
        background: rgba(255, 255, 255, 0.94);
        border: 0;
        border-radius: 14px;
        color: #10202d;
        font: inherit;
        font-size: 18px;
        font-weight: 900;
        letter-spacing: 0;
        min-height: 48px;
        padding: 0 14px;
      }

      .captured-monster-card__actions,
      .monster-den-preview__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .captured-monster-card__actions button,
      .monster-den-preview__actions button {
        background: #ffe46b;
        border: 0;
        border-radius: 14px;
        color: #10202d;
        cursor: pointer;
        font: inherit;
        font-weight: 950;
        letter-spacing: 0;
        min-height: 44px;
        padding: 0 15px;
      }

      .captured-monster-card__actions button:nth-child(2),
      .monster-den-preview__actions button:nth-child(4) {
        background: #7cfff1;
      }

      .captured-monster-card__actions button:nth-child(3) {
        background: #ffffff;
      }

      .monster-den-preview {
        background: #edf4f7;
        color: #10202d;
        display: grid;
        gap: 18px;
        grid-template-columns: minmax(520px, 1.3fr) minmax(300px, 0.7fr);
        min-height: 100vh;
        padding: 18px;
      }

      .monster-den-preview__room {
        background:
          linear-gradient(180deg, rgba(7, 169, 219, 0.4), transparent 38%),
          radial-gradient(circle at 50% 70%, rgba(255, 228, 107, 0.22), transparent 38%),
          linear-gradient(180deg, #80d8f1 0%, #c6f0d4 52%, #66b76c 53%, #3e8c4a 100%);
        border-radius: 24px;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3), 0 20px 50px rgba(15, 23, 42, 0.16);
        min-height: 620px;
        overflow: hidden;
        position: relative;
      }

      .monster-den-preview__sky {
        background:
          radial-gradient(ellipse at 24% 22%, rgba(255, 255, 255, 0.92) 0 7%, transparent 8%),
          radial-gradient(ellipse at 72% 18%, rgba(255, 255, 255, 0.86) 0 9%, transparent 10%);
        inset: 0;
        position: absolute;
      }

      .monster-den-preview__shelf {
        background: rgba(92, 64, 37, 0.5);
        border-radius: 999px;
        bottom: 118px;
        height: 18px;
        left: 10%;
        position: absolute;
        right: 10%;
      }

      .monster-den-preview__panel {
        align-content: start;
        background: #10202d;
        border-radius: 24px;
        color: #ffffff;
        display: grid;
        gap: 16px;
        padding: 22px;
      }

      .monster-life-layer {
        background: transparent;
        border: 0;
        bottom: 118px;
        cursor: pointer;
        display: grid;
        justify-items: center;
        left: 50%;
        padding: 0;
        position: absolute;
        transform: translateX(-50%);
        width: clamp(180px, 32vw, 320px);
      }

      .monster-life-layer img {
        filter: drop-shadow(0 18px 24px rgba(52, 45, 96, 0.28));
        position: relative;
        width: 100%;
        z-index: 2;
      }

      .monster-life-layer__glow {
        background: radial-gradient(circle, rgba(255, 228, 107, 0.38), rgba(124, 255, 241, 0.2) 48%, transparent 70%);
        border-radius: 50%;
        height: 112%;
        position: absolute;
        top: -14%;
        width: 112%;
        z-index: 1;
      }

      .monster-life-layer__shadow {
        background: rgba(34, 72, 45, 0.24);
        border-radius: 50%;
        filter: blur(6px);
        height: 20px;
        margin-top: -18px;
        width: 56%;
      }

      .monster-life-layer__name {
        background: rgba(16, 32, 45, 0.86);
        border-radius: 999px;
        color: #ffffff;
        font-size: 16px;
        font-weight: 950;
        margin-top: 8px;
        padding: 8px 14px;
      }

      .monster-life-layer[data-life-state="idle"] img {
        animation: monsterLifeBreathe 2.4s ease-in-out infinite;
      }

      .monster-life-layer[data-life-state="curious"] img {
        animation: monsterLifeCurious 1.3s ease-in-out infinite;
      }

      .monster-life-layer[data-life-state="happy"] img {
        animation: monsterLifeHappy 0.72s ease-in-out infinite;
      }

      .monster-life-layer[data-life-state="celebrate"] img {
        animation: monsterLifeCelebrate 0.82s cubic-bezier(0.2, 0.9, 0.2, 1) infinite;
      }

      .monster-life-layer[data-life-state="sleep"] {
        cursor: pointer;
      }

      .monster-life-layer[data-life-state="sleep"] img {
        animation: monsterLifeSleep 3s ease-in-out infinite;
        filter: grayscale(0.08) brightness(0.92) drop-shadow(0 14px 20px rgba(52, 45, 96, 0.2));
      }

      @keyframes monsterLifeBreathe {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-8px) scale(1.02); }
      }

      @keyframes monsterLifeCurious {
        0%, 100% { transform: translateY(0) rotate(-2deg); }
        50% { transform: translateY(-10px) rotate(4deg); }
      }

      @keyframes monsterLifeHappy {
        0%, 100% { transform: translateY(0) scale(1); }
        42% { transform: translateY(-18px) scale(1.04); }
      }

      @keyframes monsterLifeCelebrate {
        0%, 100% { transform: translateY(0) rotate(-4deg) scale(1); }
        35% { transform: translateY(-26px) rotate(7deg) scale(1.05); }
        68% { transform: translateY(-8px) rotate(-7deg) scale(1.02); }
      }

      @keyframes monsterLifeSleep {
        0%, 100% { transform: translateY(14px) scale(0.92) rotate(-4deg); }
        50% { transform: translateY(10px) scale(0.94) rotate(-3deg); }
      }

      @media (max-width: 920px) {
        .captured-monster-card,
        .monster-den-preview {
          grid-template-columns: 1fr;
        }

        .monster-den-preview__room {
          min-height: 520px;
        }
      }
    `}</style>
  );
}
