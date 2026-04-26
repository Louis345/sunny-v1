import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloneCompanionDefaults } from "../../../src/shared/companionTypes";
import { useSession } from "../hooks/useSession";
import { useMapSession } from "../hooks/useMapSession";
import { AdventureMap } from "./AdventureMap";
import { CompanionLayer } from "./CompanionLayer";
import { FlowGameOverlay } from "./FlowGameOverlay";
import { KaraokeReadingCanvas } from "./KaraokeReadingCanvas";
import { GameSandbox } from "./GameSandbox";

const DIAG_WORDS = [
  "Chimpanzees",
  "are",
  "apes.",
  "They",
  "inhabit",
  "steamy",
  "rainforests",
  "and",
  "other",
  "parts",
  "of",
  "Africa.",
  "Chimps",
  "gather",
  "in",
  "bands",
  "that",
  "number",
  "from",
  "15",
  "to",
  "150",
  "chimps.",
  "A",
  "band",
  "of",
  "chimps",
  "is",
  "always",
  "led",
  "by",
  "a",
  "male.",
  "A",
  "band",
  "whose",
  "leader",
  "has",
  "left",
  "will",
  "find",
  "another",
  "male",
  "to",
  "lead.",
];

const DIAG_BACKGROUND =
  "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1600";

const adventureMapEnabled = import.meta.env.VITE_ADVENTURE_MAP === "true";

function WordRadarDiagPanel({
  interimTranscript,
  sendMessage,
  wordRadar,
}: {
  interimTranscript: string;
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
  wordRadar: {
    showTimer: boolean;
    showKeyboard: boolean;
    inputMode?: "whole-word" | "letter-by-letter" | "keyboard";
    speakStyle?: "option-a" | "option-b";
    keyboardStyle?: "option-b" | "option-c";
    personalBests: Record<string, number>;
  };
}) {
  return (
    <div
      className="pointer-events-auto fixed bottom-4 left-4 z-[60] max-w-[280px] rounded-lg border border-white/20 bg-zinc-900/95 p-3 text-left text-xs text-zinc-100 shadow-lg"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      <GameSandbox
        interimTranscript={interimTranscript}
        sendMessage={sendMessage}
        wordRadar={wordRadar}
        wordRadarShowIntro
      />
    </div>
  );
}

export function DiagReadingScreen() {
  const adventureGameIframeRef = useRef<HTMLIFrameElement | null>(null);
  const { state, startSession, sendMessage, micMuted, toggleMicMute, analyserNodeRef } =
    useSession({
      adventureGameIframeRef,
    });
  const mapSession = useMapSession(adventureMapEnabled ? "creator" : "");
  const companion = useMemo(() => cloneCompanionDefaults(), []);
  const [standaloneReadingVisible, setStandaloneReadingVisible] = useState(true);
  const [wordRadarFromProfile, setWordRadarFromProfile] = useState<{
    showTimer: boolean;
    showKeyboard: boolean;
    inputMode?: "whole-word" | "letter-by-letter" | "keyboard";
    speakStyle?: "option-a" | "option-b";
    keyboardStyle?: "option-b" | "option-c";
    personalBests: Record<string, number>;
  } | null>(null);

  const handleGameIframeMount = useCallback((el: HTMLIFrameElement | null) => {
    adventureGameIframeRef.current = el;
  }, []);

  useEffect(() => {
    startSession("creator", {
      diagKiosk: true,
      silentTts: true,
      sttOnly: true,
    });
  }, [startSession]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/creator")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.wordRadar) return;
        const wr = data.wordRadar as {
          showTimer?: boolean;
          showKeyboard?: boolean;
          personalBests?: Record<string, number>;
        };
        const gameWr = data.games?.["word-radar"] as
          | {
              inputMode?: "whole-word" | "letter-by-letter" | "keyboard";
              speakStyle?: "option-a" | "option-b";
              keyboardStyle?: "option-b" | "option-c";
              showTimer?: boolean;
            }
          | undefined;
        const pb = wr.personalBests;
        setWordRadarFromProfile({
          showTimer: gameWr?.showTimer ?? (wr.showTimer === true),
          showKeyboard: gameWr?.inputMode === "keyboard" || wr.showKeyboard === true,
          inputMode: gameWr?.inputMode,
          speakStyle: gameWr?.speakStyle,
          keyboardStyle: gameWr?.keyboardStyle,
          personalBests:
            pb && typeof pb === "object" && !Array.isArray(pb)
              ? (pb as Record<string, number>)
              : {},
        });
      })
      .catch(() => {
        if (!cancelled) setWordRadarFromProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase !== "active") {
    return (
      <>
        <div
          style={{
            background: "#0a1512",
            color: "rgba(255,255,255,0.4)",
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
          }}
        >
          Connecting...
        </div>
        <CompanionLayer
          childId="creator"
          companion={companion}
          toggledOff={false}
          mode="portrait"
          micMuted={micMuted}
          onToggleMute={toggleMicMute}
          analyserNodeRef={analyserNodeRef}
        />
      </>
    );
  }

  const wordRadarUi = wordRadarFromProfile ?? {
    showTimer: true,
    showKeyboard: false,
    inputMode: "whole-word" as const,
    speakStyle: "option-a" as const,
    keyboardStyle: "option-c" as const,
    personalBests: {},
  };

  /** Partial STT (`interim`) + last finalized phrase (`final`) so flow games stay live after each Flux turn. */
  const liveFlowStt = state.interimTranscript || state.gameTranscript;

  if (adventureMapEnabled) {
    return (
      <>
        <div className="w-screen h-screen overflow-hidden relative bg-zinc-950">
          <AdventureMap
            childId="creator"
            mapSession={mapSession}
            showFlowGameBackChrome
            onGameIframeMount={handleGameIframeMount}
            wordRadarFromProfile={
              wordRadarFromProfile ?? {
                showTimer: true,
                showKeyboard: false,
                inputMode: "whole-word",
                speakStyle: "option-a",
                keyboardStyle: "option-c",
                personalBests: {},
              }
            }
            karaokeReadingForMapNode={{
              words: state.canvas.karaokeWords ?? [],
              interimTranscript: liveFlowStt,
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
        </div>
        <CompanionLayer
          childId="creator"
          companion={companion}
          toggledOff={false}
          mode="portrait"
          micMuted={micMuted}
          onToggleMute={toggleMicMute}
          analyserNodeRef={analyserNodeRef}
        />
        <WordRadarDiagPanel
          interimTranscript={liveFlowStt}
          sendMessage={sendMessage}
          wordRadar={wordRadarUi}
        />
      </>
    );
  }

  return (
    <>
      {standaloneReadingVisible ? (
        <FlowGameOverlay
          onBack={() => setStandaloneReadingVisible(false)}
          backLabel="Back to diag"
        >
          <KaraokeReadingCanvas
            words={DIAG_WORDS}
            interimTranscript={liveFlowStt}
            sendMessage={sendMessage}
            backgroundImageUrl={DIAG_BACKGROUND}
            storyTitle="Chimpanzees"
          />
        </FlowGameOverlay>
      ) : (
        <button
          type="button"
          className="pointer-events-auto fixed left-4 top-4 z-[70] rounded-full bg-black/70 px-4 py-2 text-sm text-white"
          onClick={() => setStandaloneReadingVisible(true)}
        >
          Show reading
        </button>
      )}
      <CompanionLayer
        childId="creator"
        companion={companion}
        toggledOff={false}
        mode="portrait"
        micMuted={micMuted}
        onToggleMute={toggleMicMute}
        analyserNodeRef={analyserNodeRef}
      />
      <WordRadarDiagPanel
        interimTranscript={liveFlowStt}
        sendMessage={sendMessage}
        wordRadar={wordRadarUi}
      />
    </>
  );
}
