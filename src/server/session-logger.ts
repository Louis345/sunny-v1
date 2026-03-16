/**
 * session-logger.ts
 *
 * Lightweight, fire-and-forget JSONL session event logger.
 *
 * Each session produces one file: logs/sessions/YYYY-MM-DD_HH-MM-SS_<child>.jsonl
 * Each line is a self-contained JSON event object.
 *
 * Disabled when:
 *   - SUNNY_ENABLE_METRICS is not "true"  (opt-in flag)
 *   - SUNNY_TEST_MODE is "true"           (npm run sunny:test)
 *
 * All writes are async, errors are swallowed — the logger must never
 * crash or slow down the main session path.
 */

import fs from "node:fs";
import path from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

export type EventKind =
  | "session_start"
  | "session_end"
  | "child_turn"
  | "agent_turn_start"
  | "ttft"             // time-to-first-token from Claude
  | "first_audio"      // time-to-first-audio from ElevenLabs
  | "turn_complete"    // full round-trip done
  | "tool_call"
  | "barge_in"
  | "error";

export interface LogEvent {
  kind: EventKind;
  ts: string;          // ISO-8601
  session_id: string;
  child: string;
  commit: string;
  test: boolean;
  [key: string]: unknown;
}

// ── Internal state ─────────────────────────────────────────────────────────

let _logPath: string | null = null;
let _sessionId: string | null = null;
let _child: string | null = null;
let _commit: string | null = null;
let _isTest = false;
let _enabled = false;

// ── Helpers ────────────────────────────────────────────────────────────────

function getCommit(): string {
  try {
    const result = require("node:child_process")
      .execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })
      .trim();
    return result || "unknown";
  } catch {
    return "unknown";
  }
}

function makeSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatTimestamp(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function write(event: LogEvent): void {
  if (!_logPath) return;
  const line = JSON.stringify(event) + "\n";
  fs.appendFile(_logPath, line, () => {
    // fire-and-forget — errors are silently ignored
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Call once at the very start of a session (before any events).
 * Returns the session_id for correlation.
 */
export function initLogger(child: string): string {
  _isTest = process.env.SUNNY_TEST_MODE === "true";
  _enabled = process.env.SUNNY_ENABLE_METRICS === "true" && !_isTest;

  _child = child;
  _sessionId = makeSessionId();
  _commit = getCommit();

  if (!_enabled) {
    return _sessionId;
  }

  const dir = path.join(process.cwd(), "logs", "sessions");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    _enabled = false;
    return _sessionId;
  }

  const filename = `${formatTimestamp()}_${child.toLowerCase()}.jsonl`;
  _logPath = path.join(dir, filename);

  return _sessionId;
}

/** Generic event emitter — call from anywhere in session-manager */
export function logEvent(kind: EventKind, extra: Record<string, unknown> = {}): void {
  if (!_enabled || !_sessionId || !_child || !_commit) return;

  write({
    kind,
    ts: new Date().toISOString(),
    session_id: _sessionId,
    child: _child,
    commit: _commit,
    test: _isTest,
    ...extra,
  });
}

/** Convenience: log a latency measurement */
export function logLatency(
  kind: EventKind,
  elapsed_ms: number,
  extra: Record<string, unknown> = {}
): void {
  logEvent(kind, { elapsed_ms, ...extra });
}

/** Flush final event and reset state (call in session end handler) */
export function closeLogger(durationMs: number, turnCount: number): void {
  if (!_enabled) return;
  logEvent("session_end", {
    duration_ms: durationMs,
    turn_count: turnCount,
  });
  // Reset for the next session
  _logPath = null;
  _sessionId = null;
}
