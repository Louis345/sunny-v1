import { useState, useEffect, type Dispatch, type SetStateAction } from "react";

/** Minimal slice of voice session state the hook needs. */
export interface AdventureVoiceState {
  phase: string;
  canvas: {
    mode: string;
    karaokeWords?: string[];
  };
  karaokeStoryComplete?: boolean;
  error?: string | null;
  childName?: string | null;
}

export interface UseAdventureStateResult {
  /** Effective child ID: null when a voice error is present (so error UI surfaces). */
  adventureChildId: string | null;
  setAdventureChildId: Dispatch<SetStateAction<string | null>>;
  /** Effective node screen: null when no adventure child is active. */
  activeNodeScreen: { x: number; y: number } | null;
  setActiveNodeScreen: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  /** True when the karaoke reading overlay should be shown. */
  karaokeReadingActive: boolean;
  /** Derived from karaokeReadingActive — no independent state. */
  companionMuted: boolean;
  /** The child whose companion/profile should be loaded. */
  activeProfileChildId: string | null;
}

export function useAdventureState(
  voiceState: AdventureVoiceState,
  adventureMapEnabled: boolean,
): UseAdventureStateResult {
  // Lazy init: read VITE_DIAG_CHILD_ID once at mount; no mount effect needed.
  const [adventureChildId, setAdventureChildId] = useState<string | null>(() => {
    if (!adventureMapEnabled) return null;
    const raw = import.meta.env.VITE_DIAG_CHILD_ID as string | undefined;
    const id = raw?.trim().toLowerCase();
    return id || null;
  });

  const [activeNodeScreen, setActiveNodeScreen] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Derived — no state, no effects.
  const karaokeReadingActive =
    voiceState.phase === "active" &&
    voiceState.canvas.mode === "karaoke" &&
    (voiceState.canvas.karaokeWords?.length ?? 0) > 0 &&
    !voiceState.karaokeStoryComplete;

  const companionMuted = karaokeReadingActive;

  // When a voice error arrives while the map is visible, clear the stored child ID
  // so the picker error UI can surface. The derived effectiveChildId is already null
  // in the same render; this effect cleans up the stored value for future renders.
  useEffect(() => {
    if (adventureMapEnabled && adventureChildId && voiceState.error) {
      setAdventureChildId(null);
    }
  }, [adventureMapEnabled, adventureChildId, voiceState.error]);

  // Derived: suppress child ID display while an error is active.
  const effectiveChildId =
    adventureMapEnabled && voiceState.error ? null : adventureChildId;

  // Derived: activeNodeScreen is only meaningful when a child is on the map.
  const effectiveNodeScreen = effectiveChildId ? activeNodeScreen : null;

  const activeProfileChildId =
    effectiveChildId ??
    (voiceState.phase === "active"
      ? (voiceState.childName?.trim().toLowerCase() ?? null)
      : null);

  return {
    adventureChildId: effectiveChildId,
    setAdventureChildId,
    activeNodeScreen: effectiveNodeScreen,
    setActiveNodeScreen,
    karaokeReadingActive,
    companionMuted,
    activeProfileChildId,
  };
}
