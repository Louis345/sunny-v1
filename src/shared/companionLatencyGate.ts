export type CompanionLatencyMode = "claude" | "presence";

export type CompanionLatencyMetric =
  | "first_visible_feedback"
  | "presence_reaction_audio"
  | "claude_social_response"
  | "move_rhythm"
  | "trace_blocker";

export type CompanionLatencySpan = {
  type: "companion_latency_span";
  scenarioId: string;
  traceId: string;
  mode: CompanionLatencyMode;
  metric: CompanionLatencyMetric;
  durationMs: number;
  turnId?: string;
  reactionLane?: "claude" | "presence";
  eventType?: string;
  likelyCause?: string;
};

export type CompanionLatencyThresholds = {
  firstVisibleFeedbackMaxMs: number;
  presenceReactionAudioP95MaxMs: number;
  claudeSocialResponseP95MaxMs: number;
  moveRhythmMinMs: number;
  moveRhythmMaxMs: number;
};

export type CompanionLatencyGateFailure = {
  code: string;
  message: string;
  evidence: string;
};

export type CompanionLatencyAggregate = {
  mode: CompanionLatencyMode;
  metric: CompanionLatencyMetric;
  count: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
};

export type CompanionLatencyGateResult = {
  readyForHumanReview: boolean;
  aggregates: CompanionLatencyAggregate[];
  failures: CompanionLatencyGateFailure[];
  thresholds: CompanionLatencyThresholds;
};

type TraceEvent = {
  eventName: string;
  timestamp: number;
  turnId?: string;
  payload?: Record<string, unknown>;
};

type TraceTurn = {
  turnId: string;
  eventNames: string[];
  conversationIntent?: string;
  requestToResponseMs?: number;
  transcriptPreview?: string;
  responsePreview?: string;
};

export type CompanionLatencyTracePacket = {
  traceId: string;
  likelyCause: string;
  eventCount: number;
  loopSuspected: boolean;
  activityReactions?: {
    aiAuthoredCount: number;
    presenceCount: number;
    fallbackCount: number;
    staleDroppedCount: number;
    spokenCount: number;
    missingAudioCount: number;
    averageResponseMs?: number;
    averagePresenceResponseMs?: number;
  };
  eventOrder: TraceEvent[];
  turns: TraceTurn[];
};

export const DEFAULT_COMPANION_LATENCY_THRESHOLDS: CompanionLatencyThresholds = {
  firstVisibleFeedbackMaxMs: 200,
  presenceReactionAudioP95MaxMs: 1_500,
  claudeSocialResponseP95MaxMs: 6_500,
  moveRhythmMinMs: 900,
  moveRhythmMaxMs: 1_800,
};

const BLOCKING_LIKELY_CAUSES = new Set([
  "speech_recognition_echo",
  "stale_activity_reaction",
  "activity_reaction_missing_audio",
  "activity_open_interrupted_audio",
  "game_context_overrode_social_intent",
  "repeated_turn",
  "handsfree_rearm_loop",
  "spoken_presence_not_ai_authored",
  "active_activity_context_omitted",
  "active_game_context_lost_response",
  "hardcoded_companion_game_speech",
]);

const FAILURE_CODE_BY_CAUSE: Record<string, string> = {
  spoken_presence_not_ai_authored: "companion_reaction_not_ai_authored",
  hardcoded_companion_game_speech: "hardcoded_companion_game_speech",
  active_activity_context_omitted: "active_activity_context_omitted",
  active_game_context_lost_response: "active_game_context_lost_response",
};

const HARDCODED_COMPANION_GAME_SPEECH = new Set([
  "ready. you first.",
  "i blocked it.",
  "nice block. i felt it.",
  "great win. you got me.",
  "i found three.",
  "good game.",
  "my move. your turn.",
  "ooo, interesting move.",
]);

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

function round(value: number): number {
  return Math.round(value);
}

function isFiniteDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function aggregateCompanionLatencySpans(
  spans: CompanionLatencySpan[],
): CompanionLatencyAggregate[] {
  const buckets = new Map<string, CompanionLatencySpan[]>();
  for (const span of spans) {
    if (span.metric === "trace_blocker") continue;
    const key = `${span.mode}:${span.metric}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(span);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map((bucket) => {
    const values = bucket.map((span) => span.durationMs);
    const first = bucket[0];
    return {
      mode: first.mode,
      metric: first.metric,
      count: bucket.length,
      p50Ms: percentile(values, 50),
      p95Ms: percentile(values, 95),
      minMs: Math.min(...values),
      maxMs: Math.max(...values),
    };
  });
}

function aggregateFor(
  aggregates: CompanionLatencyAggregate[],
  mode: CompanionLatencyMode,
  metric: CompanionLatencyMetric,
): CompanionLatencyAggregate | undefined {
  return aggregates.find((aggregate) => aggregate.mode === mode && aggregate.metric === metric);
}

export function evaluateCompanionLatencyGate(
  spans: CompanionLatencySpan[],
  thresholds: CompanionLatencyThresholds = DEFAULT_COMPANION_LATENCY_THRESHOLDS,
): CompanionLatencyGateResult {
  const aggregates = aggregateCompanionLatencySpans(spans);
  const failures: CompanionLatencyGateFailure[] = [];

  const traceBlockers = spans.filter(
    (span) => span.metric === "trace_blocker" && span.likelyCause && span.likelyCause !== "none",
  );
  for (const blocker of traceBlockers) {
    const code = FAILURE_CODE_BY_CAUSE[blocker.likelyCause ?? ""] ?? "companion_trace_blocker";
    failures.push({
      code,
      message: "Companion trace contains a blocker that should stop human testing.",
      evidence: `traceId=${blocker.traceId} mode=${blocker.mode} likelyCause=${blocker.likelyCause}`,
    });
  }

  for (const authoredBlocker of spans.filter(
    (span) => span.likelyCause === "spoken_presence_not_ai_authored",
  )) {
    if (failures.some((failure) => failure.evidence.includes(authoredBlocker.traceId))) continue;
    failures.push({
      code: "companion_reaction_not_ai_authored",
      message: "Spoken companion game reactions must be AI-authored or silent.",
      evidence: `traceId=${authoredBlocker.traceId} mode=${authoredBlocker.mode}`,
    });
  }

  const hasPresenceReaction = spans.some((span) => span.metric === "presence_reaction_audio");
  if (!hasPresenceReaction) {
    failures.push({
      code: "companion_latency_insufficient_evidence",
      message: "The lab did not capture a playable presence reaction, so human review would be premature.",
      evidence: "missing metric=presence_reaction_audio",
    });
  }

  const firstVisible = aggregateFor(aggregates, "presence", "first_visible_feedback");
  if (firstVisible && firstVisible.p95Ms > thresholds.firstVisibleFeedbackMaxMs) {
    failures.push({
      code: "first_visible_feedback_slow",
      message: "The call did not give visible feedback fast enough after opening.",
      evidence: `p95Ms=${firstVisible.p95Ms} max=${thresholds.firstVisibleFeedbackMaxMs} count=${firstVisible.count}`,
    });
  }

  const presenceReaction = aggregateFor(aggregates, "presence", "presence_reaction_audio");
  if (
    presenceReaction &&
    presenceReaction.p95Ms > thresholds.presenceReactionAudioP95MaxMs
  ) {
    failures.push({
      code: "presence_reaction_audio_p95_slow",
      message: "Presence-lane game reactions are too slow for a product-demo handoff.",
      evidence: `p95Ms=${presenceReaction.p95Ms} max=${thresholds.presenceReactionAudioP95MaxMs} count=${presenceReaction.count}`,
    });
  }

  const claudeSocial = aggregateFor(aggregates, "claude", "claude_social_response");
  if (claudeSocial && claudeSocial.p95Ms > thresholds.claudeSocialResponseP95MaxMs) {
    failures.push({
      code: "claude_social_response_p95_slow",
      message: "Claude social turns are too slow for a human review pass.",
      evidence: `p95Ms=${claudeSocial.p95Ms} max=${thresholds.claudeSocialResponseP95MaxMs} count=${claudeSocial.count}`,
    });
  }

  for (const aggregate of aggregates.filter((item) => item.metric === "move_rhythm")) {
    if (aggregate.minMs < thresholds.moveRhythmMinMs || aggregate.maxMs > thresholds.moveRhythmMaxMs) {
      failures.push({
        code: "tic_tac_toe_move_rhythm_outside_window",
        message: "Tic-tac-toe move rhythm does not feel like intentional thought.",
        evidence: `mode=${aggregate.mode} minMs=${aggregate.minMs} maxMs=${aggregate.maxMs} target=${thresholds.moveRhythmMinMs}-${thresholds.moveRhythmMaxMs}`,
      });
    }
  }

  return {
    readyForHumanReview: failures.length === 0,
    aggregates,
    failures,
    thresholds,
  };
}

function firstEvent(events: TraceEvent[], eventName: string): TraceEvent | undefined {
  return events.find((event) => event.eventName === eventName);
}

function eventsByTurn(events: TraceEvent[], eventName: string): Map<string, TraceEvent[]> {
  const map = new Map<string, TraceEvent[]>();
  for (const event of events) {
    if (event.eventName !== eventName || !event.turnId) continue;
    const list = map.get(event.turnId) ?? [];
    list.push(event);
    map.set(event.turnId, list);
  }
  return map;
}

const GAME_LAUNCH_TRANSCRIPT_PATTERN =
  /\b(play|start|open|let'?s|lets|let us)\b.*\b(tic[- ]?tac[- ]?toe|game|board)\b|\b(tic[- ]?tac[- ]?toe)\b.*\b(play|start|open|game)\b/i;

function isClaudeSocialLatencyTurn(turn: TraceTurn): boolean {
  if (!turn.eventNames.includes("talk_response_received")) return false;
  const intent = turn.conversationIntent?.toLowerCase();
  if (intent) {
    return intent === "social" || intent === "repeat_after" || intent === "visual";
  }
  if (turn.transcriptPreview && GAME_LAUNCH_TRANSCRIPT_PATTERN.test(turn.transcriptPreview)) {
    return false;
  }
  return true;
}

function activeActivityFromPayload(payload: Record<string, unknown> | undefined): Record<string, unknown> | null {
  const direct =
    payload?.activeActivity && typeof payload.activeActivity === "object"
      ? (payload.activeActivity as Record<string, unknown>)
      : null;
  if (direct?.activityId === "tic_tac_toe" && direct.status === "active") return direct;
  if (payload?.activityId === "tic_tac_toe" && payload.status === "active") return payload;
  return null;
}

function responsePreviewFromEvent(event: TraceEvent): string {
  const direct = event.payload?.responsePreview;
  return typeof direct === "string" ? direct : "";
}

function hasLostActiveGameLanguage(text: string): boolean {
  return /\b(another round|where were we|start (tic[- ]?tac[- ]?toe|the game)|play (tic[- ]?tac[- ]?toe|again))\b/i.test(
    text,
  );
}

function pushTraceBlocker(input: {
  spans: CompanionLatencySpan[];
  scenarioId: string;
  traceId: string;
  mode: CompanionLatencyMode;
  likelyCause: string;
  turnId?: string;
}) {
  input.spans.push({
    type: "companion_latency_span",
    scenarioId: input.scenarioId,
    traceId: input.traceId,
    mode: input.mode,
    metric: "trace_blocker",
    durationMs: 0,
    likelyCause: input.likelyCause,
    ...(input.turnId && { turnId: input.turnId }),
  });
}

export function companionTracePacketToLatencySpans(
  packet: CompanionLatencyTracePacket,
  options: { mode: CompanionLatencyMode; scenarioId: string },
): CompanionLatencySpan[] {
  const spans: CompanionLatencySpan[] = [];
  const traceId = packet.traceId;
  const ordered = [...packet.eventOrder].sort((a, b) => a.timestamp - b.timestamp);
  const callStarted = firstEvent(ordered, "call_started");
  const firstFeedback =
    firstEvent(ordered, "call_greeting_audio_start") ??
    firstEvent(ordered, "call_greeting_selected") ??
    firstEvent(ordered, "call_greeting_skipped");
  if (callStarted && firstFeedback && firstFeedback.timestamp >= callStarted.timestamp) {
    spans.push({
      type: "companion_latency_span",
      scenarioId: options.scenarioId,
      traceId,
      mode: options.mode,
      metric: "first_visible_feedback",
      durationMs: round(firstFeedback.timestamp - callStarted.timestamp),
    });
  }

  const reactionStarts = eventsByTurn(ordered, "activity_reaction_request_start");
  const reactionAudioStarts = eventsByTurn(ordered, "activity_reaction_audio_start");
  for (const [turnId, starts] of reactionStarts.entries()) {
    const start = starts[0];
    const audioStart = reactionAudioStarts.get(turnId)?.[0];
    if (!start || !audioStart || audioStart.timestamp < start.timestamp) continue;
    spans.push({
      type: "companion_latency_span",
      scenarioId: options.scenarioId,
      traceId,
      mode: options.mode,
      metric:
        options.mode === "presence" ? "presence_reaction_audio" : "claude_social_response",
      durationMs: round(audioStart.timestamp - start.timestamp),
      turnId,
      reactionLane: options.mode,
    });
  }

  const companionMoveEvents = ordered.filter(
    (event) =>
      event.eventName === "activity_context_changed" &&
      event.payload?.type === "companion_tic_tac_toe_companion_move" &&
      isFiniteDuration(event.payload?.decisionLatencyMs),
  );
  for (const event of companionMoveEvents) {
    spans.push({
      type: "companion_latency_span",
      scenarioId: options.scenarioId,
      traceId,
      mode: options.mode,
      metric: "move_rhythm",
      durationMs: round(event.payload!.decisionLatencyMs as number),
    });
  }

  for (const turn of packet.turns) {
    if (!isFiniteDuration(turn.requestToResponseMs)) continue;
    if (!isClaudeSocialLatencyTurn(turn)) continue;
    spans.push({
      type: "companion_latency_span",
      scenarioId: options.scenarioId,
      traceId,
      mode: "claude",
      metric: "claude_social_response",
      durationMs: round(turn.requestToResponseMs),
      turnId: turn.turnId,
    });
  }

  const reactions = packet.activityReactions;
  if (reactions && reactions.spokenCount > 0 && reactions.aiAuthoredCount < reactions.spokenCount) {
    pushTraceBlocker({
      spans,
      scenarioId: options.scenarioId,
      traceId,
      mode: options.mode,
      likelyCause: "spoken_presence_not_ai_authored",
    });
  }

  for (const event of ordered) {
    if (event.eventName !== "activity_reaction_response_received") continue;
    const response = responsePreviewFromEvent(event).trim().toLowerCase();
    const aiAuthored = event.payload?.aiAuthored === true;
    if (!aiAuthored && HARDCODED_COMPANION_GAME_SPEECH.has(response)) {
      pushTraceBlocker({
        spans,
        scenarioId: options.scenarioId,
        traceId,
        mode: options.mode,
        likelyCause: "hardcoded_companion_game_speech",
        turnId: event.turnId,
      });
    }
  }

  const eventsGroupedByTurn = new Map<string, TraceEvent[]>();
  for (const event of ordered) {
    if (!event.turnId) continue;
    const bucket = eventsGroupedByTurn.get(event.turnId) ?? [];
    bucket.push(event);
    eventsGroupedByTurn.set(event.turnId, bucket);
  }
  for (const [turnId, turnEvents] of eventsGroupedByTurn.entries()) {
    const activeDuringTurn = turnEvents.some((event) =>
      Boolean(activeActivityFromPayload(event.payload)),
    );
    if (!activeDuringTurn) continue;
    const request = turnEvents.find(
      (event) => event.eventName === "talk_request_start" && event.payload,
    );
    if (request?.payload?.activeActivityIncluded === false) {
      pushTraceBlocker({
        spans,
        scenarioId: options.scenarioId,
        traceId,
        mode: options.mode,
        likelyCause: "active_activity_context_omitted",
        turnId,
      });
    }
    const lostResponse = turnEvents.find(
      (event) =>
        event.eventName === "talk_response_received" &&
        hasLostActiveGameLanguage(responsePreviewFromEvent(event)),
    );
    if (lostResponse) {
      pushTraceBlocker({
        spans,
        scenarioId: options.scenarioId,
        traceId,
        mode: options.mode,
        likelyCause: "active_game_context_lost_response",
        turnId,
      });
    }
  }

  if (
    packet.loopSuspected ||
    BLOCKING_LIKELY_CAUSES.has(packet.likelyCause) ||
    (reactions?.staleDroppedCount ?? 0) > 0 ||
    (reactions?.missingAudioCount ?? 0) > 0 ||
    (reactions?.fallbackCount ?? 0) > 0
  ) {
    spans.push({
      type: "companion_latency_span",
      scenarioId: options.scenarioId,
      traceId,
      mode: options.mode,
      metric: "trace_blocker",
      durationMs: 0,
      likelyCause: packet.likelyCause || "unknown",
    });
  }

  if (
    options.mode === "presence" &&
    reactions?.averagePresenceResponseMs !== undefined &&
    !spans.some((span) => span.metric === "presence_reaction_audio")
  ) {
    spans.push({
      type: "companion_latency_span",
      scenarioId: options.scenarioId,
      traceId,
      mode: "presence",
      metric: "presence_reaction_audio",
      durationMs: round(reactions.averagePresenceResponseMs),
      reactionLane: "presence",
    });
  }

  return spans;
}

export function buildCompanionLatencyHumanReviewMarkdown(input: {
  result: CompanionLatencyGateResult;
  testUrl: string;
  traceUrls: string[];
  labDir: string;
}): string {
  const lines = [
    "# Companion Latency Lab",
    "",
    `ready_for_human_review: ${input.result.readyForHumanReview ? "true" : "false"}`,
    "",
    `Test URL: ${input.testUrl}`,
    `Lab directory: ${input.labDir}`,
    "",
    "## Trace Links",
    ...(input.traceUrls.length > 0 ? input.traceUrls.map((url) => `- ${url}`) : ["- none"]),
    "",
    "## Aggregates",
    ...input.result.aggregates.map(
      (aggregate) =>
        `- ${aggregate.mode}/${aggregate.metric}: count=${aggregate.count} p50=${aggregate.p50Ms}ms p95=${aggregate.p95Ms}ms min=${aggregate.minMs}ms max=${aggregate.maxMs}ms`,
    ),
    "",
    "## Failures",
    ...(input.result.failures.length > 0
      ? input.result.failures.map(
          (failure) => `- ${failure.code}: ${failure.message} (${failure.evidence})`,
        )
      : ["- none"]),
    "",
    "## Human Check",
    "- Does the first reaction feel immediate?",
    "- Does tic-tac-toe feel like Elli is thinking, not lagging?",
    "- Does normal conversation stay social instead of getting pulled back into the game?",
    "",
  ];
  return `${lines.join("\n")}\n`;
}
