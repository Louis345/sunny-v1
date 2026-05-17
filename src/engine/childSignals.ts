import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { ActivityTraitModelEntry, LearningProfile } from "../context/schemas/learningProfile";
import { resolveChildContextDir } from "../utils/contextRoot";
import {
  hydrateLearningProfileFromWaterfall,
  slimLearningProfileForDoorway,
} from "../profiles/chartWaterfall";

export const CHILD_SIGNAL_TYPES = [
  "stated_preference",
  "frustration",
  "help_needed",
  "engagement",
  "avoidance",
  "autonomy_pushback",
  "confidence",
  "reading_struggle",
  "theme_affinity",
] as const;

export const CHILD_SIGNAL_DIMENSIONS = [
  "speed",
  "voice",
  "typing",
  "challenge",
  "story",
  "competition",
  "control",
  "help",
  "autonomy",
  "reading",
  "novelty",
  "calm",
  "social",
] as const;

export const CHILD_SIGNAL_VALENCES = ["positive", "negative", "mixed"] as const;
export const CHILD_SIGNAL_SOURCES = [
  "companion_micro_probe",
  "observed_behavior",
  "parent_comment",
] as const;

export type ChildSignalType = typeof CHILD_SIGNAL_TYPES[number];
export type ChildSignalDimension = typeof CHILD_SIGNAL_DIMENSIONS[number];
export type ChildSignalValence = typeof CHILD_SIGNAL_VALENCES[number];
export type ChildSignalSource = typeof CHILD_SIGNAL_SOURCES[number];

export type ChildSignalInput = {
  childId: string;
  activityId: string;
  domain: string;
  signalType: ChildSignalType;
  dimension: ChildSignalDimension;
  valence: ChildSignalValence;
  confidence: number;
  evidenceText: string;
  source: ChildSignalSource;
  sessionId?: string;
  nodeId?: string;
  choiceSetId?: string;
  createdAt?: string;
};

export type ChildSignalRecord = ChildSignalInput & {
  type: "child_signal";
  version: 1;
  childSignalId: string;
  childId: string;
  createdAt: string;
};

export type ChildSignalRootOptions = {
  rootDir?: string;
  now?: Date;
  skipPersistence?: boolean;
};

export type ActivityTraitSignalSummary = {
  preferredDimensions: string[];
  avoidedDimensions: string[];
  contradictions: string[];
  byDimension: Record<
    string,
    {
      positiveWeight: number;
      negativeWeight: number;
      mixedWeight: number;
      evidenceCount: number;
      confidence: number;
    }
  >;
  byActivity: Record<
    string,
    {
      preferredDimensions: string[];
      avoidedDimensions: string[];
      evidenceCount: number;
    }
  >;
};

function rootDir(opts?: Pick<ChildSignalRootOptions, "rootDir">): string {
  return opts?.rootDir ?? process.cwd();
}

function safeChildId(childId: string): string {
  return childId.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
}

function safeKey(value: string, fallback: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_") || fallback;
}

function fileDate(value: string): string {
  const direct = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function assertOneOf<T extends readonly string[]>(label: string, value: string, allowed: T): asserts value is T[number] {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`child_signal_invalid_${label}:${value}`);
  }
}

function assertConfidence(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`child_signal_invalid_confidence:${value}`);
  }
}

function childSignalDir(childId: string, opts?: Pick<ChildSignalRootOptions, "rootDir">): string {
  return path.join(resolveChildContextDir(safeChildId(childId), { rootDir: rootDir(opts) }), "child_signals");
}

function profilePath(childId: string, opts?: Pick<ChildSignalRootOptions, "rootDir">): string {
  return path.join(resolveChildContextDir(safeChildId(childId), { rootDir: rootDir(opts) }), "learning_profile.json");
}

function readProfile(childId: string, opts?: Pick<ChildSignalRootOptions, "rootDir">): LearningProfile | null {
  const filePath = profilePath(childId, opts);
  if (!fs.existsSync(filePath)) return null;
  try {
    return hydrateLearningProfileFromWaterfall(
      childId,
      JSON.parse(fs.readFileSync(filePath, "utf8")) as LearningProfile,
      opts,
    );
  } catch {
    return null;
  }
}

function writeProfile(childId: string, profile: LearningProfile, opts?: Pick<ChildSignalRootOptions, "rootDir" | "now">): void {
  const filePath = profilePath(childId, opts);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  profile.lastUpdated = (opts?.now ?? new Date()).toISOString();
  fs.writeFileSync(filePath, JSON.stringify(slimLearningProfileForDoorway(profile), null, 2), "utf8");
}

function sourceWeight(record: ChildSignalRecord): number {
  if (record.source === "observed_behavior") return 0.85;
  if (record.source === "parent_comment") return 0.65;
  if (record.signalType === "stated_preference") return 0.45;
  return 0.55;
}

function signalWeight(record: ChildSignalRecord): number {
  return round(record.confidence * sourceWeight(record));
}

function normalizeChildSignal(input: ChildSignalInput, opts: ChildSignalRootOptions = {}): ChildSignalRecord {
  const signalType = String(input.signalType);
  const dimension = String(input.dimension);
  const valence = String(input.valence);
  const source = String(input.source);
  assertOneOf("signal_type", signalType, CHILD_SIGNAL_TYPES);
  assertOneOf("dimension", dimension, CHILD_SIGNAL_DIMENSIONS);
  assertOneOf("valence", valence, CHILD_SIGNAL_VALENCES);
  assertOneOf("source", source, CHILD_SIGNAL_SOURCES);
  assertConfidence(input.confidence);
  const childId = safeChildId(input.childId);
  const activityId = safeKey(input.activityId, "unknown_activity");
  const domain = safeKey(input.domain, "general");
  const evidenceText = input.evidenceText.trim();
  if (!childId) throw new Error("child_signal_missing_child_id");
  if (!evidenceText) throw new Error("child_signal_missing_evidence_text");
  const createdAt = input.createdAt ?? (opts.now ?? new Date()).toISOString();
  const childSignalId = `child_signal_${stableHash({
    childId,
    activityId,
    domain,
    signalType,
    dimension,
    valence,
    evidenceText,
    source,
    createdAt,
  })}`;
  return {
    type: "child_signal",
    version: 1,
    childSignalId,
    childId,
    activityId,
    domain,
    signalType,
    dimension,
    valence,
    confidence: round(input.confidence),
    evidenceText,
    source,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    ...(input.choiceSetId ? { choiceSetId: input.choiceSetId } : {}),
    createdAt,
  };
}

function updateActivityTraitModel(profile: LearningProfile, record: ChildSignalRecord): LearningProfile {
  const model = { ...(profile.activityTraitModel ?? {}) };
  const current = model[record.dimension];
  const weight = signalWeight(record);
  const positiveWeight = round((current?.positiveWeight ?? 0) + (record.valence === "positive" ? weight : 0));
  const negativeWeight = round((current?.negativeWeight ?? 0) + (record.valence === "negative" ? weight : 0));
  const mixedWeight = round((current?.mixedWeight ?? 0) + (record.valence === "mixed" ? weight : 0));
  const evidenceCount = (current?.evidenceCount ?? 0) + 1;
  const activityCounts = { ...(current?.activityCounts ?? {}) };
  activityCounts[record.activityId] = (activityCounts[record.activityId] ?? 0) + 1;
  const confidence = round(Math.min(1, (positiveWeight + negativeWeight + mixedWeight) / Math.max(1, evidenceCount)));
  const entry: ActivityTraitModelEntry = {
    dimension: record.dimension,
    positiveWeight,
    negativeWeight,
    mixedWeight,
    evidenceCount,
    confidence,
    lastUpdated: record.createdAt,
    activityCounts,
  };
  model[record.dimension] = entry;
  return { ...profile, activityTraitModel: model };
}

export function recordChildSignal(
  input: ChildSignalInput,
  opts: ChildSignalRootOptions = {},
): { record: ChildSignalRecord; persisted: boolean } {
  const record = normalizeChildSignal(input, opts);
  if (opts.skipPersistence) {
    console.log(
      `  🎮 [child-signal] [preview] child=${record.childId} activity=${record.activityId} dimension=${record.dimension}`,
    );
    return { record, persisted: false };
  }
  const dir = childSignalDir(record.childId, opts);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${fileDate(record.createdAt)}.ndjson`), `${JSON.stringify(record)}\n`, "utf8");
  const profile = readProfile(record.childId, opts);
  if (profile) {
    writeProfile(record.childId, updateActivityTraitModel(profile, record), opts);
  }
  console.log(
    `  🎮 [child-signal] [recorded] child=${record.childId} activity=${record.activityId} dimension=${record.dimension} valence=${record.valence}`,
  );
  return { record, persisted: true };
}

export function readChildSignals(childId: string, opts: Pick<ChildSignalRootOptions, "rootDir"> = {}): ChildSignalRecord[] {
  const dir = childSignalDir(childId, opts);
  if (!fs.existsSync(dir)) return [];
  const out: ChildSignalRecord[] = [];
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".ndjson")).sort()) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as ChildSignalRecord);
      } catch {
        // Historical malformed rows should not block the session.
      }
    }
  }
  return out;
}

export function buildActivityTraitSignalSummary(
  childId: string,
  opts: Pick<ChildSignalRootOptions, "rootDir"> = {},
): ActivityTraitSignalSummary {
  const byDimension: ActivityTraitSignalSummary["byDimension"] = {};
  const byActivity: ActivityTraitSignalSummary["byActivity"] = {};
  for (const record of readChildSignals(childId, opts)) {
    const weight = signalWeight(record);
    const dim = byDimension[record.dimension] ?? {
      positiveWeight: 0,
      negativeWeight: 0,
      mixedWeight: 0,
      evidenceCount: 0,
      confidence: 0,
    };
    dim.positiveWeight = round(dim.positiveWeight + (record.valence === "positive" ? weight : 0));
    dim.negativeWeight = round(dim.negativeWeight + (record.valence === "negative" ? weight : 0));
    dim.mixedWeight = round(dim.mixedWeight + (record.valence === "mixed" ? weight : 0));
    dim.evidenceCount += 1;
    dim.confidence = round(Math.min(1, (dim.positiveWeight + dim.negativeWeight + dim.mixedWeight) / Math.max(1, dim.evidenceCount)));
    byDimension[record.dimension] = dim;

    const act = byActivity[record.activityId] ?? {
      preferredDimensions: [],
      avoidedDimensions: [],
      evidenceCount: 0,
    };
    if (record.valence === "positive" && !act.preferredDimensions.includes(record.dimension)) {
      act.preferredDimensions.push(record.dimension);
    }
    if (record.valence === "negative" && !act.avoidedDimensions.includes(record.dimension)) {
      act.avoidedDimensions.push(record.dimension);
    }
    act.evidenceCount += 1;
    byActivity[record.activityId] = act;
  }
  const ranked = Object.entries(byDimension).sort(([, a], [, b]) =>
    (b.positiveWeight - b.negativeWeight) - (a.positiveWeight - a.negativeWeight),
  );
  const preferredDimensions = ranked
    .filter(([, value]) => value.positiveWeight > value.negativeWeight)
    .map(([dimension, value]) => `${dimension}:positive=${value.positiveWeight}:confidence=${value.confidence}`);
  const avoidedDimensions = ranked
    .filter(([, value]) => value.negativeWeight > value.positiveWeight)
    .map(([dimension, value]) => `${dimension}:negative=${value.negativeWeight}:confidence=${value.confidence}`);
  const contradictions = ranked
    .filter(([, value]) => value.positiveWeight > 0 && value.negativeWeight > 0)
    .map(([dimension, value]) => `${dimension}:positive=${value.positiveWeight}:negative=${value.negativeWeight}`);
  return { preferredDimensions, avoidedDimensions, contradictions, byDimension, byActivity };
}
