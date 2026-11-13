/**
 * Owner 2026-11-10: rate a session against the success criteria fixed before the fixes were built
 * (docs/audits/2026-11-10-success-criteria.md). Read-only; no provider is called.
 *
 *   npm run sunny:rate -- --child reina [--session logs/sessions/2026/11/<dir>] [--server-log ~/kiosk-run.log] [--root DIR]
 */
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rateSession } from "../engine/sessionRating";
import { loadSessionPacket } from "../engine/sessionRatingPacket";

const value = (flag: string) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1]?.trim() : undefined; };
const childId = value("--child");
const rootDir = value("--root") ?? process.cwd();
if (!childId) {
  console.error("Usage: npm run sunny:rate -- --child CHILD [--session DIR] [--server-log FILE]");
  process.exitCode = 1;
} else {
  const root = path.join(rootDir, "logs", "sessions");
  const all = fs.existsSync(root) ? fs.readdirSync(root, { recursive: true }).map(String).filter(name => new RegExp(`_${childId}_`).test(path.basename(name)) && fs.existsSync(path.join(root, name, "metadata.json"))).sort() : [];
  const sessionDir = value("--session") ?? (all.length ? path.join(root, all.at(-1)!) : "");
  // The server's dated copy for the session's day (kept seven days), else the console capture.
  const started = (() => { try { return String(JSON.parse(fs.readFileSync(path.join(sessionDir, "metadata.json"), "utf8")).startedAt ?? ""); } catch { return ""; } })();
  const dated = path.join(rootDir, "logs", "server", `${started.slice(0, 10)}.log`);
  const serverLog = value("--server-log") ?? (fs.existsSync(dated) ? dated : path.join(os.homedir(), "kiosk-run.log"));
  if (!sessionDir) { console.error(` 🎮 [rating] [refused] child=${childId} reason=no_session_found`); process.exitCode = 1; }
  else {
    const rating = rateSession(loadSessionPacket({ childId, sessionDir, serverLogFile: serverLog }, { rootDir }));
    console.log(rating.text);
    console.log(` 🎮 [rating] [done] child=${childId} session=${path.basename(sessionDir)} verdict=${rating.verdict}`);
  }
}
