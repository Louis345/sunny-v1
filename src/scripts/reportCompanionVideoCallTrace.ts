import fs from "fs";
import path from "path";
import { readCompanionVideoCallTraceRecords } from "../server/companionVideoCallTrace";
import {
  buildCompanionVideoCallTraceScoreReport,
  renderCompanionVideoCallTraceScoreMarkdown,
} from "../server/companionVideoCallTraceReport";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

function printUsage(): void {
  console.error(
    "Usage: npm run sunny:companion:trace-report -- <traceId> [--out=path/to/report.md]",
  );
}

const positionalTraceId = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const traceId = argValue("trace") ?? positionalTraceId;

if (!traceId) {
  printUsage();
  process.exit(1);
}

try {
  const records = readCompanionVideoCallTraceRecords(traceId);
  const report = buildCompanionVideoCallTraceScoreReport(records);
  const markdown = renderCompanionVideoCallTraceScoreMarkdown(report);
  const outputPath = argValue("out");
  if (outputPath) {
    const absolute = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, markdown, "utf8");
    console.log(` 🎮 [companion-trace-report] [write] [ok] ${absolute}`);
  }
  console.log(markdown);
  process.exit(report.readyForHumanReview ? 0 : 2);
} catch (error) {
  console.error(
    ` 🎮 [companion-trace-report] [read] [error] ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
