import fs from "fs";
import path from "path";
import {
  buildCompanionLatencyHumanReviewMarkdown,
  companionTracePacketToLatencySpans,
  evaluateCompanionLatencyGate,
  type CompanionLatencyMode,
  type CompanionLatencySpan,
  type CompanionLatencyTracePacket,
} from "../shared/companionLatencyGate";

export type CompanionLatencyLabPacket = CompanionLatencyTracePacket & {
  mode: CompanionLatencyMode;
};

export type CompanionLatencyLabUrls = Record<CompanionLatencyMode, string>;

export type CompanionLatencyLabReport = {
  type: "companion_latency_lab_report";
  generatedAt: string;
  ready_for_human_review: boolean;
  labDir: string;
  testUrl: string;
  traceUrls: string[];
  spanCount: number;
  aggregates: ReturnType<typeof evaluateCompanionLatencyGate>["aggregates"];
  failures: ReturnType<typeof evaluateCompanionLatencyGate>["failures"];
  thresholds: ReturnType<typeof evaluateCompanionLatencyGate>["thresholds"];
};

export type CompanionLatencyLabArtifactOutput = {
  report: CompanionLatencyLabReport;
  spans: CompanionLatencySpan[];
  humanReviewPath: string;
  reportPath: string;
};

function argValue(argv: string[], name: string): string | null {
  const eq = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1] ?? null;
  return null;
}

function argValues(argv: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith(`--${name}=`)) {
      values.push(arg.slice(name.length + 3));
    } else if (arg === `--${name}` && argv[index + 1]) {
      values.push(argv[index + 1] ?? "");
      index += 1;
    }
  }
  return values.filter(Boolean);
}

function timestampSlug(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export function buildCompanionLatencyLabUrls(input: {
  baseUrl?: string;
  childId?: string;
  theme?: string;
}): CompanionLatencyLabUrls {
  const baseUrl = normalizeBaseUrl(input.baseUrl ?? "http://127.0.0.1:5173");
  const childId = input.childId ?? "ila";
  const theme = input.theme ?? "crystal";
  const build = (mode: CompanionLatencyMode) => {
    const params = new URLSearchParams({
      showroomTheme: theme,
      child: childId,
      activityReactionMode: mode,
    });
    return `${baseUrl}/dbz-preview.html?${params.toString()}`;
  };
  return {
    claude: build("claude"),
    presence: build("presence"),
  };
}

export function createMockCompanionLatencyTracePackets(): CompanionLatencyLabPacket[] {
  return [
    {
      mode: "claude",
      traceId: "trace_claude_mock",
      likelyCause: "none",
      eventCount: 6,
      loopSuspected: false,
      eventOrder: [
        { eventName: "call_started", timestamp: 1_000 },
        { eventName: "call_greeting_audio_start", timestamp: 1_150 },
        { eventName: "activity_phase_changed", timestamp: 2_000 },
        { eventName: "activity_phase_changed", timestamp: 3_250 },
      ],
      turns: [
        {
          turnId: "claude_social_1",
          eventNames: ["speech_result", "talk_request_start", "talk_response_received"],
          requestToResponseMs: 5_200,
        },
      ],
      activityReactions: {
        aiAuthoredCount: 1,
        presenceCount: 0,
        fallbackCount: 0,
        staleDroppedCount: 0,
        spokenCount: 1,
        missingAudioCount: 0,
        averageResponseMs: 5_200,
      },
    },
    {
      mode: "presence",
      traceId: "trace_presence_mock",
      likelyCause: "none",
      eventCount: 10,
      loopSuspected: false,
      eventOrder: [
        { eventName: "call_started", timestamp: 1_000 },
        { eventName: "call_greeting_audio_start", timestamp: 1_120 },
        {
          eventName: "activity_reaction_request_start",
          turnId: "presence_reaction_1",
          timestamp: 2_000,
        },
        {
          eventName: "activity_reaction_audio_start",
          turnId: "presence_reaction_1",
          timestamp: 2_480,
        },
        {
          eventName: "activity_reaction_request_start",
          turnId: "presence_reaction_2",
          timestamp: 4_000,
        },
        {
          eventName: "activity_reaction_audio_start",
          turnId: "presence_reaction_2",
          timestamp: 4_760,
        },
        { eventName: "activity_phase_changed", timestamp: 5_000 },
        { eventName: "activity_phase_changed", timestamp: 6_240 },
      ],
      turns: [
        {
          turnId: "presence_social_1",
          eventNames: ["speech_result", "talk_request_start", "talk_response_received"],
          requestToResponseMs: 5_400,
        },
      ],
      activityReactions: {
        aiAuthoredCount: 2,
        presenceCount: 2,
        fallbackCount: 0,
        staleDroppedCount: 0,
        spokenCount: 2,
        missingAudioCount: 0,
        averagePresenceResponseMs: 620,
      },
    },
  ];
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeNdjson(file: string, rows: unknown[]): void {
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
}

export function writeCompanionLatencyLabArtifacts(input: {
  labDir: string;
  packets: CompanionLatencyLabPacket[];
  testUrl: string;
  traceUrls: string[];
}): CompanionLatencyLabArtifactOutput {
  ensureDir(input.labDir);
  const tracePacketDir = path.join(input.labDir, "trace-packets");
  const screenshotDir = path.join(input.labDir, "screenshots");
  ensureDir(tracePacketDir);
  ensureDir(screenshotDir);

  const spans = input.packets.flatMap((packet) =>
    companionTracePacketToLatencySpans(packet, {
      mode: packet.mode,
      scenarioId: `tic_tac_toe_${packet.mode}`,
    }),
  );
  const result = evaluateCompanionLatencyGate(spans);

  for (const packet of input.packets) {
    writeJson(path.join(tracePacketDir, `${packet.traceId}.json`), packet);
  }
  writeNdjson(path.join(input.labDir, "latency-spans.ndjson"), spans);

  const report: CompanionLatencyLabReport = {
    type: "companion_latency_lab_report",
    generatedAt: new Date().toISOString(),
    ready_for_human_review: result.readyForHumanReview,
    labDir: input.labDir,
    testUrl: input.testUrl,
    traceUrls: input.traceUrls,
    spanCount: spans.length,
    aggregates: result.aggregates,
    failures: result.failures,
    thresholds: result.thresholds,
  };
  const reportPath = path.join(input.labDir, "lab-report.json");
  const humanReviewPath = path.join(input.labDir, "human-review.md");
  writeJson(reportPath, report);
  fs.writeFileSync(
    humanReviewPath,
    buildCompanionLatencyHumanReviewMarkdown({
      result,
      testUrl: input.testUrl,
      traceUrls: input.traceUrls,
      labDir: input.labDir,
    }),
    "utf8",
  );

  return {
    report,
    spans,
    humanReviewPath,
    reportPath,
  };
}

export function inferCompanionLatencyModeFromPacket(
  packet: CompanionLatencyTracePacket,
  fallback: CompanionLatencyMode,
): CompanionLatencyMode {
  if ((packet.activityReactions?.presenceCount ?? 0) > 0) return "presence";
  if ((packet.activityReactions?.aiAuthoredCount ?? 0) > 0) return "claude";
  return fallback;
}

async function fetchTracePacket(traceUrl: string, fallbackMode: CompanionLatencyMode): Promise<CompanionLatencyLabPacket> {
  const response = await fetch(traceUrl);
  if (!response.ok) {
    throw new Error(`trace_fetch_failed:${response.status}:${traceUrl}`);
  }
  const packet = (await response.json()) as CompanionLatencyTracePacket;
  return { ...packet, mode: inferCompanionLatencyModeFromPacket(packet, fallbackMode) };
}

function inferModeFromTraceUrl(url: string, index: number): CompanionLatencyMode {
  const lower = url.toLowerCase();
  if (lower.includes("presence")) return "presence";
  if (lower.includes("claude")) return "claude";
  return index === 0 ? "claude" : "presence";
}

export async function runCompanionLatencyLabCli(argv = process.argv.slice(2)): Promise<void> {
  const baseUrl = argValue(argv, "base-url") ?? "http://127.0.0.1:5173";
  const childId = argValue(argv, "child") ?? "ila";
  const theme = argValue(argv, "theme") ?? "crystal";
  const outDir =
    argValue(argv, "out") ??
    path.join(process.cwd(), "logs", "labs", "companion-latency", timestampSlug());
  const urls = buildCompanionLatencyLabUrls({ baseUrl, childId, theme });
  const traceUrls = argValues(argv, "trace-url");
  const useMock = argv.includes("--mock") || traceUrls.length === 0;
  const packets = useMock
    ? createMockCompanionLatencyTracePackets()
    : await Promise.all(
        traceUrls.map((traceUrl, index) =>
          fetchTracePacket(traceUrl, inferModeFromTraceUrl(traceUrl, index)),
        ),
      );
  const output = writeCompanionLatencyLabArtifacts({
    labDir: path.resolve(outDir),
    packets,
    testUrl: urls.presence,
    traceUrls:
      traceUrls.length > 0
        ? traceUrls
        : packets.map(
            (packet) =>
              `${normalizeBaseUrl(baseUrl)}/api/companions/video-call-traces/${encodeURIComponent(
                packet.traceId,
              )}`,
          ),
  });

  console.log(`🎮 [companion-latency-lab] [written] ${output.report.labDir}`);
  console.log(
    `🎮 [companion-latency-lab] [result] ready_for_human_review=${output.report.ready_for_human_review}`,
  );
  if (useMock) {
    console.log(
      "🎮 [companion-latency-lab] [mode] [mock] provider calls skipped; use --trace-url for live evidence.",
    );
  }
  if (!output.report.ready_for_human_review) {
    for (const failure of output.report.failures) {
      console.log(
        `🎮 [companion-latency-lab] [blocked] ${failure.code} ${failure.evidence}`,
      );
    }
  }
  console.log(`🎮 [companion-latency-lab] [review] ${output.humanReviewPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runCompanionLatencyLabCli().catch((error: unknown) => {
    console.error("🎮 [companion-latency-lab] [failed]", error);
    process.exitCode = 1;
  });
}
