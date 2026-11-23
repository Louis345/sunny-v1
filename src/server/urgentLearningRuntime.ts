import type { ModelMessage } from "ai";
import type { ChildName } from "../companions/loader";
import { childIdFromName } from "../engine/learningEngine";
import { auditLog } from "./audit-log";
import type { ActivityMode } from "./session-context";
import type { SessionDebugRecorder } from "./session-debug-recorder";
import { buildLiveLearningContext } from "./urgentLearningSupport";

type SessionCanvasState = Record<string, unknown> | null;

type CurrentActivityState = Record<string, unknown> | null;

type SendFn = (type: string, payload?: Record<string, unknown>) => void;

type HostRecordFn = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;

type ConversationHistory = ModelMessage[];

type ActivityModeLike = ActivityMode | string;

function getActiveLearningGame(
  currentActivityState: CurrentActivityState,
  currentCanvasState: SessionCanvasState,
): string {
  const normalize = (value: unknown) =>
    String(value ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  const stateGame = normalize(currentActivityState?.game);
  const canvasMode = normalize((currentCanvasState as { mode?: ActivityModeLike } | null)?.mode);
  const suppressibleGames = new Set(["pronunciation", "word-radar"]);
  if (suppressibleGames.has(stateGame)) return stateGame;
  if (suppressibleGames.has(canvasMode)) return canvasMode;
  return "";
}

export function shouldSuppressTranscriptDuringActiveLearningGame(input: {
  transcript: string;
  currentActivityState: CurrentActivityState;
  currentCanvasState: SessionCanvasState;
}): boolean {
  const activeGame = getActiveLearningGame(input.currentActivityState, input.currentCanvasState);
  if (!activeGame) return false;

  const phase = String(
    input.currentActivityState?.phase ??
      input.currentActivityState?.event ??
      input.currentActivityState?.progress ??
      "",
  ).toLowerCase();
  if (phase.includes("complete") || phase.includes("done")) return false;

  // The game owns the mic until she names her companion (owner 2026-11-24: the name is the only switch; no keywords).
  if (/\b(matilda|elli|ellie|sunny|charlotte)\b/i.test(input.transcript)) return false;

  console.log(`  🎮 [${activeGame}] transcript suppressed during active game`);
  return true;
}

export function activeLearningSuppressionReason(input: {
  currentActivityState: CurrentActivityState;
  currentCanvasState: SessionCanvasState;
}): string {
  const activeGame = getActiveLearningGame(
    input.currentActivityState,
    input.currentCanvasState,
  );
  return activeGame ? `${activeGame}_active_game` : "active_learning_game";
}

export function recordPronunciationReadingStruggleSignal(input: {
  totalWords: number;
  accPct: number;
  correctCount: number;
  childName: ChildName;
  sessionId: string;
  emittedKeys: Set<string>;
  hostRecordChildSignal: HostRecordFn;
}): void {
  if (input.totalWords < 5 || input.accPct >= 60) return;
  const key = `${input.sessionId}:pronunciation-reading-struggle`;
  if (input.emittedKeys.has(key)) return;
  input.emittedKeys.add(key);
  void input.hostRecordChildSignal({
    childId: childIdFromName(input.childName),
    activityId: "pronunciation",
    domain: "reading",
    signalType: "reading_struggle",
    dimension: "reading",
    valence: "negative",
    confidence: 0.86,
    evidenceText: `Pronunciation completed at ${input.accPct}% (${input.correctCount}/${input.totalWords}), indicating reading/pronunciation support is needed.`,
    source: "observed_behavior",
    sessionId: input.sessionId,
  }).catch((err: unknown) => {
    console.error("  🔴 [pronunciation] reading struggle signal failed:", err);
    return {};
  });
}
