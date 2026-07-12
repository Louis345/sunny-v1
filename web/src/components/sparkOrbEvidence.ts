import type { SparkOrbHitQuality, SparkOrbLaunchResult } from "./SparkOrbLearningShell";

/** What an embedded problem panel reports for one assessable interaction. */
export interface SparkOrbAttemptReport {
  target: string;
  correct: boolean;
  attemptedValue?: string;
  responseTimeMs?: number;
  scaffoldLevel?: number;
}

/** Attempt enriched by the shell with identity + recovery tracking. */
export interface SparkOrbAttemptRecord extends SparkOrbAttemptReport {
  attemptId: string;
  childId: string;
  domain: string;
  recovered: boolean;
  at: string;
}

export interface SparkOrbThrowRecord {
  result: SparkOrbLaunchResult | "breakout";
  hitQuality?: SparkOrbHitQuality;
  hitDistance?: number;
  difficultyLevel: number;
  captureRadius: number;
  driftOffsetX: number;
  cheerCount: number;
}

/**
 * Law 14 completion summary. The wrapper itself is engagement evidence only
 * (preference_reward); academic proof lives in the embedded per-target
 * attempts, never in throw metrics.
 */
export interface SparkOrbCompletionSummary {
  contractVersion: "spark-orb-evidence-v1";
  childId: string;
  domain: string;
  evidenceRole: "preference_reward";
  academicEvidenceSource: "embedded_attempts";
  targetsShown: string[];
  targetsCorrect: string[];
  targetsMissed: string[];
  targetsRecovered: string[];
  attemptCount: number;
  correctAttemptCount: number;
  accuracy: number | null;
  avgResponseTimeMs: number | null;
  throwCount: number;
  hitQualityCounts: { direct: number; near: number; wide: number };
  strugglePulses: number;
  breakouts: number;
  capturesAfterBreakout: number;
  cheersUsed: number;
  orbsSpent: number;
  orbsGranted: number;
  helpRequests: number;
  skips: number;
}

export interface SparkOrbEvidenceSession {
  recordAttempt: (report: SparkOrbAttemptReport) => SparkOrbAttemptRecord;
  recordThrow: (record: SparkOrbThrowRecord) => void;
  recordStrugglePulse: () => void;
  recordCheer: () => void;
  recordOrbSpent: () => void;
  recordOrbGranted: () => void;
  recordHelpRequest: () => void;
  recordSkip: () => void;
  buildSummary: () => SparkOrbCompletionSummary;
}

export function createSparkOrbEvidenceSession({
  childId,
  domain,
  now = () => new Date().toISOString(),
}: {
  childId: string;
  domain: string;
  now?: () => string;
}): SparkOrbEvidenceSession {
  const attempts: SparkOrbAttemptRecord[] = [];
  const throws: SparkOrbThrowRecord[] = [];
  const missedTargets = new Set<string>();
  const recoveredTargets = new Set<string>();
  let strugglePulses = 0;
  let cheersUsed = 0;
  let orbsSpent = 0;
  let orbsGranted = 0;
  let helpRequests = 0;
  let skips = 0;
  let attemptCounter = 0;
  let breakoutsSeen = 0;
  let capturesAfterBreakout = 0;

  return {
    recordAttempt(report) {
      attemptCounter += 1;
      const recovered = report.correct && missedTargets.has(report.target);
      if (recovered) recoveredTargets.add(report.target);
      if (!report.correct) missedTargets.add(report.target);
      const record: SparkOrbAttemptRecord = {
        ...report,
        attemptId: `${childId}:${domain}:${report.target}:${attemptCounter}`,
        childId,
        domain,
        recovered,
        at: now(),
      };
      attempts.push(record);
      return record;
    },
    recordThrow(record) {
      throws.push(record);
      if (record.result === "breakout") {
        breakoutsSeen += 1;
      } else if (record.result === "success" && breakoutsSeen > 0) {
        capturesAfterBreakout += 1;
      }
    },
    recordStrugglePulse() {
      strugglePulses += 1;
    },
    recordCheer() {
      cheersUsed += 1;
    },
    recordOrbSpent() {
      orbsSpent += 1;
    },
    recordOrbGranted() {
      orbsGranted += 1;
    },
    recordHelpRequest() {
      helpRequests += 1;
    },
    recordSkip() {
      skips += 1;
    },
    buildSummary() {
      const targetsShown = [...new Set(attempts.map((attempt) => attempt.target))];
      const targetsCorrect = [
        ...new Set(attempts.filter((attempt) => attempt.correct).map((a) => a.target)),
      ];
      const correctAttemptCount = attempts.filter((attempt) => attempt.correct).length;
      const responseTimes = attempts
        .map((attempt) => attempt.responseTimeMs)
        .filter((value): value is number => Number.isFinite(value));
      const hitQualityCounts = { direct: 0, near: 0, wide: 0 };
      for (const record of throws) {
        if (record.hitQuality) hitQualityCounts[record.hitQuality] += 1;
      }
      return {
        contractVersion: "spark-orb-evidence-v1",
        childId,
        domain,
        evidenceRole: "preference_reward",
        academicEvidenceSource: "embedded_attempts",
        targetsShown,
        targetsCorrect,
        targetsMissed: [...missedTargets],
        targetsRecovered: [...recoveredTargets],
        attemptCount: attempts.length,
        correctAttemptCount,
        accuracy:
          attempts.length === 0
            ? null
            : Math.round((correctAttemptCount / attempts.length) * 100) / 100,
        avgResponseTimeMs:
          responseTimes.length === 0
            ? null
            : Math.round(
                responseTimes.reduce((sum, value) => sum + value, 0) /
                  responseTimes.length,
              ),
        throwCount: throws.length,
        hitQualityCounts,
        strugglePulses,
        breakouts: breakoutsSeen,
        capturesAfterBreakout,
        cheersUsed,
        orbsSpent,
        orbsGranted,
        helpRequests,
        skips,
      };
    },
  };
}

/**
 * Repo-standard game event envelope: hosts forward these over the session
 * WebSocket as sendMessage("game_event", { event }) and the server records
 * them into game-traces.ndjson.
 */
export interface SparkOrbGameStateUpdate {
  type: "game_state_update";
  version: "1.0";
  payload: {
    game: "Spark Orb";
    phase: string;
    childId: string;
    domain: string;
    currentTarget: string;
    chargeCount: number;
    chargeGoal: number;
    orbCount: number;
    progress: string;
    summary?: SparkOrbCompletionSummary;
  };
}

/**
 * Posts one attempt to the chart's learning-attempt endpoint
 * (POST /api/map/attempt -> recordLearningAttempt). Never throws; failures
 * are logged loudly (Law 4) and reported back as false.
 */
export async function postSparkOrbAttempt(
  record: SparkOrbAttemptRecord,
  options: {
    sessionId?: string;
    fetchImpl?: typeof fetch;
    endpoint?: string;
  } = {},
): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? "/api/map/attempt";
  const target = record.target.replace(/^word:/, "");
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: record.attemptId,
        childId: record.childId,
        domain: record.domain,
        target,
        attemptedValue: record.attemptedValue,
        correct: record.correct,
        scaffoldLevel: record.scaffoldLevel ?? 0,
        responseTimeMs: record.responseTimeMs,
        sessionId: options.sessionId,
      }),
    });
    if (!response.ok) {
      console.error(" 🎮 [spark-orb-evidence] [attempt-post] [failed]", {
        status: response.status,
        attemptId: record.attemptId,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error(" 🎮 [spark-orb-evidence] [attempt-post] [failed]", {
      attemptId: record.attemptId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
