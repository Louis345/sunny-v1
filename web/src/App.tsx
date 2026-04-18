import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "./hooks/useSession";
import { useAdventureState } from "./hooks/useAdventureState";
import { ChildPicker } from "./components/ChildPicker";
import { SessionScreen } from "./components/SessionScreen";
import { SessionEnd } from "./components/SessionEnd";
import { CanvasTestOverlay } from "./components/CanvasTestPanel";
import { AdventureMap } from "./components/AdventureMap";
import { CompanionLayer } from "./components/CompanionLayer";
import { DiagPanel } from "./components/DiagPanel";
import { KaraokeReadingCanvas } from "./components/KaraokeReadingCanvas";
import { NodeTransitionOverlay } from "./components/NodeTransitionOverlay";
import { useMapSession } from "./hooks/useMapSession";
import {
  COMPANION_API_VERSION,
  type CompanionCommand,
} from "../../src/shared/companions/companionContract";
import type {
  CompanionConfig,
  CompanionEventPayload,
} from "../../src/shared/companionTypes";
import {
  cloneCompanionDefaults,
  mergeCompanionConfigWithDefaults,
} from "../../src/shared/companionTypes";

const isCanvasTestMode =
  import.meta.env.VITE_TEST_MODE === "true" ||
  (typeof window !== "undefined" &&
    window.location.search.includes("testmode"));

const adventureMapEnabled =
  import.meta.env.VITE_ADVENTURE_MAP === "true";

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
  const [diagCompanionCommands, setDiagCompanionCommands] = useState<
    CompanionCommand[]
  >([]);

  const {
    adventureChildId,
    setAdventureChildId,
    activeNodeScreen,
    setActiveNodeScreen,
    karaokeReadingActive,
    companionMuted,
    activeProfileChildId,
  } = useAdventureState(state, adventureMapEnabled);

  // Stable defaults object — avoids creating a new reference on every render.
  const defaultCompanion = useMemo(() => cloneCompanionDefaults(), []);
  // Provide defaults inline while the fetch is in-flight so CompanionLayer can
  // start loading the VRM immediately, without a synchronous setState in the effect.
  const effectiveCompanion = activeProfileChildId
    ? (profileCompanion ?? defaultCompanion)
    : profileCompanion;

  const mapSession = useMapSession(
    adventureMapEnabled && adventureChildId ? adventureChildId : "",
  );

  const mergedCompanionEvents = useMemo(
    () =>
      mergeCompanionEvents(voiceCompanionEvents, mapSession.companionEvents),
    [voiceCompanionEvents, mapSession.companionEvents],
  );

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
        return r.json() as Promise<{ companion?: CompanionConfig }>;
      })
      .then((data) => {
        if (!cancelled) {
          setProfileCompanion(mergeCompanionConfigWithDefaults(data.companion));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfileCompanion(cloneCompanionDefaults());
        }
      });
    return () => {
      cancelled = true;
      setProfileCompanion(null);
    };
  }, [activeProfileChildId]);

  let main: ReactNode = null;

  if (adventureMapEnabled && adventureChildId) {
    const mapTransitionColor =
      mapSession.theme?.palette?.accent ??
      state.companion?.accentColor ??
      "#6D5EF5";
    main = (
      <div className="w-screen h-screen overflow-hidden relative bg-zinc-950">
        {/* Single shell for map + all node overlays; extend active= when adding non-karaoke nodes. */}
        <NodeTransitionOverlay active={karaokeReadingActive} color={mapTransitionColor}>
          <button
            type="button"
            className="absolute top-3 left-3 z-20 rounded-lg bg-white/90 px-3 py-1.5 text-sm text-zinc-900 shadow"
            onClick={() => {
              setAdventureChildId(null);
              resetToPicker();
            }}
          >
            Back
          </button>
          <AdventureMap
            childId={adventureChildId}
            mapSession={mapSession}
            onActiveNodeScreenChange={setActiveNodeScreen}
          />
          {karaokeReadingActive && (
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
        </NodeTransitionOverlay>
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
      />
    </>
  );
}

export default App;
