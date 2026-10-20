import fs from "fs";
import path from "path";
import {
  formatVoiceTurnLatencyReport,
  readVoiceTurnLatencyRecords,
  summarizeVoiceTurnLatency,
} from "../server/voiceTurnLatency";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

/** Newest session packet under logs/sessions/<year>/<month>/<session>. */
function latestSessionDir(root: string): string | undefined {
  const newest = (dir: string): string | undefined => {
    if (!fs.existsSync(dir)) return undefined;
    const names = fs.readdirSync(dir).filter((n) => !n.startsWith(".")).sort();
    return names.length ? path.join(dir, names[names.length - 1]) : undefined;
  };
  const year = newest(root);
  const month = year && newest(year);
  return month && newest(month);
}

const positional = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const sessionDir =
  positional ?? latestSessionDir(path.join(process.cwd(), "logs", "sessions"));

if (!sessionDir) {
  console.error(
    "Usage: npm run sunny:voice:latency-report -- [logs/sessions/YYYY/MM/<session>] [--out=report.md]",
  );
  process.exit(1);
}

try {
  const eventsPath = sessionDir.endsWith(".ndjson")
    ? sessionDir
    : path.join(sessionDir, "events.ndjson");
  const records = readVoiceTurnLatencyRecords(fs.readFileSync(eventsPath, "utf8"));
  const markdown = formatVoiceTurnLatencyReport(
    summarizeVoiceTurnLatency(records),
    path.basename(path.dirname(path.resolve(eventsPath))),
  );
  const outputPath = argValue("out");
  if (outputPath) {
    const absolute = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, markdown, "utf8");
    console.log(` 🎮 [voice-latency-report] [write] [ok] ${absolute}`);
  }
  console.log(` 🎮 [voice-latency-report] [read] [ok] turns=${records.length} ${eventsPath}`);
  console.log(markdown);
} catch (error) {
  console.error(
    ` 🎮 [voice-latency-report] [read] [error] ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
