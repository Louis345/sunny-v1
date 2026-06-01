import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as PointEvt,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Send, Video, X } from "lucide-react";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { CompanionMotor } from "../companion/CompanionMotor";
import {
  CompanionVfxLayer,
  type CompanionVfxLevel,
  type CompanionVfxPreset,
} from "../companion/CompanionVfxLayer";
import {
  COMPANION_MANIFEST,
  type CompanionManifestEntry,
} from "../companion/companions.generated";
import type {
  AnimationName,
  CameraAngle,
  CompanionCommand,
} from "../../../src/shared/companions/companionContract";
import { COMPANION_ANIMATION_IDS } from "../../../src/shared/companions/companionContract";
import { COMPANION_CAPABILITIES } from "../../../src/shared/companions/registry";
import { validateCompanionCommand } from "../../../src/shared/companions/validateCompanionCommand";
import { mergeCompanionConfigWithDefaults } from "../../../src/shared/companionTypes";
import { ensurePlaybackAnalyser } from "../utils/audioAnalyser";
import { useDeepgramVideoCallStt } from "../hooks/useDeepgramVideoCallStt";
import {
  buildCompanionVideoTraceUrl,
  createCompanionVideoCallTraceId,
  createCompanionVideoCallTurnId,
  detectCompanionVideoCallLoop,
  emitCompanionVideoCallTrace,
} from "../utils/companionVideoCallTrace";
import { loadCompanionVrm } from "../utils/loadCompanionVrm";
import {
  StorybookFootlights,
  StorybookPrimaryButton,
  StorybookSignatureButton,
  StorybookSparkles,
} from "./StorybookShowroomChrome";
import {
  CrystalDotNav,
  CrystalIdentityBlock,
  CrystalPedestal,
  CrystalPrimaryButton,
  CrystalSignatureButton,
  CrystalSpotlight,
} from "./CrystalAtelierChrome";
import {
  CompanionTicTacToe,
  type CompanionTicTacToeBanter,
  type CompanionTicTacToeGameEvent,
  type CompanionTicTacToeMark,
} from "./CompanionTicTacToe";
import {
  createCompanionActivityThinkingCommand,
  resolveCompanionActivityPhase,
  resolveCompanionConversationMode,
  selectCompanionActivityContextForTalk,
  shouldRequestCompanionActivityAiReaction,
  type CompanionConversationMode,
} from "./CompanionActivityRuntime";
import {
  CompanionVideoCallOverlay,
  type CompanionVideoCompanionView,
  type CompanionVideoCallLayout,
} from "./CompanionVideoCallOverlay";

export const DEFAULT_SHOWROOM_THEME = "aurora";

export const SHOWROOM_THEMES = [
  {
    id: "aurora",
    displayName: "Aurora Hall",
    shortDisplayName: "Aurora",
    chrome: "aurora",
    qaMarker: "showroom-theme-aurora",
    v1Available: true,
    accent: "#6D5EF5",
    foreground: "#f8fafc",
    mutedForeground: "rgba(248,250,252,0.68)",
    rootBackground: "#0f0a1e",
    controlBackground: "rgba(15,23,42,0.72)",
    controlBorder: "rgba(255,255,255,0.28)",
    controlForeground: "#f8fafc",
    primaryBackground: "#6D5EF5",
    primaryForeground: "#ffffff",
    sparkleColor: "#fef3c7",
    floorGlow: "radial-gradient(ellipse 80% 30% at 50% 100%, #1a1040, transparent)",
    loadingBackground:
      "radial-gradient(circle at 50% 34%, rgba(109,94,245,0.28), transparent 34%), rgba(15,10,30,0.94)",
  },
  {
    id: "storybook",
    displayName: "Storybook Proscenium",
    shortDisplayName: "Storybook",
    sceneLabel: "ACT ONE",
    scenePrompt: "Three friends step into the light. Pick one to begin.",
    chrome: "storybook",
    qaMarker: "showroom-theme-storybook",
    v1Available: true,
    accent: "#d4a948",
    foreground: "#fbf3dc",
    mutedForeground: "rgba(251,243,220,0.7)",
    rootBackground: "#170713",
    controlBackground: "rgba(42,10,29,0.78)",
    controlBorder: "rgba(251,238,193,0.34)",
    controlForeground: "#fbf3dc",
    primaryBackground: "linear-gradient(180deg, #f7e3a3 0%, #d4a948 62%, #a17a2a 100%)",
    primaryForeground: "#2a1606",
    sparkleColor: "#fbeec1",
    floorGlow: "radial-gradient(ellipse 78% 28% at 50% 100%, rgba(212,169,72,0.34), transparent 68%)",
    loadingBackground:
      "radial-gradient(circle at 50% 34%, rgba(212,169,72,0.3), transparent 34%), rgba(27,8,21,0.95)",
  },
  {
    id: "crystal",
    displayName: "Crystal Atelier",
    shortDisplayName: "Crystal",
    chrome: "crystal",
    qaMarker: "showroom-theme-crystal",
    v1Available: true,
    accent: "#7c5cff",
    foreground: "#27214a",
    mutedForeground: "rgba(59,47,122,0.64)",
    rootBackground: "#ebe6ff",
    controlBackground: "rgba(255,255,255,0.68)",
    controlBorder: "rgba(124,92,255,0.3)",
    controlForeground: "#3b2f7a",
    primaryBackground: "linear-gradient(135deg, #7c5cff, #5b3ee0)",
    primaryForeground: "#ffffff",
    sparkleColor: "#c7d2fe",
    floorGlow: "radial-gradient(ellipse 78% 30% at 50% 100%, rgba(124,92,255,0.26), transparent 68%)",
    loadingBackground:
      "radial-gradient(circle at 50% 34%, rgba(124,92,255,0.22), transparent 34%), rgba(235,230,255,0.95)",
  },
] as const;

export type ShowroomTheme = (typeof SHOWROOM_THEMES)[number]["id"];
type ShowroomThemeConfig = (typeof SHOWROOM_THEMES)[number];
type ShowroomThemeState = {
  theme: ShowroomTheme;
  currentIndex: number;
};

const SHOWROOM_THEME_IDS = new Set<string>(
  SHOWROOM_THEMES.map((theme) => theme.id),
);

export function resolveShowroomTheme(
  theme: string | null | undefined,
): ShowroomTheme {
  return theme && SHOWROOM_THEME_IDS.has(theme)
    ? (theme as ShowroomTheme)
    : DEFAULT_SHOWROOM_THEME;
}

export function resolveAvailableShowroomThemes(
  availableThemes?: readonly (string | null | undefined)[],
): ShowroomTheme[] {
  if (!availableThemes) {
    return SHOWROOM_THEMES.map((theme) => theme.id);
  }

  const normalized = new Set<ShowroomTheme>([DEFAULT_SHOWROOM_THEME]);
  for (const theme of availableThemes) {
    if (theme && SHOWROOM_THEME_IDS.has(theme)) {
      normalized.add(theme as ShowroomTheme);
    }
  }
  return [...normalized];
}

function resolveShowroomThemeWithinAvailability(
  theme: string | null | undefined,
  availableThemes: readonly ShowroomTheme[],
): ShowroomTheme {
  const resolved = resolveShowroomTheme(theme);
  return availableThemes.includes(resolved) ? resolved : DEFAULT_SHOWROOM_THEME;
}

export function getNextShowroomThemeState(
  state: ShowroomThemeState,
  direction: -1 | 1,
  availableThemes?: readonly (string | null | undefined)[],
): ShowroomThemeState {
  const themes = resolveAvailableShowroomThemes(availableThemes);
  const currentTheme = resolveShowroomThemeWithinAvailability(state.theme, themes);
  const currentIndex = themes.indexOf(currentTheme);
  const nextIndex = (currentIndex + direction + themes.length) % themes.length;
  return {
    ...state,
    theme: themes[nextIndex] ?? DEFAULT_SHOWROOM_THEME,
  };
}

export function shouldShowShowroomCompanionDots(
  theme: ShowroomTheme,
  entryCount: number,
  spotlightOpen: boolean,
): boolean {
  return theme === "aurora" && entryCount > 1 && !spotlightOpen;
}

function getShowroomThemeConfig(theme: ShowroomTheme): ShowroomThemeConfig {
  return (
    SHOWROOM_THEMES.find((candidate) => candidate.id === theme) ??
    SHOWROOM_THEMES[0]
  );
}

function resolveInitialShowroomTheme(initialTheme: ShowroomTheme | undefined) {
  if (typeof window === "undefined") {
    return initialTheme ?? DEFAULT_SHOWROOM_THEME;
  }
  const queryTheme = new URLSearchParams(window.location.search).get(
    "showroomTheme",
  );
  return queryTheme ? resolveShowroomTheme(queryTheme) : initialTheme ?? DEFAULT_SHOWROOM_THEME;
}

export type CompanionShowroomProps = {
  /**
   * Called with the chosen companionId when the child confirms their pick.
   * The parent handles navigation / persistence.
   */
  onSelect: (companionId: string) => void;

  /**
   * Returns the intro speech text for a given companion.
   * Currently powers the on-screen subtitle; designed so ElevenLabs TTS
   * (and later Claude streaming) can drop in as the text source without
   * changing this component.
   * Signature is intentionally synchronous — caller pre-fetches if async.
   */
  getText: (companionId: string) => string;

  /**
   * Optional bonus-point values per companion.
   * { [companionId]: number }
   * Displayed on the stats card in the spotlight.
   */
  bonusPoints?: Record<string, number>;

  /**
   * Child's first name for personalised labels ("Pick me, Ila!").
   * Omit for generic labels.
   */
  childName?: string;

  /**
   * When true, use `generatedBackgroundUrl` as the showroom backdrop.
   * When false or when no URL is available, use the built-in stage background.
   */
  useGeneratedBackground?: boolean;

  /**
   * Server-generated image URL, for example from `/api/grok-image`.
   * The component never calls Grok directly so API keys stay server-side.
   */
  generatedBackgroundUrl?: string | null;

  /**
   * Enables soft generated background music after the first user gesture.
   * Browsers block autoplay, so the component starts it on click/key interaction.
   */
  enableBackgroundMusic?: boolean;

  /**
   * True while the parent is asking the server to enrich the stage with a generated image.
   * Used only to pace the intro curtain; failures should set this back to false.
   */
  generatedBackgroundLoading?: boolean;

  /**
   * Initial visual room for the showroom. URL query `showroomTheme` wins when present.
   */
  initialTheme?: ShowroomTheme;

  /**
   * Future economy/talent gate: v1 passes all themes, but callers can narrow this.
   * Aurora Hall is always retained as the safe default.
   */
  availableThemes?: ShowroomTheme[];

  /**
   * Fires when the child cycles to another room. V1 does not persist the choice.
   */
  onThemeChange?: (theme: ShowroomTheme) => void;

  /**
   * Future reward surfaces can pass explicit call context while reusing this UI.
   * The showroom default remains previewing.
   */
  videoCallContext?: CompanionVideoCallContext;
};

type SlotName = "prev" | "current" | "next" | "hidden";
type CompanionRenderer = WebGPURenderer | THREE.WebGLRenderer;

type CarouselSlot = {
  slot: SlotName;
  entry: CompanionManifestEntry;
};

type ConfettiParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
};

type AmbientMusicHandle = {
  stop: () => void;
};

type SpeakingLine = "intro" | "plead";
type GestureLine = SpeakingLine | "meet";
type SignatureMoveLevel = "idle" | "focused" | "powered_up" | "limit_break";
export type CompanionShowroomGestureProfile = {
  meet?: string;
  intro?: string[];
  plead?: string[];
  specialDance?: string;
};
export type ShowroomSpeechGesturePlan = {
  sequence: string[];
  sustainPrimary: boolean;
  intervalMs: number | null;
};

const AWKWARD_SPEECH_GESTURE_REPLACEMENTS: Readonly<Record<string, string>> = {
  wave: "talking",
  dance_victory: "talking",
  surprise_jump: "talking",
  silly_dancing: "talking",
  hip_hop_dancing: "talking",
  hip_hop_dancing_2: "talking",
  salsa_dancing: "talking",
};

function sanitizeSpeechGesture(animation: string): string {
  return AWKWARD_SPEECH_GESTURE_REPLACEMENTS[animation] ?? animation;
}

export function resolveShowroomGestureSequence(
  profile: CompanionShowroomGestureProfile | null | undefined,
  line: GestureLine,
): string[] {
  if (line === "meet") {
    return [profile?.meet ?? "wave"];
  }

  const fallback = line === "intro" ? ["talking", "think"] : ["talking", "think"];
  const rawSequence =
    profile?.[line] && profile[line]!.length > 0 ? profile[line]! : fallback;
  const seen = new Set<string>();
  const sanitized = rawSequence
    .map((animation) => sanitizeSpeechGesture(animation))
    .filter((animation) => {
      if (seen.has(animation)) return false;
      seen.add(animation);
      return true;
    });

  return sanitized.length > 0 ? sanitized : fallback;
}

export function resolveShowroomSpeechGesturePlan(
  profile: CompanionShowroomGestureProfile | null | undefined,
  line: SpeakingLine,
): ShowroomSpeechGesturePlan {
  const sequence = resolveShowroomGestureSequence(profile, line);
  const primary = sequence[0] ?? "talking";
  if (primary === "talking") {
    return {
      sequence: [primary],
      sustainPrimary: true,
      intervalMs: null,
    };
  }
  return {
    sequence,
    sustainPrimary: false,
    intervalMs: line === "intro" ? 2600 : 2100,
  };
}

export const SHOWROOM_CARD_REVEAL_DELAY_MS = 1400;

export function shouldRunShowroomSlotLoop(
  slot: SlotName,
  active: boolean,
  contained = false,
): boolean {
  if (contained) return true;
  if (slot === "hidden") return false;
  if (slot === "current") return true;
  return active;
}

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type ShowroomTalkUiPhase = "idle" | "listening" | "thinking" | "speaking";
type ShowroomVideoChatCameraState = "off" | "requesting" | "live" | "blocked";
export type ShowroomVideoCallPhase = "idle" | "calling" | "answered" | "live";
type ShowroomTalkMode = "showroom" | "video_call";
export type ShowroomConversationIntent = "social" | "game" | "repeat_after" | "visual";
type CompanionCallSource = "showroom" | "mystery_box" | "game_reward" | "dev_preview";
type CompanionRelationshipState = "previewing" | "selected" | "earned_reward";
type CompanionRewardContext = {
  nodeId?: string;
  activityId?: string;
  rewardId?: string;
  earnedBy?: string;
};
type CompanionVideoCallContext = {
  callSource?: CompanionCallSource;
  relationshipState?: CompanionRelationshipState;
  rewardContext?: CompanionRewardContext;
};
type ShowroomCompanionActivityId = "tic_tac_toe";
type ShowroomCompanionActivityRequest = {
  source: "claude";
  childId: string;
  companionId: string;
  activityId: ShowroomCompanionActivityId;
  surface: "video_call_overlay";
  reason: string;
  timestamp: number;
};
type ShowroomVideoActivityStatus = "active" | "completed";
type ShowroomVideoActivityTurn = "child" | "companion" | "none";
type ShowroomVideoActivityMove = {
  by: "child" | "companion";
  square: number;
  mark: CompanionTicTacToeMark;
  timestamp: number;
};
export type ShowroomVideoActivityContext = {
  activityId: ShowroomCompanionActivityId;
  surface: "video_call_overlay";
  status: ShowroomVideoActivityStatus;
  board: Array<CompanionTicTacToeMark | null>;
  childMark: "X";
  companionMark: "O";
  turn: ShowroomVideoActivityTurn;
  lastMove?: ShowroomVideoActivityMove;
  result?: "child_win" | "companion_win" | "draw";
  summary: string;
  updatedAt: number;
};
export type ShowroomActivityReactionEventType =
  | "game_started"
  | "child_move"
  | "companion_move"
  | "round_complete";
type ShowroomActivityMomentType =
  | "game_started"
  | "companion_blocked_child"
  | "child_blocked_companion"
  | "child_created_threat"
  | "round_complete";
type ShowroomActivityMomentSalience = "low" | "medium" | "high";
export type ShowroomActivityReactionContext = {
  activityId: "tic_tac_toe";
  eventType: ShowroomActivityReactionEventType;
  momentType?: ShowroomActivityMomentType;
  salience?: ShowroomActivityMomentSalience;
  suggestedGesture?: AnimationName;
  board: Array<CompanionTicTacToeMark | null>;
  boardSignature?: string;
  childMark: "X";
  companionMark: "O";
  turn: ShowroomVideoActivityTurn;
  lastMove?: ShowroomVideoActivityMove;
  result?: ShowroomVideoActivityContext["result"];
  summary?: string;
  desiredTone?: string;
  updatedAt?: number;
};
const SHOWROOM_VIDEO_CALL_ACTIVITY_LOG_TYPES = new Set([
  "companion_tic_tac_toe_started",
  "companion_tic_tac_toe_child_move",
  "companion_tic_tac_toe_companion_move",
  "companion_tic_tac_toe_round_complete",
  "companion_tic_tac_toe_reset",
]);
type ShowroomVideoSnapshotPayload = {
  base64: string;
  mimeType: "image/jpeg";
  reason: string;
  capturedAt: number;
  width: number;
  height: number;
};

type ShowroomSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: new () => ShowroomSpeechRecognition;
  webkitSpeechRecognition?: new () => ShowroomSpeechRecognition;
};

const accent = "#6D5EF5";
const confettiColours = ["#6D5EF5", "#a78bfa", "#fbbf24", "#f472b6", "#34d399"];
const SHOWROOM_COMMAND_CHILD_ID = "showroom";
const SHOWROOM_MAX_DISPLAY_SCALE = 1.25;
const SHOWROOM_VIDEO_CHAT_NO_SPEECH_RETRY_DELAY_MS = 560;
const SHOWROOM_VIDEO_CHAT_NO_SPEECH_RETRY_LIMIT = 2;
const SHOWROOM_VIDEO_CHAT_HANDS_FREE_REARM_MS = 360;
const SHOWROOM_VIDEO_CHAT_VISUAL_ACTION_REARM_MS = 1900;
const SHOWROOM_VIDEO_CHAT_RING_MS = 1300;
const SHOWROOM_VIDEO_CHAT_ANSWER_MS = 650;
const SHOWROOM_VIDEO_CHAT_RINGTONE_STYLE = "familiar-video-call";
const SHOWROOM_VIDEO_CALL_SOURCES = new Set<CompanionCallSource>([
  "showroom",
  "mystery_box",
  "game_reward",
  "dev_preview",
]);
const SHOWROOM_VIDEO_CALL_RELATIONSHIP_STATES = new Set<CompanionRelationshipState>([
  "previewing",
  "selected",
  "earned_reward",
]);
const SHOWROOM_VIDEO_CHAT_RINGTONE_NOTES = [
  { offsetMs: 0, frequency: 783.99, durationMs: 170, accent: 0.78 },
  { offsetMs: 185, frequency: 987.77, durationMs: 170, accent: 0.9 },
  { offsetMs: 370, frequency: 1174.66, durationMs: 190, accent: 1 },
  { offsetMs: 620, frequency: 987.77, durationMs: 230, accent: 0.82 },
] as const;
const SHOWROOM_EXPRESSIVE_ANIMATIONS = new Set([
  "blow_a_kiss",
  "dance_victory",
  "fireball",
  "hip_hop_dancing",
  "hip_hop_dancing_2",
  "ponder_moment",
  "quick_formal_bow",
  "salsa_dancing",
  "shrug",
  "silly_dancing",
  "silly_laugh",
  "surprise_jump",
]);
const SHOWROOM_DANCE_REQUEST_PATTERN =
  /\b(dance|dancing|signature dance|signature move|show me your moves?|show your moves?|bust a move|boogie)\b/i;

export type ShowroomVideoChatLatencyBudget = {
  noSpeechRetryDelayMs: number;
  handsFreeRearmMs: number;
  visualActionRearmMs: number;
  ringMs: number;
  answerMs: number;
};

export type ShowroomContainedSlotFraming = {
  cameraAngle: CameraAngle;
  cssScale: number;
  motorDisplayScale: number;
  transformOrigin: string;
};

export function getShowroomVideoChatLatencyBudget(): ShowroomVideoChatLatencyBudget {
  return {
    noSpeechRetryDelayMs: SHOWROOM_VIDEO_CHAT_NO_SPEECH_RETRY_DELAY_MS,
    handsFreeRearmMs: SHOWROOM_VIDEO_CHAT_HANDS_FREE_REARM_MS,
    visualActionRearmMs: SHOWROOM_VIDEO_CHAT_VISUAL_ACTION_REARM_MS,
    ringMs: SHOWROOM_VIDEO_CHAT_RING_MS,
    answerMs: SHOWROOM_VIDEO_CHAT_ANSWER_MS,
  };
}

export function resolveShowroomContainedSlotFraming(args: {
  contained: boolean;
  displayScale: number;
}): ShowroomContainedSlotFraming {
  const displayScale =
    typeof args.displayScale === "number" && Number.isFinite(args.displayScale)
      ? Math.min(Math.max(args.displayScale, 1), 4)
      : 1;
  if (!args.contained) {
    return {
      cameraAngle: "mid-shot",
      cssScale: displayScale,
      motorDisplayScale: Math.min(displayScale, SHOWROOM_MAX_DISPLAY_SCALE),
      transformOrigin: "50% 92%",
    };
  }
  if (displayScale > SHOWROOM_MAX_DISPLAY_SCALE) {
    return {
      cameraAngle: "full-body",
      cssScale: 1.06,
      motorDisplayScale: 1,
      transformOrigin: "50% 50%",
    };
  }
  return {
    cameraAngle: "mid-shot",
    cssScale: 1.38,
    motorDisplayScale: 1,
    transformOrigin: "50% 58%",
  };
}

let showroomCommandSequence = 0;
const sparkleSeeds = [
  { left: "9%", top: "18%", delay: "0s", size: 3 },
  { left: "18%", top: "42%", delay: "1.1s", size: 4 },
  { left: "27%", top: "12%", delay: "2.2s", size: 3 },
  { left: "38%", top: "30%", delay: "0.7s", size: 5 },
  { left: "48%", top: "9%", delay: "1.8s", size: 4 },
  { left: "58%", top: "34%", delay: "0.4s", size: 3 },
  { left: "69%", top: "15%", delay: "2.6s", size: 5 },
  { left: "80%", top: "44%", delay: "1.4s", size: 3 },
  { left: "91%", top: "22%", delay: "0.9s", size: 4 },
  { left: "74%", top: "61%", delay: "3.1s", size: 3 },
  { left: "23%", top: "64%", delay: "2.9s", size: 4 },
  { left: "50%", top: "52%", delay: "1.9s", size: 3 },
];

function ShowroomThemeBackdrop({
  theme,
  activeGeneratedBackground,
  waitingForGeneratedBackground,
}: {
  theme: ShowroomThemeConfig;
  activeGeneratedBackground: string | null;
  waitingForGeneratedBackground: boolean;
}) {
  if (activeGeneratedBackground) {
    return (
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(180deg, rgba(15,10,30,0.32), rgba(15,10,30,0.88)), url("${activeGeneratedBackground.replace(/"/g, '\\"')}")`,
          backgroundPosition: "center",
          backgroundSize: "cover",
          filter: "saturate(1.08)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
    );
  }

  if (waitingForGeneratedBackground) {
    return (
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(110deg, rgba(109,94,245,0.08), rgba(167,139,250,0.18), rgba(244,114,182,0.08))",
          backgroundSize: "200% 200%",
          animation: "sunny-showroom-bg-wait 3.8s ease-in-out infinite",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
    );
  }

  if (theme.chrome === "storybook") {
    return (
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, #2a0a1d 0%, #1b0815 42%, #0b0510 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "8% 8% 14%",
            background:
              "radial-gradient(85% 70% at 50% 45%, #5a1e3a 0%, #3d0e2a 48%, #1b0815 100%)",
            borderRadius: "300px 300px 12px 12px / 220px 220px 12px 12px",
            boxShadow: "inset 0 0 80px rgba(0,0,0,0.5)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "min(20vw, 220px)",
            background:
              "repeating-linear-gradient(95deg, #4a1232 0px, #6a1a44 14px, #4a1232 28px, #2e0820 44px)",
            boxShadow: "inset -20px 0 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.45)",
            clipPath: "polygon(0 0, 100% 0, 88% 100%, 0 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: "min(20vw, 220px)",
            background:
              "repeating-linear-gradient(85deg, #4a1232 0px, #6a1a44 14px, #4a1232 28px, #2e0820 44px)",
            boxShadow: "inset 20px 0 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.45)",
            clipPath: "polygon(12% 0, 100% 0, 100% 100%, 0 100%)",
          }}
        />
        <svg
          viewBox="0 0 1280 800"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0 }}
        >
          <defs>
            <linearGradient id="sunny-showroom-storybook-brass" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#f3d484" />
              <stop offset="0.48" stopColor="#c9a44a" />
              <stop offset="1" stopColor="#7a5e22" />
            </linearGradient>
          </defs>
          <path
            d="M 130 220 Q 130 95, 240 95 Q 640 38, 1040 95 Q 1150 95, 1150 220"
            fill="none"
            stroke="url(#sunny-showroom-storybook-brass)"
            strokeWidth="8"
            opacity="0.82"
          />
          <circle cx="640" cy="62" r="22" fill="url(#sunny-showroom-storybook-brass)" opacity="0.9" />
          <circle cx="640" cy="62" r="8" fill="#3b1f08" />
        </svg>
      </div>
    );
  }

  if (theme.chrome === "crystal") {
    return (
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, #f4f1ff 0%, #ebe6ff 38%, #d6cfff 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 50% 16%, rgba(255,247,237,0.9), rgba(253,230,138,0.22) 34%, transparent 58%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "17%",
            right: "17%",
            top: "10%",
            bottom: "8%",
            border: "2px solid rgba(120,113,108,0.42)",
            borderRadius: "42% 42% 0 0 / 22% 22% 0 0",
            overflow: "hidden",
            boxShadow: "inset 0 0 70px rgba(255,255,255,0.34)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gridTemplateRows: "repeat(3, 1fr)",
            }}
          >
            {[
              "#c7d2fe",
              "#fbcfe8",
              "#a7f3d0",
              "#fde68a",
              "#fbcfe8",
              "#a7f3d0",
              "#c7d2fe",
              "#fde68a",
              "#fde68a",
              "#c7d2fe",
              "#fbcfe8",
              "#a7f3d0",
            ].map((color, index) => (
              <span
                key={`${color}-${index}`}
                style={{
                  background: color,
                  opacity: 0.26,
                  border: "1px solid rgba(120,113,108,0.2)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(circle at 50% 22%, rgba(109,94,245,0.2), transparent 32%), #0f0a1e",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}

function ShowroomThemeAmbient({ theme }: { theme: ShowroomThemeConfig }) {
  if (theme.chrome === "storybook") {
    return <StorybookSparkles />;
  }

  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
      {sparkleSeeds.map((sparkle, index) => (
        <span
          key={`${sparkle.left}-${sparkle.top}`}
          style={{
            position: "absolute",
            left: sparkle.left,
            top: sparkle.top,
            width: sparkle.size,
            height: sparkle.size,
            borderRadius: theme.chrome === "crystal" ? 2 : "50%",
            background: theme.sparkleColor,
            boxShadow: `0 0 ${theme.chrome === "crystal" ? 10 : 18}px ${theme.sparkleColor}`,
            animation: `sunny-showroom-sparkle 4.2s ease-in-out ${sparkle.delay} infinite`,
            transform: theme.chrome === "crystal" ? `rotate(${index * 19}deg)` : undefined,
          }}
        />
      ))}
    </div>
  );
}

function ShowroomRoomCycler({
  activeTheme,
  availableThemes,
  disabled,
  onSelect,
  onCycle,
  leftOffsetPx,
}: {
  activeTheme: ShowroomThemeConfig;
  availableThemes: readonly ShowroomTheme[];
  disabled: boolean;
  onSelect: (theme: ShowroomTheme) => void;
  onCycle: (direction: -1 | 1) => void;
  leftOffsetPx: number;
}) {
  return (
    <div
      role="group"
      aria-label="Showroom rooms"
      className="sunny-showroom-theme-cycler"
      style={{
        position: "absolute",
        top: 16,
        left: leftOffsetPx,
        zIndex: 42,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 4,
        width: "auto",
        maxWidth: "min(46vw, 260px)",
        padding: "5px 7px 6px",
        borderRadius: 18,
        border: `1px solid ${activeTheme.controlBorder}`,
        background: activeTheme.controlBackground,
        boxShadow:
          activeTheme.chrome === "storybook"
            ? "0 10px 30px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.08)"
            : "0 10px 30px rgba(0,0,0,0.16)",
        backdropFilter: "blur(14px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          minWidth: 0,
        }}
      >
        <button
          type="button"
          aria-label="Previous room"
          onClick={() => onCycle(-1)}
          disabled={disabled}
          style={showroomThemeIconButtonStyle(activeTheme, disabled)}
        >
          ◀
        </button>
        <div
          data-showroom-theme-option={activeTheme.qaMarker}
          aria-label={activeTheme.displayName}
          style={{
            minWidth: 0,
            flex: "1 1 auto",
            display: "grid",
            textAlign: "center",
          }}
        >
          <strong
            title={activeTheme.displayName}
            style={{
              color: activeTheme.controlForeground,
              fontFamily:
                activeTheme.chrome === "storybook"
                  ? "Georgia, 'Times New Roman', serif"
                  : "Lexend, system-ui, sans-serif",
              fontSize: activeTheme.chrome === "storybook" ? 15 : 13,
              fontWeight: 900,
              lineHeight: 1.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {activeTheme.shortDisplayName}
          </strong>
        </div>
        <button
          type="button"
          aria-label="Next room"
          onClick={() => onCycle(1)}
          disabled={disabled}
          style={showroomThemeIconButtonStyle(activeTheme, disabled)}
        >
          ▶
        </button>
      </div>
      <div
        data-showroom-room-shortcuts
        aria-label="Room shortcuts"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 5,
          pointerEvents: "auto",
          minHeight: 8,
        }}
      >
        {availableThemes.map((themeId) => {
          const theme = getShowroomThemeConfig(themeId);
          const selected = theme.id === activeTheme.id;
          return (
            <button
              type="button"
              key={theme.id}
              aria-label={`Switch to ${theme.displayName}`}
              aria-pressed={selected}
              onClick={() => onSelect(theme.id)}
              disabled={disabled}
              style={{
                width: selected ? 18 : 10,
                height: 8,
                borderRadius: 999,
                border: `1px solid ${selected ? activeTheme.accent : activeTheme.controlBorder}`,
                background: selected ? activeTheme.accent : activeTheme.controlBackground,
                padding: 0,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.62 : selected ? 1 : 0.72,
                transition: "width 0.16s ease, opacity 0.16s ease",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function showroomThemeIconButtonStyle(
  theme: ShowroomThemeConfig,
  disabled: boolean,
): CSSProperties {
  return {
    flex: "0 0 auto",
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: `1px solid ${theme.controlBorder}`,
    background: theme.controlBackground,
    color: theme.controlForeground,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.62 : 1,
    fontSize: 13,
    display: "grid",
    placeItems: "center",
    padding: 0,
  };
}

function showroomArrowButtonStyle(
  theme: ShowroomThemeConfig,
  side: "left" | "right",
): CSSProperties {
  return {
    position: "absolute",
    [side]: "clamp(16px, 6vw, 88px)",
    top: "38%",
    zIndex: 12,
    width: 58,
    height: 58,
    borderRadius: "50%",
    border: `1px solid ${theme.controlBorder}`,
    background: theme.controlBackground,
    color: theme.controlForeground,
    fontSize: 28,
    cursor: "pointer",
    boxShadow: theme.chrome === "crystal" ? "0 12px 28px rgba(57,35,130,0.16)" : undefined,
  };
}

function playPowerUpSfx(): AmbientMusicHandle | null {
  const AudioContextCtor =
    window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioContextCtor) return null;
  const ctx = new AudioContextCtor();
  const master = ctx.createGain();
  const rumble = ctx.createOscillator();
  const charge = ctx.createOscillator();
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.55, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i += 1) {
    noiseData[i] = (Math.random() * 2 - 1) * (1 - i / noiseData.length);
  }
  const burst = ctx.createBufferSource();
  const burstGain = ctx.createGain();
  burst.buffer = noiseBuffer;
  rumble.type = "sawtooth";
  charge.type = "triangle";
  rumble.frequency.setValueAtTime(58, ctx.currentTime);
  rumble.frequency.exponentialRampToValueAtTime(92, ctx.currentTime + 1.1);
  charge.frequency.setValueAtTime(180, ctx.currentTime);
  charge.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 1.15);
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.12);
  master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.7);
  burstGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  burstGain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 1.05);
  burstGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.55);
  rumble.connect(master);
  charge.connect(master);
  burst.connect(burstGain);
  burstGain.connect(master);
  master.connect(ctx.destination);
  void ctx.resume();
  rumble.start();
  charge.start();
  burst.start(ctx.currentTime + 1.02);
  rumble.stop(ctx.currentTime + 1.72);
  charge.stop(ctx.currentTime + 1.72);
  burst.stop(ctx.currentTime + 1.58);
  const closeTimer = window.setTimeout(() => void ctx.close(), 1850);
  return {
    stop: () => {
      window.clearTimeout(closeTimer);
      try {
        rumble.stop();
        charge.stop();
        burst.stop();
      } catch {
        // Oscillators may already be stopped by the scheduled power-up.
      }
      void ctx.close();
    },
  };
}

function playVideoCallRingtone(): AmbientMusicHandle | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor =
    window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioContextCtor) return null;
  const context = new AudioContextCtor();
  const master = context.createGain();
  const delay = context.createDelay();
  const delayGain = context.createGain();
  const wetGain = context.createGain();
  master.gain.setValueAtTime(0.0001, context.currentTime);
  master.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.05);
  delay.delayTime.setValueAtTime(0.115, context.currentTime);
  delayGain.gain.setValueAtTime(0.19, context.currentTime);
  wetGain.gain.setValueAtTime(0.32, context.currentTime);
  delay.connect(delayGain);
  delayGain.connect(wetGain);
  master.connect(context.destination);
  wetGain.connect(context.destination);
  let stopped = false;
  const playRing = () => {
    if (stopped) return;
    const now = context.currentTime;
    for (const note of SHOWROOM_VIDEO_CHAT_RINGTONE_NOTES) {
      const start = now + note.offsetMs / 1000;
      const duration = note.durationMs / 1000;
      const noteGain = context.createGain();
      const shimmerGain = context.createGain();
      const primary = context.createOscillator();
      const shimmer = context.createOscillator();

      primary.type = "sine";
      shimmer.type = "triangle";
      primary.frequency.setValueAtTime(note.frequency, start);
      shimmer.frequency.setValueAtTime(note.frequency * 2, start);
      shimmer.detune.setValueAtTime(4, start);

      noteGain.gain.setValueAtTime(0.0001, start);
      noteGain.gain.exponentialRampToValueAtTime(0.18 * note.accent, start + 0.018);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      shimmerGain.gain.setValueAtTime(0.0001, start);
      shimmerGain.gain.exponentialRampToValueAtTime(0.035 * note.accent, start + 0.018);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.86);

      primary.connect(noteGain);
      shimmer.connect(shimmerGain);
      noteGain.connect(master);
      shimmerGain.connect(master);
      noteGain.connect(delay);
      primary.start(start);
      shimmer.start(start);
      primary.stop(start + duration + 0.035);
      shimmer.stop(start + duration + 0.035);
    }
  };
  playRing();
  const interval = window.setInterval(playRing, 1450);
  void context.resume().catch((err: unknown) => {
    console.warn(" 🎮 [showroom-video-chat] ringtone_resume_failed", err);
  });
  return {
    stop: () => {
      stopped = true;
      window.clearInterval(interval);
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), context.currentTime);
      master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.08);
      window.setTimeout(() => {
        void context.close().catch((err: unknown) => {
          console.warn(" 🎮 [showroom-video-chat] ringtone_close_failed", err);
        });
      }, 110);
    },
  };
}

function playSignatureMoveAudio(
  audioUrl: string | undefined,
  opts: { onEnded?: () => void } = {},
): AmbientMusicHandle | null {
  if (!audioUrl) {
    const synth = playPowerUpSfx();
    const synthEndTimer = window.setTimeout(() => opts.onEnded?.(), 1900);
    return {
      stop: () => {
        window.clearTimeout(synthEndTimer);
        synth?.stop();
      },
    };
  }
  const audio = new Audio(audioUrl);
  audio.preload = "auto";
  audio.volume = 0.9;
  let stopped = false;
  let fallbackSfx: AmbientMusicHandle | null = null;
  let fallbackStartTimer: number | null = null;
  let endTimer: number | null = null;
  const clearEndTimer = () => {
    if (endTimer !== null) {
      window.clearTimeout(endTimer);
      endTimer = null;
    }
  };
  const cleanupListeners = () => {
    audio.removeEventListener("ended", onEnded);
    audio.removeEventListener("loadedmetadata", onLoadedMetadata);
  };
  const finish = () => {
    if (stopped) return;
    stopped = true;
    clearEndTimer();
    cleanupListeners();
    opts.onEnded?.();
  };
  const onEnded = () => {
    finish();
  };
  const onLoadedMetadata = () => {
    clearEndTimer();
    const durationMs = Number.isFinite(audio.duration)
      ? (audio.duration + 0.2) * 1000
      : 7000;
    endTimer = window.setTimeout(
      finish,
      Math.min(Math.max(durationMs, 1900), 12000),
    );
  };
  audio.addEventListener("ended", onEnded);
  audio.addEventListener("loadedmetadata", onLoadedMetadata);
  endTimer = window.setTimeout(finish, 7000);
  const fallbackTimer = window.setTimeout(() => {
    if (audio.paused) {
      fallbackSfx = playPowerUpSfx();
    }
  }, 350);
  fallbackStartTimer = fallbackTimer;
  void audio.play().catch((err: unknown) => {
    if (fallbackStartTimer !== null) {
      window.clearTimeout(fallbackStartTimer);
      fallbackStartTimer = null;
    }
    clearEndTimer();
    console.warn("CompanionShowroom: signature move MP3 failed; using synth fallback", err);
    fallbackSfx = playPowerUpSfx();
    endTimer = window.setTimeout(finish, 1900);
  });
  return {
    stop: () => {
      stopped = true;
      if (fallbackStartTimer !== null) {
        window.clearTimeout(fallbackStartTimer);
        fallbackStartTimer = null;
      }
      clearEndTimer();
      cleanupListeners();
      fallbackSfx?.stop();
      fallbackSfx = null;
      audio.pause();
      audio.currentTime = 0;
    },
  };
}

function createShowroomCommand(
  type: string,
  payload: Record<string, unknown>,
): CompanionCommand {
  const cmd = validateCompanionCommand(
    { type, payload },
    COMPANION_CAPABILITIES,
    { childId: SHOWROOM_COMMAND_CHILD_ID, source: "diag" },
  );
  if (!cmd) {
    throw new Error(`CompanionShowroom invalid ${type} command`);
  }
  return {
    ...cmd,
    // CompanionMotor de-dupes by timestamp/type/child/source. Keep rapid showroom
    // gesture bursts distinct even if they happen within the same millisecond.
    timestamp: cmd.timestamp * 1000 + showroomCommandSequence++,
  };
}

export function createShowroomAnimateCommand(
  animation: string,
  opts: { loop?: boolean } = {},
): CompanionCommand {
  return createShowroomCommand("animate", {
    animation,
    ...(opts.loop === undefined ? {} : { loop: opts.loop }),
  });
}

export function createShowroomEmoteCommand(
  emote: string,
  opts: { intensity?: number; durationMs?: number } = {},
): CompanionCommand {
  return createShowroomCommand("emote", {
    emote,
    ...(opts.intensity === undefined ? {} : { intensity: opts.intensity }),
    ...(opts.durationMs === undefined ? {} : { duration_ms: opts.durationMs }),
  });
}

export function createShowroomCameraCommand(
  angle: CameraAngle,
  transitionMs?: number,
): CompanionCommand {
  return createShowroomCommand("camera", {
    angle,
    ...(transitionMs === undefined ? {} : { transition_ms: transitionMs }),
  });
}

export function createShowroomTalkPayload(args: {
  childId: string;
  companionId: string;
  voiceId: string;
  showroomTheme: string;
  question: string;
  mode?: ShowroomTalkMode;
  callSource?: CompanionCallSource;
  relationshipState?: CompanionRelationshipState;
  rewardContext?: CompanionRewardContext;
  activeActivity?: ShowroomVideoActivityContext | null;
  activityReaction?: ShowroomActivityReactionContext | null;
  conversationIntent?: ShowroomConversationIntent;
  callTraceId?: string;
  turnId?: string;
  visualSnapshot?: ShowroomVideoSnapshotPayload;
  lastVisualSummary?: string;
}): {
  childId: string;
  companionId: string;
  voiceId: string;
  showroomTheme: string;
  question: string;
  mode?: ShowroomTalkMode;
  callSource: CompanionCallSource;
  relationshipState: CompanionRelationshipState;
  rewardContext?: CompanionRewardContext;
  activeActivity?: ShowroomVideoActivityContext;
  activityReaction?: ShowroomActivityReactionContext;
  conversationIntent?: ShowroomConversationIntent;
  callTraceId?: string;
  turnId?: string;
  visualSnapshot?: ShowroomVideoSnapshotPayload;
  lastVisualSummary?: string;
} {
  const { activeActivity, activityReaction, ...payload } = args;
  return {
    ...payload,
    ...(activeActivity && { activeActivity }),
    ...(activityReaction && { activityReaction }),
    callSource: payload.callSource ?? "showroom",
    relationshipState: payload.relationshipState ?? "previewing",
  };
}

export function shouldRequestShowroomActivityReaction(
  event: CompanionTicTacToeGameEvent,
): boolean {
  const moment = getShowroomTicTacToeReactionMoment(event);
  return (
    shouldRequestCompanionActivityAiReaction(event) ||
    (moment != null && moment.salience !== "low")
  );
}

type ShowroomTicTacToeLine = readonly [number, number, number];

const SHOWROOM_TIC_TAC_TOE_LINES: readonly ShowroomTicTacToeLine[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function getShowroomBoardBeforeMove(
  event: CompanionTicTacToeGameEvent,
): Array<CompanionTicTacToeMark | null> {
  const board = event.board.map((mark) => (mark === "X" || mark === "O" ? mark : null));
  if (event.square && event.square >= 1 && event.square <= 9) {
    board[event.square - 1] = null;
  }
  return board;
}

function didShowroomTicTacToeMoveBlock(
  event: CompanionTicTacToeGameEvent,
  blockedMark: CompanionTicTacToeMark,
): boolean {
  if (!event.square || !event.mark) return false;
  const index = event.square - 1;
  const before = getShowroomBoardBeforeMove(event);
  return SHOWROOM_TIC_TAC_TOE_LINES.some((line) => {
    if (!line.some((lineIndex) => lineIndex === index)) return false;
    return (
      line.filter((lineIndex) => before[lineIndex] === blockedMark).length === 2 &&
      before[index] == null
    );
  });
}

function didShowroomTicTacToeMoveCreateThreat(
  event: CompanionTicTacToeGameEvent,
): boolean {
  if (!event.square || !event.mark) return false;
  const index = event.square - 1;
  return SHOWROOM_TIC_TAC_TOE_LINES.some((line) => {
    if (!line.some((lineIndex) => lineIndex === index)) return false;
    return (
      line.filter((lineIndex) => event.board[lineIndex] === event.mark).length === 2 &&
      line.some((lineIndex) => event.board[lineIndex] == null)
    );
  });
}

function getShowroomTicTacToeReactionMoment(
  event: CompanionTicTacToeGameEvent,
): {
  momentType: ShowroomActivityMomentType;
  salience: ShowroomActivityMomentSalience;
  desiredTone: string;
  suggestedGesture: AnimationName;
} | null {
  if (event.type === "companion_tic_tac_toe_started" || event.type === "companion_tic_tac_toe_reset") {
    return {
      momentType: "game_started",
      salience: "medium",
      desiredTone: "warm_playful",
      suggestedGesture: "wave",
    };
  }
  if (event.type === "companion_tic_tac_toe_round_complete") {
    return {
      momentType: "round_complete",
      salience: "high",
      desiredTone:
        event.result === "child_win"
          ? "celebrate_child"
          : event.result === "companion_win"
            ? "playful_confidence"
            : "friendly_draw",
      suggestedGesture:
        event.result === "child_win"
          ? "wave"
          : event.result === "companion_win"
            ? "silly_laugh"
            : "shrug",
    };
  }
  if (
    event.type === "companion_tic_tac_toe_companion_move" &&
    didShowroomTicTacToeMoveBlock(event, "X")
  ) {
    return {
      momentType: "companion_blocked_child",
      salience: "medium",
      desiredTone: "playful_strategic",
      suggestedGesture: "think",
    };
  }
  if (
    event.type === "companion_tic_tac_toe_child_move" &&
    didShowroomTicTacToeMoveBlock(event, "O")
  ) {
    return {
      momentType: "child_blocked_companion",
      salience: "medium",
      desiredTone: "impressed_playful",
      suggestedGesture: "surprise_jump",
    };
  }
  if (
    event.type === "companion_tic_tac_toe_child_move" &&
    didShowroomTicTacToeMoveCreateThreat(event)
  ) {
    return {
      momentType: "child_created_threat",
      salience: "low",
      desiredTone: "curious",
      suggestedGesture: "think",
    };
  }
  return null;
}

function createShowroomActivityReactionFromEvent(
  event: CompanionTicTacToeGameEvent,
  activeActivity: ShowroomVideoActivityContext,
): ShowroomActivityReactionContext | null {
  const eventType: ShowroomActivityReactionEventType | null =
    event.type === "companion_tic_tac_toe_started" ||
    event.type === "companion_tic_tac_toe_reset"
      ? "game_started"
      : event.type === "companion_tic_tac_toe_child_move"
        ? "child_move"
        : event.type === "companion_tic_tac_toe_companion_move"
          ? "companion_move"
          : event.type === "companion_tic_tac_toe_round_complete"
            ? "round_complete"
            : null;
  if (!eventType) return null;
  const boardSignature = getShowroomActivityBoardSignature(activeActivity.board);
  const moment = getShowroomTicTacToeReactionMoment(event);
  return {
    activityId: "tic_tac_toe",
    eventType,
    ...(moment && {
      momentType: moment.momentType,
      salience: moment.salience,
      suggestedGesture: moment.suggestedGesture,
    }),
    board: activeActivity.board,
    boardSignature,
    childMark: activeActivity.childMark,
    companionMark: activeActivity.companionMark,
    turn: activeActivity.turn,
    ...(activeActivity.lastMove && { lastMove: activeActivity.lastMove }),
    ...(activeActivity.result && { result: activeActivity.result }),
    summary: activeActivity.summary,
    updatedAt: activeActivity.updatedAt,
    desiredTone: moment?.desiredTone ?? "warm_playful",
  };
}

function createShowroomActivityReactionQuestion(
  reaction: ShowroomActivityReactionContext,
): string {
  if (reaction.eventType === "game_started") {
    return "React to starting tic-tac-toe in the video call.";
  }
  if (reaction.momentType === "companion_blocked_child") {
    return "You blocked the child from getting three in a row. Respond as Elli with one short playful sentence, then let the child move.";
  }
  if (reaction.momentType === "child_blocked_companion") {
    return "The child blocked your tic-tac-toe line. Respond as Elli with one short impressed sentence, then take your turn.";
  }
  if (reaction.momentType === "child_created_threat") {
    return "The child created a tic-tac-toe threat. Respond only if it feels worth a quick playful comment.";
  }
  if (reaction.eventType === "child_move") {
    return `React to the child placing X on square ${reaction.lastMove?.square ?? "unknown"}.`;
  }
  if (reaction.eventType === "companion_move") {
    return `React to your tic-tac-toe move on square ${reaction.lastMove?.square ?? "unknown"}.`;
  }
  if (reaction.result === "child_win") return "React to the child winning tic-tac-toe.";
  if (reaction.result === "companion_win") {
    return "React to winning tic-tac-toe without bragging.";
  }
  return "React to the tic-tac-toe round ending in a draw.";
}

export function getShowroomActivityBoardSignature(
  board: readonly (CompanionTicTacToeMark | null)[],
): string {
  return Array.from({ length: 9 }, (_, index) => {
    const mark = board[index];
    return mark === "X" || mark === "O" ? mark : "-";
  }).join("");
}

export function isShowroomActivityReactionCurrent(input: {
  reaction: ShowroomActivityReactionContext;
  currentActivity: ShowroomVideoActivityContext | null | undefined;
}): boolean {
  const current = input.currentActivity;
  if (!current || current.activityId !== input.reaction.activityId) return false;
  const boardSignature =
    input.reaction.boardSignature ??
    getShowroomActivityBoardSignature(input.reaction.board);
  const currentBoardSignature = getShowroomActivityBoardSignature(current.board);
  if (boardSignature !== currentBoardSignature) return false;
  if (
    typeof input.reaction.updatedAt === "number" &&
    typeof current.updatedAt === "number" &&
    current.updatedAt > input.reaction.updatedAt
  ) {
    return false;
  }
  if (input.reaction.eventType !== "round_complete" && current.status === "completed") {
    return false;
  }
  if (input.reaction.eventType === "round_complete") {
    return current.status === "completed" && current.result === input.reaction.result;
  }
  return true;
}

function getShowroomActivityReactionFallbackAnimation(
  reaction: ShowroomActivityReactionContext,
): AnimationName {
  if (reaction.suggestedGesture) return reaction.suggestedGesture;
  if (reaction.eventType === "game_started") return "wave";
  if (reaction.eventType === "child_move") return "surprise_jump";
  if (reaction.eventType === "companion_move") return "think";
  if (reaction.result === "child_win") return "wave";
  if (reaction.result === "companion_win") return "silly_laugh";
  return "shrug";
}

function createShowroomVideoActivitySummary(input: {
  event: CompanionTicTacToeGameEvent;
  turn: ShowroomVideoActivityTurn;
  result?: ShowroomVideoActivityContext["result"];
}): string {
  if (input.event.type === "companion_tic_tac_toe_started") {
    return "Tic-tac-toe is open. The child moves first as X.";
  }
  if (input.event.type === "companion_tic_tac_toe_reset") {
    return "A new tic-tac-toe round started. The child moves first as X.";
  }
  if (input.event.type === "companion_tic_tac_toe_child_move") {
    return `The child placed X on square ${input.event.square}. It is the companion's turn.`;
  }
  if (input.event.type === "companion_tic_tac_toe_companion_move") {
    return `The companion placed O on square ${input.event.square}. It is the child's turn.`;
  }
  if (input.event.type === "companion_tic_tac_toe_round_complete") {
    return input.result === "child_win"
      ? "The child won the tic-tac-toe round."
      : input.result === "companion_win"
        ? "The companion won the tic-tac-toe round."
        : "The tic-tac-toe round ended in a draw.";
  }
  return `Tic-tac-toe is open. Current turn: ${input.turn}.`;
}

export function createShowroomVideoActivityContextFromEvent(
  event: CompanionTicTacToeGameEvent,
  previous?: ShowroomVideoActivityContext | null,
): ShowroomVideoActivityContext {
  const board =
    Array.isArray(event.board) && event.board.length === 9
      ? event.board.map((mark) => (mark === "X" || mark === "O" ? mark : null))
      : previous?.board ?? Array.from({ length: 9 }, () => null);
  const lastMove =
    event.type === "companion_tic_tac_toe_child_move" && event.square && event.mark === "X"
      ? {
          by: "child" as const,
          square: event.square,
          mark: "X" as const,
          timestamp: event.timestamp,
        }
      : event.type === "companion_tic_tac_toe_companion_move" &&
          event.square &&
          event.mark === "O"
        ? {
            by: "companion" as const,
            square: event.square,
            mark: "O" as const,
            timestamp: event.timestamp,
          }
        : event.type === "companion_tic_tac_toe_started" ||
            event.type === "companion_tic_tac_toe_reset"
          ? undefined
          : previous?.lastMove;
  const result = event.result;
  const status: ShowroomVideoActivityStatus =
    event.type === "companion_tic_tac_toe_round_complete" ? "completed" : "active";
  const turn: ShowroomVideoActivityTurn =
    event.type === "companion_tic_tac_toe_child_move"
      ? "companion"
      : event.type === "companion_tic_tac_toe_companion_move" ||
          event.type === "companion_tic_tac_toe_started" ||
          event.type === "companion_tic_tac_toe_reset"
        ? "child"
        : "none";
  return {
    activityId: "tic_tac_toe",
    surface: "video_call_overlay",
    status,
    board,
    childMark: "X",
    companionMark: "O",
    turn,
    ...(lastMove && { lastMove }),
    ...(result && { result }),
    summary: createShowroomVideoActivitySummary({ event, turn, result }),
    updatedAt: event.timestamp,
  };
}

function normalizeVideoCallContextField(value: string | null): string | undefined {
  const trimmed = value?.trim().replace(/\s+/g, " ") ?? "";
  return trimmed ? trimmed.slice(0, 160) : undefined;
}

export function createShowroomVideoCallContextFromSearch(
  search: string,
): Required<Pick<CompanionVideoCallContext, "callSource" | "relationshipState">> &
  Pick<CompanionVideoCallContext, "rewardContext"> {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const requestedCallSource = params.get("callSource") ?? params.get("videoCallSource");
  const requestedRelationshipState =
    params.get("relationshipState") ?? params.get("videoCallRelationship");
  const callSource =
    requestedCallSource && SHOWROOM_VIDEO_CALL_SOURCES.has(requestedCallSource as CompanionCallSource)
      ? (requestedCallSource as CompanionCallSource)
      : "showroom";
  const relationshipState =
    requestedRelationshipState &&
    SHOWROOM_VIDEO_CALL_RELATIONSHIP_STATES.has(
      requestedRelationshipState as CompanionRelationshipState,
    )
      ? (requestedRelationshipState as CompanionRelationshipState)
      : "previewing";
  const rewardContext: CompanionRewardContext = {
    ...(normalizeVideoCallContextField(params.get("nodeId")) && {
      nodeId: normalizeVideoCallContextField(params.get("nodeId")),
    }),
    ...(normalizeVideoCallContextField(params.get("activityId")) && {
      activityId: normalizeVideoCallContextField(params.get("activityId")),
    }),
    ...(normalizeVideoCallContextField(params.get("rewardId")) && {
      rewardId: normalizeVideoCallContextField(params.get("rewardId")),
    }),
    ...(normalizeVideoCallContextField(params.get("earnedBy")) && {
      earnedBy: normalizeVideoCallContextField(params.get("earnedBy")),
    }),
  };
  return {
    callSource,
    relationshipState,
    ...(Object.keys(rewardContext).length > 0 && { rewardContext }),
  };
}

export function resolveShowroomTalkChildId(
  childName: string | undefined,
  search = "",
): string {
  const fromProp = childName?.trim().toLowerCase();
  if (fromProp) return fromProp;
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const fromQuery = params.get("child") ?? params.get("childId");
  return fromQuery?.trim().toLowerCase() || "showroom";
}

function resolveShowroomVideoCallSttChildName(childId: string): "Ila" | "Reina" {
  return childId === "reina" ? "Reina" : "Ila";
}

export function shouldAttachVideoSnapshotForQuestion(question: string): boolean {
  return /\b(look at|take a look|can you see|do you see|what am i holding|what is this|show you|my drawing|this drawing|my picture|this picture)\b/i.test(
    question,
  );
}

export function inferShowroomVideoConversationIntent(input: {
  question: string;
  activeActivity?: boolean;
  repeatAfterActive?: boolean;
  forceVisualSnapshot?: boolean;
}): ShowroomConversationIntent {
  return resolveCompanionConversationMode({
    question: input.question,
    currentMode: input.repeatAfterActive ? "repeat_after" : "social",
    activeActivity: input.activeActivity ? { status: "active" } : null,
    forceVisualSnapshot: input.forceVisualSnapshot,
    visualQuestion: shouldAttachVideoSnapshotForQuestion(input.question),
  });
}

const SHORT_CHILD_REPLY_WORDS = new Set([
  "again",
  "go",
  "help",
  "no",
  "nope",
  "ok",
  "okay",
  "stop",
  "sure",
  "yeah",
  "yep",
  "yes",
]);

function normalizeShowroomTranscript(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function sortShowroomTranscriptChars(value: string): string {
  return [...value].sort().join("");
}

export function shouldIgnoreShowroomAutoResumeTranscript(args: {
  transcript: string;
  previousResponse: string;
}): boolean {
  const transcript = args.transcript.trim();
  const previousResponse = args.previousResponse.trim();
  if (!transcript || !previousResponse) return false;

  const normalizedTranscript = normalizeShowroomTranscript(transcript);
  if (!normalizedTranscript || normalizedTranscript.length > 8) return false;
  if (SHORT_CHILD_REPLY_WORDS.has(normalizedTranscript)) return false;

  const normalizedPrevious = normalizeShowroomTranscript(previousResponse);
  const previousWords = previousResponse
    .toLowerCase()
    .split(/\s+/)
    .map((word) => normalizeShowroomTranscript(word))
    .filter(Boolean);
  const lastWord = previousWords.at(-1) ?? "";
  const transcriptLength = normalizedTranscript.length;
  const lastWordTail = lastWord.slice(-transcriptLength);
  const isDirectTail =
    normalizedPrevious.endsWith(normalizedTranscript) ||
    lastWord.endsWith(normalizedTranscript);
  const isTinyScrambledTail =
    transcriptLength >= 2 &&
    transcriptLength <= 4 &&
    lastWordTail.length === transcriptLength &&
    sortShowroomTranscriptChars(lastWordTail) ===
      sortShowroomTranscriptChars(normalizedTranscript);
  if (!isDirectTail && !isTinyScrambledTail) return false;

  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  return wordCount <= 2;
}

export type ShowroomVideoChatEntryCopy = {
  title: string;
  actionLabel: string;
  status: string;
  helperText: string;
};

export type ShowroomVideoChatStartedEvent = {
  type: "video_chat_started";
  childId: string;
  companionId: string;
  showroomTheme: string;
  mode: "showroom_camera_shell";
  timestamp: number;
};

export type ShowroomVideoCallStatusCopy = {
  heading: string;
  status: string;
  helperText: string;
};

export function createShowroomVideoChatEntryCopy(args: {
  companionName: string;
}): ShowroomVideoChatEntryCopy {
  return {
    title: `Video Chat with ${args.companionName}`,
    actionLabel: "Video Chat",
    status: "Ready to test",
    helperText: "Camera room test shell. Economy lock is disabled for this spike.",
  };
}

export function createShowroomVideoCallStatusCopy(args: {
  companionName: string;
  phase: ShowroomVideoCallPhase;
  cameraState: ShowroomVideoChatCameraState;
}): ShowroomVideoCallStatusCopy {
  if (args.cameraState === "live") {
    return {
      heading: `Video Chat with ${args.companionName}`,
      status: "Camera live",
      helperText: `${args.companionName} is here. Ask a question or tap Look.`,
    };
  }
  if (args.cameraState === "blocked") {
    return {
      heading: `${args.companionName} answered`,
      status: "Camera blocked",
      helperText: "Camera is off. You can still type, speak, or try camera again.",
    };
  }
  if (args.phase === "live" && args.cameraState === "off") {
    return {
      heading: `${args.companionName} answered`,
      status: "Camera stopped",
      helperText: "Camera is off. You can still type, speak, or start camera again.",
    };
  }
  if (args.phase === "answered" || args.cameraState === "requesting") {
    return {
      heading: `${args.companionName} answered`,
      status: "Connecting camera",
      helperText: "Starting camera and listening.",
    };
  }
  return {
    heading: `Calling ${args.companionName}...`,
    status: "Ringing",
    helperText: `${args.companionName} will answer, then the camera starts.`,
  };
}

export function createShowroomVideoChatStartedEvent(args: {
  childId: string;
  companionId: string;
  showroomTheme: string;
  now?: number;
}): ShowroomVideoChatStartedEvent {
  return {
    type: "video_chat_started",
    childId: args.childId,
    companionId: args.companionId,
    showroomTheme: args.showroomTheme,
    mode: "showroom_camera_shell",
    timestamp: args.now ?? Date.now(),
  };
}

export function shouldGateShowroomTalkMic(phase: string): boolean {
  return phase === "thinking" || phase === "speaking";
}

export function shouldPlayShowroomListeningGesture(
  source: ShowroomTalkMode | undefined,
  opts: { quiet?: boolean } = {},
): boolean {
  return source !== "video_call" && opts.quiet !== true;
}

export function getShowroomVoiceErrorRecovery(args: {
  source: ShowroomTalkMode | undefined;
  error?: string;
  retryCount: number;
}): {
  displayError: string | null;
  shouldRetry: boolean;
  quietRetry: boolean;
  nextRetryCount: number;
} {
  if (args.error === "aborted") {
    return {
      displayError: null,
      shouldRetry: false,
      quietRetry: true,
      nextRetryCount: args.retryCount,
    };
  }
  if (args.source === "video_call" && args.error === "no-speech") {
    const nextRetryCount = Math.min(
      args.retryCount + 1,
      SHOWROOM_VIDEO_CHAT_NO_SPEECH_RETRY_LIMIT,
    );
    return {
      displayError: null,
      shouldRetry: args.retryCount < SHOWROOM_VIDEO_CHAT_NO_SPEECH_RETRY_LIMIT,
      quietRetry: true,
      nextRetryCount,
    };
  }
  return {
    displayError: args.error ? `Voice input: ${args.error}` : "Voice input failed.",
    shouldRetry: false,
    quietRetry: false,
    nextRetryCount: args.retryCount,
  };
}

export function shouldApplyShowroomTalkCommand(
  command: CompanionCommand,
  selectedCompanionId: string,
): boolean {
  const companionId = command.payload?.companionId;
  return typeof companionId !== "string" || companionId === selectedCompanionId;
}

function isShowroomAnimationName(value: unknown): value is AnimationName {
  return (
    typeof value === "string" &&
    (COMPANION_ANIMATION_IDS as readonly string[]).includes(value)
  );
}

export function getShowroomTalkRequestedAnimation(input: {
  question: string;
  specialDance?: string | null;
}): AnimationName | null {
  if (!SHOWROOM_DANCE_REQUEST_PATTERN.test(input.question)) return null;
  return isShowroomAnimationName(input.specialDance)
    ? input.specialDance
    : "dance_victory";
}

export function selectShowroomTalkPlaybackCommands(
  commands: readonly CompanionCommand[],
  opts: { requestedAnimation?: AnimationName | null } = {},
): CompanionCommand[] {
  const nonAnimateCommands = commands.filter((command) => command.type !== "animate");
  if (opts.requestedAnimation) {
    return [
      createShowroomAnimateCommand(opts.requestedAnimation, { loop: false }),
      ...nonAnimateCommands,
    ];
  }
  const animateCommands = commands.filter((command) => command.type === "animate");
  const preferredAnimate =
    animateCommands.find((command) => {
      const animation = command.payload?.animation;
      return typeof animation === "string" && SHOWROOM_EXPRESSIVE_ANIMATIONS.has(animation);
    }) ?? animateCommands[0];

  return preferredAnimate
    ? [preferredAnimate, ...nonAnimateCommands]
    : [...nonAnimateCommands];
}

export function shouldIdleImmediatelyAfterSilentTalk(
  playbackCommands: readonly CompanionCommand[],
): boolean {
  return !playbackCommands.some((command) => command.type === "animate");
}

export function toShowroomIdleLoopCommand(
  _command: CompanionCommand | null | undefined,
): CompanionCommand {
  // Audio completion must not reuse a Claude animate command timestamp. The
  // motor de-dupes by timestamp/type/child/source, so back-to-back speaking and
  // idle commands can otherwise collapse and leave the prior talking loop alive.
  return createShowroomAnimateCommand("idle", { loop: true });
}

function copyTextWithTextareaFallback(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

function audioBase64ToBlob(base64: string, contentType: string): Blob {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

function processShowroomCommand(
  motor: CompanionMotor | null | undefined,
  cmd: CompanionCommand,
): void {
  motor?.processCompanionCommands([cmd], SHOWROOM_COMMAND_CHILD_ID);
}

function isWebGpuRenderer(renderer: CompanionRenderer): renderer is WebGPURenderer {
  return "isWebGPURenderer" in renderer && renderer.isWebGPURenderer === true;
}

function resolveModelUrl(vrmUrl: string): string {
  if (vrmUrl.startsWith("http://") || vrmUrl.startsWith("https://")) {
    return vrmUrl;
  }
  if (typeof window === "undefined") {
    return vrmUrl;
  }
  return `${window.location.origin}${vrmUrl.startsWith("/") ? "" : "/"}${vrmUrl}`;
}

function signatureMoveVfxPreset(
  entry: CompanionManifestEntry,
): CompanionVfxPreset | undefined {
  return entry.showroom?.signatureMove?.vfx.includes("battle_aura")
    ? "yellow_power_aura"
    : undefined;
}

function createSlotEntries(
  entries: CompanionManifestEntry[],
  currentIndex: number,
): CarouselSlot[] {
  if (entries.length === 0) return [];
  if (entries.length === 1) {
    return [{ slot: "current", entry: entries[0] }];
  }

  /**
   * With two companions, prev and next in a 3-up carousel would be the *same* entry,
   * so we show a single "preview" flank (the next in list) — the character you'll get
   * from the right-arrow / swipe left-to-right transition.
   */
  if (entries.length === 2) {
    const other = entries[(currentIndex + 1) % 2];
    return [
      { slot: "next", entry: other },
      { slot: "current", entry: entries[currentIndex] },
    ];
  }

  const prev = (currentIndex - 1 + entries.length) % entries.length;
  const next = (currentIndex + 1) % entries.length;
  return [
    { slot: "prev", entry: entries[prev] },
    { slot: "current", entry: entries[currentIndex] },
    { slot: "next", entry: entries[next] },
  ];
}

function createPersistentSlotEntries(
  entries: CompanionManifestEntry[],
  currentIndex: number,
): CarouselSlot[] {
  if (entries.length <= 3) {
    return createSlotEntries(entries, currentIndex);
  }
  return entries.map((entry, index) => {
    const forward = (index - currentIndex + entries.length) % entries.length;
    const backward = (currentIndex - index + entries.length) % entries.length;
    let slot: SlotName = "hidden";
    if (index === currentIndex) {
      slot = "current";
    } else if (backward === 1) {
      slot = "prev";
    } else if (forward === 1) {
      slot = "next";
    }
    return { slot, entry };
  });
}

function slotFrameStyle(
  slot: SlotName,
  opts: { soleFlankPair?: boolean } = {},
): CSSProperties {
  const { soleFlankPair } = opts;
  const base: CSSProperties = {
    position: "absolute",
    top: slot === "current" ? "5%" : "8%",
    width: slot === "current" ? "min(36vw, 360px)" : "min(24vw, 260px)",
    height: "min(66vh, 560px)",
    minWidth: slot === "current" ? 230 : 150,
    minHeight: 300,
    transition:
      "left 620ms cubic-bezier(0.22, 1, 0.36, 1), width 620ms cubic-bezier(0.22, 1, 0.36, 1), transform 620ms cubic-bezier(0.22, 1, 0.36, 1), opacity 420ms ease, filter 420ms ease",
    pointerEvents: slot === "current" ? "auto" : "none",
  };

  if (slot === "prev") {
    return {
      ...base,
      left: soleFlankPair ? "24%" : "16%",
      opacity: 0.4,
      filter: "saturate(0.75)",
      transform: "translateX(-50%) scale(0.76)",
      zIndex: 1,
    };
  }
  if (slot === "next") {
    return {
      ...base,
      left: soleFlankPair ? "76%" : "84%",
      opacity: soleFlankPair ? 0.5 : 0.4,
      filter: "saturate(0.75)",
      transform: `translateX(-50%) scale(${soleFlankPair ? 0.78 : 0.76})`,
      zIndex: 1,
    };
  }
  if (slot === "hidden") {
    return {
      ...base,
      left: "50%",
      opacity: 0,
      filter: "saturate(0.55)",
      transform: "translateX(-50%) scale(0.62)",
      zIndex: 0,
      pointerEvents: "none",
    };
  }
  return {
    ...base,
    left: "50%",
    opacity: 1,
    transform: "translateX(-50%) scale(1)",
    zIndex: 3,
  };
}

function launchConfetti(): () => void {
  if (typeof document === "undefined") return () => {};

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return () => {};

  let raf = 0;
  let stopped = false;
  const start = performance.now();
  const duration = 2200;
  const particles: ConfettiParticle[] = Array.from({ length: 80 }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
    const speed = 4 + Math.random() * 7;
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.34,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0.16 + Math.random() * 0.09,
      size: 6 + Math.random() * 8,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: confettiColours[Math.floor(Math.random() * confettiColours.length)],
    };
  });

  const resize = () => {
    canvas.width = Math.ceil(window.innerWidth * window.devicePixelRatio);
    canvas.height = Math.ceil(window.innerHeight * window.devicePixelRatio);
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
    context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  };

  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    zIndex: "80",
    pointerEvents: "none",
  });
  resize();
  document.body.appendChild(canvas);
  window.addEventListener("resize", resize);

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    canvas.remove();
  };

  const tick = (now: number) => {
    const elapsed = now - start;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.spin;
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.rotation);
      context.fillStyle = p.color;
      context.globalAlpha = Math.max(0, 1 - elapsed / duration);
      context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.58);
      context.restore();
    }

    if (elapsed < duration) {
      raf = requestAnimationFrame(tick);
    } else {
      cleanup();
    }
  };

  raf = requestAnimationFrame(tick);
  return cleanup;
}

function createAmbientMusic(): AmbientMusicHandle | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor =
    window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioContextCtor) return null;

  const context = new AudioContextCtor();
  const master = context.createGain();
  master.gain.value = 0.038;
  master.connect(context.destination);

  const padGain = context.createGain();
  padGain.gain.value = 0.018;
  padGain.connect(master);

  const padRoot = context.createOscillator();
  padRoot.type = "sine";
  padRoot.frequency.value = 220;
  padRoot.connect(padGain);
  padRoot.start();

  const padFifth = context.createOscillator();
  padFifth.type = "triangle";
  padFifth.frequency.value = 329.63;
  padFifth.connect(padGain);
  padFifth.start();

  let step = 0;
  const melody = [659.25, 739.99, 880, 739.99, 587.33, 659.25];
  const playChime = () => {
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = melody[step % melody.length];
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.052, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 1.2);
    step += 1;
  };

  playChime();
  const interval = window.setInterval(playChime, 1850);
  void context.resume();

  return {
    stop: () => {
      window.clearInterval(interval);
      padRoot.stop();
      padFifth.stop();
      void context.close();
    },
  };
}

function CompanionSlot({
  entry,
  slot,
  active,
  soleFlankPair,
  contained = false,
  vfxPreset,
  vfxLevel = "idle",
  getAnalyser,
  onMotorReady,
  onLoadSettled,
  onVrmAttached,
}: {
  entry: CompanionManifestEntry;
  slot: SlotName;
  active: boolean;
  /**
   * Two companions: only the `next` flank is shown — give it a hair more presence
   * than the default side preview.
  */
  soleFlankPair?: boolean;
  contained?: boolean;
  vfxPreset?: CompanionVfxPreset;
  vfxLevel?: CompanionVfxLevel;
  getAnalyser?: () => AnalyserNode | null;
  onMotorReady?: (slot: SlotName, motor: CompanionMotor | null) => void;
  onLoadSettled: (slotKey: string) => void;
  /** Fires once after `attachVrm` succeeds (not called on load failure). */
  onVrmAttached?: () => void;
}) {
  const slotKey = entry.id;
  const mountRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<THREE.Timer | null>(null);
  const motorRef = useRef<CompanionMotor | null>(null);
  const vfxLayerRef = useRef<CompanionVfxLayer | null>(null);
  const rendererRef = useRef<CompanionRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const slotRef = useRef(slot);
  const activeRef = useRef(active);
  const containedRef = useRef(contained);
  const companionConfig = useMemo(
    () =>
      mergeCompanionConfigWithDefaults(
        entry.companionConfig ?? {
          companionId: entry.id,
          vrmUrl: entry.vrmUrl,
        },
      ),
    [entry.companionConfig, entry.id, entry.vrmUrl],
  );
  const displayScale =
    typeof companionConfig.displayScale === "number" &&
    Number.isFinite(companionConfig.displayScale)
      ? Math.min(Math.max(companionConfig.displayScale, 1), 4)
      : 1;
  const containedFraming = useMemo(
    () => resolveShowroomContainedSlotFraming({ contained, displayScale }),
    [contained, displayScale],
  );
  const motorDisplayScale = contained
    ? containedFraming.motorDisplayScale
    : Math.min(displayScale, SHOWROOM_MAX_DISPLAY_SCALE);
  const showroomCompanionConfig = useMemo(
    () =>
      motorDisplayScale !== displayScale
        ? {
            ...companionConfig,
            displayScale: motorDisplayScale,
          }
        : companionConfig,
    [companionConfig, displayScale, motorDisplayScale],
  );
  const slotStyle = slotFrameStyle(slot, {
    soleFlankPair: Boolean(soleFlankPair) && (slot === "next" || slot === "prev"),
  });
  const hasCustomDisplayScale = displayScale > 1 && !contained;

  useEffect(() => {
    vfxLayerRef.current?.setLevel(vfxLevel);
  }, [vfxLevel]);

  useEffect(() => {
    const previousSlot = slotRef.current;
    slotRef.current = slot;
    const motor = motorRef.current;
      if (previousSlot !== slot) {
        onMotorReady?.(previousSlot, null);
      if (motor && slot !== "hidden") {
        onMotorReady?.(slot, motor);
      }
    }
    motor?.setCameraAngle(containedFraming.cameraAngle, 680);
  }, [contained, containedFraming.cameraAngle, onMotorReady, slot]);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    if (
      !shouldRunShowroomSlotLoop(
        slotRef.current,
        activeRef.current,
        containedRef.current,
      )
    ) {
      return;
    }
    const timer =
      timerRef.current ??
      (() => {
        const t = new THREE.Timer();
        if (typeof document !== "undefined") {
          t.connect(document);
        }
        return t;
      })();
    timerRef.current = timer;

    const tick = (time: number) => {
      if (
        !shouldRunShowroomSlotLoop(
          slotRef.current,
          activeRef.current,
          containedRef.current,
        )
      ) {
        rafRef.current = null;
        return;
      }
      const motor = motorRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!motor?.hasVrm() || !scene || !camera || !renderer) {
        rafRef.current = null;
        return;
      }

      timer.update(time);
      const dt = timer.getDelta();
      motor.tick({
        dt,
        dtMs: Math.min(dt * 1000, 100),
        companionEvents: [],
        companion: showroomCompanionConfig,
        childId: SHOWROOM_COMMAND_CHILD_ID,
        toggledOff: false,
        activeNodeScreen: null,
        analyser: getAnalyser?.() ?? null,
      });
      vfxLayerRef.current?.tick(dt, camera);
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [getAnalyser, showroomCompanionConfig, stopLoop]);

  useEffect(() => {
    activeRef.current = active;
    containedRef.current = contained;
    if (!shouldRunShowroomSlotLoop(slot, active, contained)) {
      stopLoop();
      return;
    }
    if (motorRef.current?.hasVrm()) {
      startLoop();
    }
  }, [active, contained, slot, startLoop, stopLoop]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    stopLoop();

    const readMountSize = () => {
      const rawW = Math.floor(mount.clientWidth || 0);
      const rawH = Math.floor(mount.clientHeight || 0);
      return { w: rawW > 0 ? rawW : 1, h: rawH > 0 ? rawH : 1 };
    };

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const { w, h } = readMountSize();
    const camera = new THREE.PerspectiveCamera(22, w / h, 0.05, 50);
    camera.position.set(0, 1, -3);
    camera.lookAt(0, 1, 0);
    cameraRef.current = camera;

    const motor = new CompanionMotor();
    motor.resetSessionState();
    motor.setCamera(camera);
    motor.setCameraAngle(containedFraming.cameraAngle, 0);
    motorRef.current = motor;
    if (slotRef.current !== "hidden") {
      onMotorReady?.(slotRef.current, motor);
    }

    const syncRendererToMount = () => {
      const renderer = rendererRef.current;
      const currentCamera = cameraRef.current;
      const currentMotor = motorRef.current;
      if (!renderer || !currentCamera || cancelled) return;
      const size = readMountSize();
      renderer.setSize(size.w, size.h);
      currentCamera.aspect = size.w / size.h;
      currentCamera.updateProjectionMatrix();
      if (currentMotor?.hasVrm()) {
        currentMotor.syncCameraToMount(size.w, size.h);
      }
    };

    const finishSetup = (renderer: CompanionRenderer, webgpuMaterials: boolean) => {
      if (cancelled) {
        renderer.dispose();
        return;
      }

      rendererRef.current = renderer;
      const canvas = renderer.domElement;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      canvas.style.pointerEvents = "none";

      scene.add(new THREE.AmbientLight(0xffffff, 0.62));
      const dir = new THREE.DirectionalLight(0xffffff, 0.88);
      dir.position.set(1.2, 2.2, 0.8);
      scene.add(dir);
      if (vfxPreset) {
        const vfxLayer = new CompanionVfxLayer(vfxPreset);
        vfxLayerRef.current = vfxLayer;
        scene.add(vfxLayer.group);
      }

      loadCompanionVrm(resolveModelUrl(showroomCompanionConfig.vrmUrl), {
        webgpu: webgpuMaterials,
      })
        .then((vrm) => {
          if (cancelled) {
            vrm.scene.removeFromParent();
            return;
          }
          const size = readMountSize();
          motor.attachVrm(vrm, scene, size.w, size.h, showroomCompanionConfig);
          motor.setCameraAngle(containedFraming.cameraAngle, 0);
          syncRendererToMount();
          requestAnimationFrame(syncRendererToMount);
          if (
            shouldRunShowroomSlotLoop(
              slotRef.current,
              activeRef.current,
              containedRef.current,
            )
          ) {
            startLoop();
          }
          onLoadSettled(slotKey);
          onVrmAttached?.();
        })
        .catch((err: unknown) => {
          console.error("CompanionShowroom: failed to load VRM —", err);
          onLoadSettled(slotKey);
        });
    };

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(syncRendererToMount);
      resizeObserver.observe(mount);
    }

    void (async () => {
      let renderer: CompanionRenderer | undefined;
      let webgpuAttempt: WebGPURenderer | undefined;

      try {
        webgpuAttempt = new WebGPURenderer({ antialias: true });
        await webgpuAttempt.init();
        renderer = webgpuAttempt;
      } catch (err: unknown) {
        console.error("CompanionShowroom: WebGPU failed, falling back:", err);
        if (webgpuAttempt) {
          try {
            webgpuAttempt.dispose();
          } catch (disposeErr: unknown) {
            console.error("CompanionShowroom: WebGPU dispose after failure:", disposeErr);
          }
        }
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        });
      }

      if (cancelled || !renderer) {
        renderer?.dispose();
        return;
      }

      renderer.setSize(w, h);
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      if (!isWebGpuRenderer(renderer)) {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
      }
      mount.appendChild(renderer.domElement);
      syncRendererToMount();
      finishSetup(renderer, isWebGpuRenderer(renderer));
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      stopLoop();
      if (slotRef.current !== "hidden") {
        onMotorReady?.(slotRef.current, null);
      }
      motor.dispose();
      motorRef.current = null;
      timerRef.current?.dispose();
      timerRef.current = null;
      const renderer = rendererRef.current;
      rendererRef.current = null;
      vfxLayerRef.current?.dispose();
      vfxLayerRef.current = null;
      if (renderer) {
        renderer.domElement.remove();
        renderer.dispose();
      }
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [
    contained,
    containedFraming.cameraAngle,
    onLoadSettled,
    onMotorReady,
    onVrmAttached,
    showroomCompanionConfig,
    slotKey,
    startLoop,
    stopLoop,
    vfxPreset,
  ]);

  return (
    <motion.div
      aria-hidden={slot !== "current"}
      initial={false}
      style={
        contained
          ? {
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: 1,
              zIndex: 1,
              pointerEvents: "none",
              transform: `scale(${containedFraming.cssScale})`,
              transformOrigin: containedFraming.transformOrigin,
            }
          : slotStyle
      }
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.34, ease: "easeOut" }}
        style={{
          width: "100%",
          height: "100%",
          animation: active ? "sunny-showroom-breathe 3s ease-in-out infinite alternate" : undefined,
        }}
      >
        <div
          ref={mountRef}
          data-display-scale={hasCustomDisplayScale ? displayScale : undefined}
          style={{
            width: "100%",
            height: "100%",
            transformOrigin: "50% 92%",
          }}
        />
      </motion.div>
    </motion.div>
  );
}

/**
 * CompanionInfoCard
 * ─────────────────
 * Two-panel info card that slides in when the user clicks "Meet me".
 * LEFT:  name, personality traits, subject strengths, bio
 * RIGHT: live 3D canvas close-up for the selected companion.
 *
 * Picking now happens inside the card so the bottom of the stage stays clear.
 */
function CompanionInfoCard({
  entry,
  introText,
  bonusPoints,
  pickLabel,
  picking,
  speakingLine,
  speechError,
  selectedVoiceId,
  getAnalyser,
  onVoiceChange,
  onSpeak,
  onSpecialDance,
  onSignatureMove,
  signatureMoveLevel,
  onPick,
  onClose,
  onCardMotorReady,
  onCardVrmSettled,
  cardPreviewVrmReady,
}: {
  entry: CompanionManifestEntry;
  introText: string;
  bonusPoints?: number;
  pickLabel: string;
  picking: boolean;
  speakingLine: SpeakingLine | null;
  speechError: string | null;
  selectedVoiceId: string;
  getAnalyser: () => AnalyserNode | null;
  onVoiceChange: (voiceId: string) => void;
  onSpeak: (line: SpeakingLine) => void;
  onSpecialDance: () => void;
  onSignatureMove: () => void;
  signatureMoveLevel: SignatureMoveLevel;
  onPick: () => void;
  onClose: () => void;
  onCardMotorReady: (motor: CompanionMotor | null) => void;
  onCardVrmSettled: () => void;
  /** True after the card 3D preview has a VRM (signature dance + speech gestures are reliable). */
  cardPreviewVrmReady: boolean;
}) {
  const cardAccent = entry.id
    ? `hsl(${(entry.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360}, 70%, 68%)`
    : "#a78bfa";
  const showroom = entry.showroom;

  const handleCardSlotMotorReady = useCallback(
    (_slot: SlotName, motor: CompanionMotor | null) => {
      onCardMotorReady(motor);
    },
    [onCardMotorReady],
  );

  const handleCardVrmAttached = useCallback(() => {
    onCardVrmSettled();
  }, [onCardVrmSettled]);

  const ignoreCardSlotLoadSettled = useCallback(() => {}, []);

  const detailRows = [
    { label: "Likes", values: showroom?.likes ?? [] },
    { label: "Special skills", values: showroom?.specialSkills ?? [] },
    { label: "Catchphrases", values: showroom?.catchphrases ?? [] },
  ].filter((row) => row.values.length > 0);
  const voices = entry.voices ?? [];
  const canSpeak = voices.length > 0;
  const signatureMove = showroom?.signatureMove;
  const signatureActive = signatureMoveLevel !== "idle";

  return (
    <motion.div
      key="companion-info-card"
      initial={{ opacity: 0, x: 56, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 56, scale: 0.97 }}
      transition={{ duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
      style={{
        position: "fixed",
        top: "auto",
        bottom: "clamp(18px, 4vh, 46px)",
        right: "clamp(14px, 3vw, 46px)",
        zIndex: 34,
        width: "min(62vw, 860px)",
        minWidth: "min(94vw, 390px)",
        height: "min(58vh, 520px)",
        maxHeight: "calc(100vh - 56px)",
        borderRadius: 16,
        background: "rgba(10, 6, 24, 0.96)",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: "0 26px 70px rgba(0,0,0,0.64)",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(180px, 0.55fr)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        aria-label="Close companion card"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          zIndex: 6,
          width: 38,
          height: 38,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.24)",
          background: "rgba(15,23,42,0.86)",
          color: "#f8fafc",
          fontSize: 24,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ×
      </button>
      {/* ── LEFT: bio + traits + strengths ── */}
      <div
        style={{
          height: "100%",
          padding: "28px 24px 22px",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            paddingRight: 4,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "clamp(28px, 4.4vw, 42px)",
                fontWeight: 800,
                color: "#fff",
                lineHeight: 1.05,
                overflowWrap: "anywhere",
              }}
            >
              {entry.name}
            </h2>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.35)",
              }}
            >
              {introText.slice(0, 48)}…
            </p>
          </div>

          <p
            style={{
              margin: 0,
              borderRadius: 14,
              background: "rgba(255,255,255,0.94)",
              color: "#1e1b4b",
              fontSize: 15,
              lineHeight: 1.45,
              padding: "14px 16px",
              boxShadow: "0 12px 34px rgba(0,0,0,0.24)",
            }}
          >
            {introText}
          </p>

          <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

          <div>
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.28)",
                marginBottom: 10,
              }}
            >
              Personality
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {entry.personality.map((t) => (
                <span
                  key={t}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 999,
                    background: "rgba(109,94,245,0.22)",
                    border: "1.5px solid rgba(109,94,245,0.45)",
                    color: "#c4b5fd",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {showroom?.personality && (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.62)",
              }}
            >
              {showroom.personality}
            </p>
          )}

          {detailRows.map((row) => (
            <div key={row.label}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.28)",
                  margin: "0 0 8px",
                }}
              >
                {row.label}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "rgba(255,255,255,0.58)",
                }}
              >
                {row.values.slice(0, 4).join(", ")}
              </p>
            </div>
          ))}

          {bonusPoints != null && bonusPoints > 0 && (
            <div style={{ color: "#fbbf24", fontSize: 14, fontWeight: 700 }}>
              +{bonusPoints} bonus XP when you pick {entry.name}
            </div>
          )}
        </div>

        <div
          style={{
            flex: "0 0 auto",
            margin: "14px -24px -22px",
            padding: "14px 24px 22px",
            background:
              "linear-gradient(180deg, rgba(10,6,24,0.6), rgba(10,6,24,0.98))",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {voices.length > 1 && (
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                color: "rgba(255,255,255,0.58)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Voice
              <select
                value={selectedVoiceId}
                onChange={(event) => onVoiceChange(event.target.value)}
                disabled={speakingLine != null}
                style={{
                  minHeight: 40,
                  borderRadius: 12,
                  border: "1px solid rgba(109,94,245,0.42)",
                  background: "rgba(255,255,255,0.1)",
                  color: "#f8fafc",
                  fontSize: 14,
                  fontWeight: 800,
                  fontFamily: "Lexend, system-ui, sans-serif",
                  padding: "0 12px",
                  outline: "none",
                }}
              >
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onSpeak("intro")}
              disabled={!canSpeak || speakingLine != null || !cardPreviewVrmReady}
              title={!cardPreviewVrmReady ? "Loading 3D preview…" : undefined}
              style={{
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: 999,
                background: canSpeak ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
                color: canSpeak ? "#f8fafc" : "rgba(255,255,255,0.38)",
                fontSize: 14,
                fontWeight: 800,
                fontFamily: "Lexend, system-ui, sans-serif",
                padding: "11px 16px",
                cursor:
                  canSpeak && speakingLine == null && cardPreviewVrmReady ? "pointer" : "not-allowed",
              }}
            >
              {speakingLine === "intro" ? "Speaking..." : canSpeak ? "Say Hi" : "Needs voice"}
            </button>
            <button
              type="button"
              onClick={() => onSpeak("plead")}
              disabled={!canSpeak || speakingLine != null || !cardPreviewVrmReady}
              title={!cardPreviewVrmReady ? "Loading 3D preview…" : undefined}
              style={{
                border: "1px solid rgba(109,94,245,0.45)",
                borderRadius: 999,
                background: canSpeak ? "rgba(109,94,245,0.22)" : "rgba(255,255,255,0.05)",
                color: canSpeak ? "#ddd6fe" : "rgba(255,255,255,0.38)",
                fontSize: 14,
                fontWeight: 800,
                fontFamily: "Lexend, system-ui, sans-serif",
                padding: "11px 16px",
                cursor:
                  canSpeak && speakingLine == null && cardPreviewVrmReady ? "pointer" : "not-allowed",
              }}
            >
              {speakingLine === "plead" ? "Speaking..." : canSpeak ? "Why Pick Me?" : "Needs voice"}
            </button>
            <button
              type="button"
              onClick={onSpecialDance}
              disabled={!cardPreviewVrmReady}
              title={!cardPreviewVrmReady ? "Loading 3D preview…" : undefined}
              style={{
                border: "1px solid rgba(251,191,36,0.38)",
                borderRadius: 999,
                background: "rgba(251,191,36,0.13)",
                color: "#fde68a",
                fontSize: 14,
                fontWeight: 800,
                fontFamily: "Lexend, system-ui, sans-serif",
                padding: "11px 16px",
                cursor: cardPreviewVrmReady ? "pointer" : "not-allowed",
              }}
            >
              Signature Dance
            </button>
            {signatureMove && (
              <button
                type="button"
                onClick={onSignatureMove}
                disabled={!cardPreviewVrmReady || speakingLine != null}
                title={!cardPreviewVrmReady ? "Loading 3D preview…" : signatureMove.voiceLine}
                style={{
                  border: "1px solid rgba(250,204,21,0.58)",
                  borderRadius: 999,
                  background:
                    "linear-gradient(135deg, rgba(34,197,94,0.24), rgba(250,204,21,0.24))",
                  color: "#fef9c3",
                  fontSize: 14,
                  fontWeight: 900,
                  fontFamily: "Lexend, system-ui, sans-serif",
                  padding: "11px 16px",
                  cursor:
                    cardPreviewVrmReady && speakingLine == null ? "pointer" : "not-allowed",
                  boxShadow: signatureActive ? "0 0 26px rgba(250,204,21,0.34)" : undefined,
                }}
              >
                {signatureMove.name}
              </button>
            )}
          </div>

          {speechError && (
            <p style={{ margin: 0, color: "#fca5a5", fontSize: 12, lineHeight: 1.4 }}>
              {speechError}
            </p>
          )}

          <button
            type="button"
            onClick={onPick}
            disabled={picking}
            style={{
              border: 0,
              borderRadius: 999,
              background: accent,
              color: "#fff",
              fontSize: 18,
              fontWeight: 800,
              fontFamily: "Lexend, system-ui, sans-serif",
              padding: "14px 22px",
              boxShadow: "0 18px 44px rgba(109,94,245,0.42)",
              cursor: picking ? "wait" : "pointer",
              opacity: picking ? 0.76 : 1,
              whiteSpace: "normal",
            }}
          >
            {pickLabel}
          </button>
        </div>
      </div>
      <div
        aria-hidden
        className={signatureActive ? "sunny-kefla-power-shake" : undefined}
        style={{
          position: "relative",
          minHeight: 0,
          background: `radial-gradient(ellipse at 50% 18%, ${cardAccent}22, transparent 62%), rgba(0,0,0,0.24)`,
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <CompanionSlot
          entry={entry}
          slot="current"
          active
          contained
          vfxPreset={signatureMoveVfxPreset(entry)}
          vfxLevel={signatureMoveLevel}
          getAnalyser={getAnalyser}
          onMotorReady={handleCardSlotMotorReady}
          onLoadSettled={ignoreCardSlotLoadSettled}
          onVrmAttached={handleCardVrmAttached}
        />
      </div>
    </motion.div>
  );
}

export function CompanionShowroom({
  onSelect,
  getText,
  bonusPoints,
  childName,
  useGeneratedBackground = false,
  generatedBackgroundUrl,
  enableBackgroundMusic = false,
  generatedBackgroundLoading = false,
  initialTheme,
  availableThemes,
  onThemeChange,
  videoCallContext,
}: CompanionShowroomProps) {
  const initialAvailableThemes = resolveAvailableShowroomThemes(availableThemes);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeThemeId, setActiveThemeId] = useState<ShowroomTheme>(() =>
    resolveShowroomThemeWithinAvailability(
      resolveInitialShowroomTheme(initialTheme),
      initialAvailableThemes,
    ),
  );
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const [picking, setPicking] = useState(false);
  const [musicOn, setMusicOn] = useState(enableBackgroundMusic);
  const [speakingLine, setSpeakingLine] = useState<SpeakingLine | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [signatureMoveLevel, setSignatureMoveLevel] =
    useState<SignatureMoveLevel>("idle");
  const [voiceSelections, setVoiceSelections] = useState<Record<string, string>>({});
  const [showroomTalkOpen, setShowroomTalkOpen] = useState(false);
  const [showroomTalkPhase, setShowroomTalkPhase] =
    useState<ShowroomTalkUiPhase>("idle");
  const [showroomTalkQuestion, setShowroomTalkQuestion] = useState("");
  const [showroomTalkResponse, setShowroomTalkResponse] = useState("");
  const [showroomTalkError, setShowroomTalkError] = useState<string | null>(null);
  const [showroomVideoChatOpen, setShowroomVideoChatOpen] = useState(false);
  const [showroomVideoChatCameraState, setShowroomVideoChatCameraState] =
    useState<ShowroomVideoChatCameraState>("off");
  const [showroomVideoCallPhase, setShowroomVideoCallPhase] =
    useState<ShowroomVideoCallPhase>("idle");
  const [showroomVideoChatError, setShowroomVideoChatError] =
    useState<string | null>(null);
  const [showroomVideoLastVisualSummary, setShowroomVideoLastVisualSummary] =
    useState<string>("");
  const [activeVideoCallActivity, setActiveVideoCallActivity] =
    useState<ShowroomCompanionActivityId | null>(null);
  const [showroomVideoActiveActivity, setShowroomVideoActiveActivity] =
    useState<ShowroomVideoActivityContext | null>(null);
  const [videoCallLayout, setVideoCallLayout] =
    useState<CompanionVideoCallLayout>("call");
  const [videoCallCompanionView, setVideoCallCompanionView] =
    useState<CompanionVideoCompanionView>("full_body");
  const [showroomVideoCallTraceId, setShowroomVideoCallTraceId] =
    useState<string | null>(null);
  const [showroomVideoTraceCopyStatus, setShowroomVideoTraceCopyStatus] =
    useState<string | null>(null);
  const [showroomDiagAnimation, setShowroomDiagAnimation] = useState<string>("idle");
  const [showroomDiagLastCommand, setShowroomDiagLastCommand] =
    useState<string>("none");
  const [showShowroomDiagPanel, setShowShowroomDiagPanel] = useState(false);
  const [initialCurtainDismissed, setInitialCurtainDismissed] = useState(false);
  const [settledSlotKeys, setSettledSlotKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const activeVideoCallContext = useMemo(() => {
    const queryContext =
      typeof window === "undefined"
        ? createShowroomVideoCallContextFromSearch("")
        : createShowroomVideoCallContextFromSearch(window.location.search);
    return {
      callSource: videoCallContext?.callSource ?? queryContext.callSource,
      relationshipState:
        videoCallContext?.relationshipState ?? queryContext.relationshipState,
      rewardContext: {
        ...(queryContext.rewardContext ?? {}),
        ...(videoCallContext?.rewardContext ?? {}),
      },
    };
  }, [videoCallContext]);
  const talkChildId = useMemo(
    () =>
      resolveShowroomTalkChildId(
        childName,
        typeof window === "undefined" ? "" : window.location.search,
      ),
    [childName],
  );
  const motorsRef = useRef<Partial<Record<SlotName, CompanionMotor>>>({});
  const cardMotorRef = useRef<CompanionMotor | null>(null);
  /** Spotlight card mounts a second WebGL viewer; wait for VRM before driving clips (else emote fallback looks identical per character). */
  const [cardPreviewVrmReady, setCardPreviewVrmReady] = useState(false);
  const timersRef = useRef<Set<number>>(new Set());
  const confettiCleanupRef = useRef<(() => void) | null>(null);
  const musicRef = useRef<AmbientMusicHandle | null>(null);
  const speechAudioRef = useRef<{
    audio: HTMLAudioElement;
    context: AudioContext;
  } | null>(null);
  const speechAnalyserRef = useRef<AnalyserNode | null>(null);
  const speechGestureIntervalRef = useRef<number | null>(null);
  const speechUrlRef = useRef<string | null>(null);
  const showroomSpeechRecognitionRef = useRef<ShowroomSpeechRecognition | null>(null);
  const showroomTalkPhaseRef = useRef<ShowroomTalkUiPhase>("idle");
  const showroomVideoElementRef = useRef<HTMLVideoElement | null>(null);
  const showroomVideoStreamRef = useRef<MediaStream | null>(null);
  const showroomVideoActiveActivityRef =
    useRef<ShowroomVideoActivityContext | null>(null);
  const queuedVideoCallActivityRequestRef =
    useRef<ShowroomCompanionActivityRequest | null>(null);
  const videoCallConversationModeRef = useRef<CompanionConversationMode>("social");
  const videoCallRepeatAfterModeRef = useRef(false);
  const videoChatMotorRef = useRef<CompanionMotor | null>(null);
  const videoChatContinuousListenRef = useRef(false);
  const videoChatNoSpeechRetryCountRef = useRef(0);
  const videoChatHandsFreeRearmRef = useRef<((reason: string, delayMs?: number) => void) | null>(
    null,
  );
  const videoChatStartListeningRef = useRef<(() => void) | null>(null);
  const activityReactionInFlightRef = useRef(false);
  const activityReactionQueueRef = useRef<{
    reaction: ShowroomActivityReactionContext;
    activeActivity: ShowroomVideoActivityContext;
  } | null>(null);
  const activityReactionQueueGuardRef = useRef(0);
  const activityReactionRequesterRef = useRef<
    | ((
        reaction: ShowroomActivityReactionContext,
        activeActivity: ShowroomVideoActivityContext,
      ) => void)
    | null
  >(null);
  const videoChatRingtoneRef = useRef<AmbientMusicHandle | null>(null);
  const videoCallTurnSequenceRef = useRef(0);
  const currentVideoCallTurnIdRef = useRef<string | null>(null);
  const lastVideoCallTranscriptHashRef = useRef<string | undefined>(undefined);
  const lastVideoCallResponseRef = useRef<string>("");
  const powerUpSfxRef = useRef<AmbientMusicHandle | null>(null);
  const swipeFromXRef = useRef<number | null>(null);
  const getSpeechAnalyser = useCallback(() => speechAnalyserRef.current, []);
  showroomTalkPhaseRef.current = showroomTalkPhase;

  useEffect(() => {
    showroomVideoActiveActivityRef.current = showroomVideoActiveActivity;
  }, [showroomVideoActiveActivity]);

  const availableShowroomThemes = useMemo(
    () => resolveAvailableShowroomThemes(availableThemes),
    [availableThemes],
  );
  const activeTheme = getShowroomThemeConfig(activeThemeId);
  const activeAccent = activeTheme.accent;
  const generatedBackgroundApplies = activeThemeId === DEFAULT_SHOWROOM_THEME;

  const entries = COMPANION_MANIFEST;
  const isPairDuo = entries.length === 2;
  const current = entries[currentIndex] ?? null;
  const introText = current ? getText(current.id) : "";
  const showroomVideoTraceLink = useMemo(
    () =>
      showroomVideoCallTraceId
        ? buildCompanionVideoTraceUrl(showroomVideoCallTraceId)
        : null,
    [showroomVideoCallTraceId],
  );
  const nextShowroomVideoTurnId = useCallback(() => {
    if (!showroomVideoCallTraceId) return undefined;
    videoCallTurnSequenceRef.current += 1;
    return createCompanionVideoCallTurnId(
      showroomVideoCallTraceId,
      videoCallTurnSequenceRef.current,
    );
  }, [showroomVideoCallTraceId]);
  const emitShowroomVideoCallTrace = useCallback(
    (input: {
      eventName: Parameters<typeof emitCompanionVideoCallTrace>[0]["eventName"];
      turnId?: string;
      payload?: Record<string, unknown>;
      traceId?: string;
      timestamp?: number;
    }) => {
      const traceId = input.traceId ?? showroomVideoCallTraceId;
      if (!traceId || !current) return;
      const payload = {
        ...(input.payload ?? {}),
        ...(showroomVideoActiveActivityRef.current && {
          activeActivity: showroomVideoActiveActivityRef.current,
        }),
        videoCallLayout,
      };
      void emitCompanionVideoCallTrace({
        traceId,
        turnId: input.turnId,
        eventName: input.eventName,
        childId: talkChildId,
        companionId: current.id,
        callSource: activeVideoCallContext.callSource,
        relationshipState: activeVideoCallContext.relationshipState,
        timestamp: input.timestamp,
        payload,
      }).catch((err: unknown) => {
        console.warn(" 🎮 [showroom-video-trace] emit_failed", err);
      });
    },
    [
      activeVideoCallContext,
      current,
      showroomVideoCallTraceId,
      talkChildId,
      videoCallLayout,
    ],
  );
  const copyShowroomVideoTraceLink = useCallback(() => {
    if (!showroomVideoTraceLink) return;
    const fallbackCopy = () => {
      if (copyTextWithTextareaFallback(showroomVideoTraceLink)) {
        setShowroomVideoTraceCopyStatus("Trace copied");
      } else {
        setShowroomVideoTraceCopyStatus("Copy failed");
      }
    };
    if (!navigator.clipboard?.writeText) {
      fallbackCopy();
      return;
    }
    void navigator.clipboard
      .writeText(showroomVideoTraceLink)
      .then(() => setShowroomVideoTraceCopyStatus("Trace copied"))
      .catch((err: unknown) => {
        console.warn(" 🎮 [showroom-video-trace] copy_failed", err);
        fallbackCopy();
      });
  }, [showroomVideoTraceLink]);
  const slots = useMemo(
    () => createPersistentSlotEntries(entries, currentIndex),
    [entries, currentIndex],
  );
  const showCompanionDots = shouldShowShowroomCompanionDots(
    activeThemeId,
    entries.length,
    spotlightOpen,
  );
  const visibleSlotKeys = useMemo(
    () =>
      slots
        .filter((slot) => slot.slot !== "hidden")
        .map((slot) => slot.entry.id),
    [slots],
  );
  const visibleSlotsSettled = visibleSlotKeys.every((slotKey) =>
    settledSlotKeys.has(slotKey),
  );
  const showroomReady =
    visibleSlotsSettled &&
    !(generatedBackgroundApplies && generatedBackgroundLoading);
  const initialStageLoading = !initialCurtainDismissed && !showroomReady;

  useEffect(() => {
    if (availableShowroomThemes.includes(activeThemeId)) return;
    const nextTheme = resolveShowroomThemeWithinAvailability(
      initialTheme,
      availableShowroomThemes,
    );
    setActiveThemeId(nextTheme);
    onThemeChange?.(nextTheme);
  }, [activeThemeId, availableShowroomThemes, initialTheme, onThemeChange]);

  const selectShowroomTheme = useCallback(
    (theme: ShowroomTheme) => {
      const nextTheme = resolveShowroomThemeWithinAvailability(
        theme,
        availableShowroomThemes,
      );
      if (nextTheme === activeThemeId) return;
      setActiveThemeId(nextTheme);
      onThemeChange?.(nextTheme);
    },
    [activeThemeId, availableShowroomThemes, onThemeChange],
  );

  const cycleShowroomTheme = useCallback(
    (direction: -1 | 1) => {
      const nextState = getNextShowroomThemeState(
        { theme: activeThemeId, currentIndex },
        direction,
        availableShowroomThemes,
      );
      if (nextState.theme === activeThemeId) return;
      setActiveThemeId(nextState.theme);
      onThemeChange?.(nextState.theme);
    },
    [activeThemeId, availableShowroomThemes, currentIndex, onThemeChange],
  );

  useEffect(() => {
    if (introVisible) {
      setCardPreviewVrmReady(false);
    }
  }, [introVisible]);

  const handleCardMotorReady = useCallback((motor: CompanionMotor | null) => {
    cardMotorRef.current = motor;
  }, []);

  const handleVideoChatMotorReady = useCallback(
    (_slot: SlotName, motor: CompanionMotor | null) => {
      videoChatMotorRef.current = motor;
    },
    [],
  );

  const handleCardVrmSettled = useCallback(() => {
    setCardPreviewVrmReady(true);
  }, []);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
    }
    timersRef.current.clear();
  }, []);

  const schedule = useCallback((fn: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      fn();
    }, delay);
    timersRef.current.add(timer);
    return timer;
  }, []);

  const setMotor = useCallback((slot: SlotName, motor: CompanionMotor | null) => {
    if (motor) {
      motorsRef.current[slot] = motor;
    } else {
      delete motorsRef.current[slot];
    }
  }, []);

  const markSlotLoadSettled = useCallback((slotKey: string) => {
    setSettledSlotKeys((prev) => {
      if (prev.has(slotKey)) return prev;
      const next = new Set(prev);
      next.add(slotKey);
      return next;
    });
  }, []);

  const noopShowroomSlotSettled = useCallback((_slotKey: string) => {}, []);

  const playCurrentCompanionAnimation = useCallback(
    (animation: string, opts?: { loop?: boolean }) => {
      const cmd = createShowroomAnimateCommand(animation, opts);
      processShowroomCommand(motorsRef.current.current, cmd);
      processShowroomCommand(cardMotorRef.current, cmd);
      processShowroomCommand(videoChatMotorRef.current, cmd);
    },
    [],
  );

  const playCurrentCompanionEmote = useCallback(
    (opts: { emote: string; intensity?: number; durationMs?: number }) => {
      const cmd = createShowroomEmoteCommand(opts.emote, {
        intensity: opts.intensity,
        durationMs: opts.durationMs,
      });
      processShowroomCommand(motorsRef.current.current, cmd);
      processShowroomCommand(cardMotorRef.current, cmd);
      processShowroomCommand(videoChatMotorRef.current, cmd);
    },
    [],
  );

  const applyShowroomThinkingBodyLanguage = useCallback(
    (opts: {
      reason: string;
      turnId?: string;
      intensity?: number;
      durationMs?: number;
    }) => {
      if (!current) return;
      console.log(
        ` 🎮 [showroom-activity-runtime] [thinking] [applied] companion=${current.id} reason=${opts.reason}`,
      );
      playCurrentCompanionEmote({
        emote: "thinking",
        intensity: opts.intensity ?? 0.62,
        durationMs: opts.durationMs ?? 1200,
      });
      const command = createCompanionActivityThinkingCommand({
        childId: SHOWROOM_COMMAND_CHILD_ID,
      });
      processShowroomCommand(motorsRef.current.current, command);
      processShowroomCommand(cardMotorRef.current, command);
      processShowroomCommand(videoChatMotorRef.current, command);
      emitShowroomVideoCallTrace({
        eventName: "activity_phase_changed",
        turnId: opts.turnId,
        payload: {
          phase: "companion_thinking",
          reason: opts.reason,
          conversationMode: videoCallConversationModeRef.current,
          commandType: command.type,
          animation: command.payload.animation,
        },
      });
    },
    [current, emitShowroomVideoCallTrace, playCurrentCompanionEmote],
  );

  const fireShowroomDiagAnimation = useCallback(
    (animation: string, opts?: { loop?: boolean }) => {
      playCurrentCompanionAnimation(animation, opts);
      setShowroomDiagLastCommand(
        `${animation}${opts?.loop === true ? " loop" : ""}`,
      );
    },
    [playCurrentCompanionAnimation],
  );

  const playSlotAnimation = useCallback(
    (slot: SlotName, animation: string, opts?: { loop?: boolean }) => {
      processShowroomCommand(
        motorsRef.current[slot],
        createShowroomAnimateCommand(animation, opts),
      );
    },
    [],
  );

  const setCurrentCompanionCamera = useCallback(
    (angle: CameraAngle, transitionMs?: number) => {
      const cmd = createShowroomCameraCommand(angle, transitionMs);
      processShowroomCommand(motorsRef.current.current, cmd);
      processShowroomCommand(cardMotorRef.current, cmd);
      processShowroomCommand(videoChatMotorRef.current, cmd);
    },
    [],
  );

  const startMusic = useCallback(() => {
    if (!enableBackgroundMusic || !musicOn || musicRef.current) return;
    musicRef.current = createAmbientMusic();
  }, [enableBackgroundMusic, musicOn]);

  const clearSpeechGestures = useCallback(() => {
    if (speechGestureIntervalRef.current != null) {
      window.clearInterval(speechGestureIntervalRef.current);
      speechGestureIntervalRef.current = null;
    }
  }, []);

  const playShowroomGesture = useCallback(
    (line: GestureLine, step = 0, opts?: { loop?: boolean }) => {
      if (!current) return;
      const sequence = resolveShowroomGestureSequence(
        current.showroom?.gestureProfile,
        line,
      );
      const animation = sequence[step % sequence.length] ?? "wave";
      playCurrentCompanionAnimation(animation, { loop: opts?.loop ?? false });
    },
    [current, playCurrentCompanionAnimation],
  );

  const startSpeechGestures = useCallback(
    (line: SpeakingLine) => {
      clearSpeechGestures();
      if (!current) return;
      const plan = resolveShowroomSpeechGesturePlan(
        current.showroom?.gestureProfile,
        line,
      );
      const primary = plan.sequence[0] ?? "talking";
      playCurrentCompanionAnimation(primary, { loop: plan.sustainPrimary });
      if (plan.sustainPrimary || plan.intervalMs == null || plan.sequence.length <= 1) {
        return;
      }
      let step = 1;
      speechGestureIntervalRef.current = window.setInterval(() => {
        const animation = plan.sequence[step % plan.sequence.length] ?? primary;
        playCurrentCompanionAnimation(animation, { loop: false });
        step += 1;
      }, plan.intervalMs);
    },
    [clearSpeechGestures, current, playCurrentCompanionAnimation],
  );

  const stopSpeech = useCallback(() => {
    clearSpeechGestures();
    setSignatureMoveLevel("idle");
    powerUpSfxRef.current?.stop();
    powerUpSfxRef.current = null;
    speechAudioRef.current?.audio.pause();
    void speechAudioRef.current?.context.close();
    speechAudioRef.current = null;
    speechAnalyserRef.current = null;
    if (speechUrlRef.current) {
      URL.revokeObjectURL(speechUrlRef.current);
      speechUrlRef.current = null;
    }
    setSpeakingLine(null);
  }, [clearSpeechGestures]);

  const resetShowroomTalk = useCallback(() => {
    showroomSpeechRecognitionRef.current?.abort();
    showroomSpeechRecognitionRef.current = null;
    videoChatNoSpeechRetryCountRef.current = 0;
    setShowroomTalkPhase("idle");
    setShowroomTalkQuestion("");
    setShowroomTalkResponse("");
    setShowroomTalkError(null);
  }, []);

	  const captureShowroomVideoSnapshot = useCallback(
    (reason = "video_call_snapshot"): ShowroomVideoSnapshotPayload | null => {
      const video = showroomVideoElementRef.current;
      const stream = showroomVideoStreamRef.current;
      if (!video || !stream || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        return null;
      }
      const width = Math.min(512, video.videoWidth);
      const height = Math.max(1, Math.round(video.videoHeight * (width / video.videoWidth)));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.65);
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
      if (!base64) return null;
      console.log(
        ` 🎮 [showroom-video-chat] snapshot_captured reason=${reason} size=${width}x${height}`,
      );
      return {
        base64,
        mimeType: "image/jpeg",
        reason,
        capturedAt: Date.now(),
        width,
        height,
      };
    },
	    [],
	  );

  const postShowroomVideoCallActivityEvent = useCallback(
    (event: CompanionTicTacToeGameEvent) => {
      if (!current || !SHOWROOM_VIDEO_CALL_ACTIVITY_LOG_TYPES.has(event.type)) return;
      const nextActivityContext = createShowroomVideoActivityContextFromEvent(
        event,
        showroomVideoActiveActivityRef.current,
      );
      showroomVideoActiveActivityRef.current = nextActivityContext;
      setShowroomVideoActiveActivity(nextActivityContext);
      const rewardContext =
        Object.keys(activeVideoCallContext.rewardContext).length > 0
          ? activeVideoCallContext.rewardContext
          : undefined;
      const payload = {
        ...event,
        childId: talkChildId,
        companionId: current.id,
        companionName: current.name,
        showroomTheme: activeThemeId,
        callSource: activeVideoCallContext.callSource,
        relationshipState: activeVideoCallContext.relationshipState,
        ...(rewardContext && { rewardContext }),
        videoCallLayout,
        phase: "video_call_activity",
        progress:
          event.type === "companion_tic_tac_toe_round_complete"
            ? `${current.name} completed a tic-tac-toe round.`
            : `${current.name} tic-tac-toe activity updated.`,
      };
      console.log(
        ` 🎮 [showroom-video-chat] activity_event type=${event.type} activity=${event.activityId} companion=${current.id} layout=${videoCallLayout}`,
      );
      emitShowroomVideoCallTrace({
        eventName: "activity_context_changed",
        payload: {
          ...payload,
          activeActivity: nextActivityContext,
        },
      });
      if (shouldRequestShowroomActivityReaction(event)) {
        const reaction = createShowroomActivityReactionFromEvent(
          event,
          nextActivityContext,
        );
        if (reaction) {
          activityReactionRequesterRef.current?.(reaction, nextActivityContext);
        }
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: "game_state_update",
            payload,
            version: "1.0",
          },
          "*",
        );
      }
    },
    [
      activeThemeId,
      activeVideoCallContext,
      current,
      emitShowroomVideoCallTrace,
      talkChildId,
      videoCallLayout,
    ],
  );

  const requestShowroomVideoActivityReaction = useCallback(
    async (
      reaction: ShowroomActivityReactionContext,
      activeActivity: ShowroomVideoActivityContext,
    ) => {
      if (!current) return;
      const currentDefaultVoice =
        current.voices.find((voice) => voice.default)?.id ?? current.voices[0]?.id ?? "";
      const selectedVoiceId = voiceSelections[current.id] ?? currentDefaultVoice;
      const traceTurnId = nextShowroomVideoTurnId();
      const reactionStartMs = performance.now();
      const runGestureOnlyFallback = (reason: string) => {
        console.warn(
          ` 🎮 [showroom-activity-reaction] fallback companion=${current.id} event=${reaction.eventType} reason=${reason}`,
        );
        emitShowroomVideoCallTrace({
          eventName: "activity_reaction_fallback",
          turnId: traceTurnId,
          payload: {
            reason,
            fallback: "gesture_only",
            activityReaction: reaction,
            activeActivity,
          },
        });
        setShowroomTalkPhase("idle");
        playCurrentCompanionAnimation(
          getShowroomActivityReactionFallbackAnimation(reaction),
          { loop: false },
        );
        schedule(() => {
          playCurrentCompanionAnimation("idle", { loop: true });
        }, 1400);
        videoChatHandsFreeRearmRef.current?.(
          "activity_reaction_fallback",
          SHOWROOM_VIDEO_CHAT_VISUAL_ACTION_REARM_MS,
        );
      };

      if (!selectedVoiceId) {
        runGestureOnlyFallback("missing_voice");
        return;
      }
      if (activityReactionInFlightRef.current) {
        activityReactionQueueRef.current = { reaction, activeActivity };
        console.log(
          ` 🎮 [showroom-activity-reaction] queued companion=${current.id} event=${reaction.eventType}`,
        );
        return;
      }

      activityReactionInFlightRef.current = true;
      showroomSpeechRecognitionRef.current?.abort();
      setShowroomTalkOpen(false);
      setShowroomTalkError(null);
      setShowroomTalkResponse("");
      setShowroomTalkPhase("thinking");
      startMusic();
      stopSpeech();
      applyShowroomThinkingBodyLanguage({
        reason: "activity_reaction",
        turnId: traceTurnId,
        intensity: reaction.eventType === "companion_move" ? 0.68 : 0.55,
        durationMs: 1200,
      });
      emitShowroomVideoCallTrace({
        eventName: "activity_reaction_request_start",
        turnId: traceTurnId,
        payload: {
          activityReaction: reaction,
          activeActivity,
        },
      });
      console.log(
        ` 🎮 [showroom-activity-reaction] request_start companion=${current.id} event=${reaction.eventType}`,
      );

      const finishReaction = (reason: string) => {
        activityReactionInFlightRef.current = false;
        const next = activityReactionQueueRef.current;
        activityReactionQueueRef.current = null;
        if (next) {
          activityReactionQueueGuardRef.current += 1;
          if (activityReactionQueueGuardRef.current > 10) {
            activityReactionQueueGuardRef.current = 0;
            throw new Error("activity_reaction_queue_guard");
          }
          void requestShowroomVideoActivityReaction(
            next.reaction,
            next.activeActivity,
          ).catch((err: unknown) => {
            console.warn(
              " 🎮 [showroom-activity-reaction] queued_request_failed",
              err,
            );
          });
          return;
        }
        activityReactionQueueGuardRef.current = 0;
        videoChatHandsFreeRearmRef.current?.(
          reason,
          SHOWROOM_VIDEO_CHAT_HANDS_FREE_REARM_MS,
        );
      };

      try {
        const payload = createShowroomTalkPayload({
          childId: talkChildId,
          companionId: current.id,
          voiceId: selectedVoiceId,
          showroomTheme: activeThemeId,
          question: createShowroomActivityReactionQuestion(reaction),
          mode: "video_call",
          conversationIntent: "game",
          callSource: activeVideoCallContext.callSource,
          relationshipState: activeVideoCallContext.relationshipState,
          ...(Object.keys(activeVideoCallContext.rewardContext).length > 0 && {
            rewardContext: activeVideoCallContext.rewardContext,
          }),
          ...(showroomVideoCallTraceId && { callTraceId: showroomVideoCallTraceId }),
          ...(traceTurnId && { turnId: traceTurnId }),
          activeActivity,
          activityReaction: reaction,
          ...(showroomVideoLastVisualSummary && {
            lastVisualSummary: showroomVideoLastVisualSummary,
          }),
        });
        const response = await fetch(
          `/api/companions/${encodeURIComponent(current.id)}/talk`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              text?: string;
              audioBase64?: string;
              audioContentType?: string;
              companionCommands?: CompanionCommand[];
              phaseCommands?: {
                speaking?: CompanionCommand;
                idle?: CompanionCommand;
              };
              latencySpans?: {
                claudeMs?: number;
                toolFollowupMs?: number;
                ttsMs?: number;
                requestToResponseMs?: number;
              };
            }
          | null;
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error ?? `activity_reaction_${response.status}`);
        }
        const latestActivity = showroomVideoActiveActivityRef.current;
        if (
          !isShowroomActivityReactionCurrent({
            reaction,
            currentActivity: latestActivity,
          })
        ) {
          const boardSignature =
            reaction.boardSignature ??
            getShowroomActivityBoardSignature(reaction.board);
          const currentBoardSignature = latestActivity
            ? getShowroomActivityBoardSignature(latestActivity.board)
            : "none";
          const latencyMs = Math.round(performance.now() - reactionStartMs);
          console.log(
            ` 🎮 [showroom-activity-reaction] stale_activity_reaction companion=${current.id} event=${reaction.eventType} board=${boardSignature} current=${currentBoardSignature}`,
          );
          emitShowroomVideoCallTrace({
            eventName: "activity_reaction_stale_dropped",
            turnId: traceTurnId,
            payload: {
              reason: "board_changed_before_audio",
              latencyMs,
              boardSignature,
              currentBoardSignature,
              activityReaction: reaction,
              activeActivity: latestActivity,
              latencySpans: data.latencySpans,
            },
          });
          setShowroomTalkPhase("idle");
          finishReaction("stale_activity_reaction");
          return;
        }
        const responseText = data.text?.trim() ?? "";
        if (responseText) {
          setShowroomTalkResponse(`${current.name}: ${responseText}`);
        }
        const latencyMs = Math.round(performance.now() - reactionStartMs);
        emitShowroomVideoCallTrace({
          eventName: "activity_reaction_response_received",
          turnId: traceTurnId,
          payload: {
            responseText,
            latencyMs,
            requestToResponseMs: latencyMs,
            commandCount: data.companionCommands?.length ?? 0,
            aiAuthored: true,
            activityReaction: reaction,
            activeActivity,
            latencySpans: data.latencySpans,
          },
        });
        console.log(
          ` 🎮 [showroom-activity-reaction] response_received companion=${current.id} event=${reaction.eventType} latencyMs=${latencyMs} commands=${data.companionCommands?.length ?? 0}`,
        );
        const applyReactionCommand = (command: CompanionCommand) => {
          if (!shouldApplyShowroomTalkCommand(command, current.id)) return;
          processShowroomCommand(motorsRef.current.current, command);
          processShowroomCommand(cardMotorRef.current, command);
          processShowroomCommand(videoChatMotorRef.current, command);
        };
        const playbackCommands = selectShowroomTalkPlaybackCommands(
          data.companionCommands ?? [],
        );
        const hasPlaybackAnimation = playbackCommands.some(
          (command) => command.type === "animate",
        );
        const speakingCommand = data.phaseCommands?.speaking;
        if (
          !hasPlaybackAnimation &&
          speakingCommand &&
          shouldApplyShowroomTalkCommand(speakingCommand, current.id)
        ) {
          applyReactionCommand(speakingCommand);
        } else if (!hasPlaybackAnimation && responseText) {
          playCurrentCompanionAnimation("talking", { loop: true });
        }
        for (const command of playbackCommands) {
          applyReactionCommand(command);
        }

        if (!data.audioBase64) {
          if (!responseText && playbackCommands.length === 0) {
            runGestureOnlyFallback("empty_ai_reaction");
          } else {
            const idleCommand = toShowroomIdleLoopCommand(data.phaseCommands?.idle);
            applyReactionCommand(idleCommand);
            setShowroomTalkPhase("idle");
          }
          finishReaction("activity_reaction_no_audio");
          return;
        }

        const blob = audioBase64ToBlob(
          data.audioBase64,
          data.audioContentType ?? "audio/mpeg",
        );
        const url = URL.createObjectURL(blob);
        speechUrlRef.current = url;
        const audio = new Audio(url);
        const AudioContextCtor =
          window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
        if (!AudioContextCtor) {
          throw new Error("audio_context_unavailable");
        }
        const context = new AudioContextCtor();
        const source = context.createMediaElementSource(audio);
        const analyser = ensurePlaybackAnalyser(context);
        source.connect(analyser);
        analyser.connect(context.destination);
        speechAnalyserRef.current = analyser;
        speechAudioRef.current = { audio, context };
        let completed = false;
        const finishAudio = (outcome: "audio_ended" | "audio_error") => {
          if (completed) return;
          completed = true;
          emitShowroomVideoCallTrace({
            eventName:
              outcome === "audio_ended"
                ? "activity_reaction_audio_ended"
                : "audio_error",
            turnId: traceTurnId,
            payload: {
              reason: outcome,
              latencyMs: Math.round(performance.now() - reactionStartMs),
              activityReaction: reaction,
            },
          });
          console.log(
            ` 🎮 [showroom-activity-reaction] ${outcome} companion=${current.id} event=${reaction.eventType}`,
          );
          applyReactionCommand(toShowroomIdleLoopCommand(data.phaseCommands?.idle));
          setShowroomTalkPhase("idle");
          if (speechAudioRef.current?.audio === audio) {
            speechAudioRef.current = null;
          }
          if (speechAnalyserRef.current === analyser) {
            speechAnalyserRef.current = null;
          }
          void context.close().catch((err: unknown) => {
            console.warn(
              " 🎮 [showroom-activity-reaction] audio_context_close_failed",
              err,
            );
          });
          URL.revokeObjectURL(url);
          if (speechUrlRef.current === url) {
            speechUrlRef.current = null;
          }
          finishReaction("activity_reaction_audio_ended");
        };
        audio.addEventListener("ended", () => finishAudio("audio_ended"));
        audio.addEventListener("error", () => finishAudio("audio_error"));
        await context.resume();
        setShowroomTalkPhase("speaking");
        emitShowroomVideoCallTrace({
          eventName: "activity_reaction_audio_start",
          turnId: traceTurnId,
          payload: {
            latencyMs: Math.round(performance.now() - reactionStartMs),
            activityReaction: reaction,
          },
        });
        await audio.play();
      } catch (err: unknown) {
        console.warn(" 🎮 [showroom-activity-reaction] request_failed", err);
        runGestureOnlyFallback(err instanceof Error ? err.message : String(err));
        finishReaction("activity_reaction_fallback");
      }
    },
    [
      activeThemeId,
      activeVideoCallContext,
      current,
      emitShowroomVideoCallTrace,
      nextShowroomVideoTurnId,
      applyShowroomThinkingBodyLanguage,
      playCurrentCompanionAnimation,
      schedule,
      showroomVideoCallTraceId,
      showroomVideoLastVisualSummary,
      startMusic,
      stopSpeech,
      talkChildId,
      voiceSelections,
    ],
  );

  activityReactionRequesterRef.current = requestShowroomVideoActivityReaction;

  const openVideoCallActivityRequest = useCallback(
    (
      request: ShowroomCompanionActivityRequest,
      reason: "immediate" | "audio_ended",
    ) => {
      setActiveVideoCallActivity(request.activityId);
      setVideoCallLayout("play");
      setVideoCallCompanionView("portrait");
      console.log(
        ` 🎮 [showroom-video-chat] openCompanionActivity activity=${request.activityId} reason=${request.reason} timing=${reason}`,
      );
      emitShowroomVideoCallTrace({
        eventName: "activity_context_changed",
        payload: {
          reason: "openCompanionActivity",
          openTiming: reason,
          activityRequest: request,
          activeActivity: showroomVideoActiveActivityRef.current,
        },
      });
    },
    [emitShowroomVideoCallTrace],
  );

  const flushQueuedVideoCallActivityRequest = useCallback(
    (reason: "audio_ended" | "no_audio" | "cancelled" = "audio_ended") => {
      const queued = queuedVideoCallActivityRequestRef.current;
      queuedVideoCallActivityRequestRef.current = null;
      if (!queued || reason === "cancelled") return;
      openVideoCallActivityRequest(
        queued,
        reason === "audio_ended" ? "audio_ended" : "immediate",
      );
    },
    [openVideoCallActivityRequest],
  );

  const handleShowroomTicTacToeBanter = useCallback(
    (banter: CompanionTicTacToeBanter) => {
      if (!current) return;
      setShowroomTalkOpen(false);
      setShowroomTalkError(null);
      const phase = resolveCompanionActivityPhase(banter);
      console.log(
        ` 🎮 [showroom-activity-runtime] [phase] [changed] activity=tic_tac_toe phase=${phase}`,
      );
      emitShowroomVideoCallTrace({
        eventName: "activity_phase_changed",
        payload: {
          phase,
          activityId: "tic_tac_toe",
          banter,
          conversationMode: videoCallConversationModeRef.current,
        },
      });
      if (banter.phase === "companion_thinking") {
        applyShowroomThinkingBodyLanguage({
          reason: "tic_tac_toe_companion_turn",
          intensity: 0.5,
          durationMs: 900,
        });
        return;
      }
      if (banter.phase === "companion_move") {
        playCurrentCompanionAnimation("idle", { loop: true });
      }
    },
    [
      applyShowroomThinkingBodyLanguage,
      current,
      emitShowroomVideoCallTrace,
      playCurrentCompanionAnimation,
    ],
  );

	  const submitShowroomTalkQuestion = useCallback(
    async (
      questionOverride?: string,
      options?: {
        source?: ShowroomTalkMode;
        forceVisualSnapshot?: boolean;
        visualReason?: string;
        turnId?: string;
      },
    ) => {
      if (!current || picking || shouldGateShowroomTalkMic(showroomTalkPhaseRef.current)) {
        return;
      }
      const question = (questionOverride ?? showroomTalkQuestion).trim();
      if (!question) {
        setShowroomTalkOpen(true);
        setShowroomTalkError("Ask a question first.");
        return;
      }
      const currentDefaultVoice =
        current.voices.find((voice) => voice.default)?.id ?? current.voices[0]?.id ?? "";
      const selectedVoiceId = voiceSelections[current.id] ?? currentDefaultVoice;
      if (!selectedVoiceId) {
        setShowroomTalkOpen(true);
        setShowroomTalkError(`${current.name} needs a voice before talking.`);
        return;
      }

      const talkMode: ShowroomTalkMode =
        options?.source === "video_call" || showroomVideoChatOpen
          ? "video_call"
          : "showroom";
      const traceTurnId =
        talkMode === "video_call"
          ? options?.turnId ??
            currentVideoCallTurnIdRef.current ??
            nextShowroomVideoTurnId()
          : undefined;
      if (traceTurnId) {
        currentVideoCallTurnIdRef.current = traceTurnId;
      }
      const talkStartMs = performance.now();
      console.log(
        ` 🎮 [showroom-talk] request_start companion=${current.id} mode=${talkMode} chars=${question.length}`,
      );
      startMusic();
      stopSpeech();
      const wantsVisualSnapshot =
        talkMode === "video_call" &&
        (options?.forceVisualSnapshot || shouldAttachVideoSnapshotForQuestion(question));
      const visualSnapshot = wantsVisualSnapshot
        ? captureShowroomVideoSnapshot(
            options?.visualReason ??
              (options?.forceVisualSnapshot
                ? "look_button"
                : "child_asked_visual_question"),
          )
        : null;
      const conversationIntent =
        talkMode === "video_call"
          ? resolveCompanionConversationMode({
              question,
              currentMode: videoCallConversationModeRef.current,
              activeActivity: showroomVideoActiveActivityRef.current,
              forceVisualSnapshot: Boolean(wantsVisualSnapshot),
              visualQuestion: shouldAttachVideoSnapshotForQuestion(question),
            })
          : undefined;
      const activeActivityForTalk =
        talkMode === "video_call"
          ? selectCompanionActivityContextForTalk({
              activeActivity: showroomVideoActiveActivityRef.current,
              conversationMode: conversationIntent,
            })
          : undefined;
      if (talkMode === "video_call") {
        const previousConversationMode = videoCallConversationModeRef.current;
        videoCallConversationModeRef.current = conversationIntent ?? "social";
        videoCallRepeatAfterModeRef.current = conversationIntent === "repeat_after";
        if (conversationIntent && previousConversationMode !== conversationIntent) {
          console.log(
            ` 🎮 [showroom-activity-runtime] [conversation_mode] [changed] ${previousConversationMode}->${conversationIntent}`,
          );
          emitShowroomVideoCallTrace({
            eventName: "conversation_mode_changed",
            turnId: traceTurnId,
            payload: {
              previousMode: previousConversationMode,
              nextMode: conversationIntent,
              questionText: question,
              activeActivityIncluded: Boolean(activeActivityForTalk),
            },
          });
        }
      }
      if (talkMode === "video_call") {
        emitShowroomVideoCallTrace({
          eventName: "talk_request_start",
          turnId: traceTurnId,
          payload: {
            questionText: question,
            conversationIntent,
            activeActivityIncluded: Boolean(activeActivityForTalk),
            visualSnapshot,
            visionRequested: Boolean(visualSnapshot),
          },
        });
      }
      setShowroomTalkOpen(talkMode !== "video_call");
      setShowroomTalkError(null);
      setShowroomTalkResponse("");
      setShowroomTalkQuestion(question);
      setShowroomTalkPhase("thinking");
      setCurrentCompanionCamera("mid-shot", 420);
      applyShowroomThinkingBodyLanguage({
        reason: talkMode === "video_call" ? "video_call_talk" : "showroom_talk",
        turnId: traceTurnId,
        intensity: talkMode === "video_call" ? 0.65 : 0.78,
        durationMs: 1800,
      });

      try {
        const payload = createShowroomTalkPayload({
          childId: talkChildId,
          companionId: current.id,
          voiceId: selectedVoiceId,
          showroomTheme: activeThemeId,
          question,
          ...(talkMode === "video_call" && { mode: "video_call" as const }),
          ...(talkMode === "video_call" &&
            showroomVideoCallTraceId && {
              callTraceId: showroomVideoCallTraceId,
            }),
          ...(talkMode === "video_call" && traceTurnId && { turnId: traceTurnId }),
          ...(talkMode === "video_call" &&
            conversationIntent && {
              conversationIntent,
            }),
          ...(talkMode === "video_call" && {
            callSource: activeVideoCallContext.callSource,
            relationshipState: activeVideoCallContext.relationshipState,
          }),
          ...(talkMode === "video_call" &&
            Object.keys(activeVideoCallContext.rewardContext).length > 0 && {
              rewardContext: activeVideoCallContext.rewardContext,
            }),
          ...(talkMode === "video_call" &&
            activeActivityForTalk && {
              activeActivity: activeActivityForTalk,
            }),
          ...(visualSnapshot && { visualSnapshot }),
          ...(talkMode === "video_call" &&
            showroomVideoLastVisualSummary && {
              lastVisualSummary: showroomVideoLastVisualSummary,
            }),
        });
        const response = await fetch(
          `/api/companions/${encodeURIComponent(current.id)}/talk`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              text?: string;
              audioBase64?: string;
	              audioContentType?: string;
		              visualSummary?: string;
		              companionCommands?: CompanionCommand[];
		              activityRequests?: ShowroomCompanionActivityRequest[];
		              phaseCommands?: {
		                speaking?: CompanionCommand;
		                idle?: CompanionCommand;
		              };
            }
          | null;
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error ?? `talk_${response.status}`);
        }
        console.log(
          ` 🎮 [showroom-talk] response_received companion=${current.id} mode=${talkMode} latencyMs=${Math.round(performance.now() - talkStartMs)}`,
        );
        const responseText = data.text?.trim() || `${current.name} is thinking.`;
        lastVideoCallResponseRef.current = responseText;
        if (talkMode === "video_call") {
          emitShowroomVideoCallTrace({
            eventName: "talk_response_received",
            turnId: traceTurnId,
            payload: {
              responseText,
              latencyMs: Math.round(performance.now() - talkStartMs),
              conversationIntent,
              commandCount: data.companionCommands?.length ?? 0,
              activityRequestCount: data.activityRequests?.length ?? 0,
              visionUsed: Boolean(visualSnapshot),
            },
          });
        }
        setShowroomTalkResponse(responseText);
        if (talkMode === "video_call" && data.visualSummary?.trim()) {
          setShowroomVideoLastVisualSummary(data.visualSummary.trim());
        }
        const nextActivityRequest = data.activityRequests?.find(
          (request) =>
            request.companionId === current.id &&
            request.activityId === "tic_tac_toe" &&
            request.surface === "video_call_overlay",
        );
        if (nextActivityRequest) {
          if (talkMode === "video_call" && data.audioBase64) {
            queuedVideoCallActivityRequestRef.current = nextActivityRequest;
            console.log(
              ` 🎮 [showroom-video-chat] openCompanionActivity deferred reason=activity_open_interrupted_audio activity=${nextActivityRequest.activityId}`,
            );
          } else {
            openVideoCallActivityRequest(nextActivityRequest, "immediate");
          }
        }
        setShowroomTalkPhase("speaking");
        console.log(
          ` 🎮 [showroom-talk] speaking_start companion=${current.id} mode=${talkMode} commands=${data.companionCommands?.length ?? 0}`,
        );
        videoChatNoSpeechRetryCountRef.current = 0;
        const applyTalkCommand = (command: CompanionCommand) => {
          if (!shouldApplyShowroomTalkCommand(command, current.id)) return;
          processShowroomCommand(motorsRef.current.current, command);
          processShowroomCommand(cardMotorRef.current, command);
          processShowroomCommand(videoChatMotorRef.current, command);
        };
        const requestedAnimation = getShowroomTalkRequestedAnimation({
          question,
          specialDance: current.showroom?.gestureProfile.specialDance,
        });
        if (requestedAnimation) {
          console.log(
            ` 🎮 [showroom-talk] signature_dance_requested companion=${current.id} animation=${requestedAnimation}`,
          );
        }
        const playbackCommands = selectShowroomTalkPlaybackCommands(
          data.companionCommands ?? [],
          { requestedAnimation },
        );
        const hasPlaybackAnimation = playbackCommands.some(
          (command) => command.type === "animate",
        );
        const speakingCommand = data.phaseCommands?.speaking;
        if (
          !hasPlaybackAnimation &&
          speakingCommand &&
          shouldApplyShowroomTalkCommand(speakingCommand, current.id)
        ) {
          applyTalkCommand(speakingCommand);
        } else if (!hasPlaybackAnimation) {
          playCurrentCompanionAnimation("talking", { loop: true });
        }
        for (const command of playbackCommands) {
          applyTalkCommand(command);
        }

        if (!data.audioBase64) {
          if (shouldIdleImmediatelyAfterSilentTalk(playbackCommands)) {
            const idleCommand = toShowroomIdleLoopCommand(data.phaseCommands?.idle);
            applyTalkCommand(idleCommand);
            console.log(
              ` 🎮 [showroom-talk] idle_applied companion=${current.id} reason=no_audio loop=${String(idleCommand.payload.loop)}`,
            );
          } else {
            console.log(
              ` 🎮 [showroom-talk] visual_action_only companion=${current.id} animation=${String(playbackCommands.find((command) => command.type === "animate")?.payload.animation ?? "unknown")}`,
            );
          }
          setShowroomTalkPhase("idle");
          if (talkMode === "video_call") {
            emitShowroomVideoCallTrace({
              eventName: "audio_ended",
              turnId: traceTurnId,
              payload: { reason: "no_audio" },
            });
            flushQueuedVideoCallActivityRequest("no_audio");
          }
          if (talkMode === "video_call") {
            videoChatHandsFreeRearmRef.current?.(
              "no_audio",
              shouldIdleImmediatelyAfterSilentTalk(playbackCommands)
                ? SHOWROOM_VIDEO_CHAT_HANDS_FREE_REARM_MS
                : SHOWROOM_VIDEO_CHAT_VISUAL_ACTION_REARM_MS,
            );
          }
          return;
        }

        const blob = audioBase64ToBlob(
          data.audioBase64,
          data.audioContentType ?? "audio/mpeg",
        );
        const url = URL.createObjectURL(blob);
        speechUrlRef.current = url;
        const audio = new Audio(url);
        const AudioContextCtor =
          window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
        if (!AudioContextCtor) {
          throw new Error("audio_context_unavailable");
        }
        const context = new AudioContextCtor();
        const source = context.createMediaElementSource(audio);
        const analyser = ensurePlaybackAnalyser(context);
        source.connect(analyser);
        analyser.connect(context.destination);
        speechAnalyserRef.current = analyser;
        speechAudioRef.current = { audio, context };
        audio.addEventListener("ended", () => {
          console.log(
            ` 🎮 [showroom-talk] audio_ended companion=${current.id} mode=${talkMode}`,
          );
          if (talkMode === "video_call") {
            emitShowroomVideoCallTrace({
              eventName: "audio_ended",
              turnId: traceTurnId,
              payload: {
                latencyMs: Math.round(performance.now() - talkStartMs),
              },
            });
            flushQueuedVideoCallActivityRequest("audio_ended");
          }
          const idleCommand = toShowroomIdleLoopCommand(data.phaseCommands?.idle);
          applyTalkCommand(idleCommand);
          console.log(
            ` 🎮 [showroom-talk] idle_applied companion=${current.id} reason=audio_ended loop=${String(idleCommand.payload.loop)}`,
          );
          setShowroomTalkPhase("idle");
          speechAudioRef.current = null;
          speechAnalyserRef.current = null;
          void context.close().catch((err: unknown) => {
            console.warn(" 🎮 [showroom-talk] audio_context_close_failed", err);
          });
          URL.revokeObjectURL(url);
          if (speechUrlRef.current === url) {
            speechUrlRef.current = null;
          }
          if (talkMode === "video_call") {
            videoChatHandsFreeRearmRef.current?.(
              "audio_ended",
              SHOWROOM_VIDEO_CHAT_HANDS_FREE_REARM_MS,
            );
          }
        });
        audio.addEventListener("error", () => {
          if (talkMode === "video_call") {
            emitShowroomVideoCallTrace({
              eventName: "audio_error",
              turnId: traceTurnId,
              payload: { reason: "audio_element_error" },
            });
            flushQueuedVideoCallActivityRequest("cancelled");
          }
          setShowroomTalkError("I could not play that voice just now.");
          setShowroomTalkPhase("idle");
          playCurrentCompanionAnimation("idle", { loop: true });
        });
        await context.resume();
        console.log(
          ` 🎮 [showroom-talk] audio_play_start companion=${current.id} mode=${talkMode} latencyMs=${Math.round(performance.now() - talkStartMs)}`,
        );
        if (talkMode === "video_call") {
          emitShowroomVideoCallTrace({
            eventName: "audio_play_start",
            turnId: traceTurnId,
            payload: {
              latencyMs: Math.round(performance.now() - talkStartMs),
            },
          });
        }
        await audio.play();
      } catch (err: unknown) {
        console.warn(" 🎮 [showroom-talk] request_failed", err);
        if (talkMode === "video_call") {
          emitShowroomVideoCallTrace({
            eventName: "audio_error",
            turnId: traceTurnId,
            payload: {
              reason: err instanceof Error ? err.message : String(err),
            },
          });
        }
        setShowroomTalkError(err instanceof Error ? err.message : "Talk failed.");
        setShowroomTalkPhase("idle");
        playCurrentCompanionAnimation("idle", { loop: true });
      }
    },
    [
      activeThemeId,
      activeVideoCallContext,
      current,
      captureShowroomVideoSnapshot,
      emitShowroomVideoCallTrace,
      flushQueuedVideoCallActivityRequest,
      nextShowroomVideoTurnId,
      openVideoCallActivityRequest,
      picking,
      applyShowroomThinkingBodyLanguage,
      playCurrentCompanionAnimation,
      setCurrentCompanionCamera,
      showroomTalkQuestion,
      showroomVideoChatOpen,
      showroomVideoCallTraceId,
      showroomVideoLastVisualSummary,
      startMusic,
      stopSpeech,
      talkChildId,
      voiceSelections,
    ],
  );

  const startShowroomTalkListening = useCallback((options?: {
    source?: ShowroomTalkMode;
    quiet?: boolean;
  }) => {
    if (!current || shouldGateShowroomTalkMic(showroomTalkPhaseRef.current)) return;
    const traceTurnId =
      options?.source === "video_call"
        ? nextShowroomVideoTurnId()
        : undefined;
    if (traceTurnId) {
      currentVideoCallTurnIdRef.current = traceTurnId;
      emitShowroomVideoCallTrace({
        eventName: "speech_listen_start",
        turnId: traceTurnId,
        payload: { quiet: Boolean(options?.quiet) },
      });
    }
    const RecognitionCtor =
      (window as WindowWithSpeechRecognition).SpeechRecognition ??
      (window as WindowWithSpeechRecognition).webkitSpeechRecognition;
    setShowroomTalkOpen(options?.source !== "video_call");
    setShowroomTalkError(null);
    setShowroomTalkResponse("");
    setShowroomTalkQuestion("");
    if (!RecognitionCtor) {
      setShowroomTalkError("Voice input is not available here. Type it instead.");
      if (traceTurnId) {
        emitShowroomVideoCallTrace({
          eventName: "speech_error",
          turnId: traceTurnId,
          payload: { error: "speech_recognition_unavailable" },
        });
      }
      return;
    }
    showroomSpeechRecognitionRef.current?.abort();
    let submitted = false;
    const recognition = new RecognitionCtor();
    showroomSpeechRecognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript?.trim() ?? "";
      if (!text) return;
      const loop = detectCompanionVideoCallLoop({
        transcript: text,
        lastCompanionResponse: lastVideoCallResponseRef.current,
        previousTranscriptHash: lastVideoCallTranscriptHashRef.current,
      });
      lastVideoCallTranscriptHashRef.current = loop.transcriptHash;
      if (traceTurnId) {
        emitShowroomVideoCallTrace({
          eventName: "speech_result",
          turnId: traceTurnId,
          payload: {
            transcript: text,
            echoSimilarity: loop.echoSimilarity,
          },
        });
        if (loop.suspected) {
          emitShowroomVideoCallTrace({
            eventName: "loop_suspected",
            turnId: traceTurnId,
            payload: { reason: loop.reason },
          });
        }
      }
      if (
        options?.source === "video_call" &&
        shouldIgnoreShowroomAutoResumeTranscript({
          transcript: text,
          previousResponse: showroomTalkResponse,
        })
      ) {
        console.log(
          ` 🎮 [showroom-video-chat] ignored_echo chars=${text.length}`,
        );
        if (traceTurnId) {
          emitShowroomVideoCallTrace({
            eventName: "echo_suppressed",
            turnId: traceTurnId,
            payload: { transcript: text, reason: "auto_resume_echo_guard" },
          });
        }
        return;
      }
      submitted = true;
      videoChatNoSpeechRetryCountRef.current = 0;
      setShowroomTalkQuestion(text);
      void submitShowroomTalkQuestion(text, {
        source: options?.source,
        turnId: traceTurnId,
      });
    };
    recognition.onerror = (event) => {
      if (submitted) return;
      if (traceTurnId) {
        emitShowroomVideoCallTrace({
          eventName: "speech_error",
          turnId: traceTurnId,
          payload: { error: event.error },
        });
      }
      const recovery = getShowroomVoiceErrorRecovery({
        source: options?.source,
        error: event.error,
        retryCount: videoChatNoSpeechRetryCountRef.current,
      });
      videoChatNoSpeechRetryCountRef.current = recovery.nextRetryCount;
      setShowroomTalkError(recovery.displayError);
      setShowroomTalkPhase("idle");
      if (
        recovery.shouldRetry &&
        options?.source === "video_call" &&
        videoChatContinuousListenRef.current
      ) {
        const timer = window.setTimeout(() => {
          timersRef.current.delete(timer);
          if (videoChatContinuousListenRef.current) {
            startShowroomTalkListening({
              source: "video_call",
              quiet: recovery.quietRetry,
            });
          }
        }, SHOWROOM_VIDEO_CHAT_NO_SPEECH_RETRY_DELAY_MS);
        timersRef.current.add(timer);
      }
    };
    recognition.onend = () => {
      showroomSpeechRecognitionRef.current = null;
      if (!submitted && showroomTalkPhaseRef.current === "listening") {
        setShowroomTalkPhase("idle");
      }
    };
    setShowroomTalkPhase("listening");
    if (shouldPlayShowroomListeningGesture(options?.source, { quiet: options?.quiet })) {
      playCurrentCompanionEmote({
        emote: "thinking",
        intensity: 0.72,
        durationMs: 1500,
      });
    }
    recognition.start();
  }, [
    current,
    emitShowroomVideoCallTrace,
    nextShowroomVideoTurnId,
    playCurrentCompanionEmote,
    showroomTalkResponse,
    submitShowroomTalkQuestion,
  ]);

  const scheduleVideoChatHandsFreeRearm = useCallback(
    (reason: string, delayMs = SHOWROOM_VIDEO_CHAT_HANDS_FREE_REARM_MS) => {
      if (!videoChatContinuousListenRef.current) return;
      console.log(
        ` 🎮 [showroom-hands-free] rearm_scheduled reason=${reason} delayMs=${delayMs}`,
      );
      emitShowroomVideoCallTrace({
        eventName: "handsfree_rearm_scheduled",
        payload: { reason, delayMs },
      });
      schedule(() => {
        if (
          !videoChatContinuousListenRef.current ||
          shouldGateShowroomTalkMic(showroomTalkPhaseRef.current)
        ) {
          console.log(
            ` 🎮 [showroom-hands-free] rearm_skipped reason=${reason} phase=${showroomTalkPhaseRef.current}`,
          );
          emitShowroomVideoCallTrace({
            eventName: "handsfree_rearm_skipped",
            payload: { reason, phase: showroomTalkPhaseRef.current },
          });
          return;
        }
        videoChatNoSpeechRetryCountRef.current = 0;
        console.log(` 🎮 [showroom-hands-free] rearm_starting reason=${reason}`);
        emitShowroomVideoCallTrace({
          eventName: "handsfree_rearm_starting",
          payload: { reason },
        });
        videoChatStartListeningRef.current?.();
      }, delayMs);
    },
    [emitShowroomVideoCallTrace, schedule],
  );
  videoChatHandsFreeRearmRef.current = scheduleVideoChatHandsFreeRearm;

  const handleDeepgramVideoCallFinalTranscript = useCallback(
    (text: string) => {
      if (!showroomVideoChatOpen || !current) return;
      const transcript = text.trim();
      if (!transcript || shouldGateShowroomTalkMic(showroomTalkPhaseRef.current)) return;
      const traceTurnId = nextShowroomVideoTurnId();
      currentVideoCallTurnIdRef.current = traceTurnId ?? null;
      const loop = detectCompanionVideoCallLoop({
        transcript,
        lastCompanionResponse: lastVideoCallResponseRef.current,
        previousTranscriptHash: lastVideoCallTranscriptHashRef.current,
      });
      lastVideoCallTranscriptHashRef.current = loop.transcriptHash;
      console.log(
        ` 🎮 [showroom-video-chat] deepgram_stt_final chars=${transcript.length}`,
      );
      emitShowroomVideoCallTrace({
        eventName: "speech_result",
        turnId: traceTurnId,
        payload: {
          source: "deepgram",
          transcript,
          echoSimilarity: loop.echoSimilarity,
        },
      });
      if (loop.suspected) {
        emitShowroomVideoCallTrace({
          eventName: "loop_suspected",
          turnId: traceTurnId,
          payload: { reason: loop.reason, source: "deepgram" },
        });
      }
      if (
        shouldIgnoreShowroomAutoResumeTranscript({
          transcript,
          previousResponse: lastVideoCallResponseRef.current,
        })
      ) {
        console.log(
          ` 🎮 [showroom-video-chat] deepgram_echo_suppressed chars=${transcript.length}`,
        );
        emitShowroomVideoCallTrace({
          eventName: "echo_suppressed",
          turnId: traceTurnId,
          payload: { transcript, reason: "deepgram_echo_guard" },
        });
        return;
      }
      videoChatNoSpeechRetryCountRef.current = 0;
      setShowroomTalkQuestion(transcript);
      void submitShowroomTalkQuestion(transcript, {
        source: "video_call",
        turnId: traceTurnId,
      });
    },
    [
      current,
      emitShowroomVideoCallTrace,
      nextShowroomVideoTurnId,
      showroomVideoChatOpen,
      submitShowroomTalkQuestion,
    ],
  );

  const handleDeepgramVideoCallInterimTranscript = useCallback((text: string) => {
    if (!text.trim()) return;
    if (!shouldGateShowroomTalkMic(showroomTalkPhaseRef.current)) {
      setShowroomTalkPhase("listening");
    }
  }, []);

  const handleDeepgramVideoCallBargeIn = useCallback(() => {
    console.log(" 🎮 [showroom-video-chat] deepgram_barge_in");
    stopSpeech();
    setShowroomTalkPhase("listening");
    emitShowroomVideoCallTrace({
      eventName: "speech_listen_start",
      payload: { source: "deepgram", reason: "barge_in" },
    });
  }, [emitShowroomVideoCallTrace, stopSpeech]);

  const videoCallStt = useDeepgramVideoCallStt({
    assistantAudioPlaying: showroomVideoChatOpen && showroomTalkPhase === "speaking",
    onFinalTranscript: handleDeepgramVideoCallFinalTranscript,
    onInterimTranscript: handleDeepgramVideoCallInterimTranscript,
    onBargeIn: handleDeepgramVideoCallBargeIn,
    onError: (message) => {
      setShowroomTalkError(message);
      emitShowroomVideoCallTrace({
        eventName: "speech_error",
        payload: { source: "deepgram", error: message },
      });
    },
  });

  const startShowroomVideoCallListening = useCallback(() => {
    if (!current || !videoChatContinuousListenRef.current) return;
    setShowroomTalkError(null);
    setShowroomTalkOpen(false);
    setShowroomTalkPhase("listening");
    emitShowroomVideoCallTrace({
      eventName: "speech_listen_start",
      payload: {
        source: "deepgram",
        mode: "always_on",
        status: videoCallStt.status,
      },
    });
    if (videoCallStt.status === "listening" || videoCallStt.status === "connecting") {
      return;
    }
    void videoCallStt
      .start({
        childName: resolveShowroomVideoCallSttChildName(talkChildId),
        chartChildId: talkChildId === "showroom" ? "ila" : talkChildId,
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(" 🎮 [showroom-video-chat] deepgram_start_failed", message);
        setShowroomTalkError(message);
      });
  }, [
    current,
    emitShowroomVideoCallTrace,
    talkChildId,
    videoCallStt,
  ]);
  videoChatStartListeningRef.current = startShowroomVideoCallListening;

  const stopShowroomVideoChatCamera = useCallback(() => {
    const stream = showroomVideoStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      showroomVideoStreamRef.current = null;
    }
    if (showroomVideoElementRef.current) {
      showroomVideoElementRef.current.srcObject = null;
    }
    setShowroomVideoChatCameraState("off");
    console.log(" 🎮 [showroom-video-chat] camera_off");
  }, []);

  const startShowroomVideoChatCamera = useCallback(async (options?: { autoListen?: boolean }) => {
    setShowroomVideoChatError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setShowroomVideoChatCameraState("blocked");
      setShowroomVideoCallPhase("answered");
      setShowroomVideoChatError("Camera is not available in this browser.");
      console.warn(" 🎮 [showroom-video-chat] camera_blocked missing_getUserMedia");
      return;
    }

    setShowroomVideoChatCameraState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      stopShowroomVideoChatCamera();
      showroomVideoStreamRef.current = stream;
      if (showroomVideoElementRef.current) {
        showroomVideoElementRef.current.srcObject = stream;
        showroomVideoElementRef.current
          .play()
          .catch((err: unknown) => {
            console.warn(" 🎮 [showroom-video-chat] video_play_failed", err);
          });
      }
      setShowroomVideoChatCameraState("live");
      setShowroomVideoCallPhase("live");
      console.log(" 🎮 [showroom-video-chat] camera_live");
      if (options?.autoListen) {
        console.log(" 🎮 [showroom-video-chat] auto-start listening");
        startShowroomVideoCallListening();
      }
    } catch (err: unknown) {
      setShowroomVideoChatCameraState("blocked");
      setShowroomVideoCallPhase("answered");
      setShowroomVideoChatError(
        err instanceof Error ? err.message : "Camera permission was blocked.",
      );
      console.warn(" 🎮 [showroom-video-chat] camera_blocked", err);
    }
  }, [startShowroomVideoCallListening, stopShowroomVideoChatCamera]);

  const openShowroomVideoChat = useCallback(() => {
    if (!current) return;
    const traceId = createCompanionVideoCallTraceId();
    setShowroomVideoCallTraceId(traceId);
    setShowroomVideoTraceCopyStatus("Trace ready");
    videoCallTurnSequenceRef.current = 0;
    currentVideoCallTurnIdRef.current = null;
    lastVideoCallTranscriptHashRef.current = undefined;
    lastVideoCallResponseRef.current = "";
    activityReactionInFlightRef.current = false;
    activityReactionQueueRef.current = null;
    activityReactionQueueGuardRef.current = 0;
    queuedVideoCallActivityRequestRef.current = null;
    videoCallConversationModeRef.current = "social";
    videoCallRepeatAfterModeRef.current = false;
    const event = createShowroomVideoChatStartedEvent({
      childId: childName?.trim().toLowerCase() || "showroom",
      companionId: current.id,
      showroomTheme: activeThemeId,
    });
    console.log(
      ` 🎮 [showroom-video-chat] started child=${event.childId} companion=${event.companionId} room=${event.showroomTheme}`,
    );
    void emitCompanionVideoCallTrace({
      traceId,
      eventName: "call_started",
      childId: talkChildId,
      companionId: current.id,
      callSource: activeVideoCallContext.callSource,
      relationshipState: activeVideoCallContext.relationshipState,
      payload: {
        showroomTheme: activeThemeId,
        videoCallLayout: "call",
        rewardContext: activeVideoCallContext.rewardContext,
      },
    }).catch((err: unknown) => {
      console.warn(" 🎮 [showroom-video-trace] call_started_failed", err);
    });
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: "game_state_update",
	          payload: {
	            ...event,
	            callSource: activeVideoCallContext.callSource,
	            relationshipState: activeVideoCallContext.relationshipState,
	            ...(Object.keys(activeVideoCallContext.rewardContext).length > 0 && {
	              rewardContext: activeVideoCallContext.rewardContext,
	            }),
	            videoCallLayout: "call",
	            phase: "video_chat_open",
	            progress: `Video chat room opened with ${current.name}.`,
	          },
          version: "1.0",
        },
        "*",
      );
    }
    startMusic();
    stopSpeech();
    resetShowroomTalk();
    setShowroomTalkOpen(false);
    setSpotlightOpen(false);
    setIntroVisible(false);
    setShowroomVideoChatError(null);
    setShowroomVideoLastVisualSummary("");
    showroomVideoActiveActivityRef.current = null;
    setActiveVideoCallActivity(null);
    setShowroomVideoActiveActivity(null);
    setVideoCallLayout("call");
    setVideoCallCompanionView("full_body");
    videoChatContinuousListenRef.current = true;
    videoChatNoSpeechRetryCountRef.current = 0;
    setShowroomVideoChatOpen(true);
    setShowroomVideoCallPhase("calling");
    videoChatRingtoneRef.current?.stop();
    videoChatRingtoneRef.current = playVideoCallRingtone();
    console.log(` 🎮 [showroom-video-chat] ringing style=${SHOWROOM_VIDEO_CHAT_RINGTONE_STYLE}`);
    playCurrentCompanionAnimation("idle", { loop: true });
    schedule(() => {
      if (!videoChatContinuousListenRef.current) return;
      videoChatRingtoneRef.current?.stop();
      videoChatRingtoneRef.current = null;
      setShowroomVideoCallPhase("answered");
      playCurrentCompanionAnimation("wave", { loop: false });
      console.log(" 🎮 [showroom-video-chat] answered");
      schedule(() => {
        if (!videoChatContinuousListenRef.current) return;
        void startShowroomVideoChatCamera({ autoListen: true });
      }, SHOWROOM_VIDEO_CHAT_ANSWER_MS);
    }, SHOWROOM_VIDEO_CHAT_RING_MS);
	  }, [
	    activeVideoCallContext,
	    activeThemeId,
	    childName,
	    current,
    playCurrentCompanionAnimation,
    resetShowroomTalk,
    schedule,
    startShowroomVideoChatCamera,
	    startMusic,
	    stopSpeech,
      talkChildId,
	  ]);

  const closeShowroomVideoChat = useCallback(() => {
    emitShowroomVideoCallTrace({
      eventName: "call_ended",
      payload: {
        cameraState: showroomVideoChatCameraState,
        phase: showroomVideoCallPhase,
      },
    });
    clearTimers();
    videoChatContinuousListenRef.current = false;
    videoChatNoSpeechRetryCountRef.current = 0;
    activityReactionInFlightRef.current = false;
    activityReactionQueueRef.current = null;
    activityReactionQueueGuardRef.current = 0;
    queuedVideoCallActivityRequestRef.current = null;
    videoCallConversationModeRef.current = "social";
    videoCallRepeatAfterModeRef.current = false;
    videoChatRingtoneRef.current?.stop();
    videoChatRingtoneRef.current = null;
    videoCallStt.stop();
    stopShowroomVideoChatCamera();
    stopSpeech();
    resetShowroomTalk();
    setShowroomVideoChatOpen(false);
    setShowroomVideoCallPhase("idle");
    setShowroomVideoChatError(null);
    setShowroomVideoLastVisualSummary("");
    showroomVideoActiveActivityRef.current = null;
    setActiveVideoCallActivity(null);
    setShowroomVideoActiveActivity(null);
    setVideoCallLayout("call");
    setVideoCallCompanionView("full_body");
    playCurrentCompanionAnimation("idle", { loop: true });
    console.log(" 🎮 [showroom-video-chat] ended");
  }, [
    clearTimers,
    emitShowroomVideoCallTrace,
    playCurrentCompanionAnimation,
    resetShowroomTalk,
    showroomVideoCallPhase,
    showroomVideoChatCameraState,
    stopShowroomVideoChatCamera,
    stopSpeech,
    videoCallStt,
  ]);

  const cycle = useCallback(
    (direction: -1 | 1) => {
      if (entries.length <= 1 || spotlightOpen || picking) return;
      stopSpeech();
      resetShowroomTalk();
      setShowroomTalkOpen(false);
      videoChatContinuousListenRef.current = false;
      videoChatNoSpeechRetryCountRef.current = 0;
      activityReactionInFlightRef.current = false;
      activityReactionQueueRef.current = null;
      activityReactionQueueGuardRef.current = 0;
      queuedVideoCallActivityRequestRef.current = null;
      videoCallRepeatAfterModeRef.current = false;
      videoCallStt.stop();
      stopShowroomVideoChatCamera();
      setShowroomVideoChatOpen(false);
      showroomVideoActiveActivityRef.current = null;
      setActiveVideoCallActivity(null);
      setShowroomVideoActiveActivity(null);
      setVideoCallLayout("call");
      setVideoCallCompanionView("full_body");
      setIntroVisible(false);
      setCurrentIndex((prev) => (prev + direction + entries.length) % entries.length);
    },
    [
      entries.length,
      picking,
      resetShowroomTalk,
      spotlightOpen,
      stopShowroomVideoChatCamera,
      stopSpeech,
      videoCallStt,
    ],
  );

  const closeSpotlight = useCallback(() => {
    clearTimers();
    stopSpeech();
    setSpotlightOpen(false);
    setIntroVisible(false);
    setPicking(false);
    setCardPreviewVrmReady(false);
    // Zoom back to full body on stage
    setCurrentCompanionCamera("full-body", 680);
  }, [clearTimers, setCurrentCompanionCamera, stopSpeech]);

  const openSpotlight = useCallback(() => {
    if (!current || spotlightOpen) return;
    startMusic();
    clearTimers();
    stopSpeech();
    resetShowroomTalk();
    setShowroomTalkOpen(false);
    videoChatContinuousListenRef.current = false;
    videoChatNoSpeechRetryCountRef.current = 0;
    activityReactionInFlightRef.current = false;
    activityReactionQueueRef.current = null;
    activityReactionQueueGuardRef.current = 0;
    queuedVideoCallActivityRequestRef.current = null;
    videoCallRepeatAfterModeRef.current = false;
    videoCallStt.stop();
    stopShowroomVideoChatCamera();
    setShowroomVideoChatOpen(false);
    setSpotlightOpen(true);
    setIntroVisible(false);
    setCurrentCompanionCamera("mid-shot", 680);
    playShowroomGesture("meet");
    playSlotAnimation("prev", "wave", { loop: false });
    playSlotAnimation("next", "wave", { loop: false });
    schedule(() => {
      playCurrentCompanionAnimation("idle", { loop: true });
    }, Math.max(0, SHOWROOM_CARD_REVEAL_DELAY_MS - 160));
    schedule(() => setIntroVisible(true), SHOWROOM_CARD_REVEAL_DELAY_MS);
  }, [
    clearTimers,
    current,
    playCurrentCompanionAnimation,
    playShowroomGesture,
    playSlotAnimation,
    resetShowroomTalk,
    schedule,
    setCurrentCompanionCamera,
    spotlightOpen,
    startMusic,
    stopShowroomVideoChatCamera,
    stopSpeech,
    videoCallStt,
  ]);

  const onStagePointerDown = useCallback(
    (e: PointEvt<HTMLDivElement>) => {
      if (entries.length <= 1 || spotlightOpen || picking) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore — capture may be unavailable
      }
      swipeFromXRef.current = e.clientX;
    },
    [entries.length, picking, spotlightOpen],
  );

  const onStagePointerUp = useCallback(
    (e: PointEvt<HTMLDivElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore if not captured
      }
      if (swipeFromXRef.current == null) return;
      const fromX = swipeFromXRef.current;
      swipeFromXRef.current = null;
      if (entries.length <= 1 || spotlightOpen || picking) return;
      const delta = e.clientX - fromX;
      const minSwipe = 64;
      if (delta < -minSwipe) {
        cycle(1);
      } else if (delta > minSwipe) {
        cycle(-1);
      }
    },
    [cycle, entries.length, picking, spotlightOpen],
  );

  const onStagePointerCancel = useCallback(() => {
    swipeFromXRef.current = null;
  }, []);

	  const confirmPick = useCallback(() => {
	    if (!current || picking) return;
		    stopSpeech();
		    resetShowroomTalk();
	    setShowroomTalkOpen(false);
	    videoChatContinuousListenRef.current = false;
	    videoChatNoSpeechRetryCountRef.current = 0;
	    stopShowroomVideoChatCamera();
		    setShowroomVideoChatOpen(false);
	    setPicking(true);
    confettiCleanupRef.current?.();
    confettiCleanupRef.current = launchConfetti();
    playCurrentCompanionAnimation(
      current.showroom?.gestureProfile.specialDance ?? "dance_victory",
      { loop: false },
    );
    playSlotAnimation("prev", "wave", { loop: false });
    playSlotAnimation("next", "wave", { loop: false });
    schedule(() => {
      playSlotAnimation("prev", "shrug", { loop: false });
      playSlotAnimation("next", "shrug", { loop: false });
    }, 800);
    schedule(() => {
      confettiCleanupRef.current?.();
      confettiCleanupRef.current = null;
      onSelect(current.id);
    }, 1800);
  }, [
    current,
    onSelect,
	    picking,
	    playCurrentCompanionAnimation,
	    playSlotAnimation,
	    resetShowroomTalk,
	    schedule,
    stopShowroomVideoChatCamera,
    stopSpeech,
  ]);

  const playSpecialDance = useCallback(() => {
    if (!current) return;
    stopSpeech();
    playCurrentCompanionAnimation(
      current.showroom?.gestureProfile.specialDance ?? "dance_victory",
      { loop: false },
    );
  }, [current, playCurrentCompanionAnimation, stopSpeech]);

  const playSignatureMove = useCallback(() => {
    const signatureMove = current?.showroom?.signatureMove;
    if (!signatureMove) return;
    stopSpeech();
    clearTimers();
    setSpeechError(null);
    setCurrentCompanionCamera("close-up", 260);
    if (signatureMove.animation) {
      playCurrentCompanionAnimation(signatureMove.animation, { loop: false });
    }
    setSignatureMoveLevel("focused");
    powerUpSfxRef.current?.stop();
    powerUpSfxRef.current = playSignatureMoveAudio(signatureMove.audioUrl, {
      onEnded: () => {
        setSignatureMoveLevel("idle");
        setCurrentCompanionCamera("mid-shot", 420);
        powerUpSfxRef.current = null;
      },
    });
    schedule(() => {
      setSignatureMoveLevel("powered_up");
    }, 520);
    schedule(() => {
      setSignatureMoveLevel("limit_break");
    }, 1080);
    schedule(() => {
      setCurrentCompanionCamera("mid-shot", 420);
    }, 1750);
  }, [
    clearTimers,
    current,
    playCurrentCompanionAnimation,
    schedule,
    setCurrentCompanionCamera,
    stopSpeech,
  ]);

  const speakCurrent = useCallback(
    async (line: SpeakingLine) => {
      const currentDefaultVoice =
        current?.voices.find((voice) => voice.default)?.id ?? current?.voices[0]?.id ?? "";
      const selectedVoiceId = current ? voiceSelections[current.id] ?? currentDefaultVoice : "";
      if (!current || current.voices.length === 0 || !selectedVoiceId || speakingLine) return;
      stopSpeech();
      setSpeechError(null);
      setSpeakingLine(line);
      startSpeechGestures(line);
      try {
        const response = await fetch(
          `/api/companions/${encodeURIComponent(current.id)}/speak`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ line, language: "en", voiceId: selectedVoiceId }),
          },
        );
        if (!response.ok) {
          const err = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(err?.error ?? `speech_${response.status}`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        speechUrlRef.current = url;
        const audio = new Audio(url);
        const AudioContextCtor =
          window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
        if (!AudioContextCtor) {
          throw new Error("audio_context_unavailable");
        }
        const context = new AudioContextCtor();
        const source = context.createMediaElementSource(audio);
        const analyser = ensurePlaybackAnalyser(context);
        source.connect(analyser);
        analyser.connect(context.destination);
        speechAnalyserRef.current = analyser;
        speechAudioRef.current = { audio, context };
        audio.addEventListener("ended", () => {
          stopSpeech();
          playCurrentCompanionAnimation("idle", { loop: true });
        });
        audio.addEventListener("error", () => {
          setSpeechError("I could not play that voice just now.");
          stopSpeech();
          playCurrentCompanionAnimation("idle", { loop: true });
        });
        await context.resume();
        await audio.play();
      } catch (err: unknown) {
        setSpeechError(err instanceof Error ? err.message : "Voice preview failed.");
        stopSpeech();
        playCurrentCompanionAnimation("idle", { loop: true });
      }
    },
    [
      current,
      playCurrentCompanionAnimation,
      speakingLine,
      startSpeechGestures,
      stopSpeech,
      voiceSelections,
    ],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        cycle(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        cycle(1);
      } else if (event.key === "Escape" && spotlightOpen) {
        event.preventDefault();
        closeSpotlight();
      } else if (event.key === "Enter" && !spotlightOpen) {
        event.preventDefault();
        startMusic();
        openSpotlight();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSpotlight, cycle, openSpotlight, spotlightOpen, startMusic]);

  useEffect(() => {
    if (initialCurtainDismissed || !showroomReady) return;
    const timer = window.setTimeout(() => {
      setInitialCurtainDismissed(true);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [initialCurtainDismissed, showroomReady]);

  useEffect(() => {
    if (!enableBackgroundMusic || !musicOn) {
      musicRef.current?.stop();
      musicRef.current = null;
      return;
    }

    const startFromGesture = () => startMusic();
    window.addEventListener("pointerdown", startFromGesture, { once: true });
    window.addEventListener("keydown", startFromGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", startFromGesture);
      window.removeEventListener("keydown", startFromGesture);
    };
  }, [enableBackgroundMusic, musicOn, startMusic]);

	  useEffect(() => {
	    return () => {
	      clearTimers();
	      showroomSpeechRecognitionRef.current?.abort();
	      showroomSpeechRecognitionRef.current = null;
	      stopSpeech();
      stopShowroomVideoChatCamera();
      confettiCleanupRef.current?.();
      confettiCleanupRef.current = null;
      musicRef.current?.stop();
      musicRef.current = null;
      powerUpSfxRef.current?.stop();
      powerUpSfxRef.current = null;
      videoChatRingtoneRef.current?.stop();
      videoChatRingtoneRef.current = null;
    };
  }, [clearTimers, stopShowroomVideoChatCamera, stopSpeech]);

  if (!current) {
    return (
      <div
        role="region"
        aria-label="Companion Showroom"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0f0a1e",
          color: "#f8fafc",
          fontFamily: "Lexend, system-ui, sans-serif",
        }}
      >
        No companions are ready yet.
      </div>
    );
  }

  const bonus = bonusPoints?.[current.id] ?? 0;
  const pickLabel = `Pick ${current.name}${childName ? `, ${childName}` : ""}!`;
  const currentDefaultVoice =
    current.voices.find((voice) => voice.default)?.id ?? current.voices[0]?.id ?? "";
  const selectedVoiceId = voiceSelections[current.id] ?? currentDefaultVoice;
  const activeGeneratedBackground =
    generatedBackgroundApplies && useGeneratedBackground && generatedBackgroundUrl?.trim()
      ? generatedBackgroundUrl.trim()
      : null;
  const waitingForGeneratedBackground =
    generatedBackgroundApplies &&
    useGeneratedBackground &&
    !activeGeneratedBackground &&
    generatedBackgroundLoading;
  const talkButtonDisabled =
    initialStageLoading || shouldGateShowroomTalkMic(showroomTalkPhase);
  const videoChatEntryCopy = createShowroomVideoChatEntryCopy({
    companionName: current.name,
  });
  const videoCallStatusCopy = createShowroomVideoCallStatusCopy({
    companionName: current.name,
    phase: showroomVideoCallPhase,
    cameraState: showroomVideoChatCameraState,
  });
  const videoChatButtonDisabled = initialStageLoading;
  const videoChatButtonStyle: CSSProperties = {
    border: `1px solid ${activeTheme.controlBorder}`,
    borderRadius: 8,
    background:
      activeTheme.chrome === "crystal"
        ? "rgba(255,255,255,0.8)"
        : activeTheme.chrome === "storybook"
          ? "rgba(42,10,29,0.82)"
          : "rgba(15,23,42,0.82)",
    color: activeTheme.controlForeground,
    fontFamily: "Lexend, system-ui, sans-serif",
    padding: "10px 15px",
    minWidth: 174,
    minHeight: 58,
    display: "grid",
    gap: 4,
    placeItems: "center",
    boxShadow:
      activeTheme.chrome === "crystal"
        ? "0 14px 34px rgba(124,92,255,0.16)"
        : "0 18px 44px rgba(15,23,42,0.26)",
    cursor: videoChatButtonDisabled ? "wait" : "pointer",
    opacity: videoChatButtonDisabled ? 0.62 : 1,
  };
  const renderVideoChatButton = () => (
    <button
      type="button"
      aria-label={videoChatEntryCopy.actionLabel}
      onClick={openShowroomVideoChat}
      disabled={videoChatButtonDisabled}
      style={videoChatButtonStyle}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontSize: 16,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        <Video size={17} aria-hidden />
        {videoChatEntryCopy.actionLabel}
      </span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12,
          fontWeight: 800,
          lineHeight: 1,
          color: activeTheme.mutedForeground,
        }}
      >
        {videoChatEntryCopy.status}
      </span>
    </button>
  );

  return (
    <div
      role="region"
      aria-label="Companion Showroom"
      data-showroom-theme={activeTheme.id}
      data-showroom-theme-marker={activeTheme.qaMarker}
      style={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        background: activeTheme.rootBackground,
        color: activeTheme.foreground,
        fontFamily: "Lexend, system-ui, sans-serif",
      }}
    >
      <p
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          border: 0,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
        }}
        aria-live="polite"
        aria-atomic
      >
        {`Viewing ${current.name} in ${activeTheme.displayName} — ${currentIndex + 1} of ${entries.length}. Use arrows${showCompanionDots ? ", dots," : ""} or swipe the stage to change.`}
      </p>
      <ShowroomThemeBackdrop
        theme={activeTheme}
        activeGeneratedBackground={activeGeneratedBackground}
        waitingForGeneratedBackground={waitingForGeneratedBackground}
      />
      <style>
        {`@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600;1,700&family=Lexend:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,700;0,800;1,700&display=swap");
          @keyframes sunny-showroom-breathe {
            from { transform: scale(1); }
            to { transform: scale(1.012); }
          }
          @keyframes sunny-showroom-sparkle {
            0%, 100% { transform: translateY(0) scale(0.7); opacity: 0.22; }
            50% { transform: translateY(-16px) scale(1.3); opacity: 0.95; }
          }
          @keyframes sunny-showroom-bg-wait {
            0%, 100% { background-position: 0% 50%; opacity: 0.42; }
            50% { background-position: 100% 50%; opacity: 0.78; }
          }
          @keyframes sunny-kefla-shake {
            0%, 100% { transform: translate(0, 0); }
            20% { transform: translate(-2px, 1px); }
            40% { transform: translate(2px, -1px); }
            60% { transform: translate(-1px, -2px); }
            80% { transform: translate(1px, 2px); }
          }
          .sunny-kefla-power-shake {
            animation: sunny-kefla-shake 130ms linear infinite;
          }
          @media (max-width: 640px) {
            .sunny-showroom-stage { height: 58vh !important; }
            .sunny-showroom-dots { bottom: 4px !important; }
            .sunny-showroom-theme-cycler {
              top: 14px !important;
              max-width: 180px !important;
            }
          }`}
      </style>

      <ShowroomThemeAmbient theme={activeTheme} />

      {activeTheme.chrome === "crystal" && !showroomVideoChatOpen && (
        <div
          aria-hidden
          className="sunny-crystal-depth-overlay"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse at 50% 80%, rgba(30,27,75,0.2) 0%, rgba(30,27,75,0.1) 42%, transparent 72%), linear-gradient(90deg, rgba(17,24,39,0.16) 0%, transparent 18%, transparent 82%, rgba(17,24,39,0.16) 100%), linear-gradient(180deg, rgba(15,23,42,0.05) 0%, transparent 34%, rgba(30,27,75,0.18) 100%)",
          }}
        />
      )}

      <ShowroomRoomCycler
        activeTheme={activeTheme}
        availableThemes={availableShowroomThemes}
        disabled={spotlightOpen || picking}
        onSelect={selectShowroomTheme}
        onCycle={cycleShowroomTheme}
        leftOffsetPx={enableBackgroundMusic ? 74 : 16}
      />

      {enableBackgroundMusic && (
        <button
          type="button"
          aria-label={musicOn ? "Turn background music off" : "Turn background music on"}
          onClick={() => {
            if (musicOn) {
              musicRef.current?.stop();
              musicRef.current = null;
              setMusicOn(false);
            } else {
              setMusicOn(true);
              window.setTimeout(() => {
                if (!musicRef.current) {
                  musicRef.current = createAmbientMusic();
                }
              }, 0);
            }
          }}
          style={{
            position: "absolute",
            top: 18,
            left: 18,
            zIndex: 42,
            width: 46,
            height: 46,
            borderRadius: "50%",
            border: `1px solid ${activeTheme.controlBorder}`,
            background: activeTheme.controlBackground,
            color: activeTheme.controlForeground,
            fontSize: 20,
            cursor: "pointer",
            boxShadow: "0 12px 34px rgba(0,0,0,0.28)",
          }}
        >
          {musicOn ? "♫" : "♪"}
        </button>
      )}

      {import.meta.env.DEV && !showShowroomDiagPanel && (
        <button
          type="button"
          aria-label="Open intro animation diag"
          onClick={() => setShowShowroomDiagPanel(true)}
          style={{
            position: "fixed",
            left: 16,
            bottom: 16,
            zIndex: 55,
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 999,
            background: "rgba(15,23,42,0.78)",
            color: "#f8fafc",
            fontSize: 12,
            fontWeight: 800,
            padding: "9px 12px",
            cursor: "pointer",
            boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
          }}
        >
          Diag
        </button>
      )}

      {import.meta.env.DEV && showShowroomDiagPanel && (
        <div
          className="pointer-events-auto"
          style={{
            position: "fixed",
            left: 16,
            bottom: 16,
            zIndex: 55,
            width: "min(88vw, 280px)",
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(15,23,42,0.92)",
            boxShadow: "0 18px 48px rgba(0,0,0,0.34)",
            color: "#f8fafc",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div
            style={{
              marginBottom: 8,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: "rgba(248,250,252,0.62)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span>Intro animation diag</span>
            <button
              type="button"
              aria-label="Close intro animation diag"
              onClick={() => setShowShowroomDiagPanel(false)}
              style={{
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.08)",
                color: "#f8fafc",
                width: 24,
                height: 24,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
          <select
            value={showroomDiagAnimation}
            onChange={(event) => setShowroomDiagAnimation(event.target.value)}
            style={{
              width: "100%",
              marginBottom: 8,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.24)",
              background: "rgba(24,24,27,0.96)",
              color: "#f8fafc",
              fontSize: 14,
            }}
          >
            {COMPANION_ANIMATION_IDS.map((animation) => (
              <option key={animation} value={animation}>
                {animation}
              </option>
            ))}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              type="button"
              onClick={() => fireShowroomDiagAnimation(showroomDiagAnimation)}
              style={{
                border: 0,
                borderRadius: 8,
                background: "#0f7dad",
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                padding: "9px 10px",
                cursor: "pointer",
              }}
            >
              Fire
            </button>
            <button
              type="button"
              onClick={() => fireShowroomDiagAnimation("idle", { loop: true })}
              style={{
                border: 0,
                borderRadius: 8,
                background: "#047857",
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                padding: "9px 10px",
                cursor: "pointer",
              }}
            >
              Force idle
            </button>
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "rgba(248,250,252,0.62)",
              overflowWrap: "anywhere",
            }}
          >
            Last: {showroomDiagLastCommand}
          </div>
        </div>
      )}

      <div
        className="sunny-showroom-stage"
        onPointerDown={onStagePointerDown}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerCancel}
        style={{
          position: "relative",
          height: "72vh",
          minHeight: 440,
          zIndex: 1,
          touchAction: entries.length > 1 && !spotlightOpen && !picking ? "none" : "auto",
          cursor:
            entries.length > 1 && !spotlightOpen && !picking ? "grab" : "default",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "auto 0 0",
            height: "36%",
            background: activeTheme.floorGlow,
            pointerEvents: "none",
          }}
        />
        {activeTheme.chrome === "crystal" && !spotlightOpen && <CrystalSpotlight />}
        {/* God rays — one per companion position */}
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
          {slots.filter((s) => s.slot !== "hidden").map((s) => {
            const left = s.slot === "prev" ? "16%" : s.slot === "next" ? "84%" : "50%";
            const isActive = s.entry.id === (current?.id ?? "");
            return (
              <div
                key={s.entry.id}
                style={{
                  position: "absolute",
                  left,
                  top: 0,
                  width: s.slot === "current" ? 130 : 80,
                  height: s.slot === "current" ? "55%" : "45%",
                  transform: "translateX(-50%)",
                  background:
                    activeTheme.chrome === "crystal"
                      ? `linear-gradient(180deg,
                    rgba(255,247,237,${isActive ? 0.2 : 0.09}) 0%,
                    rgba(253,230,138,0.05) 55%,
                    transparent 100%)`
                      : `linear-gradient(180deg,
                    rgba(255,255,255,${isActive ? 0.07 : 0.035}) 0%,
                    rgba(255,255,255,0.018) 55%,
                    transparent 100%)`,
                  clipPath: "polygon(38% 0%, 62% 0%, 100% 100%, 0% 100%)",
                  pointerEvents: "none",
                  transition: "opacity 0.8s",
                }}
              />
            );
          })}
        </div>

        <AnimatePresence initial={false}>
          {slots.map((slot) => (
            <CompanionSlot
              key={slot.entry.id}
              entry={slot.entry}
              slot={slot.slot}
              active={!spotlightOpen}
              soleFlankPair={isPairDuo}
              vfxPreset={slot.slot === "current" ? signatureMoveVfxPreset(slot.entry) : undefined}
              vfxLevel={slot.slot === "current" ? signatureMoveLevel : "idle"}
              getAnalyser={getSpeechAnalyser}
              onMotorReady={setMotor}
              onLoadSettled={markSlotLoadSettled}
            />
          ))}
        </AnimatePresence>
        {activeTheme.chrome === "crystal" && (
          <>
            {slots
              .filter((slot) => slot.slot !== "hidden")
              .map((slot) => (
                <CrystalPedestal
                  key={`crystal-pedestal-${slot.entry.id}`}
                  entry={slot.entry}
                  slot={slot.slot}
                  soleFlankPair={isPairDuo}
                  slotFrameStyle={slotFrameStyle(slot.slot, {
                    soleFlankPair:
                      Boolean(isPairDuo) &&
                      (slot.slot === "next" || slot.slot === "prev"),
                  })}
                  visible={!spotlightOpen}
                />
              ))}
          </>
        )}
        {activeTheme.chrome === "storybook" && <StorybookFootlights />}
        {showCompanionDots && (
          <div
            role="group"
            aria-label="Companions — tap a dot to switch"
            className="sunny-showroom-dots"
            style={{
              position: "absolute",
              left: "50%",
              bottom: 10,
              transform: "translateX(-50%)",
              display: "flex",
              gap: 10,
              zIndex: 14,
              flexWrap: "wrap",
              justifyContent: "center",
              maxWidth: "min(90vw, 400px)",
              padding: "0 12px",
            }}
          >
            {entries.map((e, i) => {
              const dotActive = i === currentIndex;
              return (
                <button
                  type="button"
                  key={e.id}
                  title={e.name}
                  id={`sunny-showroom-pick-${e.id}`}
                  aria-label={`Show ${e.name}`}
                  aria-current={dotActive ? "true" : undefined}
                  onClick={() => {
                    if (picking) return;
                    setCurrentIndex(i);
                  }}
                  style={{
                    width: dotActive ? 12 : 9,
                    height: dotActive ? 12 : 9,
                    borderRadius: 999,
                    border: 0,
                    padding: 0,
                    background:
                      dotActive
                        ? activeAccent
                        : activeTheme.chrome === "crystal"
                          ? "rgba(60,40,140,0.28)"
                          : "rgba(255,255,255,0.3)",
                    cursor: picking ? "not-allowed" : "pointer",
                    boxShadow: dotActive
                      ? "0 0 0 1px rgba(255,255,255,0.2), 0 2px 14px rgba(109,94,245,0.45)"
                      : "0 0 0 1px rgba(0,0,0,0.1)",
                    transition: "width 0.2s ease, height 0.2s ease, background 0.2s ease",
                    opacity: picking ? 0.5 : 1,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label="Previous companion"
        onClick={() => cycle(-1)}
        disabled={entries.length <= 1 || spotlightOpen || picking}
        style={showroomArrowButtonStyle(activeTheme, "left")}
      >
        ◀
      </button>

      <button
        type="button"
        aria-label="Next companion"
        onClick={() => cycle(1)}
        disabled={entries.length <= 1 || spotlightOpen || picking}
        style={showroomArrowButtonStyle(activeTheme, "right")}
      >
        ▶
      </button>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "calc(72vh - 36px)",
          transform: "translateX(-50%)",
          zIndex: 18,
          display: "flex",
          gap: 12,
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
          width: "min(94vw, 720px)",
        }}
      >
        {!spotlightOpen && (
          <>
            {activeTheme.chrome === "storybook" ? (
              <>
                {current.showroom?.signatureMove && (
                  <StorybookSignatureButton
                    name={current.showroom.signatureMove.name}
                    voiceLine={current.showroom.signatureMove.voiceLine}
                    onClick={playSignatureMove}
                    disabled={initialStageLoading}
                  />
                )}
	                <StorybookPrimaryButton
	                  companionName={current.name}
	                  onClick={openSpotlight}
	                  disabled={initialStageLoading}
	                />
	                <button
	                  type="button"
	                  onClick={() => setShowroomTalkOpen(true)}
	                  disabled={talkButtonDisabled}
	                  style={{
	                    border: `1px solid ${activeTheme.controlBorder}`,
	                    borderRadius: 999,
	                    background: activeTheme.controlBackground,
	                    color: activeTheme.controlForeground,
	                    fontSize: 17,
	                    fontWeight: 900,
	                    fontFamily: "Lexend, system-ui, sans-serif",
	                    padding: "14px 22px",
	                    cursor: talkButtonDisabled ? "wait" : "pointer",
	                    opacity: talkButtonDisabled ? 0.62 : 1,
	                  }}
	                >
	                  Talk with {current.name}
	                </button>
	                {renderVideoChatButton()}
	              </>
	            ) : activeTheme.chrome === "crystal" ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  maxWidth: "min(94vw, 760px)",
                }}
              >
                <CrystalIdentityBlock companion={current} roleNumber={currentIndex + 1} />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <CrystalDotNav
                    total={entries.length}
                    activeIndex={currentIndex}
                    onPick={(index) => {
                      if (picking) return;
                      setCurrentIndex(index);
                    }}
                    disabled={picking}
                  />
                  {current.showroom?.signatureMove && (
                    <CrystalSignatureButton
                      name={current.showroom.signatureMove.name}
                      voiceLine={current.showroom.signatureMove.voiceLine}
                      onClick={playSignatureMove}
                      disabled={initialStageLoading}
                    />
                  )}
	                  <CrystalPrimaryButton
	                    companionName={current.name}
	                    onClick={openSpotlight}
	                    disabled={initialStageLoading}
	                  />
	                  <button
	                    type="button"
	                    onClick={() => setShowroomTalkOpen(true)}
	                    disabled={talkButtonDisabled}
	                    style={{
	                      border: "1px solid rgba(124,92,255,0.26)",
	                      borderRadius: 999,
	                      background: "rgba(255,255,255,0.74)",
	                      color: "#3b2f7a",
	                      fontSize: 16,
	                      fontWeight: 900,
	                      fontFamily: "Lexend, system-ui, sans-serif",
	                      padding: "13px 20px",
	                      boxShadow: "0 14px 34px rgba(124,92,255,0.14)",
	                      cursor: talkButtonDisabled ? "wait" : "pointer",
	                      opacity: talkButtonDisabled ? 0.62 : 1,
	                    }}
	                  >
	                    Talk with {current.name}
	                  </button>
	                  {renderVideoChatButton()}
	                </div>
	              </div>
	            ) : (
              <>
                {current.showroom?.signatureMove && (
                  <button
                    type="button"
                    aria-label={`Play ${current.showroom.signatureMove.name}`}
                    title={current.showroom.signatureMove.voiceLine}
                    onClick={playSignatureMove}
                    disabled={initialStageLoading}
                    style={{
                      border: "1px solid rgba(254,240,138,0.46)",
                      borderRadius: 999,
                      background:
                        "linear-gradient(135deg, rgba(250,204,21,0.95), rgba(202,138,4,0.88))",
                      color: "#1f1300",
                      fontSize: 17,
                      fontWeight: 900,
                      fontFamily: "Lexend, system-ui, sans-serif",
                      padding: "15px 24px",
                      boxShadow: "0 18px 44px rgba(250,204,21,0.24)",
                      cursor: initialStageLoading ? "wait" : "pointer",
                      opacity: initialStageLoading ? 0.68 : 1,
                      maxWidth: "min(88vw, 300px)",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {current.showroom.signatureMove.name}
                  </button>
                )}
	                <button
	                  type="button"
	                  onClick={openSpotlight}
                  disabled={initialStageLoading}
                  style={{
                    border: 0,
                    borderRadius: 999,
                    background: activeTheme.primaryBackground,
                    color: activeTheme.primaryForeground,
                    fontSize: 20,
                    fontWeight: 800,
                    fontFamily: "Lexend, system-ui, sans-serif",
                    padding: "16px 34px",
                    boxShadow: "0 18px 44px rgba(109,94,245,0.42)",
                    cursor: initialStageLoading ? "wait" : "pointer",
                    opacity: initialStageLoading ? 0.68 : 1,
                  }}
	                >
	                  Meet {current.name}
	                </button>
	                <button
	                  type="button"
	                  onClick={() => setShowroomTalkOpen(true)}
	                  disabled={talkButtonDisabled}
	                  style={{
	                    border: "1px solid rgba(255,255,255,0.2)",
	                    borderRadius: 999,
	                    background: "rgba(15,23,42,0.78)",
	                    color: "#f8fafc",
	                    fontSize: 18,
	                    fontWeight: 900,
	                    fontFamily: "Lexend, system-ui, sans-serif",
	                    padding: "15px 24px",
	                    boxShadow: "0 18px 44px rgba(15,23,42,0.24)",
	                    cursor: talkButtonDisabled ? "wait" : "pointer",
	                    opacity: talkButtonDisabled ? 0.62 : 1,
	                  }}
	                >
	                  Talk with {current.name}
	                </button>
	                {renderVideoChatButton()}
	              </>
	            )}
          </>
        )}
	      </div>

	      <AnimatePresence>
	        {showroomTalkOpen && !spotlightOpen && (
	          <motion.form
	            key="showroom-talk"
	            role="dialog"
	            aria-label={`Talk with ${current.name}`}
	            initial={{ opacity: 0, y: 18 }}
	            animate={{ opacity: 1, y: 0 }}
	            exit={{ opacity: 0, y: 18 }}
	            transition={{ duration: 0.22, ease: "easeOut" }}
	            onSubmit={(event) => {
	              event.preventDefault();
	              void submitShowroomTalkQuestion();
	            }}
	            style={{
	              position: "fixed",
	              left: "50%",
	              bottom: 18,
	              transform: "translateX(-50%)",
	              zIndex: 36,
	              width: "min(92vw, 620px)",
	              borderRadius: 8,
	              border: `1px solid ${activeTheme.controlBorder}`,
	              background:
	                activeTheme.chrome === "crystal"
	                  ? "rgba(255,255,255,0.9)"
	                  : "rgba(16,18,32,0.92)",
	              color: activeTheme.controlForeground,
	              boxShadow: "0 22px 70px rgba(0,0,0,0.28)",
	              backdropFilter: "blur(14px)",
	              padding: 12,
	              display: "grid",
	              gap: 10,
	            }}
	          >
	            <div
	              style={{
	                display: "flex",
	                alignItems: "center",
	                justifyContent: "space-between",
	                gap: 10,
	              }}
	            >
	              <div
	                style={{
	                  fontSize: 15,
	                  fontWeight: 900,
	                  overflow: "hidden",
	                  textOverflow: "ellipsis",
	                  whiteSpace: "nowrap",
	                }}
	              >
	                Talk with {current.name}
	              </div>
	              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
	                <span
	                  aria-live="polite"
	                  style={{
	                    fontSize: 12,
	                    fontWeight: 800,
	                    color: activeTheme.mutedForeground,
	                    textTransform: "uppercase",
	                    letterSpacing: 0,
	                  }}
	                >
	                  {showroomTalkPhase}
	                </span>
	                <button
	                  type="button"
	                  aria-label="Close talk"
	                  onClick={() => {
	                    stopSpeech();
	                    resetShowroomTalk();
	                    setShowroomTalkOpen(false);
	                    playCurrentCompanionAnimation("idle", { loop: true });
	                  }}
	                  style={{
	                    width: 34,
	                    height: 34,
	                    borderRadius: 8,
	                    border: `1px solid ${activeTheme.controlBorder}`,
	                    background: "transparent",
	                    color: activeTheme.controlForeground,
	                    display: "grid",
	                    placeItems: "center",
	                    cursor: "pointer",
	                  }}
	                >
	                  <X size={18} aria-hidden />
	                </button>
	              </div>
	            </div>

	            {showroomTalkResponse && (
	              <div
	                style={{
	                  borderRadius: 8,
	                  padding: "10px 12px",
	                  background:
	                    activeTheme.chrome === "crystal"
	                      ? "rgba(124,92,255,0.1)"
	                      : "rgba(255,255,255,0.08)",
	                  color: activeTheme.controlForeground,
	                  fontSize: 14,
	                  lineHeight: 1.45,
	                }}
	              >
	                {showroomTalkResponse}
	              </div>
	            )}

	            {showroomTalkError && (
	              <div
	                role="alert"
	                style={{
	                  fontSize: 13,
	                  color: activeTheme.chrome === "crystal" ? "#9f1239" : "#fecdd3",
	                  lineHeight: 1.35,
	                }}
	              >
	                {showroomTalkError}
	              </div>
	            )}

	            <div
	              style={{
	                display: "grid",
	                gridTemplateColumns: "44px minmax(0, 1fr) 44px",
	                gap: 8,
	                alignItems: "center",
	              }}
	            >
	              <button
	                type="button"
	                aria-label="Use voice"
	                onClick={() => startShowroomTalkListening()}
	                disabled={shouldGateShowroomTalkMic(showroomTalkPhase)}
	                style={{
	                  width: 44,
	                  height: 44,
	                  borderRadius: 8,
	                  border: `1px solid ${activeTheme.controlBorder}`,
	                  background:
	                    showroomTalkPhase === "listening"
	                      ? activeTheme.primaryBackground
	                      : activeTheme.controlBackground,
	                  color:
	                    showroomTalkPhase === "listening"
	                      ? activeTheme.primaryForeground
	                      : activeTheme.controlForeground,
	                  display: "grid",
	                  placeItems: "center",
	                  cursor: shouldGateShowroomTalkMic(showroomTalkPhase) ? "wait" : "pointer",
	                  opacity: shouldGateShowroomTalkMic(showroomTalkPhase) ? 0.62 : 1,
	                }}
	              >
	                <Mic size={19} aria-hidden />
	              </button>
	              <input
	                value={showroomTalkQuestion}
	                onChange={(event) => {
	                  setShowroomTalkQuestion(event.target.value);
	                  setShowroomTalkError(null);
	                }}
	                disabled={shouldGateShowroomTalkMic(showroomTalkPhase)}
	                placeholder={`Ask ${current.name} anything`}
	                style={{
	                  minWidth: 0,
	                  height: 44,
	                  borderRadius: 8,
	                  border: `1px solid ${activeTheme.controlBorder}`,
	                  background:
	                    activeTheme.chrome === "crystal"
	                      ? "rgba(255,255,255,0.88)"
	                      : "rgba(15,23,42,0.82)",
	                  color: activeTheme.controlForeground,
	                  padding: "0 12px",
	                  fontSize: 15,
	                  fontWeight: 700,
	                  outline: "none",
	                }}
	              />
	              <button
	                type="submit"
	                aria-label="Send question"
	                disabled={shouldGateShowroomTalkMic(showroomTalkPhase)}
	                style={{
	                  width: 44,
	                  height: 44,
	                  borderRadius: 8,
	                  border: 0,
	                  background: activeTheme.primaryBackground,
	                  color: activeTheme.primaryForeground,
	                  display: "grid",
	                  placeItems: "center",
	                  cursor: shouldGateShowroomTalkMic(showroomTalkPhase) ? "wait" : "pointer",
	                  opacity: shouldGateShowroomTalkMic(showroomTalkPhase) ? 0.62 : 1,
	                }}
	              >
	                <Send size={18} aria-hidden />
	              </button>
	            </div>
	          </motion.form>
	        )}
	      </AnimatePresence>

	      <CompanionVideoCallOverlay
	        open={showroomVideoChatOpen}
	        companionName={current.name}
	        phase={showroomVideoCallPhase}
	        cameraState={showroomVideoChatCameraState}
	        talkPhase={showroomTalkPhase}
	        responseText={showroomTalkResponse}
	        error={showroomTalkError || showroomVideoChatError}
	        question={showroomTalkQuestion}
	        statusCopy={videoCallStatusCopy}
	        primaryBackground={activeTheme.primaryBackground}
	        layout={videoCallLayout}
	        companionView={videoCallCompanionView}
	        handsFree={videoCallStt.supported && videoCallStt.status !== "error"}
	        traceLink={showroomVideoTraceLink}
	        traceCopyStatus={showroomVideoTraceCopyStatus}
	        videoRef={showroomVideoElementRef}
	        portrait={
	          <CompanionSlot
	            entry={current}
	            slot="current"
	            active={showroomVideoChatOpen}
	            contained
	            getAnalyser={getSpeechAnalyser}
	            onMotorReady={handleVideoChatMotorReady}
	            onLoadSettled={noopShowroomSlotSettled}
	          />
	        }
	        activitySlot={
	          activeVideoCallActivity === "tic_tac_toe" ? (
	            <CompanionTicTacToe
	              companionId={current.id}
	              companionName={current.name}
	              onClose={() => {
	                showroomVideoActiveActivityRef.current = null;
	                setActiveVideoCallActivity(null);
	                setShowroomVideoActiveActivity(null);
	                setVideoCallLayout("call");
	                setVideoCallCompanionView("full_body");
	              }}
	              onGameEvent={postShowroomVideoCallActivityEvent}
	              onBanter={handleShowroomTicTacToeBanter}
	              onCompanionTurn={() => {
	                setShowroomTalkOpen(false);
	              }}
	              onRoundComplete={(result) => {
	                console.log(
	                  ` 🎮 [showroom-video-chat] activity_complete activity=tic_tac_toe result=${result}`,
	                );
	              }}
	            />
	          ) : null
	        }
	        onLayoutChange={setVideoCallLayout}
	        onCompanionViewChange={setVideoCallCompanionView}
	        onCopyTraceLink={copyShowroomVideoTraceLink}
	        onAskVoice={startShowroomVideoCallListening}
	        onQuestionChange={(value) => {
	          setShowroomTalkQuestion(value);
	          setShowroomTalkError(null);
	        }}
	        onSubmitQuestion={() => {
	          void submitShowroomTalkQuestion(undefined, { source: "video_call" });
	        }}
	        onLook={() => {
	          void submitShowroomTalkQuestion(
	            showroomTalkQuestion || "Can you take a quick look?",
	            {
	              source: "video_call",
	              forceVisualSnapshot: true,
	              visualReason: "look_button",
	            },
	          );
	        }}
	        onStartCamera={() => {
	          void startShowroomVideoChatCamera();
	        }}
	        onStopCamera={stopShowroomVideoChatCamera}
	        onEnd={closeShowroomVideoChat}
	      />

	      <AnimatePresence>
	        {spotlightOpen && (
          <motion.div
            key="spotlight-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10,
              pointerEvents: "none",
              background:
                "radial-gradient(ellipse 320px 480px at 50% 40%, transparent 0%, rgba(0,0,0,0.72) 100%)",
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {spotlightOpen && (
          <>
            <motion.button
              key="close"
              type="button"
              aria-label="Close spotlight"
              onClick={closeSpotlight}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{
                position: "fixed",
                top: 22,
                right: 22,
                zIndex: 40,
                width: 46,
                height: 46,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.26)",
                background: "rgba(15,23,42,0.86)",
                color: "#f8fafc",
                fontSize: 28,
                cursor: "pointer",
              }}
            >
              ×
            </motion.button>

            <AnimatePresence>
              {introVisible && (
                <CompanionInfoCard
                  key="companion-info-card"
                  entry={current}
                  introText={introText}
                  bonusPoints={bonus > 0 ? bonus : undefined}
                  pickLabel={pickLabel}
                  picking={picking}
                  speakingLine={speakingLine}
                  speechError={speechError}
                  selectedVoiceId={selectedVoiceId}
                  getAnalyser={getSpeechAnalyser}
                  onVoiceChange={(voiceId) =>
                    setVoiceSelections((prev) => ({ ...prev, [current.id]: voiceId }))
                  }
                  onSpeak={speakCurrent}
                  onSpecialDance={playSpecialDance}
                  onSignatureMove={playSignatureMove}
                  signatureMoveLevel={signatureMoveLevel}
                  onPick={confirmPick}
                  onClose={closeSpotlight}
                  onCardMotorReady={handleCardMotorReady}
                  onCardVrmSettled={handleCardVrmSettled}
                  cardPreviewVrmReady={cardPreviewVrmReady}
                />
              )}
            </AnimatePresence>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {initialStageLoading && (
          <motion.div
            key="showroom-loading"
            role="status"
            aria-live="polite"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 90,
              display: "grid",
              placeItems: "center",
              background: activeTheme.loadingBackground,
              color: activeTheme.foreground,
              pointerEvents: "none",
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.42, ease: "easeOut" }}
              style={{
                width: "min(82vw, 440px)",
                textAlign: "center",
              }}
            >
              <div
                aria-hidden
                style={{
                  margin: "0 auto 22px",
                  width: 88,
                  height: 88,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.18)",
                  background: `radial-gradient(circle, rgba(251,191,36,0.95) 0 12%, ${activeAccent} 13% 42%, rgba(15,23,42,0.65) 43%)`,
                  boxShadow:
                    "0 0 46px rgba(167,139,250,0.5), inset 0 0 28px rgba(255,255,255,0.16)",
                  animation: "sunny-showroom-breathe 1.1s ease-in-out infinite alternate",
                }}
              />
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  lineHeight: 1.15,
                  marginBottom: 10,
                }}
              >
                Opening the companion stage
              </div>
              <div
                style={{
                  color: "rgba(248,250,252,0.68)",
                  fontSize: 15,
                  lineHeight: 1.45,
                }}
              >
                {generatedBackgroundLoading
                  ? "Painting a magical backdrop..."
                  : "Warming up the friends..."}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
