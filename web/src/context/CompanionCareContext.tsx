import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  CompanionCareAnimationIntent,
  CompanionCareView,
} from "../../../src/shared/companionCareTypes";
import type { TamagotchiState } from "../../../src/shared/vrrTypes";
import {
  getCompanionCareFromProfile,
  type CompanionCareProfileLike,
} from "../utils/companionCareProfile";
import {
  deriveCompanionBehavior,
  type CompanionBehavior,
} from "./companionCareBehavior";

export interface CompanionCareContextValue {
  care: CompanionCareView | null;
  behavior: CompanionBehavior;
  feed: (itemId: string) => Promise<void>;
  isFeeding: boolean;
  lastFeedAnimation: CompanionCareAnimationIntent | null;
  lastFeedEventId: string | null;
  error: string | null;
}

export interface CompanionCareFeedEvent {
  type: "companion_care_event";
  childId: string;
  itemId: string;
  animation: CompanionCareAnimationIntent | null;
  animationEventId: string | null;
  companionCare: CompanionCareView | null;
  preview: boolean;
}

interface CompanionCareProviderProps {
  childId: string | null;
  profile?: CompanionCareProfileLike | null;
  children: ReactNode;
  onCareChange?: (care: CompanionCareView) => void;
  onTamagotchiChange?: (tamagotchi: TamagotchiState) => void;
  onCurrencyChange?: (coins: number) => void;
  onFeedEvent?: (event: CompanionCareFeedEvent) => void;
}

const CompanionCareContext = createContext<CompanionCareContextValue | null>(null);

export function CompanionCareProvider({
  childId,
  profile,
  children,
  onCareChange,
  onTamagotchiChange,
  onCurrencyChange,
  onFeedEvent,
}: CompanionCareProviderProps) {
  const profileCare = getCompanionCareFromProfile(profile);
  const [care, setCare] = useState<CompanionCareView | null>(profileCare);
  const [isFeeding, setIsFeeding] = useState(false);
  const [lastFeedAnimation, setLastFeedAnimation] =
    useState<CompanionCareAnimationIntent | null>(null);
  const [lastFeedEventId, setLastFeedEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const feedEventSeqRef = useRef(0);
  const careIdentityRef = useRef<string | null>(
    profileCare ? `${profileCare.childId}:${profileCare.companionId}` : null,
  );

  useEffect(() => {
    const nextIdentity = profileCare
      ? `${profileCare.childId}:${profileCare.companionId}`
      : null;
    const identityChanged = careIdentityRef.current !== nextIdentity;
    careIdentityRef.current = nextIdentity;
    setCare(profileCare);
    if (identityChanged) {
      setLastFeedAnimation(null);
      setLastFeedEventId(null);
    }
    setError(null);
  }, [profileCare]);

  const feed = useCallback(
    async (itemId: string) => {
      const resolvedChildId = childId?.trim();
      if (!resolvedChildId) return;
      setIsFeeding(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/profile/${encodeURIComponent(resolvedChildId)}/companion-care/feed`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId }),
          },
        );
        if (!response.ok) {
          throw new Error(`feed ${response.status}`);
        }
        const data = (await response.json()) as {
          companionCare?: CompanionCareView;
          tamagotchi?: TamagotchiState;
          companionCurrency?: number;
          animation?: CompanionCareAnimationIntent;
          preview?: boolean;
        };
        const nextCare = data.companionCare ?? care;
        if (data.companionCare) {
          setCare(data.companionCare);
          onCareChange?.(data.companionCare);
        }
        if (data.tamagotchi) {
          onTamagotchiChange?.(data.tamagotchi);
        }
        if (typeof data.companionCurrency === "number") {
          onCurrencyChange?.(Math.max(0, Math.floor(data.companionCurrency)));
        }
        setLastFeedAnimation(data.animation ?? null);
        let animationEventId: string | null = null;
        if (data.animation) {
          feedEventSeqRef.current += 1;
          animationEventId = `${data.animation.reference}:${data.animation.itemId}:${feedEventSeqRef.current}`;
          setLastFeedEventId(animationEventId);
        } else {
          setLastFeedEventId(null);
        }
        onFeedEvent?.({
          type: "companion_care_event",
          childId: resolvedChildId,
          itemId,
          animation: data.animation ?? null,
          animationEventId,
          companionCare: nextCare,
          preview: data.preview === true,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        console.error("  🔴 [companion-care] feed failed:", err);
      } finally {
        setIsFeeding(false);
      }
    },
    [care, childId, onCareChange, onCurrencyChange, onFeedEvent, onTamagotchiChange],
  );

  const behavior = useMemo(
    () => deriveCompanionBehavior(care, lastFeedAnimation, lastFeedEventId),
    [care, lastFeedAnimation, lastFeedEventId],
  );

  const value = useMemo<CompanionCareContextValue>(
    () => ({
      care,
      behavior,
      feed,
      isFeeding,
      lastFeedAnimation,
      lastFeedEventId,
      error,
    }),
    [behavior, care, error, feed, isFeeding, lastFeedAnimation, lastFeedEventId],
  );

  return (
    <CompanionCareContext.Provider value={value}>
      {children}
    </CompanionCareContext.Provider>
  );
}

export function useCompanionCare(): CompanionCareContextValue {
  const value = useContext(CompanionCareContext);
  if (!value) {
    throw new Error("useCompanionCare must be used inside CompanionCareProvider");
  }
  return value;
}

export function useCompanionCareOptional(): CompanionCareContextValue | null {
  return useContext(CompanionCareContext);
}
