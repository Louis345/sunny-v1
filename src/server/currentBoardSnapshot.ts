import { childIdFromName } from "../engine/learningEngine";
import type { ChildName } from "../companions/loader";

export type CurrentBoardSnapshot = {
  childId: string;
  sessionId: string;
  nodeId?: string;
  activityId?: string;
  activityIntentId?: string;
  targetSelectorId?: string;
  intentPurpose?: string;
  diagnosticQuestion?: string;
  game?: string;
  phase?: string;
  currentTarget?: string;
  targetIsSpeakable: boolean;
  answerVisibility: "hidden" | "visible" | "revealed" | "unknown";
  itemIndex?: number;
  totalItems?: number;
  allowedActivities: string[];
  score?: number;
  coins?: number;
  coinsEarned?: number;
  lastOutcome?: string;
  lastOutcomeWord?: string;
  boardState?: string;
  progress?: string;
  wheelValue?: string;
  updatedAt: string;
};

type BuildSnapshotInput = {
  childId: string;
  sessionId: string;
  state: Record<string, unknown>;
  allowedActivities?: string[];
  now?: Date;
};

function asString(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : undefined;
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeAnswerVisibility(
  state: Record<string, unknown>,
): CurrentBoardSnapshot["answerVisibility"] {
  const explicit = asString(state.answerVisibility)?.toLowerCase();
  if (explicit === "hidden" || explicit === "visible" || explicit === "revealed") {
    return explicit;
  }

  const game = String(state.game ?? state.activityId ?? "").toLowerCase();
  const phase = String(state.phase ?? "").toLowerCase();
  if (game.includes("wheel")) {
    return phase === "won" || phase === "lost" || phase === "complete"
      ? "revealed"
      : "hidden";
  }
  return "visible";
}

export function buildCurrentBoardSnapshot(
  input: BuildSnapshotInput,
): CurrentBoardSnapshot {
  const state = input.state;
  const answerVisibility = normalizeAnswerVisibility(state);
  const rawTarget =
    asString(state.currentTarget) ??
    asString(state.currentWord) ??
    asString(state.target) ??
    asString(state.word);
  const targetIsSpeakable =
    Boolean(rawTarget) && answerVisibility !== "hidden";
  const allowedActivities =
    input.allowedActivities?.length
      ? input.allowedActivities
      : asStringArray(state.allowedActivities);

  const snapshot: CurrentBoardSnapshot = {
    childId: input.childId,
    sessionId: input.sessionId,
    targetIsSpeakable,
    answerVisibility,
    allowedActivities,
    updatedAt: (input.now ?? new Date()).toISOString(),
  };

  const stringFields: Array<[keyof CurrentBoardSnapshot, unknown]> = [
    ["nodeId", state.nodeId],
    ["activityId", state.activityId],
    ["activityIntentId", state.activityIntentId],
    ["targetSelectorId", state.targetSelectorId],
    ["intentPurpose", state.intentPurpose ?? state.activityIntentPurpose],
    ["diagnosticQuestion", state.diagnosticQuestion],
    ["game", state.game],
    ["phase", state.phase],
    ["lastOutcome", state.lastOutcome ?? state.action ?? state.lastAction],
    ["lastOutcomeWord", state.lastOutcomeWord],
    ["boardState", state.boardState],
    ["progress", state.progress],
    ["wheelValue", state.wheelValue],
  ];
  for (const [key, value] of stringFields) {
    const text = asString(value);
    if (text) {
      (snapshot as Record<string, unknown>)[key] = text;
    }
  }

  if (targetIsSpeakable && rawTarget) {
    snapshot.currentTarget = rawTarget;
  }

  for (const key of ["itemIndex", "totalItems", "score", "coins", "coinsEarned"] as const) {
    const n = asNumber(state[key]);
    if (typeof n === "number") snapshot[key] = n;
  }

  return snapshot;
}

export function buildCurrentBoardSnapshotContext(
  snapshot: CurrentBoardSnapshot | null,
  opts: { childSpeech?: string } = {},
): string {
  if (!snapshot) return "";
  const lines = [
    "[Internal live board state]",
    "This is board state, not child speech. Mention only activities, rewards, targets, and answers listed here.",
  ];
  const speech = asString(opts.childSpeech);
  if (speech) lines.push(`Child speech: "${speech}"`);
  if (snapshot.game) lines.push(`Current game: ${snapshot.game}`);
  if (snapshot.activityId) lines.push(`Current activity: ${snapshot.activityId}`);
  if (snapshot.intentPurpose) lines.push(`Activity intent: ${snapshot.intentPurpose}`);
  if (snapshot.diagnosticQuestion) lines.push(`Diagnostic question: ${snapshot.diagnosticQuestion}`);
  if (snapshot.nodeId) lines.push(`Current node: ${snapshot.nodeId}`);
  if (snapshot.phase) lines.push(`Phase: ${snapshot.phase}`);
  lines.push(`Answer visibility: ${snapshot.answerVisibility}`);
  if (snapshot.currentTarget) lines.push(`Current target: ${snapshot.currentTarget}`);
  if (snapshot.boardState) lines.push(`Board: ${snapshot.boardState}`);
  if (typeof snapshot.itemIndex === "number") {
    const total =
      typeof snapshot.totalItems === "number" ? String(snapshot.totalItems) : "?";
    lines.push(`Item ${snapshot.itemIndex + 1} of ${total}`);
  }
  if (snapshot.allowedActivities.length) {
    lines.push(`Allowed activities: ${snapshot.allowedActivities.join(", ")}`);
  }
  const hasReward =
    typeof snapshot.score === "number" ||
    typeof snapshot.coins === "number" ||
    typeof snapshot.coinsEarned === "number";
  if (!hasReward) {
    lines.push("No exact coin amount is available; do not state any coin total or reward amount.");
  }
  if (typeof snapshot.score === "number") lines.push(`Score: ${snapshot.score}`);
  if (typeof snapshot.coins === "number") lines.push(`Coins: ${snapshot.coins}`);
  if (typeof snapshot.coinsEarned === "number") {
    lines.push(`Coins earned: ${snapshot.coinsEarned}`);
  }
  if (snapshot.lastOutcome) lines.push(`Last outcome: ${snapshot.lastOutcome}`);
  if (snapshot.lastOutcomeWord) lines.push(`Last outcome word: ${snapshot.lastOutcomeWord}`);
  if (snapshot.wheelValue) lines.push(`Wheel landed on: ${snapshot.wheelValue}`);
  if (snapshot.progress) lines.push(`Progress: ${snapshot.progress}`);
  return lines.join("\n");
}

export function childIdForBoardSnapshot(childName: ChildName): string {
  return childIdFromName(childName);
}
