import type {
  ChildSignalInput,
  ChildSignalType,
  ChildSignalDimension,
} from "../engine/childSignals";
import type { ProductIssueInput } from "../engine/productIssues";

export type UrgentIntentType =
  | "help_request"
  | "frustration"
  | "autonomy_pushback"
  | "bug_report"
  | "stop_or_pause"
  | "companion_name_call";

export type LiveLearningContext = {
  childId: string;
  childName: string;
  companionName: string;
  activityId: string;
  nodeId?: string;
  currentWord?: string;
  wordIndex?: number;
  totalWords?: number;
  phase?: string;
  lastHeard?: string;
  lastOutcome?: string;
  missCount?: number;
  accuracy?: number;
  updatedAt: string;
};

export type UrgentChildIntent = {
  type: UrgentIntentType;
  shouldInterrupt: boolean;
  reason: string;
};

export type UrgentSupportResponse = {
  text: string;
  gameMessage?: Record<string, unknown>;
};

export type UrgentEvidence = {
  childSignals: Array<Omit<ChildSignalInput, "createdAt">>;
  productIssues: Array<Omit<ProductIssueInput, "createdAt">>;
};

type BuildContextInput = {
  childId: string;
  childName: string;
  companionName?: string;
  currentActivityState?: Record<string, unknown> | null;
  currentCanvasState?: Record<string, unknown> | null;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeActivityId(value: string | undefined): string {
  return (value ?? "unknown_activity").trim().toLowerCase().replace(/\s+/g, "-");
}

export function buildLiveLearningContext(input: BuildContextInput): LiveLearningContext | null {
  const state = input.currentActivityState ?? input.currentCanvasState;
  if (!state) return null;
  const activityId = normalizeActivityId(
    asString(state.activityId) ??
      asString(state.game) ??
      asString(state.mode) ??
      asString(input.currentCanvasState?.mode),
  );
  if (activityId === "unknown_activity") return null;

  const currentWord =
    asString(state.currentWord) ??
    asString(state.word) ??
    asString(state.targetWord) ??
    asString(input.currentCanvasState?.spellingWord);

  return {
    childId: input.childId,
    childName: input.childName,
    companionName: input.companionName ?? "Sunny",
    activityId,
    nodeId: asString(state.nodeId),
    currentWord,
    wordIndex: asNumber(state.wordIndex ?? state.itemIndex),
    totalWords: asNumber(state.totalWords ?? state.totalItems),
    phase: asString(state.phase),
    lastHeard: asString(state.lastHeard),
    lastOutcome: asString(state.lastOutcome ?? state.outcome),
    missCount: asNumber(state.missCount ?? state.attempt),
    accuracy: asNumber(state.accuracy),
    updatedAt: new Date().toISOString(),
  };
}

function isActiveLearningGame(context: LiveLearningContext | null): context is LiveLearningContext {
  if (!context) return false;
  return /pronunciation|spell-check|word-radar|monster-stampede|wheel/.test(context.activityId);
}

export function detectUrgentChildIntent(
  transcript: string,
  context: LiveLearningContext | null,
): UrgentChildIntent | null {
  if (!isActiveLearningGame(context)) return null;
  const t = transcript.toLowerCase().trim();
  if (!t) return null;

  if (/\b(end session|quit session|goodbye|bye)\b/.test(t)) return null;

  if (/\b(i do not need help|i don't need help|dont need help|don't help|stop helping|go away|i got it|let me do it|no help)\b/.test(t)) {
    return {
      type: "autonomy_pushback",
      shouldInterrupt: true,
      reason: "child_rejected_help",
    };
  }

  if (/\b(bug|broken|glitch|not working|lag|lagging|too slow|you are behind|you're behind|behind me|not listening)\b/.test(t)) {
    return {
      type: "bug_report",
      shouldInterrupt: true,
      reason: "child_reported_product_issue",
    };
  }

  if (/\b(can you help|help me|help|i need help|i'm stuck|im stuck|stuck|i don't know|i dont know|what is it|how do i)\b/.test(t)) {
    return {
      type: "help_request",
      shouldInterrupt: true,
      reason: "child_requested_help",
    };
  }

  if (/\b(this is hard|too hard|i can't|i cant|can't do|cant do|i give up|ugh|frustrated|mad|angry|cry|hurts?)\b/.test(t)) {
    return {
      type: "frustration",
      shouldInterrupt: true,
      reason: "child_frustration_language",
    };
  }

  if (/\b(pause|wait|one second|hold on|slow down)\b/.test(t)) {
    return {
      type: "stop_or_pause",
      shouldInterrupt: true,
      reason: "child_requested_pause",
    };
  }

  const companion = context.companionName.toLowerCase();
  if (companion && new RegExp(`\\b${companion}\\b`, "i").test(transcript)) {
    return {
      type: "companion_name_call",
      shouldInterrupt: true,
      reason: "child_called_companion",
    };
  }

  return null;
}

type DecodingHint = {
  word: string;
  chunked: string;
  guidance: string;
  chunks: string[];
};

function fallbackChunk(word: string): string[] {
  const clean = word.trim().toLowerCase();
  if (clean.length <= 4) return clean.split("");
  const mid = Math.ceil(clean.length / 2);
  return [clean.slice(0, mid), clean.slice(mid)].filter(Boolean);
}

export function buildDecodingHint(word: string | undefined): DecodingHint {
  const clean = (word ?? "this word").trim().toLowerCase();
  const known: Record<string, Omit<DecodingHint, "word">> = {
    able: { chunked: "a-ble", guidance: "long A, then ble", chunks: ["a", "ble"] },
    common: { chunked: "com-mon", guidance: "two beats: com, then mon", chunks: ["com", "mon"] },
    behind: { chunked: "be-hind", guidance: "two parts: be, then hind", chunks: ["be", "hind"] },
    carefully: { chunked: "care-ful-ly", guidance: "three parts: care, ful, ly", chunks: ["care", "ful", "ly"] },
    whole: { chunked: "whole", guidance: "silent w; say it like hole", chunks: ["whole"] },
  };
  const hit = known[clean];
  if (hit) return { word: clean, ...hit };
  const chunks = fallbackChunk(clean);
  return {
    word: clean,
    chunked: chunks.join("-"),
    guidance: `say ${chunks.join(", then ")}`,
    chunks,
  };
}

export function buildUrgentSupportResponse(
  intent: UrgentChildIntent,
  context: LiveLearningContext,
): UrgentSupportResponse {
  const hint = buildDecodingHint(context.currentWord);
  const word = hint.word;
  const supportMessage = {
    type: "pronunciation_support",
    word,
    chunks: hint.chunks,
    chunked: hint.chunked,
    guidance: hint.guidance,
    mode: intent.type === "frustration" || intent.type === "stop_or_pause" ? "pause" : "slow",
    durationMs: intent.type === "autonomy_pushback" ? 0 : 7000,
  };

  if (intent.type === "autonomy_pushback") {
    return { text: "Got it. I'll back off. I'm here if you ask." };
  }

  if (intent.type === "frustration") {
    return {
      text: `Pause. This word is tricky, and you're trying. Let's break it into two parts: ${hint.chunked}. ${hint.guidance}.`,
      gameMessage: supportMessage,
    };
  }

  if (intent.type === "stop_or_pause") {
    return {
      text: `Paused. Take a breath. We can do ${word} one part at a time: ${hint.chunked}.`,
      gameMessage: supportMessage,
    };
  }

  if (intent.type === "bug_report") {
    return {
      text: `I caught that. I'll mark the Sunny issue. For this word, try ${hint.chunked}: ${hint.guidance}.`,
      gameMessage: supportMessage,
    };
  }

  if (intent.type === "companion_name_call") {
    return {
      text: `I'm here. You're on ${word}. Try ${hint.chunked}: ${hint.guidance}.`,
      gameMessage: supportMessage,
    };
  }

  return {
    text: `You're on ${word}. Try ${hint.chunked}: ${hint.guidance}. Say ${word} with me.`,
    gameMessage: supportMessage,
  };
}

function childSignal(
  context: LiveLearningContext,
  transcript: string,
  signalType: ChildSignalType,
  dimension: ChildSignalDimension,
  evidenceText: string,
): Omit<ChildSignalInput, "createdAt"> {
  return {
    childId: context.childId,
    activityId: context.activityId,
    domain: context.activityId === "pronunciation" ? "reading" : "spelling",
    signalType,
    dimension,
    valence: "negative",
    confidence: 0.9,
    evidenceText: evidenceText || `child said: "${transcript}"`,
    source: "observed_behavior",
    nodeId: context.nodeId,
  };
}

export function chartEvidenceForUrgentIntent(
  intent: UrgentChildIntent,
  context: LiveLearningContext,
  transcript: string,
): UrgentEvidence {
  if (intent.type === "bug_report") {
    const lower = transcript.toLowerCase();
    return {
      childSignals: [],
      productIssues: [
        {
          childId: context.childId,
          activityId: context.activityId,
          issueType:
            /\b(behind|lag|slow|not listening)\b/.test(lower)
              ? "companion_lag"
              : "bug_report",
          severity: /\b(behind|lag|bug|broken|not working)\b/.test(lower)
            ? "high"
            : "medium",
          childUtterance: transcript,
          evidenceText: `child reported Sunny issue during ${context.activityId}: "${transcript}"`,
          confidence: 0.85,
          source: "child_utterance",
          nodeId: context.nodeId,
          activityState: { ...context },
        },
      ],
    };
  }

  const signal =
    intent.type === "autonomy_pushback"
      ? childSignal(context, transcript, "autonomy_pushback", "autonomy", `child rejected help: "${transcript}"`)
      : intent.type === "frustration"
        ? childSignal(context, transcript, "frustration", "reading", `child showed frustration language: "${transcript}"`)
        : intent.type === "stop_or_pause"
          ? childSignal(context, transcript, "frustration", "calm", `child requested pause/slowdown: "${transcript}"`)
          : childSignal(context, transcript, "help_needed", "help", `child requested help during ${context.activityId}: "${transcript}"`);

  return { childSignals: [signal], productIssues: [] };
}

export function auditConversationForLearningSignals(input: {
  childId: string;
  sessionId?: string;
  messages: string[];
  recentActivityState?: Record<string, unknown> | null;
}): UrgentEvidence {
  const text = input.messages.join("\n").toLowerCase();
  const context =
    buildLiveLearningContext({
      childId: input.childId,
      childName: input.childId,
      companionName: "Sunny",
      currentActivityState: input.recentActivityState ?? { game: "pronunciation" },
    }) ?? {
      childId: input.childId,
      childName: input.childId,
      companionName: "Sunny",
      activityId: "pronunciation",
      updatedAt: new Date().toISOString(),
    };
  const childSignals: UrgentEvidence["childSignals"] = [];
  const productIssues: UrgentEvidence["productIssues"] = [];

  if (
    /\bbiggest signal\b/.test(text) ||
    (/\bpractice reading\b/.test(text) && /\blistening to (the )?book\b/.test(text))
  ) {
    childSignals.push({
      childId: input.childId,
      activityId: context.activityId || "pronunciation",
      domain: "reading",
      signalType: "reading_struggle",
      dimension: "reading",
      valence: "negative",
      confidence: 0.9,
      evidenceText:
        "Parent/caregiver identified reading practice as the main signal after pronunciation struggle.",
      source: "parent_comment",
      sessionId: input.sessionId,
      nodeId: context.nodeId,
    });
  }

  if (/\bbug\b|\bglitch\b|\bnot working\b|\byou'?re behind\b|\byou are behind\b/.test(text)) {
    productIssues.push({
      childId: input.childId,
      activityId: context.activityId || "unknown_activity",
      issueType: /\bbehind\b/.test(text) ? "companion_lag" : "bug_report",
      severity: "medium",
      childUtterance: "session transcript contained product complaint",
      evidenceText: "Session audit found a child/parent product complaint in the transcript.",
      confidence: 0.7,
      source: "observed_behavior",
      sessionId: input.sessionId,
      nodeId: context.nodeId,
      activityState: input.recentActivityState ?? null,
    });
  }

  return { childSignals, productIssues };
}
