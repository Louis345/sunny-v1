import fs from "fs";
import path from "path";
import { classifyKaraokeWordMatch } from "../shared/karaokeMatchWord";
import { isTargetPurposeCompatibleWithActivity } from "../engine/activityIntent";

type AuditIssue = {
  severity: "info" | "warning" | "high";
  code: string;
  message: string;
};

type AuditReport = {
  sessionDir: string;
  issues: AuditIssue[];
  counts: Record<string, number>;
};

function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function readNdjson(file: string): Record<string, unknown>[] {
  return readText(file)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((row): row is Record<string, unknown> => row !== null);
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return value != null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readJsonObjects(dir: string): Record<string, unknown>[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => readJson(path.join(dir, entry)))
      .filter((row): row is Record<string, unknown> => row !== null);
  } catch {
    return [];
  }
}

function countMentions(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length;
}

function firstNodeExpectedTargetCount(transcript: string): number | null {
  const match = transcript.match(/First node words:\s*([^\n]+)/i);
  if (!match) return null;
  const line = match[1] ?? "";
  const more = Number(line.match(/\(\+(\d+)\s+more\)/i)?.[1] ?? 0);
  const visible = line
    .replace(/\(\+\d+\s+more\).*/i, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean).length;
  const total = visible + (Number.isFinite(more) ? more : 0);
  return total > 0 ? total : null;
}

function summaryTotalAttempts(summary: string): number | null {
  const direct = summary.match(/session finalized:\s*(\d+)\s*attempts/i);
  if (direct) return Number(direct[1]);
  const compact = summary.match(/session_finalized[^\n]*\btotalAttempts\s*=\s*(\d+)/i);
  if (compact) return Number(compact[1]);
  const json = summary.match(/"totalAttempts"\s*:\s*(\d+)/);
  return json ? Number(json[1]) : null;
}

function traceNumber(row: Record<string, unknown>, key: string): number {
  const n = Number(row[key]);
  return Number.isFinite(n) ? n : 0;
}

function wordCount(text: string): number {
  return text.split(/\s+/).map((word) => word.trim()).filter(Boolean).length;
}

function lower(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function uniqueStringArray(value: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const word = item.trim();
    const key = word.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

function targetNameArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (item == null || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    return [record.target ?? record.word ?? record.display].filter(Boolean);
  }).map((item) => String(item).trim()).filter(Boolean);
}

function selectedTargetNamesFrom(row: Record<string, unknown>): string[] {
  const selector =
    row.targetSelectorDecision &&
    typeof row.targetSelectorDecision === "object" &&
    !Array.isArray(row.targetSelectorDecision)
      ? (row.targetSelectorDecision as Record<string, unknown>)
      : null;
  const intent =
    row.activityIntent &&
    typeof row.activityIntent === "object" &&
    !Array.isArray(row.activityIntent)
      ? (row.activityIntent as Record<string, unknown>)
      : null;
  return uniqueStringArray([
    ...targetNameArray(row.selectedTargets),
    ...targetNameArray(selector?.selectedTargets),
    ...targetNameArray(selector?.targetReasons),
    ...targetNameArray(intent?.selectedTargets),
  ]);
}

function normalizedSpokenTarget(value: unknown): string {
  return String(value ?? "").toLowerCase().match(/[a-z]+(?:'[a-z]+)?/)?.[0] ?? "";
}

function rowTime(row: Record<string, unknown>): number | null {
  const numeric = Number(row.timestamp);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(row.ts ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function targetReasonsFrom(row: Record<string, unknown>): Record<string, unknown>[] {
  const selector = row.targetSelectorDecision;
  const selectorReasons =
    selector && typeof selector === "object" && !Array.isArray(selector)
      ? (selector as Record<string, unknown>).targetReasons
      : null;
  const intent = row.activityIntent;
  const intentTargets =
    intent && typeof intent === "object" && !Array.isArray(intent)
      ? (intent as Record<string, unknown>).selectedTargets
      : null;
  const directTargets = row.selectedTargets;
  return [
    ...(Array.isArray(selectorReasons) ? selectorReasons : []),
    ...(Array.isArray(intentTargets) ? intentTargets : []),
    ...(Array.isArray(directTargets) ? directTargets : []),
  ].filter((item): item is Record<string, unknown> =>
    item != null && typeof item === "object" && !Array.isArray(item),
  );
}

function selectedTargetsFrom(row: Record<string, unknown>): Record<string, unknown>[] {
  const intent = row.activityIntent;
  const intentTargets =
    intent && typeof intent === "object" && !Array.isArray(intent)
      ? (intent as Record<string, unknown>).selectedTargets
      : null;
  const directTargets = row.selectedTargets;
  return [
    ...(Array.isArray(intentTargets) ? intentTargets : []),
    ...(Array.isArray(directTargets) ? directTargets : []),
  ].filter((item): item is Record<string, unknown> =>
    item != null && typeof item === "object" && !Array.isArray(item),
  );
}

function targetResultsFrom(row: Record<string, unknown>): Record<string, unknown>[] {
  const results = row.targetResults;
  return Array.isArray(results)
    ? results.filter((item): item is Record<string, unknown> =>
        item != null && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function containsCompanionChatter(text: string): boolean {
  return /\b(elli|ellie|you'?re there|not answering|are you there|hello)\b/i.test(text);
}

function activityName(row: Record<string, unknown>): string {
  return lower(row.activityId) || lower(row.game);
}

function activityTargetsFromTruth(packet: Record<string, unknown> | null, activityId: string): number {
  const reports = packet?.activityReports;
  if (!Array.isArray(reports)) return 0;
  const normalizedActivity = activityId.toLowerCase();
  const counts = reports
    .filter((report): report is Record<string, unknown> =>
      report != null &&
      typeof report === "object" &&
      !Array.isArray(report) &&
      lower(report.activityId) === normalizedActivity,
    )
    .map((report) => stringArray(report.targets).length);
  return counts.length ? Math.max(...counts) : 0;
}

function isNarrationProof(row: Record<string, unknown>): boolean {
  const joined = JSON.stringify(row).toLowerCase();
  return (
    lower(row.type) === "narration_request" ||
    lower(row.trigger) === "narration_request" ||
    (lower(row.component) === "game_narration" && lower(row.action) === "speak") ||
    joined.includes('"type":"narration_request"') ||
    joined.includes('"trigger":"narration_request"')
  );
}

function isTargetAudioProof(row: Record<string, unknown>): boolean {
  if (!isNarrationProof(row)) return false;
  const reason = lower(row.reason);
  if (reason === "game_mount_greeting" || reason === "map_mount_greeting") return false;
  return Boolean(reason || lower(row.word ?? row.currentWord));
}

function isPlaybackProof(row: Record<string, unknown>): boolean {
  const type = lower(row.type);
  const action = lower(row.action);
  const component = lower(row.component);
  const status = lower(row.status);
  return (
    type === "audio_played" ||
    type === "narration_played" ||
    type === "narration_audio_played" ||
    type === "local_audio_played" ||
    type === "playback_done" ||
    action === "audio_played" ||
    action === "narration_played" ||
    action === "playback_done" ||
    (component === "client_audio" && /played|done|complete/.test(status || action))
  );
}

function hasTargetTruth(row: Record<string, unknown>): boolean {
  return (
    targetResultsFrom(row).length > 0 ||
    (Array.isArray(row.correctWords) && row.correctWords.length > 0) ||
    (Array.isArray(row.missedWords) && row.missedWords.length > 0) ||
    (Array.isArray(row.contaminatedWords) && row.contaminatedWords.length > 0) ||
    (Array.isArray(row.flaggedWords) && row.flaggedWords.length > 0)
  );
}

function planHasVisibleBoardShape(plan: Record<string, unknown> | null): boolean {
  if (!plan) return false;
  const nodes = plan.nodes;
  const nodeOrder = plan.nodeOrder;
  const adaptationDecision =
    plan.adaptationDecision && typeof plan.adaptationDecision === "object" && !Array.isArray(plan.adaptationDecision)
      ? (plan.adaptationDecision as Record<string, unknown>)
      : null;
  const source =
    adaptationDecision?.source && typeof adaptationDecision.source === "object" && !Array.isArray(adaptationDecision.source)
      ? (adaptationDecision.source as Record<string, unknown>)
      : null;
  const changedNodeIds = source?.changedNodeIds;
  const nextTargets = source?.nextTargets;
  return (
    (Array.isArray(nodes) && nodes.length > 0) ||
    (Array.isArray(nodeOrder) && nodeOrder.length > 0) ||
    (Array.isArray(changedNodeIds) && changedNodeIds.length > 0 && Array.isArray(nextTargets) && nextTargets.length > 0)
  );
}

function hasDirtyRecallAttempt(result: Record<string, unknown>): boolean {
  const attempted = String(result.attemptedValue ?? result.heardTranscript ?? "").trim();
  const mode = lower(result.mode);
  const tier = lower(result.evidenceTier);
  const responseTime = Number(result.responseTime_ms);
  const recallLike =
    mode.includes("recall") ||
    tier === "clean_recall" ||
    tier === "mastery_candidate" ||
    result.masteryEligible === true;
  if (!recallLike) return false;
  if (containsCompanionChatter(attempted)) return true;
  if (Number.isFinite(responseTime) && responseTime > 0 && responseTime < 250) return true;
  if (!attempted && result.correct === true) return true;
  const letters = attempted.toLowerCase().match(/[a-z]+/g) ?? [];
  const target = String(result.target ?? "").toLowerCase();
  const targetMentions = target ? letters.filter((item) => item === target).length : 0;
  if (targetMentions > 1) return true;
  const joined = letters.join("");
  if (target && joined.length > target.length * 2 && joined.includes(target)) return true;
  return false;
}

function hasWordRadarModeContractViolation(row: Record<string, unknown>): boolean {
  if (!activityName(row).includes("word-radar")) return false;
  const config =
    row.wordRadarConfig && typeof row.wordRadarConfig === "object" && !Array.isArray(row.wordRadarConfig)
      ? (row.wordRadarConfig as Record<string, unknown>)
      : null;
  const mode = lower(row.recallMode ?? row.mode ?? config?.recallMode);
  const tier = lower(row.evidenceTier);
  if (mode === "hidden_word_recall" && tier === "practice") return true;
  return targetResultsFrom(row).some((result) =>
    lower(result.mode) === "hidden_word_recall" &&
    lower(result.evidenceTier) === "practice" &&
    result.masteryEligible !== true,
  );
}

function rowMode(row: Record<string, unknown>): string {
  const config =
    row.wordRadarConfig && typeof row.wordRadarConfig === "object" && !Array.isArray(row.wordRadarConfig)
      ? (row.wordRadarConfig as Record<string, unknown>)
      : null;
  return lower(row.recallMode ?? row.mode ?? row.expectedMode ?? row.plannedMode ?? config?.recallMode);
}

export function auditSessionDirectory(sessionDir: string): AuditReport {
  const resolved = path.resolve(sessionDir);
  const transcript = readText(path.join(resolved, "transcript.md"));
  const summary = readText(path.join(resolved, "summary.md"));
  const events = readNdjson(path.join(resolved, "events.ndjson"));
  const traces = readNdjson(path.join(resolved, "game-traces.ndjson"));
  const adventureRows = readNdjson(path.join(resolved, "adventure-log.ndjson"));
  const summaries = readJsonObjects(path.join(resolved, "game-summaries"));
  const auditRows = [...traces, ...summaries];
  const allRows = [...events, ...traces, ...summaries];
  const planBefore = readJson(path.join(resolved, "plan-before.json"));
  const planAfter = readJson(path.join(resolved, "plan-after.json"));
  const adaptationDiff = readJson(path.join(resolved, "adaptation-diff.json"));
  const postSessionTruth = readJson(path.join(resolved, "post-session-truth.json"));
  const activityReadingFiles = fs.existsSync(path.join(resolved, "activities"))
    ? fs.readdirSync(path.join(resolved, "activities")).filter((entry) => entry.endsWith(".ndjson"))
    : [];
  const activityReadings = activityReadingFiles.flatMap((entry) =>
    readNdjson(path.join(resolved, "activities", entry)),
  );
  const issues: AuditIssue[] = [];

  const add = (severity: AuditIssue["severity"], code: string, message: string) => {
    issues.push({ severity, code, message });
  };

  if (!fs.existsSync(path.join(resolved, "game-traces.ndjson"))) {
    add("high", "missing_game_trace", "Session has no game-traces.ndjson; AI cannot audit exact game state.");
  }
  if (!fs.existsSync(path.join(resolved, "system-log.ndjson"))) {
    add("high", "missing_system_log", "Session has no system-log.ndjson; runtime/API state changes are not separated from learning evidence.");
  }
  if (!fs.existsSync(path.join(resolved, "adventure-log.ndjson"))) {
    add("high", "missing_adventure_log", "Session has no adventure-log.ndjson; board path, choices, and companion turns are not auditable as a route.");
  }
  if (traces.length > 0 && activityReadings.length === 0) {
    add("high", "missing_activity_readings", "Session has raw game traces but no normalized activity readings for the psychologist truth packet.");
  }
  if (!postSessionTruth) {
    add("high", "missing_post_session_truth_packet", "Session has no post-session-truth.json; the psychologist has no canonical session truth packet.");
  }
  if (!adaptationDiff && traces.some((row) => String(row.type ?? "") === "node_complete" || targetResultsFrom(row).length > 0)) {
    add("high", "missing_next_plan_diff", "Learning evidence exists but no adaptation-diff.json was written.");
  }

  const launchedGames = new Set(
    auditRows
      .map((row) => String(row.game ?? row.activityId ?? "").toLowerCase())
      .filter(Boolean),
  );
  const openerFirstNode = transcript.match(/First map node:\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase();
  const launchedFirstGame = traces
    .map((row) => String(row.type ?? "") === "node_launched" ? String(row.game ?? row.activityId ?? "").toLowerCase() : "")
    .find(Boolean);
  if (openerFirstNode && launchedFirstGame && openerFirstNode !== launchedFirstGame) {
    add(
      "high",
      "opener_game_mismatch",
      `Session opener named ${openerFirstNode}, but the first launched game was ${launchedFirstGame}.`,
    );
  }
  if (countMentions(transcript, /\bword radar\b/gi) > 0 && !launchedGames.has("word-radar")) {
    add("high", "impossible_activity_mention", "Companion mentioned Word Radar, but game traces do not show Word Radar active.");
  }

  let sessionPlanDriftReported = false;
  const launchContracts = new Map<string, { activityId: string; mode: string; targets: Set<string> }>();
  for (const row of auditRows) {
    if (String(row.type ?? "") !== "node_launched") continue;
    const nodeId = String(row.nodeId ?? row.launchedNodeId ?? row.plannedNodeId ?? "").trim();
    if (!nodeId) continue;
    const targets = uniqueStringArray([
      ...stringArray(row.plannedTargets),
      ...stringArray(row.expectedTargets),
      ...stringArray(row.launchedTargets),
    ]).map((target) => target.toLowerCase());
    launchContracts.set(nodeId, {
      activityId: activityName(row),
      mode: rowMode(row),
      targets: new Set(targets),
    });
  }
  for (const row of allRows) {
    if (sessionPlanDriftReported || String(row.type ?? "") === "node_launched") continue;
    const nodeId = String(row.nodeId ?? row.launchedNodeId ?? row.plannedNodeId ?? "").trim();
    const contract = nodeId ? launchContracts.get(nodeId) : undefined;
    if (!contract) continue;
    const actualMode = rowMode(row);
    if (contract.mode && actualMode && contract.mode !== actualMode) {
      sessionPlanDriftReported = true;
      add(
        "high",
        "session_plan_drift",
        `Runtime mode for ${contract.activityId || "activity"} node ${nodeId} was ${actualMode}, but the launched session-plan contract said ${contract.mode}.`,
      );
      break;
    }
    if (contract.targets.size === 0) continue;
    const actualTargets = uniqueStringArray([
      ...stringArray(row.correctWords),
      ...stringArray(row.missedWords),
      ...targetResultsFrom(row).map((result) => String(result.target ?? result.word ?? "")),
    ]).map((target) => target.toLowerCase());
    const driftedTarget = actualTargets.find((target) => target && !contract.targets.has(target));
    if (driftedTarget) {
      sessionPlanDriftReported = true;
      add(
        "high",
        "session_plan_drift",
        `Runtime target "${driftedTarget}" for ${contract.activityId || "activity"} node ${nodeId} was outside the launched session-plan targets.`,
      );
      break;
    }
  }

  type ActivitySpeechWindow = {
    activityId: string;
    assistantTurns: number;
    userTurns: number;
    assistantWords: number;
  };
  const speechWindows: ActivitySpeechWindow[] = [];
  let speechWindow: ActivitySpeechWindow | null = null;
  const closeSpeechWindow = () => {
    if (speechWindow) speechWindows.push(speechWindow);
    speechWindow = null;
  };
  for (const row of adventureRows) {
    const type = String(row.type ?? "");
    if (type === "node_launched") {
      closeSpeechWindow();
      speechWindow = {
        activityId: lower(row.activityId),
        assistantTurns: 0,
        userTurns: 0,
        assistantWords: 0,
      };
      continue;
    }
    if (type === "node_complete" || type === "game_complete") {
      closeSpeechWindow();
      continue;
    }
    if (type !== "companion_turn" || !speechWindow) continue;
    const role = lower(row.role);
    const text = String(row.text ?? "");
    if (role === "assistant") {
      speechWindow.assistantTurns += 1;
      speechWindow.assistantWords += wordCount(text);
    } else if (role === "user") {
      speechWindow.userTurns += 1;
    }
  }
  closeSpeechWindow();
  const activityOwnedSpeechWindows = new Set([
    "word-radar",
    "monster-stampede",
    "spell-check",
    "letter-rush",
  ]);
  for (const window of speechWindows) {
    if (!activityOwnedSpeechWindows.has(window.activityId) || window.assistantTurns < 2) continue;
    const ratio = window.assistantTurns / Math.max(window.userTurns, 1);
    const averageWords = window.assistantWords / window.assistantTurns;
    if (ratio > 0.25 && averageWords > 15) {
      add(
        "high",
        "activity_companion_chatter_ratio_high",
        `${window.activityId} activity window had ${window.assistantTurns} assistant turn(s), ${window.userTurns} user turn(s), and ${Math.round(averageWords)} average assistant words; activity attempts should stay activity-owned unless the child asks for help or reports a bug.`,
      );
      break;
    }
  }

  let letterRushMaterializationReported = false;
  let letterRushStalePromptReported = false;
  const letterRushTargetsByNode = new Map<string, Set<string>>();
  for (const row of traces) {
    if (String(row.type ?? "") !== "node_launched" || activityName(row) !== "letter-rush") continue;
    const selectedTargets = selectedTargetNamesFrom(row);
    if (!selectedTargets.length) continue;
    const nodeId = String(row.nodeId ?? row.launchedNodeId ?? row.plannedNodeId ?? "");
    if (nodeId) {
      letterRushTargetsByNode.set(
        nodeId,
        new Set(selectedTargets.map((target) => target.toLowerCase())),
      );
    }
    const launchedTargets = uniqueStringArray([
      ...stringArray(row.expectedTargets),
      ...stringArray(row.plannedTargets),
      ...stringArray(row.launchedTargets),
    ]);
    if (!letterRushMaterializationReported && launchedTargets.length === 0) {
      letterRushMaterializationReported = true;
      add(
        "high",
        "letter_rush_selected_targets_not_materialized",
        `Letter Rush selected ${selectedTargets.length} target(s), but launch expected/planned/launched targets were empty.`,
      );
    }
  }
  for (const row of allRows) {
    if (letterRushStalePromptReported || activityName(row) !== "letter-rush" || !isNarrationProof(row)) continue;
    if (lower(row.reason) !== "word_prompt") continue;
    const nodeId = String(row.nodeId ?? "");
    const selected = letterRushTargetsByNode.get(nodeId);
    if (!selected || selected.size === 0) continue;
    const prompted = normalizedSpokenTarget(row.word ?? row.currentWord ?? row.text);
    if (prompted && !selected.has(prompted)) {
      letterRushStalePromptReported = true;
      add(
        "high",
        "letter_rush_stale_prompted_word",
        `Letter Rush prompted "${prompted}", but the launched selector targets were ${[...selected].join(", ")}.`,
      );
    }
  }

  const expectedFirstNodeTargets = firstNodeExpectedTargetCount(transcript);
  if (openerFirstNode && expectedFirstNodeTargets && expectedFirstNodeTargets > 0) {
    const actualTargets = activityTargetsFromTruth(postSessionTruth, openerFirstNode);
    if (actualTargets > 0 && actualTargets < expectedFirstNodeTargets) {
      add(
        "high",
        "first_node_target_count_mismatch",
        `Session opener showed ${expectedFirstNodeTargets} target(s) for ${openerFirstNode}, but normalized evidence only contains ${actualTargets}.`,
      );
    }
  }
  const transcriptLower = transcript.toLowerCase();
  const childReportedSkippedActivity = [
    "monster stampede",
    "word radar",
    "letter rush",
    "wheel of fortune",
  ].some((label) =>
    new RegExp(`\\b(?:i\\s+)?(?:didn'?t|couldn'?t|could not|did not)\\s+(?:do|play|get to|see)[^\\n.]{0,80}\\b${label}\\b`, "i")
      .test(transcriptLower) &&
    !launchedGames.has(label.replace(/\s+/g, "-")),
  );
  if (childReportedSkippedActivity) {
    add(
      "high",
      "child_reported_skipped_planned_activity",
      "Child reported missing planned activities that do not appear as active game traces.",
    );
  }

  let syntheticPromptLeakReported = false;
  let wordRadarVisibleReported = false;
  let pronunciationBackgroundHitReported = false;
  let targetPurposeMismatchReported = false;
  let targetPurposeMissingReported = false;
  let homophoneMissReported = false;
  let duplicateNarrationReported = false;
  let staleTargetReported = false;
  let contaminatedWordRadarReported = false;
  let dirtyWordRadarReported = false;
  let adaptationIgnoredEvidenceReported = false;
  let companionContradictionReported = false;
  let missingTargetTruthReported = false;
  let mysteryIgnoredEvidenceReported = false;
  let launchedTargetMismatchReported = false;
  let plannedNodeSkippedReported = false;
  let offAssignmentTargetReported = false;
  let pronunciationDenominatorReported = false;
  let summaryContradictionReported = false;
  let wordRadarModeContractReported = false;
  const launchedTargetsByNode = new Map<string, Set<string>>();
  for (const row of auditRows) {
    if (String(row.type ?? "") !== "node_launched") continue;
    const nodeId = String(row.nodeId ?? row.launchedNodeId ?? row.plannedNodeId ?? "").trim();
    const approvedTargets = [
      ...stringArray(row.plannedTargets),
      ...stringArray(row.launchedTargets),
      ...stringArray(row.expectedTargets),
    ].map((target) => target.toLowerCase());
    if (nodeId && approvedTargets.length > 0) {
      launchedTargetsByNode.set(nodeId, new Set(approvedTargets));
    }
  }
  for (const row of activityReadings) {
    if (offAssignmentTargetReported) break;
    const nodeId = String(row.nodeId ?? "").trim();
    const target = lower(row.target ?? row.currentWord ?? row.currentTarget);
    const approvedTargets = launchedTargetsByNode.get(nodeId);
    if (nodeId && target && approvedTargets && !approvedTargets.has(target)) {
      offAssignmentTargetReported = true;
      add(
        "high",
        "off_assignment_target_launched",
        `Activity reading for ${activityName(row) || "activity"} used "${target}", but node ${nodeId} approved ${approvedTargets.size} other target(s).`,
      );
    }
  }
  const truthSummary = postSessionTruth?.assignmentSourceSummary;
  if (
    truthSummary &&
    typeof truthSummary === "object" &&
    !Array.isArray(truthSummary) &&
    activityReadings.some((row) => lower(row.target ?? row.currentWord ?? row.currentTarget)) &&
    stringArray((truthSummary as Record<string, unknown>).targetPurposes).length === 0
  ) {
    targetPurposeMissingReported = true;
    add(
      "high",
      "target_purpose_missing",
      "Post-session truth has target evidence but no target purposes, so activity fit cannot be audited.",
    );
  }
  for (const row of auditRows) {
    const game = String(row.game ?? "").toLowerCase();
    const activityId = activityName(row) || game;
    const visibility = String(row.answerVisibility ?? "");
    const phase = String(row.phase ?? "");
    const word = String(row.currentWord ?? row.word ?? "");
    const transcriptText = String(row.transcript ?? "");
    const lastHeard = String(row.lastHeard ?? "");
    const correctWords = stringArray(row.correctWords).map((item) => item.toLowerCase());
    const missedWords = stringArray(row.missedWords).map((item) => item.toLowerCase());
    const targetOverlap = correctWords.find((item) => missedWords.includes(item));
    if (!wordRadarModeContractReported && hasWordRadarModeContractViolation(row)) {
      wordRadarModeContractReported = true;
      add(
        "high",
        "word_radar_mode_contract_violation",
        "Word Radar used hidden_word_recall but recorded the result as ordinary practice; hidden recall must be diagnostic/mastery-gated by the activity mode contract.",
      );
    }
    if (!summaryContradictionReported && targetOverlap) {
      summaryContradictionReported = true;
      add(
        "high",
        "summary_target_contradiction",
        `Activity summary lists "${targetOverlap}" as both correct and missed; recovered targets must be separated from unresolved misses.`,
      );
    }
    if (!launchedTargetMismatchReported && String(row.type ?? "") === "node_launched") {
      const plannedTargets = stringArray(row.plannedTargets);
      const launchedTargets = stringArray(row.launchedTargets);
      const cappedMode =
        row.targetCapApplied === true ||
        String(row.progressionReason ?? row.reason ?? "").toLowerCase().includes("cap");
      if (
        plannedTargets.length > 0 &&
        launchedTargets.length > 0 &&
        plannedTargets.length !== launchedTargets.length &&
        !cappedMode
      ) {
        launchedTargetMismatchReported = true;
        add(
          "high",
          "launched_target_count_mismatch",
          `Launched ${launchedTargets.length} target(s), but the planned node had ${plannedTargets.length}; missing targets must be explicit.`,
        );
      }
    }
    if (!plannedNodeSkippedReported && String(row.type ?? "") === "node_complete") {
      const nextNodeId = String(row.nextNodeId ?? "").trim();
      const expectedNextNodeId = String(row.expectedNextNodeId ?? "").trim();
      if (nextNodeId && expectedNextNodeId && nextNodeId !== expectedNextNodeId) {
        plannedNodeSkippedReported = true;
        add(
          "high",
          "planned_node_skipped",
          `Board advanced to ${nextNodeId}, but the next planned unfinished node was ${expectedNextNodeId}.`,
        );
      }
    }
    if (!syntheticPromptLeakReported && /\[Session start\b|homework map mounted|First map node:/i.test(lastHeard)) {
      syntheticPromptLeakReported = true;
      add("high", "synthetic_prompt_in_game_state", `Synthetic session prompt leaked into ${game || "game"} state.`);
    }
    if (game.includes("wheel") && visibility === "hidden" && word && transcript.toLowerCase().includes(word.toLowerCase())) {
      add("high", "hidden_answer_leak_risk", `Wheel target "${word}" appeared in transcript while answerVisibility=hidden.`);
    }
    if (
      !wordRadarVisibleReported &&
      game.includes("word-radar") &&
      visibility === "visible" &&
      (String(row.currentTarget ?? row.currentWord ?? row.expected ?? "").trim() ||
        String(row.phase ?? "") === "response")
    ) {
      wordRadarVisibleReported = true;
      add(
        "high",
        "word_radar_answer_visible",
        "Word Radar exposed the target during a recall/response state; this invalidates recall evidence.",
      );
    }
    if (
      !pronunciationBackgroundHitReported &&
      game.includes("pronunciation") &&
      phase === "hit" &&
      wordCount(lastHeard) > 6
    ) {
      pronunciationBackgroundHitReported = true;
      add(
        "high",
        "pronunciation_background_hit_risk",
        `Pronunciation scored a hit from a long transcript tail (${wordCount(lastHeard)} words); likely background or stale speech contamination.`,
      );
    }
    if (!targetPurposeMismatchReported) {
      for (const reason of targetReasonsFrom(row)) {
        const purpose = reason.targetPurpose ?? reason.purpose;
        const evidenceTypes = Array.isArray(reason.evidenceTypes)
          ? reason.evidenceTypes.map((item) => lower(item))
          : [];
        const reasonText = [
          ...(Array.isArray(reason.reasons) ? reason.reasons.map((item) => lower(item)) : []),
          ...evidenceTypes,
        ].join(" ");
        const inferredPurpose =
          purpose ??
          (/\b(high[-_ ]frequency|recognize|recognition)\b/.test(reasonText)
            ? "recognize"
            : undefined);
        if (!inferredPurpose) continue;
        const activity =
          lower(row.activityId) ||
          lower(row.game) ||
          lower((row.activityIntent as Record<string, unknown> | undefined)?.activityId);
        if (!activity) continue;
        const compatible = isTargetPurposeCompatibleWithActivity({
          activityId: activity,
          targetPurpose: inferredPurpose,
        });
        if (!compatible.compatible) {
          targetPurposeMismatchReported = true;
          add(
            "high",
            "target_purpose_activity_mismatch",
            `${activity} selected target "${String(reason.target ?? "")}" with purpose ${compatible.targetPurpose}; accepted purposes are ${compatible.acceptedTargetPurposes.join(", ")}.`,
          );
          break;
        }
      }
    }
    if (!targetPurposeMissingReported) {
      const activity =
        lower(row.activityId) ||
        lower(row.game) ||
        lower((row.activityIntent as Record<string, unknown> | undefined)?.activityId);
      const selectedTargets = selectedTargetsFrom(row);
      const intent = row.activityIntent;
      const evidenceTier =
        lower(row.evidenceTier) ||
        lower((intent as Record<string, unknown> | undefined)?.evidenceTier);
      const masteryEligible =
        row.masteryEligible === true ||
        (intent != null &&
          typeof intent === "object" &&
          !Array.isArray(intent) &&
          (intent as Record<string, unknown>).masteryEligible === true);
      const requiresPurpose =
        Boolean(activity) &&
        selectedTargets.length > 0 &&
        (["word-radar", "spell-check", "letter-rush", "wheel-of-fortune", "monster-stampede"].some((name) =>
          activity.includes(name),
        ) ||
          evidenceTier === "clean_recall" ||
          masteryEligible);
      const missingPurpose =
        requiresPurpose &&
        selectedTargets.some((target) => !target.targetPurpose && !target.purpose);
      if (missingPurpose) {
        targetPurposeMissingReported = true;
        add(
          "high",
          "target_purpose_missing",
          `${activity} selected targets without carrying target purpose; the domain oracle cannot prove the activity fits the selected words.`,
        );
      }
    }
    if (
      !homophoneMissReported &&
      (String(row.type ?? "") === "pronunciation_miss" ||
        (activityId.includes("pronunciation") && phase === "miss")) &&
      word &&
      lastHeard &&
      classifyKaraokeWordMatch(lastHeard, word, { mode: "pronunciation" }) === "match"
    ) {
      homophoneMissReported = true;
      add(
        "high",
        "pronunciation_homophone_marked_miss",
        `Pronunciation marked "${lastHeard}" as a miss for "${word}" even though pronunciation matching accepts it.`,
      );
    }
    const promptedWord = String(row.promptedWord ?? row.narratedWord ?? "").trim();
    if (
      !staleTargetReported &&
      game.includes("monster") &&
      word &&
      promptedWord &&
      word.toLowerCase() !== promptedWord.toLowerCase()
    ) {
      staleTargetReported = true;
      add(
        "high",
        "stale_current_target",
        `Monster trace currentWord="${word}" but promptedWord="${promptedWord}".`,
      );
    }
    const wordLength = traceNumber(row, "wordLength");
    const itemIndex = traceNumber(row, "itemIndex");
    const wordIdx = traceNumber(row, "wordIdx");
    if (
      !staleTargetReported &&
      activityId.includes("monster") &&
      word &&
      itemIndex > 0 &&
      ((wordLength > 0 && word.length !== wordLength) || wordIdx < itemIndex)
    ) {
      staleTargetReported = true;
      add(
        "high",
        "stale_current_target",
        `Monster trace carried stale currentWord="${word}" for itemIndex=${itemIndex}; current target must match the prompted item.`,
      );
    }
    if (
      !contaminatedWordRadarReported &&
      game.includes("word-radar") &&
      targetResultsFrom(row).some((result) =>
        containsCompanionChatter(String(result.attemptedValue ?? result.heardTranscript ?? "")),
      )
    ) {
      contaminatedWordRadarReported = true;
      add(
        "high",
        "word_radar_contaminated_attempt",
        "Word Radar counted an attempted value that contained companion chatter instead of isolated child recall.",
      );
    }
    if (
      !dirtyWordRadarReported &&
      game.includes("word-radar") &&
      targetResultsFrom(row).some(hasDirtyRecallAttempt)
    ) {
      dirtyWordRadarReported = true;
      add(
        "high",
        "word_radar_dirty_clean_recall_attempt",
        "Word Radar marked a clean/mastery recall attempt even though the captured value was noisy, duplicated, missing, or too fast to trust.",
      );
    }
    if (
      !adaptationIgnoredEvidenceReported &&
      String(row.type ?? "") === "next_plan_unchanged" &&
      /not a word-driven homework activity/i.test(String(row.reason ?? "")) &&
      (targetResultsFrom(row).length > 0 ||
        /monster|word-radar|spell-check|pronunciation|letter-rush|wheel/.test(activityId))
    ) {
      adaptationIgnoredEvidenceReported = true;
      add(
        "high",
        "adaptation_ignored_word_evidence",
        "Next plan stayed unchanged because the node was treated as non-word-driven even though target evidence was present.",
      );
    }
    if (
      !mysteryIgnoredEvidenceReported &&
      String(row.type ?? "") === "next_plan_unchanged" &&
      /not a word-driven homework activity/i.test(String(row.reason ?? "")) &&
      (activityId.includes("mystery") || activityId.includes("wheel") || game.includes("mystery") || game.includes("wheel")) &&
      targetResultsFrom(row).length > 0
    ) {
      mysteryIgnoredEvidenceReported = true;
      add(
        "high",
        "mystery_word_evidence_ignored",
        "Mystery/Wheel produced target evidence, but the next-plan decision ignored it as non-word-driven.",
      );
    }
    if (
      !companionContradictionReported &&
      String(row.type ?? "") === "companion_truth_contradiction"
    ) {
      companionContradictionReported = true;
      add(
        "high",
        "companion_truth_contradiction_present",
        "The contradiction checker caught Elli making a claim that did not match authoritative activity truth.",
      );
    }
    const rowAccuracy = Number(row.accuracy);
    if (
      !missingTargetTruthReported &&
      Number.isFinite(rowAccuracy) &&
      rowAccuracy > 0 &&
      (String(row.type ?? "") === "node_complete" || row.completed === true || summaries.includes(row)) &&
      !hasTargetTruth(row)
    ) {
      missingTargetTruthReported = true;
      add(
        "high",
        "activity_accuracy_missing_target_truth",
        "An activity reported nonzero accuracy without target-level correct, missed, contaminated, or result evidence.",
      );
    }
    if (
      String(row.type ?? "") === "transcript_suppressed" &&
      /\b(what word|which word|say the word|say it|didn'?t say|did not say|help|that'?s wrong|not right|game skipped|it skipped)\b/i.test(transcriptText)
    ) {
      add("high", "suppressed_help_request", `Suppressed child help/product utterance during ${game || "active game"}: "${transcriptText.slice(0, 120)}"`);
    }
    if (game.includes("pronunciation") && phase === "complete") {
      const hitEvents = traceNumber(row, "hitEvents") || traceNumber(row, "wordsHit");
      const totalWords = traceNumber(row, "totalWords");
      const uniqueTargets = traceNumber(row, "uniqueTargetsAttempted") || totalWords;
      if (totalWords > 0 && hitEvents > totalWords * 2 && uniqueTargets <= totalWords) {
        add("high", "pronunciation_hit_inflation", `Pronunciation logged ${hitEvents} hit events for ${totalWords} targets; audit unique target evidence before adapting.`);
      }
    }
    if (
      !pronunciationDenominatorReported &&
      activityId.includes("pronunciation") &&
      (String(row.type ?? "") === "node_complete" || phase === "node_complete" || phase === "complete")
    ) {
      const accuracy = Number(row.accuracy);
      const attempted = traceNumber(row, "wordsAttempted");
      const plannedCount = Math.max(
        stringArray(row.plannedTargets).length,
        stringArray(row.launchedTargets).length,
        stringArray(row.expectedTargets).length,
        stringArray(row.correctWords).length + stringArray(row.missedWords).length,
      );
      if (Number.isFinite(accuracy) && accuracy >= 0.95 && plannedCount > attempted && attempted > 0) {
        pronunciationDenominatorReported = true;
        add(
          "high",
          "pronunciation_accuracy_denominator_mismatch",
          `Pronunciation reported ${Math.round(accuracy * 100)}% after ${attempted}/${plannedCount} target(s); accuracy must use the planned target denominator.`,
        );
      }
    }
  }

  if (!summaryContradictionReported) {
    const reports = postSessionTruth?.activityReports;
    if (Array.isArray(reports)) {
      for (const report of reports) {
        if (report == null || typeof report !== "object" || Array.isArray(report)) continue;
        const correct = stringArray((report as Record<string, unknown>).correctTargets).map((item) => item.toLowerCase());
        const missed = stringArray((report as Record<string, unknown>).missedTargets).map((item) => item.toLowerCase());
        const overlap = correct.find((item) => missed.includes(item));
        if (!overlap) continue;
        summaryContradictionReported = true;
        add(
          "high",
          "summary_target_contradiction",
          `Post-session truth lists "${overlap}" as both correct and missed; recovered targets must be separated from unresolved misses.`,
        );
        break;
      }
    }
  }

  const recentNarration = new Map<string, number>();
  for (const row of allRows) {
    if (!isNarrationProof(row)) continue;
    const key = [
      activityName(row) || "unknown",
      lower(row.word ?? row.currentWord),
      lower(row.text),
      lower(row.reason),
    ].join("|");
    const at = rowTime(row);
    const prev = recentNarration.get(key);
    if (
      !duplicateNarrationReported &&
      at !== null &&
      typeof prev === "number" &&
      at - prev >= 0 &&
      at - prev <= 1_000
    ) {
      duplicateNarrationReported = true;
      add(
        "high",
        "duplicate_narration_request",
        `Duplicate narration request for ${key} within ${at - prev}ms; one user action should not create two voices.`,
      );
    }
    if (at !== null) recentNarration.set(key, at);
  }

  const wordRadarRan = auditRows.some((row) => activityName(row).includes("word-radar"));
  const wordRadarNarrationSeen = allRows.some((row) =>
    activityName(row).includes("word-radar") && isTargetAudioProof(row),
  );
  const wordRadarPlaybackSeen = allRows.some((row) =>
    activityName(row).includes("word-radar") && isPlaybackProof(row),
  );
  const wordRadarVoiceDisabled = allRows.some((row) =>
    activityName(row).includes("word-radar") &&
    lower(row.type ?? row.action) === "voice_control" &&
    row.voiceEnabled === false,
  );
  if (wordRadarRan && !wordRadarNarrationSeen) {
    add(
      "high",
      "word_radar_narration_request_missing",
      "Word Radar ran, but logs contain no narration_request or game narration proof for the visible hear control.",
    );
  }
  if (wordRadarRan && wordRadarNarrationSeen && !wordRadarPlaybackSeen) {
    add(
      "high",
      "word_radar_audio_visible_without_playback_proof",
      "Word Radar requested target narration, but the session has no playback proof that the visible hear/speaker control actually played audio.",
    );
  }
  if (wordRadarVoiceDisabled) {
    add(
      "high",
      "word_radar_voice_disabled_with_hear_control",
      "Word Radar showed a voice/hear control while voiceEnabled=false; the child sees an affordance that cannot be trusted.",
    );
  }
  const targetEvidenceByNode = new Map<string, boolean>();
  for (const row of traces) {
    const nodeId = String(row.nodeId ?? "");
    if (!nodeId) continue;
    if (
      targetResultsFrom(row).length > 0 ||
      (Array.isArray(row.correctWords) && row.correctWords.length > 0) ||
      (Array.isArray(row.missedWords) && row.missedWords.length > 0)
    ) {
      targetEvidenceByNode.set(nodeId, true);
    }
  }
  if (
    traces.some((row) =>
      String(row.type ?? "") === "next_plan_unchanged" &&
      /not a word-driven homework activity/i.test(String(row.reason ?? "")) &&
      targetEvidenceByNode.get(String(row.nodeId ?? "")) === true &&
      /mystery|wheel/.test(activityName(row) || lower(row.game))
    )
  ) {
    add(
      "high",
      "mystery_word_evidence_ignored",
      "Mystery/Wheel target evidence existed for the node, but the next-plan decision ignored it as non-word-driven.",
    );
  }

  const adaptationChanged =
    lower(adaptationDiff?.status) === "changed" ||
    adaptationDiff?.changed === true ||
    lower((planAfter?.adaptationDecision as Record<string, unknown> | undefined)?.status) === "changed";
  if (adaptationChanged && (!planHasVisibleBoardShape(planBefore) || !planHasVisibleBoardShape(planAfter))) {
    add(
      "high",
      "visible_adaptation_diff_missing",
      "Post-session adaptation says it changed, but plan-before/plan-after do not contain a visible board shape or readable next-board diff.",
    );
  }
  const truthAdaptation =
    postSessionTruth?.adaptationDecision &&
    typeof postSessionTruth.adaptationDecision === "object" &&
    !Array.isArray(postSessionTruth.adaptationDecision)
      ? (postSessionTruth.adaptationDecision as Record<string, unknown>)
      : null;
  const decisionAdaptation =
    planAfter?.adaptationDecision &&
    typeof planAfter.adaptationDecision === "object" &&
    !Array.isArray(planAfter.adaptationDecision)
      ? (planAfter.adaptationDecision as Record<string, unknown>)
      : null;
  const adaptationStatus =
    lower(truthAdaptation?.status) ||
    lower(decisionAdaptation?.status) ||
    lower(adaptationDiff?.status);
  if (
    activityReadings.length > 0 &&
    (!adaptationStatus || adaptationStatus === "missing" || adaptationStatus === "requires_psychologist_interpretation")
  ) {
    add(
      "high",
      "missing_psychologist_adaptation_decision",
      "Normalized activity readings exist, but the session has no psychologist decision or next-plan diff that interprets them.",
    );
  }

  const attempts = summaryTotalAttempts(summary);
  const chartAttemptEvents = events.filter((row) =>
    ["attempt_event", "session_finalized"].includes(String(row.action ?? "")) ||
    String(row.component ?? "") === "engine",
  );
  if (attempts === 0 && traces.some((row) => String(row.type ?? "") === "node_complete")) {
    add("high", "zero_attempt_summary_mismatch", "Summary reports zero attempts even though game traces include completed nodes.");
  }

  const repeatedAheadHelp = countMentions(transcript, /a-head|uh-head|ahead/gi);
  if (repeatedAheadHelp >= 5) {
    add("warning", "repeated_help_loop", `Transcript contains ${repeatedAheadHelp} ahead/a-head help mentions; check scaffold escalation.`);
  }
  if (/\b(cashew|cash shoe)\b/i.test(transcript)) {
    add("warning", "misheard_off_topic_response", "Transcript includes likely off-topic cashew/cash-shoe response.");
  }
  if (/\bnot (ee-lah|ila)|\bayla\b|\bisla\b/i.test(transcript)) {
    add("warning", "child_name_pronunciation", "Child corrected name pronunciation; verify spoken-name preference.");
  }
  if (
    /silent\s+c[^\n.]{0,80}\bclimb\b|\bclimb\b[^\n.]{0,80}silent\s+c/i.test(transcript) ||
    repeatedAheadHelp >= 5
  ) {
    add(
      "high",
      "companion_stale_or_wrong_target_hint",
      "Elli gave a stale, repeated, or academically wrong target-specific hint instead of grounding help in current activity truth.",
    );
  }

  const wordRadarCompletion = traces
    .filter((row) => lower(row.game ?? row.activityId).includes("word-radar"))
    .reverse()
    .find((row) => row.accuracy !== undefined || targetResultsFrom(row).length > 0);
  const wordRadarAccuracy = Number(wordRadarCompletion?.accuracy);
  const wordRadarTier = lower(wordRadarCompletion?.evidenceTier);
  if (
    /\b(100 percent|100%|perfect|crushed)\b/i.test(transcript) &&
    ((Number.isFinite(wordRadarAccuracy) && wordRadarAccuracy < 0.95) ||
      wordRadarTier === "practice")
  ) {
    add(
      "high",
      "companion_false_mastery_claim",
      "Companion claimed perfect/mastery language that contradicted authoritative Word Radar evidence.",
    );
  }
  const bossUnlockTrace = traces.some((row) =>
    lower(row.game ?? row.activityId).includes("boss") &&
    /\bunlocked|complete|completed\b/.test(lower(row.phase ?? row.masteryUnlockState ?? row.bossState)),
  );
  if (/\bboss\b[^\n.]{0,80}\bunlocked\b/i.test(transcript) && !bossUnlockTrace) {
    add(
      "high",
      "companion_false_boss_unlock_claim",
      "Companion claimed boss unlocked, but no authoritative boss unlock trace exists.",
    );
  }

  return {
    sessionDir: resolved,
    issues,
    counts: {
      events: events.length,
      gameTraces: traces.length,
      chartAttemptEvents: chartAttemptEvents.length,
      transcriptWordRadarMentions: countMentions(transcript, /\bword radar\b/gi),
    },
  };
}

export function renderAuditMarkdown(report: AuditReport): string {
  const lines = [
    "# Sunny Session Audit",
    "",
    `sessionDir: ${report.sessionDir}`,
    "",
    "## Counts",
    ...Object.entries(report.counts).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Issues",
  ];
  if (report.issues.length === 0) {
    lines.push("- none detected");
  } else {
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function parseDirArg(argv: string[]): string {
  const flag = argv.find((arg) => arg.startsWith("--dir="));
  if (flag) return flag.slice("--dir=".length);
  const idx = argv.indexOf("--dir");
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]!;
  throw new Error("usage: npm run sunny:session:audit -- --dir=/path/to/session");
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const dir = parseDirArg(process.argv.slice(2));
  const report = auditSessionDirectory(dir);
  const markdown = renderAuditMarkdown(report);
  fs.writeFileSync(path.join(report.sessionDir, "audit.md"), markdown, "utf8");
  process.stdout.write(markdown);
}
