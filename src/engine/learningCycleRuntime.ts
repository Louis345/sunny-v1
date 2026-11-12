import {isDeepStrictEqual} from "node:util";
import { plannerDecisionView, plannerObservationView } from "./plannerEvidenceView";
import { successorMenuFacts } from "./plannerMenu";
import { schoolTestFacts, schoolTestLine, SPELLING_TEST_CONDITIONS, type HomeworkSources } from "./schoolTestObjective";
import { pastWeeksLine, readPastWeeks } from "./pastWeeks";
import { handoffSection } from "./sessionHandoff";
import { scorecardSection, timeRecord } from "./sessionScorecard";
import { observationNode } from "./observationNode";
import { gameTrackRecord } from "./gameTrackRecord";
import { childFeedbackSection, ownerReplanLine, plannerCallsSection, schoolTestSection, mathTrackRecordSection, plannerJournalSection, spellingTrackRecordSection, writePlannerJournalEntry, type PlannerSelfReview } from "./plannerIntrospection";
import type { PlannerExpectation } from "./learningCycleRepository";
import { spellingActivityCatalog } from "./assignmentPlanner";
import {readSuccessorBoardDefinition, assembleAdventureBoardDefinition, BOARD_DEFINITION_TOOL_SCHEMA, BOARD_AUTHORING_INSTRUCTION, type AdventureBoardComposition, type AdventureJourneyDefinition} from "../shared/adventureBoardDefinition";
import { canonicalJourneyLaunchable, isItemIntakeMathCycle, isRetryablePlannerBlock, isSpellingPracticeContinuation, repointReusedSetup } from './learningCycleRepository';
import {requestPlannerMessage, readPlannerToolReceipt, plannerTransportPolicy} from "./plannerTransport";
import fs from "node:fs";
import {randomUUID,createHash} from "node:crypto";
import { MATH_ITEMS_SCHEMA, drawJourney, parseDirectItem, type DirectItem } from "./directMathExperience";
import { runPlannerToolLoop } from "./plannerToolLoop";
import { providerTurnSender } from "./plannerToolProvider";
import { spellingSuccessorToolkit, type SuccessorFacts } from "./spellingSuccessorTools";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import { getChildChart } from "../profiles/childChart";
import { resolveChildContextDir } from "../utils/contextRoot";
import { hasReceivedMathProviderStage, readReceivedMathProviderStage, runMathProviderStage } from "./adaptiveMathDiscovery";
import { engagementTheoryEvidenceContext } from "./engagementTheory";
import { evaluateAcademicPredictions } from "./longitudinalLearning";
import {
  applyEvidenceBasedMathContentDecisions,
  validateEvidenceBasedContentDecisions,
  assertContentDecisionShape,
  type EvidenceBasedContentDecision,
} from "./learningDecisionContext";
import {
  getLearningCycle,
  transitionLatestLearningCycle,
  transitionLearningCycle,
  validateSpellingPrescription,
  spellingAssignmentItems,
  spellingBuiltInActivities,
  type LearningCycleEvidenceSummary,
  type LearningCycleRecordV2,
  type LearningCycleDecision,
  type LearningCycleRepositoryOptions,
  type LearningObservation,
  type LearningCycleSpellingItem,
  type LearningProgressionAction,
  type NextInstrumentPrescription,
  type SuccessorProgram,
} from "./learningCycleRepository";
import { areDistinctWordsPronunciationEquivalent } from "../shared/karaokeMatchWord";
import {boardDeliveries, currentBoardInstance, systemBlockedSection} from "./learningBoardInstances";
import { readTypedSpelling } from "./imeTypedSpelling";
import { activeOwnerNote } from "./ownerNotes";
import { LIBRARY_GAMES, type LibraryGameId } from "./libraryGames";

export type CanonicalCompletionResult = {
  /** Server-validated launch whose per-answer records already exist. */
  captureLaunchId?: string;
  completed: boolean;
  /** Terminal participation is separate from a native game's legacy win flag. */
  ended?: boolean;
  won?: boolean;
  earlyExit?: boolean;
  accuracy: number;
  timeSpent_ms: number;
  targetResults?: Array<{
    target: string;
    correct: boolean;
    attemptedValue?: string;
    responseTime_ms?: number;
    attempts?: number;
    scaffoldLevel?: number;
    evidenceRole?: "assisted_instruction";
    /** The screen text when the game opened this item (the game contract keeps it, not the game). */
    screenAtOpen?: string;
    /** Every try the game contract saw on this item, in order; each is saved as its own observation (2026-11-10). */
    tries?: Array<{ attemptedValue: string; at?: number }>;
  }>;
  frustrationSignals?: string[];
  replay?: boolean;
  companionInteractions?: string[];
  /** Problems her companion helped with while each was open, noted by the server (2026-11-10). */
  companionHelpItemIds?: string[];
  /** How she moved through an explainer page. Engagement evidence only; it never scores a word. */
  pageTime?: PageTime;
};

export type PageTime = { words: Array<{ word: string; shownMs: number; chunkTaps: number }>; questionMs?: number; afterQuestionMs?: number };

const milliseconds = (value: unknown) => Number.isFinite(value) && Number(value) >= 0 ? Math.round(Number(value)) : undefined;
/** The kiosk reports this, so only well-formed, bounded facts reach the cycle. */
export function pageTimeFromKiosk(value: unknown): PageTime | undefined {
  const given = value as { words?: unknown; questionMs?: unknown; afterQuestionMs?: unknown } | null | undefined;
  if (!given || !Array.isArray(given.words)) return undefined;
  const words = given.words.filter(row => typeof row?.word === "string" && row.word.trim()).slice(0, 12)
    .map(row => ({ word: String(row.word).slice(0, 60), shownMs: milliseconds(row.shownMs) ?? 0, chunkTaps: milliseconds(row.chunkTaps) ?? 0 }));
  const questionMs = milliseconds(given.questionMs), afterQuestionMs = milliseconds(given.afterQuestionMs);
  return { words, ...(questionMs === undefined ? {} : { questionMs }), ...(afterQuestionMs === undefined ? {} : { afterQuestionMs }) };
}
const seconds = (ms: number) => `${Math.round(ms / 1000)}s`;
function pageTimeSummary(time: PageTime | undefined): string {
  if (!time) return "";
  return `; page: ${[...time.words.map(row => `${row.word} ${seconds(row.shownMs)}, ${row.chunkTaps} tiles tapped`),
    ...(time.questionMs === undefined ? [] : [`answered the question in ${seconds(time.questionMs)}`]),
    ...(time.afterQuestionMs === undefined ? [] : [`left ${seconds(time.afterQuestionMs)} after it`])].join("; ")}`;
}

/** Which way she left the waiting screen: persistence, so engagement evidence, never a learning claim. */
export function recordExitChoice(childId: string, homeworkId: string, button: string, opts: LearningCycleRepositoryOptions = {}): LearningCycleRecordV2 {
  return transitionLatestLearningCycle(childId, homeworkId, { type: "engagement_noted", evidenceId: `exit:${button}:${new Date().toISOString()}`, summary: `On the waiting screen she chose: ${button.replace(/_/g, " ")}.` }, opts);
}

export type CanonicalProgressionDecision = {
  status: "supported" | "revised" | "falsified" | "inconclusive" | "awaiting_calibration";
  reason: string;
  progressionAction: LearningProgressionAction;
  preserve: string[];
  change: string[];
  testNext: string[];
  nextEvidenceRequired: string[];
  predictionEvaluationIds?: string[];
  contentDecisions?: EvidenceBasedContentDecision[];
  revisedHypothesis?: string;
  /** Its review of its own track record before deciding (contract 56). Decisions saved earlier have none. */
  selfReview?: PlannerSelfReview;
  expectations?: PlannerExpectation[];
  gameNotes?: Array<{ nodeId: string; verdict: "keep" | "fix" | "retire"; why: string }>;
  /** The one complete successor board program. Absent only for await_calibration. */
  successor?: SuccessorProgram;
};

export type BaselineQuestEvidenceEligibility = {
  eligible: boolean;
  targetAlignedObservationCount: number;
  independentCorrectObservationCount: number;
  reason: "eligible_independent_correct_evidence" | "no_target_aligned_baseline_evidence" | "no_independent_correct_baseline_evidence";
};

export { observationNode } from "./observationNode";

export function baselineQuestEvidenceEligibility(
  cycle: LearningCycleRecordV2,
): BaselineQuestEvidenceEligibility {
  const targetAligned = cycle.observations.filter(observation => {
    if (/(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i.test(`${observation.observationId} ${observation.sourceId}`)) return false;
    // Discovery's first check is baseline evidence too (2026-11-05); spelling links each answer to its word.
    const node = observationNode(cycle, observation);
    if (!node || (node.role !== "baseline" && node.role !== "evaluation")) return false;
    const constructs = new Set([
      cycle.academicPredictions.find(p => p.predictionId === node.predictionId)?.constructId ?? `${cycle.domain}.${slug(node.academicTarget.skill)}`,
      ...Object.values(node.evidenceContract?.spellingItems ?? {}).map(item => item.constructId),
    ]);
    return observation.constructLinks.some(link => link.role === "primary" && link.confidence > 0 && constructs.has(link.constructId))
      && !observation.confounds.includes("response_not_captured");
  });
  const independentCorrect = targetAligned.filter((observation) =>
    observation.result.correct === true
    && observation.provenance === "independent_probe"
    && observation.exposure === "unseen"
    && Boolean(observation.childResponse?.trim())
    && !observation.confounds.includes("item_previously_exposed")
    && observation.assistance.status === "unassisted"
    && !observation.confounds.includes("assistance_present"));
  return {
    eligible: independentCorrect.length > 0,
    targetAlignedObservationCount: targetAligned.length,
    independentCorrectObservationCount: independentCorrect.length,
    reason: independentCorrect.length > 0
      ? "eligible_independent_correct_evidence"
      : targetAligned.length > 0
        ? "no_independent_correct_baseline_evidence"
        : "no_target_aligned_baseline_evidence",
  };
}

export function resolveCanonicalProgressionDecisionForLifecycle(
  lifecycle: LearningCycleRecordV2["lifecycle"],
  decision: CanonicalProgressionDecision,
): CanonicalProgressionDecision {
  if (lifecycle !== "boss_evaluating" || decision.status !== "awaiting_calibration" || decision.progressionAction === "await_calibration") {
    return decision;
  }
  console.log(` 🎮 [canonical-progression] [boss-action-normalized] from=${decision.progressionAction} to=await_calibration`);
  return {
    ...decision,
    progressionAction: "await_calibration",
    successor: undefined,
  };
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "unknown";
}

function isUncapturedResponse(value: string | undefined, requireCapture: boolean): boolean {
  return (requireCapture && (typeof value !== "string" || !value.trim())) || /spoken[_\s-]*aloud.*not[_\s-]*transcribed|response[_\s-]*not[_\s-]*captured/i.test(
    value ?? "",
  );
}

export function scoreMathResponse(item: DirectItem | undefined, value: string): LearningObservation["result"] {
  const response = item?.response;
  if (!response) return { observedErrorType: "answer_contract_missing" };
  if (response.mode === "explanation") return { observedErrorType: "explanation_requires_interpretation" };
  let correct: boolean;
  if (response.mode === "numeric") {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return { observedErrorType: "response_format_invalid" };
    correct = Number.isFinite(Number(value)) && Number(value) === response.expected;
  } else if (response.mode === "selection") {
    const selected = response.options.find(option => option.id === value.trim());
    if (!selected) return { observedErrorType: "response_format_invalid" };
    correct = selected.correct;
  } else {
    let state: unknown;
    try { state = JSON.parse(value); } catch { return { observedErrorType: "response_format_invalid" }; }
    if (!state || typeof state !== "object" || Array.isArray(state)) return { observedErrorType: "response_format_invalid" };
    correct = Object.entries(response.expectedState).every(([key, expected]) => Object.hasOwn(state, key) && (state as Record<string, unknown>)[key] === expected);
  }
  return { correct, score: correct ? 1 : 0 };
}

export function scoreSpellingRecall(
  item: LearningCycleSpellingItem | undefined,
  value: string,
  disposition: { skipped?: boolean; incomplete?: boolean } = {},
): LearningObservation["result"] {
  if (!item) return { observedErrorType: "answer_contract_missing" };
  if (disposition.skipped) return { observedErrorType: "not_sure" };
  // Letters left when a word ended (G8, 2026-11-10): an incomplete try, never right or wrong.
  if (disposition.incomplete) return { observedErrorType: "incomplete_response" };
  if (!value.trim()) return { observedErrorType: "response_not_captured" };
  // A Japanese-input keyboard turns her letters into kana; score the letters she typed, never the kana (2026-11-10).
  const typed = readTypedSpelling(value, item.response.acceptedForms, item.response.caseSensitive);
  if (typed.status === "ime_unscorable" || typed.status === "ime_ambiguous") return { observedErrorType: `keyboard_${typed.status}` };
  value = typed.value;
  const normalize = (text: string): string => item.response.caseSensitive
    ? text.normalize("NFC").trim()
    : text.normalize("NFC").trim().toLocaleLowerCase("en-US");
  const correct = item.response.acceptedForms.some(answer => normalize(answer) === normalize(value));
  if (
    !correct &&
    item.response.acceptedForms.some((answer) =>
      areDistinctWordsPronunciationEquivalent(normalize(answer), normalize(value)),
    )
  ) {
    return { observedErrorType: "instrument_ambiguous" };
  }
  return { correct, score: correct ? 1 : 0 };
}

/** support is supplied by the server's live instrument context, never the attempt body. */
export function recordSpellingDiscoveryAttempt(input: {
  childId: string;
  homeworkId: string;
  attempt: { attemptId: string; itemId: string; attemptedValue: string; observedAt: string; skipped?: boolean; incomplete?: boolean };
  support?: LearningObservation["assistance"];
  instrumentSignals?: string[];
  artifactHash?: string;
  sessionId?: string;
  launchId?: string;
}, opts: LearningCycleRepositoryOptions = {}): LearningCycleRecordV2 {
  let cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle || cycle.domain !== "spelling") throw new Error("spelling_cycle_missing");
  const node = cycle.nodes.find(candidate => candidate.evidenceContract.spellingItems?.[input.attempt.itemId]);
  const item = node?.evidenceContract.spellingItems?.[input.attempt.itemId];
  if (!node || !item) throw new Error("spelling_item_not_in_contract");
  const typed = readTypedSpelling(input.attempt.attemptedValue, item.response.acceptedForms, item.response.caseSensitive);
  // The saved answer is the letters she typed; the keyboard's raw text stays a fact beside it.
  const attempt = { ...input.attempt, attemptedValue: typed.status === "ime_normalized" ? typed.value : input.attempt.attemptedValue };
  if (typed.status !== "plain") console.log(` 🎮 [spelling-input] [ime-${typed.status === "ime_normalized" ? "normalized" : typed.status.slice(4)}] item=${item.id} raw=${JSON.stringify(typed.raw)} read=${JSON.stringify(typed.candidates)}`);
  if (!attempt.attemptId.trim() || !Number.isFinite(Date.parse(attempt.observedAt))) throw new Error("spelling_attempt_identity_invalid");
  const prior = cycle.observations.find(row => row.observationId === attempt.attemptId);
  if (prior) {
    if (prior.itemId !== attempt.itemId || (prior.childResponse ?? "") !== attempt.attemptedValue
      || (prior.confounds.includes("response_disposition:not_sure") || prior.result.observedErrorType === "not_sure") !== (attempt.skipped === true)) throw new Error("spelling_attempt_identity_conflict");
    return cycle;
  }
  const support = input.support ?? { status: "unknown" as const, scaffolds: [] };
  const repeated = cycle.observations.some(row => row.itemId === item.id);
  const previouslyExposed = repeated || cycle.observations.some(row => row.confounds.includes(`word_id:${item.wordId}`));
  const signals = input.instrumentSignals ?? [];
  const result = signals.length ? { observedErrorType: "instrument_ambiguous" } : scoreSpellingRecall(item, attempt.attemptedValue, attempt);
  const exposure: LearningObservation["exposure"] = previouslyExposed || item.lineage.exposure === "practiced"
    ? "previously_practiced" : item.lineage.exposure === "taught" ? "previously_taught" : "unseen";
  // A Quest or Boss check of her practiced words is independent recall, never unseen (owner, 2026-11-05).
  const encounterCheck = (node.role === "quest" || node.role === "boss") && item.lineage.measurementRole === "fresh_checkpoint" && !repeated;
  const independent = (node.role === "evaluation" && exposure === "unseen" || encounterCheck) && support.status === "unassisted" && typeof result.correct === "boolean";
  if (node.role !== "evaluation" && !["ready", "active", "completed"].includes(node.state)) throw new Error("spelling_instrument_not_active");
  if (cycle.lifecycle === "evaluation_ready") cycle = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, { type: "evaluation_started", evaluationId: node.nodeId }, opts);
  const observation: LearningObservation = {
    observationId: attempt.attemptId, itemId: item.id, sourceId: node.role === "evaluation" ? `evaluation:${node.nodeId}` : `activity:${node.nodeId}:recall`,
    ...(attempt.attemptedValue ? { childResponse: attempt.attemptedValue } : {}),
    constructLinks: [{ constructId: item.constructId, role: "primary", confidence: 1 }],
    result, assistance: structuredClone(support), exposure,
    provenance: independent ? "independent_probe" : "practice", observedAt: attempt.observedAt,
    confounds: [...new Set([
      `word_id:${item.wordId}`, `response_mode:${item.response.mode}`, `measurement_role:${item.lineage.measurementRole}`,
      ...(attempt.skipped ? ["response_disposition:not_sure"] : []),
      ...(attempt.incomplete ? ["response_disposition:incomplete"] : []),
      ...(typed.status === "plain" ? [] : ["keyboard_ime_input", `ime_raw:${typed.raw}`]),
      ...(repeated ? ["repeated_attempt"] : ["first_response"]), ...(result.observedErrorType ? [result.observedErrorType] : []),
      ...(support.status !== "unassisted" ? [`assistance_${support.status}`] : []), ...signals,
      ...(input.artifactHash ? [`artifact_hash:${input.artifactHash}`] : []),
      ...(input.sessionId ? [`session_id:${input.sessionId}`] : []),
      ...(input.launchId ? [`launch_id:${input.launchId}`] : []),
    ])],
  };
  const updated = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
    ...(node.role === "evaluation" ? { type: "evaluation_attempted" as const, evaluationId: node.nodeId } : { type: "instrument_observed" as const, completed: false }), nodeId: node.nodeId,
    observations: [observation], academicEvidence: [{ evidenceId: observation.observationId, summary: `${item.id}: ${result.observedErrorType ?? (result.correct ? "correct" : "incorrect")}; assistance=${support.status}; exposure=${exposure}.` }],
    engagementEvidence: signals.length ? [{ evidenceId: `${observation.observationId}:instrument`, summary: signals.join(", ") }] : [],
    companionObservations: support.scaffolds.map(evidenceId => ({ evidenceId, summary: `Support was invoked during spelling recall; item=${item.id}. Exact instructional exposure is not assumed from the request alone.` })),
  }, opts);
  console.log(` 🎮 [spelling-discovery] [attempt] [committed] homework=${input.homeworkId} item=${item.id} attempt=${attempt.attemptId} provenance=${observation.provenance}`);
  return updated;
}

function observationsForCompletion(input: {
  cycle: LearningCycleRecordV2;
  sessionId: string;
  nodeId: string;
  result: CanonicalCompletionResult;
  observedAt: string;
}): LearningObservation[] {
  const node = input.cycle.nodes.find((candidate) => candidate.nodeId === input.nodeId)!;
  if (!node.evidenceContract.academic) return [];
  const serverAssistedInstruction = input.cycle.domain === "spelling"
    && node.implementationType === "visual-explainer";
  if (input.result.targetResults?.some(row => row.evidenceRole === "assisted_instruction")
    && !serverAssistedInstruction) {
    throw new Error(`learning_cycle_evidence_role_conflict:${node.nodeId}`);
  }
  const spellingItems = node.evidenceContract.spellingItems;
  if (input.cycle.domain === "spelling" && spellingItems && input.result.captureLaunchId) {
    const captured = input.cycle.observations.filter(row => row.sourceId === `activity:${node.nodeId}:recall` && Boolean(spellingItems[row.itemId]) && row.confounds.includes(`launch_id:${input.result.captureLaunchId}`));
    // A check may be answered across sittings (the board resumes with the unanswered words); it is complete
    // when every word has an answer from any launch of this stop (BUGS.md 2026-11-08, Memory Lighthouse).
    const answeredAnyLaunch = new Set(input.cycle.observations.filter(row => row.sourceId === `activity:${node.nodeId}:recall` && Boolean(spellingItems[row.itemId])).map(row => row.itemId));
    if (node.state !== "completed" && !isSpellingPracticeContinuation(input.cycle) && Object.values(spellingItems).every(item => item.lineage.measurementRole === "fresh_checkpoint") && Object.keys(spellingItems).some(itemId => !answeredAnyLaunch.has(itemId))) throw new Error("spelling_checkpoint_coverage_incomplete");
    // Completion summarizes the latest captured response per item; earlier attempts remain audit facts.
    return [...new Map(captured.map(row => [row.itemId, row])).values()];
  }
  if (node.state !== "completed" && !isSpellingPracticeContinuation(input.cycle) && spellingItems && Object.values(spellingItems).every(item => item.lineage.measurementRole === "fresh_checkpoint")) {
    const captured = Object.keys(spellingItems).map(itemId => input.cycle.observations.find(row => row.itemId === itemId && row.sourceId === `activity:${node.nodeId}:recall`));
    if (captured.some(row => !row)) throw new Error("spelling_checkpoint_coverage_incomplete");
    return captured as LearningObservation[];
  }
  const itemRoles = node.evidenceContract.itemRoles;
  const seen = new Set<string>();
  for (const row of input.result.targetResults ?? []) {
    if ((input.cycle.domain === "math" || itemRoles) && seen.has(row.target)) throw new Error(`learning_cycle_duplicate_item:${row.target}`);
    seen.add(row.target);
  }
  if (itemRoles && !input.result.targetResults?.length) {
    throw new Error(`learning_cycle_instrument_target_results_missing:${node.nodeId}`);
  }
  if (itemRoles) {
    for (const row of input.result.targetResults ?? []) {
      if (!Object.hasOwn(itemRoles, row.target)) {
        throw new Error(`learning_cycle_instrument_unknown_item:${row.target}`);
      }
    }
  }
  const prediction = input.cycle.academicPredictions.find((candidate) => candidate.predictionId === node.predictionId);
  const constructId = prediction?.constructId ?? `${input.cycle.domain}.${slug(node.academicTarget.skill)}`;
  const rows = input.result.targetResults?.length
    ? input.result.targetResults
    : [{ target: node.nodeId, correct: input.result.accuracy >= 0.5 }];
  const companionHelp = input.cycle.domain !== "spelling" && (input.result.companionInteractions?.length ?? 0) > 0;
  const previouslyExposedItemIds = new Set(input.cycle.observations.map((observation) => observation.itemId));
  // Each try is its own observation: the first is the measure, later tries are practice (2026-11-10).
  const triesOf = (row: (typeof rows)[number]): Array<string | undefined> => {
    const tries = ("tries" in row && Array.isArray(row.tries) ? row.tries : []).flatMap(entry => typeof entry?.attemptedValue === "string" ? [entry.attemptedValue.slice(0, 200)] : []).slice(0, 20);
    return tries.length ? tries : [row.attemptedValue];
  };
  return rows.flatMap((triedRow, index) => triesOf(triedRow).map((attemptedValue, tryIndex, all) => {
    const row = { ...triedRow, attemptedValue };
    const tryFacts = all.length > 1 || ("tries" in triedRow && Array.isArray(triedRow.tries)) ? [tryIndex === 0 ? "first_try" : "retry", `attempt:${tryIndex + 1}`] : [];
    const item = node.evidenceContract.itemContracts?.[row.target];
    const measurementRole = item?.lineage.measurementRole ?? itemRoles?.[row.target] ?? "practice";
    const assistedInstruction = serverAssistedInstruction;
    // An answer already on screen when the item opened is help, whatever the game says (owner, 2026-11-08).
    const answerShowing = item?.response.mode === "numeric" && typeof row.screenAtOpen === "string"
      && new RegExp(`=\\s*${String(item.response.expected).replace(".", "\\.")}(?![\\d.])`).test(row.screenAtOpen);
    const helpedOnItem = (input.result.companionHelpItemIds ?? []).includes(row.target);
    const scaffolded = assistedInstruction || Number(row.scaffoldLevel ?? 0) > 0 || companionHelp || answerShowing || helpedOnItem;
    const repeatedAssessmentItem = node.state === "completed" || previouslyExposedItemIds.has(row.target) || tryIndex > 0;
    const spellingItem = spellingItems?.[row.target];
    const responseNotCaptured = !assistedInstruction && isUncapturedResponse(row.attemptedValue, input.cycle.domain === "math" || Boolean(spellingItems));
    const result = assistedInstruction
      ? { observedErrorType: "assisted_instruction" }
      : responseNotCaptured
        ? { observedErrorType: "response_not_captured" }
        : spellingItems
          ? scoreSpellingRecall(spellingItem, row.attemptedValue!)
          : input.cycle.domain === "math"
            ? scoreMathResponse(item, row.attemptedValue!)
            : { correct: row.correct, score: row.correct ? 1 : 0 };
    const eligibleFreshCheckpoint = !spellingItems && (input.cycle.domain === "math" ? item?.lineage.exposure === "unseen" && typeof result.correct === "boolean" : true) && (item || itemRoles
      ? measurementRole === "fresh_checkpoint"
      : node.role !== "baseline")
      && !scaffolded
      && !repeatedAssessmentItem
      && !responseNotCaptured;
    return {
      observationId: `${input.sessionId}:${input.nodeId}:observation:${index + 1}${tryIndex ? `:try:${tryIndex + 1}` : ""}`,
      sourceId: `activity:${input.sessionId}:${input.nodeId}`,
      itemId: row.target || `${input.nodeId}:item:${index + 1}`,
      ...(!assistedInstruction && row.attemptedValue ? { childResponse: row.attemptedValue } : {}),
      constructLinks: [{ constructId: spellingItem?.constructId ?? constructId, role: "primary", confidence: 1 }],
      result,
      assistance: {
        status: scaffolded ? "assisted" : input.cycle.domain === "spelling" ? "unknown" : "unassisted",
        scaffolds: [
          ...(Number(row.scaffoldLevel ?? 0) > 0 ? [`scaffold_level_${row.scaffoldLevel}`] : []),
          ...(companionHelp ? ["companion_help"] : []),
          ...(answerShowing ? ["answer_on_screen"] : []),
          ...(helpedOnItem ? ["companion_help_on_item"] : []),
        ],
      },
      exposure: eligibleFreshCheckpoint ? "unseen" : "previously_practiced",
      provenance: eligibleFreshCheckpoint ? "independent_probe" : "practice",
      observedAt: input.observedAt,
      confounds: [
        ...(scaffolded ? ["assistance_present"] : []),
        ...(answerShowing ? ["answer_exposure"] : []),
        ...(repeatedAssessmentItem ? ["item_previously_exposed"] : []),
        ...(result.observedErrorType ? [result.observedErrorType] : []),
        // A letter game's own report on the word, labelled as the game's, so the Planner sees the
        // repetition; it is never scored as recall (owner, 2026-11-04).
        ...(spellingItem && responseNotCaptured && typeof row.correct === "boolean" ? [`game_reported:${row.correct ? "solved" : "not_solved"}`] : []),
        ...(spellingItem && responseNotCaptured && Number.isSafeInteger(row.attempts) && row.attempts! > 0 ? [`game_reported_attempts:${row.attempts}`] : []),
        `measurement_role:${measurementRole}`,
        ...tryFacts,
      ],
    };
  }));
}

/**
 * Tries she made on a finished stop after its completion was sent (BUGS.md 2026-11-10 evening). The game contract
 * resends every try per bound problem in the completion's order, so observation ids match the completion's; only
 * tries not yet saved are added, as retries, and the stop's state and evidence summary stay as they are.
 */
export function recordCanonicalLateTries(
  input: { childId: string; homeworkId: string; sessionId: string; nodeId: string;
    targetResults: Array<Omit<NonNullable<CanonicalCompletionResult["targetResults"]>[number], "correct"> & { correct?: boolean }> },
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 | null {
  const cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) return null;
  if (!cycle.evidence.academic.some((item) => item.evidenceId === `${input.sessionId}:${input.nodeId}:completion`)) {
    throw new Error(`late_tries_completion_missing:${input.nodeId}`);
  }
  const known = new Set(cycle.observations.map((observation) => observation.observationId));
  const observations = observationsForCompletion({ cycle, sessionId: input.sessionId, nodeId: input.nodeId,
    // Bound problems carry no game-claimed result: code scores each try, as at completion.
    result: { completed: true, ended: true, accuracy: 0, timeSpent_ms: 0, targetResults: input.targetResults as NonNullable<CanonicalCompletionResult["targetResults"]> },
    observedAt: (opts.now ?? new Date()).toISOString() })
    .filter((observation) => /:try:\d+$/.test(observation.observationId) && !known.has(observation.observationId));
  console.log(` 🎮 [learning-cycle] [late-tries] [${observations.length ? "saved" : "none-new"}] node=${input.nodeId} added=${observations.length}`);
  if (!observations.length) return cycle;
  return transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
    type: "instrument_observed", completed: false, nodeId: input.nodeId, observations,
    academicEvidence: [], engagementEvidence: [], companionObservations: [],
  }, opts);
}

export function recordCanonicalNodeCompletion(
  input: {
    childId: string;
    homeworkId: string;
    sessionId: string;
    nodeId: string;
    result: CanonicalCompletionResult;
  },
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 | null {
  const cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle || input.result.earlyExit || (!input.result.completed && !input.result.ended)) return cycle;
  const node = cycle.nodes.find((candidate) => candidate.nodeId === input.nodeId);
  if (!node) throw new Error(`learning_cycle_node_missing:${input.nodeId}`);
  if (node.evidenceContract.spellingItems && !input.sessionId.trim()) throw new Error("canonical_completion_session_required");
  const evidenceId = `${input.sessionId}:${input.nodeId}:completion`;
  const alreadyRecorded = cycle.evidence.academic.some((item) => item.evidenceId === evidenceId);
  if (alreadyRecorded) return cycle;
  if (node.role === "evaluation") throw new Error("learning_cycle_evaluation_requires_discovery_endpoint");
  const experiment = cycle.agencyExperiment;
  const firstIncompleteShared = experiment?.sharedNodeIds.find((nodeId) =>
    cycle.nodes.find((candidate) => candidate.nodeId === nodeId)?.state !== "completed");
  const selectedRoute = experiment?.routes.find((route) => route.routeId === cycle.routeSelection?.selectedRouteId);
  const firstIncompleteSelected = selectedRoute?.nodeIds.find((nodeId) =>
    cycle.nodes.find((candidate) => candidate.nodeId === nodeId)?.state !== "completed");
  const isAgencyNode = experiment
    ? experiment.sharedNodeIds.includes(node.nodeId) || experiment.routes.some((route) => route.nodeIds.includes(node.nodeId))
    : false;
  const agencyNodeLaunchable = canonicalJourneyLaunchable(cycle,node.nodeId) ?? (!experiment || !isAgencyNode
    ? undefined
    : firstIncompleteShared
      ? node.nodeId === firstIncompleteShared
      : node.nodeId === firstIncompleteSelected);
  if (node.state !== "completed" && (agencyNodeLaunchable === false || (agencyNodeLaunchable === undefined && node.state !== "ready" && node.state !== "active"))) {
    throw new Error(`learning_cycle_node_not_launchable:${input.nodeId}`);
  }
  const observedAt = (opts.now ?? new Date()).toISOString();
  const observations = observationsForCompletion({
    cycle,
    sessionId: input.sessionId,
    nodeId: node.nodeId,
    result: input.result,
    observedAt,
  });
  const scoredObservations = observations.filter(
    (observation) => typeof observation.result.correct === "boolean",
  );
  const accuracy = scoredObservations.length
    ? scoredObservations.filter((observation) => observation.result.correct === true).length /
      scoredObservations.length
    : undefined;
  const academicEvidence: LearningCycleEvidenceSummary[] = [{
    evidenceId,
    ...(typeof accuracy === "number" ? { accuracy } : {}),
    summary: typeof accuracy === "number"
      ? `${node.title} completed at ${Math.round(accuracy * 100)}% across ${scoredObservations.length} scored target readings.`
      : `${node.title} completed with no independently scorable target response.`,
  }];
  const spellingResponseTimes = cycle.domain === "spelling"
    ? (input.result.targetResults ?? [])
      .filter((row) => Number.isFinite(row.responseTime_ms) && Number(row.responseTime_ms) >= 0)
      .map((row) => `${row.target.slice(0, 100)}: response=${row.responseTime_ms}ms${Number.isSafeInteger(row.attempts) ? `, attempts=${row.attempts}` : ""}`)
      .join(" | ") || "unreported"
    : "not-applicable";
  const engagementEvidence: LearningCycleEvidenceSummary[] = [{
    evidenceId: `${evidenceId}:engagement`,
    summary: `${node.title} completed in ${Math.max(0, input.result.timeSpent_ms)}ms; won=${input.result.won ?? "unreported"}; replay=${node.state === "completed"}; reportedFrustration=${(input.result.frustrationSignals ?? []).join(",") || "none"}; practiceResponseTimes=${spellingResponseTimes}.` + pageTimeSummary(input.result.pageTime),
  }];
  const companionObservations: LearningCycleEvidenceSummary[] = (input.result.companionInteractions ?? []).map((summary, index) => ({
    evidenceId: `${evidenceId}:companion:${index + 1}`,
    summary,
  }));
  return transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
    type: "instrument_observed",
    nodeId: node.nodeId,
    academicEvidence,
    engagementEvidence,
    companionObservations,
    observations,
  }, opts);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function parseNextInstrument(value: unknown): NextInstrumentPrescription | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  // A spelling step is an order for a built-in, a reward break is a built-in Mystery, and a game built for her recorded
  // problems is written from its story by the game builder: none carries a creator prompt.
  const reward = row.reward === true;
  const builtForProblems = row.mechanic === "generated-game" && Array.isArray(row.items);
  const keys = ["nodeId", "title", "academicTarget", "mechanic", "theme", "openingPurpose", ...(row.spelling === undefined && !reward && !builtForProblems ? ["creatorPrompt"] as const : [])] as const;
  if (keys.some((key) => typeof row[key] !== "string" || !String(row[key]).trim())) return undefined;
  // Design decisions are optional so an older Planner response still parses,
  // but they are carried through whenever the Planner supplies them.
  const designKeys = ["creatorPrompt", "stakesDesign", "failureMode", "escalation", "mechanicSpec", "mathematicalHook", "picture"] as const;
  return {
    ...(Array.isArray(row.items) ? { items: row.items.map(parseDirectItem) } : {}),
    ...(row.spelling !== undefined && !reward ? { spelling: validateSpellingPrescription(row.spelling) } : {}),
    ...(reward ? { reward: true } : {}),
    ...(row.encounter === "quest" || row.encounter === "boss" ? { encounter: row.encounter } : {}),
    ...(row.creatureEncounter && typeof (row.creatureEncounter as { reason?: unknown }).reason === "string" && String((row.creatureEncounter as { reason: string }).reason).trim()
      ? { creatureEncounter: { reason: String((row.creatureEncounter as { reason: string }).reason).trim() } } : {}),
    ...(typeof row.focus === "string" && row.focus.trim() ? { focus: row.focus.trim() } : {}),
    ...(typeof row.buildFrom === "string" && row.buildFrom.trim() ? { buildFrom: row.buildFrom.trim() } : {}),
    ...(typeof row.libraryGame === "string" && row.libraryGame in LIBRARY_GAMES ? { libraryGame: row.libraryGame as LibraryGameId } : {}),
    ...Object.fromEntries(keys.map((key) => [key, String(row[key]).trim()])),
    ...Object.fromEntries(designKeys
      .filter((key) => typeof row[key] === "string" && String(row[key]).trim())
      .map((key) => [key, String(row[key]).trim()])),
  } as NextInstrumentPrescription;
}

export function parseCanonicalProgressionDecision(value: unknown): CanonicalProgressionDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("canonical_progression_decision_invalid");
  const row = value as Record<string, unknown>;
  const statuses = new Set(["supported", "revised", "falsified", "inconclusive", "awaiting_calibration"]);
  const actions = new Set<LearningProgressionAction>(["generate_support", "generate_quest", "generate_boss", "collect_more_evidence", "await_calibration"]);
  if (typeof row.status !== "string" || !statuses.has(row.status) || typeof row.progressionAction !== "string" || !actions.has(row.progressionAction as LearningProgressionAction)) {
    throw new Error("canonical_progression_decision_invalid");
  }
  if (typeof row.reason !== "string" || !row.reason.trim()) throw new Error("canonical_progression_reason_missing");
  const generatedNodeId = typeof row.nextTitle === "string" && row.nextTitle.trim()
    ? `generated-${String(row.progressionAction).replace("generate_", "")}-${row.nextTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`
    : undefined;
  const action = String(row.progressionAction);
  const legacyEncounter = action === "generate_quest" ? "quest" : action === "generate_boss" ? "boss" : undefined;
  // Older checkpointed responses carry one next* instrument; they replay as a one-node successor.
  const legacyInstrument = parseNextInstrument(row.nextInstrument) ?? parseNextInstrument({
    nodeId: row.nextNodeId ?? generatedNodeId,
    title: row.nextTitle,
    academicTarget: row.nextAcademicTarget,
    items: row.nextItems,
    mechanic: row.nextMechanic,
    theme: row.nextTheme,
    openingPurpose: row.nextOpeningPurpose,
    creatorPrompt: row.nextCreatorPrompt,
    stakesDesign: row.nextStakesDesign,
    failureMode: row.nextFailureMode,
    escalation: row.nextEscalation,
    mechanicSpec: row.nextMechanicSpec,
    mathematicalHook: row.nextMathematicalHook,
    encounter: legacyEncounter,
  });
  if (legacyInstrument && legacyEncounter && !legacyInstrument.encounter) legacyInstrument.encounter = legacyEncounter;
  const instruments = Array.isArray(row.nextInstruments)
    ? row.nextInstruments.map((value) => {
        const parsed = parseNextInstrument(value);
        if (!parsed) throw new Error("canonical_progression_instrument_invalid");
        return parsed;
      })
    : legacyInstrument ? [legacyInstrument] : [];
  const boardDefinition = action === 'await_calibration' ? undefined : readSuccessorBoardDefinition(row.boardDefinition,instruments);
  const contentDecisions = (Array.isArray(row.contentDecisions) ? row.contentDecisions : []).map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("canonical_progression_content_decision_invalid");
    const decision = value as Record<string, unknown>;
    const action = String(decision.action ?? "");
    if (!new Set(["candidate", "reuse", "revise", "retire"]).has(action)) throw new Error("canonical_progression_content_decision_invalid");
    return {
      contentId: String(decision.contentId ?? "").trim(),
      action: action as EvidenceBasedContentDecision["action"],
      reason: String(decision.reason ?? "").trim(),
      evidenceIds: strings(decision.evidenceIds),
    };
  });
  if (action !== "await_calibration" && instruments.length === 0) {
    console.log(` 🎮 [canonical-progression] [planner-prescription-invalid] action=${String(row.progressionAction)} value=${JSON.stringify({
      nextInstrument: row.nextInstrument ?? null,
      nextNodeId: row.nextNodeId ?? null,
      nextTitle: row.nextTitle ?? null,
      nextAcademicTarget: row.nextAcademicTarget ?? null,
      nextMechanic: row.nextMechanic ?? null,
      nextTheme: row.nextTheme ?? null,
      nextOpeningPurpose: row.nextOpeningPurpose ?? null,
      nextCreatorPrompt: row.nextCreatorPrompt ?? null,
    })}`);
    throw new Error(`canonical_progression_${action.replace("generate_", "")}_prescription_missing`);
  }
  return {
    status: row.status as CanonicalProgressionDecision["status"],
    reason: row.reason.trim(),
    progressionAction: row.progressionAction as LearningProgressionAction,
    preserve: strings(row.preserve),
    change: strings(row.change),
    testNext: strings(row.testNext),
    nextEvidenceRequired: strings(row.nextEvidenceRequired),
    predictionEvaluationIds: strings(row.predictionEvaluationIds),
    ...(contentDecisions.length > 0 ? { contentDecisions } : {}),
    ...(typeof row.revisedHypothesis === "string" && row.revisedHypothesis.trim() ? { revisedHypothesis: row.revisedHypothesis.trim() } : {}),
    ...(parseSelfReview(row.selfReview) ? { selfReview: parseSelfReview(row.selfReview) } : {}),
    ...(Array.isArray(row.gameNotes) ? { gameNotes: (row.gameNotes as Array<Record<string, unknown>>).filter(note => typeof note?.nodeId === "string" && ["keep", "fix", "retire"].includes(String(note.verdict)) && typeof note.why === "string")
      .map(note => ({ nodeId: String(note.nodeId), verdict: note.verdict as "keep" | "fix" | "retire", why: String(note.why).trim() })) } : {}),
    ...(Array.isArray(row.expectations) ? { expectations: (row.expectations as Array<Record<string, unknown>>).filter(call => typeof call?.itemId === "string" && typeof call.onHerOwn === "boolean").map(call => ({ itemId: String(call.itemId), onHerOwn: Boolean(call.onHerOwn) })) } : {}),
    ...(action !== "await_calibration" ? { successor: { instruments, boardDefinition } } : {}),
  };
}

/** A saved self-review with all four of its fields; anything else reads as none (decisions before contract 56). */
function parseSelfReview(value: unknown): PlannerSelfReview | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>, keys = ["whatITried", "whatHappened", "why", "whatIChangeNow"] as const;
  if (!keys.every(key => typeof row[key] === "string" && String(row[key]).trim())) return undefined;
  const review = Object.fromEntries(keys.map(key => [key, String(row[key]).trim()])) as PlannerSelfReview;
  return typeof row.whatIKeep === "string" && row.whatIKeep.trim() ? { ...review, whatIKeep: row.whatIKeep.trim() } : review;
}

function assertPredictionCitations(decision:Pick<CanonicalProgressionDecision,'predictionEvaluationIds'>, cycle:LearningCycleRecordV2):void {
  const allowed = new Set(cycle.predictionEvaluations.map(evaluation => evaluation.evaluationId));
  const cited = decision.predictionEvaluationIds ?? [];
  if (cited.some(id => !allowed.has(id))) throw new Error("canonical_progression_unknown_prediction_evaluation");
  if (allowed.size > 0 && cited.length === 0) throw new Error("canonical_progression_prediction_evaluation_citation_required");
}

function progressionEvidence(cycle:LearningCycleRecordV2) {
  const evidenceIds = [...new Set([...cycle.evidence.academic, ...cycle.evidence.engagement]
    .map(item=>item.evidenceId).filter(id=>!/(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i.test(id)))];
  return {evidenceIds, decisionEvidenceIds:new Set([...evidenceIds,...cycle.observations.map(row=>row.observationId),...cycle.predictionEvaluations.map(row=>row.evaluationId)])};
}

function plannerCheckpoint(cycle: LearningCycleRecordV2, opts: LearningCycleRepositoryOptions) {
  const entry = [...cycle.decisionHistory].reverse().find(row => row.toLifecycle === cycle.lifecycle && row.fromLifecycle !== cycle.lifecycle);
  const batchId = entry?.decisionId ?? `${cycle.homeworkId}:r${cycle.revision}`;
  const recordedRevision = Number(entry?.decisionId.match(/:r(\d+)$/)?.[1]);
  const revision = Number.isSafeInteger(recordedRevision) ? recordedRevision : cycle.revision;
  return {batchId, revision, stage:`progression-decision-r${revision}`, draftDir:path.join(resolveChildContextDir(cycle.childId, {rootDir:opts.rootDir}), "homework", "cycles", ".planner", cycle.homeworkId, batchId.replace(/[^a-zA-Z0-9_-]+/g,"_"))};
}

/** Freeze the purchased request, without changing the identity of old receipts. */
function freezePlannerRequest<T extends Parameters<typeof requestPlannerMessage>[1]>(input: {draftDir:string; stage:string; request:T; legacyContext?:unknown}) {
  const file=path.join(input.draftDir,`${input.stage}.request.json`);
  const legacy=!fs.existsSync(file) && fs.existsSync(path.join(input.draftDir,'provider-receipts',`${input.stage}.stage.json`));
  const timeout=Number(process.env.SUNNY_AI_TIMEOUT_MS??300000);
  if(legacy) {
    // The old primary used a small snapshot; its corrections hashed the full 6k request.
    const request={...input.request,max_tokens:6000};
    return {request,timeout,receiptContext:input.legacyContext??request,beforeRequest:undefined};
  }
  fs.mkdirSync(input.draftDir,{recursive:true});
  if(!fs.existsSync(file)) {
    const temporary=`${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary,JSON.stringify({request:input.request,snapshot:input.legacyContext??null,policy:plannerTransportPolicy(input.request.model,input.request.max_tokens,timeout)}));
      try {fs.linkSync(temporary,file);} catch(error) {if((error as NodeJS.ErrnoException).code!=='EEXIST') throw error;}
    } finally {if(fs.existsSync(temporary)) fs.unlinkSync(temporary);}
  }
  const frozen=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!frozen.request?.model || !('snapshot' in frozen) || !frozen.policy) throw Error('planner_frozen_request_invalid');
  const request=frozen.request as T;
  return {request,timeout:frozen.policy.timeout as number,receiptContext:frozen as unknown,beforeRequest:()=>{
    if(!isDeepStrictEqual(plannerTransportPolicy(request.model,request.max_tokens,frozen.policy.timeout),frozen.policy)) {
      // No request was sent: leave the existing rejected/absent receipt resumable.
      throw Object.assign(Error('planner_frozen_transport_changed'),{status:409});
    }
  }};
}

/** Explicit operator action only. No purchase, deletion or evidence rewrite. */
export function authorizeCanonicalPlannerRetry(input: {childId:string; homeworkId:string; blockedDecisionId:string; reason:string}, opts: LearningCycleRepositoryOptions = {}) {
  const cycle = getLearningCycle(input.childId,input.homeworkId,opts);
  const blocked = cycle && [...cycle.decisionHistory].reverse().find(row=>row.fromLifecycle!==row.toLifecycle);
  if (!cycle || cycle.lifecycle!=="blocked" || blocked?.eventType!=="block" || blocked.decisionId!==input.blockedDecisionId
    || !isRetryablePlannerBlock(blocked.reason, cycle) || !input.reason.trim()) throw Error("planner_retry_not_eligible");
  const checkpoint = plannerCheckpoint({...cycle,lifecycle:blocked.fromLifecycle,decisionHistory:cycle.decisionHistory.slice(0,cycle.decisionHistory.indexOf(blocked))},opts);
  const receipts = path.join(checkpoint.draftDir,"provider-receipts");
  // The tools Planner keeps one receipt per turn and never the old single-form stage file, so a
  // tools answer that ran out of room is set aside and decided fresh (human-caught 2026-11-05).
  const toolsRunTruncated = blocked.reason === "planner_decision_invalid:planner_response_max_tokens"
    && !fs.existsSync(path.join(receipts,`${checkpoint.stage}.stage.json`))
    && fs.existsSync(receipts) && fs.readdirSync(receipts).some(name=>name.startsWith(`${checkpoint.stage}-tools-turn-`));
  if (blocked.reason === "planner_decision_invalid:board_definition_missing") {
    // An item-intake math decision that went to the retired single form (2026-11-08). The retry opens a new
    // evidence batch, so the Planner decides through the shared tools; the received answer stays on disk as it is.
    console.log(` 🎮 [canonical-progression] [retry] [math-shared-tools] homework=${cycle.homeworkId} blocked_decision=${input.blockedDecisionId} old_receipt_kept=${checkpoint.draftDir}`);
  } else if (blocked.reason.startsWith("planner_decision_invalid:provider_stage_request_changed:") || blocked.reason.startsWith("provider_outcome_uncertain:") || toolsRunTruncated) {
    // The collided or cut-off attempt's saved turns and drawing are set aside (never deleted), so the code decides fresh.
    const superseded = path.join(checkpoint.draftDir,"superseded",input.blockedDecisionId.replace(/[^a-zA-Z0-9_-]+/g,"_"));
    fs.mkdirSync(superseded,{recursive:true});
    const stale = [
      ...(fs.existsSync(receipts)?fs.readdirSync(receipts):[]).filter(name=>name.startsWith(`${checkpoint.stage}-tools-turn-`)||name.startsWith(`${checkpoint.stage}-design-`)).map(name=>path.join(receipts,name)),
      ...[`${checkpoint.stage}-design.json`,`${checkpoint.stage}-tools.question.json`].map(name=>path.join(checkpoint.draftDir,name)).filter(file=>fs.existsSync(file)),
    ];
    for (const file of stale) fs.renameSync(file,path.join(superseded,path.basename(file)));
    console.log(` 🎮 [canonical-progression] [retry] [superseded] homework=${cycle.homeworkId} files=${stale.length} dir=${superseded}`);
  } else {
    const stage = JSON.parse(fs.readFileSync(path.join(receipts,`${checkpoint.stage}.stage.json`),"utf8"));
    if (typeof stage.requestHash!=="string" || !/^[a-f0-9]{64}$/.test(stage.requestHash)) throw Error("planner_retry_receipt_invalid");
    const receipt = JSON.parse(fs.readFileSync(path.join(receipts,`${stage.requestHash}.json`),"utf8"));
    if (receipt.status!=="received" || receipt.response?.plannerMessage?.stop_reason!=="max_tokens") throw Error("planner_retry_receipt_not_truncated");
  }
  const authorized = transitionLearningCycle(input.childId,input.homeworkId,cycle.revision,{type:"planner_retry_authorized",blockedDecisionId:input.blockedDecisionId,reason:input.reason},opts);
  console.log(` 🎮 [canonical-progression] [retry] [authorized] homework=${cycle.homeworkId} blocked_decision=${input.blockedDecisionId} attempt=${authorized.decisionHistory.at(-1)!.decisionId}`);
  return authorized;
}

/** Explicit zero-purchase recovery of a complete primary response. No intermediate lifecycle
 * is persisted: a crash cannot leave normal startup authorized to buy another decision. */
export async function replayCanonicalPlannerResponse(input:{childId:string;homeworkId:string;blockedDecisionId:string;reason:string},opts:LearningCycleRepositoryOptions={}) {
  const chart=getChildChart(input.childId,{rootDir:opts.rootDir});
  if(chart.childId!==input.childId || !input.reason.trim())throw new Error('planner_replay_not_eligible');
  const cycle=getLearningCycle(input.childId,input.homeworkId,opts);
  if(!cycle)throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  if(cycle.decisionHistory.some(row=>row.replayedResponse?.blockedDecisionId===input.blockedDecisionId))return cycle;
  const blocked=[...cycle.decisionHistory].reverse().find(row=>row.fromLifecycle!==row.toLifecycle);
  if(cycle.lifecycle!=='blocked'||blocked?.eventType!=='block'||blocked.decisionId!==input.blockedDecisionId
    ||!/^planner_decision_invalid:(board_definition_|board_canvas_invalid:)/.test(blocked.reason)
    ||!['baseline_evaluating','quest_evaluating','boss_evaluating'].includes(blocked.fromLifecycle))throw new Error('planner_replay_not_eligible');
  const checkpoint=plannerCheckpoint({...cycle,lifecycle:blocked.fromLifecycle,decisionHistory:cycle.decisionHistory.slice(0,cycle.decisionHistory.indexOf(blocked))},opts);
  const directory=path.join(checkpoint.draftDir,'provider-receipts');
  const pointer=JSON.parse(fs.readFileSync(path.join(directory,`${checkpoint.stage}.stage.json`),'utf8'));
  if(!/^[a-f0-9]{64}$/.test(pointer.requestHash))throw new Error('planner_replay_receipt_invalid');
  const bytes=fs.readFileSync(path.join(directory,`${pointer.requestHash}.json`));
  const receipt=JSON.parse(bytes.toString('utf8'));
  if(receipt.status!=='received'||receipt.response?.plannerMessage?.stop_reason!=='tool_use')throw new Error('planner_replay_receipt_not_complete');
  const received=readPlannerToolReceipt(receipt.response,'decide_learning_cycle_progression');
  const content=(received as Record<string,unknown>).contentDecisions??[];
  assertContentDecisionShape(content);
  validateEvidenceBasedContentDecisions(content,new Set(chart.contentCatalog.items.map(item=>item.contentId)),progressionEvidence(cycle).decisionEvidenceIds);
  const decision=parseCanonicalProgressionDecision(received);
  const replay={blockedDecisionId:input.blockedDecisionId,requestHash:pointer.requestHash,receiptHash:createHash('sha256').update(bytes).digest('hex'),reason:input.reason.trim(),
    ...(decision.contentDecisions?.length?{deferredContentDecisions:decision.contentDecisions}:{})};
  const result=await decideOnce({childId:input.childId,homeworkId:input.homeworkId,decide:async()=>decision},opts,{...replay,fromLifecycle:blocked.fromLifecycle});
  console.log(` 🎮 [canonical-progression] [received-response] [replayed] homework=${cycle.homeworkId} blocked_decision=${blocked.decisionId} provider_calls=0`);
  if(replay.deferredContentDecisions?.length)console.log(` 🎮 [canonical-progression] [catalog-proposals] [deferred] count=${replay.deferredContentDecisions.length} reason=separate-profile-writes-not-in-replay-transaction`);
  return result;
}

/** Each spelling order that re-runs a built-in is that built-in's catalog reuse decision, cited by its own recorded answers. */
function spellingReuseFromOrders(cycle: LearningCycleRecordV2, decision: CanonicalProgressionDecision): EvidenceBasedContentDecision[] {
  return (decision.successor?.instruments ?? []).flatMap((order) => {
    const builtIn = order.spelling?.builtInActivityId ? cycle.nodes.find((node) => node.nodeId === order.spelling!.builtInActivityId) : undefined;
    const contentId = builtIn?.artifactBinding?.contentId;
    const items = new Set(Object.keys(builtIn?.evidenceContract.spellingItems ?? {}));
    const evidenceIds = cycle.observations.filter((row) => items.has(row.itemId)).map((row) => row.observationId);
    if (!contentId || !evidenceIds.length) return [];
    return [{ contentId, action: "reuse" as const, reason: `Re-run on the next board: ${decision.reason}`, evidenceIds }];
  }).filter((row, index, rows) => rows.findIndex((other) => other.contentId === row.contentId) === index);
}

function catalogedOnly(childId: string, decisions: EvidenceBasedContentDecision[], opts: LearningCycleRepositoryOptions): EvidenceBasedContentDecision[] {
  if (!decisions.length) return decisions;
  try {
    const cataloged = new Set(getChildChart(childId, opts).contentCatalog.items.map((item) => item.contentId));
    return decisions.filter((row) => cataloged.has(row.contentId));
  } catch (error) {
    console.warn(` 🎮 [content-catalog] [reuse-record] [skipped] child=${childId} reason=${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/** Math and encounter briefs: the Planner designs what the AI builder implements. */
const ARTIST_BRIEF = `You are the artist here, not a compliance function. Sunny holds the academic truth and the evidence limits; everything else is yours. Stakes, failure, consequence, escalation, pacing, tone, and payoff are your decisions to make and to defend, and you may change them run to run. You have full freedom to choose a game, simulation, manipulative, story, conversation, demonstration, or another fitting form.

Two things this Planner has gotten wrong before, stated plainly so you can avoid them:
- Do not name a stake and then remove it in the same breath. Phrases like "no penalty", "no hard fail", "not punitive", or "low-pressure" attached to a tension you just introduced produce an experience with nothing at risk, which children read as boring. If you want a real stake, let it cost something. If you want no stake, say so deliberately and own it — do not do both.
- Do not treat the engagement context as a list of things to avoid. It is observation with sample sizes attached, and dimensions too weakly evidenced to act on have already been withheld from you. A presentation that has not been seen to work is untested, not forbidden. Nothing in that context constrains stakes, difficulty, or consequence.`;

/** Spelling: the Planner is the doctor writing orders; Sunny runs each order with a tested built-in activity. */

/** Briefs for the AI builder. Spelling steps are orders for tested built-ins and never carry them. */
const DESIGN_FIELDS_SCHEMA = {
  creatorPrompt: { type: "string", minLength: 1 },
  stakesDesign: { type: "string", minLength: 1, description: "What is genuinely at risk for the child in this instrument, and what losing it costs them." },
  failureMode: { type: "string", minLength: 1, description: "How a run can end badly. If you decide it cannot be failed, say so and say why that serves this child right now." },
  escalation: { type: "string", minLength: 1, description: "How difficulty or pressure moves from the first moment to the last." },
  mechanicSpec: { type: "string", minLength: 1, description: "Concretely: what the child's finger or cursor does, what visibly moves in response, and what failure looks like on screen. Not an adjective or a genre name." },
  mathematicalHook: { type: "string", minLength: 1, description: "The surprising or satisfying thing about this specific mathematics that could make a child say whoa." },
} as const;

async function askPlanner(
  cycle: LearningCycleRecordV2,
  client?: Anthropic,
  model?: string,
  opts: LearningCycleRepositoryOptions = {},
  draw?: AdvanceInput["draw"],
): Promise<CanonicalProgressionDecision> {
  const toolName = "decide_learning_cycle_progression";
  const anthropic = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const chart = getChildChart(cycle.childId, { rootDir: opts.rootDir });
  const {decisionEvidenceIds} = progressionEvidence(cycle);
  const isSynthetic = (id: string): boolean => /(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i.test(id);
  // Exclude dependent citations too: an ordinary-looking evaluation id can cite
  // an observation whose source identifies it as simulated.
  const excluded=new Set<string>();
  const histories=Object.values(chart.learningHistory.constructs);
  for(const history of histories) {
    for(const row of history.observations) if([row.observationId,row.sourceId].some(isSynthetic)) {excluded.add(row.observationId);excluded.add(row.sourceId);}
  }
  const excludedReference=(id:string)=>isSynthetic(id)||excluded.has(id);
  const dependencies=histories.flatMap(history=>[
    ...history.predictions.map(row=>({id:row.predictionId,references:row.evidenceIds})),
    ...history.evaluations.map(row=>({id:row.evaluationId,references:[row.predictionId,row.sourceId,...row.observationIds]})),
    ...history.decisions.map(row=>({id:row.decisionId,references:[...row.evidenceIds,...(row.predictionEvaluationIds??[])]})),
  ]);
  // Each changing pass excludes at least one of these finite record identities.
  for(let pass=0;pass<dependencies.length;pass++) {
    let changed=false;
    for(const row of dependencies) if(!excluded.has(row.id) && [row.id,...row.references].some(excludedReference)) {excluded.add(row.id);changed=true;}
    if(!changed) break;
  }
  const factualDecision = (row: LearningCycleRecordV2['decisionHistory'][number]) =>
    ![row.decisionId,...row.evidenceIds,...(row.predictionEvaluationIds??[])].some(excludedReference);
  const constructIds = new Set([
    ...cycle.academicPredictions.map(row=>row.constructId),
    ...cycle.observations.flatMap(row=>row.constructLinks.map(link=>link.constructId)),
  ]);
  const priorBoard = currentBoardInstance(cycle);
  // Each fact reaches the Planner once (2026-11-04): history rows already in this cycle's section
  // are left out here, and each decision is listed once, not under every word it touched.
  const inCycle = new Set([...cycle.observations.map(row=>row.observationId), ...cycle.academicPredictions.map(row=>row.predictionId), ...cycle.predictionEvaluations.map(row=>row.evaluationId)]);
  const decisions = new Map([...histories.flatMap(history=>history.decisions), ...chart.learningHistory.recentDecisions].filter(factualDecision).map(row=>[row.decisionId,row]));
  const childContext = {
    identity: chart.identity,
    demographics: chart.demographics,
    childVoice: chart.childVoice,
    learningHistory: {
      constructs:Object.fromEntries(Object.entries(chart.learningHistory.constructs).filter(([id])=>constructIds.has(id) && !isSynthetic(id)).map(([id,history])=>[id,{
        constructId:id,
        predictions:history.predictions.filter(row=>!excludedReference(row.predictionId) && !inCycle.has(row.predictionId)),
        observations:history.observations.filter(row=>!excludedReference(row.observationId) && !inCycle.has(row.observationId)).map(plannerObservationView),
        evaluations:history.evaluations.filter(row=>!excludedReference(row.evaluationId) && !inCycle.has(row.evaluationId)),
      }] as const).filter(([,row])=>row.predictions.length+row.observations.length+row.evaluations.length>0)),
      decisions:[...decisions.values()].map(plannerDecisionView),
      pendingInterpretation:chart.learningHistory.pendingInterpretation.filter(row=>![row.sourceId,...row.evaluationIds].some(excludedReference)),
    },
    priorPlan: {
      // Earlier author choices, not instructions or proof about the child.
      boardId:priorBoard.boardId,
      plannerDecisionId:priorBoard.plannerDecisionId,
      instruments:cycle.nodes.filter(node=>priorBoard.nodeIds.includes(node.nodeId)).map(({nodeId,academicTarget,mechanic,evidenceContract})=>({nodeId,academicTarget,mechanic,evidenceContract})),
    },
    engagementEvidence: engagementTheoryEvidenceContext(chart.engagementTheory),

  };
  const factualEvidence = {
    academic: cycle.evidence.academic.filter((item) => !isSynthetic(item.evidenceId)),
    engagement: cycle.evidence.engagement.filter((item) => !isSynthetic(item.evidenceId)),
    companionObservations: cycle.evidence.companionObservations
      .filter((item) => !isSynthetic(item.evidenceId)),
  };
  const factualObservations = cycle.observations.filter((observation) =>
    !isSynthetic(observation.observationId) && !isSynthetic(observation.sourceId)
  ).map(plannerObservationView);
  const baselineEligibility = baselineQuestEvidenceEligibility(cycle);
  // Contract 54 (owner, 2026-11-07): for spelling the Planner decides when Quest is justified; the eligibility count
  // is a fact it reads, not a gate. Math keeps its evidence boundary.
  const encounterGate = cycle.domain !== "spelling";
  const allowedProgressionActions: LearningProgressionAction[] = encounterGate && cycle.lifecycle === "baseline_evaluating" && !baselineEligibility.eligible
    ? ["generate_support", "collect_more_evidence"]
    : ["generate_support", "generate_quest", "generate_boss", "collect_more_evidence", "await_calibration"];
  // One setting chooses the next-board Planner for every subject (owner, 2026-11-09).
  const plannerModel = model ?? process.env.SUNNY_EXPERIENCE_PLANNER_MODEL ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5";
  const savedSpellingItems = spellingAssignmentItems(cycle);
  const builtIns = spellingBuiltInActivities(cycle);
  const legacyContentSchema = {type:'array',items:{type:'object',additionalProperties:false,properties:{contentId:{type:'string'},action:{type:'string',enum:['candidate','reuse','revise','retire']},reason:{type:'string'},evidenceIds:{type:'array',items:{type:'string'}}},required:['contentId','action','reason','evidenceIds']}};
  const instrumentSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      nodeId: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      academicTarget: { type: "string", minLength: 1 },
      mechanic: { type: "string", minLength: 1 },
      theme: { type: "string", minLength: 1 },
      openingPurpose: { type: "string", minLength: 1 },
      ...(cycle.domain === "math" ? { items: MATH_ITEMS_SCHEMA } : {}),
      encounter: { type: "string", enum: ["quest", "boss"], description: "Only on the single Quest or Boss node your progressionAction authorizes." },
      ...DESIGN_FIELDS_SCHEMA,
    },
    required: ["nodeId", "title", "academicTarget", "mechanic", "theme", "openingPurpose", ...(cycle.domain === "math" ? ["items"] : []), ...Object.keys(DESIGN_FIELDS_SCHEMA)],
  };
  // The raw response is checkpointed before validation; a restart from the same
  // frozen snapshot replays it and makes no new provider call (contract 21).
  // One checkpoint per closed evidence batch: keyed by the transition that closed it, so practice
  // replays and recorded prediction evaluations cannot turn a restart into a new paid call.
  const {batchId, revision:checkpointRevision, draftDir, stage:decisionStage} = plannerCheckpoint(cycle,opts);
  const snapshot = {
    childId: cycle.childId, homeworkId: cycle.homeworkId, batchId, lifecycle: cycle.lifecycle,
    cycleRevision: checkpointRevision,
    observationIds: cycle.observations.filter((observation) => observation.provenance !== "practice").map((observation) => observation.observationId),
    model: plannerModel,
  };
  // Spelling, and math from the one-pipeline item intake (owner, 2026-11-08: one next board for both subjects),
  // decide through the same small locked tools. A decision already received through the retired single form,
  // and a citation patch received for it, replay read only; that form is never sent again.
  const math=cycle.domain!=='spelling';
  if(!math||isItemIntakeMathCycle(cycle)){
    const savedDecision=readReceivedMathProviderStage(draftDir,decisionStage);
    if(savedDecision!==undefined){
      const patchStage=`progression-citation-patch-r${checkpointRevision}`;
      const patch=hasReceivedMathProviderStage(draftDir,patchStage)?readPlannerToolReceipt(readReceivedMathProviderStage(draftDir,patchStage),toolName) as Record<string,unknown>:{};
      const decision=parseCanonicalProgressionDecision({...readPlannerToolReceipt(savedDecision,toolName) as Record<string,unknown>,...patch});
      assertPredictionCitations(decision,cycle);
      console.log(` 🎮 [canonical-progression] [saved-decision] [replayed] homework=${cycle.homeworkId} revision=${checkpointRevision}`);
      return decision;
    }
    const evaluationIds=cycle.predictionEvaluations.map(evaluation=>evaluation.evaluationId);
    // Spelling Quest and Boss (owner, 2026-11-05): Quest is the primer once fresh evidence exists, Boss the final
    // check after a Quest; each stage is offered only the choices the contract allows it.
    const actions:LearningProgressionAction[]=cycle.lifecycle==="quest_evaluating"?["generate_boss","generate_support","await_calibration"]
      :cycle.lifecycle==="boss_evaluating"?["await_calibration"]
      :allowedProgressionActions.filter(action=>action!=="generate_boss"&&action!=="await_calibration");
    console.log(` 🎮 [canonical-progression] [actions-offered] homework=${cycle.homeworkId} lifecycle=${cycle.lifecycle} actions=${actions.join(",")}`);
    // A dated owner note (owner, 2026-11-11): a fact in the question while it lasts, never a forced step. The Planner decides.
    const ownerNote=activeOwnerNote({childId:cycle.childId,subject:cycle.domain});
    const encounterOffered=actions.some(action=>action==="generate_quest"||action==="generate_boss");
    if(ownerNote&&!encounterOffered)console.log(` 🎮 [owner-note] [no-encounter-offered] homework=${cycle.homeworkId} lifecycle=${cycle.lifecycle} actions=${actions.join(",")} library_game=not-offered`);
    const libraryFacts=ownerNote?{libraryGames:ownerNote}:{};
    const ownerNoteLine=ownerNote?`A note from her parent for this week: ${ownerNote.note}
${encounterOffered?`These hand-built games are ready: ${ownerNote.games.map(game=>`${game.id} = ${game.title} (${game.role})`).join("; ")}. Whether and when is still your call from her evidence; to use one, put library_game on your quest or boss step and Sunny serves it with that step's ${math?"problems":"words"}.
`:""}`:"";
    // The school test as facts beside the goal (owner, 2026-11-08): how practice approaches test conditions is the Planner's call.
    const schoolTest=schoolTestFacts(chart.homework,cycle.homeworkId);
    console.log(` 🎮 [canonical-progression] [school-test] [${schoolTest?"included":"not-recorded"}] homework=${cycle.homeworkId} testDate=${schoolTest?.testDate??"none"} daysLeft=${schoolTest?.daysLeft??"unknown"}`);
    const idPrefix=`${cycle.homeworkId}-r${checkpointRevision}-step`;
    // Stops Sunny planned and failed to deliver (owner, 2026-11-11): a system failure, said so, never left for the Planner to read as hers.
    // A frozen question keeps its saved prompt, so only questions asked from now on carry this block.
    const systemBlocked=systemBlockedSection(cycle);
    const blockedStops=boardDeliveries(cycle).flatMap(board=>board.stops);
    console.log(` 🎮 [canonical-progression] [system-blocked-stops] [${systemBlocked?"found":"none"}] homework=${cycle.homeworkId} blocked=${blockedStops.filter(stop=>!stop.repaired).length} repaired=${blockedStops.filter(stop=>stop.repaired).length}`);
    // The newest evidence summaries (per-word response times, frustration, help) stay in the question; older ones are in read_record.
    const recentEvidence=JSON.stringify({academic:factualEvidence.academic.slice(-12),engagement:factualEvidence.engagement.slice(-12),companionObservations:factualEvidence.companionObservations.slice(-12)});
    // Her earlier weeks (owner, 2026-11-10): one line here, every week behind read_past_weeks. Frozen with the question.
    const pastWeeks=(()=>{try{return readPastWeeks(cycle.childId,{rootDir:opts.rootDir,homework:chart.homework as HomeworkSources,excludeHomeworkIds:[cycle.homeworkId]});}
      catch(error){console.error(` 🎮 [past-weeks] [read] [failed] homework=${cycle.homeworkId} reason=${error instanceof Error?error.message:String(error)}`);return undefined;}})();
    const RECORD_LINE=`Her newest evidence summaries (the 12 newest of each kind; per-word response times are here):\n${recentEvidence}\nHer full record is behind read_record, a page at a time: lifecycle, assignment, theory, predictions, prediction_evaluations, evidence (all of it), observations (every answer), stops, learning_history, prior_plan, time (her minutes per session and per day: learning games, play, call, waiting, map). The summaries above are drawn from it.${pastWeeksLine(pastWeeks)?`\n${pastWeeksLine(pastWeeks)}`:""}`;
    const cycleFacts=()=>JSON.stringify({ lifecycle: cycle.lifecycle, assignment: cycle.assignment, theory: cycle.academicTheory, predictions: cycle.academicPredictions, predictionEvaluations: cycle.predictionEvaluations, evidence: factualEvidence, observations: factualObservations, nodes: cycle.nodes.map((node) => ({ nodeId: node.nodeId, role: node.role, title: node.title, state: node.state, routeId: node.routeId, evidenceIds: node.evidenceIds.filter((id) => !isSynthetic(id)) })) });
    // The raw record is a tool, not part of the question (2026-11-10: 431,000 characters drowned the summaries).
    const record:Record<string,unknown>=JSON.parse(cycleFacts());
    // time: her minutes per session and per day (learning games, play, call, waiting, map), to weigh effort against results (owner, 2026-11-10).
    Object.assign(record,{stops:record.nodes,prediction_evaluations:record.predictionEvaluations,learning_history:childContext.learningHistory,prior_plan:(childContext as Record<string,unknown>).priorPlan,time:timeRecord(cycle,opts)});
    delete record.nodes; delete record.predictionEvaluations;
    const {learningHistory:_history,...chartInline}=childContext as Record<string,unknown>; delete chartInline.priorPlan;
    // Math: her recorded problems exactly as saved at intake, never re-authored; the menu is the one menu minus math's stated exceptions.
    const mathQuestion=math?(()=>{
      const saved=new Map<string,NonNullable<SuccessorFacts["problems"]>[number]>();
      for(const item of cycle.nodes.flatMap(node=>Object.values(node.evidenceContract.itemContracts??{})))if(!saved.has(item.id))saved.set(item.id,item);
      const problems=[...saved.values()];
      const answeredProblemIds=[...new Set(cycle.observations.map(row=>row.itemId).filter(id=>saved.has(id)))];
      // Honest record: a math Quest or Boss checks problems she has not seen. When her worksheet is used up, the Planner
      // writes new ones with add_problem (2026-11-10), so Quest and Boss stay on the menu.
      const offered=actions;
      if(answeredProblemIds.length>=problems.length)console.log(` 🎮 [canonical-progression] [worksheet-answered] homework=${cycle.homeworkId} unseen=0 add_problem=offered`);
      const facts:SuccessorFacts={builtIns:[],
        // The one game menu is declared on the full catalog (Law 16); STAGE_EXCEPTIONS["math-successor"] removes what cannot bind her problems.
        ...successorMenuFacts(spellingActivityCatalog(cycle.childId),{grade:chart.demographics?.grade,words:[]},"math-successor"),
        evaluationIds,allowedActions:offered,idPrefix,selfReview:true,aimedGames:true,problems,answeredProblemIds,writeProblems:true,playedGames:playedGamesOf(cycle,opts),record,...(pastWeeks?.weeks.length?{pastWeeks}:{}),...libraryFacts,rerunnable:()=>false};
      const prompt=`You are Sunny's AI Planner, her math tutor. The goal: she wants to come back to Sunny, and she solves problems like these on her own by the school test. ${schoolTestLine(schoolTest)}
Compare your preregistered theory and predictions with what she actually did and said, decide what happens next, and build her next board, using the tools.
1. decide: one evidence-grounded decision, with your self-review of the journal and her track record below. Cite the prediction evaluations you judge.
2. Unless you await calibration, build the next board: add_step for each step${facts.rewardBreak?", add_reward for a Mystery reward break (recorded as play, apart from her learning evidence)":""}, then set_order and, when she should pick her path, add_choice. Then finish_board.
Sunny runs each step as you write it. The board she has now stays as it is; yours opens when she chooses it, right away or at a later session. The kiosk screen shows up to 7 stops along any one path, counting the start, the choice and the finish. She sees each step's title. Per-problem answers, assistance and exposure are in the evidence below; her companion talks with her during each activity.
Games on the menu:
${JSON.stringify((facts.activities??[]).map(row=>row.id))}
generated-game is a new game Sunny builds for her from her chart and the story you write for that step, around the problems you give it. It can be aimed at one specific error you name in its focus. Sunny scores her first answer to each problem against the answer recorded at intake. add_problem writes a new problem for her (harder, or a step past her worksheet); Sunny computes its answer from the arithmetic you give, and it counts as unseen. check_first marks a step that checks what she does on her own; a problem she has answered before is recorded as practice there, never as an unseen check.
${facts.playedGames?.length?`Games Sunny built for her that she played; a new generated-game can start from one with build_from, so she keeps what she already learned there and gets this step's content:
${JSON.stringify(facts.playedGames)}
`:""}${mathTrackRecordSection(cycle)}
${plannerJournalSection(cycle)}
${plannerCallsSection(cycle)}
${childFeedbackSection(cycle,opts)}
${schoolTestSection(cycle)}
${handoffSection(cycle,opts)}
${scorecardSection(cycle,opts)}
${systemBlocked}${ownerReplanLine(cycle)}Her recorded problems (from her worksheet; give their ids):
${JSON.stringify(problems.map(item=>({id:item.id,problem:item.prompt})))}
Child chart context (her learning history and prior plan are in read_record):
${JSON.stringify(chartInline)}
${encounterGate ? "Baseline Quest eligibility (runtime truth boundary, not a mastery judgment):" : "Fresh independent evidence so far (a fact for your decision, not a gate; Quest is your call):"}
${JSON.stringify(baselineEligibility)}
Allowed progression actions: ${offered.join(", ")}
${offered.some(action=>action==="generate_quest"||action==="generate_boss")?`Quest and Boss check problems she has not answered yet, on her own. Boss opens from her Quest results and always ends awaiting the graded test. When you choose generate_quest or generate_boss, add exactly one step with that encounter and check_first, using only problems she has not answered.
`:""}${ownerNoteLine}${RECORD_LINE}`;
      return {facts,prompt};
    })():undefined;
    const facts:SuccessorFacts=mathQuestion?.facts??{builtIns:builtIns.map(node=>{const items=Object.values(node.evidenceContract.spellingItems??{});const roles=Object.values(node.evidenceContract.itemRoles??{});
      const model=(node.evidenceContract.nativeConfig as {spellingModel?:{strategy:{title:string;steps:string[]};words:Array<{text:string;tip:string}>};questions?:Array<{prompt:string}>}|undefined);
      return {...(model?.spellingModel?{page:{trick:model.spellingModel.strategy.title,steps:model.spellingModel.strategy.steps,words:model.spellingModel.words.map(word=>({word:word.text,tip:word.tip})),check:model.questions?.[0]?.prompt??""}}:{}),nodeId:node.nodeId,title:node.title,implementationType:node.implementationType??"word-radar",wordIds:[...new Set(items.map(item=>item.wordId))],responseMode:items[0]?.response.mode??"spelling_letters",checkpoint:roles.length>0&&roles.every(role=>role==="fresh_checkpoint")};}),
      // The one menu (Law 16): every certified game and mode, set up fresh for the words she is given, the explainer and the reward break.
      ...successorMenuFacts(spellingActivityCatalog(cycle.childId),{grade:chart.demographics?.grade,words:[...savedSpellingItems.values()].map(item=>({wordId:item.wordId,word:item.word}))}),
      evaluationIds,allowedActions:actions,idPrefix,
      // Owner, 2026-11-08: the Planner may place the board's one creature encounter (a reward; recorded as practice).
      creatureEncounters:true,
      // Contract 56: the decision carries its self-review, and her built-for-her game can be aimed at one error.
      selfReview:true,aimedGames:true,playedGames:playedGamesOf(cycle,opts),record,...(pastWeeks?.weeks.length?{pastWeeks}:{}),...libraryFacts,
      // The same check the re-run step applies, asked while the Planner is still choosing.
      rerunnable:(nodeId:string,wordIds:string[])=>{const source=builtIns.find(node=>node.nodeId===nodeId);return Boolean(source&&repointReusedSetup(source,`${nodeId}-check`,wordIds.map(wordId=>({id:`check:${wordId}`,wordId}))));}};
    const prompt=mathQuestion?.prompt??`You are Sunny's AI Planner, her spelling tutor. The goal: she wants to come back to Sunny, and she knows her words by the school test. ${schoolTestLine(schoolTest)} ${SPELLING_TEST_CONDITIONS}
Compare your preregistered theory and predictions with what she actually did and said, decide what happens next, and build her next board, using the tools.
1. decide: one evidence-grounded decision, with your self-review of the journal and her track record below. Cite the prediction evaluations you judge.
2. Unless you await calibration, build the next board: add_step for each step, add_explainer for a new lesson page${facts.rewardBreak?", add_reward for a Mystery reward break (recorded as play, apart from her learning evidence)":""}, then set_order and, when she should pick her path, add_choice. Then finish_board.
Sunny runs each step as you write it. The board she has now stays as it is; yours opens when she chooses it, right away or at a later session. The kiosk screen shows up to 7 stops along any one path, counting the start, the choice and the finish. She sees each step's title. Per-word response time, assistance, exposure and response mode are in the evidence below; Elli talks with her during each activity.
Games and modes on the menu (a hidden-word Radar is an independent check; the rest are practice):
${JSON.stringify(facts.activities!.map(row=>row.id))}
${facts.activities!.some(row=>row.id==="generated-game")?`generated-game is a new game Sunny builds for her from her chart and the story you write for that step. It can be aimed at one specific error you name in its focus. What she picks and replays shows what she enjoys.
`:""}${facts.playedGames?.length?`Games Sunny built for her that she played; a new generated-game can start from one with build_from, so she keeps what she already learned there and gets this step's content:
${JSON.stringify(facts.playedGames)}
`:""}${spellingTrackRecordSection(cycle)}
${plannerJournalSection(cycle)}
${plannerCallsSection(cycle)}
${childFeedbackSection(cycle,opts)}
${schoolTestSection(cycle)}
${handoffSection(cycle,opts)}
${scorecardSection(cycle,opts)}
${systemBlocked}${ownerReplanLine(cycle)}Tested built-in activities she played, which you may re-run:
${JSON.stringify(facts.builtIns.map(row=>({builtIn:row.nodeId,title:row.title,type:row.implementationType,words:row.wordIds.length,checkpoint:row.checkpoint})))}
Saved spelling words:
${JSON.stringify([...savedSpellingItems.values()].map(item=>({wordId:item.wordId,word:item.word})))}
Child chart context (her learning history and prior plan are in read_record):
${JSON.stringify(chartInline)}
${encounterGate ? "Baseline Quest eligibility (runtime truth boundary, not a mastery judgment):" : "Fresh independent evidence so far (a fact for your decision, not a gate; Quest is your call):"}
${JSON.stringify(baselineEligibility)}
Allowed progression actions: ${actions.join(", ")}
${actions.some(action=>action==="generate_quest"||action==="generate_boss")?`Quest and Boss check her own list words. Boss opens from her Quest results and always ends awaiting the graded test. When you choose generate_quest or generate_boss, add exactly one step with that encounter: a hidden-word check or her generated-game, where each word is hidden and she types it without help.
`:""}${ownerNoteLine}${RECORD_LINE}`;
    // The question is frozen when its evidence batch closes: a restart asks the same question and replays
    // the saved turns at no cost, whatever has been recorded since.
    const frozenFile=path.join(draftDir,`${decisionStage}-tools.question.json`);
    const {rerunnable,...factData}=facts;
    const question=fs.existsSync(frozenFile)?JSON.parse(fs.readFileSync(frozenFile,"utf8")) as {prompt:string;model:string;facts:typeof factData}:{prompt,model:plannerModel,facts:factData};
    if(!fs.existsSync(frozenFile)){fs.mkdirSync(draftDir,{recursive:true});fs.writeFileSync(`${frozenFile}.tmp`,JSON.stringify(question));fs.renameSync(`${frozenFile}.tmp`,frozenFile);}
    const kit=spellingSuccessorToolkit({...question.facts,rerunnable});
    const state=kit.initialState();
    // The self-check never holds back a board: once one is drafted, a failed provider turn publishes the draft.
    const label=math?"math-next-board":"spelling-next-board";
    const stop=await runPlannerToolLoop({label,prompt:question.prompt,model:question.model,maxTokens:16000,tools:kit.tools,state,finished:kit.finished,
      send:providerTurnSender({label,stagePrefix:`${decisionStage}-tools`,draftDir,client:anthropic})}).then(loop=>loop.stats.stop as string,(error:unknown)=>{
        if(!kit.drafted(state))throw error;
        return `failed:${error instanceof Error?error.message:String(error)}`;
      });
    console.log(` 🎮 [canonical-progression] [planner-response] [checkpointed] homework=${cycle.homeworkId} revision=${cycle.revision} tools=${stop}`);
    if(!kit.finished(state)&&!kit.drafted(state))throw new Error(`canonical_progression_tools_unfinished:${stop}`);
    if(!kit.finished(state))console.warn(` 🎮 [planner-tools] [self-check] [unfinished] draft-stands reason=${stop}`);
    const {decision,journey}=kit.result(state);
    if(!journey)return parseCanonicalProgressionDecision(decision);
    const drawing=draw?await draw(journey):await drawJourney({journey,label:`${cycle.homeworkId}:r${checkpointRevision}`,stagePrefix:`${decisionStage}-design`,identity:{childId:cycle.childId,homeworkId:cycle.homeworkId,batchId,journey},child:chart.childVoice,
      checkpointFile:path.join(draftDir,`${decisionStage}-design.json`),rawResponseDir:draftDir,...(client?{client}:{})});
    return parseCanonicalProgressionDecision({...decision,boardDefinition:assembleAdventureBoardDefinition(journey,drawing.composition,drawing.pattern)});
  }
  let request = {
    model: plannerModel,
    // A complete successor program and board exceeded the former 6,000-token allowance.
    max_tokens: 32000,
    messages: [{ role: "user", content: `You are Sunny's AI Planner. Compare the preregistered academic theory and predictions with the factual scorecard. Quest requires a captured, correct, unseen independent checkpoint. Practice cannot satisfy that boundary. For math, author nextItems with stable unique ids, prompts, lineage, and frozen response contracts. Include fresh checkpoint evidence when further progression is intended. Explanation responses remain unscored and cannot independently unlock progression. Never reuse exposed item ids or prompts. Quest tests unseen transfer; Boss tests unseen synthesis; Boss must end awaiting calibration. Call ${toolName} exactly once with one concise decision. Unless progressionAction is await_calibration, author the one complete next board in nextInstruments: you decide how many activities it has. ${BOARD_AUTHORING_INSTRUCTION} The current board is never changed; your program becomes a new board for a later session. Mark exactly one instrument with encounter "quest" only when progressionAction is generate_quest, or "boss" only when it is generate_boss; never add an encounter otherwise.

${ARTIST_BRIEF}

Title each instrument as the child should see it. It appears as the first thing on their screen, so give it a real name, not a category label.

For math, do not copy assignment items or name a prototype to imitate. If evidence is insufficient, prescribe a focused harder or clarifying support board rather than a generic quiz.
For spelling, each instrument must prescribe spelling.wordIds from the saved word identities below, a measurementRole, and a responseMode. You choose which words need teaching or practice and when to collect fresh recall. The server binds the saved spellings and new occasion IDs; you cannot replace answer keys or reset exposure. Fresh recall after practice is not unseen transfer or delayed retention. Include initially secure and targeted words when prescribing a final assignment check.
Saved spelling words:
${JSON.stringify([...savedSpellingItems.values()].map(item => ({ wordId: item.wordId, word: item.word, responseMode: item.response.mode })))}
Tested built-in activities (spelling.builtInActivityId; wordIds are that activity's words):
${JSON.stringify(builtIns.map(node => ({ activityId: node.nodeId, type: node.implementationType, title: node.title, wordIds: [...new Set(Object.values(node.evidenceContract.spellingItems ?? {}).map(item => item.wordId))], checkpoint: Object.values(node.evidenceContract.itemRoles ?? {}).length > 0 && Object.values(node.evidenceContract.itemRoles ?? {}).every(role => role === "fresh_checkpoint") })))}
For spelling, Correct practice after long response time is not effortless recall. Examine per-word response time alongside assistance, exposure, response mode, and instrument ambiguity. When the evidence suggests a child is struggling, author teaching and guided practice before another fresh recall check; let Elli respond conversationally from the live item and child context. Do not infer mastery from supported or partial-visibility practice, and do not use a fixed latency threshold to choose the lesson.

Child chart context:
${JSON.stringify(childContext)}

${encounterGate ? "Baseline Quest eligibility (runtime truth boundary, not a mastery judgment):" : "Fresh independent evidence so far (a fact for your decision, not a gate; Quest is your call):"}
${JSON.stringify(baselineEligibility)}
Allowed progression actions for this lifecycle: ${allowedProgressionActions.join(", ")}

Cycle:
${JSON.stringify({ lifecycle: cycle.lifecycle, assignment: cycle.assignment, theory: cycle.academicTheory, predictions: cycle.academicPredictions, predictionEvaluations: cycle.predictionEvaluations, evidence: factualEvidence, observations: factualObservations, nodes: cycle.nodes.map((node) => ({ nodeId: node.nodeId, role: node.role, title: node.title, state: node.state, routeId: node.routeId, evidenceIds: node.evidenceIds.filter((id) => !isSynthetic(id)) })) })}` }],
    tools: [{
      name: toolName,
      description: "Return one evidence-grounded progression decision.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            enum: ["supported", "revised", "falsified", "inconclusive", "awaiting_calibration"],
          },
          reason: { type: "string" },
          progressionAction: {
            type: "string",
            enum: allowedProgressionActions,
          },
          preserve: { type: "array", items: { type: "string" } },
          change: { type: "array", items: { type: "string" } },
          testNext: { type: "array", items: { type: "string" } },
          nextEvidenceRequired: { type: "array", items: { type: "string" } },
          predictionEvaluationIds: { type: "array", items: { type: "string" } },
          contentDecisions: legacyContentSchema,
          revisedHypothesis: { type: "string" },
          nextInstruments: { type: "array", minItems: 1, items: instrumentSchema },
          boardDefinition: BOARD_DEFINITION_TOOL_SCHEMA,
        },
        required: [
          "status",
          "reason",
          "progressionAction",
          "preserve",
          "change",
          "testNext",
          "nextEvidenceRequired",
          "predictionEvaluationIds",
          // Required so a decision cannot omit its successor; await_calibration's program is ignored.
          "nextInstruments",
        ],
      },
    }],
    tool_choice: { type: "tool", name: toolName },
  } satisfies Parameters<typeof requestPlannerMessage>[1];
  // Freeze new requests before purchase. Legacy stage hashes remain readable;
  // a received old answer is never silently replaced by a changed prompt/budget.
  const frozen=freezePlannerRequest({draftDir,stage:decisionStage,request,legacyContext:snapshot});
  request=frozen.request;
  const rawDecision = await runMathProviderStage({draftDir,stage:decisionStage,model:request.model,request:frozen.receiptContext,beforeRequest:frozen.beforeRequest,execute:async()=>({plannerMessage:await requestPlannerMessage(anthropic,request,{timeout:frozen.timeout})})});
  console.log(` 🎮 [canonical-progression] [planner-response] [checkpointed] homework=${cycle.homeworkId} revision=${cycle.revision}`);
  const received = readPlannerToolReceipt(rawDecision, toolName);
  const decision = parseCanonicalProgressionDecision(received);
  assertPredictionCitations(decision,cycle);
  return decision;
}

type AdvanceInput = {
  childId: string;
  homeworkId: string;
  client?: Anthropic;
  model?: string;
  decide?: (cycle: LearningCycleRecordV2) => Promise<CanonicalProgressionDecision>;
  /** Draws the next board's journey; the map artist when omitted. Tests pass a plain layout. */
  draw?: (journey: AdventureJourneyDefinition) => Promise<{ composition: AdventureBoardComposition; pattern?: string }>;
};

/**
 * One evidence-cited Planner decision for a closed batch. A provider decision that fails validation,
 * or whose outcome is uncertain, blocks the cycle visibly instead of replaying or re-buying it forever.
 */
export async function advanceCanonicalCycleFromEvidence(
  input: AdvanceInput,
  opts: LearningCycleRepositoryOptions = {},
): Promise<LearningCycleRecordV2> {
  // The demo child's free walkthrough answers in code (owner, 2026-11-05); a real child never matches.
  if (!input.client && !input.decide) {
    const demo = (await import("../scripts/questBossDemo")).freeDemoPlannerFor(input.childId, input.homeworkId, opts);
    if (demo) input = { ...input, ...demo };
  }
  // Experiment (owner, 2026-11-05): a decision built ahead on a sandbox copy is used the moment her board
  // finishes. The runtime checks it like a fresh one; a kit it refuses is marked failed and the Planner decides live.
  if (!input.decide) {
    const prebuilt = await import("./prebuiltBoard");
    const kit = prebuilt.prebuiltDecisionFor(getLearningCycle(input.childId, input.homeworkId, opts), opts);
    if (kit) {
      try {
        const decided = await decideOnce({ ...input, decide: async () => structuredClone(kit.decision) as unknown as CanonicalProgressionDecision }, opts);
        prebuilt.markPrebuiltKit(kit, "used", opts);
        console.log(` 🎮 [prebuilt-board] [decision] [used] homework=${input.homeworkId} action=${kit.decision.progressionAction} provider_calls=0`);
        return decided;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        prebuilt.markPrebuiltKit(kit, "failed", opts, reason);
        console.warn(` 🎮 [prebuilt-board] [decision] [refused] homework=${input.homeworkId} reason=${reason} fallback=live_planner`);
      }
    }
  }
  try {
    return await decideOnce(input, opts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = Boolean((error as { status?: number }).status)
      || /^(learning_cycle_revision_conflict|provider_request_rejected|learning_cycle_missing)/.test(message);
    const latest = !input.decide && !retryable ? getLearningCycle(input.childId, input.homeworkId, opts) : null;
    if (latest && ["baseline_evaluating", "quest_evaluating", "boss_evaluating"].includes(latest.lifecycle)) {
      const reason = message.startsWith("provider_outcome_uncertain") ? message : `planner_decision_invalid:${message}`;
      transitionLearningCycle(latest.childId, latest.homeworkId, latest.revision, { type: "block", reason }, opts);
      console.error(` 🎮 [canonical-progression] [blocked] homework=${latest.homeworkId} reason=${reason}`);
    }
    throw error;
  }
}

async function decideOnce(
  input: AdvanceInput,
  opts: LearningCycleRepositoryOptions,
  replay?:NonNullable<LearningCycleDecision['replayedResponse']>&{fromLifecycle:LearningCycleRecordV2['lifecycle']},
): Promise<LearningCycleRecordV2> {
  let cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  if(replay)cycle={...cycle,lifecycle:replay.fromLifecycle};
  if (!["baseline_evaluating", "quest_evaluating", "boss_evaluating"].includes(cycle.lifecycle)) return cycle;
  const calculated = replay ? [] : evaluateAcademicPredictions(cycle.academicPredictions, cycle.observations, (opts.now ?? new Date()).toISOString());
  const missing = calculated.filter((evaluation) => !cycle!.predictionEvaluations.some((saved) => saved.evaluationId === evaluation.evaluationId));
  if (missing.length > 0) {
    cycle = transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, {
      type: "prediction_evaluations_recorded",
      evaluations: missing,
    }, opts);
  }
  const plannerDecision = input.decide ? await input.decide(cycle) : await askPlanner(cycle, input.client, input.model, opts, input.draw);
  if (!input.decide && process.env.SUNNY_PREBUILD_CAPTURE) (await import("./prebuiltBoard")).captureDecision(plannerDecision);
  const decision = resolveCanonicalProgressionDecisionForLifecycle(cycle.lifecycle, plannerDecision);
  const instruments = decision.successor?.instruments ?? [];
  if (cycle.domain === "math") {
    // A reward break carries no problems (Law 16): it is play, never measured.
    for (const instrument of instruments.filter(row => !row.reward)) {
      const items = instrument.items;
      if (!items?.length || new Set(items.map(item => item.id)).size !== items.length) throw new Error("math_instrument_requires_unique_frozen_items");
      instrument.items = items.map(parseDirectItem);
    }
  }
  assertPredictionCitations(decision,cycle);
  const citedEvaluationIds = decision.predictionEvaluationIds ?? [];
  if (cycle.domain !== "spelling" && cycle.lifecycle === "baseline_evaluating"
    && decision.progressionAction === "generate_quest"
    && !baselineQuestEvidenceEligibility(cycle).eligible) {
    throw new Error("canonical_progression_quest_requires_eligible_baseline_evidence");
  }
  if (cycle.lifecycle === "quest_evaluating" && !["generate_boss", "generate_support", "await_calibration"].includes(decision.progressionAction)) {
    throw new Error("canonical_progression_quest_action_invalid");
  }
  if (cycle.domain !== "spelling" && cycle.lifecycle === "quest_evaluating" && decision.progressionAction === "generate_boss") {
    const completedQuests = cycle.nodes.filter((node) => node.role === "quest" && node.state === "completed");
    // Spelling's Quest checks her practiced list words, so its evidence is independent but never unseen.
    const hasUnassistedUnseenQuestEvidence = cycle.observations.some((observation) =>
      completedQuests.some((quest) => observationNode(cycle, observation)?.nodeId === quest.nodeId) &&
      observation.provenance === "independent_probe" &&
      (observation.exposure === "unseen" || cycle.domain === "spelling") &&
      observation.assistance.status === "unassisted");
    if (!hasUnassistedUnseenQuestEvidence) {
      throw new Error("canonical_progression_boss_requires_unseen_quest_evidence");
    }
  }
  if (cycle.lifecycle === "boss_evaluating" && decision.progressionAction !== "await_calibration") {
    throw new Error("canonical_progression_boss_requires_calibration");
  }
  const expectedEncounter = decision.progressionAction === "generate_quest" ? "quest" : decision.progressionAction === "generate_boss" ? "boss" : undefined;
  const encounters = instruments.filter((instrument) => instrument.encounter);
  if (encounters.some((instrument) => instrument.encounter !== expectedEncounter) || encounters.length > 1) {
    throw new Error("canonical_progression_encounter_not_authorized");
  }
  if (expectedEncounter && encounters.length === 0) throw new Error("canonical_progression_encounter_missing");
  const {evidenceIds,decisionEvidenceIds} = progressionEvidence(cycle);
  const latest = getLearningCycle(cycle.childId, cycle.homeworkId, opts);
  if (!latest) throw new Error(`learning_cycle_missing:${cycle.homeworkId}`);
  // The decision belongs to the evidence batch that closed; anything recorded since (practice replays,
  // engagement bookkeeping, session notes) is evidence for the next decision, never a reason to discard
  // this one. The transition below still applies only at the latest revision.
  // The one real guard: a cycle that left this stage meanwhile (paused, or already decided) takes no decision.
  // An explicit operator replay of a received decision onto its blocked cycle is the one exception.
  if (!replay && latest.lifecycle !== cycle.lifecycle) throw new Error(`canonical_progression_stage_changed:${cycle.lifecycle}->${latest.lifecycle}`);
  if (latest.revision !== cycle.revision) console.log(` 🎮 [canonical-progression] [later-evidence-kept] fromRevision=${cycle.revision} toRevision=${latest.revision}`);
  // Catalog records never fail a decision: an order whose built-in has no catalog entry (or no readable chart) records nothing.
  const contentDecisions = cycle.domain === "spelling" ? catalogedOnly(cycle.childId, spellingReuseFromOrders(cycle, decision), opts) : decision.contentDecisions;
  if (!replay && contentDecisions?.length) {
    applyEvidenceBasedMathContentDecisions(cycle.childId, contentDecisions, decisionEvidenceIds, opts);
  }
  const saved = transitionLearningCycle(cycle.childId, cycle.homeworkId, latest.revision, {
    type: "theory_decided",
    decision: {
      ...decision,
      nextAction: decision.progressionAction,
      evidenceIds,
      predictionEvaluationIds: citedEvaluationIds,
      ...(replay?{replayedResponse:{blockedDecisionId:replay.blockedDecisionId,requestHash:replay.requestHash,receiptHash:replay.receiptHash,reason:replay.reason,...(replay.deferredContentDecisions?{deferredContentDecisions:replay.deferredContentDecisions}:{})}}:{}),
    },
  }, opts);
  // Her folder keeps a readable journal of each decision; a failed write is logged inside and never blocks the board.
  writePlannerJournalEntry(saved, saved.decisionHistory.at(-1)!, opts);
  return saved;
}

/** Games Sunny built for her that she played, with her answers in each (owner, 2026-11-09): the Planner may build from one. */
export function playedGamesOf(cycle:LearningCycleRecordV2,opts:LearningCycleRepositoryOptions={}):Array<{nodeId:string;title:string;answers:number;right:number;minutesToFirstAnswer?:number|null;tutorNote?:string}>{
  const built=new Set(cycle.nodes.filter(node=>node.implementationType==="generated-game"&&node.artifactBinding?.localArtifactPath).map(node=>node.nodeId));
  return gameTrackRecord(cycle,opts).filter(row=>built.has(row.nodeId)).map(({game:_game,...row})=>row);
}
