import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "./hooks/useSession";
import { ChildPicker } from "./components/ChildPicker";
import { SessionScreen } from "./components/SessionScreen";
import { SessionEnd } from "./components/SessionEnd";
import { CanvasTestOverlay } from "./components/CanvasTestPanel";
import { AdventureMap } from "./components/AdventureMap";
import { CompanionLayer } from "./components/CompanionLayer";
import { useMapSession } from "./hooks/useMapSession";
import type { CompanionConfig } from "../../src/shared/companionTypes";
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
  } = useSession();

  const [adventureChildId, setAdventureChildId] = useState<string | null>(null);
  const [profileCompanion, setProfileCompanion] = useState<CompanionConfig | null>(
    null,
  );
  const [companionMuted, setCompanionMuted] = useState(false);
  const [activeNodeScreen, setActiveNodeScreen] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const mapSession = useMapSession(
    adventureMapEnabled && adventureChildId ? adventureChildId : "",
  );

  useEffect(() => {
    console.log(
      "App companionEvents:",
      mapSession.companionEvents.length,
      mapSession.companionEvents,
    );
  }, [mapSession.companionEvents]);

  const activeProfileChildId =
    adventureChildId ??
    (state.phase === "active"
      ? (state.childName?.trim().toLowerCase() ?? null)
      : null);

  useEffect(() => {
    setCompanionMuted(false);
  }, [activeProfileChildId]);

  useEffect(() => {
    if (!(adventureMapEnabled && adventureChildId)) {
      setActiveNodeScreen(null);
    }
  }, [adventureMapEnabled, adventureChildId]);

  useEffect(() => {
    if (!activeProfileChildId) {
      setProfileCompanion(null);
      return;
    }
    // Defaults immediately so CompanionLayer mounts and can load the VRM while fetch runs.
    setProfileCompanion(cloneCompanionDefaults());
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
    };
  }, [activeProfileChildId]);

  // Auto-start session when on /test/canvas so the canvas test page works directly
  useEffect(() => {
    if (
      !adventureMapEnabled &&
      state.phase === "picker" &&
      window.location.pathname === "/test/canvas" &&
      (window.location.port === "3002" || window.location.port === "5173")
    ) {
      startSession("Ila");
    }
  }, [state.phase, startSession]);

  let main: ReactNode = null;

  if (adventureMapEnabled && adventureChildId) {
    main = (
      <div className="w-screen h-screen overflow-hidden relative bg-zinc-950">
        <button
          type="button"
          className="absolute top-3 left-3 z-20 rounded-lg bg-white/90 px-3 py-1.5 text-sm text-zinc-900 shadow"
          onClick={() => setAdventureChildId(null)}
        >
          Back
        </button>
        <AdventureMap
          childId={adventureChildId}
          mapSession={mapSession}
          onActiveNodeScreenChange={setActiveNodeScreen}
        />
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
      <CompanionLayer
        childId={activeProfileChildId}
        companion={profileCompanion}
        toggledOff={companionMuted}
        companionEvents={mapSession.companionEvents}
        activeNodeScreen={
          adventureMapEnabled && adventureChildId ? activeNodeScreen : null
        }
      />
      {activeProfileChildId ? (
        <button
          type="button"
          className="pointer-events-auto fixed bottom-4 right-4 z-[20] rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-zinc-900 shadow-md"
          onClick={() => setCompanionMuted((m) => !m)}
        >
          {companionMuted ? "Show friend" : "Hide friend"}
        </button>
      ) : null}
    </>
  );
}

export default App;
