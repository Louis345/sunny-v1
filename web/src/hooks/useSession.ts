import { useState, useRef, useCallback, useEffect } from "react";
import {
  applyBlackboardMessage,
  clearedBlackboardState,
} from "../../../src/shared/canvasBlackboardSync";
import type {
  OverlayField,
  WorksheetInteractionMode,
} from "../../../src/server/assignment-player";
import { TEACHING_TOOLS, REWARD_GAMES } from "../../../src/server/games/registry";
import {
  DEFAULT_READING_CANVAS_PREFERENCES,
  type ReadingCanvasPreferences,
} from "../../../src/shared/readingCanvasPreferences";
import type { CompanionEventPayload } from "../../../src/shared/companionTypes";
import { gameIframeRef } from "../components/Canvas";
import { shouldRenderTeachingContent } from "../utils/canvasLayout";
import {
  ensurePlaybackAnalyser,
  resetAudioAnalyser,
} from "../utils/audioAnalyser";

type GameMode = keyof typeof TEACHING_TOOLS | keyof typeof REWARD_GAMES;

const GAME_MODES = new Set<string>([
  ...Object.keys(TEACHING_TOOLS),
  ...Object.keys(REWARD_GAMES),
]) as ReadonlySet<string>;

const REWARD_GAME_MODES = new Set(Object.keys(REWARD_GAMES));

const BASE_CANVAS_MODES = [
  "idle",
  "teaching",
  "worksheet_pdf",
  "reward",
  "riddle",
  "championship",
  "place_value",
  "spelling",
  "karaoke",
  "sound_box",
  "clock",
  "score_meter",
] as const;

type CanvasStateMode = (typeof BASE_CANVAS_MODES)[number] | GameMode;

const VALID_CANVAS_MODES: CanvasStateMode[] = [
  ...BASE_CANVAS_MODES,
  ...Array.from(GAME_MODES),
] as CanvasStateMode[];

// --- Helpers ---

/** Post a message to the Word Builder / game iframe via the stable module-level ref.
 *  Falls back to a 500ms retry if the iframe hasn't mounted yet. */
function sendToIframe(data: unknown): void {
  const iframe = gameIframeRef?.current;
  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage(data, "*");
    return;
  }
  // Retry once after 500ms if not mounted yet
  setTimeout(() => {
    gameIframeRef?.current?.contentWindow?.postMessage(data, "*");
  }, 500);
}

// --- Types ---

interface CompanionConfig {
  childName: string;
  companionName: string;
  emoji: string;
  accentColor: string;
  accentBg: string;
  voiceId: string;
  openingLine: string;
  goodbye: string;
}

interface RewardEvent {
  rewardStyle: "flash" | "takeover" | "none";
  svg?: string;
  lottieData?: Record<string, unknown>;
  label?: string;
  displayDuration_ms: number;
}

interface PlaceValueData {
  operandA: number;
  operandB: number;
  operation?: "addition" | "subtraction";
  layout?: "expanded" | "column";
  activeColumn?: "hundreds" | "tens" | "ones";
  scaffoldLevel?: "full" | "partial" | "minimal" | "hint";
  revealedColumns?: Array<"hundreds" | "tens" | "ones">;
}

export interface BlackboardState {
  gesture: "flash" | "reveal" | "mask" | "clear" | null;
  word?: string;
  maskedWord?: string;
  duration?: number;
  flashKey?: number;
}

interface CanvasState {
  mode: CanvasStateMode;
  canvasRevision?: number;
  svg?: string;
  lottieData?: Record<string, unknown>;
  label?: string;
  content?: string;
  phonemeBoxes?: { position: string; value: string; highlighted: boolean }[];
  pendingAnswer?: string;
  animationKey?: number;
  placeValueData?: PlaceValueData;
  spellingWord?: string;
  spellingRevealed?: string[];
  showWord?: "hidden" | "hint" | "always";
  compoundBreak?: number;
  streakCount?: number;
  personalBest?: number;
  gameUrl?: string;
  gameWord?: string;
  gamePlayerName?: string;
  wordBuilderRound?: number;
  wordBuilderMode?: string;
  rewardGameConfig?: Record<string, unknown>;
  pdfAssetUrl?: string;
  pdfPage?: number;
  pdfPageWidth?: number;
  pdfPageHeight?: number;
  activeProblemId?: string;
  activeFieldId?: string;
  overlayFields?: OverlayField[];
  interactionMode?: WorksheetInteractionMode;
  clockHour?: number;
  clockMinute?: number;
  clockDisplay?: string;
  /** Reading / karaoke — ordered tokens for highlight UI */
  karaokeWords?: string[];
}

interface TurnPolicy {
  id: "short_expected_response" | "open_response" | "narration" | "listen_only";
  expectedResponse: "short" | "open" | "none";
  allowCaptureDuringPlayback: boolean;
  interruptible: boolean;
}

type SessionPhase = "picker" | "connecting" | "active" | "ended";

interface SessionState {
  phase: SessionPhase;
  childName: string | null;
  companion: CompanionConfig | null;
  companionText: string;
  interimTranscript: string;
  canvas: CanvasState;
  blackboard: BlackboardState;
  correctStreak: number;
  sessionPhase: string;
  sessionState: string;
  sessionType: string;
  canvasOwner: string;
  reward: RewardEvent | null;
  error: string | null;
  loadingMessage: string | null;
  /** Server sets true when DEBUG_CLAUDE — show canvas test overlay off localhost if needed */
  debugMode: boolean;
  /** Karaoke / reading UI — from session_context + learning_profile */
  readingCanvas: ReadingCanvasPreferences;
  /** Optional Grok illustration after karaoke complete — diagnostics/reading polish */
  storyImageLoading: boolean;
  storyImageUrl: string | null;
  /** Voice WebSocket `companion_event` payloads (merged with map in App). */
  companionEvents: CompanionEventPayload[];
}

function isMathCanvas(content: string | undefined): boolean {
  if (!content) return false;
  return /[\d]+\s*([+\-×÷])\s*[\d]+/.test(content);
}

// Only show a transcript as a pending answer if it looks like a number.
// Prevents random speech ("of told me a little bit") from rendering
// as green text on the math canvas at 8rem.
function looksLikeNumber(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\d+$/.test(t)) return true;
  const numberWords = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|and|\s)+$/i;
  return numberWords.test(t);
}

/**
 * New karaoke `canvas_draw` → reset story illustration state for the next story.
 * Non-karaoke / non-idle modes clear overlay (worksheet, games, …).
 */
function storyIllustrationPatch(
  s: SessionState,
  mode: CanvasState["mode"],
  nextAnimationKey: number,
): Pick<SessionState, "storyImageLoading" | "storyImageUrl"> {
  if (mode !== "karaoke" && mode !== "idle") {
    return { storyImageLoading: false, storyImageUrl: null };
  }
  if (mode === "karaoke") {
    const prev = s.canvas.animationKey ?? 0;
    if (nextAnimationKey !== prev) {
      return { storyImageLoading: false, storyImageUrl: null };
    }
  }
  return {
    storyImageLoading: s.storyImageLoading,
    storyImageUrl: s.storyImageUrl,
  };
}

function getPlaybackCaptureConfig(policy: TurnPolicy) {
  if (policy.id === "short_expected_response") {
    return {
      rmsThreshold: 0.02,
      consecutiveFrames: 1,
    };
  }

  return {
    rmsThreshold: 0.04,
    consecutiveFrames: 3,
  };
}

const DEFAULT_TURN_POLICY: TurnPolicy = {
  id: "open_response",
  expectedResponse: "open",
  allowCaptureDuringPlayback: false,
  interruptible: true,
};

function urlWantsBrowserTts(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("tts") === "browser";
  } catch {
    return false;
  }
}

export function useSession() {
  const wsRef = useRef<WebSocket | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const playContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const serverDoneRef = useRef(false);
  const bargeInConsecutiveRef = useRef(0);
  const rollingBufferRef = useRef<string[]>([]);
  const finalizePlaybackRef = useRef<() => void>(() => {});
  const turnPolicyRef = useRef<TurnPolicy>(DEFAULT_TURN_POLICY);
  const debugBrowserTtsRef = useRef(false);
  const browserTtsAccumRef = useRef("");
  const browserTtsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<SessionState>({
    phase: "picker",
    childName: null,
    companion: null,
    companionText: "",
    interimTranscript: "",
    canvas: { mode: "idle" },
    blackboard: { gesture: null },
    correctStreak: 0,
    sessionPhase: "warmup",
    sessionState: "IDLE",
    sessionType: "freeform",
    canvasOwner: "companion",
    reward: null,
    error: null,
    loadingMessage: null,
    debugMode: false,
    readingCanvas: DEFAULT_READING_CANVAS_PREFERENCES,
    storyImageLoading: false,
    storyImageUrl: null,
    companionEvents: [],
  });

  const [micMuted, setMicMuted] = useState(false);
  const micMutedRef = useRef(false);
  micMutedRef.current = micMuted;

  // --- Refs for handler to avoid stale closure ---
  const setStateRef = useRef(setState);
  setStateRef.current = setState;

  const sendMessageRef = useRef<(type: string, payload?: Record<string, unknown>) => void>(() => {});
  const stopMicRef = useRef<() => void>(() => {});

  // --- WebSocket connection ---

  const sendMessage = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...payload }));
    }
  }, []);

  sendMessageRef.current = sendMessage;
  finalizePlaybackRef.current = () => {
    if (!serverDoneRef.current) return;
    if (isPlayingRef.current) return;
    if (audioQueueRef.current.length > 0) return;
    if (currentSourceRef.current) return;

    serverDoneRef.current = false;
    sendMessageRef.current("playback_done");
    for (const frame of rollingBufferRef.current) {
      sendMessageRef.current("audio", { data: frame });
    }
    rollingBufferRef.current = [];
    bargeInConsecutiveRef.current = 0;
  };

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg, setStateRef, stopMicRef);
    };

    ws.onerror = () => {
      setStateRef.current((s) => ({ ...s, error: "Connection lost" }));
    };

    ws.onclose = () => {
      wsRef.current = null;
    };
  }, []);

  // --- Handle server messages ---

  function handleServerMessage(
    msg: Record<string, unknown>,
    setStateRef: React.MutableRefObject<typeof setState>,
    stopMicRef: React.MutableRefObject<() => void>
  ) {
    switch (msg.type) {
      case "session_started": {
        const m = msg as Record<string, string>;
        debugBrowserTtsRef.current =
          (msg as Record<string, unknown>).debugBrowserTts === true ||
          urlWantsBrowserTts();
        turnPolicyRef.current = DEFAULT_TURN_POLICY;
        const debugMode =
          (msg as Record<string, unknown>).debugMode === true;
        setStateRef.current((s) => ({
          ...s,
          phase: "active",
          loadingMessage: null,
          childName: m.childName ?? m.child ?? "",
          debugMode,
          storyImageLoading: false,
          storyImageUrl: null,
          companionEvents: [],
          companion: {
            childName: m.childName ?? m.child ?? "",
            companionName: m.companionName ?? m.companion ?? "",
            emoji: m.emoji ?? "🌟",
            accentColor: m.accentColor ?? "#7C3AED",
            accentBg: m.accentBg ?? "#F3E8FF",
            voiceId: m.voiceId ?? "",
            openingLine: m.openingLine ?? "",
            goodbye: m.goodbye ?? "",
          },
        }));
        break;
      }

      case "companion_event": {
        const payload = msg.payload;
        if (!payload || typeof payload !== "object") break;
        const pl = payload as Record<string, unknown>;
        if (typeof pl.childId !== "string" || typeof pl.timestamp !== "number") {
          break;
        }
        const ev = pl as unknown as CompanionEventPayload;
        setStateRef.current((s) => ({
          ...s,
          companionEvents: [...s.companionEvents, ev],
        }));
        break;
      }

      case "turn_policy":
        turnPolicyRef.current = {
          id:
            (msg.id as TurnPolicy["id"] | undefined) ??
            DEFAULT_TURN_POLICY.id,
          expectedResponse:
            (msg.expectedResponse as TurnPolicy["expectedResponse"] | undefined) ??
            DEFAULT_TURN_POLICY.expectedResponse,
          allowCaptureDuringPlayback:
            (msg.allowCaptureDuringPlayback as boolean | undefined) ??
            DEFAULT_TURN_POLICY.allowCaptureDuringPlayback,
          interruptible:
            (msg.interruptible as boolean | undefined) ??
            DEFAULT_TURN_POLICY.interruptible,
        };
        break;

      case "interim":
        setStateRef.current((s) => ({ ...s, interimTranscript: (msg.text as string) ?? "" }));
        break;

      case "final":
        browserTtsAccumRef.current = "";
        if (browserTtsDebounceRef.current) {
          clearTimeout(browserTtsDebounceRef.current);
          browserTtsDebounceRef.current = null;
        }
        setStateRef.current((s) => ({
          ...s,
          interimTranscript: "",
          companionText: "",
        }));
        break;

      case "echo_answer": {
        const text = msg.text as string;
        // Only update pendingAnswer when the transcript is actually a number —
        // non-numeric speech ("of told me a little bit") must never appear on canvas.
        if (looksLikeNumber(text)) {
          setStateRef.current((s) => ({
            ...s,
            canvas:
              s.canvas.mode === "teaching" && isMathCanvas(s.canvas.content)
                ? { ...s.canvas, pendingAnswer: text }
                : s.canvas,
          }));
        }
        break;
      }

      case "response_text": {
        const chunk = (msg.chunk as string) ?? "";
        setStateRef.current((s) => ({
          ...s,
          companionText: s.companionText + chunk,
        }));
        const useBrowserTts = debugBrowserTtsRef.current || urlWantsBrowserTts();
        if (useBrowserTts && chunk && typeof window !== "undefined" && window.speechSynthesis) {
          browserTtsAccumRef.current += chunk;
          if (browserTtsDebounceRef.current) {
            clearTimeout(browserTtsDebounceRef.current);
          }
          browserTtsDebounceRef.current = setTimeout(() => {
            browserTtsDebounceRef.current = null;
            const text = browserTtsAccumRef.current.trim();
            browserTtsAccumRef.current = "";
            if (!text) return;
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 0.9;
            u.pitch = 1.1;
            window.speechSynthesis.speak(u);
          }, 400);
        }
        break;
      }

      case "audio": {
        serverDoneRef.current = false;
        const audioData = base64ToArrayBuffer((msg.data as string) ?? "");
        audioQueueRef.current.push(audioData);
        if (!isPlayingRef.current) {
          playNextChunk();
        }
        break;
      }

      case "audio_done":
        serverDoneRef.current = true;
        finalizePlaybackRef.current();
        break;

      case "blackboard": {
        const b = msg as Record<string, unknown>;
        setStateRef.current((s) => {
          const { canvasIdle, blackboard } = applyBlackboardMessage(s.blackboard, {
            gesture: String(b.gesture ?? "clear"),
            word: b.word as string | undefined,
            maskedWord: b.maskedWord as string | undefined,
            duration: b.duration as number | undefined,
          });
          return { ...s, canvas: canvasIdle, blackboard };
        });
        break;
      }

      case "tool_call": {
        const toolName = msg.tool as string;
        const result = msg.result as Record<string, unknown> | undefined;
        const args = (msg.args ?? {}) as Record<string, unknown>;

        // Canvas tool — data may be in result.output, result, or args
        if (toolName === "showCanvas" || toolName === "show_canvas") {
          const rawOutput = result?.output ?? result ?? args;
          const data = (
            typeof rawOutput === "string"
              ? JSON.parse(rawOutput)
              : rawOutput
          ) as Record<string, unknown>;

          const mode = data.mode as CanvasState["mode"];
          const isSpelling = mode === "spelling";
          const isWordBuilder = mode === "word-builder";
          const isGameMode = GAME_MODES.has(mode);
          const isKaraoke = mode === "karaoke";
          setStateRef.current((s) => {
            const nextAnim = (s.canvas.animationKey ?? 0) + 1;
            const story = storyIllustrationPatch(s, mode, nextAnim);
            return {
            ...s,
            ...story,
            blackboard: clearedBlackboardState(),
            canvas: {
              mode: mode && VALID_CANVAS_MODES.includes(mode) ? mode : "idle",
              canvasRevision:
                typeof msg.canvasRevision === "number"
                  ? (msg.canvasRevision as number)
                  : undefined,
              svg: data.svg as string | undefined,
              lottieData: data.lottieData as Record<string, unknown> | undefined,
              label: data.label as string | undefined,
              content: data.content as string | undefined,
              phonemeBoxes: data.phonemeBoxes as CanvasState["phonemeBoxes"],
              placeValueData: data.placeValueData as PlaceValueData | undefined,
              spellingWord: isSpelling ? (data.spellingWord as string | undefined) : undefined,
              spellingRevealed: isSpelling ? (data.spellingRevealed as string[] | undefined) : undefined,
              compoundBreak: isSpelling ? (data.compoundBreak as number | undefined) : undefined,
              streakCount: isSpelling ? (data.streakCount as number | undefined) : undefined,
              personalBest: isSpelling ? (data.personalBest as number | undefined) : undefined,
              showWord: isSpelling ? (data.showWord as "hidden" | "hint" | "always" | undefined) : undefined,
              gameUrl: isGameMode ? (data.gameUrl as string | undefined) : undefined,
              gameWord: isGameMode ? (data.gameWord as string | undefined) : undefined,
              gamePlayerName: isGameMode
                ? (data.gamePlayerName as string | undefined)
                : undefined,
              wordBuilderRound: isWordBuilder ? (data.wordBuilderRound as number | undefined) : undefined,
              wordBuilderMode: isWordBuilder ? (data.wordBuilderMode as string | undefined) : undefined,
              rewardGameConfig: REWARD_GAME_MODES.has(mode)
                ? (data.rewardGameConfig as Record<string, unknown> | undefined)
                : undefined,
              pdfAssetUrl: data.pdfAssetUrl as string | undefined,
              pdfPage: data.pdfPage as number | undefined,
              pdfPageWidth: data.pdfPageWidth as number | undefined,
              pdfPageHeight: data.pdfPageHeight as number | undefined,
              activeProblemId: data.activeProblemId as string | undefined,
              activeFieldId: data.activeFieldId as string | undefined,
              overlayFields: data.overlayFields as OverlayField[] | undefined,
              interactionMode:
                data.interactionMode as WorksheetInteractionMode | undefined,
              clockHour: typeof data.clockHour === "number" ? data.clockHour : undefined,
              clockMinute:
                typeof data.clockMinute === "number" ? data.clockMinute : undefined,
              clockDisplay:
                typeof data.clockDisplay === "string" ? data.clockDisplay : undefined,
              karaokeWords: isKaraoke
                ? Array.isArray(data.karaokeWords)
                  ? (data.karaokeWords as string[])
                  : Array.isArray(data.words)
                    ? (data.words as string[])
                    : undefined
                : undefined,
              pendingAnswer: undefined,
              animationKey: nextAnim,
            },
          };
          });
          // canvas_done sent by Canvas when animation completes
        }

        if (toolName === "blackboard") {
          setStateRef.current((s) => {
            const { canvasIdle, blackboard } = applyBlackboardMessage(s.blackboard, {
              gesture: String(args.gesture ?? "clear"),
              word: args.word as string | undefined,
              maskedWord: args.maskedWord as string | undefined,
              duration: args.duration as number | undefined,
            });
            return { ...s, canvas: canvasIdle, blackboard };
          });
        }

        // sessionLog (and legacy names) streak tracking
        if (
          toolName === "sessionLog" ||
          toolName === "session_log" ||
          toolName === "logAttempt" ||
          toolName === "log_attempt" ||
          toolName === "logWorksheetAttempt" ||
          toolName === "log_worksheet_attempt"
        ) {
          const correct =
            result?.correct === true || args?.correct === true;
          setStateRef.current((s) => ({
            ...s,
            correctStreak: correct ? s.correctStreak + 1 : 0,
          }));
        }

        // mathProblem streak tracking (Reina math mode)
        if (toolName === "mathProblem" || toolName === "math_problem") {
          if (args?.childAnswer != null) {
            const output = result?.output ?? result;
            const parsed = typeof output === "string" ? JSON.parse(output) : output;
            const correct = (parsed as Record<string, unknown>)?.correct === true;
            setStateRef.current((s) => ({
              ...s,
              canvas:
                s.canvas.mode === "teaching" && isMathCanvas(s.canvas.content)
                  ? { ...s.canvas, pendingAnswer: String(args.childAnswer) }
                  : s.canvas,
              correctStreak: correct ? s.correctStreak + 1 : 0,
            }));
          }
        }
        break;
      }

      case "reward": {
        const m = msg as unknown as RewardEvent & { displayDuration_ms?: number };
        setStateRef.current((s) => ({ ...s, reward: m }));
        setTimeout(() => {
          setStateRef.current((s) => ({ ...s, reward: null }));
        }, m.displayDuration_ms ?? 3000);
        break;
      }

      case "phase":
        browserTtsAccumRef.current = "";
        if (browserTtsDebounceRef.current) {
          clearTimeout(browserTtsDebounceRef.current);
          browserTtsDebounceRef.current = null;
        }
        setStateRef.current((s) => ({
          ...s,
          sessionPhase: (msg.phase as string) ?? s.sessionPhase,
          companionText: "",
        }));
        break;

      case "session_state": {
        const state = msg.state as string;
        if (state === "LOADING") {
          browserTtsAccumRef.current = "";
          if (browserTtsDebounceRef.current) {
            clearTimeout(browserTtsDebounceRef.current);
            browserTtsDebounceRef.current = null;
          }
        }
        setStateRef.current((s) => {
          const next = state ?? s.sessionState;
          // Canvas is NOT cleared here. IDLE means "waiting for the child's
          // next input" — the math problem or word must remain visible so the
          // child can look at it and answer. Canvas resets when the server sends
          // canvas_draw:idle (session start, barge-in for ephemeral modes only,
          // or intentional clear). Worksheet / games stay up on barge-in.
          // LOADING = new assistant turn — reset bubble so response_text chunks
          // replace the prior line (never append server-driven lines onto old text).
          const companionText = next === "LOADING" ? "" : s.companionText;
          return { ...s, sessionState: next, companionText };
        });
        break;
      }

      case "story_image_loading":
        console.log("[ws] story image loading...");
        setStateRef.current((s) => ({
          ...s,
          storyImageLoading: true,
          storyImageUrl: null,
        }));
        break;

      case "story_image": {
        const u = msg.url;
        console.log("[ws] story image received:", u);
        setStateRef.current((s) => ({
          ...s,
          storyImageLoading: false,
          storyImageUrl: typeof u === "string" && u.length > 0 ? u : null,
        }));
        break;
      }

      case "session_context": {
        setStateRef.current((s) => {
          const rc = msg.readingCanvas as ReadingCanvasPreferences | undefined;
          const readingCanvas =
            rc &&
            typeof rc.fontSize === "number" &&
            typeof rc.wordsPerLine === "number"
              ? rc
              : s.readingCanvas;
          return {
            ...s,
            sessionType: (msg.sessionType as string) ?? s.sessionType,
            canvasOwner: (msg.canvasOwner as string) ?? s.canvasOwner,
            correctStreak: typeof msg.correctStreak === "number" ? msg.correctStreak : s.correctStreak,
            sessionPhase: (msg.sessionPhase as string) ?? s.sessionPhase,
            readingCanvas,
          };
        });
        break;
      }

      case "canvas_draw": {
        const mode = (msg.mode ?? (msg.args as Record<string, unknown>)?.mode) as CanvasState["mode"];
        const content = (msg.content ?? (msg.args as Record<string, unknown>)?.content) as string | undefined;
        const label = (msg.label ?? (msg.args as Record<string, unknown>)?.label) as string | undefined;
        if (mode && VALID_CANVAS_MODES.includes(mode)) {
          const data = (msg.args ?? msg) as Record<string, unknown>;
          const isSpelling = mode === "spelling";
          const isWordBuilder = mode === "word-builder";
          const isGameMode = GAME_MODES.has(mode);
          const isKaraoke = mode === "karaoke";
          setStateRef.current((s) => {
            const nextAnim = (s.canvas.animationKey ?? 0) + 1;
            const story = storyIllustrationPatch(s, mode, nextAnim);
            const nextCanvas: CanvasState = {
              mode,
              canvasRevision:
                typeof msg.canvasRevision === "number"
                  ? (msg.canvasRevision as number)
                  : typeof data.canvasRevision === "number"
                    ? (data.canvasRevision as number)
                    : undefined,
              content,
              label,
              svg: data.svg as string | undefined,
              lottieData: data.lottieData as Record<string, unknown> | undefined,
              phonemeBoxes: data.phonemeBoxes as CanvasState["phonemeBoxes"],
              placeValueData: data.placeValueData as PlaceValueData | undefined,
              spellingWord: isSpelling ? (data.spellingWord as string | undefined) : undefined,
              spellingRevealed: isSpelling ? (data.spellingRevealed as string[] | undefined) : undefined,
              compoundBreak: isSpelling ? (data.compoundBreak as number | undefined) : undefined,
              streakCount: isSpelling ? (data.streakCount as number | undefined) : undefined,
              personalBest: isSpelling ? (data.personalBest as number | undefined) : undefined,
              showWord: isSpelling ? (data.showWord as "hidden" | "hint" | "always" | undefined) : undefined,
              gameUrl: isGameMode ? (data.gameUrl as string | undefined) : undefined,
              gameWord: isGameMode ? (data.gameWord as string | undefined) : undefined,
              gamePlayerName: isGameMode
                ? (data.gamePlayerName as string | undefined)
                : undefined,
              wordBuilderRound: isWordBuilder ? (data.wordBuilderRound as number | undefined) : undefined,
              wordBuilderMode: isWordBuilder ? (data.wordBuilderMode as string | undefined) : undefined,
              rewardGameConfig: REWARD_GAME_MODES.has(mode)
                ? (data.rewardGameConfig as Record<string, unknown> | undefined)
                : undefined,
              pdfAssetUrl: data.pdfAssetUrl as string | undefined,
              pdfPage: data.pdfPage as number | undefined,
              pdfPageWidth: data.pdfPageWidth as number | undefined,
              pdfPageHeight: data.pdfPageHeight as number | undefined,
              activeProblemId: data.activeProblemId as string | undefined,
              activeFieldId: data.activeFieldId as string | undefined,
              overlayFields: data.overlayFields as OverlayField[] | undefined,
              interactionMode:
                data.interactionMode as WorksheetInteractionMode | undefined,
              clockHour: typeof data.clockHour === "number" ? data.clockHour : undefined,
              clockMinute:
                typeof data.clockMinute === "number" ? data.clockMinute : undefined,
              clockDisplay:
                typeof data.clockDisplay === "string" ? data.clockDisplay : undefined,
              karaokeWords: isKaraoke
                ? Array.isArray(data.karaokeWords)
                  ? (data.karaokeWords as string[])
                  : Array.isArray(data.words)
                    ? (data.words as string[])
                    : undefined
                : undefined,
              pendingAnswer: undefined,
              animationKey: nextAnim,
            };
            console.log("[canvas_draw] received:", {
              mode: nextCanvas.mode,
              hasSvg: !!nextCanvas.svg,
              svgLength: nextCanvas.svg?.length ?? 0,
              hasContent: !!nextCanvas.content,
              contentPreview: nextCanvas.content?.slice(0, 40),
              willRender: shouldRenderTeachingContent(nextCanvas),
            });
            return {
              ...s,
              ...story,
              blackboard: clearedBlackboardState(),
              canvas: nextCanvas,
            };
          });
        }
        break;
      }

      case "game_message": {
        const forward = msg.forward as Record<string, unknown> | undefined;
        if (forward) {
          sendToIframe(forward);
        }
        break;
      }

      case "session_ended":
        turnPolicyRef.current = DEFAULT_TURN_POLICY;
        setMicMuted(false);
        setStateRef.current((s) => ({
          ...s,
          phase: "ended",
          canvas: { mode: "idle" },
          blackboard: { gesture: null },
          reward: null,
          sessionState: "IDLE",
          readingCanvas: DEFAULT_READING_CANVAS_PREFERENCES,
        }));
        stopMicRef.current();
        break;

      case "loading_status":
        setStateRef.current((s) => ({
          ...s,
          loadingMessage: (msg.message as string) ?? null,
        }));
        break;

      case "error":
        setStateRef.current((s) => ({ ...s, error: (msg.message as string) ?? "Unknown error" }));
        break;
    }
  }

  // --- Audio: Mic (browser → server) ---

  const startMic = useCallback(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        mediaStreamRef.current = stream;
        stream.getAudioTracks().forEach((t) => {
          t.enabled = !micMutedRef.current;
        });

        const audioCtx = new AudioContext({ sampleRate: 16000 });
        micContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        const silence = audioCtx.createGain();
        silence.gain.value = 0;

        processor.onaudioprocess = (e) => {
          if (micMutedRef.current) return;

          const float32 = e.inputBuffer.getChannelData(0);

          // Always convert — needed for both rolling buffer and Deepgram send
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
          }
          const base64 = arrayBufferToBase64(int16.buffer);

          // Keep a ~1s rolling buffer so Deepgram gets a head start when
          // transitioning from gated (TTS playing) to ungated.
          rollingBufferRef.current.push(base64);
          if (rollingBufferRef.current.length > 4) {
            rollingBufferRef.current.shift();
          }

          if (isPlayingRef.current) {
            let sum = 0;
            for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
            const rms = Math.sqrt(sum / float32.length);
            const turnPolicy = turnPolicyRef.current;
            const playbackCapture = getPlaybackCaptureConfig(turnPolicy);

            if (turnPolicy.interruptible && rms > playbackCapture.rmsThreshold) {
              // While assistant audio is still audible, speech is always treated
              // as a barge-in candidate. The server re-opens turn-taking only
              // after the browser confirms playback has actually finished.
              bargeInConsecutiveRef.current++;
              if (
                bargeInConsecutiveRef.current >=
                playbackCapture.consecutiveFrames
              ) {
                sendMessageRef.current("barge_in");
                serverDoneRef.current = false;
                audioQueueRef.current = [];
                isPlayingRef.current = false;
                if (currentSourceRef.current) {
                  try { currentSourceRef.current.stop(); } catch { /* already stopped */ }
                  currentSourceRef.current = null;
                }
                for (const frame of rollingBufferRef.current) {
                  sendMessageRef.current("audio", { data: frame });
                }
                rollingBufferRef.current = [];
                bargeInConsecutiveRef.current = 0;
              }
              return;
            }

            bargeInConsecutiveRef.current = 0;
            return;
          }

          sendMessageRef.current("audio", { data: base64 });
        };

        source.connect(processor);
        processor.connect(silence);
        silence.connect(audioCtx.destination);
      } catch (err) {
        console.error("Mic access failed:", err);
        setStateRef.current((s) => ({ ...s, error: "Microphone access denied" }));
      }
    })();
  }, []);

  const stopMic = useCallback(() => {
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }
    if (micContextRef.current) {
      micContextRef.current.close();
      micContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  stopMicRef.current = stopMic;

  // --- Audio: Speaker (server → browser) ---
  // ElevenLabs sends PCM 16-bit signed mono at 24000 Hz (pcm_24000)

  async function playNextChunk() {
    if (audioQueueRef.current.length === 0) {
      // Brief grace period before re-opening the mic — lets residual room
      // echo from the speakers dissipate so Deepgram doesn't pick it up.
      setTimeout(() => {
        isPlayingRef.current = false;
        finalizePlaybackRef.current();
      }, 150);
      return;
    }

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;

    try {
      if (!playContextRef.current || playContextRef.current.state === "closed") {
        playContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      if (playContextRef.current.state === "suspended") {
        await playContextRef.current.resume();
      }
      const ctx = playContextRef.current;
      const audioBuffer = pcmToAudioBuffer(ctx, chunk);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      const analyser = ensurePlaybackAnalyser(ctx);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      currentSourceRef.current = source;
      source.onended = () => {
        if (currentSourceRef.current === source) {
          currentSourceRef.current = null;
        }
        playNextChunk();
      };
      source.start();
    } catch (err) {
      console.error("PCM playback error:", err);
      isPlayingRef.current = false;
      playNextChunk();
    }
  }

  // --- Actions ---

  const startSession = useCallback(
    (
      childName: string,
      options?: { diagKiosk?: boolean },
    ) => {
      setState((s) => ({ ...s, phase: "connecting", error: null }));
      connect();

      const diagKiosk = options?.diagKiosk === true;
      const wsChild = diagKiosk ? "creator" : childName;

      let timeoutId: ReturnType<typeof setTimeout>;
      const check = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          clearInterval(check);
          clearTimeout(timeoutId);
          sendMessage("start_session", {
            child: wsChild,
            ...(diagKiosk ? { diagKiosk: true } : {}),
          });
          startMic();
        }
      }, 100);

      timeoutId = setTimeout(() => {
        clearInterval(check);
        setStateRef.current((s) => ({
          ...s,
          error: "Connection timeout",
          phase: "picker",
          debugMode: false,
          storyImageLoading: false,
          storyImageUrl: null,
        }));
      }, 10000);
    },
    [connect, sendMessage, startMic]
  );

  const bargeIn = useCallback(() => {
    sendMessage("barge_in");
    serverDoneRef.current = false;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch { /* already stopped */ }
      currentSourceRef.current = null;
    }
    for (const frame of rollingBufferRef.current) {
      sendMessage("audio", { data: frame });
    }
    rollingBufferRef.current = [];
    bargeInConsecutiveRef.current = 0;
  }, [sendMessage]);

  const endSession = useCallback(() => {
    // Stop mic immediately — don't wait for the server session_ended round-trip.
    stopMicRef.current();
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    serverDoneRef.current = false;
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch { /* already stopped */ }
      currentSourceRef.current = null;
    }
    sendMessage("end_session");
  }, [sendMessage]);

  const toggleMicMute = useCallback(() => {
    setMicMuted((m) => !m);
  }, []);

  useEffect(() => {
    mediaStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !micMuted;
    });
  }, [micMuted]);

  const resetToPicker = useCallback(() => {
    turnPolicyRef.current = DEFAULT_TURN_POLICY;
    setMicMuted(false);
    setState({
      phase: "picker",
      childName: null,
      companion: null,
      companionText: "",
      interimTranscript: "",
      canvas: { mode: "idle" },
      blackboard: { gesture: null },
      correctStreak: 0,
      sessionPhase: "warmup",
      sessionState: "IDLE",
      sessionType: "freeform",
      canvasOwner: "companion",
      reward: null,
      error: null,
      loadingMessage: null,
      debugMode: false,
      readingCanvas: DEFAULT_READING_CANVAS_PREFERENCES,
      storyImageLoading: false,
      storyImageUrl: null,
      companionEvents: [],
    });
    wsRef.current?.close();
    wsRef.current = null;
    stopMic();
  }, [stopMic]);

  useEffect(() => {
    function handleGameMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || typeof data !== "object") return;
      const t = (data as { type?: string }).type;
      if (
        t &&
        [
          "ready",
          "correct",
          "round_complete",
          "round_failed",
          "game_complete",
        ].includes(t)
      ) {
        console.log(`  🎮 forwarded to server: ${t}`);
        sendMessageRef.current("game_event", { event: data });
      }
    }
    window.addEventListener("message", handleGameMessage);
    return () => window.removeEventListener("message", handleGameMessage);
  }, []);

  useEffect(() => {
    return () => {
      stopMic();
      if (playContextRef.current) {
        playContextRef.current.close();
        playContextRef.current = null;
      }
      resetAudioAnalyser();
      wsRef.current?.close();
    };
  }, [stopMic]);

  const sendCanvasDone = useCallback(() => {
    console.log("  🖼️  sending canvas_done", {
      canvasRevision: state.canvas.canvasRevision,
      mode: state.canvas.mode,
    });
    sendMessage("canvas_done", {
      canvasRevision: state.canvas.canvasRevision,
      mode: state.canvas.mode,
    });
  }, [sendMessage, state.canvas.canvasRevision, state.canvas.mode]);

  const submitWorksheetAnswer = useCallback(
    (payload: { problemId: string; fieldId: string; value: string }) => {
      sendMessage("worksheet_answer", payload);
    },
    [sendMessage],
  );

  const handleOverlayFieldChange = useCallback(
    (payload: {
      problemId: string;
      field: OverlayField;
      fields: OverlayField[];
      pageWidth: number;
      pageHeight: number;
    }) => {
      console.log("[overlay-authoring]", payload);
      if (typeof window === "undefined") return;
      const overlayWindow = window as Window & {
        __sunnyOverlayDrafts?: Record<string, unknown>;
      };
      overlayWindow.__sunnyOverlayDrafts = {
        ...(overlayWindow.__sunnyOverlayDrafts ?? {}),
        [payload.problemId]: payload,
      };
    },
    [],
  );

  return {
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
    companionEvents: state.companionEvents,
  };
}

// --- Helpers ---

function pcmToAudioBuffer(ctx: AudioContext, arrayBuffer: ArrayBuffer): AudioBuffer {
  const int16 = new Int16Array(arrayBuffer);
  const audioBuffer = ctx.createBuffer(1, int16.length, 24000);
  const channel = audioBuffer.getChannelData(0);
  for (let i = 0; i < int16.length; i++) {
    channel[i] = int16[i] / 32768;
  }
  return audioBuffer;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
