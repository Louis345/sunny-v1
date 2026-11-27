/**
 * Companion presence for one session window, from the server log (owner, 2026-11-16: proof that the Elli fix worked).
 *
 *   npm run sunny:companion:audit -- --date 2026-11-16 --from 17:29 --to 17:54
 *
 * Times are the kiosk's local clock. The server log is in UTC and named by UTC day; both days' logs are read.
 */
import fs from "node:fs";
import path from "node:path";
import { auditCompanionPresence } from "../engine/companionPresenceAudit";

const value = (flag: string) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1]?.trim() : undefined; };
const date = value("--date"), fromTime = value("--from"), toTime = value("--to");
if (!date || !fromTime || !toTime) {
  console.error("Usage: npm run sunny:companion:audit -- --date YYYY-MM-DD --from HH:MM --to HH:MM (kiosk local time)");
  process.exitCode = 1;
} else {
  const from = new Date(`${date}T${fromTime}:00`), to = new Date(`${date}T${toTime}:00`);
  const days = [...new Set([from, to].map(d => d.toISOString().slice(0, 10)))];
  const lines = days.flatMap(day => { const file = path.join("logs", "server", `${day}.log`); return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n") : []; });
  const r = auditCompanionPresence(lines, { from: from.toISOString(), to: to.toISOString() });
  console.log(` 🎮 [companion-audit] [measured] window=${date} ${fromTime}-${toTime} minutes=${r.minutes} source=${r.approximate ? "speech-chunks (approximate)" : "reply-lines"}`);
  console.log(`C1 Times she cut the companion off: ${r.interruptions} (${r.interruptionsPer10Min} per 10 min)`);
  console.log(`C2 Typical reply length: ${r.medianWords} words (${r.longReplies} of ${r.replies} replies over 30 words)`);
  console.log(`C3 Replies repeating one of the last three: ${r.repeats} of ${r.replies}`);
  console.log(`C4 Time to first sound after she stops talking: median ${r.medianFirstAudioMs ?? "n/a"} ms, slowest 10% ${r.p90FirstAudioMs ?? "n/a"} ms`);
}
