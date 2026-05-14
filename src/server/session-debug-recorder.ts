import fs from "fs";
import os from "os";
import path from "path";
import { execSync, spawn } from "child_process";
import { ttsLogLabel } from "./audit-log";
import { shouldPersistSessionData } from "../utils/runtimeMode";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SessionDebugRecorderOptions = {
  rootDir?: string;
  sessionId: string;
  childName: string;
  subject: string;
  mode: string;
  enabled?: boolean;
  startedAt?: Date;
  command?: string;
  gitCommit?: string;
  envFlags?: Record<string, string | undefined>;
};

export type CreateProcessRecorderInput = {
  sessionId: string;
  childName: string;
  subject: string;
  mode: string;
};

export type SessionDebugFinalizeInput = {
  endedAt?: Date;
  result: "completed" | "errored" | "disconnected" | "stopped";
  finalState: Record<string, unknown>;
  artifacts: Record<string, unknown>;
};

type StoredEvent = {
  ts: string;
  sessionId: string;
  child: string;
  subject: string;
  component: string;
  action: string;
  [key: string]: JsonValue;
};

function safeSegment(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "unknown";
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value as JsonValue;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (t === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "undefined" || typeof v === "function") continue;
      out[k] = toJsonValue(v);
    }
    return out;
  }
  return String(value);
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function defaultSessionLogRoot(): string {
  return process.env.SUNNY_SESSION_LOG_ROOT?.trim()
    ? path.resolve(process.env.SUNNY_SESSION_LOG_ROOT)
    : process.env.VITEST === "true"
      ? path.join(os.tmpdir(), "sunny-vitest-session-logs")
    : path.join(process.cwd(), "logs", "sessions");
}

export function buildSessionLogFolderName(input: {
  startedAt: Date;
  childName: string;
  subject: string;
  sessionId: string;
}): string {
  const stamp = input.startedAt.toISOString().slice(0, 19).replace(/:/g, "-");
  const sid = safeSegment(input.sessionId).slice(0, 6);
  return [
    stamp,
    safeSegment(input.childName),
    safeSegment(input.subject),
    sid,
  ].join("_");
}

export function currentGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

export function currentSessionCommand(): string {
  const lifecycle = process.env.npm_lifecycle_event;
  return lifecycle ? `npm run ${lifecycle}` : process.argv.join(" ");
}

export function currentSessionEnvFlags(): Record<string, string | undefined> {
  return {
    TTS_ENABLED: process.env.TTS_ENABLED,
    SUNNY_MODE: process.env.SUNNY_MODE,
    SUNNY_CHILD: process.env.SUNNY_CHILD,
    SUNNY_SUBJECT: process.env.SUNNY_SUBJECT,
    SUNNY_PREVIEW_MODE: process.env.SUNNY_PREVIEW_MODE,
    ADVENTURE_MAP: process.env.ADVENTURE_MAP,
    SUNNY_STATELESS: process.env.SUNNY_STATELESS,
  };
}

export function createProcessSessionDebugRecorder(
  input: CreateProcessRecorderInput,
): SessionDebugRecorder {
  return new SessionDebugRecorder({
    ...input,
    enabled: shouldPersistSessionData(),
    command: currentSessionCommand(),
    gitCommit: currentGitCommit(),
    envFlags: currentSessionEnvFlags(),
  });
}

export function buildSessionDebugFinalState(session: any): Record<string, unknown> {
  const pendingTranscript =
    (session.turnSM as { pendingTranscript?: string | null }).pendingTranscript ?? null;
  return {
    turnState: session.turnSM.getState(),
    roundNumber: session.roundNumber,
    isEnding: session.isEnding,
    childName: session.childName,
    sessionId: session.sessionId,
    canvasMode: (session.currentCanvasState as { mode?: unknown } | null)?.mode ?? "idle",
    activeGame:
      (session.currentCanvasState as { game?: unknown } | null)?.game ??
      (session.pendingGameStart ? session.pendingGameStart.gameUrl : null),
    pendingTranscript: pendingTranscript !== null,
    pendingTranscriptLength: pendingTranscript?.length ?? 0,
    wbActive: session.wbActive,
    wbRound: session.wbRound,
    spellCheckSessionActive: session.spellCheckSessionActive,
    activeSpellCheckWord: session.activeSpellCheckWord || null,
    tts: ttsLogLabel(),
    conversationTurns: session.conversationHistory.length,
  };
}

export function finalizeSessionDebugPacket(
  session: any,
  result: "completed" | "errored" | "disconnected" | "stopped",
  artifacts: Record<string, unknown>,
): void {
  if (session.debugPacketFinalized) return;
  if (session.debugRecorder.enabled === false) {
    session.debugPacketFinalized = true;
    console.log("  🎮 [debug] [preview-skip] session packet not written");
    return;
  }
  session.debugRecorder.finalize({
    result,
    finalState: buildSessionDebugFinalState(session),
    artifacts: {
      ...artifacts,
      shouldPersistSessionData: shouldPersistSessionData(),
      conversationTurns: session.conversationHistory.length,
      rewardLogEntries: session.rewardEngine.getRewardLog().length,
    },
  });
  session.debugPacketFinalized = true;
  console.log(`  🎮 [debug] session packet saved: ${session.debugRecorder.sessionDir}`);
  enqueueSessionLogUpload();
}

function enqueueSessionLogUpload(): void {
  if (process.env.VITEST === "true") return;
  if (process.env.SUNNY_LOG_UPLOAD_ON_END === "false") return;
  const child = spawn("npx", [
    "tsx",
    "src/scripts/uploadSessionLogs.ts",
    "--delete-local-after-days=7",
  ], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      SUNNY_LOG_REPO_URL:
        process.env.SUNNY_LOG_REPO_URL ?? "https://github.com/Louis345/sunny-logs.git",
      SUNNY_LOG_REPO_DIR:
        process.env.SUNNY_LOG_REPO_DIR ?? path.resolve(process.cwd(), "..", "sunny-logs"),
    },
  });
  child.unref();
  console.log("  🎮 [debug] session log upload queued");
}

export class SessionDebugRecorder {
  readonly sessionDir: string;
  readonly enabled: boolean;

  private readonly startedAt: Date;
  private readonly sessionId: string;
  private readonly childName: string;
  private readonly subject: string;
  private readonly mode: string;
  private readonly command: string;
  private readonly gitCommit: string;
  private readonly envFlags: Record<string, string | undefined>;
  private readonly events: StoredEvent[] = [];
  private readonly errors: string[] = [];
  private finalized = false;

  constructor(options: SessionDebugRecorderOptions) {
    this.enabled = options.enabled ?? true;
    this.startedAt = options.startedAt ?? new Date();
    this.sessionId = options.sessionId;
    this.childName = options.childName;
    this.subject = options.subject || "unknown";
    this.mode = options.mode || "unknown";
    this.command = options.command || process.env.npm_lifecycle_event || "unknown";
    this.gitCommit = options.gitCommit || "unknown";
    this.envFlags = options.envFlags ?? {};

    if (!this.enabled) {
      this.sessionDir = "";
      return;
    }

    const dayDir = path.join(
      options.rootDir ?? defaultSessionLogRoot(),
      String(this.startedAt.getUTCFullYear()),
      String(this.startedAt.getUTCMonth() + 1).padStart(2, "0"),
    );
    this.sessionDir = path.join(
      dayDir,
      buildSessionLogFolderName({
        startedAt: this.startedAt,
        childName: this.childName,
        subject: this.subject,
        sessionId: this.sessionId,
      }),
    );

    fs.mkdirSync(this.sessionDir, { recursive: true });
    writeJson(path.join(this.sessionDir, "metadata.json"), this.metadata());
    fs.writeFileSync(path.join(this.sessionDir, "events.ndjson"), "", "utf8");
    fs.writeFileSync(path.join(this.sessionDir, "transcript.md"), "", "utf8");
    fs.writeFileSync(path.join(this.sessionDir, "errors.log"), "", "utf8");
    writeJson(path.join(this.sessionDir, "upload-status.json"), {
      uploaded: false,
      message: "Session saved locally. Upload not configured yet.",
      updatedAt: new Date().toISOString(),
    });
  }

  recordEvent(
    component: string,
    action: string,
    fields: Record<string, unknown> = {},
  ): void {
    if (!this.enabled || this.finalized) return;
    const event: StoredEvent = {
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      child: this.childName,
      subject: this.subject,
      component,
      action,
    };
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === "undefined" || typeof v === "function") continue;
      event[k] = toJsonValue(v);
    }
    this.events.push(event);
    fs.appendFileSync(
      path.join(this.sessionDir, "events.ndjson"),
      `${JSON.stringify(event)}\n`,
      "utf8",
    );
  }

  recordTranscript(role: "user" | "assistant" | "system", text: string): void {
    if (!this.enabled || this.finalized) return;
    const clean = text.trim();
    if (!clean) return;
    fs.appendFileSync(
      path.join(this.sessionDir, "transcript.md"),
      `\n### ${new Date().toISOString()}\n\n**${role}:** ${clean}\n`,
      "utf8",
    );
  }

  recordError(message: string, detail?: unknown): void {
    if (!this.enabled || this.finalized) return;
    const line = [
      `[${new Date().toISOString()}] ${message}`,
      detail instanceof Error ? detail.stack || detail.message : detail,
    ]
      .filter(Boolean)
      .join("\n");
    this.errors.push(line);
    fs.appendFileSync(path.join(this.sessionDir, "errors.log"), `${line}\n`, "utf8");
  }

  finalize(input: SessionDebugFinalizeInput): void {
    if (!this.enabled || this.finalized) return;
    const endedAt = input.endedAt ?? new Date();
    const durationMs = endedAt.getTime() - this.startedAt.getTime();
    writeJson(path.join(this.sessionDir, "final-state.json"), input.finalState);
    writeJson(path.join(this.sessionDir, "artifacts.json"), input.artifacts);
    fs.writeFileSync(
      path.join(this.sessionDir, "summary.md"),
      this.buildSummary(input, endedAt, durationMs),
      "utf8",
    );
    this.finalized = true;
  }

  private metadata(): Record<string, unknown> {
    return {
      sessionId: this.sessionId,
      child: this.childName,
      subject: this.subject,
      mode: this.mode,
      startedAt: this.startedAt.toISOString(),
      command: this.command,
      gitCommit: this.gitCommit,
      envFlags: this.envFlags,
    };
  }

  private buildSummary(
    input: SessionDebugFinalizeInput,
    endedAt: Date,
    durationMs: number,
  ): string {
    const recentEvents = this.events.slice(-80);
    const timeline = recentEvents
      .map((event) => {
        const rel = Math.max(
          0,
          Math.round((Date.parse(event.ts) - this.startedAt.getTime()) / 1000),
        );
        const fields = Object.entries(event)
          .filter(
            ([k]) =>
              !["ts", "sessionId", "child", "subject", "component", "action"].includes(k),
          )
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(" ");
        return `- +${rel}s ${event.component}.${event.action}${fields ? ` ${fields}` : ""}`;
      })
      .join("\n");
    const errors = this.errors.length
      ? this.errors.map((e) => `- ${e.split("\n")[0]}`).join("\n")
      : "- none recorded";

    return `# Sunny Session Debug Summary

sessionId: ${this.sessionId}
date: ${this.startedAt.toISOString()}
endedAt: ${endedAt.toISOString()}
child: ${this.childName}
subject: ${this.subject}
mode: ${this.mode}
gitCommit: ${this.gitCommit}
command: ${this.command}
duration_ms: ${durationMs}
result: ${input.result}

## Env Flags
${Object.entries(this.envFlags)
  .map(([k, v]) => `- ${k}: ${v ?? ""}`)
  .join("\n")}

## Timeline
${timeline || "- no events recorded"}

## Errors
${errors}

## Final State
\`\`\`json
${JSON.stringify(input.finalState, null, 2)}
\`\`\`

## Relevant Artifacts
\`\`\`json
${JSON.stringify(input.artifacts, null, 2)}
\`\`\`

## Upload
Session saved locally. Upload not configured yet.
`;
  }
}
