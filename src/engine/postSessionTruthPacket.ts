import fs from "fs";
import path from "path";

type JsonObject = Record<string, unknown>;

export type PostSessionTruthPacket = {
  packetVersion: 1;
  sessionDir: string;
  generatedAt: string;
  sessionSummary: {
    childId: string | null;
    subject: string | null;
    activityCount: number;
    readingCount: number;
    targetCount: number;
    sourceFiles: string[];
  };
  assignmentSourceSummary: {
    homeworkIds: string[];
    targetGroups: string[];
    targetPurposes: string[];
  };
  activityReports: Array<{
    activityId: string;
    readings: number;
    targets: string[];
    correctTargets: string[];
    missedTargets: string[];
    recoveredTargets: string[];
    contaminatedTargets: string[];
    evidenceTiers: string[];
    helpRequests: number;
    skips: number;
    accuracy: number | null;
    interpretation: string[];
  }>;
  targetEvidence: Array<{
    target: string;
    targetGroupId?: string;
    targetPurpose?: string;
    activities: string[];
    correctCount: number;
    missedCount: number;
    recoveredCount: number;
    contaminatedCount: number;
    lastStatus: string;
    lastQuality: string;
    evidenceTiers: string[];
  }>;
  flowAndPreferenceSignals: {
    helpRequests: number;
    skips: number;
    replays: number;
    frustrationSignals: number;
  };
  contradictions: string[];
  contaminationWarnings: string[];
  questBossReadiness: {
    quest: { status: string; evidenceSeen: boolean };
    boss: { status: string; evidenceSeen: boolean };
  };
  trustworthiness: {
    trustworthyTargets: string[];
    weakTargets: string[];
    contaminatedTargets: string[];
    missingEvidence: string[];
  };
  evidenceInterpreted: {
    activities: string[];
    targets: string[];
    missedTargets: string[];
    correctTargets: string[];
    contaminatedTargets: string[];
  };
  adaptationDecision: {
    status: "changed" | "unchanged" | "missing";
    reason: string;
    source?: JsonObject;
  };
};

function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function readNdjson(file: string): JsonObject[] {
  return readText(file)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line) as unknown;
        return parsed != null && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as JsonObject)
          : null;
      } catch {
        return null;
      }
    })
    .filter((row): row is JsonObject => row !== null);
}

function readJson(file: string): JsonObject | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return parsed != null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : null;
  } catch {
    return null;
  }
}

function readActivityReadings(sessionDir: string): JsonObject[] {
  const dir = path.join(sessionDir, "activities");
  try {
    return fs
      .readdirSync(dir)
      .filter((entry) => entry.endsWith(".ndjson"))
      .flatMap((entry) => readNdjson(path.join(dir, entry)));
  } catch {
    return [];
  }
}

function object(value: unknown): JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function uniqueSorted(set: Set<string>): string[] {
  return [...set].filter(Boolean).sort();
}

function statusFromReading(row: JsonObject): string {
  const result = object(row.result);
  return firstString(result.status, row.status, row.phase, row.type) || "inconclusive";
}

function canonicalActivityId(value: unknown): string {
  return firstString(value, "activity")
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function applyTargetStatus(
  sets: {
    correctTargets: Set<string>;
    missedTargets: Set<string>;
    recoveredTargets: Set<string>;
    contaminatedTargets: Set<string>;
  },
  target: string,
  status: string,
  result: JsonObject,
): "correct" | "missed" | "recovered" | "contaminated" | "inconclusive" {
  if (!target) return "inconclusive";
  if (status === "contaminated") {
    sets.correctTargets.delete(target);
    sets.missedTargets.delete(target);
    sets.recoveredTargets.delete(target);
    sets.contaminatedTargets.add(target);
    return "contaminated";
  }
  if (status === "recovered") {
    sets.correctTargets.delete(target);
    sets.missedTargets.delete(target);
    sets.recoveredTargets.add(target);
    return "recovered";
  }
  if (status === "correct" || result.correct === true) {
    if (sets.missedTargets.has(target)) {
      sets.missedTargets.delete(target);
      sets.correctTargets.delete(target);
      sets.recoveredTargets.add(target);
      return "recovered";
    }
    sets.correctTargets.add(target);
    return "correct";
  }
  if (status === "missed" || result.correct === false) {
    if (!sets.recoveredTargets.has(target) && !sets.correctTargets.has(target)) {
      sets.missedTargets.add(target);
    }
    return "missed";
  }
  return "inconclusive";
}

function qualityFromReading(row: JsonObject): string {
  const quality = object(row.quality);
  return firstString(quality.status, row.evidenceQuality, row.quality) || "unknown";
}

function numberFrom(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readAdaptationDecision(sessionDir: string): PostSessionTruthPacket["adaptationDecision"] {
  const diff = readJson(path.join(sessionDir, "adaptation-diff.json"));
  const decision = readJson(path.join(sessionDir, "psychologist-decision.json"));
  const diffStatus = firstString(diff?.status, object(diff).adaptationVerdict);
  if (diffStatus === "changed" || object(diff).changed === true) {
    return {
      status: "changed",
      reason: firstString(diff?.reason, diff?.summary, "Psychologist next-plan diff changed the board."),
      ...(diff ? { source: diff } : {}),
    };
  }
  if (diffStatus === "stay_course" || diffStatus === "unchanged") {
    return {
      status: "unchanged",
      reason: firstString(diff?.reason, diff?.summary, "Psychologist next-plan diff chose to stay course."),
      ...(diff ? { source: diff } : {}),
    };
  }
  const nested = object(decision?.adaptationDecision);
  const nestedStatus = firstString(nested.status);
  if (nestedStatus === "changed" || nestedStatus === "unchanged") {
    return {
      status: nestedStatus,
      reason: firstString(nested.reason, decision?.reason, "Psychologist decision recorded."),
      ...(decision ? { source: decision } : {}),
    };
  }
  return {
    status: "missing",
    reason: "No next-plan decision was written after interpreted activity evidence.",
  };
}

function latestBoardStatus(rows: JsonObject[], key: "questState" | "bossState"): {
  status: string;
  evidenceSeen: boolean;
} {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]!;
    const status = firstString(row[key], object(row.boardState)[key], object(row.questBossState)[key]);
    if (status) return { status, evidenceSeen: true };
  }
  return { status: "locked", evidenceSeen: false };
}

export function buildPostSessionTruthPacket(
  sessionDir: string,
  generatedAt = new Date().toISOString(),
): PostSessionTruthPacket {
  const resolved = path.resolve(sessionDir);
  const adventure = readNdjson(path.join(resolved, "adventure-log.ndjson"));
  const activityReadings = readActivityReadings(resolved);
  const hasRawTraceEvidence =
    fs.existsSync(path.join(resolved, "game-traces.ndjson")) ||
    fs.existsSync(path.join(resolved, "game-summaries"));
  const activities = new Set<string>();
  const targets = new Set<string>();
  const missedTargets = new Set<string>();
  const correctTargets = new Set<string>();
  const contaminatedTargets = new Set<string>();
  const homeworkIds = new Set<string>();
  const targetGroups = new Set<string>();
  const targetPurposes = new Set<string>();
  const activityMap = new Map<string, {
    readings: number;
    targets: Set<string>;
    correctTargets: Set<string>;
    missedTargets: Set<string>;
    recoveredTargets: Set<string>;
    contaminatedTargets: Set<string>;
    evidenceTiers: Set<string>;
    helpRequests: number;
    skips: number;
    accuracyValues: number[];
    interpretation: Set<string>;
  }>();
  const targetMap = new Map<string, {
    target: string;
    targetGroupId?: string;
    targetPurpose?: string;
    activities: Set<string>;
    correctCount: number;
    missedCount: number;
    recoveredCount: number;
    contaminatedCount: number;
    lastStatus: string;
    lastQuality: string;
    evidenceTiers: Set<string>;
  }>();
  let helpRequests = 0;
  let skips = 0;
  let replays = 0;
  let frustrationSignals = 0;
  const contaminationWarnings = new Set<string>();
  const contradictions = new Set<string>();

  for (const row of activityReadings) {
    const activity = canonicalActivityId(firstString(row.activityId, row.game, "activity"));
    activities.add(activity);
    const target = firstString(row.target, row.currentWord, row.currentTarget);
    if (target) targets.add(target);
    const homeworkId = firstString(row.homeworkId, row.assignmentId);
    if (homeworkId) homeworkIds.add(homeworkId);
    const group = firstString(row.targetGroupId, row.targetLane, row.groupId);
    if (group) targetGroups.add(group);
    const purpose = firstString(row.targetPurpose, row.purpose);
    if (purpose) targetPurposes.add(purpose);
    const tier = firstString(row.evidenceTier);
    const status = statusFromReading(row);
    const quality = qualityFromReading(row);
    const childAction = object(row.childAction);
    const result = object(row.result);
    const flow = object(row.flow);
    const interpretation = object(row.interpretation);

    const report = activityMap.get(activity) ?? {
      readings: 0,
      targets: new Set<string>(),
      correctTargets: new Set<string>(),
      missedTargets: new Set<string>(),
      recoveredTargets: new Set<string>(),
      contaminatedTargets: new Set<string>(),
      evidenceTiers: new Set<string>(),
      helpRequests: 0,
      skips: 0,
      accuracyValues: [],
      interpretation: new Set<string>(),
    };
    report.readings += 1;
    if (target) report.targets.add(target);
    if (tier) report.evidenceTiers.add(tier);
    const accuracy = numberFrom(result.accuracy);
    if (accuracy !== null) report.accuracyValues.push(accuracy);
    if (String(childAction.helpRequest ?? flow.helpRequest ?? "") === "true") {
      report.helpRequests += 1;
      helpRequests += 1;
    }
    if (String(childAction.skipped ?? flow.skipped ?? "") === "true") {
      report.skips += 1;
      skips += 1;
    }
    if (String(flow.replay ?? "") === "true") replays += 1;
    if (String(flow.frustration ?? "") === "true") frustrationSignals += 1;
    const meaning = firstString(interpretation.evidenceMeaning, row.evidenceMeaning);
    if (meaning) report.interpretation.add(meaning);
    const appliedStatus = applyTargetStatus(report, target, status, result);
    if (appliedStatus === "recovered") {
      if (target) {
        missedTargets.delete(target);
        correctTargets.delete(target);
      }
    } else if (appliedStatus === "contaminated") {
      if (target) {
        missedTargets.delete(target);
        correctTargets.delete(target);
        contaminatedTargets.add(target);
        contaminationWarnings.add(`${activity}:${target}`);
      }
    } else if (appliedStatus === "correct") {
      if (target) {
        correctTargets.add(target);
      }
    } else if (appliedStatus === "missed") {
      if (target) {
        missedTargets.add(target);
      }
    }
    if (quality === "contaminated") {
      if (target) {
        report.contaminatedTargets.add(target);
        contaminatedTargets.add(target);
        contaminationWarnings.add(`${activity}:${target}`);
      }
    }
    activityMap.set(activity, report);

    if (target) {
      const current = targetMap.get(target) ?? {
        target,
        activities: new Set<string>(),
        correctCount: 0,
        missedCount: 0,
        recoveredCount: 0,
        contaminatedCount: 0,
        lastStatus: "inconclusive",
        lastQuality: "unknown",
        evidenceTiers: new Set<string>(),
      };
      if (group) current.targetGroupId = group;
      if (purpose) current.targetPurpose = purpose;
      current.activities.add(activity);
      if (tier) current.evidenceTiers.add(tier);
      if (appliedStatus === "recovered") {
        current.correctCount = 0;
        current.missedCount = 0;
        current.recoveredCount += 1;
        current.lastStatus = "recovered";
      } else if (appliedStatus === "contaminated" || quality === "contaminated") current.contaminatedCount += 1;
      else if (appliedStatus === "correct") current.correctCount += 1;
      else if (status === "missed" || result.correct === false) current.missedCount += 1;
      if (appliedStatus !== "recovered") current.lastStatus = status;
      current.lastQuality = quality;
      targetMap.set(target, current);
    }
  }

  for (const row of adventure) {
    if (String(row.type ?? "") === "companion_truth_contradiction") {
      contradictions.add(firstString(row.reason, row.message, "companion truth contradiction"));
    }
    const homeworkId = firstString(row.homeworkId, row.assignmentId);
    if (homeworkId) homeworkIds.add(homeworkId);
  }

  const adaptationDecision = readAdaptationDecision(resolved);

  const activityReports = [...activityMap.entries()].map(([activityId, report]) => ({
    activityId,
    readings: report.readings,
    targets: uniqueSorted(report.targets),
    correctTargets: uniqueSorted(report.correctTargets),
    missedTargets: uniqueSorted(report.missedTargets),
    recoveredTargets: uniqueSorted(report.recoveredTargets),
    contaminatedTargets: uniqueSorted(report.contaminatedTargets),
    evidenceTiers: uniqueSorted(report.evidenceTiers),
    helpRequests: report.helpRequests,
    skips: report.skips,
    accuracy: report.accuracyValues.length
      ? Math.round((report.accuracyValues.reduce((sum, value) => sum + value, 0) / report.accuracyValues.length) * 1000) / 1000
      : null,
    interpretation: [...report.interpretation].slice(0, 8),
  })).sort((a, b) => a.activityId.localeCompare(b.activityId));
  const targetEvidence = [...targetMap.values()].map((entry) => ({
    target: entry.target,
    ...(entry.targetGroupId ? { targetGroupId: entry.targetGroupId } : {}),
    ...(entry.targetPurpose ? { targetPurpose: entry.targetPurpose } : {}),
    activities: uniqueSorted(entry.activities),
    correctCount: entry.correctCount,
    missedCount: entry.missedCount,
    recoveredCount: entry.recoveredCount,
    contaminatedCount: entry.contaminatedCount,
    lastStatus: entry.lastStatus,
    lastQuality: entry.lastQuality,
    evidenceTiers: uniqueSorted(entry.evidenceTiers),
  })).sort((a, b) => a.target.localeCompare(b.target));
  const weakTargets = targetEvidence
    .filter((entry) =>
      entry.missedCount > 0 ||
      entry.recoveredCount > 0 ||
      entry.lastQuality === "scaffolded" ||
      entry.lastQuality === "partial",
    )
    .map((entry) => entry.target);
  const trustworthyTargets = targetEvidence
    .filter((entry) =>
      entry.correctCount > 0 &&
      entry.missedCount === 0 &&
      entry.contaminatedCount === 0 &&
      !["contaminated", "stale", "unknown"].includes(entry.lastQuality),
    )
    .map((entry) => entry.target);
  const questStatus = latestBoardStatus(adventure, "questState");
  const bossStatus = latestBoardStatus(adventure, "bossState");

  return {
    packetVersion: 1,
    sessionDir: resolved,
    generatedAt,
    sessionSummary: {
      childId: firstString(activityReadings[0]?.child, adventure[0]?.child) || null,
      subject: firstString(activityReadings[0]?.subject, adventure[0]?.subject) || null,
      activityCount: activityReports.length,
      readingCount: activityReadings.length,
      targetCount: targetEvidence.length || targets.size,
      sourceFiles: [
        ...(["system-log.ndjson", "adventure-log.ndjson", "game-traces.ndjson"] as const)
          .filter((file) => fs.existsSync(path.join(resolved, file))),
        ...(fs.existsSync(path.join(resolved, "activities")) ? ["activities/"] : []),
        ...(fs.existsSync(path.join(resolved, "game-summaries")) ? ["game-summaries/"] : []),
      ],
    },
    assignmentSourceSummary: {
      homeworkIds: uniqueSorted(homeworkIds),
      targetGroups: uniqueSorted(targetGroups),
      targetPurposes: uniqueSorted(targetPurposes),
    },
    activityReports,
    targetEvidence,
    flowAndPreferenceSignals: {
      helpRequests,
      skips,
      replays,
      frustrationSignals,
    },
    contradictions: [...contradictions].sort(),
    contaminationWarnings: [...contaminationWarnings].sort(),
    questBossReadiness: {
      quest: questStatus,
      boss: bossStatus,
    },
    trustworthiness: {
      trustworthyTargets,
      weakTargets,
      contaminatedTargets: uniqueSorted(contaminatedTargets),
      missingEvidence: activityReadings.length === 0 && hasRawTraceEvidence
        ? ["No normalized activity readings were written for raw trace evidence."]
        : [],
    },
    evidenceInterpreted: {
      activities: [...activities].sort(),
      targets: [...targets].sort(),
      missedTargets: [...missedTargets].sort(),
      correctTargets: [...correctTargets].sort(),
      contaminatedTargets: [...contaminatedTargets].sort(),
    },
    adaptationDecision: {
      status: adaptationDecision.status,
      reason: adaptationDecision.reason,
      ...(adaptationDecision.source ? { source: adaptationDecision.source } : {}),
    },
  };
}

export function writePostSessionTruthPacket(
  sessionDir: string,
  generatedAt?: string,
): PostSessionTruthPacket {
  const packet = buildPostSessionTruthPacket(sessionDir, generatedAt);
  const planBefore = {
    source: "session_folder",
    sessionDir: packet.sessionDir,
    generatedAt: packet.generatedAt,
    activityReports: packet.activityReports.map((report) => ({
      activityId: report.activityId,
      targets: report.targets,
      evidenceTiers: report.evidenceTiers,
    })),
  };
  const psychologistDecision = {
    source: "post-session-truth",
    status: packet.adaptationDecision.status === "missing"
      ? "requires_psychologist_interpretation"
      : "session_decision_recorded",
    generatedAt: packet.generatedAt,
    evidenceRead: {
      activityReports: packet.activityReports.length,
      targetEvidence: packet.targetEvidence.length,
      contradictions: packet.contradictions.length,
      contaminationWarnings: packet.contaminationWarnings.length,
    },
    interpretationBoundary:
      "Code captured truth and quality signals. The AI psychologist should interpret the pattern before changing educational strategy.",
    adaptationDecision: packet.adaptationDecision,
  };
  const planAfter = {
    adaptationDecision: packet.adaptationDecision,
    nextBoardEvidence: packet.activityReports.map((report) => ({
      activityId: report.activityId,
      missedTargets: report.missedTargets,
      recoveredTargets: report.recoveredTargets,
      contaminatedTargets: report.contaminatedTargets,
    })),
  };
  const adaptationDiff = {
    changed: packet.adaptationDecision.status === "changed",
    status: packet.adaptationDecision.status,
    reason: packet.adaptationDecision.reason,
    evidence: {
      weakTargets: packet.trustworthiness.weakTargets,
      contaminatedTargets: packet.trustworthiness.contaminatedTargets,
      trustworthyTargets: packet.trustworthiness.trustworthyTargets,
    },
  };
  writeJson(path.join(packet.sessionDir, "post-session-truth.json"), packet);
  writeJson(path.join(packet.sessionDir, "plan-before.json"), planBefore);
  writeJson(path.join(packet.sessionDir, "evidence-interpreted.json"), packet.evidenceInterpreted);
  writeJson(path.join(packet.sessionDir, "psychologist-decision.json"), psychologistDecision);
  writeJson(path.join(packet.sessionDir, "plan-after.json"), planAfter);
  writeJson(path.join(packet.sessionDir, "adaptation-diff.json"), adaptationDiff);
  return packet;
}
