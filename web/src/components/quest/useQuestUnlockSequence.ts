import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { MapState, NodeConfig } from "../../../../src/shared/adventureTypes";
import type { Point } from "../../../../src/shared/pathCurve";
import { isChildQuestUnlocked } from "../../utils/childQuestConfig";
import { playCelebration, playMagicChime } from "../../utils/questUnlockAudio";

type QuestProfileRows = Record<string, { questUnlocked?: boolean }>;

export type QuestUnlockState = {
  overlayActive: boolean;
  burstActive: boolean;
  toastActive: boolean;
  companionActive: boolean;
  particlesActive: boolean;
  raysActive: boolean;
  cardStarsActive: boolean;
  lockGlyphOverride: string | null;
  origin: { x: number; y: number };
  companionBubbleText: string;
  companionId: string;
  childId: string;
  previewTopOffsetPx: number;
  beginQuestUnlockSequence: (options?: { force?: boolean }) => void;
  forceQuestLock: (node: NodeConfig) => boolean;
  lockGlyphOverrideFor: (node: NodeConfig) => string | null;
  canOpenQuestBriefing: boolean;
};

export function useQuestUnlockSequence(args: {
  childId: string;
  companionId: string;
  childProfiles: QuestProfileRows;
  mapState: MapState | null;
  worldRef: RefObject<HTMLElement | null>;
  pathPositionsRef: RefObject<readonly Point[]>;
  diagUnlockMap: boolean;
  previewTopOffsetPx: number;
  companionBubbleText: string;
  onCompanionEvent?: (payload: {
    type: "quest_unlock_started" | "quest_unlock_companion_reaction" | "quest_unlock_complete";
    childId: string;
    companionId: string;
    timestamp: number;
  }) => void;
}): QuestUnlockState {
  const {
    childId,
    companionId,
    childProfiles,
    mapState,
    worldRef,
    pathPositionsRef,
    diagUnlockMap,
    previewTopOffsetPx,
    companionBubbleText,
    onCompanionEvent,
  } = args;
  const resolved = childId.trim();

  const [questCeremonyTapAllowed, setQuestCeremonyTapAllowed] = useState(() =>
    // TODO: replace questUnlocked with computeQuestThreshold(childId)
    !isChildQuestUnlocked(resolved, childProfiles),
  );
  const [overlayActive, setOverlayActive] = useState(false);
  const [burstActive, setBurstActive] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const [companionActive, setCompanionActive] = useState(false);
  const [particlesActive, setParticlesActive] = useState(false);
  const [raysActive, setRaysActive] = useState(false);
  const [cardStarsActive, setCardStarsActive] = useState(false);
  const [lockGlyphOverride, setLockGlyphOverride] = useState<string | null>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const timersRef = useRef<number[]>([]);
  const consumedForSessionRef = useRef(false);
  const mapStateRef = useRef<MapState | null>(mapState);

  useEffect(() => {
    mapStateRef.current = mapState;
  }, [mapState]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const resetVisuals = useCallback(() => {
    setOverlayActive(false);
    setBurstActive(false);
    setToastActive(false);
    setCompanionActive(false);
    setParticlesActive(false);
    setRaysActive(false);
    setCardStarsActive(false);
    setLockGlyphOverride(null);
  }, []);

  useEffect(() => {
    setQuestCeremonyTapAllowed(!isChildQuestUnlocked(resolved, childProfiles));
    consumedForSessionRef.current = false;
    resetVisuals();
    clearTimers();
  }, [resolved, mapState?.sessionDate, childProfiles, clearTimers, resetVisuals]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const emitCompanionEvent = useCallback(
    (type: "quest_unlock_started" | "quest_unlock_companion_reaction" | "quest_unlock_complete") => {
      onCompanionEvent?.({
        type,
        childId: resolved,
        companionId,
        timestamp: Date.now(),
      });
    },
    [companionId, onCompanionEvent, resolved],
  );

  const beginQuestUnlockSequence = useCallback((options?: { force?: boolean }) => {
    if (!isChildQuestUnlocked(resolved, childProfiles)) return;
    const ms = mapStateRef.current;
    if (!ms?.nodes.some((n) => n.type === "quest")) return;
    if (consumedForSessionRef.current && options?.force !== true) return;
    if (options?.force !== true) {
      consumedForSessionRef.current = true;
    }

    const world = worldRef.current;
    const qi = ms.nodes.findIndex((n) => n.type === "quest");
    const pos = pathPositionsRef.current[qi];
    if (world && pos) {
      const r = world.getBoundingClientRect();
      setOrigin({ x: r.left + pos.x, y: r.top + pos.y });
    } else {
      setOrigin({ x: window.innerWidth / 2, y: window.innerHeight * 0.42 });
    }

    clearTimers();
    emitCompanionEvent("quest_unlock_started");
    playMagicChime();

    const q = (delayMs: number, fn: () => void) => {
      timersRef.current.push(window.setTimeout(fn, delayMs));
    };

    q(0, () => setOverlayActive(true));
    q(350, () => playCelebration());
    q(400, () => {
      setBurstActive(true);
      setRaysActive(true);
    });
    q(500, () => setToastActive(true));
    q(700, () => {
      setCompanionActive(true);
      emitCompanionEvent("quest_unlock_companion_reaction");
    });
    q(900, () => {
      setLockGlyphOverride("⚡");
      setCardStarsActive(true);
    });
    q(1100, () => setParticlesActive(true));
    q(2800, () => {
      setToastActive(false);
      setBurstActive(false);
      setRaysActive(false);
      setQuestCeremonyTapAllowed(true);
      emitCompanionEvent("quest_unlock_complete");
    });
    q(5500, () => {
      setOverlayActive(false);
      setCompanionActive(false);
      setParticlesActive(false);
      setCardStarsActive(false);
      setLockGlyphOverride(null);
    });
  }, [
    childProfiles,
    clearTimers,
    emitCompanionEvent,
    pathPositionsRef,
    resolved,
    worldRef,
  ]);

  const forceQuestLock = useCallback(
    (node: NodeConfig) =>
      !diagUnlockMap &&
      node.type === "quest" &&
      isChildQuestUnlocked(resolved, childProfiles) &&
      !questCeremonyTapAllowed,
    [childProfiles, diagUnlockMap, questCeremonyTapAllowed, resolved],
  );

  const lockGlyphOverrideFor = useCallback(
    (node: NodeConfig) => (node.type === "quest" ? lockGlyphOverride : null),
    [lockGlyphOverride],
  );

  return {
    overlayActive,
    burstActive,
    toastActive,
    companionActive,
    particlesActive,
    raysActive,
    cardStarsActive,
    lockGlyphOverride,
    origin,
    companionBubbleText,
    companionId,
    childId: resolved,
    previewTopOffsetPx,
    beginQuestUnlockSequence,
    forceQuestLock,
    lockGlyphOverrideFor,
    canOpenQuestBriefing: questCeremonyTapAllowed || diagUnlockMap,
  };
}
