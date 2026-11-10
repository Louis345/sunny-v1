import { sunnyHealthFacts } from "../engine/sunnyHealth";
import { getChildChart } from "../profiles/childChart";
import type { SpellingAssessmentState } from "./game-event-handler";
import type {
  ChildSignalInput,
  ChildSignalType,
  ChildSignalDimension,
} from "../engine/childSignals";
import type { ProductIssueInput } from "../engine/productIssues";
import { buildShowroomTalkMemoryPrompt } from "./companionShowroomTalk";
import { describeScreenForCompanion, screenShowsActivity, type ScreenReport } from "./screenReport";
import { currentBoardInstance } from "../engine/learningBoardInstances";
import { canonicalJourneyFrontier, canonicalJourneyLaunchable } from "../engine/learningCycleRepository";
import type { CompanionCareMemory } from "../shared/companionCareTypes";
import {
  maybeCompactCompanionInteractionMemory,
  readCompanionCareMemoryForPrompt,
  recordCompanionInteractionEvent,
} from "./companionInteractionMemory";
import {
  buildCurrentBoardSnapshotContext,
  redactProtectedSpellingText,
  type CurrentBoardSnapshot,
} from "./currentBoardSnapshot";
import { shouldPersistSessionData } from "../utils/runtimeMode";
import { companionMathTestObjective, companionSpellingTestObjective } from "../engine/schoolTestObjective";

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
  measurementRole?: "instruction" | "practice" | "fresh_checkpoint";
  trigger?: "guided_prompt" | "child_request";
  previousRequestKey: string | null;
}): { requestKey: string; prompt: string; trace: Record<string, unknown> } | null {
  const prompt = input.prompt.trim();
  if (!prompt || input.answerVisibility !== "hidden") return null;
  const requestKey = `${input.nodeId}:${input.itemId}:${input.requestCount}`;
  if (requestKey === input.previousRequestKey) return null;
  return {
    requestKey,
    prompt: [
      "Activity support turn:",
      input.trigger === "guided_prompt"
        ? "The targeted teaching activity has invited one automatic guided introduction."
        : "The child asked Elli to read or explain the current prompt.",
      `Frozen prompt: ${JSON.stringify(prompt)}`,
      `Measurement role: ${input.measurementRole ?? "unknown"}.`,
      "Use the live answer-hidden activity context. Speak naturally in one short, age-appropriate sentence.",
      "Read or briefly simplify what the child needs to do; do not reveal, imply, or eliminate toward the answer and do not alter the choices or scoring contract.",
      input.trigger === "guided_prompt"
        ? "This was system-invited support, not evidence that the child asked for help; do not record a help-needed child signal."
        : "This was child-requested support; record it only as support/interaction evidence, never mastery.",
      "Return control to the activity unless a brief understanding question is genuinely needed.",
    ].join("\n"),
    trace: {
      type: "instructional_companion_support",
      source: "companion",
      activityId: input.activityId,
      nodeId: input.nodeId,
      itemId: input.itemId,
      measurementRole: input.measurementRole ?? "unknown",
      trigger: input.trigger ?? "child_request",
      evidenceRole: "support",
      masteryEligible: false,
    },
  };
}

function readCompanionChart(childId: string) {
  try { return getChildChart(childId); }
  catch (error) {
    console.warn(" 🎮 [companion] [recorded-status] [unavailable]", error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

export function buildActivityCompanionContext(input: {
  speechRate?: number;
  spellingAssessment?: SpellingAssessmentState;
  snapshot: CurrentBoardSnapshot | null;
  childSpeech?: string;
  childId: string;
  companionId: string;
  presence: CompanionPresence;
  /** The kiosk's screen report: the only description of the screen, checked against the current board. */
  screenReport?: ScreenReport | null;
}): string {
  const reported = input.screenReport !== undefined;
  const chart = input.snapshot?.nodeId || reported ? readCompanionChart(input.childId) : undefined;
  const cycle = chart?.learningCycle;
  const snapshot = input.snapshot ? { ...input.snapshot,
    recordedActivityStatus: cycle?.nodes.find(node => node.nodeId === input.snapshot?.nodeId)?.state } : null;
  const activityState = buildCurrentBoardSnapshotContext(snapshot, { childSpeech: input.childSpeech });
  const published = (cycle?.boards ?? []).filter(board => board.publishedAt !== null).map(board => board.boardId);
  const boards = { published, newest: cycle?.boards?.length ? currentBoardInstance(cycle).boardId : undefined };
  const check = { report: input.screenReport ?? null, boards, activityNodeId: input.snapshot?.nodeId };
  // Activity state, help objective and spelling facts describe the open activity: only when it is on screen.
  const activityOnScreen = !reported || screenShowsActivity(check);
  const board = reported ? describeScreenForCompanion({ ...check, activityContext: activityState }) : activityState;
  const liveBoard = cycle ? describeLiveBoardForCompanion(cycle) : "";
  const tutorPlan = cycle ? describeTutorPlanForCompanion(cycle, input.snapshot?.nodeId) : "";
  // The problem she has open, as saved (never its answer), so the companion knows what is really there (BUGS.md 2026-11-09).
  const openProblem = input.snapshot?.itemId
    ? cycle?.nodes.find(node => node.nodeId === input.snapshot?.nodeId)?.evidenceContract.itemContracts?.[input.snapshot.itemId]?.prompt : undefined;
  const problemText = openProblem ? `[The problem she has open, as Sunny saved it]\n"${openProblem}"` : "";
  const remembered = buildShowroomTalkMemoryPrompt(
    withoutRememberedPosition(readCompanionCareMemoryForPrompt(input.childId, input.companionId)),
  );
  const memory = remembered && [remembered,
    "Memory is from past sessions: use it for who she is, never for where she is. Where she left off, what she just did and what is next come only from the live board and screen above; never offer a remembered game, round or level to resume."].join("\n");
  const helpObjective = input.presence === "summoned" && input.snapshot && activityOnScreen
    ? [
        "Activity-help objective:",
        "Resolve the child's request briefly from the answer-hidden activity context.",
        "Ask one short understanding question only when it adds value; if you do, set companionAct presenceAfterSpeech=await_child_response.",
        "Otherwise return control to the activity and allow the companion to return to standby.",
      ].join("\n")
    : "";
  let spelling = "";
  const assessment = input.spellingAssessment;
  if (assessment && activityOnScreen && input.snapshot?.itemId === assessment.itemId) {
    const items = cycle?.nodes.find(node => node.nodeId === assessment.nodeId)?.evidenceContract.spellingItems;
    const last = cycle?.observations?.filter(observation => items?.[observation.itemId]).at(-1);
    spelling = ["[Canonical spelling activity facts]",
      JSON.stringify({ itemId:assessment.itemId, ...(input.snapshot.spellingSupportMode === "pronunciation_model" ? {spokenStimulus:assessment.word} : {}),
        instrument:assessment.instrument, lastAcknowledgedStimulusRates:assessment.lastStimulusRates ?? null, answerVisibility:input.snapshot.answerVisibility,
        ...(cycle ? {lastSubmittedResponse:last ? {itemId:last.itemId,response:last.childResponse,result:last.result,assistance:last.assistance} : null} : {recordedHistoryAvailable:false}) }),
      "The activity owns answer submission and grading. Spoken repetition is not a submitted spelling answer. These facts supersede prior conversational grades; a hidden answer must not be revealed as written letters.",
      ...(assessment.instrument === "practice" ? [] : ["This word measures what she can do alone: let her make her own try before you give any letters, sounds or parts of it. Until her answer for this item is submitted, you may say the word again or encourage her."]),
    ].join("\n");
  }
  // The school test as her goal plus facts (owner, 2026-11-08): Elli judges how much help fits.
  const testObjective = cycle?.domain === "spelling" ? companionSpellingTestObjective({ cycle, homework: chart?.homework,
    instrument: spelling ? assessment?.instrument : undefined })
    : cycle?.domain === "math" ? companionMathTestObjective({ cycle, homework: chart?.homework }) : "";
  // Sunny's own state as a fact (2026-11-10: Matilda promised "your answers will count" while every save failed).
  const health = sunnyHealthFacts(input.childId);
  return redactProtectedSpellingText([health, board, liveBoard, tutorPlan, problemText, input.speechRate === undefined ? "" : `Configured speech speed: ${input.speechRate} (1=normal; resets on item or launch change).`, memory, helpObjective, testObjective, spelling].filter(Boolean).join("\n\n"), input.snapshot);
}

type CompanionCycle = NonNullable<NonNullable<ReturnType<typeof readCompanionChart>>["learningCycle"]>;

/**
 * The Planner's current plan, in its own words, and what the open stop is for (owner, 2026-11-09: the teacher and
 * the aide work in sync). Facts for Elli's judgment; how she helps stays hers.
 */
export function describeTutorPlanForCompanion(cycle: CompanionCycle, nodeId?: string): string {
  const decision = [...(cycle.decisionHistory ?? [])].reverse().find(row => row.eventType === "theory_decided");
  const node = nodeId ? cycle.nodes.find(candidate => candidate.nodeId === nodeId) : undefined;
  const plan = decision?.selfReview?.whatIChangeNow;
  const lines = ["[Her tutor's plan (the Planner, in its own words)]",
    ...(plan ? [`What the tutor changes now: "${plan}"`] : decision?.reason ? [`The tutor's latest reasoning: "${decision.reason.slice(0, 400)}"`] : []),
    ...(decision?.selfReview?.whatIKeep ? [`What the tutor keeps because it worked for her: "${decision.selfReview.whatIKeep}"`] : []),
    ...(decision?.change?.length ? ["The tutor's changes for this board:", ...decision.change.map(line => `- ${line}`)] : []),
    ...(node ? [`This stop, "${node.title}", is for: ${node.openingScreen?.purpose ?? "not stated"}.${node.focus ? ` Aimed at: ${node.focus}.` : ""}`] : [])];
  return lines.length > 1 ? lines.join("\n") : "";
}

/** The current board's path, its saved progress and the next step: the only answer to "where did I leave off". */
export function describeLiveBoardForCompanion(cycle: CompanionCycle): string {
  try {
    const board = currentBoardInstance(cycle);
    if (board.publishedAt === null) return "";
    const nodes = new Map(cycle.nodes.map(node => [node.nodeId, node]));
    const status = (nodeId: string) => {
      const node = nodes.get(nodeId);
      if (!node) return "missing";
      if (node.state === "completed") return "completed";
      return canonicalJourneyLaunchable(cycle, nodeId) === false ? "locked until an earlier step is done" : "open now";
    };
    const activity = (nodeId: string) => `${nodes.get(nodeId)?.title ?? nodeId} (${status(nodeId)})`;
    const definition = board.definition;
    const lines = ["[Live board: where she is, what she did, and what is next]",
      ...(definition?.title ? [`Board: ${definition.title}`] : [])];
    if (definition) {
      const portals = new Map(definition.portals.map(portal => [portal.id, portal]));
      const paths = new Map(definition.paths.map(path => [path.id, path.portalIds]));
      const root = paths.get(definition.rootPathId) ?? [];
      for (const portalId of root) {
        const portal = portals.get(portalId);
        const choice = definition.choices.find(candidate => candidate.portalId === portalId);
        if (choice) {
          const picked = cycle.routeSelection?.choices?.[choice.id];
          const options = choice.options.map(option => {
            const ids = (paths.get(option.pathId) ?? []).map(id => portals.get(id)?.activityNodeId).filter((id): id is string => Boolean(id));
            const titles = ids.map(activity).join(", ");
            const label = ids.length === 1 && nodes.get(ids[0])?.title === option.label ? "" : `${option.label}: `;
            return `${label}${titles}${picked === option.id ? " [picked]" : ""}`;
          });
          lines.push(`- Choice "${portal?.label ?? choice.id}" (play one): ${options.join(" | ")}`);
        } else if (portal?.activityNodeId) {
          lines.push(`- ${activity(portal.activityNodeId)}`);
        }
      }
    } else {
      lines.push(...board.nodeIds.map(nodeId => `- ${activity(nodeId)}`));
    }
    const frontier = canonicalJourneyFrontier(cycle);
    if (frontier?.complete) lines.push("Next step: this board is finished.");
    else if (frontier?.choiceId) {
      const choice = definition?.choices.find(candidate => candidate.id === frontier.choiceId);
      lines.push(`Next step: pick one at "${definition?.portals.find(portal => portal.id === choice?.portalId)?.label ?? frontier.choiceId}".`);
    } else if (frontier?.activityNodeId) lines.push(`Next step: ${nodes.get(frontier.activityNodeId)?.title ?? frontier.activityNodeId}.`);
    lines.push("If she asks where she left off or what to do, answer from this board only. Only activities listed here exist on her board.");
    return lines.join("\n");
  } catch (error) {
    console.warn(" 🎮 [companion] [live-board] [unavailable]", error instanceof Error ? error.message : String(error));
    return "";
  }
}

/** A remembered round, level or stopping point is stale the moment a new board opens. */
const REMEMBERED_POSITION = /\b(?:round|level|stage|wave|chapter)\s+\d+\b|\bleft off\b|\bresume\b|\bpick(?:ed)? up where\b|\bwhere (?:she|you|we|ila) (?:stopped|was|were)\b/i;

function withoutRememberedPosition(memory: CompanionCareMemory | undefined): CompanionCareMemory | undefined {
  if (!memory) return memory;
  const keep = (text: string) => !REMEMBERED_POSITION.test(text);
  const sentences = (text: string | undefined) => text?.split(/(?<=[.!?])\s+/).filter(keep).join(" ") || undefined;
  const list = (values: string[] | undefined) => values?.filter(keep);
  const dropped = [memory.lastSessionSummary, memory.lastEmotionalMoment, memory.rivalryNote, ...(memory.relationshipFacts ?? []), ...(memory.favoriteMoments ?? []), ...(memory.companionSelfNotes ?? [])]
    .filter((text): text is string => typeof text === "string" && REMEMBERED_POSITION.test(text)).length;
  if (dropped) console.log(` 🎮 [companion-memory] [position-filtered] dropped=${dropped}`);
  return { ...memory,
    lastSessionSummary: sentences(memory.lastSessionSummary), lastEmotionalMoment: sentences(memory.lastEmotionalMoment),
    rivalryNote: sentences(memory.rivalryNote), relationshipFacts: list(memory.relationshipFacts),
    favoriteMoments: list(memory.favoriteMoments), companionSelfNotes: list(memory.companionSelfNotes) };
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

export function handleCompanionPresenceTranscript(input: {
  enabled: boolean;
  transcript: string;
  presence: CompanionPresence;
  companionWakeNames: readonly string[];
  speechCaptureArmed: boolean;
  nodeId?: string;
  sendFinal: (text: string) => void;
  setPresence: (state: CompanionPresence, reason: CompanionPresenceReason) => void;
  recordEvent: (component: string, action: string, fields: Record<string, unknown>) => void;
  /** Files a child's bug report heard while the companion is minimized (BUGS.md 2026-11-08). */
  reportBug?: (transcript: string) => void;
}): boolean {
  if (!input.enabled) return false;
  const route = routeCompanionPresenceTranscript(input);
  // A bug report is filed even when the companion is minimized or a game is listening; the companion stays quiet.
  if ((route.action === "ignore_ambient" || route.action === "route_to_game") && input.reportBug && classifyProductComplaintText(input.transcript, null) === "bug_report") {
    console.log(` 🎮 [product-issue] [heard-while-minimized] node=${input.nodeId ?? "none"}`);
    input.reportBug(input.transcript);
  }
  if (route.action === "route_to_game") {
    input.sendFinal(input.transcript);
    input.recordEvent("transcript", "routed_to_game", {
      transcriptLength: input.transcript.length,
      nodeId: input.nodeId,
    });
    return true;
  }
  if (route.action === "dismiss") {
    console.log(` 🎮 [companion-presence] [dismissed] from=${input.presence}`);
    input.setPresence("collapsed", "voice");
    input.recordEvent("companion_presence", "dismissed", { nodeId: input.nodeId });
    return true;
  }
  if (route.action === "ignore_ambient") {
    const ignoredReason = normalizeSpeechText(input.transcript)
      ? "companion_collapsed_without_wake_phrase"
      : "transcript_empty_after_normalization";
    // The words go to the local console only; session events are uploaded.
    console.log(`  🎮 [companion-presence] [ambient-ignored] reason=${ignoredReason} text=${JSON.stringify(input.transcript)}`);
    input.recordEvent("transcript", "ambient_ignored", {
      transcriptLength: input.transcript.length,
      nodeId: input.nodeId,
      reason: ignoredReason,
      companionPresence: input.presence,
      speechCaptureArmed: input.speechCaptureArmed,
    });
    return true;
  }
  if (route.action === "summon_and_respond") {
    input.setPresence("summoned", "voice");
    return false;
  }
  return false;
}

/** A child asking for help, as speech recognition writes it (normalized, no punctuation). */
const HELP_REQUEST = /\b(?:(?:can|could|will|would) (?:you|i|u) (?:help|get help|have help|get some help)|help me|i need (?:some )?help|i want help|im stuck|i am stuck|i dont get it|i dont understand)\b/;

export function routeCompanionPresenceTranscript(input: {
  transcript: string;
  presence: "collapsed" | "summoned";
  companionWakeNames: readonly string[];
  speechCaptureArmed?: boolean;
}): CompanionPresenceTranscriptRoute {
  const text = normalizeSpeechText(input.transcript);
  if (!text) return { action: "ignore_ambient" };
  // Sunny wakes every companion; each companion file lists her own names.
  // "eddie" is how speech recognition hears Ila's "Ellie" (2026-11-05 dismissal transcript).
  const aliases = [...new Set(["sunny", "sonny", "sony", "eddie", ...input.companionWakeNames]
    .map(normalizeSpeechText)
    .filter(Boolean))];
  const aliasPattern = aliases.map(escapeRegExp).join("|");
  const aliasToken = `(?:${aliasPattern})`;
  const repeatedFarewell = `(?:bye|goodbye)(?:\\s+${aliasToken})?(?:\\s+(?:bye|goodbye)(?:\\s+${aliasToken})?)*`;
  const shortRecognizedFarewell = /^(?:(?:alright|okay|ok|k)\s+)?(?:bye|goodbye)(?:\s+\S+)?$/i;
  const dismissal = new RegExp(
    `^(?:${repeatedFarewell}|(?:dismiss|go away|im good|i am good)(?:\\s+${aliasToken})?)$`,
    "i",
  );
  // A goodbye anywhere, a go-away phrase, or her name with go/stop/bye dismisses her, collapsed or not,
  // so a dismissal never summons her. A bare "go" during play is not addressed to her.
  const goodbyeAnywhere = /\b(?:bye|goodbye)\b/.test(text) && !/\b(?:spell|spelling|spelled|mean|means|word|rhymes?)\b/.test(text);
  const goAwayPhrase = /\b(?:go away|leave me alone|stop talking|be quiet|shut up)\b/.test(text);
  const addressedGoStop = new RegExp(
    `(?:^|\\s)${aliasToken}\\s+(?:go|stop|leave)(?=\\s+(?:now|away|go|stop|no|${aliasPattern})(?:\\s|$)|$)|(?:^|\\s)stop\\s+${aliasToken}(?:\\s|$)`,
    "i",
  ).test(text);
  if (
    (input.presence === "summoned" && (dismissal.test(text) || shortRecognizedFarewell.test(text)))
    || goodbyeAnywhere || goAwayPhrase || addressedGoStop
  ) {
    return { action: "dismiss" };
  }
  const wake = new RegExp(`(?:^|\\s)(?:${aliasPattern})(?:\\b|$)`, "i");
  if (wake.test(text)) return { action: "summon_and_respond" };
  // A request for help is addressed to her companion whatever name was heard, even while a game listens
  // (Nov 8: Ila asked twice, was ignored, and ended up yelling).
  if (HELP_REQUEST.test(text)) {
    console.log(` 🎮 [companion-presence] [help-request] [summoned] armed=${input.speechCaptureArmed === true}`);
    return { action: "summon_and_respond" };
  }
  if (input.speechCaptureArmed) return { action: "route_to_game" };
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
