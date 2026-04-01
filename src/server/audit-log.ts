import fs from "fs";
import path from "path";

/** ElevenLabs path active (inverted env for log readability). */
export function ttsLogLabel(): "on" | "off" {
  return process.env.TTS_ENABLED === "false" ? "off" : "on";
}

export function fileLogDisabled(): boolean {
  return process.env.SUNNY_LOG_TO_FILE === "false";
}

/**
 * One grep-friendly line: 🎮 [audit] component=… key=value …
 * (AGENTS.md Law 5 — significant audit events.)
 */
export function formatAuditLine(
  component: string,
  fields: Record<string, string | number | boolean | undefined>,
): string {
  const parts = [`🎮 [audit]`, `component=${component}`];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    const safeKey = k.replace(/\s+/g, "_");
    parts.push(`${safeKey}=${String(v)}`);
  }
  return parts.join(" ");
}

function appendToDailyServerLog(line: string): void {
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.join(process.cwd(), "logs", "sessions", day);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "server.log");
  fs.appendFileSync(file, `${line}\n`, "utf8");
}

/**
 * Console + optional daily file under logs/sessions/YYYY-MM-DD/server.log
 */
export function auditLog(
  component: string,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  const line = formatAuditLine(component, fields);
  console.log(line);
  if (fileLogDisabled()) return;
  try {
    appendToDailyServerLog(line);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("  🔴 [audit] file append failed:", msg);
  }
}
