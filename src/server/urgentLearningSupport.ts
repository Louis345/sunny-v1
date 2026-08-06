import type {
  ChildSignalInput,
  ChildSignalType,
  ChildSignalDimension,
} from "../engine/childSignals";
import type { ProductIssueInput } from "../engine/productIssues";
import { buildShowroomTalkMemoryPrompt } from "./companionShowroomTalk";
import {
  maybeCompactCompanionInteractionMemory,
  readCompanionCareMemoryForPrompt,
  recordCompanionInteractionEvent,
} from "./companionInteractionMemory";
import {
  buildCurrentBoardSnapshotContext,
  type CurrentBoardSnapshot,
} from "./currentBoardSnapshot";
import { shouldPersistSessionData } from "../utils/runtimeMode";

export type UrgentIntentType =
  | "help_request"
  | "frustration"
  | "autonomy_pushback"
  | "bug_report"
  | "stop_or_pause"
  | "companion_name_call";

export type LiveLearningContext = {
  childId: string;
  childName: string;
  companionName: string;
  activityId: string;
  nodeId?: string;
  currentWord?: string;
  wordIndex?: number;
  totalWords?: number;
  phase?: string;
  lastHeard?: string;
  lastOutcome?: string;
  missCount?: number;
  accuracy?: number;
  updatedAt: string;
};

export type UrgentChildIntent = {
  type: UrgentIntentType;
  shouldInterrupt: boolean;
  reason: string;
};

export type UrgentEvidence = {
  childSignals: Array<Omit<ChildSignalInput, "createdAt">>;
  productIssues: Array<Omit<ProductIssueInput, "createdAt">>;
};

type BuildContextInput = {
  childId: string;
  childName: string;
  companionName?: string;
  currentActivityState?: Record<string, unknown> | null;
  currentCanvasState?: Record<string, unknown> | null;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeActivityId(value: string | undefined): string {
  return (value ?? "unknown_activity").trim().toLowerCase().replace(/\s+/g, "-");
}

export function buildLiveLearningContext(input: BuildContextInput): LiveLearningContext | null {
  const state = input.currentActivityState ?? input.currentCanvasState;
  if (!state) return null;
  const activityId = normalizeActivityId(
    asString(state.activityId) ??
      asString(state.game) ??
      asString(state.mode) ??
      asString(input.currentCanvasState?.mode),
  );
  if (activityId === "unknown_activity") return null;

  const currentWord =
    asString(state.currentWord) ??
    asString(state.word) ??
    asString(state.targetWord) ??
    asString(input.currentCanvasState?.spellingWord);

  return {
    childId: input.childId,
    childName: input.childName,
    companionName: input.companionName ?? "Sunny",
    activityId,
    nodeId: asString(state.nodeId),
    currentWord,
    wordIndex: asNumber(state.wordIndex ?? state.itemIndex),
    totalWords: asNumber(state.totalWords ?? state.totalItems),
    phase: asString(state.phase),
    lastHeard: asString(state.lastHeard),
    lastOutcome: asString(state.lastOutcome ?? state.outcome),
    missCount: asNumber(state.missCount ?? state.attempt),
    accuracy: asNumber(state.accuracy),
    updatedAt: new Date().toISOString(),
  };
}

function isActiveLearningGame(context: LiveLearningContext | null): context is LiveLearningContext {
  if (!context) return false;
  return /pronunciation|spell-check|word-radar|monster-stampede|wheel/.test(context.activityId);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSpeechText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type CompanionPresenceTranscriptRoute =
  | { action: "route_to_game" }
  | { action: "dismiss" }
  | { action: "summon_and_respond" }
  | { action: "respond" }
  | { action: "ignore_ambient" };

export type CompanionPresence = "collapsed" | "summoned";
export type CompanionPresenceReason = "client" | "voice" | "read_instruction";
export type CompanionDisposition = "standby_after_speech" | "await_child_response";
export type CompanionInteractionMode = "activity_help" | "conversation";

export function transitionCompanionPresence(input: {
  state: CompanionPresence;
  reason: CompanionPresenceReason;
}): { presence: CompanionPresence; mode: CompanionInteractionMode } {
  return {
    presence: input.state,
    mode: input.state === "summoned" && input.reason !== "read_instruction"
      ? "conversation"
      : "activity_help",
  };
}

export function dispositionAfterReset(mode: CompanionInteractionMode): CompanionDisposition {
  return mode === "conversation" ? "await_child_response" : "standby_after_speech";
}

export function companionPresenceAfterSpeech(input: {
  presence: CompanionPresence;
  mode: CompanionInteractionMode;
  disposition: CompanionDisposition;
}): "none" | "conversation_open" | "await_child_response" | "collapse" {
  if (input.presence !== "summoned") return "none";
  if (input.mode === "conversation") return "conversation_open";
  if (input.disposition === "await_child_response") return "await_child_response";
  return "collapse";
}

export function prepareInstructionReadRequest(input: {
  nodeId: string;
  activityId: string;
  itemId: string;
  prompt: string;
  requestCount: number;
  answerVisibility: string;
  previousRequestKey: string | null;
}): { requestKey: string; prompt: string; trace: Record<string, unknown> } | null {
  const prompt = input.prompt.trim();
  if (!prompt || input.answerVisibility !== "hidden") return null;
  const requestKey = `${input.nodeId}:${input.itemId}:${input.requestCount}`;
  if (requestKey === input.previousRequestKey) return null;
  return {
    requestKey,
    prompt,
    trace: {
      type: "instructional_read_aloud",
      source: "companion",
      activityId: input.activityId,
      nodeId: input.nodeId,
      itemId: input.itemId,
      evidenceRole: "support",
      masteryEligible: false,
    },
  };
}

export function buildActivityCompanionContext(input: {
  snapshot: CurrentBoardSnapshot | null;
  childSpeech?: string;
  childId: string;
  companionId: string;
  presence: CompanionPresence;
}): string {
  const board = buildCurrentBoardSnapshotContext(input.snapshot, { childSpeech: input.childSpeech });
  const memory = buildShowroomTalkMemoryPrompt(
    readCompanionCareMemoryForPrompt(input.childId, input.companionId),
  );
  const helpObjective = input.presence === "summoned" && input.snapshot
    ? [
        "Activity-help objective:",
        "Resolve the child's request briefly from the answer-hidden activity context.",
        "Ask one short understanding question only when it adds value; if you do, set companionAct presenceAfterSpeech=await_child_response.",
        "Otherwise return control to the activity and allow the companion to return to standby.",
      ].join("\n")
    : "";
  return [board, memory, helpObjective].filter(Boolean).join("\n\n");
}

export function recordActivityCompanionHelp(input: {
  childId: string;
  companionId: string;
  userMessage: string;
  companionText: string;
  snapshot: CurrentBoardSnapshot | null;
  presence: CompanionPresence;
}): void {
  if (!shouldPersistSessionData() || !input.snapshot || input.presence !== "summoned") return;
  recordCompanionInteractionEvent({
    childId: input.childId,
    companionId: input.companionId,
    callSource: "activity_help",
    relationshipState: "selected",
    eventType: "companion_talk_completed",
    questionText: input.userMessage,
    companionText: input.companionText,
    commandCount: 0,
    visionUsed: false,
  });
  void maybeCompactCompanionInteractionMemory({
    childId: input.childId,
    companionId: input.companionId,
  }).catch((error: unknown) => {
    console.error(" 🔴 [companion-memory] [activity-help-compact] [failed]", error);
  });
}

export function isCompanionWakeOnlyTranscript(transcript: string, companionName: string): boolean {
  const text = normalizeSpeechText(transcript).replace(/^(?:hey|hi|okay|ok)\s+/, "");
  return new Set(["sunny", "elli", "ellie", normalizeSpeechText(companionName)]).has(text);
}

export function handleCompanionPresenceTranscript(input: {
  enabled: boolean;
  transcript: string;
  presence: CompanionPresence;
  companionName: string;
  speechCaptureArmed: boolean;
  nodeId?: string;
  sendFinal: (text: string) => void;
  setPresence: (state: CompanionPresence, reason: CompanionPresenceReason) => void;
  recordEvent: (component: string, action: string, fields: Record<string, unknown>) => void;
}): boolean {
  if (!input.enabled) return false;
  const route = routeCompanionPresenceTranscript(input);
  if (route.action === "route_to_game") {
    input.sendFinal(input.transcript);
    input.recordEvent("transcript", "routed_to_game", {
      transcriptLength: input.transcript.length,
      nodeId: input.nodeId,
    });
    return true;
  }
  if (route.action === "dismiss") {
    input.setPresence("collapsed", "voice");
    input.recordEvent("companion_presence", "dismissed", { nodeId: input.nodeId });
    return true;
  }
  if (route.action === "ignore_ambient") {
    console.log("  🎮 [companion-presence] [ambient-ignored]");
    input.recordEvent("transcript", "ambient_ignored", {
      transcriptLength: input.transcript.length,
      nodeId: input.nodeId,
    });
    return true;
  }
  if (route.action === "summon_and_respond") {
    input.setPresence("summoned", "voice");
    return isCompanionWakeOnlyTranscript(input.transcript, input.companionName);
  }
  return false;
}

export function routeCompanionPresenceTranscript(input: {
  transcript: string;
  presence: "collapsed" | "summoned";
  companionName: string;
  speechCaptureArmed?: boolean;
}): CompanionPresenceTranscriptRoute {
  if (input.speechCaptureArmed) return { action: "route_to_game" };
  const text = normalizeSpeechText(input.transcript);
  if (!text) return { action: "ignore_ambient" };
  const aliases = [...new Set(["sunny", "elli", "ellie", input.companionName]
    .map(normalizeSpeechText)
    .filter(Boolean))];
  const aliasPattern = aliases.map(escapeRegExp).join("|");
  const aliasToken = `(?:${aliasPattern})`;
  const repeatedFarewell = `(?:bye|goodbye)(?:\\s+${aliasToken})?(?:\\s+(?:bye|goodbye)(?:\\s+${aliasToken})?)*`;
  const shortRecognizedFarewell = /^(?:(?:alright|okay|ok)\s+)?(?:bye|goodbye)(?:\s+\S+)?$/i;
  const dismissal = new RegExp(
    `^(?:${repeatedFarewell}|(?:dismiss|go away|im good|i am good)(?:\\s+${aliasToken})?)$`,
    "i",
  );
  if (
    input.presence === "summoned" &&
    (dismissal.test(text) || shortRecognizedFarewell.test(text))
  ) {
    return { action: "dismiss" };
  }
  const wake = new RegExp(
    `^(?:(?:hey|hi|okay|ok)\\s+)?(?:${aliasPattern})(?:\\b|$)`,
    "i",
  );
  if (wake.test(text)) return { action: "summon_and_respond" };
  return input.presence === "summoned"
    ? { action: "respond" }
    : { action: "ignore_ambient" };
}

type ProductComplaintKind = "companion_lag" | "flow_complaint" | "bug_report";

function classifyProductComplaintText(
  transcript: string,
  context: LiveLearningContext | null,
): ProductComplaintKind | null {
  const text = normalizeSpeechText(transcript);
  if (!text) return null;
  if (/\b(my name|say my name|name is|not ee lah|not ila|ayla|isla)\b/.test(text)) {
    return null;
  }
  if (/\b(behind|lag|lagging|too slow|not listening)\b/.test(text)) {
    return "companion_lag";
  }
  if (/\b(bug|broken|glitch|not working)\b/.test(text)) {
    return "bug_report";
  }
  if (
    isActiveLearningGame(context) &&
    /\b(worse than before|worse|wrong words?|same words?|not the right words?|not high frequency|make some more words|more words only|fix this|this is bad)\b/.test(text)
  ) {
    return "flow_complaint";
  }
  if (/\bi was explaining\b/.test(text)) return null;

  const hasActiveProductContext = isActiveLearningGame(context);
  const saysMissingPrompt =
    /\b(didnt|doesnt|dont|never|not)\s+(say|speak|read|tell|show)\b/.test(text) ||
    /\b(say|speak|read|tell|show)\s+(the\s+)?word\b/.test(text);
  const saysBeforeSpell =
    /\b(say|speak|read|tell)\b.*\bbefore\b.*\b(spell|type|answer|guess)\b/.test(text) ||
    /\bbefore\b.*\b(i|we)\b.*\b(spell|type|answer|guess)\b/.test(text);
  const saysFlowSkipped =
    /\b(game|it|this|that)\s+(skipped|skip|went too fast)\b/.test(text) ||
    /\bdidnt\s+give\s+me\s+a\s+turn\b/.test(text);
  const saysGroundedWrong =
    hasActiveProductContext &&
    (/\b(thats|that|this|it|you|game)\s+(is|was|are|were)?\s*(wrong|not right)\b/.test(text) ||
      /\b(thats|that|this|it)\s+not\s+right\b/.test(text));

  if (saysMissingPrompt || saysBeforeSpell || saysFlowSkipped || saysGroundedWrong) {
    return "flow_complaint";
  }
  return null;
}

export function looksLikeSessionEndRequest(
  transcript: string,
  companionName?: string,
): boolean {
  const text = normalizeSpeechText(transcript);
  if (!text) return false;

  if (/\b(end|quit|close|stop)\s+(the\s+)?session\b/.test(text)) return true;
  if (/^(goodbye|bye)\b/.test(text) && text.split(/\s+/).length <= 5) return true;

  const companionAliases = [
    companionName,
    "elli",
    "ellie",
    "matilda",
    "sunny",
    "charlotte",
  ]
    .map((alias) => normalizeSpeechText(alias ?? ""))
    .filter(Boolean);
  const uniqueAliases = [...new Set(companionAliases)];
  if (!uniqueAliases.length) return false;

  const companionPattern = new RegExp(
    `\\b(?:${uniqueAliases.map(escapeRegExp).join("|")})\\b`,
    "i",
  );
  if (!companionPattern.test(text)) return false;

  return /\b(n|in|and|end)\s+(the\s+)?(session|sesh)\b/.test(text);
}

function isShortCompanionNameCall(transcript: string, companionName: string): boolean {
  const companion = companionName.trim();
  if (!companion) return false;
  const words = transcript
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > 4) return false;
  const companionPattern = new RegExp(`\\b${escapeRegExp(companion)}\\b`, "i");
  return companionPattern.test(transcript);
}

export function detectUrgentChildIntent(
  transcript: string,
  context: LiveLearningContext | null,
): UrgentChildIntent | null {
  if (!isActiveLearningGame(context)) return null;
  const t = transcript.toLowerCase().trim();
  if (!t) return null;

  if (looksLikeSessionEndRequest(transcript, context.companionName)) return null;

  if (/\b(i do not need help|i don't need help|dont need help|don't help|stop helping|go away|i got it|let me do it|no help)\b/.test(t)) {
    return {
      type: "autonomy_pushback",
      shouldInterrupt: true,
      reason: "child_rejected_help",
    };
  }

  if (classifyProductComplaintText(transcript, context)) {
    return {
      type: "bug_report",
      shouldInterrupt: true,
      reason: "child_reported_product_issue",
    };
  }

  if (/\b(can you help|help me|help|i need help|i'm stuck|im stuck|stuck|i don't know|i dont know|what is it|how do i)\b/.test(t)) {
    return {
      type: "help_request",
      shouldInterrupt: true,
      reason: "child_requested_help",
    };
  }

  if (/\b(this is hard|too hard|i can't|i cant|can't do|cant do|i give up|ugh|frustrated|mad|angry|cry|hurts?)\b/.test(t)) {
    return {
      type: "frustration",
      shouldInterrupt: true,
      reason: "child_frustration_language",
    };
  }

  if (/\b(pause|wait|one second|hold on|slow down)\b/.test(t)) {
    return {
      type: "stop_or_pause",
      shouldInterrupt: true,
      reason: "child_requested_pause",
    };
  }

  if (isShortCompanionNameCall(transcript, context.companionName)) {
    return {
      type: "companion_name_call",
      shouldInterrupt: true,
      reason: "child_called_companion",
    };
  }

  return null;
}

function childSignal(
  context: LiveLearningContext,
  transcript: string,
  signalType: ChildSignalType,
  dimension: ChildSignalDimension,
  evidenceText: string,
): Omit<ChildSignalInput, "createdAt"> {
  return {
    childId: context.childId,
    activityId: context.activityId,
    domain: context.activityId === "pronunciation" ? "reading" : "spelling",
    signalType,
    dimension,
    valence: "negative",
    confidence: 0.9,
    evidenceText: evidenceText || `child said: "${transcript}"`,
    source: "observed_behavior",
    nodeId: context.nodeId,
  };
}

export function chartEvidenceForUrgentIntent(
  intent: UrgentChildIntent,
  context: LiveLearningContext,
  transcript: string,
): UrgentEvidence {
  if (intent.type === "bug_report") {
    const lower = transcript.toLowerCase();
    const complaintKind =
      classifyProductComplaintText(transcript, context) ??
      (/\b(behind|lag|slow|not listening)\b/.test(lower)
        ? "companion_lag"
        : "bug_report");
    return {
      childSignals: [],
      productIssues: [
        {
          childId: context.childId,
          activityId: context.activityId,
          issueType: complaintKind,
          severity: /\b(behind|lag|bug|broken|not working)\b/.test(lower)
            ? "high"
            : "medium",
          childUtterance: transcript,
          evidenceText: `child reported Sunny issue during ${context.activityId}: "${transcript}"`,
          confidence: 0.85,
          source: "child_utterance",
          nodeId: context.nodeId,
          activityState: { ...context },
        },
      ],
    };
  }

  const signal =
    intent.type === "autonomy_pushback"
      ? childSignal(context, transcript, "autonomy_pushback", "autonomy", `child rejected help: "${transcript}"`)
      : intent.type === "frustration"
        ? childSignal(context, transcript, "frustration", "reading", `child showed frustration language: "${transcript}"`)
        : intent.type === "stop_or_pause"
          ? childSignal(context, transcript, "frustration", "calm", `child requested pause/slowdown: "${transcript}"`)
          : childSignal(context, transcript, "help_needed", "help", `child requested help during ${context.activityId}: "${transcript}"`);

  return { childSignals: [signal], productIssues: [] };
}

export function auditConversationForLearningSignals(input: {
  childId: string;
  sessionId?: string;
  messages: string[];
  recentActivityState?: Record<string, unknown> | null;
}): UrgentEvidence {
  const text = input.messages.join("\n").toLowerCase();
  const context =
    buildLiveLearningContext({
      childId: input.childId,
      childName: input.childId,
      companionName: "Sunny",
      currentActivityState: input.recentActivityState ?? { game: "pronunciation" },
    }) ?? {
      childId: input.childId,
      childName: input.childId,
      companionName: "Sunny",
      activityId: "pronunciation",
      updatedAt: new Date().toISOString(),
    };
  const childSignals: UrgentEvidence["childSignals"] = [];
  const productIssues: UrgentEvidence["productIssues"] = [];

  if (
    /\bbiggest signal\b/.test(text) ||
    (/\bpractice reading\b/.test(text) && /\blistening to (the )?book\b/.test(text))
  ) {
    childSignals.push({
      childId: input.childId,
      activityId: context.activityId || "pronunciation",
      domain: "reading",
      signalType: "reading_struggle",
      dimension: "reading",
      valence: "negative",
      confidence: 0.9,
      evidenceText:
        "Parent/caregiver identified reading practice as the main signal after pronunciation struggle.",
      source: "parent_comment",
      sessionId: input.sessionId,
      nodeId: context.nodeId,
    });
  }

  const auditComplaintKind = classifyProductComplaintText(text, context);
  if (auditComplaintKind) {
    productIssues.push({
      childId: input.childId,
      activityId: context.activityId || "unknown_activity",
      issueType: auditComplaintKind,
      severity: "medium",
      childUtterance: "session transcript contained product complaint",
      evidenceText: "Session audit found a child/parent product complaint in the transcript.",
      confidence: 0.7,
      source: "observed_behavior",
      sessionId: input.sessionId,
      nodeId: context.nodeId,
      activityState: input.recentActivityState ?? null,
    });
  }

  return { childSignals, productIssues };
}
