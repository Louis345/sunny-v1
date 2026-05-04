import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildNodeLaunchAction } from "../../../src/shared/homeworkNodeRouting";
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

function homeworkMapPreviewFromSearch(): boolean {
  if (typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search).get("homeworkPreview");
  return v === "1" || v?.toLowerCase() === "true";
}

function readHomeworkMapPreviewChildFromSearch(): string | null {
  if (!homeworkMapPreviewFromSearch()) return null;
  const raw = new URLSearchParams(window.location.search).get("childId")?.trim().toLowerCase();
  return raw && raw.length > 0 ? raw : null;
}

/** Map `session_started` display name to API `childId` (first token, lowercased). */
function childIdFromDisplayName(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  if (!s) return "creator";
  return s.split(/\s+/)[0]!.toLowerCase();
}

function WordRadarDiagPanel({
  adventureMapEnabled,
  interimTranscript,
  mapChildId,
  sessionChildDisplayName,
  sendMessage,
  wordRadar,
}: {
  adventureMapEnabled: boolean;
  interimTranscript: string;
  mapChildId: string;
  /** Active voice session display name — drives homework preview target when URL has no `childId`. */
  sessionChildDisplayName: string;
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
  wordRadar: {
    showTimer: boolean;
    timerSeconds?: number;
    showKeyboard: boolean;
    inputMode?: "whole-word" | "letter-by-letter" | "keyboard";
    speakStyle?: "option-a" | "option-b";
    keyboardStyle?: "option-b" | "option-c";
    personalBests: Record<string, number>;
  };
}) {
  const [diagOpen, setDiagOpen] = useState(false);
  const [wordleUrl, setWordleUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!wordleUrl) return;
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      if ((d as { type?: string }).type !== "node_complete") return;
      if (!adventureMapEnabled) {
        console.log("  🎮 [DiagReadingScreen] wordle node_complete", d);
        sendMessage("game_event", { event: d });
      }
      setWordleUrl(null);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [wordleUrl, adventureMapEnabled, sendMessage]);

  const openHomeworkMapPreview = useCallback(() => {
    const cid = childIdFromDisplayName(sessionChildDisplayName);
    const u = new URL(window.location.href);
    u.searchParams.set("homeworkPreview", "1");
    u.searchParams.set("childId", cid);
    window.open(u.toString(), "_blank", "noopener,noreferrer");
  }, [sessionChildDisplayName]);

  return (
    <>
      <div
        className="pointer-events-auto fixed bottom-4 left-4 z-[60] flex max-w-[280px] flex-col overflow-hidden rounded-lg border border-white/20 bg-zinc-900/95 text-left text-xs text-zinc-100 shadow-lg"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        <button
          type="button"
          className="w-full shrink-0 border-b border-white/15 bg-violet-800 px-3 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
          onClick={openHomeworkMapPreview}
        >
          🏠 Preview Homework Map
        </button>
        <button
          type="button"
          className="flex w-full shrink-0 cursor-pointer items-center justify-between px-3 py-2 text-left text-zinc-100 hover:bg-white/5"
          onClick={() => setDiagOpen((p) => !p)}
        >
          <span className="font-bold">Diag</span>
          <span aria-hidden>{diagOpen ? "▲" : "▼"}</span>
        </button>
        {diagOpen ? (
          <div className="max-h-[60vh] overflow-y-auto p-3">
            <GameSandbox
              interimTranscript={interimTranscript}
              sendMessage={sendMessage}
              wordRadar={wordRadar}
              wordRadarShowIntro
            />
            <div className="mt-4 border-t border-white/15 pt-3">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-zinc-400">
                WORDLE TEST
              </div>
              <button
                type="button"
                className="w-full rounded-md bg-violet-700 px-2 py-1.5 text-sm font-medium text-white hover:bg-violet-600"
                onClick={() => {
                  const action = buildNodeLaunchAction(
                    {
                      id: "diag-wordle-test",
                      type: "wordle",
                      words: ["farmer"],
                      difficulty: 2,
                    },
                    { childId: mapChildId, companion: "elli", isDiagMode: true },
                  );
                  if (action.kind !== "iframe") return;
                  setWordleUrl(action.url);
                }}
              >
                Test Wordle
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {wordleUrl ? (
        <div className="pointer-events-auto fixed inset-0 z-[100] flex flex-col bg-black/90">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
            <span className="text-xs font-semibold text-white">Wordle (diag)</span>
            <button
              type="button"
              className="rounded-md bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
              onClick={() => setWordleUrl(null)}
            >
              Close
            </button>
          </div>
          <iframe
            title="Wordle diagnostic"
            src={wordleUrl}
            className="min-h-0 w-full flex-1 border-0 bg-transparent"
          />
        </div>
      ) : null}
    </>
  );
}

export function DiagReadingScreen() {
  const adventureGameIframeRef = useRef<HTMLIFrameElement | null>(null);
  const { state, startSession, sendMessage, micMuted, toggleMicMute, analyserNodeRef } =
    useSession({
      adventureGameIframeRef,
    });

  const mapChildId = useMemo(() => {
    const fromUrl = readHomeworkMapPreviewChildFromSearch();
    if (fromUrl) return fromUrl;
    return (
      import.meta.env.VITE_DIAG_CHILD_ID?.trim().toLowerCase() || "creator"
    );
  }, []);

  const mapSession = useMapSession(adventureMapEnabled ? mapChildId : "");
  const companion = useMemo(() => cloneCompanionDefaults(), []);
  const [standaloneReadingVisible, setStandaloneReadingVisible] = useState(true);
  const [wordRadarFromProfile, setWordRadarFromProfile] = useState<{
    showTimer: boolean;
    timerSeconds?: number;
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
    fetch(`/api/profile/${encodeURIComponent(mapChildId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.wordRadar) return;
        const wr = data.wordRadar as {
          showTimer?: boolean;
          timerSeconds?: number;
          showKeyboard?: boolean;
          personalBests?: Record<string, number>;
          inputMode?: "whole-word" | "letter-by-letter" | "keyboard";
        };
        const gameWr = data.games?.["word-radar"] as
          | {
              inputMode?: "whole-word" | "letter-by-letter" | "keyboard";
              speakStyle?: "option-a" | "option-b";
              keyboardStyle?: "option-b" | "option-c";
              showTimer?: boolean;
              timerSeconds?: number;
            }
          | undefined;
        const pb = wr.personalBests;
        setWordRadarFromProfile({
          showTimer: gameWr?.showTimer ?? (wr.showTimer === true),
          timerSeconds:
            typeof gameWr?.timerSeconds === "number" && gameWr.timerSeconds > 0
              ? gameWr.timerSeconds
              : typeof wr.timerSeconds === "number" && wr.timerSeconds > 0
                ? wr.timerSeconds
                : undefined,
          showKeyboard: gameWr?.inputMode === "keyboard" || wr.showKeyboard === true,
          inputMode: wr.inputMode ?? gameWr?.inputMode,
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
  }, [mapChildId]);

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
          childId={mapChildId}
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
    timerSeconds: 20,
    showKeyboard: false,
    inputMode: "letter-by-letter" as const,
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
            childId={mapChildId}
            mapSession={mapSession}
            showFlowGameBackChrome
            onGameIframeMount={handleGameIframeMount}
            wordRadarFromProfile={
              wordRadarFromProfile ?? {
                showTimer: true,
                timerSeconds: 20,
                showKeyboard: false,
                inputMode: "letter-by-letter",
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
          childId={mapChildId}
          companion={companion}
          toggledOff={false}
          mode="portrait"
          micMuted={micMuted}
          onToggleMute={toggleMicMute}
          analyserNodeRef={analyserNodeRef}
        />
        <WordRadarDiagPanel
          adventureMapEnabled
          interimTranscript={liveFlowStt}
          mapChildId={mapChildId}
          sessionChildDisplayName={
            state.phase === "active" ? (state.childName ?? "") : ""
          }
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
        childId={mapChildId}
        companion={companion}
        toggledOff={false}
        mode="portrait"
        micMuted={micMuted}
        onToggleMute={toggleMicMute}
        analyserNodeRef={analyserNodeRef}
      />
      <WordRadarDiagPanel
        adventureMapEnabled={false}
        interimTranscript={liveFlowStt}
        mapChildId={mapChildId}
        sessionChildDisplayName={
          state.phase === "active" ? (state.childName ?? "") : ""
        }
        sendMessage={sendMessage}
        wordRadar={wordRadarUi}
      />
    </>
  );
}
