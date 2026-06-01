export type CompanionVideoCallTraceEventName =
  | "call_started"
  | "call_ended"
  | "call_greeting_selected"
  | "call_greeting_audio_start"
  | "call_greeting_audio_ended"
  | "call_greeting_skipped"
  | "speech_listen_start"
  | "speech_result"
  | "speech_error"
  | "echo_suppressed"
  | "loop_suspected"
  | "talk_request_start"
  | "talk_response_received"
  | "audio_play_start"
  | "audio_ended"
  | "audio_error"
  | "activity_reaction_request_start"
  | "activity_reaction_response_received"
  | "activity_reaction_stale_dropped"
  | "activity_reaction_audio_start"
  | "activity_reaction_audio_ended"
  | "activity_reaction_fallback"
  | "handsfree_rearm_scheduled"
  | "handsfree_rearm_starting"
  | "handsfree_rearm_skipped"
  | "activity_context_changed"
  | "conversation_mode_changed"
  | "activity_phase_changed";

export type CompanionVideoCallTraceInput = {
  traceId: string;
  turnId?: string;
  eventName: CompanionVideoCallTraceEventName;
  childId?: string;
  companionId?: string;
  callSource?: string;
  relationshipState?: string;
  timestamp?: number;
  payload?: Record<string, unknown>;
};

export type CompanionVideoCallLoopResult = {
  suspected: boolean;
  reason?: "transcript_echoed_last_companion_response" | "repeated_transcript";
  transcriptHash?: string;
  echoSimilarity?: number;
};

type GameBridgeWindow = Window & {
  GameBridge?: {
    reportAction?: (type: string, action: string, payload: Record<string, unknown>) => void;
  };
};

const MAX_PREVIEW_LENGTH = 120;
const BLOCKED_PAYLOAD_KEYS = new Set([
  "base64",
  "audioBase64",
  "rawAudio",
  "audio",
  "providerPayload",
  "rawProviderPayload",
  "authorization",
  "apiKey",
  "token",
  "secret",
]);

export function hashCompanionVideoTraceText(value: string): string {
  let hash = 2166136261;
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function previewText(value: string): { preview: string; hash: string; length: number } {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return {
    preview: collapsed.slice(0, MAX_PREVIEW_LENGTH),
    hash: hashCompanionVideoTraceText(collapsed),
    length: collapsed.length,
  };
}

function normalizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function similarity(a: string, b: string): number {
  const left = new Set(normalizeWords(a));
  const right = new Set(normalizeWords(b));
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const word of left) {
    if (right.has(word)) overlap += 1;
  }
  return Number((overlap / Math.max(left.size, right.size)).toFixed(3));
}

function sanitizeValue(value: unknown, key = ""): unknown {
  if (BLOCKED_PAYLOAD_KEYS.has(key)) return undefined;
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > MAX_PREVIEW_LENGTH) {
      const text = previewText(value);
      return { preview: text.preview, hash: text.hash, length: text.length };
    }
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry)).filter((entry) => entry !== undefined);
  }
  const raw = value as Record<string, unknown>;
  if (key === "visualSnapshot") {
    return {
      mimeType: raw.mimeType,
      reason: raw.reason,
      capturedAt: raw.capturedAt,
      width: raw.width,
      height: raw.height,
    };
  }
  const out: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(raw)) {
    if (
      childKey === "transcript" ||
      childKey === "question" ||
      childKey === "questionText" ||
      childKey === "responseText" ||
      childKey === "companionText"
    ) {
      continue;
    }
    const next = sanitizeValue(childValue, childKey);
    if (next !== undefined) out[childKey] = next;
  }
  return out;
}

function textFromPayload(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export function sanitizeCompanionVideoCallTracePayload(
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  const transcript = textFromPayload(payload, ["transcript", "question", "questionText"]);
  const response = textFromPayload(payload, ["responseText", "companionText"]);
  const transcriptText = transcript ? previewText(transcript) : null;
  const responseText = response ? previewText(response) : null;
  const sanitized = sanitizeValue(payload) as Record<string, unknown>;
  return {
    ...(Object.keys(sanitized).length > 0 ? sanitized : {}),
    ...(transcriptText && {
      transcriptPreview: transcriptText.preview,
      transcriptHash: transcriptText.hash,
      transcriptLength: transcriptText.length,
    }),
    ...(responseText && {
      responsePreview: responseText.preview,
      responseHash: responseText.hash,
      responseLength: responseText.length,
    }),
    ...(transcript && response && { echoSimilarity: similarity(transcript, response) }),
  };
}

export function detectCompanionVideoCallLoop(input: {
  transcript: string;
  lastCompanionResponse?: string;
  previousTranscriptHash?: string;
}): CompanionVideoCallLoopResult {
  const transcript = input.transcript.replace(/\s+/g, " ").trim();
  const transcriptHash = transcript ? hashCompanionVideoTraceText(transcript) : undefined;
  if (!transcriptHash) return { suspected: false };
  const echoSimilarity = input.lastCompanionResponse
    ? similarity(transcript, input.lastCompanionResponse)
    : 0;
  if (echoSimilarity >= 0.82) {
    return {
      suspected: true,
      reason: "transcript_echoed_last_companion_response",
      transcriptHash,
      echoSimilarity,
    };
  }
  if (input.previousTranscriptHash && input.previousTranscriptHash === transcriptHash) {
    return {
      suspected: true,
      reason: "repeated_transcript",
      transcriptHash,
      echoSimilarity,
    };
  }
  return { suspected: false, transcriptHash, echoSimilarity };
}

export function createCompanionVideoCallTraceId(now = new Date(), random = Math.random): string {
  const stamp = now
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".", "")
    .slice(0, 15)
    .toLowerCase();
  const suffix = Math.floor(random() * 0xffffff)
    .toString(36)
    .padStart(5, "0")
    .slice(0, 5);
  return `trace_${stamp}_${suffix}`;
}

export function createCompanionVideoCallTurnId(traceId: string, sequence: number): string {
  return `${traceId}_turn_${Math.max(1, sequence)}`;
}

export function buildCompanionVideoTraceUrl(
  traceId: string,
  origin = typeof window === "undefined" ? "" : window.location.origin,
): string {
  return `${origin.replace(/\/$/, "")}/api/companions/video-call-traces/${encodeURIComponent(traceId)}`;
}

export async function emitCompanionVideoCallTrace(input: CompanionVideoCallTraceInput): Promise<void> {
  const payload = sanitizeCompanionVideoCallTracePayload(input.payload ?? {});
  const event = {
    ...input,
    origin: "client",
    timestamp: input.timestamp ?? Date.now(),
    payload,
    ...payload,
  };
  const gameBridge = (window as GameBridgeWindow).GameBridge;
  if (typeof gameBridge?.reportAction === "function") {
    gameBridge.reportAction("companion_video_call_trace", input.eventName, event);
    return;
  }
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(
      {
        type: "game_state_update",
        payload: {
          ...event,
          type: "companion_video_call_trace",
        },
        version: "1.0",
      },
      "*",
    );
    return;
  }
  await fetch(
    `/api/companions/video-call-traces/${encodeURIComponent(input.traceId)}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    },
  );
}
