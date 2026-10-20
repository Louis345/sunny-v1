/**
 * Per-turn voice latency stamps: child end-of-turn (or a system request such as
 * the session opening) → response start → Claude → ElevenLabs → first audio.
 * Logging only; never changes turn behavior, and never throws into a turn.
 */

export type VoiceTurnSource = "eager" | "eager_promoted" | "final" | "system";
export type VoiceLatencyMark =
  | "response_start"
  | "model_request"
  | "model_first_token"
  | "tts_first_text"
  | "tts_first_audio";
export type VoiceTurnOutcome = "first_audio" | "superseded" | "cancelled";

export type VoiceTurnLatencySpans = {
  endOfTurnToResponseStart?: number;
  responseStartToModelRequest?: number;
  modelRequestToFirstToken?: number;
  firstTokenToTtsText?: number;
  ttsTextToFirstAudio?: number;
  endOfTurnToFirstAudio?: number;
};

export type VoiceTurnLatencyRecord = {
  turnId: number;
  source: VoiceTurnSource;
  outcome: VoiceTurnOutcome;
  reason?: string;
  /** How long a held eager end-of-turn led the final one (companion conversation). */
  heldEagerLeadMs?: number;
  /** Model steps that called tools before Elli's first spoken token. */
  toolStepsBeforeFirstToken?: number;
  /** Offsets from end-of-turn, in ms. */
  marksMs: Partial<Record<VoiceLatencyMark, number>>;
  spansMs: VoiceTurnLatencySpans;
};

type ActiveTurn = {
  turnId: number;
  source: VoiceTurnSource;
  startedAt: number;
  heldEagerLeadMs?: number;
  toolSteps: number;
  marksMs: Partial<Record<VoiceLatencyMark, number>>;
};

const EAGER_HOLD_WINDOW_MS = 3000;

function span(from: number | undefined, to: number | undefined): number | undefined {
  return from === undefined || to === undefined ? undefined : to - from;
}

export class VoiceTurnLatencyTracker {
  private readonly now: () => number;
  private readonly emit: (record: VoiceTurnLatencyRecord) => void;
  private active: ActiveTurn | null = null;
  private eagerHeldAt: number | null = null;
  private nextTurnId = 1;

  constructor(opts: {
    emit: (record: VoiceTurnLatencyRecord) => void;
    now?: () => number;
  }) {
    this.emit = opts.emit;
    this.now = opts.now ?? Date.now;
  }

  noteEagerHeld(): void {
    this.eagerHeldAt = this.now();
  }

  startTurn(source: VoiceTurnSource): void {
    if (this.active) this.finish("superseded");
    const startedAt = this.now();
    const heldEagerLeadMs =
      this.eagerHeldAt !== null && startedAt - this.eagerHeldAt <= EAGER_HOLD_WINDOW_MS
        ? startedAt - this.eagerHeldAt
        : undefined;
    this.eagerHeldAt = null;
    this.active = {
      turnId: this.nextTurnId++,
      source,
      startedAt,
      heldEagerLeadMs,
      toolSteps: 0,
      marksMs: {},
    };
  }

  /**
   * Elli was asked to respond. The child's turn owns its first response; any
   * other response (opening, activity start, a second reply) is a system turn.
   */
  beginResponse(): void {
    if (!this.active || this.active.marksMs.response_start !== undefined) {
      this.startTurn("system");
    }
    this.mark("response_start");
  }

  noteToolStep(toolCallCount: number): void {
    const turn = this.active;
    if (turn && toolCallCount > 0 && turn.marksMs.model_first_token === undefined) {
      turn.toolSteps += 1;
    }
  }

  mark(name: VoiceLatencyMark): void {
    const turn = this.active;
    if (!turn || turn.marksMs[name] !== undefined) return;
    turn.marksMs[name] = this.now() - turn.startedAt;
    if (name === "tts_first_audio") this.finish("first_audio");
  }

  cancelTurn(reason: string): void {
    if (this.active) this.finish("cancelled", reason);
  }

  private finish(outcome: VoiceTurnOutcome, reason?: string): void {
    const turn = this.active;
    if (!turn) return;
    this.active = null;
    const m = turn.marksMs;
    const record: VoiceTurnLatencyRecord = {
      turnId: turn.turnId,
      source: turn.source,
      outcome,
      toolStepsBeforeFirstToken: turn.toolSteps,
      marksMs: { ...m },
      spansMs: {
        endOfTurnToResponseStart: m.response_start,
        responseStartToModelRequest: span(m.response_start, m.model_request),
        modelRequestToFirstToken: span(m.model_request, m.model_first_token),
        firstTokenToTtsText: span(m.model_first_token, m.tts_first_text),
        ttsTextToFirstAudio: span(m.tts_first_text, m.tts_first_audio),
        endOfTurnToFirstAudio: m.tts_first_audio,
      },
    };
    if (reason) record.reason = reason;
    if (turn.heldEagerLeadMs !== undefined) record.heldEagerLeadMs = turn.heldEagerLeadMs;
    try {
      this.emit(record);
    } catch (error) {
      // Measurement must never break a child's turn; say so and move on.
      console.warn(
        ` 🎮 [latency] [emit_failed] turn=${record.turnId} ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export function formatVoiceTurnLatencyLog(record: VoiceTurnLatencyRecord): string {
  const parts = [`turn=${record.turnId}`, `source=${record.source}`];
  if (record.spansMs.endOfTurnToFirstAudio !== undefined) {
    parts.push(`eot_to_first_audio=${record.spansMs.endOfTurnToFirstAudio}ms`);
  }
  for (const [name, ms] of Object.entries(record.marksMs)) {
    parts.push(`${name}=${ms}ms`);
  }
  parts.push(`tool_steps=${record.toolStepsBeforeFirstToken ?? 0}`);
  if (record.heldEagerLeadMs !== undefined) {
    parts.push(`held_eager_lead=${record.heldEagerLeadMs}ms`);
  }
  if (record.reason) parts.push(`reason=${record.reason}`);
  return ` 🎮 [latency] [turn_${record.outcome}] ${parts.join(" ")}`;
}

/** Tracker that logs each turn (Law 5) and hands the record to the session packet. */
export function createLoggedVoiceTurnLatency(
  record: (record: VoiceTurnLatencyRecord) => void,
): VoiceTurnLatencyTracker {
  return new VoiceTurnLatencyTracker({
    emit: (r) => {
      console.log(formatVoiceTurnLatencyLog(r));
      record(r);
    },
  });
}

// --- Report ---

export type LatencyStat = { count: number; p50: number; p95: number };

export type VoiceTurnLatencySummary = {
  turns: Partial<Record<VoiceTurnOutcome, number>>;
  spans: Partial<Record<keyof VoiceTurnLatencySpans, LatencyStat>>;
  heldEagerLeadMs?: LatencyStat;
  toolStepsBeforeFirstToken?: LatencyStat;
  /** The session's first spoken response — the "Elli warming up" moment. */
  firstResponse?: {
    turnId: number;
    source: VoiceTurnSource;
    endOfTurnToFirstAudio?: number;
    toolStepsBeforeFirstToken: number;
  };
};

const SPAN_LABELS: Array<[keyof VoiceTurnLatencySpans, string]> = [
  ["endOfTurnToFirstAudio", "End of turn → first audio"],
  ["endOfTurnToResponseStart", "End of turn → Elli asked to respond"],
  ["responseStartToModelRequest", "Elli asked → Claude request (context prep)"],
  ["modelRequestToFirstToken", "Claude request → first token"],
  ["firstTokenToTtsText", "First token → text sent to ElevenLabs"],
  ["ttsTextToFirstAudio", "ElevenLabs text → first audio"],
];

/** Nearest-rank percentile. */
function percentile(sorted: number[], ratio: number): number {
  return sorted[Math.max(0, Math.ceil(ratio * sorted.length) - 1)];
}

function stat(values: number[]): LatencyStat | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95) };
}

export function readVoiceTurnLatencyRecords(ndjson: string): VoiceTurnLatencyRecord[] {
  const records: VoiceTurnLatencyRecord[] = [];
  for (const line of ndjson.split("\n")) {
    if (!line.trim()) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // Partial line from a crashed session packet — skip it, but say so.
      console.warn(" 🎮 [latency] [report_line_skipped] reason=invalid_json");
      continue;
    }
    if (event.component === "latency" && event.action === "turn") {
      records.push(event as unknown as VoiceTurnLatencyRecord);
    }
  }
  return records;
}

export function summarizeVoiceTurnLatency(
  records: VoiceTurnLatencyRecord[],
): VoiceTurnLatencySummary {
  const turns: VoiceTurnLatencySummary["turns"] = {};
  for (const r of records) turns[r.outcome] = (turns[r.outcome] ?? 0) + 1;

  const completed = records.filter((r) => r.outcome === "first_audio");
  const spans: VoiceTurnLatencySummary["spans"] = {};
  for (const [key] of SPAN_LABELS) {
    const s = stat(
      completed.map((r) => r.spansMs[key]).filter((v): v is number => typeof v === "number"),
    );
    if (s) spans[key] = s;
  }

  const summary: VoiceTurnLatencySummary = { turns, spans };
  const held = stat(
    completed.map((r) => r.heldEagerLeadMs).filter((v): v is number => typeof v === "number"),
  );
  if (held) summary.heldEagerLeadMs = held;
  const toolSteps = stat(completed.map((r) => r.toolStepsBeforeFirstToken ?? 0));
  if (toolSteps) summary.toolStepsBeforeFirstToken = toolSteps;
  const first = [...completed].sort((a, b) => a.turnId - b.turnId)[0];
  if (first) {
    summary.firstResponse = {
      turnId: first.turnId,
      source: first.source,
      endOfTurnToFirstAudio: first.spansMs.endOfTurnToFirstAudio,
      toolStepsBeforeFirstToken: first.toolStepsBeforeFirstToken ?? 0,
    };
  }
  return summary;
}

export function formatVoiceTurnLatencyReport(
  summary: VoiceTurnLatencySummary,
  label: string,
): string {
  const lines = [
    `# Voice Turn Latency: ${label}`,
    "",
    `Turns: ${Object.entries(summary.turns)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ") || "none"}`,
  ];
  const first = summary.firstResponse;
  if (first) {
    lines.push(
      `First response: ${first.endOfTurnToFirstAudio ?? "?"}ms (source=${first.source}, tool steps before first word=${first.toolStepsBeforeFirstToken})`,
    );
  }
  lines.push(
    "",
    "| Span | Count | p50 ms | p95 ms |",
    "| --- | --- | --- | --- |",
  );
  for (const [key, label] of SPAN_LABELS) {
    const s = summary.spans[key];
    if (s) lines.push(`| ${label} | ${s.count} | ${s.p50} | ${s.p95} |`);
  }
  if (summary.heldEagerLeadMs) {
    const s = summary.heldEagerLeadMs;
    lines.push(`| Held eager lead (potential savings) | ${s.count} | ${s.p50} | ${s.p95} |`);
  }
  if (summary.toolStepsBeforeFirstToken) {
    const s = summary.toolStepsBeforeFirstToken;
    lines.push(`| Tool steps before first word (count, not ms) | ${s.count} | ${s.p50} | ${s.p95} |`);
  }
  return `${lines.join("\n")}\n`;
}
