/**
 * metrics.ts
 *
 * Usage:
 *   npm run metrics              — analyse last 30 days
 *   npm run metrics -- --days 7  — analyse last 7 days
 *   npm run metrics -- --sessions 10  — analyse last 10 sessions
 *   npm run metrics -- --no-scout     — print stats table only, skip LLM
 *
 * Reads JSONL files from logs/sessions/, aggregates per-session stats,
 * correlates with git history, then hands the payload to Scout for
 * an LLM-generated report.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { runScout, type ScoutPayload, type SessionSummary, type GitEntry, type WindowStats } from "../agents/scout/run";

// ── CLI args ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getArg(flag: string, fallback: string): string {
  const idx = argv.indexOf(flag);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : fallback;
}

const DAYS = parseInt(getArg("--days", "30"), 10);
const SESSIONS_LIMIT = parseInt(getArg("--sessions", "0"), 10);
const NO_SCOUT = argv.includes("--no-scout");

const SESSIONS_DIR = path.join(process.cwd(), "logs", "sessions");
const MIN_SESSION_DURATION_MS = 60_000; // ignore sessions under 1 min (likely tests)
const MIN_TURNS = 3;                    // ignore sessions with < 3 turns

// ── JSONL parser ───────────────────────────────────────────────────────────

interface RawEvent {
  kind: string;
  ts: string;
  session_id: string;
  child: string;
  commit: string;
  test: boolean;
  elapsed_ms?: number;
  duration_ms?: number;
  turn_count?: number;
  tool?: string;
  message?: string;
  [key: string]: unknown;
}

function parseJsonlFile(filePath: string): RawEvent[] {
  try {
    const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as RawEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is RawEvent => e !== null);
  } catch {
    return [];
  }
}

// ── Session file discovery ─────────────────────────────────────────────────

function getSessionFiles(): string[] {
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.log(`No sessions directory found at ${SESSIONS_DIR}`);
    return [];
  }

  const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;

  const files = fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(SESSIONS_DIR, f))
    .filter((f) => {
      try {
        const stat = fs.statSync(f);
        return stat.mtimeMs >= cutoff;
      } catch {
        return false;
      }
    })
    .sort(); // chronological

  return SESSIONS_LIMIT > 0 ? files.slice(-SESSIONS_LIMIT) : files;
}

// ── Per-session aggregation ────────────────────────────────────────────────

function aggregateSession(events: RawEvent[]): SessionSummary | null {
  const start = events.find((e) => e.kind === "session_start");
  const end = events.find((e) => e.kind === "session_end");

  if (!start) return null;

  const sessionId = start.session_id;
  const child = start.child ?? "unknown";
  const commit = start.commit ?? "unknown";
  const date = start.ts ?? new Date().toISOString();
  const durationMs = (end?.duration_ms as number) ?? 0;
  const turnCount = (end?.turn_count as number) ?? 0;

  // Skip obvious test / short sessions
  if (start.test === true) return null;
  if (durationMs > 0 && durationMs < MIN_SESSION_DURATION_MS) return null;
  if (turnCount > 0 && turnCount < MIN_TURNS) return null;

  const ttftMs: number[] = [];
  const firstAudioMs: number[] = [];
  const turnCompleteMs: number[] = [];
  const toolCallsPerTurn: number[] = [];
  let bargeInCount = 0;
  let errorCount = 0;
  let wordShowAnomalies = 0;
  let toolCallsThisTurn = 0;
  let inTurn = false;

  for (const e of events) {
    if (e.session_id !== sessionId) continue;

    switch (e.kind) {
      case "child_turn":
        if (inTurn) toolCallsPerTurn.push(toolCallsThisTurn);
        toolCallsThisTurn = 0;
        inTurn = true;
        break;
      case "ttft":
        if (typeof e.elapsed_ms === "number") ttftMs.push(e.elapsed_ms);
        break;
      case "first_audio":
        if (typeof e.elapsed_ms === "number") firstAudioMs.push(e.elapsed_ms);
        break;
      case "turn_complete":
        if (typeof e.elapsed_ms === "number") turnCompleteMs.push(e.elapsed_ms);
        if (inTurn) {
          toolCallsPerTurn.push(toolCallsThisTurn);
          toolCallsThisTurn = 0;
          inTurn = false;
        }
        break;
      case "tool_call":
        toolCallsThisTurn++;
        if (e.word_show_anomaly === true) wordShowAnomalies++;
        break;
      case "barge_in":
        bargeInCount++;
        break;
      case "error":
        errorCount++;
        break;
    }
  }

  // Capture trailing in-flight turn
  if (inTurn) toolCallsPerTurn.push(toolCallsThisTurn);

  return {
    session_id: sessionId,
    child,
    commit,
    date,
    duration_ms: durationMs,
    turn_count: turnCount,
    ttft_ms: ttftMs,
    first_audio_ms: firstAudioMs,
    turn_complete_ms: turnCompleteMs,
    tool_calls_per_turn: toolCallsPerTurn,
    barge_in_count: bargeInCount,
    error_count: errorCount,
    word_show_anomalies: wordShowAnomalies,
  };
}

// ── Statistics helpers ─────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Git log ────────────────────────────────────────────────────────────────

function getGitLog(since: string): GitEntry[] {
  try {
    const raw = execSync(
      `git log --since="${since}" --format="%H|%aI|%s" --no-merges`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();

    if (!raw) return [];

    return raw.split("\n").map((line) => {
      const [hash, date, ...subjectParts] = line.split("|");
      return { hash: hash.slice(0, 7), date, subject: subjectParts.join("|") };
    });
  } catch {
    return [];
  }
}

// ── ASCII stats table ──────────────────────────────────────────────────────

function printStatsTable(sessions: SessionSummary[]): void {
  if (!sessions.length) {
    console.log("No sessions found in window.");
    return;
  }

  const allTtft = sessions.flatMap((s) => s.ttft_ms);
  const allAudio = sessions.flatMap((s) => s.first_audio_ms);
  const allTurn = sessions.flatMap((s) => s.turn_complete_ms);
  const allTools = sessions.flatMap((s) => s.tool_calls_per_turn);
  const totalBargeIns = sessions.reduce((a, s) => a + s.barge_in_count, 0);
  const totalErrors = sessions.reduce((a, s) => a + s.error_count, 0);
  const totalAnomalies = sessions.reduce((a, s) => a + s.word_show_anomalies, 0);

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  🔭 SCOUT METRICS REPORT");
  console.log(`  Window: last ${DAYS} days  |  Sessions: ${sessions.length}`);
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("  LATENCY (ms)        mean    P50    P95");
  console.log("  ─────────────────────────────────────");
  console.log(`  Time to first token ${String(mean(allTtft)).padStart(7)}  ${String(percentile(allTtft, 50)).padStart(5)}  ${String(percentile(allTtft, 95)).padStart(5)}`);
  console.log(`  First audio out     ${String(mean(allAudio)).padStart(7)}  ${String(percentile(allAudio, 50)).padStart(5)}  ${String(percentile(allAudio, 95)).padStart(5)}`);
  console.log(`  Full turn round-trip${String(mean(allTurn)).padStart(7)}  ${String(percentile(allTurn, 50)).padStart(5)}  ${String(percentile(allTurn, 95)).padStart(5)}`);
  console.log();
  console.log("  SESSION QUALITY");
  console.log("  ─────────────────────────────────────");
  console.log(`  Total barge-ins:     ${totalBargeIns}`);
  console.log(`  Total errors:        ${totalErrors}`);
  console.log(`  Word show anomalies: ${totalAnomalies}  (same word shown ≥3x)`);
  console.log(`  Avg tool calls/turn: ${mean(allTools).toFixed(1)}`);
  console.log("\n═══════════════════════════════════════════════════════\n");
}

// ── Entry point ────────────────────────────────────────────────────────────

async function main() {
  console.log("🔭 Scout — loading sessions...");

  const files = getSessionFiles();
  if (!files.length) {
    console.log("No session files found. Run a session with SUNNY_ENABLE_METRICS=true first.");
    process.exit(0);
  }

  const sessions: SessionSummary[] = [];
  for (const f of files) {
    const events = parseJsonlFile(f);
    const summary = aggregateSession(events);
    if (summary) sessions.push(summary);
  }

  if (!sessions.length) {
    console.log(`Found ${files.length} file(s) but none passed quality filters (min ${MIN_SESSION_DURATION_MS / 1000}s, min ${MIN_TURNS} turns, not test mode).`);
    process.exit(0);
  }

  printStatsTable(sessions);

  if (NO_SCOUT) {
    console.log("--no-scout flag set; skipping LLM analysis.");
    process.exit(0);
  }

  const windowFrom = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  const windowTo = new Date().toISOString();
  const gitLog = getGitLog(windowFrom.slice(0, 10));

  // Build a light previous-window comparison (last session vs rest)
  const previous: WindowStats | null =
    sessions.length >= 2
      ? {
          mean_ttft_ms: mean(sessions.slice(0, -1).flatMap((s) => s.ttft_ms)),
          mean_first_audio_ms: mean(sessions.slice(0, -1).flatMap((s) => s.first_audio_ms)),
          mean_turn_ms: mean(sessions.slice(0, -1).flatMap((s) => s.turn_complete_ms)),
        }
      : null;

  const payload: ScoutPayload = {
    sessions,
    git_log: gitLog,
    analysis_window: {
      from: windowFrom,
      to: windowTo,
      session_count: sessions.length,
      commit_count: gitLog.length,
    },
    previous_window: previous,
  };

  console.log("🤖 Calling Scout (Claude)...\n");

  try {
    const report = await runScout(payload);
    console.log(report);

    // Save report to disk
    const reportDir = path.join(process.cwd(), "logs", "reports");
    fs.mkdirSync(reportDir, { recursive: true });
    const reportFile = path.join(
      reportDir,
      `scout-report-${new Date().toISOString().slice(0, 10)}.md`
    );
    fs.writeFileSync(reportFile, report, "utf8");
    console.log(`\n📄 Report saved to ${reportFile}`);
  } catch (err) {
    console.error("Scout error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
