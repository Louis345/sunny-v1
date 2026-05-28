import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useSession } from "./hooks/useSession";
import { useAdventureState } from "./hooks/useAdventureState";
import { ChildPicker } from "./components/ChildPicker";
import { SessionScreen } from "./components/SessionScreen";
import { SessionEnd } from "./components/SessionEnd";
import { SessionLoadingOverlay } from "./components/SessionLoadingOverlay";
import { CanvasTestOverlay } from "./components/CanvasTestPanel";
import { AdventureMap } from "./components/AdventureMap";
import { AdventureBoardExperience } from "./components/AdventureBoardExperience";
import type { GameIframeOverlayState } from "./types/gameIframeOverlay";
import type {
  AdventureBoardNode,
  AdventureChoiceOption,
  AdventureChoiceSet,
} from "../../src/shared/adventureBoardJson";
import type { NodeConfig } from "../../src/shared/adventureTypes";
import { buildNodeLaunchAction } from "../../src/shared/homeworkNodeRouting";
import { CompanionLayer, type CompanionLayerProps } from "./components/CompanionLayer";
import { DiagPanel } from "./components/DiagPanel";
import { KaraokeReadingCanvas } from "./components/KaraokeReadingCanvas";
import { PronunciationGameCanvas } from "./components/PronunciationGameCanvas";
import {
  PostActivityEngagementOverlay,
  type PostActivityOutcome,
} from "./components/PostActivityEngagementOverlay";
import { useMapSession } from "./hooks/useMapSession";
import {
  COMPANION_API_VERSION,
  type CompanionCommand,
} from "../../src/shared/companions/companionContract";
import type {
  CompanionConfig,
  CompanionEventPayload,
} from "../../src/shared/companionTypes";
import type { CompanionCareView } from "../../src/shared/companionCareTypes";
import { mergeCompanionConfigWithDefaults } from "../../src/shared/companionTypes";
import {
  DEFAULT_TAMAGOTCHI,
  getTamagotchiPersonality,
  getTamagotchiSpeechBubble,
  type TamagotchiState,
} from "../../src/shared/vrrTypes";
import { TamagotchiSheet, type TamagotchiSheetProps } from "./components/TamagotchiSheet";
import { RewardDiagOverlay } from "./components/RewardDiagOverlay";
import { RewardTriggerPanel } from "./components/RewardTriggerPanel";
import { isRewardDiagEnabled, type RewardDiagEvent } from "./types/rewardDiag";
import { CompanionShowroomPage } from "./CompanionShowroomPage";
import { WordRadar } from "./components/WordRadar";
import { FlowGameOverlay } from "./components/FlowGameOverlay";
import { DIAG_WORD_RADAR_ITEMS } from "./fixtures/wordRadarDiagItems";
import { getCompanionCareFromProfile } from "./utils/companionCareProfile";
import {
  resolvePlannerBoardChoiceLaunchNode,
  resolvePlannerBoardLaunchNode,
} from "./utils/adventureBoardLaunch";
import {
  buildAdventureBoardChoiceEventInput,
  buildAdventureBoardPostActivityChoiceEventInput,
  postAdventureBoardChoiceEvent,
  type PostActivityChoiceOutcome,
} from "./utils/adventureBoardChoiceEvents";
import {
  buildAdventureBoardGeneratedChoiceLaunchNode,
  buildAdventureBoardGeneratedChoiceRequest,
  type HomeworkRegenerateSuccess,
} from "./utils/adventureBoardGeneratedChoices";
import { useChildExperiencePacket } from "./hooks/useChildExperiencePacket";
import {
  CompanionCareProvider,
  useCompanionCare,
} from "./context/CompanionCareContext";
import { resolveSunnyRuntimeConfig } from "../../src/shared/runtimeConfig";
import type { PostActivityAction } from "../../src/engine/choiceEvents";

const DIAG_READING_TEST_EXCERPT =
  "Chimpanzees are apes. They inhabit steamy rainforests and other parts of Africa. Chimps gather in bands that number from 15 to 150 chimps.";

const DIAG_READING_TEST_WORDS = DIAG_READING_TEST_EXCERPT.split(/\s+/).filter(Boolean);

/** Diag overlay games that suppress companion mic (STT loop risk or reading focus). */
const DIAG_GAMES_SUPPRESS_MIC = new Set<string>([
  "reading",
  "pronunciation",
]);

const DIAG_PRONUNCIATION_WORDS = [
  "blister",
  "carpet",
  "thirteen",
  "orbit",
  "harvest",
  "confirm",
  "interrupt",
  "perfume",
  "hamburger",
  "corner",
  "kindergarten",
  "chimp",
  "inhabit",
  "instruments",
  "band",
];

const isCanvasTestMode =
  import.meta.env.VITE_TEST_MODE === "true" ||
  (typeof window !== "undefined" &&
    window.location.search.includes("testmode"));

const adventureMapEnabled = true;

function resolveMapPreviewMode(): false | "free" | "go-live" {
  if (typeof window !== "undefined") {
    const p = new URLSearchParams(window.location.search).get("preview");
    if (p === "free" || p === "go-live") return p;
  }
  const runtime = resolveSunnyRuntimeConfig(import.meta.env as Record<string, string>);
  const v =
    runtime.previewMode === "off"
      ? import.meta.env.VITE_PREVIEW_MODE
      : runtime.previewMode;
  if (v === "free" || v === "go-live") return v;
  if (import.meta.env.VITE_PREVIEW_MODE === "true") return "free";
  return false;
}

const mapPreviewMode = resolveMapPreviewMode();
const runtimeConfig = resolveSunnyRuntimeConfig(import.meta.env as Record<string, string>);
const mapInspectAllMode = runtimeConfig.nodeAccess === "inspect-all";

function childNameFromId(childId: string | null): string {
  if (!childId) return "Sunny";
  return childId.charAt(0).toUpperCase() + childId.slice(1);
}

function CompanionLayerWithCare(props: CompanionLayerProps) {
  const companionCare = useCompanionCare();
  return (
    <CompanionLayer
      {...props}
      companionCare={companionCare.care}
      companionBehavior={companionCare.behavior}
    />
  );
}

function TamagotchiSheetWithCare(
  props: Omit<
    TamagotchiSheetProps,
    "companionCare" | "onFeed" | "isFeeding"
  >,
) {
  const companionCare = useCompanionCare();
  return (
    <TamagotchiSheet
      {...props}
      companionCare={companionCare.care ?? undefined}
      onFeed={(itemId) => {
        void companionCare.feed(itemId);
      }}
      isFeeding={companionCare.isFeeding}
    />
  );
}

function shouldUseSessionLoadingOverlay(): boolean {
  if (import.meta.env.VITE_MODE === "intro") return false;
  if (import.meta.env.VITE_MODE === "diag") return false;
  if (diagMapPanelEnabled) return false;
  if (import.meta.env.VITE_REWARD_DIAG === "true") return false;
  if (import.meta.env.VITE_COMPANION_DIAG === "true") return false;
  if (import.meta.env.VITE_DIAG_READING === "true") return false;
  if (import.meta.env.VITE_DIAG_PRONUNCIATION === "true") return false;
  return true;
}

function HomeworkBoardUnavailable(props: {
  childName: string;
  error: string | null;
}): ReactNode {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-zinc-950 text-white">
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-white/15 bg-white/10 p-6 text-center shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-200">
            Adventure board unavailable
          </p>
          <h1 className="mt-2 text-2xl font-black">
            {props.childName}'s new board is not ready yet.
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/75">
            Run homework ingestion again so Sunny can load a validated JSON
            adventure board instead of falling back to the legacy map.
          </p>
          {props.error ? (
            <p className="mt-4 rounded-md bg-black/30 px-3 py-2 text-xs text-white/65">
              {props.error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function usePreloadedImages(urls: Array<string | null | undefined>, enabled: boolean): boolean {
  const key = [
    ...new Set(
      urls.filter((url): url is string => typeof url === "string" && url.trim().length > 0),
    ),
  ]
    .sort()
    .join("|");
  const stableUrls = useMemo(() => (key ? key.split("|") : []), [key]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoadedKey(null);
      return;
    }
    if (stableUrls.length === 0) {
      setLoadedKey(key);
      return;
    }
    let cancelled = false;
    let remaining = stableUrls.length;
    setLoadedKey(null);
    const finishOne = () => {
      remaining -= 1;
      if (!cancelled && remaining <= 0) {
        setLoadedKey(key);
        console.log(" 🎮 [loading-screen] assets ready", { count: stableUrls.length });
      }
    };
    const imgs = stableUrls.map((url) => {
      const img = new Image();
      img.onload = finishOne;
      img.onerror = finishOne;
      img.src = url;
      return img;
    });
    return () => {
      cancelled = true;
      for (const img of imgs) {
        img.onload = null;
        img.onerror = null;
      }
    };
  }, [enabled, key, stableUrls]);

  return enabled && loadedKey === key;
}

type RewardDiagQueued = RewardDiagEvent & { diagId: string };

function createRewardDiagWebSocketConstructor(
  Original: typeof WebSocket,
  forwardMessageRef: MutableRefObject<(ev: MessageEvent) => void>,
): typeof WebSocket {
  class PatchedWebSocket extends Original {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener("message", (ev: MessageEvent) => {
        forwardMessageRef.current(ev);
      });
    }
  }
  return PatchedWebSocket as unknown as typeof WebSocket;
}

function RewardDiagBridge() {
  const [events, setEvents] = useState<RewardDiagQueued[]>([]);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const forwardMessageRef = useRef<(ev: MessageEvent) => void>(() => {});

  useLayoutEffect(() => {
    forwardMessageRef.current = (ev: MessageEvent) => {
      try {
        const raw = JSON.parse(String(ev.data)) as Record<string, unknown>;
        const t = raw.type;
        if (t !== "reward" && t !== "progression" && t !== "progression_end") {
          return;
        }
        const rest = { ...raw };
        delete rest.type;
        const diagId = crypto.randomUUID();
        const entry: RewardDiagQueued = {
          diagId,
          timestamp: Date.now(),
          type: t as RewardDiagQueued["type"],
          payload: rest,
        };
        setEvents((prev) => [entry, ...prev].slice(0, 20));
        const tid = setTimeout(() => {
          timersRef.current.delete(tid);
          setEvents((prev) => prev.filter((e) => e.diagId !== diagId));
        }, 8000);
        timersRef.current.add(tid);
      } catch {
        /* ignore invalid JSON */
      }
    };
  });

  useEffect(() => {
    const Original = window.WebSocket;
    const W = createRewardDiagWebSocketConstructor(Original, forwardMessageRef);
    window.WebSocket = W;
    const timerSet = timersRef.current;

    return () => {
      window.WebSocket = Original;
      for (const t of [...timerSet]) {
        clearTimeout(t);
      }
      timerSet.clear();
    };
  }, []);

  useEffect(() => {
    const onPush = (e: Event) => {
      const ce = e as CustomEvent<RewardDiagEvent>;
      const d = ce.detail;
      if (
        !d ||
        (d.type !== "reward" &&
          d.type !== "progression" &&
          d.type !== "progression_end")
      ) {
        return;
      }
      const diagId = crypto.randomUUID();
      const entry: RewardDiagQueued = {
        diagId,
        timestamp: typeof d.timestamp === "number" ? d.timestamp : Date.now(),
        type: d.type,
        payload:
          d.payload && typeof d.payload === "object"
            ? (d.payload as Record<string, unknown>)
            : {},
      };
      setEvents((prev) => [entry, ...prev].slice(0, 20));
      const tid = setTimeout(() => {
        timersRef.current.delete(tid);
        setEvents((prev) => prev.filter((x) => x.diagId !== diagId));
      }, 8000);
      timersRef.current.add(tid);
    };
    window.addEventListener("sunny-reward-diag-push", onPush);
    return () => window.removeEventListener("sunny-reward-diag-push", onPush);
  }, []);

  return <RewardDiagOverlay events={events} />;
}

const diagMapPanelEnabled =
  import.meta.env.VITE_ADVENTURE_MAP === "true" &&
  import.meta.env.VITE_DIAG_CHILD_ID?.trim().toLowerCase() === "creator";

function companionEventDedupeKey(p: CompanionEventPayload): string {
  const trig = p.trigger ?? "";
  const em = p.emote ?? "";
  return `${p.timestamp}|${p.childId.trim().toLowerCase()}|${em}|${trig}`;
}

function mergeCompanionEvents(
  voice: CompanionEventPayload[],
  map: CompanionEventPayload[],
): CompanionEventPayload[] {
  const seen = new Set<string>();
  const out: CompanionEventPayload[] = [];
  for (const p of [...voice, ...map]) {
    const k = companionEventDedupeKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

function companionCommandDedupeKey(c: CompanionCommand): string {
  return `${c.timestamp}|${c.childId.trim().toLowerCase()}|${c.type}|${JSON.stringify(c.payload)}`;
}

function mergeCompanionCommands(
  voice: CompanionCommand[],
  map: CompanionCommand[],
): CompanionCommand[] {
  const seen = new Set<string>();
  const out: CompanionCommand[] = [];
  for (const p of [...voice, ...map]) {
    const k = companionCommandDedupeKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

function plannerActivityTitle(node: NodeConfig): string {
  return node.type
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeAccuracy(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value > 1 ? value / 100 : value;
}

function plannerOutcomeFromResult(result: Record<string, unknown>): PostActivityOutcome {
  return {
    completed: result.completed !== false,
    accuracy: normalizeAccuracy(result.accuracy),
    activePlayTimeMs:
      typeof result.timeSpent_ms === "number"
        ? result.timeSpent_ms
        : typeof result.timeSurvivedMs === "number"
          ? result.timeSurvivedMs
          : undefined,
    frustrationScore:
      typeof result.frustrationScore === "number"
        ? result.frustrationScore
        : result.completed === false
          ? 0.7
          : 0.1,
  };
}

function plannerStatsFromResult(result: Record<string, unknown>): Array<{ label: string; value: string | number }> {
  const stats: Array<{ label: string; value: string | number }> = [];
  const accuracy = normalizeAccuracy(result.accuracy);
  if (accuracy != null) stats.push({ label: "accuracy", value: `${Math.round(accuracy * 100)}%` });
  const attempted =
    typeof result.wordsAttempted === "number"
      ? result.wordsAttempted
      : Array.isArray(result.targetResults)
        ? result.targetResults.length
        : undefined;
  if (attempted != null) stats.push({ label: "attempts", value: attempted });
  const time =
    typeof result.timeSpent_ms === "number"
      ? result.timeSpent_ms
      : typeof result.timeSurvivedMs === "number"
        ? result.timeSurvivedMs
        : undefined;
  if (time != null) stats.push({ label: "time", value: `${Math.round(time / 1000)}s` });
  return stats;
}

function choiceOutcomeFromOverlay(outcome: PostActivityOutcome): PostActivityChoiceOutcome {
  return {
    completed: outcome.completed,
    ...(typeof outcome.accuracy === "number" ? { accuracy: outcome.accuracy } : {}),
    ...(typeof outcome.activePlayTimeMs === "number"
      ? { activePlayTime_ms: outcome.activePlayTimeMs }
      : {}),
    ...(typeof outcome.frustrationScore === "number"
      ? { frustrationScore: outcome.frustrationScore }
      : {}),
  };
}

function App() {
  const adventureGameIframeRef = useRef<HTMLIFrameElement | null>(null);
  const theaterLoadingEnabled = shouldUseSessionLoadingOverlay();
  const gateCompanionAudioUntilCurtainRef = useRef(false);
  const {
    state,
    startSession,
    bargeIn,
    endSession,
    resetToPicker,
    sendCanvasDone,
    submitWorksheetAnswer,
    handleOverlayFieldChange,
    sendMessage,
    micMuted,
    toggleMicMute,
    registerMapNodeType,
    companionEvents: voiceCompanionEvents,
    companionCommands: voiceCompanionCommands,
    analyserNodeRef,
    releaseCompanionAudioPlayback,
  } = useSession({
    adventureGameIframeRef,
    gateCompanionAudioUntilCurtainRef,
  });

  const [profileCompanion, setProfileCompanion] = useState<CompanionConfig | null>(
    null,
  );
  const [profileAvatarImagePath, setProfileAvatarImagePath] = useState<string | null>(
    null,
  );
  const [profileTamagotchi, setProfileTamagotchi] = useState<TamagotchiState | null>(
    null,
  );
  const [profileCompanionCare, setProfileCompanionCare] =
    useState<CompanionCareView | null>(null);
  /** False until `/api/profile` completes for `activeProfileChildId` — avoids flashing DEFAULT care meters. */
  const [tamagotchProfileReady, setTamagotchProfileReady] = useState(false);
  const [profileCompanionCurrency, setProfileCompanionCurrency] = useState(0);
  const [profileReloadNonce, setProfileReloadNonce] = useState(0);
  const [profileWordRadar, setProfileWordRadar] = useState<{
    showTimer: boolean;
    timerSeconds?: number;
    showKeyboard: boolean;
    personalBests: Record<string, number>;
    inputMode: "whole-word" | "letter-by-letter" | "keyboard";
  } | null>(null);
  const [profileReinforceWords, setProfileReinforceWords] = useState<
    string[] | null
  >(null);
  const [profileDyslexiaMode, setProfileDyslexiaMode] = useState(false);
  const [wordRadarDiagOpen, setWordRadarDiagOpen] = useState(false);
  const [diagWordleUrl, setDiagWordleUrl] = useState<string | null>(null);
  const [diagWheelUrl, setDiagWheelUrl] = useState<string | null>(null);
  const [diagFlowGameOpen, setDiagFlowGameOpen] = useState<
    "reading" | "pronunciation" | "word-radar" | "wordle" | "wheel-of-fortune" | null
  >(null);
  const [pendingDiagFlowGame, setPendingDiagFlowGame] = useState<
    "reading" | "pronunciation" | "word-radar" | "wordle" | "wheel-of-fortune" | null
  >(null);
  const [diagGameRestartRequested, setDiagGameRestartRequested] = useState(false);
  const lastDiagLaunchEventRef = useRef<string | null>(null);
  const [companionSheetOpen, setCompanionSheetOpen] = useState(false);
  const [diagCompanionCommands, setDiagCompanionCommands] = useState<
    CompanionCommand[]
  >([]);
  const [mapGameOverlay, setMapGameOverlay] = useState<GameIframeOverlayState>({
    active: false,
    iframe: null,
    url: null,
  });
  const [plannerBoardLaunch, setPlannerBoardLaunch] = useState<{
    node: NodeConfig;
    iframeUrl: string | null;
    replayNonce: number;
  } | null>(null);
  const [postActivityEngagement, setPostActivityEngagement] = useState<{
    node: NodeConfig;
    outcome: PostActivityOutcome;
    title: string;
    stats: Array<{ label: string; value: string | number }>;
    canTryHarder: boolean;
  } | null>(null);
  const plannerBoardIframeCompletionKeyRef = useRef<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [selectedChildName, setSelectedChildName] = useState<string | null>(null);
  const [loadingSafetyReleased, setLoadingSafetyReleased] = useState(false);
  const autoStartedAdventureVoiceRef = useRef<string | null>(null);

  const {
    adventureChildId,
    setAdventureChildId,
    activeNodeScreen,
    setActiveNodeScreen,
    karaokeReadingActive,
    companionMuted,
    activeProfileChildId,
  } = useAdventureState(state, adventureMapEnabled);

  gateCompanionAudioUntilCurtainRef.current =
    theaterLoadingEnabled && Boolean(adventureChildId);

  const effectiveCompanion = activeProfileChildId ? profileCompanion : null;
  const activeProfileIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeProfileIdRef.current = activeProfileChildId ?? null;
  }, [activeProfileChildId]);

  const plannerBoardRuntimeRequested =
    adventureMapEnabled &&
    runtimeConfig.subject === "homework" &&
    Boolean(adventureChildId);

  useEffect(() => {
    if (!adventureMapEnabled || !adventureChildId) {
      autoStartedAdventureVoiceRef.current = null;
      return;
    }
    if (state.phase !== "picker") return;
    if (plannerBoardRuntimeRequested) {
      setSelectedChildName(childNameFromId(adventureChildId));
      return;
    }
    if (autoStartedAdventureVoiceRef.current === adventureChildId) return;
    autoStartedAdventureVoiceRef.current = adventureChildId;
    setSelectedChildName(childNameFromId(adventureChildId));
    startSession(childNameFromId(adventureChildId));
  }, [
    adventureChildId,
    adventureMapEnabled,
    plannerBoardRuntimeRequested,
    startSession,
    state.phase,
  ]);

  /** Tamagotchi quips are suppressed on the adventure map — companion speaks via voice only. */
  const companionBubbleText = useMemo(() => {
    if (!adventureChildId) return null;
    if (adventureMapEnabled) return null;
    if (!tamagotchProfileReady) return null;
    const t = profileTamagotchi ?? DEFAULT_TAMAGOTCHI;
    return getTamagotchiSpeechBubble(getTamagotchiPersonality(t, false));
  }, [
    adventureChildId,
    adventureMapEnabled,
    profileTamagotchi,
    tamagotchProfileReady,
  ]);

  const plannerBoardPacketState = useChildExperiencePacket(
    adventureChildId,
    plannerBoardRuntimeRequested,
  );
  const plannerBoardPacket =
    plannerBoardPacketState.packet?.activeSessionPlan?.adventureBoard
      ? plannerBoardPacketState.packet
      : null;
  const homeworkBoardUnavailable =
    plannerBoardRuntimeRequested &&
    !plannerBoardPacketState.loading &&
    !plannerBoardPacket;
  const plannerBoardRuntimeActive =
    plannerBoardRuntimeRequested &&
    (plannerBoardPacketState.loading || Boolean(plannerBoardPacket));

  const [vrrCelebrateEvent, setVrrCelebrateEvent] =
    useState<CompanionEventPayload | null>(null);

  useEffect(() => {
    if (!vrrCelebrateEvent) return;
    const id = window.setTimeout(() => setVrrCelebrateEvent(null), 8000);
    return () => window.clearTimeout(id);
  }, [vrrCelebrateEvent]);

  useEffect(() => {
    if (adventureChildId) return;
    startTransition(() => {
      setCompanionSheetOpen(false);
    });
  }, [adventureChildId]);

  const mapSession = useMapSession(
    adventureMapEnabled && adventureChildId && !plannerBoardRuntimeRequested
      ? adventureChildId
      : "",
    mapPreviewMode,
    mapInspectAllMode,
    runtimeConfig.homeworkDomain,
  );

  const prevMapProgRef = useRef<string | null>(null);
  const lastSessionCompleteTsRef = useRef<number | null>(null);
  const profileMapProgressKey = `${mapSession.mapState?.xp ?? ""}:${mapSession.mapState?.level ?? ""}:${(mapSession.mapState?.completedNodes ?? []).join(",")}`;

  const mapReady =
    !adventureChildId ||
    plannerBoardRuntimeActive ||
    (mapSession.sessionStarted && (mapSession.mapState?.nodes.length ?? 0) > 0);
  const voiceReady =
    !adventureChildId ||
    !theaterLoadingEnabled ||
    (state.sessionBootReady && state.firstAudioChunkReceived);
  const profileReady = !activeProfileChildId || profileCompanion !== null;
  const themeImageUrls = [
    profileAvatarImagePath,
    mapSession.mapState?.theme.backgroundUrl,
    mapSession.mapState?.theme.castleUrl,
    ...Object.values(mapSession.mapState?.theme.nodeThumbnails ?? {}),
  ];
  const imagesReady = usePreloadedImages(
    themeImageUrls,
    theaterLoadingEnabled && !!adventureChildId && mapReady && profileReady,
  );
  const loadingAssetsReady =
    !adventureChildId || !theaterLoadingEnabled || (profileReady && imagesReady);

  const onLockedMapNodeTap = useCallback(
    (node: NodeConfig) => {
      const currentUnlockedNode = mapSession.mapState?.nodes.find(
        (candidate) => !candidate.isLocked && !candidate.isCompleted,
      );
      sendMessage("locked_node_tap", {
        childId: adventureChildId,
        nodeId: node.id,
        nodeType: node.type,
        currentUnlockedNodeId: currentUnlockedNode?.id,
      });
    },
    [adventureChildId, mapSession.mapState?.nodes, sendMessage],
  );

  useEffect(() => {
    setSessionReady(false);
    setLoadingSafetyReleased(false);
  }, [adventureChildId]);

  const handleMapLoadingCurtainOpen = useCallback(() => {
    setSessionReady(true);
    releaseCompanionAudioPlayback();
  }, [releaseCompanionAudioPlayback]);

  useEffect(() => {
    if (sessionReady) return;
    if (adventureMapEnabled && adventureChildId && theaterLoadingEnabled) {
      return;
    }
    if (mapReady && ((voiceReady && loadingAssetsReady) || loadingSafetyReleased)) {
      setSessionReady(true);
      releaseCompanionAudioPlayback();
      console.log(" 🎮 [loading-screen] curtain lift ready", {
        safetyReleased: loadingSafetyReleased,
      });
    }
  }, [
    adventureChildId,
    adventureMapEnabled,
    loadingAssetsReady,
    loadingSafetyReleased,
    mapReady,
    releaseCompanionAudioPlayback,
    sessionReady,
    theaterLoadingEnabled,
    voiceReady,
  ]);

  const activeVoiceGameNodeType =
    diagFlowGameOpen === "reading"
      ? "karaoke"
      : diagFlowGameOpen === "wordle"
        ? null
        : diagFlowGameOpen ?? plannerBoardLaunch?.node.type ?? mapSession.launchedNode?.type ?? null;

  useEffect(() => {
    registerMapNodeType(activeVoiceGameNodeType);
  }, [
    activeVoiceGameNodeType,
    plannerBoardLaunch?.node.id,
    mapSession.launchedNode?.id,
    registerMapNodeType,
  ]);

  useEffect(() => {
    if (
      state.phase !== "active" ||
      (diagFlowGameOpen !== "wordle" && diagFlowGameOpen !== "wheel-of-fortune")
    ) {
      lastDiagLaunchEventRef.current = null;
      return;
    }
    const game =
      diagFlowGameOpen === "wheel-of-fortune" ? "Wheel of Fortune" : "Wordle";
    const currentWord =
      diagFlowGameOpen === "wheel-of-fortune" ? "inventor" : "farmer";
    const key = `${diagFlowGameOpen}:${currentWord}:${state.phase}`;
    if (lastDiagLaunchEventRef.current === key) return;
    lastDiagLaunchEventRef.current = key;
    sendMessage("game_event", {
      event: {
        type: "game_state_update",
        version: "1.0",
        payload: {
          game,
          phase: "launched",
          currentWord,
          progress: `${game} diagnostic launched.`,
          childId: "creator",
        },
      },
    });
  }, [diagFlowGameOpen, sendMessage, state.phase]);

  const startDiagGameMicSession = useCallback(() => {
    startSession("creator", {
      diagKiosk: true,
      silentTts: true,
      sttOnly: true,
    });
  }, [startSession]);

  const openDiagFlowGame = useCallback(
    (mode: "reading" | "pronunciation" | "word-radar" | "wordle" | "wheel-of-fortune") => {
      setDiagFlowGameOpen(mode);
      setWordRadarDiagOpen(mode === "word-radar");
      setPendingDiagFlowGame(mode);
      if (mode === "wordle") {
        const cid = (
          activeProfileChildId ??
          adventureChildId ??
          "creator"
        ).toLowerCase();
        const comp = effectiveCompanion?.companionId ?? "elli";
        const action = buildNodeLaunchAction(
          {
            id: "diag-wordle-app",
            type: "wordle",
            words: ["farmer"],
            difficulty: 2,
          },
          {
            childId: cid,
            companion: comp,
            isDiagMode: true,
            /** Live _contract.js bridge so game_state_update reaches the voice session (not preview=free). */
            iframePreviewParam: "go-live",
          },
        );
        if (action.kind === "iframe") {
          setDiagWordleUrl(action.url);
        } else {
          setDiagWordleUrl(null);
        }
      } else if (mode === "wheel-of-fortune") {
        const cid = (
          activeProfileChildId ??
          adventureChildId ??
          "creator"
        ).toLowerCase();
        const comp = effectiveCompanion?.companionId ?? "elli";
        const action = buildNodeLaunchAction(
          {
            id: "diag-wof-app",
            type: "wheel-of-fortune",
            words: ["inventor"],
            difficulty: 2,
          },
          {
            childId: cid,
            companion: comp,
            isDiagMode: true,
            /** Live _contract.js bridge so game_state_update reaches the voice session (not preview=free). */
            iframePreviewParam: "go-live",
            companionCurrency:
              mapSession.liveMapCurrency ?? profileCompanionCurrency,
          },
        );
        if (action.kind === "iframe") {
          setDiagWheelUrl(action.url);
        } else {
          setDiagWheelUrl(null);
        }
      } else {
        setDiagWordleUrl(null);
        setDiagWheelUrl(null);
      }
      if (state.phase === "active" && state.diagGameSessionReady) {
        setPendingDiagFlowGame(null);
        return;
      }
      if (state.phase === "active") {
        setDiagGameRestartRequested(true);
        endSession();
        return;
      }
      if (state.phase !== "connecting") {
        if (mode === "wheel-of-fortune") {
          startSession("creator", {
            diagKiosk: true,
            silentTts: false,
            sttOnly: false,
          });
        } else {
          startDiagGameMicSession();
        }
      }
    },
    [
      activeProfileChildId,
      adventureChildId,
      effectiveCompanion?.companionId,
      mapSession.liveMapCurrency,
      profileCompanionCurrency,
      endSession,
      startDiagGameMicSession,
      startSession,
      state.diagGameSessionReady,
      state.phase,
    ],
  );

  useEffect(() => {
    if (!pendingDiagFlowGame || !diagGameRestartRequested) return;
    if (state.phase === "active" || state.phase === "connecting") return;
    setDiagGameRestartRequested(false);
    startDiagGameMicSession();
  }, [
    diagGameRestartRequested,
    pendingDiagFlowGame,
    startDiagGameMicSession,
    state.phase,
  ]);

  useEffect(() => {
    if (!pendingDiagFlowGame) return;
    if (state.phase !== "active" || !state.diagGameSessionReady) return;
    setPendingDiagFlowGame(null);
  }, [pendingDiagFlowGame, state.diagGameSessionReady, state.phase]);

  const closeDiagFlowGame = useCallback(() => {
    setDiagFlowGameOpen(null);
    setWordRadarDiagOpen(false);
    setDiagWordleUrl(null);
    setDiagWheelUrl(null);
    setPendingDiagFlowGame(null);
    setDiagGameRestartRequested(false);
  }, []);

  const closePlannerBoardLaunch = useCallback(() => {
    setPlannerBoardLaunch(null);
    setPostActivityEngagement(null);
    plannerBoardIframeCompletionKeyRef.current = null;
  }, []);

  useEffect(() => {
    setPlannerBoardLaunch(null);
  }, [adventureChildId, plannerBoardPacket?.activeSessionPlan?.planId]);

  const launchPlannerBoardNode = useCallback(
    (node: NodeConfig) => {
      const companionConfig =
        plannerBoardPacket?.childChart.companion.config ?? effectiveCompanion;
      const companionId =
        companionMuted ? "off" : companionConfig?.companionId ?? "elli";
      const companionName =
        plannerBoardPacket?.childChart.companion.displayName ??
        (companionId === "off"
          ? "Companion"
          : companionId.charAt(0).toUpperCase() + companionId.slice(1));
      const action = buildNodeLaunchAction(node, {
        childId: adventureChildId ?? node.id,
        childName:
          plannerBoardPacket?.childChart.identity.displayName ??
          (adventureChildId ? childNameFromId(adventureChildId) : undefined),
        companion: companionId,
        companionName,
        isDiagMode:
          mapPreviewMode === "free" ||
          mapPreviewMode === "go-live" ||
          adventureChildId === "creator",
        iframePreviewParam:
          mapPreviewMode === "free"
            ? "free"
            : mapPreviewMode === "go-live"
              ? "go-live"
              : "false",
        vrmUrl: companionConfig?.vrmUrl,
        companionMuted,
        companionCurrency:
          mapSession.liveMapCurrency ?? profileCompanionCurrency,
        dyslexiaMode: profileDyslexiaMode,
      });

      console.log(" 🎮 [AdventureBoard] node_launch_action", {
        childId: adventureChildId,
        nodeId: node.id,
        nodeType: node.type,
        kind: action.kind,
      });
      if (action.kind === "skip") {
        console.warn(" 🎮 [AdventureBoard] node_launch_skip", {
          nodeId: node.id,
          nodeType: node.type,
          reason: action.reason,
        });
        return;
      }
      setPostActivityEngagement(null);
      plannerBoardIframeCompletionKeyRef.current = null;
      setPlannerBoardLaunch({
        node,
        iframeUrl: action.kind === "iframe" ? action.url : null,
        replayNonce: 0,
      });
    },
    [
      adventureChildId,
      companionMuted,
      effectiveCompanion,
      mapSession.liveMapCurrency,
      plannerBoardPacket,
      profileCompanionCurrency,
      profileDyslexiaMode,
    ],
  );

  const handlePlannerBoardNodeClick = useCallback(
    (boardNode: AdventureBoardNode) => {
      if (!plannerBoardPacket) return;
      const launchNode = resolvePlannerBoardLaunchNode(plannerBoardPacket, boardNode);
      if (!launchNode) {
        console.log(" 🎮 [AdventureBoard] node_not_launchable", {
          childId: adventureChildId,
          nodeId: boardNode.id,
          kind: boardNode.kind,
          action: boardNode.action?.type,
        });
        return;
      }
      launchPlannerBoardNode(launchNode);
    },
    [adventureChildId, launchPlannerBoardNode, plannerBoardPacket],
  );

  const handlePlannerBoardChoiceClick = useCallback(
    (option: AdventureChoiceOption, choiceSet: AdventureChoiceSet) => {
      if (!plannerBoardPacket) return;
      const choiceEvent = buildAdventureBoardChoiceEventInput(
        plannerBoardPacket,
        choiceSet,
        option,
      );
      void postAdventureBoardChoiceEvent(choiceEvent, { preview: mapPreviewMode })
        .then((out) => {
          console.log(" 🎮 [AdventureBoard] choice_event", {
            childId: adventureChildId,
            choiceSetId: choiceEvent.choiceSetId,
            selectedOptionId: choiceEvent.selectedOptionId,
            skippedOptionIds: choiceEvent.skippedOptionIds,
            applied: out.applied,
            skippedPersistence: out.skippedPersistence,
          });
        })
        .catch((err: unknown) => {
          console.warn(" 🎮 [AdventureBoard] choice_event_failed", {
            childId: adventureChildId,
            choiceSetId: choiceEvent.choiceSetId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      const generatedChoiceRequest = buildAdventureBoardGeneratedChoiceRequest(
        plannerBoardPacket,
        choiceSet,
        option,
      );
      if (generatedChoiceRequest) {
        void fetch("/api/homework/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(generatedChoiceRequest),
        })
          .then(async (response) => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok || body?.ok !== true) {
              throw new Error(body?.error ?? `regenerate_http_${response.status}`);
            }
            const launchNode = buildAdventureBoardGeneratedChoiceLaunchNode(
              plannerBoardPacket,
              generatedChoiceRequest,
              body as HomeworkRegenerateSuccess,
            );
            console.log(" 🎮 [AdventureBoard] generated_choice_validated", {
              childId: adventureChildId,
              choiceSetId: choiceSet.id,
              selectedOptionId: option.id,
              nodeId: generatedChoiceRequest.nodeId,
              newFile: body.newFile,
              validationPassed: body.validationReport?.passed,
              runtimeEngine: body.validationReport?.runtimeValidation?.engine,
              runtimeScreenshots: body.validationReport?.runtimeValidation?.screenshotPaths,
            });
            if (!launchNode) return;
            launchPlannerBoardNode(launchNode);
          })
          .catch((err: unknown) => {
            console.warn(" 🎮 [AdventureBoard] generated_choice_failed", {
              childId: adventureChildId,
              choiceSetId: choiceSet.id,
              selectedOptionId: option.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        return;
      }
      const launchNode = resolvePlannerBoardChoiceLaunchNode(plannerBoardPacket, option);
      if (!launchNode) {
        console.log(" 🎮 [AdventureBoard] choice_not_launchable", {
          childId: adventureChildId,
          optionId: option.id,
          nodeId: option.nodeId,
        });
        return;
      }
      launchPlannerBoardNode(launchNode);
    },
    [adventureChildId, launchPlannerBoardNode, mapPreviewMode, plannerBoardPacket],
  );

  const recordPlannerBoardPostActivityAction = useCallback(
    (
      action: PostActivityAction,
      node: NodeConfig,
      outcome: PostActivityOutcome,
    ) => {
      if (!plannerBoardPacket) return;
      const event = buildAdventureBoardPostActivityChoiceEventInput(
        plannerBoardPacket,
        node,
        action,
        choiceOutcomeFromOverlay(outcome),
      );
      void postAdventureBoardChoiceEvent(event, { preview: mapPreviewMode })
        .then((out) => {
          console.log(" 🎮 [AdventureBoard] post_activity_choice_event", {
            childId: adventureChildId,
            nodeId: node.id,
            nodeType: node.type,
            action,
            applied: out.applied,
            skippedPersistence: out.skippedPersistence,
          });
        })
        .catch((err: unknown) => {
          console.warn(" 🎮 [AdventureBoard] post_activity_choice_failed", {
            childId: adventureChildId,
            nodeId: node.id,
            nodeType: node.type,
            action,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    },
    [adventureChildId, mapPreviewMode, plannerBoardPacket],
  );

  const showPlannerBoardEngagementOverlay = useCallback(
    (node: NodeConfig, result: Record<string, unknown>) => {
      const outcome = plannerOutcomeFromResult(result);
      setPostActivityEngagement({
        node,
        outcome,
        title: plannerActivityTitle(node),
        stats: plannerStatsFromResult(result),
        canTryHarder: false,
      });
    },
    [],
  );

  const replayPlannerBoardLaunch = useCallback(() => {
    plannerBoardIframeCompletionKeyRef.current = null;
    setPostActivityEngagement(null);
    setPlannerBoardLaunch((prev) =>
      prev
        ? {
            ...prev,
            replayNonce: prev.replayNonce + 1,
          }
        : prev,
    );
  }, []);

  const handlePlannerBoardPostActivityAction = useCallback(
    (action: PostActivityAction) => {
      const current = postActivityEngagement;
      if (!current) return;
      recordPlannerBoardPostActivityAction(action, current.node, current.outcome);
      if (action === "replay_same" || action === "replay_harder") {
        replayPlannerBoardLaunch();
        return;
      }
      closePlannerBoardLaunch();
    },
    [
      closePlannerBoardLaunch,
      postActivityEngagement,
      recordPlannerBoardPostActivityAction,
      replayPlannerBoardLaunch,
    ],
  );

  const handlePlannerBoardOverlayBack = useCallback(() => {
    const current = postActivityEngagement;
    if (current) {
      recordPlannerBoardPostActivityAction("back_to_map", current.node, current.outcome);
    } else if (plannerBoardLaunch) {
      recordPlannerBoardPostActivityAction("abandon", plannerBoardLaunch.node, {
        completed: false,
        frustrationScore: 0.75,
      });
    }
    closePlannerBoardLaunch();
  }, [
    closePlannerBoardLaunch,
    plannerBoardLaunch,
    postActivityEngagement,
    recordPlannerBoardPostActivityAction,
  ]);

  useEffect(() => {
    if (!plannerBoardLaunch?.iframeUrl) return;
    const launch = plannerBoardLaunch;
    function handleMessage(event: MessageEvent) {
      const iframeWindow = adventureGameIframeRef.current?.contentWindow;
      if (iframeWindow && event.source !== iframeWindow) return;
      const data = event.data as { type?: string; payload?: unknown } | undefined;
      if (!data || typeof data !== "object") return;
      if (data.type !== "node_complete" && data.type !== "game_complete") return;
      const key = `${launch.node.id}:${launch.replayNonce}`;
      if (plannerBoardIframeCompletionKeyRef.current === key) return;
      plannerBoardIframeCompletionKeyRef.current = key;
      const payload =
        data.payload && typeof data.payload === "object" && !Array.isArray(data.payload)
          ? data.payload as Record<string, unknown>
          : data as Record<string, unknown>;
      console.log(" 🎮 [AdventureBoard] iframe_activity_complete", {
        childId: adventureChildId,
        nodeId: launch.node.id,
        nodeType: launch.node.type,
        eventType: data.type,
      });
      showPlannerBoardEngagementOverlay(launch.node, payload);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    adventureChildId,
    plannerBoardLaunch,
    showPlannerBoardEngagementOverlay,
  ]);

  const mergedCompanionEvents = useMemo(() => {
    const base = mergeCompanionEvents(
      voiceCompanionEvents,
      mapSession.companionEvents,
    );
    return vrrCelebrateEvent ? [...base, vrrCelebrateEvent] : base;
  }, [voiceCompanionEvents, mapSession.companionEvents, vrrCelebrateEvent]);

  const mergedCompanionCommands = useMemo(
    () =>
      mergeCompanionCommands(
        mergeCompanionCommands(
          voiceCompanionCommands,
          mapSession.companionCommands,
        ),
        diagCompanionCommands,
      ),
    [
      voiceCompanionCommands,
      mapSession.companionCommands,
      diagCompanionCommands,
    ],
  );

  useEffect(() => {
    prevMapProgRef.current = null;
  }, [adventureChildId]);

  useEffect(() => {
    if (!adventureMapEnabled || !adventureChildId || !activeProfileChildId) {
      return;
    }
    if (prevMapProgRef.current === null) {
      prevMapProgRef.current = profileMapProgressKey;
      return;
    }
    if (prevMapProgRef.current !== profileMapProgressKey) {
      prevMapProgRef.current = profileMapProgressKey;
      setProfileReloadNonce((n) => n + 1);
    }
  }, [
    activeProfileChildId,
    adventureChildId,
    adventureMapEnabled,
    profileMapProgressKey,
  ]);

  useEffect(() => {
    if (!adventureMapEnabled) return;
    const ev = mergedCompanionEvents[mergedCompanionEvents.length - 1];
    if (!ev || ev.trigger !== "session_complete") return;
    if (lastSessionCompleteTsRef.current === ev.timestamp) return;
    lastSessionCompleteTsRef.current = ev.timestamp;
    setProfileReloadNonce((n) => n + 1);
  }, [adventureMapEnabled, mergedCompanionEvents]);

  const handleGameIframeOverlayChange = useCallback(
    (s: GameIframeOverlayState) => {
      setMapGameOverlay(s);
    },
    [],
  );

  const handleGameIframeMount = useCallback(
    (el: HTMLIFrameElement | null) => {
      adventureGameIframeRef.current = el;
    },
    [],
  );

  const handleDiagCamera = useCallback(
    (angle: "close-up" | "mid-shot" | "full-body" | "wide") => {
      setDiagCompanionCommands((prev) => [
        ...prev,
        {
          apiVersion: COMPANION_API_VERSION,
          type: "camera",
          payload: { angle },
          childId: "creator",
          timestamp: Date.now(),
          source: "diag",
        },
      ]);
    },
    [],
  );

  /** Profile + tamagotchi meters: GET /api/profile/:childId → buildProfile (learning_profile tamagotchi + passive depletion). */
  const profileApiChildId =
    adventureMapEnabled && adventureChildId
      ? adventureChildId
      : activeProfileChildId;
  const liveFlowStt = state.interimTranscript || state.gameTranscript;

  useEffect(() => {
    if (!profileApiChildId) {
      setTamagotchProfileReady(false);
      setProfileCompanionCurrency(0);
      setProfileCompanion(null);
      setProfileAvatarImagePath(null);
      setProfileTamagotchi(null);
      setProfileCompanionCare(null);
      setProfileWordRadar(null);
      setProfileReinforceWords(null);
      setProfileDyslexiaMode(false);
      return;
    }
    const cid = profileApiChildId.trim().toLowerCase();
    let cancelled = false;
    fetch(`/api/profile/${encodeURIComponent(profileApiChildId)}`)
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`profile ${r.status}`);
        }
        return r.json() as Promise<{
          companion?: CompanionConfig;
          avatarImagePath?: string | null;
          tamagotchi?: TamagotchiState;
          companionCare?: CompanionCareView;
          care_plan?: {
            companion_care?: CompanionCareView | null;
          } | null;
          companionCurrency?: number;
          dyslexiaMode?: boolean;
          pendingHomework?: { reinforceWords?: unknown };
          wordRadar?: {
            showTimer?: boolean;
            timerSeconds?: number;
            showKeyboard?: boolean;
            personalBests?: Record<string, number>;
            inputMode?: string;
          };
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        if (activeProfileIdRef.current?.trim().toLowerCase() !== cid) return;
        setProfileCompanion(mergeCompanionConfigWithDefaults(data.companion));
        setProfileAvatarImagePath(
          typeof data.avatarImagePath === "string" &&
            data.avatarImagePath.trim().length > 0
            ? data.avatarImagePath.trim()
            : null,
        );
        setProfileTamagotchi(data.tamagotchi ?? null);
        setProfileCompanionCare(getCompanionCareFromProfile(data));
        setTamagotchProfileReady(true);
        const cur =
          typeof data.companionCurrency === "number" && Number.isFinite(data.companionCurrency)
            ? data.companionCurrency
            : Number(data.companionCurrency ?? 0);
        setProfileCompanionCurrency(Math.max(0, Math.floor(cur)));
        setProfileDyslexiaMode(data.dyslexiaMode === true);
        const ph = data.pendingHomework;
        const rw = Array.isArray(ph?.reinforceWords)
          ? ph.reinforceWords.map(String).filter(Boolean)
          : [];
        setProfileReinforceWords(rw);
        const wr = data.wordRadar;
        if (wr && typeof wr === "object") {
          const pb = wr.personalBests;
          const im = wr.inputMode;
          const inputMode: "whole-word" | "letter-by-letter" | "keyboard" =
            im === "letter-by-letter" || im === "keyboard" || im === "whole-word"
              ? im
              : "letter-by-letter";
          setProfileWordRadar({
            showTimer: wr.showTimer === true,
            timerSeconds:
              typeof wr.timerSeconds === "number" && wr.timerSeconds > 0
                ? wr.timerSeconds
                : undefined,
            showKeyboard: wr.showKeyboard === true,
            personalBests:
              pb && typeof pb === "object" && !Array.isArray(pb)
                ? (pb as Record<string, number>)
                : {},
            inputMode,
          });
        } else {
          setProfileWordRadar(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfileCompanion(null);
          setTamagotchProfileReady(false);
          setProfileAvatarImagePath(null);
          setProfileTamagotchi(null);
          setProfileCompanionCare(null);
          setProfileWordRadar(null);
          setProfileReinforceWords(null);
          setProfileDyslexiaMode(false);
          setProfileCompanionCurrency(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profileApiChildId, profileReloadNonce]);

  if (import.meta.env.VITE_MODE === "intro") {
    return <CompanionShowroomPage />;
  }

  const adventureLoadingMain = (
    <div className="w-screen h-screen overflow-hidden relative bg-zinc-950">
      {theaterLoadingEnabled ? (
        <SessionLoadingOverlay
          childName={
            state.childName ??
            selectedChildName ??
            childNameFromId(adventureChildId)
          }
          avatarImagePath={profileAvatarImagePath}
          accentColor={state.companion?.accentColor ?? mapSession.theme?.palette.accent}
          accentBg={state.companion?.accentBg ?? mapSession.theme?.palette.cardBackground}
          voiceReady={voiceReady}
          mapReady={mapReady}
          assetsReady={loadingAssetsReady}
          paletteSeed={`${adventureChildId}:${mapSession.theme?.name ?? "sunny"}`}
          onSafetyRelease={() => {
            if (!mapReady) {
              console.warn(
                ` 🎮 [loading-screen] safety release waiting for ${
                  plannerBoardRuntimeRequested ? "board" : "map"
                }`,
              );
              return;
            }
            setLoadingSafetyReleased(true);
          }}
          onHardRelease={() => {
            setSessionReady(true);
            releaseCompanionAudioPlayback();
          }}
          onCurtainOpen={handleMapLoadingCurtainOpen}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <p
            className="animate-pulse text-3xl font-black tracking-wide"
            style={{ color: "#FFD93D" }}
          >
            Getting ready...
          </p>
        </div>
      )}
    </div>
  );

  let main: ReactNode = null;

  if (adventureMapEnabled && adventureChildId) {
    if (plannerBoardRuntimeRequested) {
      if (plannerBoardPacket) {
        main = (
          <div className="w-screen h-screen overflow-hidden relative bg-zinc-950">
            <AdventureBoardExperience
              packet={plannerBoardPacket}
              showCompanion={false}
              idlePose="center"
              onNodeClick={handlePlannerBoardNodeClick}
              onChoiceClick={handlePlannerBoardChoiceClick}
            />
          </div>
        );
      } else if (plannerBoardPacketState.loading) {
        main = adventureLoadingMain;
      } else {
        // Human-caught invariant: Storybook proves the JSON board can render, but only the live App branch can prove old-board fallback is gone.
        main = (
          <HomeworkBoardUnavailable
            childName={
              state.childName ??
              selectedChildName ??
              childNameFromId(adventureChildId)
            }
            error={
              plannerBoardPacketState.error ??
              (homeworkBoardUnavailable ? "active_adventure_board_required" : null)
            }
          />
        );
      }
    } else if (!sessionReady) {
      main = adventureLoadingMain;
    } else {
    main = (
      <div className="w-screen h-screen overflow-hidden relative bg-zinc-950">
        <AdventureMap
          childId={adventureChildId}
          mapSession={mapSession}
          previewMode={mapPreviewMode}
          inspectAllMode={mapInspectAllMode}
          onLockedNodeTap={onLockedMapNodeTap}
          mapCompanion={effectiveCompanion}
          companionMutedForMap={companionMuted}
          tamagotchi={profileTamagotchi ?? DEFAULT_TAMAGOTCHI}
          companionCare={profileCompanionCare ?? undefined}
          tamagotchHydrated={tamagotchProfileReady}
          onGameIframeMount={handleGameIframeMount}
          onTamagotchiSynced={(t) => setProfileTamagotchi(t)}
          onVrrPhase1Begin={() => {
            const cid = activeProfileChildId?.trim().toLowerCase();
            if (!cid) return;
            setVrrCelebrateEvent({
              childId: cid,
              emote: "celebrating",
              intensity: 1,
              timestamp: Date.now(),
            });
          }}
          onGameIframeOverlayChange={handleGameIframeOverlayChange}
          onActiveNodeScreenChange={setActiveNodeScreen}
          onOpenTamagotchiSheet={
            adventureChildId && activeProfileChildId
              ? () => setCompanionSheetOpen(true)
              : undefined
          }
          karaokeReadingForMapNode={{
            words: state.canvas.karaokeWords ?? [],
            interimTranscript: liveFlowStt,
            sendMessage,
            companion: effectiveCompanion,
            childId: activeProfileChildId ?? undefined,
            backgroundImageUrl: state.canvas.backgroundImageUrl,
            accentColor:
              mapSession.theme?.palette?.accent ?? state.companion?.accentColor,
            cardBackground: mapSession.theme?.palette?.cardBackground,
            fontSize: state.readingCanvas.fontSize,
            lineHeight: state.readingCanvas.lineHeight,
            wordsPerLine: state.readingCanvas.wordsPerLine,
            storyTitle: state.canvas.storyTitle,
          }}
          wordRadarFromProfile={
            profileWordRadar ?? {
              showTimer: true,
              timerSeconds: 20,
              showKeyboard: false,
              personalBests: {},
              inputMode: "letter-by-letter",
            }
          }
          reinforceWords={profileReinforceWords ?? []}
          dyslexiaMode={profileDyslexiaMode}
          companionCurrency={
            mapSession.liveMapCurrency ?? profileCompanionCurrency
          }
          storyImageLoading={state.storyImageLoading}
          storyImageUrl={state.storyImageUrl}
          storyImageFailed={state.storyImageFailed}
        />
        {karaokeReadingActive &&
          mapSession.launchedNode?.type !== "karaoke" && (
            <div className="fixed inset-0 z-50">
              <KaraokeReadingCanvas
                words={state.canvas.karaokeWords!}
                interimTranscript={liveFlowStt}
                sendMessage={sendMessage}
                companion={effectiveCompanion}
                childId={activeProfileChildId ?? undefined}
                backgroundImageUrl={state.canvas.backgroundImageUrl}
                accentColor={
                  mapSession.theme?.palette?.accent ?? state.companion?.accentColor
                }
                cardBackground={mapSession.theme?.palette?.cardBackground}
                fontSize={state.readingCanvas.fontSize}
                lineHeight={state.readingCanvas.lineHeight}
                wordsPerLine={state.readingCanvas.wordsPerLine}
                storyTitle={state.canvas.storyTitle}
              />
            </div>
          )}
        {state.canvas.mode === "pronunciation" &&
          (state.canvas.pronunciationWords?.length ?? 0) > 0 && (
            <div className="fixed inset-0 z-50">
              <PronunciationGameCanvas
                words={state.canvas.pronunciationWords!}
                interimTranscript={liveFlowStt}
                sendMessage={sendMessage}
                backgroundImageUrl={state.canvas.backgroundImageUrl}
                accentColor={
                  mapSession.theme?.palette?.accent ?? state.companion?.accentColor
                }
                onComplete={(result) => {
                  sendMessage("pronunciation_complete", result);
                }}
                onExit={sendCanvasDone}
              />
            </div>
          )}
      </div>
    );
    }
  } else if (state.phase === "picker") {
    main = (
      <div className="w-screen h-screen overflow-hidden">
        {state.error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-100 text-red-800 rounded-lg text-sm z-10">
            {state.error}
          </div>
        )}
        <ChildPicker
          onSelect={(name, opts) => {
            setSelectedChildName(name);
            if (adventureMapEnabled) {
              setAdventureChildId(name.trim().toLowerCase());
            }
            startSession(name, opts);
          }}
        />
      </div>
    );
  } else if (state.phase === "connecting") {
    main = (
      <div className="w-screen h-screen overflow-hidden relative bg-zinc-950">
        {theaterLoadingEnabled ? (
          <SessionLoadingOverlay
            childName={state.childName ?? selectedChildName ?? "Sunny"}
            avatarImagePath={profileAvatarImagePath}
            accentColor={state.companion?.accentColor}
            accentBg={state.companion?.accentBg}
            voiceReady={false}
            mapReady={mapReady}
            assetsReady={loadingAssetsReady}
            paletteSeed={selectedChildName ?? state.childName ?? "sunny"}
            onSafetyRelease={() => {
              if (mapReady) setLoadingSafetyReleased(true);
            }}
            onHardRelease={() => {
              setSessionReady(true);
              releaseCompanionAudioPlayback();
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="animate-pulse text-2xl mb-2">🌟</div>
              <p className="text-gray-600">
                {state.loadingMessage ?? "Connecting..."}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  } else if (state.phase === "active") {
    main = (
      <div className="w-screen h-screen overflow-hidden relative">
        {(isCanvasTestMode || state.debugMode) && (
          <CanvasTestOverlay
            sendMessage={sendMessage}
            forceVisible={state.debugMode}
          />
        )}
        <SessionScreen
          childName={state.childName ?? ""}
          companion={state.companion}
          companionText={state.companionText}
          interimTranscript={state.interimTranscript}
          correctStreak={state.correctStreak}
          canvas={state.canvas}
          blackboard={state.blackboard}
          reward={state.reward}
          sessionPhase={state.sessionPhase}
          sessionState={state.sessionState}
          micMuted={micMuted}
          onToggleMicMute={toggleMicMute}
          onBargeIn={bargeIn}
          onEndSession={endSession}
          onCanvasDone={sendCanvasDone}
          onWorksheetAnswer={submitWorksheetAnswer}
          onOverlayFieldChange={handleOverlayFieldChange}
          sendMessage={sendMessage}
          readingCanvas={state.readingCanvas}
          storyImageLoading={state.storyImageLoading}
          storyImageUrl={state.storyImageUrl}
          storyImageFailed={state.storyImageFailed}
          accentColor={state.companion?.accentColor ?? "#7C3AED"}
          accentBg={state.companion?.accentBg ?? "#F3E8FF"}
          sessionTheme={mapSession.theme}
        />
      </div>
    );
} else if (state.phase === "ended") {
    main = (
      <div className="w-screen h-screen overflow-hidden">
        <SessionEnd
          onReturn={() => {
            setSelectedChildName(null);
            resetToPicker();
          }}
          childName={state.childName}
          companionName={state.companion?.companionName}
        />
      </div>
    );
  }

  const companionPortraitMode =
    mapGameOverlay.active ||
    karaokeReadingActive ||
    diagFlowGameOpen != null ||
    plannerBoardLaunch != null ||
    (state.phase === "active" && state.canvas.mode === "pronunciation") ||
    mapSession.launchedNode?.type === "karaoke" ||
    mapSession.launchedNode?.type === "visual-explainer" ||
    (mapSession.launchedNode?.type as string | undefined) === "pronunciation";
  const voiceGameCompanionMicMuted =
    karaokeReadingActive ||
    (diagFlowGameOpen != null &&
      DIAG_GAMES_SUPPRESS_MIC.has(diagFlowGameOpen)) ||
    (plannerBoardLaunch != null &&
      DIAG_GAMES_SUPPRESS_MIC.has(
        plannerBoardLaunch.node.type === "karaoke"
          ? "reading"
          : plannerBoardLaunch.node.type,
      )) ||
    wordRadarDiagOpen ||
    (state.phase === "active" && state.canvas.mode === "pronunciation") ||
    mapSession.launchedNode?.type === "karaoke" ||
    mapSession.launchedNode?.type === "visual-explainer" ||
    (mapSession.launchedNode?.type as string | undefined) === "pronunciation";

  return (
    <>
      {state.warning ? (
        <div
          style={{
            position: "fixed",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10000,
            padding: "10px 16px",
            borderRadius: 12,
            background: "rgba(120, 53, 15, 0.94)",
            color: "#fff7ed",
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.24)",
          }}
        >
          {state.warning}
        </div>
      ) : null}
      <CompanionCareProvider
        childId={activeProfileChildId}
        profile={{
          companionCare: profileCompanionCare,
          care_plan: { companion_care: profileCompanionCare },
        }}
        onCareChange={setProfileCompanionCare}
        onTamagotchiChange={setProfileTamagotchi}
        onCurrencyChange={setProfileCompanionCurrency}
        onFeedEvent={(event) => {
          console.log(
            "  🎮 [companion-care] feed event",
            event.itemId,
            event.animation?.reference ?? "none",
          );
          sendMessage("companion_care_event", {
            itemId: event.itemId,
            animation: event.animation,
            animationEventId: event.animationEventId,
            companionCare: event.companionCare,
            preview: event.preview,
          });
        }}
      >
      {main}
      {adventureMapEnabled &&
      diagMapPanelEnabled &&
      (adventureChildId !== null ||
        import.meta.env.VITE_DIAG_READING === "true") ? (
        <div
          style={{
            display:
              import.meta.env.VITE_DIAG_READING === "true" ? "none" : "contents",
          }}
        >
          <DiagPanel
            startSession={startSession}
            endSession={endSession}
            voiceActive={state.phase === "active"}
            onCameraAct={handleDiagCamera}
            onTestReading={() => openDiagFlowGame("reading")}
            onTestPronunciation={() => openDiagFlowGame("pronunciation")}
            onTestWordRadar={() => openDiagFlowGame("word-radar")}
            onTestWordle={() => openDiagFlowGame("wordle")}
            onTestWheelOfFortune={() => openDiagFlowGame("wheel-of-fortune")}
          />
        </div>
      ) : null}
      <CompanionLayerWithCare
        childId={activeProfileChildId}
        companion={effectiveCompanion}
        toggledOff={false}
        mode={companionPortraitMode ? "portrait" : "full"}
        karaokeActive={
          state.phase === "active" &&
          state.canvas.mode === "karaoke" &&
          !state.karaokeStoryComplete
        }
        companionEvents={mergedCompanionEvents}
        correctStreak={state.correctStreak}
        companionCommands={mergedCompanionCommands}
        activeNodeScreen={activeNodeScreen}
        analyserNodeRef={analyserNodeRef}
        speechBubbleText={companionBubbleText}
        micMuted={micMuted || voiceGameCompanionMicMuted}
        onToggleMute={toggleMicMute}
      />
      {adventureMapEnabled &&
      adventureChildId &&
      !companionPortraitMode &&
      tamagotchProfileReady ? (
        <TamagotchiSheetWithCare
          open={companionSheetOpen}
          tamagotchi={profileTamagotchi ?? DEFAULT_TAMAGOTCHI}
          companionName={effectiveCompanion?.companionId ?? "Companion"}
          companionCurrency={
            mapSession.liveMapCurrency ?? profileCompanionCurrency
          }
          onClose={() => setCompanionSheetOpen(false)}
        />
      ) : null}
      </CompanionCareProvider>
      {isRewardDiagEnabled() ? (
        <>
          <RewardDiagBridge />
          <RewardTriggerPanel childId={activeProfileChildId ?? ""} />
        </>
      ) : null}
      {diagFlowGameOpen === "reading" ? (
        <FlowGameOverlay onBack={closeDiagFlowGame}>
          <KaraokeReadingCanvas
            words={DIAG_READING_TEST_WORDS}
            interimTranscript={liveFlowStt}
            sendMessage={sendMessage}
            backgroundImageUrl="https://images.unsplash.com/photo-1448375240586-882707db888b?w=1600"
            accentColor={mapSession.theme?.palette?.accent ?? state.companion?.accentColor}
            cardBackground={mapSession.theme?.palette?.cardBackground}
            fontSize={state.readingCanvas.fontSize}
            lineHeight={state.readingCanvas.lineHeight}
            wordsPerLine={state.readingCanvas.wordsPerLine}
            storyTitle="Chimpanzees"
            onComplete={closeDiagFlowGame}
          />
        </FlowGameOverlay>
      ) : null}
      {diagFlowGameOpen === "pronunciation" ? (
        <FlowGameOverlay onBack={closeDiagFlowGame}>
          <PronunciationGameCanvas
            words={DIAG_PRONUNCIATION_WORDS}
            interimTranscript={liveFlowStt}
            sendMessage={sendMessage}
            backgroundImageUrl={state.canvas.backgroundImageUrl}
            accentColor={mapSession.theme?.palette?.accent ?? state.companion?.accentColor}
            onComplete={(result) => {
              sendMessage("pronunciation_complete", result);
              closeDiagFlowGame();
            }}
            onExit={closeDiagFlowGame}
          />
        </FlowGameOverlay>
      ) : null}
      {wordRadarDiagOpen ? (
        <FlowGameOverlay onBack={closeDiagFlowGame}>
          <WordRadar
            items={DIAG_WORD_RADAR_ITEMS}
            interimTranscript={liveFlowStt}
            sendMessage={sendMessage}
            autoStart={state.diagGameSessionReady}
            timerSeconds={
              profileWordRadar?.showTimer === true
                ? profileWordRadar.timerSeconds
                : undefined
            }
            showKeyboard={profileWordRadar?.showKeyboard ?? false}
            inputMode={profileWordRadar?.inputMode}
            personalBests={profileWordRadar?.personalBests ?? {}}
            companion={effectiveCompanion}
            childId={activeProfileChildId ?? ""}
            onComplete={(result) => {
              console.log("  🎮 [DiagPanel] WordRadar result", result);
              setWordRadarDiagOpen(false);
            }}
          />
        </FlowGameOverlay>
      ) : null}
      {plannerBoardLaunch?.node.type === "word-radar" ? (
        <FlowGameOverlay onBack={handlePlannerBoardOverlayBack} backLabel="Back to map">
          <WordRadar
            key={`${plannerBoardLaunch.node.id}:${plannerBoardLaunch.replayNonce}`}
            items={
              plannerBoardLaunch.node.wordRadarItems ??
              (plannerBoardLaunch.node.words ?? []).map((word) => ({
                display: word,
                acceptedResponses: [word.toLowerCase()],
                label: "Spelling",
              }))
            }
            interimTranscript={liveFlowStt}
            sendMessage={sendMessage}
            timerSeconds={
              plannerBoardLaunch.node.wordRadarConfig?.showTimer
                ? plannerBoardLaunch.node.wordRadarConfig.timerSeconds
                : undefined
            }
            showKeyboard={
              plannerBoardLaunch.node.wordRadarConfig?.inputMode === "keyboard"
            }
            inputMode={plannerBoardLaunch.node.wordRadarConfig?.inputMode}
            speakStyle={plannerBoardLaunch.node.wordRadarConfig?.speakStyle}
            recallMode={plannerBoardLaunch.node.wordRadarConfig?.recallMode}
            hideWordDuringResponse={
              plannerBoardLaunch.node.wordRadarConfig?.hideWordDuringResponse
            }
            requiresCapturedResponse={
              plannerBoardLaunch.node.wordRadarConfig?.requiresCapturedResponse
            }
            nodeId={plannerBoardLaunch.node.id}
            planId={plannerBoardLaunch.node.planId}
            targetLane={plannerBoardLaunch.node.targetLane}
            wordRadarConfig={plannerBoardLaunch.node.wordRadarConfig}
            personalBests={profileWordRadar?.personalBests ?? {}}
            companion={effectiveCompanion}
            childId={activeProfileChildId ?? adventureChildId ?? ""}
            enableLocalNarrationFallback
            onComplete={(result) => {
              console.log(" 🎮 [AdventureBoard] word_radar_complete", {
                nodeId: plannerBoardLaunch.node.id,
                accuracy: result.accuracy,
                wordsAttempted: result.rawResults.length,
              });
              showPlannerBoardEngagementOverlay(plannerBoardLaunch.node, {
                completed: true,
                accuracy: result.accuracy,
                wordsAttempted: result.rawResults.length,
                targetResults: result.rawResults,
              });
            }}
          />
          {postActivityEngagement ? (
            <PostActivityEngagementOverlay
              title={postActivityEngagement.title}
              outcome={postActivityEngagement.outcome}
              stats={postActivityEngagement.stats}
              canReplay
              canTryHarder={postActivityEngagement.canTryHarder}
              onAction={handlePlannerBoardPostActivityAction}
            />
          ) : null}
        </FlowGameOverlay>
      ) : null}
      {plannerBoardLaunch?.node.type === "pronunciation" ? (
        <FlowGameOverlay onBack={handlePlannerBoardOverlayBack} backLabel="Back to map">
          <PronunciationGameCanvas
            key={`${plannerBoardLaunch.node.id}:${plannerBoardLaunch.replayNonce}`}
            words={(plannerBoardLaunch.node.words ?? []).slice(
              0,
              plannerBoardLaunch.node.pronunciationConfig?.baseWordCount ??
                Math.max(3, plannerBoardLaunch.node.words?.length ?? 0),
            )}
            replayWords={plannerBoardLaunch.node.words ?? []}
            pronunciationConfig={plannerBoardLaunch.node.pronunciationConfig}
            interimTranscript={liveFlowStt}
            sendMessage={sendMessage}
            backgroundImageUrl={state.canvas.backgroundImageUrl}
            accentColor={mapSession.theme?.palette?.accent ?? state.companion?.accentColor}
            onComplete={(result) => {
              sendMessage(
                "pronunciation_complete",
                result as unknown as Record<string, unknown>,
              );
              console.log(" 🎮 [AdventureBoard] pronunciation_complete", {
                nodeId: plannerBoardLaunch.node.id,
                accuracy: result.accuracy,
                wordsAttempted: result.wordsAttempted,
              });
            }}
            onPostActivityAction={(action, result) => {
              recordPlannerBoardPostActivityAction(action, plannerBoardLaunch.node, {
                completed: result.runEndedReason !== "timer",
                accuracy: result.accuracy > 1 ? result.accuracy / 100 : result.accuracy,
                activePlayTimeMs: result.timeSurvivedMs,
                frustrationScore: result.runEndedReason === "timer" ? 0.7 : 0.1,
              });
            }}
            onExit={closePlannerBoardLaunch}
          />
        </FlowGameOverlay>
      ) : null}
      {plannerBoardLaunch?.iframeUrl ? (
        <FlowGameOverlay onBack={handlePlannerBoardOverlayBack} backLabel="Back to map">
          <iframe
            key={`${plannerBoardLaunch.node.id}:${plannerBoardLaunch.replayNonce}`}
            ref={adventureGameIframeRef}
            title={plannerBoardLaunch.node.type}
            src={plannerBoardLaunch.iframeUrl}
            style={{ width: "100%", height: "100%", border: "none", background: "transparent" }}
          />
          {postActivityEngagement ? (
            <PostActivityEngagementOverlay
              title={postActivityEngagement.title}
              outcome={postActivityEngagement.outcome}
              stats={postActivityEngagement.stats}
              canReplay
              canTryHarder={postActivityEngagement.canTryHarder}
              onAction={handlePlannerBoardPostActivityAction}
            />
          ) : null}
        </FlowGameOverlay>
      ) : null}
      {diagFlowGameOpen === "wordle" && diagWordleUrl ? (
        <FlowGameOverlay onBack={closeDiagFlowGame}>
          <iframe
            ref={adventureGameIframeRef}
            title="Wordle"
            src={diagWordleUrl}
            style={{ width: "100%", height: "100%", border: "none", background: "transparent" }}
          />
        </FlowGameOverlay>
      ) : null}
      {diagFlowGameOpen === "wheel-of-fortune" && diagWheelUrl ? (
        <FlowGameOverlay onBack={closeDiagFlowGame}>
          <iframe
            ref={adventureGameIframeRef}
            title="Wheel of Fortune"
            src={diagWheelUrl}
            style={{ width: "100%", height: "100%", border: "none", background: "transparent" }}
          />
        </FlowGameOverlay>
      ) : null}
    </>
  );
}

export default App;
