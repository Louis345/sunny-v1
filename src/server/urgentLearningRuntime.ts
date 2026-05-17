import type { ModelMessage } from "ai";
import type { ChildName } from "../companions/loader";
import { childIdFromName } from "../engine/learningEngine";
import { auditLog } from "./audit-log";
import type { ActivityMode } from "./session-context";
import type { SessionDebugRecorder } from "./session-debug-recorder";
import {
  auditConversationForLearningSignals,
  buildLiveLearningContext,
  chartEvidenceForUrgentIntent,
  detectUrgentChildIntent,
  looksLikeSessionEndRequest,
  type LiveLearningContext,
  type UrgentChildIntent,
} from "./urgentLearningSupport";

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
  const suppressibleGames = new Set(["pronunciation"]);
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

  const text = input.transcript.trim();
  const commandLike =
    looksLikeSessionEndRequest(text) ||
    /^(hey\s+)?(matilda|elli|sunny|charlotte)\b/i.test(text) ||
    /^(stop|pause|help|end session|quit|back to map)\b/i.test(text) ||
    /\b(what word|which word|say the word|say it|didn'?t say|did not say|that'?s wrong|not right|game skipped|it skipped)\b/i.test(text) ||
    /\b(worse than before|wrong words?|same words?|not high frequency|more words only|make some more words|fix this|this is bad)\b/i.test(text) ||
    /\b(matilda|elli|sunny|charlotte)\b/i.test(text);
  if (commandLike) return false;

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

export function detectUrgentLearningRoute(input: {
  transcript: string;
  childName: ChildName;
  companionName: string;
  currentActivityState: CurrentActivityState;
  currentCanvasState: SessionCanvasState;
}): { context: LiveLearningContext; intent: UrgentChildIntent } | null {
  const context = buildLiveLearningContext({
    childId: childIdFromName(input.childName),
    childName: input.childName,
    companionName: input.companionName,
    currentActivityState: input.currentActivityState,
    currentCanvasState: input.currentCanvasState,
  });
  const intent = detectUrgentChildIntent(input.transcript, context);
  return context && intent ? { context, intent } : null;
}

async function persistUrgentLearningEvidence(input: {
  intent: UrgentChildIntent;
  context: LiveLearningContext;
  transcript: string;
  sessionId: string;
  hostRecordChildSignal: HostRecordFn;
  hostRecordProductIssue: HostRecordFn;
}): Promise<void> {
  const evidence = chartEvidenceForUrgentIntent(input.intent, input.context, input.transcript);
  for (const signal of evidence.childSignals) {
    await input.hostRecordChildSignal({ ...signal, sessionId: input.sessionId }).catch((err: unknown) => {
      console.error("  🔴 [urgent-learning] child signal failed:", err);
      return {};
    });
  }
  for (const issue of evidence.productIssues) {
    await input.hostRecordProductIssue({ ...issue, sessionId: input.sessionId }).catch((err: unknown) => {
      console.error("  🔴 [urgent-learning] product issue failed:", err);
      return {};
    });
  }
}

export async function handleUrgentLearningTranscript(input: {
  transcript: string;
  stateBefore: string;
  auditRound: number;
  auditChild: string;
  tts: string;
  context: LiveLearningContext;
  intent: UrgentChildIntent;
  sessionId: string;
  debugRecorder: SessionDebugRecorder;
  conversationHistory: ConversationHistory;
  send: SendFn;
  bargeIn: () => void;
  clearPendingTranscript: (reason: string) => void;
  recordDebugTranscript: (role: "assistant" | "user", text: string) => void;
  handleCompanionTurn: (text: string) => Promise<void>;
  hostRecordChildSignal: HostRecordFn;
  hostRecordProductIssue: HostRecordFn;
}): Promise<void> {
  if (
    input.stateBefore === "PROCESSING" ||
    input.stateBefore === "SPEAKING" ||
    input.stateBefore === "CANVAS_PENDING"
  ) {
    input.bargeIn();
  } else {
    input.clearPendingTranscript("urgent_learning_support");
  }

  auditLog("transcript", {
    action: "urgent_learning_support",
    turnState: input.stateBefore,
    tts: input.tts,
    childName: input.auditChild,
    round: input.auditRound,
  });
  input.debugRecorder.recordEvent("transcript", "urgent_learning_support", {
    intent: input.intent.type,
    reason: input.intent.reason,
    stateBefore: input.stateBefore,
    round: input.auditRound,
    transcriptLength: input.transcript.length,
    currentWord: input.context.currentWord,
    activityId: input.context.activityId,
  });
  input.debugRecorder.recordTranscript("user", input.transcript);
  input.send("final", { text: input.transcript });
  input.send("echo_answer", { text: input.transcript });
  input.conversationHistory.push({ role: "user", content: input.transcript });

  input.debugRecorder.recordEvent("urgent_learning", "organic_route", {
    intent: input.intent.type,
    activityId: input.context.activityId,
    currentWord: input.context.currentWord,
    responseOwner: "elli",
  });
  await persistUrgentLearningEvidence(input);
}

export async function recordUrgentLearningEvidenceForOrganicTurn(input: {
  transcript: string;
  stateBefore: string;
  auditRound: number;
  auditChild: string;
  tts: string;
  context: LiveLearningContext;
  intent: UrgentChildIntent;
  sessionId: string;
  debugRecorder: SessionDebugRecorder;
  hostRecordChildSignal: HostRecordFn;
  hostRecordProductIssue: HostRecordFn;
}): Promise<void> {
  auditLog("transcript", {
    action: "urgent_learning_organic",
    turnState: input.stateBefore,
    tts: input.tts,
    childName: input.auditChild,
    round: input.auditRound,
  });
  input.debugRecorder.recordEvent("transcript", "urgent_learning_organic", {
    intent: input.intent.type,
    reason: input.intent.reason,
    stateBefore: input.stateBefore,
    round: input.auditRound,
    transcriptLength: input.transcript.length,
    currentWord: input.context.currentWord,
    activityId: input.context.activityId,
  });
  input.debugRecorder.recordGameTrace({
    type: "urgent_learning_organic",
    source: "session_manager",
    intent: input.intent.type,
    reason: input.intent.reason,
    game: input.context.activityId,
    activityId: input.context.activityId,
    nodeId: input.context.nodeId,
    currentWord: input.context.currentWord,
    transcript: input.transcript,
  });
  await persistUrgentLearningEvidence(input);
}

export async function runSessionLearningSignalAudit(input: {
  childId: string;
  sessionId: string;
  conversationHistory: ConversationHistory;
  recentActivityState: CurrentActivityState;
  hostRecordChildSignal: HostRecordFn;
  hostRecordProductIssue: HostRecordFn;
}): Promise<void> {
  const messages = input.conversationHistory
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .filter((text) => text.trim().length > 0);
  const findings = auditConversationForLearningSignals({
    childId: input.childId,
    sessionId: input.sessionId,
    messages,
    recentActivityState: input.recentActivityState,
  });
  for (const signal of findings.childSignals) {
    await input.hostRecordChildSignal(signal).catch((err: unknown) => {
      console.error("  🔴 [session-audit] child signal failed:", err);
      return {};
    });
  }
  for (const issue of findings.productIssues) {
    await input.hostRecordProductIssue(issue).catch((err: unknown) => {
      console.error("  🔴 [session-audit] product issue failed:", err);
      return {};
    });
  }
  if (findings.childSignals.length || findings.productIssues.length) {
    console.log(
      `  🎮 [session-audit] [signals] child=${input.childId} childSignals=${findings.childSignals.length} productIssues=${findings.productIssues.length}`,
    );
  }
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
