import fs from "fs";
import path from "path";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import type { AdaptiveEvidenceSnapshot, AdaptiveEvidenceSource } from "../engine/adaptiveEvidenceSnapshot";
import {
  buildAdaptiveEvidenceSnapshot,
  questGateFromSnapshot,
} from "../engine/adaptiveEvidenceSnapshot";
import { getChildChart } from "../profiles/childChart";

type InspectArgs = {
  childId: string;
  homeworkId?: string;
  json: boolean;
  list: boolean;
};

type Logger = {
  log: (line: string) => void;
};

type RunInspectOptions = {
  rootDir?: string;
  logger?: Logger;
};

export type HomeworkCycleListItem = {
  homeworkId: string;
  subject: string;
  title: string;
  words: number;
  questions: number;
  measurements: number;
  theory: boolean;
  pending: boolean;
  ingestedAt: string | null;
};

function valueAfterFlag(argv: string[], index: number, inline: string | undefined): string | undefined {
  if (inline != null) return inline;
  return argv[index + 1]?.startsWith("--") ? undefined : argv[index + 1];
}

export function parseInspectAdaptiveEvidenceArgs(argv: string[]): InspectArgs {
  let childId = "";
  let homeworkId: string | undefined;
  let json = false;
  let list = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--list") {
      list = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const [flag, inline] = arg.split("=", 2);
    if (flag === "--child") {
      childId = String(valueAfterFlag(argv, i, inline) ?? "").trim().toLowerCase();
      if (inline == null) i += 1;
      continue;
    }
    if (flag === "--homework-id") {
      homeworkId = String(valueAfterFlag(argv, i, inline) ?? "").trim();
      if (inline == null) i += 1;
    }
  }

  if (!childId) {
    throw new Error("Missing --child=<childId>");
  }
  return {
    childId,
    ...(homeworkId ? { homeworkId } : {}),
    json,
    list,
  };
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function sourceLine(label: string, source: AdaptiveEvidenceSource): string {
  const ids = source.evidenceIds.length ? ` ids=${source.evidenceIds.join(", ")}` : "";
  return `- ${label}: ${source.status} (${pct(source.confidence)})${ids} - ${source.summary}`;
}

function evaluatorBucketLine(
  label: keyof AdaptiveEvidenceSnapshot["evaluator"]["buckets"],
  words: string[],
): string {
  return `- ${label}: ${words.length ? words.join(", ") : "none"}`;
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function cycleMeasurementCount(cycle: HomeworkCycle): number {
  return [
    ...(cycle.interventionHistory ?? []),
    ...(cycle.questMeasurement ? [cycle.questMeasurement] : []),
  ].filter((measurement) => measurement.nodeType !== "quest" && measurement.nodeType !== "boss").length;
}

export function listAdaptiveEvidenceHomeworkCycles(
  childIdRaw: string,
  rootDir = process.cwd(),
): HomeworkCycleListItem[] {
  const chart = getChildChart(childIdRaw, { rootDir });
  const childId = chart.childId;
  const pendingHomeworkId = chart.learningProfile.pendingHomework?.homeworkId ?? null;
  const cyclesDir = path.join(rootDir, "src", "context", childId, "homework", "cycles");
  if (!fs.existsSync(cyclesDir)) return [];

  return fs.readdirSync(cyclesDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .flatMap((file): HomeworkCycleListItem[] => {
      const cycle = readJson<HomeworkCycle>(path.join(cyclesDir, file));
      if (!cycle?.homeworkId) return [];
      const captured = cycle.capturedContent;
      return [{
        homeworkId: cycle.homeworkId,
        subject: cycle.subject,
        title: captured?.title || cycle.contentProfile?.topic || "(no title)",
        words: captured?.words?.length ?? cycle.wordList?.length ?? 0,
        questions: captured?.questions?.length ?? 0,
        measurements: cycleMeasurementCount(cycle),
        theory: Boolean(cycle.theory),
        pending: cycle.homeworkId === pendingHomeworkId,
        ingestedAt: cycle.ingestedAt ?? null,
      }];
    });
}

export function formatHomeworkCycleList(childId: string, cycles: HomeworkCycleListItem[]): string {
  const lines = [
    "Adaptive Evidence Homework Cycles",
    `Child: ${childId}`,
    "",
    "Cycles:",
    ...(cycles.length
      ? cycles.map((cycle) => {
          const pending = cycle.pending ? " pending" : "";
          return `- ${cycle.homeworkId}${pending} subject=${cycle.subject} title=${cycle.title} words=${cycle.words} questions=${cycle.questions} measurements=${cycle.measurements} theory=${cycle.theory ? "yes" : "no"}`;
        })
      : ["- none"]),
  ];
  return lines.join("\n");
}

export function formatAdaptiveEvidenceReport(snapshot: AdaptiveEvidenceSnapshot): string {
  const theory = snapshot.preQuestTheory;
  const gate = questGateFromSnapshot(snapshot);
  const lines = [
    "Adaptive Evidence Snapshot",
    `Child: ${snapshot.childId}`,
    `Homework: ${snapshot.homeworkId ?? "none"}`,
    `Created: ${snapshot.createdAt}`,
    "",
    `Quest readiness: ${snapshot.questReadiness.level} (${pct(snapshot.questReadiness.confidence)})`,
    `Quest gate: ${gate.canOpenQuest ? "open" : "blocked"}`,
    `Human review: ${gate.needsHumanReview ? "required" : "not required"}`,
    `Gate reason: ${gate.reason}`,
    `Required missing evidence: ${gate.requiredMissingEvidence.length ? gate.requiredMissingEvidence.join(", ") : "none"}`,
    `Reason: ${snapshot.questReadiness.reason}`,
    `Blockers: ${snapshot.questReadiness.blockers.length ? snapshot.questReadiness.blockers.join(", ") : "none"}`,
    "",
    `Attention: source=${snapshot.attention.source} status=${snapshot.attention.status} label=${snapshot.attention.label} window=${snapshot.attention.currentWindow_ms}ms confidence=${pct(snapshot.attention.confidence)}`,
    "",
    "Sources:",
    sourceLine("capturedHomework", snapshot.sources.capturedHomework),
    sourceLine("baselineActivities", snapshot.sources.baselineActivities),
    sourceLine("attention", snapshot.sources.attention),
    sourceLine("tutoringContext", snapshot.sources.tutoringContext),
    sourceLine("companionSignals", snapshot.sources.companionSignals),
    "",
    `Evaluator: ${snapshot.evaluator.status} (${pct(snapshot.evaluator.confidence)}) - ${snapshot.evaluator.summary}`,
    "Evaluator buckets:",
    evaluatorBucketLine("mastered_now", snapshot.evaluator.buckets.mastered_now),
    evaluatorBucketLine("known_but_slow", snapshot.evaluator.buckets.known_but_slow),
    evaluatorBucketLine("fragile", snapshot.evaluator.buckets.fragile),
    evaluatorBucketLine("unknown", snapshot.evaluator.buckets.unknown),
    "",
    theory
      ? `Pre-quest theory: ${theory.theoryId}\nHypothesis: ${theory.hypothesis}\nPredicted pattern: ${theory.predictedPattern}\nRisk words/items: ${theory.predictedRiskWords.join(", ") || "none"}`
      : "Pre-quest theory: none",
    "",
    "Evidence IDs:",
    ...(snapshot.evidenceIds.length ? snapshot.evidenceIds.map((id) => `- ${id}`) : ["- none"]),
  ];
  return lines.join("\n");
}

export async function runInspectAdaptiveEvidence(
  argv: string[],
  opts: RunInspectOptions = {},
): Promise<AdaptiveEvidenceSnapshot | HomeworkCycleListItem[]> {
  const args = parseInspectAdaptiveEvidenceArgs(argv);
  const logger = opts.logger ?? console;
  if (args.list) {
    const cycles = listAdaptiveEvidenceHomeworkCycles(args.childId, opts.rootDir);
    logger.log(args.json ? JSON.stringify(cycles, null, 2) : formatHomeworkCycleList(args.childId, cycles));
    return cycles;
  }

  const snapshot = buildAdaptiveEvidenceSnapshot(args.childId, {
    rootDir: opts.rootDir,
    homeworkId: args.homeworkId,
  });
  logger.log(args.json ? JSON.stringify(snapshot, null, 2) : formatAdaptiveEvidenceReport(snapshot));
  return snapshot;
}

if (typeof require !== "undefined" && require.main === module) {
  runInspectAdaptiveEvidence(process.argv.slice(2)).catch((err) => {
    console.error("🎮 [adaptive-evidence] failed", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
