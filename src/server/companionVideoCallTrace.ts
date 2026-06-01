import crypto from "crypto";
import fs from "fs";
import path from "path";

export type CompanionVideoCallTraceEventName =
  | "call_started"
  | "call_ended"
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

export type CompanionVideoCallLikelyCause =
  | "none"
  | "speech_recognition_echo"
  | "stale_activity_reaction"
  | "activity_reaction_missing_audio"
  | "activity_open_interrupted_audio"
  | "game_context_overrode_social_intent"
  | "repeated_turn"
  | "handsfree_rearm_loop"
  | "slow_response";

export type CompanionVideoCallTraceEventInput = {
  traceId: string;
  turnId?: string;
  eventName: CompanionVideoCallTraceEventName;
  origin?: "client" | "server";
  childId?: string;
  companionId?: string;
  callSource?: string;
  relationshipState?: string;
  timestamp?: number;
  payload?: Record<string, unknown>;
};

export type CompanionVideoCallTraceRecord = {
  traceId: string;
  turnId?: string;
  eventName: CompanionVideoCallTraceEventName;
  origin?: "client" | "server";
  childId?: string;
  companionId?: string;
  callSource?: string;
  relationshipState?: string;
  timestamp: number;
  recordedAt: string;
  transcriptPreview?: string;
  transcriptHash?: string;
  transcriptLength?: number;
  responsePreview?: string;
  responseHash?: string;
  responseLength?: number;
  echoSimilarity?: number;
  payload?: Record<string, unknown>;
};

export type CompanionVideoCallTraceTurnPacket = {
  turnId: string;
  eventNames: CompanionVideoCallTraceEventName[];
  transcriptPreview?: string;
  transcriptHash?: string;
  responsePreview?: string;
  responseHash?: string;
  requestToResponseMs?: number;
  audioMs?: number;
  loopSuspected?: boolean;
};

export type CompanionVideoCallTracePacket = {
  traceId: string;
  childId?: string;
  companionId?: string;
  callSource?: string;
  relationshipState?: string;
  startedAt?: string;
  endedAt?: string;
  eventCount: number;
  loopSuspected: boolean;
  likelyCause: CompanionVideoCallLikelyCause;
  activeTicTacToeState?: unknown;
  activityReactions?: {
    aiAuthoredCount: number;
    fallbackCount: number;
    staleDroppedCount: number;
    spokenCount: number;
    missingAudioCount: number;
    averageResponseMs?: number;
  };
  eventOrder: Array<{
    eventName: CompanionVideoCallTraceEventName;
    origin?: "client" | "server";
    turnId?: string;
    timestamp: number;
    transcriptPreview?: string;
    responsePreview?: string;
    echoSimilarity?: number;
  }>;
  turns: CompanionVideoCallTraceTurnPacket[];
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

function defaultTraceRoot(): string {
  return path.join(process.cwd(), "logs", "sessions");
}

function buildActivityReactionSummary(
  records: CompanionVideoCallTraceRecord[],
): CompanionVideoCallTracePacket["activityReactions"] {
  const responseRecords = records.filter(
    (record) => record.eventName === "activity_reaction_response_received",
  );
  const fallbackRecords = records.filter(
    (record) => record.eventName === "activity_reaction_fallback",
  );
  const staleDroppedRecords = records.filter(
    (record) => record.eventName === "activity_reaction_stale_dropped",
  );
  const audioStartRecords = records.filter(
    (record) => record.eventName === "activity_reaction_audio_start",
  );
  const responseKeys = new Set(
    responseRecords.map(
      (record) => record.turnId ?? `${record.timestamp}:${record.responseHash ?? ""}`,
    ),
  );
  const fallbackKeys = new Set(
    fallbackRecords.map((record) => record.turnId ?? `${record.timestamp}:fallback`),
  );
  const aiAuthoredCount = responseKeys.size;
  const fallbackCount = fallbackKeys.size;
  const staleDroppedCount = new Set(
    staleDroppedRecords.map(
      (record) => record.turnId ?? `${record.timestamp}:stale_activity_reaction`,
    ),
  ).size;
  const staleDroppedKeys = new Set(
    staleDroppedRecords.map(
      (record) => record.turnId ?? `${record.timestamp}:stale_activity_reaction`,
    ),
  );
  const audioStartKeys = new Set(
    audioStartRecords.map((record) => record.turnId ?? `${record.timestamp}:audio_start`),
  );
  const spokenCount = [...audioStartKeys].filter((key) => responseKeys.has(key)).length;
  const missingAudioCount = [...responseKeys].filter(
    (key) => !audioStartKeys.has(key) && !fallbackKeys.has(key) && !staleDroppedKeys.has(key),
  ).length;
  if (
    aiAuthoredCount === 0 &&
    fallbackCount === 0 &&
    staleDroppedCount === 0 &&
    spokenCount === 0
  ) {
    return undefined;
  }
  const seenDurationKeys = new Set<string>();
  const responseDurations = responseRecords
    .map((record) => {
      const key = record.turnId ?? `${record.timestamp}:${record.responseHash ?? ""}`;
      if (seenDurationKeys.has(key)) return undefined;
      seenDurationKeys.add(key);
      const direct = record.payload?.requestToResponseMs;
      if (typeof direct === "number" && Number.isFinite(direct)) return direct;
      if (!record.turnId) return undefined;
      const start = records.find(
        (candidate) =>
          candidate.turnId === record.turnId &&
          candidate.eventName === "activity_reaction_request_start",
      );
      return start ? record.timestamp - start.timestamp : undefined;
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averageResponseMs =
    responseDurations.length > 0
      ? Math.round(
          responseDurations.reduce((sum, value) => sum + value, 0) /
            responseDurations.length,
        )
      : undefined;
  return {
    aiAuthoredCount,
    fallbackCount,
    staleDroppedCount,
    spokenCount,
    missingAudioCount,
    ...(averageResponseMs !== undefined && { averageResponseMs }),
  };
}

function safeTraceId(traceId: string): string {
  return traceId.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "trace";
}

function normalizeTraceOrigin(value: unknown): "client" | "server" | undefined {
  return value === "client" || value === "server" ? value : undefined;
}

function traceStamp(timestamp: number): string {
  return new Date(timestamp)
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d{3}Z$/, "Z");
}

function textPreview(value: string): { preview: string; hash: string; length: number } {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return {
    preview: collapsed.slice(0, MAX_PREVIEW_LENGTH),
    hash: crypto.createHash("sha256").update(collapsed.toLowerCase()).digest("hex").slice(0, 16),
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

function textSimilarity(a: string | undefined, b: string | undefined): number | undefined {
  if (!a || !b) return undefined;
  const left = new Set(normalizeWords(a));
  const right = new Set(normalizeWords(b));
  if (left.size === 0 || right.size === 0) return undefined;
  let overlap = 0;
  for (const word of left) {
    if (right.has(word)) overlap += 1;
  }
  return Number((overlap / Math.max(left.size, right.size)).toFixed(3));
}

function responseOverridesConversationIntent(
  record: CompanionVideoCallTraceRecord,
): boolean {
  if (record.eventName !== "talk_response_received") return false;
  const intent = String(record.payload?.conversationIntent ?? "").toLowerCase();
  if (intent !== "social" && intent !== "repeat_after") return false;
  const response = (record.responsePreview ?? "").toLowerCase();
  if (!response) return false;
  return /\b(tic[- ]?tac[- ]?toe|square|board|your turn|place an x|place a mark|game going)\b/.test(
    response,
  );
}

function sanitizePayloadValue(value: unknown, key = ""): unknown {
  if (BLOCKED_PAYLOAD_KEYS.has(key)) return undefined;
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > MAX_PREVIEW_LENGTH) {
      const text = textPreview(value);
      return { preview: text.preview, hash: text.hash, length: text.length };
    }
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizePayloadValue(entry))
      .filter((entry) => entry !== undefined);
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
    const next = sanitizePayloadValue(childValue, childKey);
    if (next !== undefined) out[childKey] = next;
  }
  return out;
}

function textFromPayload(payload: Record<string, unknown> | undefined, keys: string[]): string {
  if (!payload) return "";
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export function normalizeCompanionVideoCallTraceEvent(
  input: CompanionVideoCallTraceEventInput,
): CompanionVideoCallTraceRecord {
  const timestamp =
    typeof input.timestamp === "number" && Number.isFinite(input.timestamp)
      ? input.timestamp
      : Date.now();
  const transcript = textFromPayload(input.payload, ["transcript", "question", "questionText"]);
  const response = textFromPayload(input.payload, ["responseText", "companionText"]);
  const transcriptText = transcript ? textPreview(transcript) : null;
  const responseText = response ? textPreview(response) : null;
  const sanitized = sanitizePayloadValue(input.payload ?? {}) as Record<string, unknown>;
  const echoSimilarity =
    transcript && response ? textSimilarity(transcript, response) : undefined;
  return {
    traceId: safeTraceId(input.traceId),
    ...(input.turnId && { turnId: input.turnId.trim().slice(0, 120) }),
    eventName: input.eventName,
    ...(normalizeTraceOrigin(input.origin) && { origin: normalizeTraceOrigin(input.origin) }),
    ...(input.childId && { childId: input.childId.trim().toLowerCase().slice(0, 80) }),
    ...(input.companionId && { companionId: input.companionId.trim().toLowerCase().slice(0, 80) }),
    ...(input.callSource && { callSource: input.callSource.trim().slice(0, 80) }),
    ...(input.relationshipState && {
      relationshipState: input.relationshipState.trim().slice(0, 80),
    }),
    timestamp,
    recordedAt: new Date().toISOString(),
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
    ...(echoSimilarity !== undefined && { echoSimilarity }),
    ...(Object.keys(sanitized).length > 0 && { payload: sanitized }),
  };
}

function findTraceFolder(rootDir: string, traceId: string): string | null {
  const safeId = safeTraceId(traceId);
  if (!fs.existsSync(rootDir)) return null;
  for (const year of fs.readdirSync(rootDir)) {
    if (!/^\d{4}$/.test(year)) continue;
    const yearDir = path.join(rootDir, year);
    if (!fs.statSync(yearDir).isDirectory()) continue;
    for (const month of fs.readdirSync(yearDir)) {
      if (!/^\d{2}$/.test(month)) continue;
      const monthDir = path.join(yearDir, month);
      if (!fs.statSync(monthDir).isDirectory()) continue;
      for (const folder of fs.readdirSync(monthDir)) {
        if (folder.endsWith(`_showroom_video_call_${safeId}`)) {
          return path.join(monthDir, folder);
        }
      }
    }
  }
  return null;
}

function traceFolderForRecord(rootDir: string, record: CompanionVideoCallTraceRecord): string {
  const existing = findTraceFolder(rootDir, record.traceId);
  if (existing) return existing;
  const date = new Date(record.timestamp);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return path.join(
    rootDir,
    year,
    month,
    `${traceStamp(record.timestamp)}_showroom_video_call_${record.traceId}`,
  );
}

function readTraceRecords(traceFolder: string): CompanionVideoCallTraceRecord[] {
  const file = path.join(traceFolder, "companion-call-trace.ndjson");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CompanionVideoCallTraceRecord)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function likelyCauseForRecords(records: CompanionVideoCallTraceRecord[]): CompanionVideoCallLikelyCause {
  if (
    records.some(
      (record) =>
        record.eventName === "audio_error" &&
        String(record.payload?.reason ?? "")
          .toLowerCase()
          .includes("interrupted by a call to pause") &&
        (record.payload?.activeActivity as { activityId?: unknown } | undefined)?.activityId ===
          "tic_tac_toe",
    )
  ) {
    return "activity_open_interrupted_audio";
  }
  const activityReactions = buildActivityReactionSummary(records);
  if ((activityReactions?.missingAudioCount ?? 0) > 0) {
    return "activity_reaction_missing_audio";
  }
  if (records.some((record) => record.eventName === "activity_reaction_stale_dropped")) {
    return "stale_activity_reaction";
  }
  if (records.some(responseOverridesConversationIntent)) {
    return "game_context_overrode_social_intent";
  }
  if (
    records.some(
      (record) =>
        record.eventName === "echo_suppressed" ||
        (record.eventName === "loop_suspected" &&
          String(record.payload?.reason ?? "").includes("echo")),
    )
  ) {
    return "speech_recognition_echo";
  }
  const transcriptCounts = new Map<string, Set<string>>();
  const responseCounts = new Map<string, Set<string>>();
  for (const record of records) {
    if (record.transcriptHash) {
      const turns = transcriptCounts.get(record.transcriptHash) ?? new Set<string>();
      turns.add(record.turnId ?? `${record.timestamp}:${record.eventName}`);
      transcriptCounts.set(record.transcriptHash, turns);
    }
    if (record.responseHash) {
      const turns = responseCounts.get(record.responseHash) ?? new Set<string>();
      turns.add(record.turnId ?? `${record.timestamp}:${record.eventName}`);
      responseCounts.set(record.responseHash, turns);
    }
  }
  if (
    [...transcriptCounts.values()].some((turns) => turns.size > 1) ||
    [...responseCounts.values()].some((turns) => turns.size > 1)
  ) {
    return "repeated_turn";
  }
  const rearmStarts = records.filter((record) => record.eventName === "handsfree_rearm_starting").length;
  const speechResults = records.filter((record) => record.eventName === "speech_result").length;
  if (rearmStarts > speechResults + 2) return "handsfree_rearm_loop";
  const hasSlowResponse = buildTraceTurns(records).some(
    (turn) => typeof turn.requestToResponseMs === "number" && turn.requestToResponseMs > 5000,
  );
  return hasSlowResponse ? "slow_response" : "none";
}

function buildTraceTurns(records: CompanionVideoCallTraceRecord[]): CompanionVideoCallTraceTurnPacket[] {
  const byTurn = new Map<string, CompanionVideoCallTraceRecord[]>();
  for (const record of records) {
    if (!record.turnId) continue;
    const list = byTurn.get(record.turnId) ?? [];
    list.push(record);
    byTurn.set(record.turnId, list);
  }
  return [...byTurn.entries()].map(([turnId, turnRecords]) => {
    const sorted = turnRecords.sort((a, b) => a.timestamp - b.timestamp);
    const requestStart =
      sorted.find((record) => record.eventName === "talk_request_start") ??
      sorted.find((record) => record.eventName === "speech_result");
    const response = sorted.find((record) => record.eventName === "talk_response_received");
    const audioStart = sorted.find((record) => record.eventName === "audio_play_start");
    const audioEnd = sorted.find((record) => record.eventName === "audio_ended");
    const transcriptRecord = sorted.find((record) => record.transcriptPreview);
    const responseRecord = sorted.find((record) => record.responsePreview);
    return {
      turnId,
      eventNames: sorted.map((record) => record.eventName),
      ...(transcriptRecord?.transcriptPreview && {
        transcriptPreview: transcriptRecord.transcriptPreview,
        transcriptHash: transcriptRecord.transcriptHash,
      }),
      ...(responseRecord?.responsePreview && {
        responsePreview: responseRecord.responsePreview,
        responseHash: responseRecord.responseHash,
      }),
      ...(requestStart &&
        response && {
          requestToResponseMs: response.timestamp - requestStart.timestamp,
        }),
      ...(audioStart &&
        audioEnd && {
          audioMs: audioEnd.timestamp - audioStart.timestamp,
        }),
      ...(sorted.some((record) => record.eventName === "loop_suspected") && {
        loopSuspected: true,
      }),
    };
  });
}

export function buildCompanionVideoCallTracePacket(
  records: CompanionVideoCallTraceRecord[],
): CompanionVideoCallTracePacket {
  const ordered = [...records].sort((a, b) => a.timestamp - b.timestamp);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const likelyCause = likelyCauseForRecords(ordered);
  const lastActivity = [...ordered]
    .reverse()
    .find((record) => record.payload?.activeActivity)?.payload?.activeActivity;
  const activityReactions = buildActivityReactionSummary(ordered);
  const loopCause =
    likelyCause === "speech_recognition_echo" ||
    likelyCause === "repeated_turn" ||
    likelyCause === "handsfree_rearm_loop";
  return {
    traceId: first?.traceId ?? "unknown",
    ...(first?.childId && { childId: first.childId }),
    ...(first?.companionId && { companionId: first.companionId }),
    ...(first?.callSource && { callSource: first.callSource }),
    ...(first?.relationshipState && { relationshipState: first.relationshipState }),
    ...(first && { startedAt: new Date(first.timestamp).toISOString() }),
    ...(last?.eventName === "call_ended" && { endedAt: new Date(last.timestamp).toISOString() }),
    eventCount: ordered.length,
    loopSuspected:
      loopCause || ordered.some((record) => record.eventName === "loop_suspected"),
    likelyCause,
    ...(lastActivity !== undefined ? { activeTicTacToeState: lastActivity } : {}),
    ...(activityReactions && { activityReactions }),
    eventOrder: ordered.map((record) => ({
      eventName: record.eventName,
      ...(record.origin && { origin: record.origin }),
      ...(record.turnId && { turnId: record.turnId }),
      timestamp: record.timestamp,
      ...(record.transcriptPreview && { transcriptPreview: record.transcriptPreview }),
      ...(record.responsePreview && { responsePreview: record.responsePreview }),
      ...(record.echoSimilarity !== undefined && { echoSimilarity: record.echoSimilarity }),
    })),
    turns: buildTraceTurns(ordered),
  };
}

function writeSummary(traceFolder: string, records: CompanionVideoCallTraceRecord[]): void {
  const packet = buildCompanionVideoCallTracePacket(records);
  fs.writeFileSync(
    path.join(traceFolder, "trace-summary.json"),
    `${JSON.stringify(packet, null, 2)}\n`,
    "utf8",
  );
}

function ensureUploadStatus(traceFolder: string): void {
  const statusFile = path.join(traceFolder, "upload-status.json");
  if (fs.existsSync(statusFile)) return;
  fs.writeFileSync(
    statusFile,
    `${JSON.stringify(
      {
        uploaded: false,
        message: "Pending upload to sunny-logs repository.",
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export function recordCompanionVideoCallTraceEvent(
  input: CompanionVideoCallTraceEventInput,
  options: { rootDir?: string } = {},
): CompanionVideoCallTraceRecord {
  const rootDir = path.resolve(options.rootDir ?? defaultTraceRoot());
  const record = normalizeCompanionVideoCallTraceEvent(input);
  const traceFolder = traceFolderForRecord(rootDir, record);
  fs.mkdirSync(traceFolder, { recursive: true });
  const traceFile = path.join(traceFolder, "companion-call-trace.ndjson");
  fs.appendFileSync(traceFile, `${JSON.stringify(record)}\n`, "utf8");
  ensureUploadStatus(traceFolder);
  writeSummary(traceFolder, readTraceRecords(traceFolder));
  return record;
}

export function readCompanionVideoCallTracePacket(
  traceId: string,
  options: { rootDir?: string } = {},
): CompanionVideoCallTracePacket {
  const rootDir = path.resolve(options.rootDir ?? defaultTraceRoot());
  const traceFolder = findTraceFolder(rootDir, traceId);
  if (!traceFolder) {
    throw new Error(`trace_not_found:${safeTraceId(traceId)}`);
  }
  return buildCompanionVideoCallTracePacket(readTraceRecords(traceFolder));
}
