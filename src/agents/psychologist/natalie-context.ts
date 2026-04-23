import fs from "fs";
import path from "path";
import { buildMeasurementReport } from "../../engine/measurementReport";
import { loadChildFiles } from "../../utils/loadChildFiles";
import { PSYCHOLOGIST_CONTEXT } from "../prompts";
import { loadCycles } from "../../scripts/ingestScanResult";

/**
 * Load optional SLP (Natalie) notes from src/context/{ila|reina}/natalie/*.md
 */
export function readNatalieContext(childSlug: string): string | null {
  const slug = childSlug.trim().toLowerCase();
  if (slug !== "ila" && slug !== "reina") return null;
  const dir = path.resolve(process.cwd(), "src", "context", slug, "natalie");
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("."))
    .sort();
  if (files.length === 0) return null;
  const bodies = files.map((f) =>
    fs.readFileSync(path.join(dir, f), "utf-8"),
  );
  const displayName =
    slug.length > 0
      ? slug[0].toUpperCase() + slug.slice(1).toLowerCase()
      : slug;
  return (
    `## Clinical Sessions (Licensed SLP)\n` +
    `The following notes are from ${displayName}'s\n` +
    `speech-language pathologist.\n` +
    `Weight these observations heavily.\n` +
    `They represent in-person clinical assessment.\n\n` +
    bodies.join("\n\n---\n\n")
  );
}

/**
 * Returns a formatted string of the most recent HomeworkCycle for Psychologist context.
 * Included in the user prompt so the Psychologist reads cycle history before planning.
 */
export function buildLatestCycleContext(childId: string): string {
  const cycles = loadCycles(childId);
  if (cycles.length === 0) return "";

  // Sort by ingestedAt descending, pick most recent
  const sorted = [...cycles].sort((a, b) => b.ingestedAt.localeCompare(a.ingestedAt));
  const latest = sorted[0]!;

  const lines: string[] = [
    `## Homework Cycle History`,
    ``,
    `**Most recent cycle:** ${latest.homeworkId}`,
    `**Ingested:** ${latest.ingestedAt}`,
    `**Subject:** ${latest.subject}`,
    `**Words:** ${latest.wordList.join(", ")}`,
    `**Test date:** ${latest.testDate ?? "not set"}`,
    ``,
  ];

  if (latest.assumptions) {
    lines.push(`### Pre-cycle assumptions (what the system predicted)`);
    lines.push(latest.assumptions);
    lines.push(``);
  }

  if (latest.postAnalysis) {
    lines.push(`### Post-scan analysis (what actually happened)`);
    lines.push(latest.postAnalysis);
    lines.push(``);
  } else if (latest.assumptions && !latest.scanResult) {
    lines.push(`> **Awaiting scan:** No scan received yet for this cycle.`);
    lines.push(``);
  }

  if (latest.metrics) {
    lines.push(`### Cycle metrics`);
    lines.push(`- Accuracy delta (isolated − in-system): ${latest.metrics.accuracyDelta >= 0 ? "+" : ""}${latest.metrics.accuracyDelta.toFixed(2)}`);
    lines.push(`- SM-2 growth: ${latest.metrics.sm2Growth >= 0 ? "+" : ""}${latest.metrics.sm2Growth.toFixed(2)}`);
    lines.push(`- Independence rate: ${(latest.metrics.independenceRate * 100).toFixed(0)}%`);
    lines.push(``);
  }

  return lines.join("\n");
}

/** User-side evidence bundle for the Psychologist (sessions + attempts + curriculum), optional Natalie block first. */
export function buildPsychologistContext(childSlug: string): string {
  const slug = childSlug.trim().toLowerCase();
  if (slug !== "ila" && slug !== "reina") {
    throw new Error(`Unknown child slug: ${childSlug}`);
  }
  const childName = slug === "ila" ? ("Ila" as const) : ("Reina" as const);
  const { context, curriculum, attempts } = loadChildFiles(childName);
  const base = PSYCHOLOGIST_CONTEXT(childName, context, attempts, curriculum);
  const natalie = readNatalieContext(slug);
  let combined = natalie ? `${natalie}\n\n${base}` : base;
  const algorithmData = buildMeasurementReport(slug);
  if (algorithmData) {
    console.log("  [engine] measurement report built for psychologist");
    combined = `${combined}\n\n${algorithmData}`;
  }
  const cycleHistory = buildLatestCycleContext(slug);
  if (cycleHistory) {
    console.log("  [engine] homework cycle history added for psychologist");
    combined = `${combined}\n\n${cycleHistory}`;
  }
  return combined;
}
