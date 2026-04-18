import { useEffect, useMemo } from "react";
import { cloneCompanionDefaults } from "../../../src/shared/companionTypes";
import { useSession } from "../hooks/useSession";
import { useMapSession } from "../hooks/useMapSession";
import { AdventureMap } from "./AdventureMap";
import { CompanionLayer } from "./CompanionLayer";
import { KaraokeReadingCanvas } from "./KaraokeReadingCanvas";

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

export function DiagReadingScreen() {
  const { state, startSession, sendMessage } = useSession();
  const mapSession = useMapSession(adventureMapEnabled ? "creator" : "");
  const companion = useMemo(() => cloneCompanionDefaults(), []);

  useEffect(() => {
    startSession("creator", {
      diagKiosk: true,
      silentTts: true,
      //  sttOnly: true,
    });
  }, [startSession]);

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
        <CompanionLayer childId="creator" companion={companion} toggledOff={false} />
      </>
    );
  }

  if (adventureMapEnabled) {
    return (
      <>
        <div className="w-screen h-screen overflow-hidden relative bg-zinc-950">
          <AdventureMap
            childId="creator"
            mapSession={mapSession}
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
        </div>
        <CompanionLayer childId="creator" companion={companion} toggledOff={false} />
      </>
    );
  }

  return (
    <>
      <KaraokeReadingCanvas
        words={DIAG_WORDS}
        interimTranscript={state.interimTranscript}
        sendMessage={sendMessage}
        backgroundImageUrl={DIAG_BACKGROUND}
        storyTitle="Chimpanzees"
      />
      <CompanionLayer childId="creator" companion={companion} toggledOff={false} />
    </>
  );
}
