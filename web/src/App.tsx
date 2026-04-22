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
import { CanvasTestOverlay } from "./components/CanvasTestPanel";
import { AdventureMap } from "./components/AdventureMap";
import {
  CompanionBridge,
  type GameIframeOverlayState,
} from "./components/CompanionBridge";
import { CompanionLayer } from "./components/CompanionLayer";
import { DiagPanel } from "./components/DiagPanel";
import { KaraokeReadingCanvas } from "./components/KaraokeReadingCanvas";
import { PronunciationGameCanvas } from "./components/PronunciationGameCanvas";
import { useMapSession } from "./hooks/useMapSession";
import {
  COMPANION_API_VERSION,
  type CompanionCommand,
} from "../../src/shared/companions/companionContract";
import type {
  CompanionConfig,
  CompanionEventPayload,
} from "../../src/shared/companionTypes";
import { mergeCompanionConfigWithDefaults } from "../../src/shared/companionTypes";
import {
  DEFAULT_TAMAGOTCHI,
  getTamagotchiPersonality,
  getTamagotchiSpeechBubble,
  type TamagotchiState,
} from "../../src/shared/vrrTypes";
import { TamagotchiSheet } from "./components/TamagotchiSheet";
import { RewardDiagOverlay } from "./components/RewardDiagOverlay";
import { RewardTriggerPanel } from "./components/RewardTriggerPanel";
import { isRewardDiagEnabled, type RewardDiagEvent } from "./types/rewardDiag";

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
  const v = import.meta.env.VITE_PREVIEW_MODE;
  if (v === "free" || v === "go-live") return v;
  if (import.meta.env.VITE_PREVIEW_MODE === "true") return "free";
  return false;
}

const mapPreviewMode = resolveMapPreviewMode();

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

function App() {
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
    companionEvents: voiceCompanionEvents,
    companionCommands: voiceCompanionCommands,
    analyserNodeRef,
  } = useSession();

  const [profileCompanion, setProfileCompanion] = useState<CompanionConfig | null>(
    null,
  );
  const [profileTamagotchi, setProfileTamagotchi] = useState<TamagotchiState | null>(
    null,
  );
  const [companionSheetOpen, setCompanionSheetOpen] = useState(false);
  const [diagCompanionCommands, setDiagCompanionCommands] = useState<
    CompanionCommand[]
  >([]);
  const [mapGameOverlay, setMapGameOverlay] = useState<GameIframeOverlayState>({
    active: false,
    iframe: null,
    url: null,
  });

  const {
    adventureChildId,
    setAdventureChildId,
    activeNodeScreen,
    setActiveNodeScreen,
    karaokeReadingActive,
    companionMuted,
    activeProfileChildId,
  } = useAdventureState(state, adventureMapEnabled);

  const effectiveCompanion = activeProfileChildId ? profileCompanion : null;

  const companionBubbleText = useMemo(() => {
    if (!adventureChildId) return null;
    const t = profileTamagotchi ?? DEFAULT_TAMAGOTCHI;
    return getTamagotchiSpeechBubble(
      getTamagotchiPersonality(t, false),
    );
  }, [adventureChildId, profileTamagotchi]);

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
    adventureMapEnabled && adventureChildId ? adventureChildId : "",
    mapPreviewMode,
  );

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

  const handleGameIframeOverlayChange = useCallback(
    (s: GameIframeOverlayState) => {
      setMapGameOverlay(s);
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

  useEffect(() => {
    if (!activeProfileChildId) return;
    let cancelled = false;
    fetch(`/api/profile/${encodeURIComponent(activeProfileChildId)}`)
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`profile ${r.status}`);
        }
        return r.json() as Promise<{
          companion?: CompanionConfig;
          tamagotchi?: TamagotchiState;
        }>;
      })
      .then((data) => {
        if (!cancelled) {
          setProfileCompanion(mergeCompanionConfigWithDefaults(data.companion));
          setProfileTamagotchi(data.tamagotchi ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfileCompanion(null);
          setProfileTamagotchi(null);
        }
      });
    return () => {
      cancelled = true;
      setProfileCompanion(null);
    };
  }, [activeProfileChildId]);

  let main: ReactNode = null;

  if (adventureMapEnabled && adventureChildId) {
    main = (
      <div className="w-screen h-screen overflow-hidden relative bg-zinc-950">
        <button
          type="button"
          className="absolute top-3 left-3 z-20 rounded-lg bg-white/90 px-3 py-1.5 text-sm text-zinc-900 shadow"
          onClick={() => {
            setCompanionSheetOpen(false);
            setAdventureChildId(null);
            resetToPicker();
          }}
        >
          Back
        </button>
        <AdventureMap
          childId={adventureChildId}
          mapSession={mapSession}
          previewMode={mapPreviewMode}
          mapCompanion={effectiveCompanion}
          companionMutedForMap={companionMuted}
          tamagotchi={profileTamagotchi ?? DEFAULT_TAMAGOTCHI}
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
            interimTranscript: state.interimTranscript,
            sendMessage,
            backgroundImageUrl: state.canvas.backgroundImageUrl,
            accentColor:
              mapSession.theme?.palette?.accent ?? state.companion?.accentColor,
            cardBackground: mapSession.theme?.palette?.cardBackground,
            fontSize: state.readingCanvas.fontSize,
            lineHeight: state.readingCanvas.lineHeight,
            wordsPerLine: state.readingCanvas.wordsPerLine,
            storyTitle: state.canvas.storyTitle,
          }}
        />
        {karaokeReadingActive &&
          mapSession.launchedNode?.type !== "karaoke" && (
            <div className="fixed inset-0 z-50">
              <KaraokeReadingCanvas
                words={state.canvas.karaokeWords!}
                interimTranscript={state.interimTranscript}
                sendMessage={sendMessage}
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
                interimTranscript={state.interimTranscript}
                sendMessage={sendMessage}
                backgroundImageUrl={state.canvas.backgroundImageUrl}
                accentColor={
                  mapSession.theme?.palette?.accent ?? state.companion?.accentColor
                }
                onComplete={(result) => {
                  sendMessage("pronunciation_complete", result);
                }}
              />
            </div>
          )}
      </div>
    );
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
            if (adventureMapEnabled && !opts?.diagKiosk) {
              setAdventureChildId(name.trim().toLowerCase());
              startSession(name, opts);
              return;
            }
            startSession(name, opts);
          }}
        />
      </div>
    );
  } else if (state.phase === "connecting") {
    main = (
      <div className="w-screen h-screen overflow-hidden flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-pulse text-2xl mb-2">🌟</div>
          <p className="text-gray-600">
            {state.loadingMessage ?? "Connecting..."}
          </p>
        </div>
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
          onReturn={resetToPicker}
          childName={state.childName}
          companionName={state.companion?.companionName}
        />
      </div>
    );
  }

  return (
    <>
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
          />
        </div>
      ) : null}
      <CompanionBridge
        overlay={mapGameOverlay}
        companion={effectiveCompanion}
        companionMuted={companionMuted}
        isSpeaking={state.sessionState === "SPEAKING"}
        onMapIframeCompanionEvent={mapSession.forwardMapIframeCompanionEvent}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 55,
          pointerEvents: "none",
          visibility: mapGameOverlay.active ? "hidden" : "visible",
        }}
        aria-hidden={mapGameOverlay.active}
      >
        <CompanionLayer
          childId={activeProfileChildId}
          companion={effectiveCompanion}
          toggledOff={companionMuted}
          karaokeActive={
            state.phase === "active" &&
            state.canvas.mode === "karaoke" &&
            !state.karaokeStoryComplete
          }
          companionEvents={mergedCompanionEvents}
          companionCommands={mergedCompanionCommands}
          activeNodeScreen={activeNodeScreen}
          analyserNodeRef={analyserNodeRef}
          speechBubbleText={companionBubbleText}
        />
      </div>
      {adventureMapEnabled && adventureChildId ? (
        <TamagotchiSheet
          open={companionSheetOpen}
          tamagotchi={profileTamagotchi ?? DEFAULT_TAMAGOTCHI}
          companionName={effectiveCompanion?.companionId ?? "Companion"}
          onClose={() => setCompanionSheetOpen(false)}
        />
      ) : null}
      {isRewardDiagEnabled() ? (
        <>
          <RewardDiagBridge />
          <RewardTriggerPanel childId={activeProfileChildId ?? ""} />
        </>
      ) : null}
    </>
  );
}

export default App;
