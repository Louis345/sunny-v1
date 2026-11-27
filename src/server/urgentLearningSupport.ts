import { replyOverlap } from "../engine/companionPresenceAudit";
import { childPaceFacts, itemAttemptFacts } from "./itemAttemptFacts";
import { sunnyHealthFacts } from "../engine/sunnyHealth";
import { isCompanionSpeechMuted, noteCompanionHelpOnItem } from "./companionItemHelp";
import { gamePaceFacts, noteGamePace } from "./gamePace";
import { unnamedPetFacts } from "./creatureCare";
import { normalizeSpeechText } from "../engine/helpRequest";
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      "The live activity context hides the answer. Pointing toward the answer, ruling choices out, or changing the choices would change what this item measures.",
      input.trigger === "guided_prompt"
        ? "The activity invited this, not her: it is not a help request from her."
        : "She asked for this; it is saved as support, never mastery.",
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
  // A game with problems that has not said which one is open: the companion is told it cannot see it (2026-11-10:
  // Elli guessed from Ila counting aloud and told her a wrong answer three times). Code-owned fact, no script.
  const openContract = input.snapshot?.nodeId ? cycle?.nodes.find(node => node.nodeId === input.snapshot?.nodeId)?.evidenceContract : undefined;
  const unseen = activityOnScreen && !openProblem && Object.keys({ ...openContract?.itemContracts, ...openContract?.spellingItems }).length > 0
    && !(input.spellingAssessment && input.snapshot?.itemId === input.spellingAssessment.itemId);
  if (unseen) console.log(` 🎮 [companion-context] [problem-unseen] child=${input.childId} node=${input.snapshot?.nodeId}`);
  const unseenText = unseen ? "[What Sunny can see]\nSunny cannot see which problem is on her screen right now: the game has not said which one is open. You do not know its numbers, its words or its answer." : "";
  // Pace facts in every game, for her companion's judgment (2026-11-10); talking to her companion in a game is help asked.
  if (input.presence === "summoned" && input.snapshot?.nodeId) noteGamePace(input.childId, input.snapshot.nodeId, "help");
  // Her tries on the open problem and her pace from her chart (2026-11-10): facts, the companion judges.
  const pace = activityOnScreen ? [gamePaceFacts(input.childId, input.snapshot?.nodeId), itemAttemptFacts(input.childId, input.snapshot?.nodeId, input.snapshot?.itemId),
    input.snapshot?.nodeId ? childPaceFacts(chart?.demographics, cycle) : ""].filter(Boolean).join("\n") : "";
  // Her companion answering while a problem is open is help on that problem: saved with its answer (2026-11-10).
  if (openProblem && input.presence === "summoned" && input.snapshot?.nodeId && input.snapshot.itemId) noteCompanionHelpOnItem(input.childId, input.snapshot.nodeId, input.snapshot.itemId);
  const remembered = buildShowroomTalkMemoryPrompt(
    withoutRememberedPosition(readCompanionCareMemoryForPrompt(input.childId, input.companionId)),
  );
  const memory = remembered && [remembered,
    "That memory is from past sessions. Where she is now, what she just did and what is next are on the live board and screen above."].join("\n");
  let spelling = "";
  const assessment = input.spellingAssessment;
  if (assessment && activityOnScreen && input.snapshot?.itemId === assessment.itemId) {
    const items = cycle?.nodes.find(node => node.nodeId === assessment.nodeId)?.evidenceContract.spellingItems;
    const last = cycle?.observations?.filter(observation => items?.[observation.itemId]).at(-1);
    spelling = ["[Canonical spelling activity facts]",
      JSON.stringify({ itemId:assessment.itemId, ...(input.snapshot.spellingSupportMode === "pronunciation_model" ? {spokenStimulus:assessment.word} : {}),
        instrument:assessment.instrument, lastAcknowledgedStimulusRates:assessment.lastStimulusRates ?? null, answerVisibility:input.snapshot.answerVisibility,
        ...(cycle ? {lastSubmittedResponse:last ? {itemId:last.itemId,response:last.childResponse,result:last.result,assistance:last.assistance} : null} : {recordedHistoryAvailable:false}) }),
      "The activity takes her typed answer and grades it; saying letters aloud is not a submitted answer. These facts are newer than anything said earlier in the conversation.",
      assessment.instrument === "practice" ? "This word is practice: help counts as part of learning it." : "This word is a check: it measures what she spells on her own.",
    ].join("\n");
  }
  // The school test as her goal plus facts (owner, 2026-11-08): Elli judges how much help fits.
  const testObjective = cycle?.domain === "spelling" ? companionSpellingTestObjective({ cycle, homework: chart?.homework, history: chart?.learningHistory,
    instrument: undefined })
    : cycle?.domain === "math" ? companionMathTestObjective({ cycle, homework: chart?.homework }) : "";
  // Sunny's own state as a fact (2026-11-10: Matilda promised "your answers will count" while every save failed).
  const health = sunnyHealthFacts(input.childId);
  const recent = recentRepliesFact(input.childId);
  // A pet she caught and has not named yet (Ila 11/22): a fact each turn, gone once she names it.
  const unnamedPets = unnamedPetFacts(input.childId);
  // What she can hear and who Sunny hears (Saori 11/22–11/25: 60 of 62 replies unheard; adults answered as her). Facts only.
  const speechMuted = isCompanionSpeechMuted(input.childId);
  if (speechMuted) console.log(` 🎮 [companion-context] [voice-muted] child=${input.childId} node=${input.snapshot?.nodeId ?? "none"}`);
  const hearing = ["[Hearing]", ...(speechMuted ? ["She has your voice muted on her screen: she cannot hear what you say."] : []),
    "Sunny's microphone hears everyone near the kiosk (her, her sister, the adults at the table) and cannot tell who spoke."].join("\n");
  return redactProtectedSpellingText([health, hearing, board, pace, liveBoard, tutorPlan, problemText, unseenText, recent, unnamedPets, input.speechRate === undefined ? "" : `Configured speech speed: ${input.speechRate} (1=normal; stays for every next problem in this game; another game or a check starts at normal pace).`, memory, testObjective, spelling].filter(Boolean).join("\n\n"), input.snapshot);
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
  const trying = decision?.experiment?.trying;
  const lines = ["[Her tutor's plan (the Planner, in its own words)]",
    ...(trying ? [`What the tutor is trying on this board: "${trying}"`] : plan ? [`What the tutor changes now: "${plan}"`] : decision?.reason ? [`The tutor's latest reasoning: "${decision.reason.slice(0, 400)}"`] : []),
    ...(decision?.selfReview?.whatIKeep ? [`What the tutor keeps because it worked for her: "${decision.selfReview.whatIKeep}"`] : []),
    ...(decision?.change?.length ? ["The tutor's changes for this board:", ...decision.change.map(line => `- ${line}`)] : []),
    ...(node ? [`This stop, "${node.title}", is for: ${node.openingScreen?.purpose ?? "not stated"}.${node.focus ? ` Aimed at: ${node.focus}.` : ""}`] : [])];
  return lines.length > 1 ? lines.join("\n") : "";
}

/**
 * What the companion said to her in the last few minutes, shown back to it as facts (Ila, 2026-11-16: "Elli is annoying,
 * she keeps saying the same over and over"). Per child, in memory; each reply is scored against the last three.
 */
const recentReplies = new Map<string, Array<{ at: number; text: string }>>();
const RECENT_MS = 5 * 60_000;
export function noteCompanionReply(childId: string, reply: string, now = Date.now()): { words: number; repeat: number } {
  const text = reply.trim();
  const kept = (recentReplies.get(childId) ?? []).filter(row => now - row.at < RECENT_MS);
  const repeat = Math.max(0, ...kept.slice(-3).map(row => replyOverlap(text, row.text)));
  if (text) recentReplies.set(childId, [...kept, { at: now, text }].slice(-3));
  return { words: (text.match(/[\p{L}\p{N}'-]+/gu) ?? []).length, repeat: Math.round(repeat * 100) / 100 };
}
function recentRepliesFact(childId: string, now = Date.now()): string {
  const rows = (recentReplies.get(childId) ?? []).filter(row => now - row.at < RECENT_MS);
  if (!rows.length) return "";
  return ["[What you said to her in the last few minutes, oldest first]", ...rows.map(row => `- "${row.text.slice(0, 220)}"`)].join("\n");
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
  if (input.speechCaptureArmed) return { action: "route_to_game" };
  return input.presence === "summoned"
    ? { action: "respond" }
    : { action: "ignore_ambient" };
}

type ProductComplaintKind = "companion_lag" | "flow_complaint" | "bug_report";

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

/**
 * Is this transcript plausibly her own single turn? (11/23: the parents' conversation by the kiosk became Ila's help
 * request three times.) Code owns provenance: speech with back-channels ("uh-huh", "-- yep --") is a conversation
 * between other people, and a transcript far longer than one child turn is the room, not her. Either way it is never
 * saved as her evidence; she still gets her reply. Her own turns that night: median 9 words.
 */
const BACK_CHANNEL = /(?:^|[\s.,!?-])(uh-huh|mm-hmm|mhm|uh huh|mm hmm)(?=[\s.,!?-]|$)|--\s*(yep|yeah|right|okay|ok)\.?\s*--/gi;
const MAX_ONE_TURN_WORDS = 60;