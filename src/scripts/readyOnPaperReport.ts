/**
 * The Planner's ready-on-paper calls for one child, scored against her paper done alone (owner 2026-11-16). No model
 * call; reads only.
 *
 *   npm run sunny:ready -- --child ila
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { readyReportLines } from "../engine/readyOnPaper";

const index = process.argv.indexOf("--child");
const childId = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
if (!childId) {
  console.error("Usage: npm run sunny:ready -- --child CHILD");
  process.exitCode = 1;
} else {
  const dir = path.join(process.cwd(), "src/context", childId, "homework/cycles");
  const ids = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith(".json")).map(name => name.replace(/\.json$/, "")) : [];
  const cycles = ids.map(id => getLearningCycle(childId, id)).filter((cycle): cycle is NonNullable<typeof cycle> => Boolean(cycle));
  console.log(` 🎮 [ready-on-paper] [report] [read] child=${childId} cycles=${cycles.length}`);
  console.log(readyReportLines(childId, cycles).join("\n"));
}
