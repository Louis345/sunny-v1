import fs from "fs";
import path from "path";
import type {
  AttemptLogRecord,
  DomainClassifier,
  ErrorSignal,
  PatternResult,
  SingleAttemptErrorSignal,
} from "../../algorithms/types";
import { defaultDomainClassifiers } from "./domainClassifierRegistry";
import { extractErrorSignal } from "./extractor";

export interface PatternDetectorOptions {
  rootDir?: string;
  now?: Date;
  classifiers?: DomainClassifier[];
}

type AggregatedPattern = {
  errorType: string;
  domain: string;
  occurrences: Array<{
    signal: SingleAttemptErrorSignal;
    sessionId: string;
    timestamp: string;
    target: string;
    weight: number;
  }>;
};

export function readAttemptLogRecords(
  childId: string,
  options: PatternDetectorOptions = {},
): AttemptLogRecord[] {
  const rootDir = options.rootDir ?? process.cwd();
  const dir = path.join(rootDir, "src", "context", childId, "attempts");
  if (!fs.existsSync(dir)) return [];

  const records: AttemptLogRecord[] = [];
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".ndjson"))
    .sort();

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const lines = fs.readFileSync(fullPath, "utf-8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as Partial<AttemptLogRecord>;
        if (typeof parsed.word !== "string" || typeof parsed.correct !== "boolean") {
          continue;
        }
        records.push({
          word: parsed.word,
          correct: parsed.correct,
          domain: parsed.domain,
          timestamp:
            typeof parsed.timestamp === "string"
              ? parsed.timestamp
              : `${file.replace(/\.ndjson$/, "")}T00:00:00.000Z`,
          sessionId:
            typeof parsed.sessionId === "string" ? parsed.sessionId : undefined,
          attemptedValue:
            typeof parsed.attemptedValue === "string"
              ? parsed.attemptedValue
              : undefined,
          errorSignal: parsed.errorSignal,
        });
      } catch {
        continue;
      }
    }
  }
  return records;
}

export function detectErrorPatterns(
  records: AttemptLogRecord[],
  options: PatternDetectorOptions = {},
): ErrorSignal[] {
  const classifiers = options.classifiers ?? defaultDomainClassifiers;
  const now = options.now ?? latestRecordDate(records) ?? new Date();
  const groups = new Map<string, AggregatedPattern>();

  for (const record of records) {
    if (record.correct) continue;
    if (!record.attemptedValue) continue;
    const domain = String(record.domain ?? "spelling");
    const signal =
      toSingleAttemptSignal(record) ??
      extractErrorSignal(
        {
          target: record.word,
          attempt: record.attemptedValue,
          domain,
        },
        classifiers,
      );
    if (!signal) continue;

    const key = `${domain}:${signal.errorType}`;
    const sessionId = resolveSessionId(record);
    const group =
      groups.get(key) ??
      {
        errorType: signal.errorType,
        domain,
        occurrences: [],
      };
    group.occurrences.push({
      signal,
      sessionId,
      timestamp: record.timestamp,
      target: record.word,
      weight: recencyWeight(record.timestamp, now),
    });
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => buildPatternSignal(group))
    .filter((signal) => signal.frequency >= 3 && signal.sessionCount >= 2)
    .filter((signal) => signal.confidence >= 0.4)
    .sort((a, b) => b.confidence - a.confidence || b.frequency - a.frequency);
}

export function scanChildErrorPatterns(
  childId: string,
  options: PatternDetectorOptions = {},
): PatternResult {
  const records = readAttemptLogRecords(childId, options);
  const patterns = detectErrorPatterns(records, options);
  return {
    childId,
    patterns,
    totalRecords: records.length,
    classifiedAttempts: records.filter((r) => Boolean(r.errorSignal)).length,
    skippedMissingAttemptedValue: records.filter((r) => !r.correct && !r.attemptedValue)
      .length,
  };
}

function latestRecordDate(records: AttemptLogRecord[]): Date | null {
  const timestamps = records
    .map((record) => Date.parse(record.timestamp))
    .filter((time) => Number.isFinite(time));
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

function resolveSessionId(record: AttemptLogRecord): string {
  if (record.sessionId) return record.sessionId;
  return record.timestamp.slice(0, 10);
}

function recencyWeight(timestamp: string, now: Date): number {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return 0.5;
  const ageDays = Math.max(0, (now.getTime() - time) / 86_400_000);
  return Math.pow(0.85, ageDays);
}

function buildPatternSignal(group: AggregatedPattern): ErrorSignal {
  const occurrences = group.occurrences;
  const frequency = occurrences.length;
  const sessionIds = new Set(occurrences.map((o) => o.sessionId));
  const sessionCount = sessionIds.size;
  const weightedFrequency = occurrences.reduce((sum, o) => sum + o.weight, 0);
  const frequencyScore = Math.min(1, frequency / 3);
  const sessionSpreadScore = Math.min(1, sessionCount / 2);
  const recencyScore = Math.min(1, weightedFrequency / Math.max(1, frequency));
  const consistency = Math.min(1, sessionCount / Math.max(1, frequency));
  const confidence = round(
    0.4 * frequencyScore + 0.3 * sessionSpreadScore + 0.2 * recencyScore + 0.1 * consistency,
  );
  const lastSeen = occurrences
    .map((o) => o.timestamp)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0]!;
  const exampleTargets = Array.from(new Set(occurrences.map((o) => o.target))).slice(0, 5);
  const positions = Array.from(
    new Set(occurrences.flatMap((o) => o.signal.positions)),
  );

  return {
    errorType: group.errorType,
    frequency,
    consistency: round(consistency),
    confidence,
    sessionCount,
    lastSeen,
    exampleTargets,
    positions,
    domain: group.domain,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toSingleAttemptSignal(
  record: AttemptLogRecord,
): SingleAttemptErrorSignal | null {
  if (!record.errorSignal || !record.attemptedValue) return null;
  return {
    ...record.errorSignal,
    frequency: 1,
    consistency: 1,
    sessionCount: 1,
    target: record.word,
    attemptedValue: record.attemptedValue,
  };
}
