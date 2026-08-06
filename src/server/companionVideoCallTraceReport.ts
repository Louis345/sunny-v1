import type { CompanionVideoCallTraceRecord } from "./companionVideoCallTrace";

export type CompanionVideoCallTraceScoreReport = {
  traceId: string;
  childId?: string;
  companionId?: string;
  readyForHumanReview: boolean;
  decision: "PASS" | "FAIL";
  likelyCause: string;
  metrics: {
    socialResponseCount: number;
    socialResponseP50Ms?: number;
    socialResponseP95Ms?: number;
    socialResponseAverageMs?: number;
    socialFirstAudioP95Ms?: number;
    socialFirstAudioAverageMs?: number;
    activityResponseCount: number;
    activityResponseP95Ms?: number;
    activityResponseAverageMs?: number;
    activityAiAuthoredCount: number;
    activitySpokenCount: number;
    activityStaleDroppedCount: number;
    activityMissingAudioCount: number;
    activityFallbackCount: number;
    activityUsefulSpeechRate: number;
    movePacketRequestedCount: number;
    movePacketArrivedCount: number;
    movePacketTimeoutCount: number;
    movePacketP95Ms?: number;
    averageClaudeMs?: number;
    averageToolFollowupMs?: number;
    averageTtsMs?: number;
  };
  blockers: string[];
  strengths: string[];
};

type LatencySpans = {
  claudeMs?: number;
  toolFollowupMs?: number;
  ttsMs?: number;
  firstAudioMs?: number;
  requestToResponseMs?: number;
};

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function round(value: number): number {
  return Math.round(value);
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values: number[], ratio: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.max(0, index)];
}

function uniqueTurnKeys(records: CompanionVideoCallTraceRecord[]): Set<string> {
  return new Set(records.map((record) => record.turnId ?? `${record.timestamp}:${record.eventName}`));
}

function latencySpans(record: CompanionVideoCallTraceRecord): LatencySpans {
  const raw = record.payload?.latencySpans;
  if (!raw || typeof raw !== "object") return {};
  const spans = raw as Record<string, unknown>;
  return {
    claudeMs: finiteNumber(spans.claudeMs),
    toolFollowupMs: finiteNumber(spans.toolFollowupMs),
    ttsMs: finiteNumber(spans.ttsMs),
    firstAudioMs: finiteNumber(spans.firstAudioMs),
    requestToResponseMs: finiteNumber(spans.requestToResponseMs),
  };
}

function responseLatencyMs(record: CompanionVideoCallTraceRecord): number | undefined {
  const direct = finiteNumber(record.payload?.requestToResponseMs);
  return direct ?? latencySpans(record).requestToResponseMs;
}

function isActivityResponse(record: CompanionVideoCallTraceRecord): boolean {
  return record.eventName === "activity_reaction_response_received";
}

function isSocialTalkResponse(record: CompanionVideoCallTraceRecord): boolean {
  return (
    record.eventName === "talk_response_received" &&
    String(record.payload?.conversationIntent ?? "").toLowerCase() !== "game"
  );
}

function likelyCause(blockers: string[]): string {
  if (blockers.some((blocker) => blocker.includes("stale"))) return "stale_activity_reaction";
  if (blockers.some((blocker) => blocker.includes("audio"))) return "activity_reaction_missing_audio";
  if (blockers.some((blocker) => blocker.includes("latency"))) return "slow_response";
  return "none";
}

export function buildCompanionVideoCallTraceScoreReport(
  records: CompanionVideoCallTraceRecord[],
): CompanionVideoCallTraceScoreReport {
  const ordered = [...records].sort((a, b) => a.timestamp - b.timestamp);
  const first = ordered[0];
  const socialResponses = ordered.filter(isSocialTalkResponse);
  const activityResponses = ordered.filter(isActivityResponse);
  const socialLatencies = socialResponses
    .map(responseLatencyMs)
    .filter((value): value is number => value !== undefined);
  const socialFirstAudioLatencies = socialResponses
    .map((record) => latencySpans(record).firstAudioMs)
    .filter((value): value is number => value !== undefined);
  const activityLatencies = activityResponses
    .map(responseLatencyMs)
    .filter((value): value is number => value !== undefined);
  const aiAuthoredKeys = uniqueTurnKeys(
    activityResponses.filter((record) => record.payload?.aiAuthored === true),
  );
  const spokenKeys = uniqueTurnKeys(
    ordered.filter((record) => record.eventName === "activity_reaction_audio_start"),
  );
  const staleKeys = uniqueTurnKeys(
    ordered.filter((record) => record.eventName === "activity_reaction_stale_dropped"),
  );
  const fallbackKeys = uniqueTurnKeys(
    ordered.filter((record) => record.eventName === "activity_reaction_fallback"),
  );
  const movePacketRequestedKeys = uniqueTurnKeys(
    ordered.filter((record) => record.eventName === "activity_move_packet_requested"),
  );
  const movePacketArrived = ordered.filter(
    (record) => record.eventName === "activity_move_packet_arrived",
  );
  const movePacketArrivedKeys = uniqueTurnKeys(movePacketArrived);
  const movePacketTimeoutKeys = uniqueTurnKeys(
    ordered.filter((record) => record.eventName === "activity_move_packet_timeout"),
  );
  const movePacketLatencies = movePacketArrived
    .map((record) => finiteNumber(record.payload?.latencyMs))
    .filter((value): value is number => value !== undefined);
  const missingAudioCount = [...aiAuthoredKeys].filter(
    (key) => !spokenKeys.has(key) && !staleKeys.has(key) && !fallbackKeys.has(key),
  ).length;
  const usefulSpeechDenominator = Math.max(aiAuthoredKeys.size, spokenKeys.size);
  const usefulSpeechRate =
    usefulSpeechDenominator === 0
      ? 1
      : Number((spokenKeys.size / usefulSpeechDenominator).toFixed(2));
  const spans = ordered.map(latencySpans);
  const blockers: string[] = [];
  if (staleKeys.size > 0) {
    blockers.push(
      "Activity reactions arrived stale. The board changed before speech could play.",
    );
  }
  if (usefulSpeechDenominator > 0 && usefulSpeechRate < 0.67) {
    blockers.push(
      "Too few activity reactions became spoken moments. The game will feel quiet or behind.",
    );
  }
  if (missingAudioCount > 0) {
    blockers.push("Some AI-authored activity reactions produced no playable audio.");
  }
  const socialP95 = percentile(socialLatencies, 0.95);
  if (socialP95 !== undefined && socialP95 > 6500) {
    blockers.push("Live conversation latency is above the current human-review ceiling.");
  }
  const activityP95 = percentile(activityLatencies, 0.95);
  if (activityP95 !== undefined && activityP95 > 2500 && staleKeys.size === 0) {
    blockers.push("Activity reaction latency is too slow for move-by-move play.");
  }
  const strengths: string[] = [];
  if (staleKeys.size === 0) strengths.push("No stale activity reactions.");
  if (usefulSpeechRate >= 0.67) strengths.push("Most AI-authored activity reactions became speech.");
  if (socialP95 !== undefined && socialP95 <= 6500) {
    strengths.push("Live conversation stayed within the current review ceiling.");
  }
  const report: CompanionVideoCallTraceScoreReport = {
    traceId: first?.traceId ?? "unknown",
    ...(first?.childId && { childId: first.childId }),
    ...(first?.companionId && { companionId: first.companionId }),
    readyForHumanReview: blockers.length === 0,
    decision: blockers.length === 0 ? "PASS" : "FAIL",
    likelyCause: likelyCause(blockers),
    metrics: {
      socialResponseCount: socialResponses.length,
      ...(percentile(socialLatencies, 0.5) !== undefined && {
        socialResponseP50Ms: percentile(socialLatencies, 0.5),
      }),
      ...(socialP95 !== undefined && { socialResponseP95Ms: socialP95 }),
      ...(average(socialLatencies) !== undefined && {
        socialResponseAverageMs: average(socialLatencies),
      }),
      ...(percentile(socialFirstAudioLatencies, 0.95) !== undefined && {
        socialFirstAudioP95Ms: percentile(socialFirstAudioLatencies, 0.95),
      }),
      ...(average(socialFirstAudioLatencies) !== undefined && {
        socialFirstAudioAverageMs: average(socialFirstAudioLatencies),
      }),
      activityResponseCount: activityResponses.length,
      ...(activityP95 !== undefined && { activityResponseP95Ms: activityP95 }),
      ...(average(activityLatencies) !== undefined && {
        activityResponseAverageMs: average(activityLatencies),
      }),
      activityAiAuthoredCount: aiAuthoredKeys.size,
      activitySpokenCount: spokenKeys.size,
      activityStaleDroppedCount: staleKeys.size,
      activityMissingAudioCount: missingAudioCount,
      activityFallbackCount: fallbackKeys.size,
      activityUsefulSpeechRate: usefulSpeechRate,
      movePacketRequestedCount: movePacketRequestedKeys.size,
      movePacketArrivedCount: movePacketArrivedKeys.size,
      movePacketTimeoutCount: movePacketTimeoutKeys.size,
      ...(percentile(movePacketLatencies, 0.95) !== undefined && {
        movePacketP95Ms: percentile(movePacketLatencies, 0.95),
      }),
      ...(average(spans.map((span) => span.claudeMs).filter((value): value is number => value !== undefined)) !==
        undefined && {
        averageClaudeMs: average(
          spans.map((span) => span.claudeMs).filter((value): value is number => value !== undefined),
        ),
      }),
      ...(average(
        spans.map((span) => span.toolFollowupMs).filter((value): value is number => value !== undefined),
      ) !== undefined && {
        averageToolFollowupMs: average(
          spans
            .map((span) => span.toolFollowupMs)
            .filter((value): value is number => value !== undefined),
        ),
      }),
      ...(average(spans.map((span) => span.ttsMs).filter((value): value is number => value !== undefined)) !==
        undefined && {
        averageTtsMs: average(
          spans.map((span) => span.ttsMs).filter((value): value is number => value !== undefined),
        ),
      }),
    },
    blockers,
    strengths,
  };
  return report;
}

function ms(value: number | undefined): string {
  return value === undefined ? "n/a" : `${value}ms`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function renderCompanionVideoCallTraceScoreMarkdown(
  report: CompanionVideoCallTraceScoreReport,
): string {
  const lines = [
    `# Companion Video Call Score: ${report.traceId}`,
    "",
    `Demo readiness: ${report.decision}`,
    `Likely cause: ${report.likelyCause}`,
    "",
    "## Metrics",
    `- Social response p50: ${ms(report.metrics.socialResponseP50Ms)}`,
    `- Social response p95: ${ms(report.metrics.socialResponseP95Ms)}`,
    `- Social response average: ${ms(report.metrics.socialResponseAverageMs)}`,
    `- Social first-audio p95: ${ms(report.metrics.socialFirstAudioP95Ms)}`,
    `- Social first-audio average: ${ms(report.metrics.socialFirstAudioAverageMs)}`,
    `- Activity response p95: ${ms(report.metrics.activityResponseP95Ms)}`,
    `- Activity response average: ${ms(report.metrics.activityResponseAverageMs)}`,
    `- Activity AI-authored responses: ${report.metrics.activityAiAuthoredCount}`,
    `- Activity spoken moments: ${report.metrics.activitySpokenCount}`,
    `- Activity stale drops: ${report.metrics.activityStaleDroppedCount}`,
    `- Activity missing audio: ${report.metrics.activityMissingAudioCount}`,
    `- Activity fallback count: ${report.metrics.activityFallbackCount}`,
    `- Useful activity speech rate: ${pct(report.metrics.activityUsefulSpeechRate)}`,
    `- Move packets requested: ${report.metrics.movePacketRequestedCount}`,
    `- Move packets arrived: ${report.metrics.movePacketArrivedCount}`,
    `- Move packet timeouts: ${report.metrics.movePacketTimeoutCount}`,
    `- Move packet p95: ${ms(report.metrics.movePacketP95Ms)}`,
    `- Average Claude latency: ${ms(report.metrics.averageClaudeMs)}`,
    `- Average tool follow-up latency: ${ms(report.metrics.averageToolFollowupMs)}`,
    `- Average ElevenLabs latency: ${ms(report.metrics.averageTtsMs)}`,
    "",
    "## Blockers",
    ...(report.blockers.length > 0 ? report.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
    "## Strengths",
    ...(report.strengths.length > 0 ? report.strengths.map((strength) => `- ${strength}`) : ["- None yet"]),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
