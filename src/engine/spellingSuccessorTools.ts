import { answerInWording } from "./answerInWording";
import { familyClock } from "../utils/familyCalendar";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { plannerJournalFile } from "./plannerIntrospection";
import { expandJourneySequence, type AdventureJourneyDefinition } from "../shared/adventureBoardDefinition";
import { finishJourneySequence, journeyOrderTools, removeFromJourney, type JourneyOrderState } from "./journeyTools";
import { toolFor, type PlannerTool } from "./plannerToolLoop";
import { VALID_VALUES } from "./plannerTransport";
import { deriveNativeActivity } from "./assignmentPlanner";
import { explainerPageTool } from "./spellingTeachingTools";
import { rewardBreakTool } from "./plannerMenu";
import type { LearningCycleMathItem, PlannerExperiment, PlannerReadBack } from "./learningCycleRepository";
import { LIVE_RECORD_SECTIONS, readChildEvidenceSection, type LiveRecordSection } from "../profiles/childEvidence";
import { boardWording } from "./boardWording";
import { getLearningCycle } from "./learningCycleRepository";
import { READ_BACK_GRADES, settleReadBack, type ReadBackInput } from "./plannerReadBack";
import { queryRecordTool } from "./recordQuery";
import { claimHowSheLearnsTool, pastWeeksTool, type PastWeeksArchive } from "./pastWeeks";
import { conceptKey, type PaperReadinessCall } from "./readyOnPaper";

/** The next-board Planner's small locked tools, one toolkit for every subject. The Planner makes the theory
 * decision and orders each step: a re-run of a tested built-in she played (its own words or fewer), or any
 * game and mode on the menu with any of her words. For math (facts carry `problems`), a step is a game built
 * for her recorded problems, never re-authored. Code fills each step's response mode, role, setup and identity.
 * The artist draws the journey afterwards. */
export type LessonPage = { trick: string; steps: string[]; words: Array<{ word: string; tip: string }>; check: string };
export type SuccessorFacts = {
  builtIns: Array<{ nodeId: string; title: string; implementationType: string; wordIds: string[]; responseMode: string; checkpoint: boolean; page?: LessonPage }>;
  /** The games and modes on the menu, with what code fills in for each. Older frozen questions have none. */
  activities?: Array<{ id: string; checkpoint: boolean; setup: { type: string; wordRadarConfig?: Record<string, unknown>; letterRushMode?: string } }>;
  /** Present when a new page can be written: her grade, and her words as text with their identities. */
  explainer?: { grade: unknown; words: Array<{ wordId: string; word: string }> };
  evaluationIds: string[]; allowedActions: string[]; idPrefix: string;
  /** Whether a step may carry the board's one creature encounter (owner, 2026-11-08). Older frozen questions lack it. */
  creatureEncounters?: boolean;
  /** Contract 56: the decision carries the Planner's self-review. Older frozen questions lack it and replay as asked. */
  selfReview?: boolean;
  /** Owner 2026-11-24: the decision carries the tutor's experiment, ungraded; its bets are scored by code. Replaces
   * selfReview and readBack on new questions; older frozen questions keep theirs and replay as asked. */
  experiment?: boolean;
  /** The ids a read-back may cite (her words, answers, prediction evaluations, parent notes); offered means read_back is asked. */
  readBack?: { evidenceIds: string[] };
  /** Her files, read on demand as of this question (read_record live sections, read_board_wording); never frozen in full. */
  childEvidence?: { childId: string; homeworkId: string; asOf: string; rootDir?: string };
  /** Contract 56: a generated-game step can be aimed at one error. Older frozen questions lack it. */
  aimedGames?: boolean;
  /** Law 16: the reward break is on every board's menu. Older frozen questions lack it and replay as asked. */
  rewardBreak?: boolean;
  /** Math (owner, 2026-11-08: one next board for both subjects): her recorded problems, as saved at intake,
   * and the ones she has already answered. Spelling and older frozen questions have none. */
  problems?: LearningCycleMathItem[];
  answeredProblemIds?: string[];
  /** Math: each earlier board step's id and the recorded problems it showed, so a based_on naming a step that showed
   * exactly one problem is read as that problem (Ila board 13, 2026-11-23). Older frozen questions have none. */
  stepProblems?: Record<string, string[]>;
  /** Games Sunny built for her that she played (owner, 2026-11-09): a new generated-game can start from one, so she
   * keeps the mechanic she already learned with new content. Older frozen questions have none. */
  playedGames?: Array<{ nodeId: string; title: string; answers: number; right: number; minutesToFirstAnswer?: number | null; tutorNote?: string }>;
  /** Math: the Planner may write new problems; code computes each answer (2026-11-10). Older frozen questions lack it. */
  writeProblems?: boolean;
  /** Her full record by section, read with read_record instead of pasted into the question (2026-11-10). */
  record?: Record<string, unknown>;
  /** Her earlier weeks, frozen with the question (owner, 2026-11-10: week-to-week memory). Older frozen questions have none. */
  pastWeeks?: PastWeeksArchive;
  /** Owner note with hand-built library games (owner, 2026-11-11), present only while a dated note is active.
   * The Planner may put one on its Quest or Boss step; nothing is inserted for it. Older frozen questions have none. */
  libraryGames?: { note?: string; games: Array<{ id: string; title: string; role: "quest" | "boss" }> };
  /** Whether the re-run step can really prepare this built-in for these words (the same check it runs). */
  rerunnable: (nodeId: string, wordIds: string[]) => boolean;
};
type Fresh = NonNullable<SuccessorFacts["activities"]>[number];
type Encounter = "quest" | "boss";
type Step = { buildFrom?: string; id: string; title: string; purpose: string; story: string; picture: string; wordIds: string[]; reward?: true; problemIds?: string[]; checkFirst?: boolean; builtIn?: SuccessorFacts["builtIns"][number]; fresh?: Fresh; page?: Record<string, unknown>; encounter?: Encounter; creatureEncounter?: string; focus?: string; libraryGame?: string };
type SelfReview = { whatITried: string; whatHappened: string; why: string; whatIKeep?: string; whatIChangeNow: string };
type Decision = { status: string; reason: string; progressionAction: string; preserve: string[]; change: string[]; testNext: string[]; nextEvidenceRequired: string[]; predictionEvaluationIds: string[]; revisedHypothesis: string; selfReview?: SelfReview; readBack?: PlannerReadBack; experiment?: PlannerExperiment };
type Finished = { decision: Record<string, unknown>; journey?: AdventureJourneyDefinition };
export type SuccessorState = JourneyOrderState & { next: number; steps: Step[]; decision?: Decision; result?: Finished; draft?: Finished; selfChecks?: number;
  /** Problems the Planner wrote on this board (2026-11-10), by id. */
  written?: Record<string, LearningCycleMathItem> };

/** The Planner gets one look at the board as served before it is accepted; it can never loop on it. */
const MAX_SELF_CHECKS = 1;

const text = (description: string) => z.string().min(1).describe(description);
const enumOf = (values: readonly string[], fallback: string) => z.enum((values.length ? values : [fallback]) as [string, ...string[]]);
/** A pick from her history: played games, built-ins, words, problems, evaluations. These lists grow with every board, so
 * they never go into the strict grammar (Ila, 2026-11-10: 8 boards of them outgrew what the provider compiles). The field
 * is text; its description lists the valid values, and code accepts exactly those, answering anything else so the
 * Planner can fix it. Small fixed vocabularies (status, verdict, actions, the game menu) stay enums. */
const pickFrom = (values: readonly string[], fallback: string, what: string, description: string) => {
  const valid = values.length ? [...values] : [fallback], accepted = new Set(valid);
  const shown = valid.length <= 40 ? valid.join(", ") : `${valid.slice(0, 40).join(", ")} and ${valid.length - 40} more, all listed in this field's description`;
  return z.string().refine(value => accepted.has(value), { error: issue => `${String(issue.input)} is not one of ${what}; valid: ${shown}` })
    .describe(`${description} ${VALID_VALUES} ${JSON.stringify(valid)}`);
};
export function spellingSuccessorToolkit(facts: SuccessorFacts) {
  const tool = toolFor<SuccessorState>();
  // Only what the re-run step can prepare is on the menu: a built-in it cannot re-run at all never appears.
  const builtIns = new Map(facts.builtIns.filter(row => facts.rerunnable(row.nodeId, row.wordIds)).map(row => [row.nodeId, row]));
  const fresh = new Map((facts.activities ?? []).filter(row => !builtIns.has(row.id)).map(row => [row.id, row]));
  const played = facts.playedGames ?? [];
  const buildFromField = played.length ? { build_from: pickFrom(played.map(row => row.nodeId), "none", "the games Sunny built for her that she played", "generated-game only: a game Sunny built for her that she played (the nodeId from that list in the question). She keeps what she already learned there and gets this step's content: its comesBack fact says whether it returns as it is at no build cost or is rebuilt from (a full build). Leave out to build a new game.").optional() } : {};
  /** The game to build from, when the Planner named one: only a generated-game can start from a game she played. */
  const buildFromOf = (input: { built_in: string; build_from?: string }): { ok: true; value: { buildFrom?: string } } | { ok: false; error: string } => {
    const from = typeof input.build_from === "string" && input.build_from !== "none" ? input.build_from : "";
    if (!from) return { ok: true, value: {} };
    if (fresh.get(input.built_in)?.setup.type !== "generated-game") return { ok: false, error: `build_from starts a generated-game from a game she played; ${input.built_in} plays as it is` };
    if (!played.some(row => row.nodeId === from)) return { ok: false, error: `${from} is not a game Sunny built for her that she played` };
    return { ok: true, value: { buildFrom: from } };
  };
  const allWordIds = [...new Set(facts.builtIns.flatMap(row => row.wordIds))];
  // A new question asks for the experiment instead of a self-review or read-back; both offer the calls code scores.
  const readBack = facts.experiment ? undefined : facts.readBack;
  const readBackIds = new Set(readBack?.evidenceIds ?? []);
  const calls = Boolean(facts.selfReview || facts.experiment);
  const strings = z.array(z.string().min(1));
  // Quest and Boss are offered only when the decision may authorize them, so older frozen questions keep their exact tools.
  const encounters = (["quest", "boss"] as const).filter(name => facts.allowedActions.includes(`generate_${name}`));
  const encounterFor = (action: string): Encounter | undefined => action === "generate_quest" ? "quest" : action === "generate_boss" ? "boss" : undefined;
  const problems = facts.problems ? new Map(facts.problems.map(item => [item.id, item])) : undefined;
  /** based_on must be a real recorded problem. A step id that showed exactly one is read as that problem; anything else
   * is answered in the conversation with where problem ids are. */
  const basedOn = (raw: string): { ok: true; id: string } | { ok: false; error: string } => {
    const id = raw.trim();
    if (problems?.has(id)) return { ok: true, id };
    const shown = [...new Set(facts.stepProblems?.[id] ?? [])].filter(row => problems?.has(row));
    if (shown.length === 1) return { ok: true, id: shown[0] };
    if (shown.length) return { ok: false, error: `${id} is a board step that showed ${shown.length} problems (${shown.join(", ")}); based_on takes one problem id: pick one of those.` };
    const valid = [...(problems?.keys() ?? [])];
    return { ok: false, error: `${id} is not one of her recorded problems. based_on takes an id from Her recorded problems in the question (a step id names a stop, not a problem); valid: ${valid.slice(0, 40).join(", ")}${valid.length > 40 ? ` and ${valid.length - 40} more` : ""}` };
  };
  const answered = new Set(facts.answeredProblemIds ?? []);
  // The Planner writes as many new problems as it wants (owner, 2026-11-11); only the tool loop's call bound limits it.
  // Ids keep the shape ${idPrefix}-problem-N in writing order, so saved turns of an older frozen question replay to the same ids.
  const writeProblems = Boolean(problems && facts.writeProblems);
  const nextProblemId = (state: SuccessorState) => {
    for (let n = Object.keys(state.written ?? {}).length + 1; ; n++) {
      const id = `${facts.idPrefix}-problem-${n}`;
      if (!state.written?.[id] && !problems?.has(id)) return id;
    }
  };
  const problemOf = (state: SuccessorState, id: string) => problems?.get(id) ?? state.written?.[id];
  const missing = problems ? "problems" : "words";
  // The 3D library games (always offered since 2026-11-25), placeable only on an encounter this question can authorize.
  const library = (facts.libraryGames?.games ?? []).filter(game => (encounters as readonly string[]).includes(game.role));
  const libraryField = library.length ? { library_game: enumOf(["none", ...library.map(game => game.id)], "none").optional()
    .describe(`Only on your quest or boss step, and only a game whose role matches it: ${library.map(game => `${game.id} = ${game.title} (${game.role})`).join("; ")}. Sunny serves that hand-built game with this step's ${problems ? "problems" : "words"} instead of building one. none or leave out otherwise.`) } : {};
  /** The library game the Planner put on this step, checked against its encounter. */
  const libraryOf = (input: { library_game?: string }, encounter: Encounter | undefined): { ok: true; value: { libraryGame?: string } } | { ok: false; error: string } => {
    const id = typeof input.library_game === "string" && input.library_game !== "none" ? input.library_game : "";
    if (!id) return { ok: true, value: {} };
    const game = library.find(row => row.id === id);
    if (!game) return { ok: false, error: `${id} is not an offered library game` };
    if (encounter !== game.role) return { ok: false, error: `${game.title} is the ${game.role} game: put it only on the step with encounter ${game.role}` };
    return { ok: true, value: { libraryGame: id } };
  };
  const tools: PlannerTool<SuccessorState>[] = [
    tool({ name: "decide", description: "Your call on what happens next. status, reason and progression_action are the decision; every other field is there when you want it, and code saves and scores what you give. Calling it again replaces it.",
      schema: z.object({
        status: z.enum(["supported", "revised", "falsified", "inconclusive", "awaiting_calibration"]), reason: text("Why, from the evidence."),
        progression_action: enumOf(facts.allowedActions, "collect_more_evidence"),
        preserve: strings.optional(), change: strings.optional(), test_next: strings.optional(), next_evidence_required: strings.optional(),
        prediction_evaluation_ids: facts.evaluationIds.length ? z.array(pickFrom(facts.evaluationIds, "none", "the offered prediction evaluations", "One prediction evaluation id (read_record prediction_evaluations has each one in full).")).optional().describe("The evaluations of earlier predictions you are judging, if any.") : z.array(z.string()).max(0).optional().describe("There are no evaluations yet."),
        revised_hypothesis: z.string().optional().describe("Your revised hypothesis, if you have one."),
        ...(facts.selfReview ? { self_review: z.object({
          what_i_tried: text(`What you tried on earlier boards for the ${missing} she is still missing, from your journal. On a first decision, say so.`),
          what_happened: text(`What happened to those ${missing}, from her track record: what she ${problems ? "answered" : "wrote"}, on her own and with help.`),
          why: text("Why you think it happened."),
          what_i_keep: text("What worked for her, from her answers and her session retros (what she understood, enjoyed or got right), that you keep."),
          what_i_change_now: text("What you change now, and why that is a better try than the last."),
        }).strict().optional().describe(`Your review of your own track record: your journal and her answers on each ${problems ? "problem" : "word"}, read side by side. Saved in your journal.`) } : {}),
        ...(facts.experiment ? { experiment: z.object({
          trying: text("What you are trying on this board, and what it should change in her answers on her own."),
          why: text("Why this is the next thing to try, from her answers and her words."),
          conclusion_on_last: text("What reality said about your last experiment, from the ledger: its bets as code scored them. On a first experiment, say so."),
        }).strict().optional().describe("Your experiment for this board. Code scores your bets (expect_on_her_own) only on the board it builds, and shows you the result next time.") } : {}),
        ...(readBack ? { read_back: z.object({
          previous_theory: text("Your theory going into this board, read back as written above."),
          grade: z.enum(READ_BACK_GRADES).describe("That theory against the new evidence: supported, revised, falsified, or unclear."),
          why: text("Why, from what she did and said since."),
          evidence_ids: z.array(z.string()).describe("The bracketed ids above that your grade rests on (said:…, ans-…, evaluation:…, note:…). A grade citing none is saved as unclear."),
          how_she_thinks: text("Your belief about how she thinks about this skill."),
          competing_explanation: text("The other explanation that fits the same evidence."),
          board_tells_apart: text("Which problems on this board come out differently under your belief and under the competing explanation, and what each predicts she answers."),
        }).strict().optional().describe("Your last theory, read back and graded; code saves it with the decision.") } : {}),
        ...(played.length ? { game_notes: z.array(z.object({ game: pickFrom(played.map(row => row.nodeId), "none", "the games Sunny built for her that she played", "A game she played: its nodeId from that list in the question."), verdict: z.enum(["keep", "fix", "retire"]),
          why: text("Why, from how she played it: her answers, her time to a first answer, what she said.") }).strict()).optional()
          .describe("Your note on games she played: keep (bring it back, with new content via build_from), fix (what to change), or retire (do not build from it again). The builder reads your latest note.") } : {}),
        ...(calls ? { expect_on_her_own: z.array(z.object({ item: pickFrom(problems ? [...problems.keys()] : allWordIds, "none", `her ${problems ? "recorded problems" : "words"}`, `One of her ${problems ? "problems" : "words"} this board works on, by id.`),
          right: z.boolean().describe("true if you expect her next answer on her own to be right; false if not yet.") }).strict()).optional()
          .describe(`Your calls, ${problems ? "problem" : "word"} by ${problems ? "problem" : "word"}: will she get it right on her own next time? Code checks each call against her next answer on her own and shows you the tally.`) } : {}),
        ...(calls ? (problems
          ? { school_test_forecast: z.object({ min: z.number().describe("Lowest share of her school test she gets right, 0 to 1."), max: z.number().describe("Highest share, 0 to 1."),
              why: text("Why, from her answers on her own so far.") }).strict().optional()
              .describe("Your forecast of her graded school test on this assignment, made fresh from today's evidence. Code locks it with your model and the time, beside a plain baseline from her first tries on her own, and scores both when the grade comes back.") }
          : { school_test_forecast: z.array(z.object({ word: z.string().min(1).describe("A word id from her list."), chance: z.number().describe("The chance, 0 to 1, that she spells it right on the school test."),
              why: text("Why, from her answers on this word.") }).strict()).optional()
              .describe("Your forecast for her graded school test, word by word, made fresh from today's evidence. Code locks it with your model and the time, beside a plain baseline from her first tries on her own, and scores both when the grade comes back.") }) : {}),
        ...(calls ? { ready_on_paper: z.array(z.object({ concept: text("One concept this assignment teaches, in a parent's words (for example Rounding to tens)."),
          chance: z.number().describe("The chance, 0 to 1, that she gets this concept right alone on paper now."), why: text("Why, from her answers on her own."),
          proof: text("The paper work that would show it, for example the Lesson 1.2 sheet."),
          items: z.array(z.string().min(1).describe(`One of her ${problems ? "recorded problem ids" : "word ids"}.`)).optional()
            .describe(`Her ${problems ? "problems" : "words"} that belong to this concept, by id. Code locks a plain arithmetic guess from her first tries on her own on them, scored beside yours.${problems ? " Her later answers to these problems are filed under this concept as her skill." : ""}`) }).strict()).optional()
          .describe("Your call, concept by concept: could she show it alone on paper now? A parent tags each item of her next paper with its concept; code scores your chance against what she does alone and checks across your calls whether a higher chance goes with a better result. A chance of 0.8 or more tells her parent to give her the paper.") } : {}),
      }).strict(),
      run: (state, input) => {
        const review = (input as { self_review?: Record<"what_i_tried" | "what_happened" | "why" | "what_i_keep" | "what_i_change_now", string> }).self_review;
        const bets = (input as { expect_on_her_own?: Array<{ item: string; right: boolean }> }).expect_on_her_own;
        const experiment = (input as { experiment?: { trying: string; why: string; conclusion_on_last: string } }).experiment;
        const notes = (input as { game_notes?: Array<{ game: string; verdict: "keep" | "fix" | "retire"; why: string }> }).game_notes;
        // The school-test forecast is checked by code: every word, chances 0 to 1, a score range in order (2026-11-13).
        const forecast = (input as { school_test_forecast?: unknown }).school_test_forecast;
        let schoolForecast: { forecaster: string; words?: Array<{ wordId: string; chance: number; why: string }>; score?: { min: number; max: number; why: string } } | undefined;
        if (Array.isArray(forecast)) {
          const rows = forecast as Array<{ word: string; chance: number; why: string }>;
          const unknown = rows.filter(row => !allWordIds.includes(row.word)).map(row => row.word);
          if (unknown.length) return { ok: false, error: `school_test_forecast: ${unknown.join(", ")} is not one of her words; valid: ${allWordIds.join(", ")}` };
          if (rows.some(row => !(row.chance >= 0 && row.chance <= 1))) return { ok: false, error: "school_test_forecast: each chance is between 0 and 1" };
          schoolForecast = { forecaster: "planner", words: rows.map(row => ({ wordId: row.word, chance: row.chance, why: row.why })) };
        } else if (forecast && typeof forecast === "object") {
          const score = forecast as { min: number; max: number; why: string };
          if (!(score.min >= 0 && score.min <= score.max && score.max <= 1)) return { ok: false, error: "school_test_forecast: 0 <= min <= max <= 1" };
          schoolForecast = { forecaster: "planner", score: { min: score.min, max: score.max, why: score.why } };
        }
        // Ready-on-paper calls (2026-11-16): chances 0 to 1, each concept once.
        const ready = (input as { ready_on_paper?: PaperReadinessCall[] }).ready_on_paper;
        if (ready?.some(row => !(row.chance >= 0 && row.chance <= 1))) return { ok: false, error: "ready_on_paper: each chance is between 0 and 1" };
        if (ready && new Set(ready.map(row => conceptKey(row.concept))).size !== ready.length) return { ok: false, error: "ready_on_paper: name each concept once" };
        const validItems = problems ? [...problems.keys(), ...Object.keys(state.written ?? {})] : allWordIds;
        const unknownItem = ready?.flatMap(row => row.items ?? []).find(id => !validItems.includes(id));
        if (unknownItem) return { ok: false, error: `ready_on_paper: ${unknownItem} is not one of her ${problems ? "problems" : "words"}; valid: ${validItems.join(", ")}` };
        state.decision = { status: input.status, reason: input.reason, progressionAction: input.progression_action, preserve: input.preserve ?? [], change: input.change ?? [], testNext: input.test_next ?? [],
          nextEvidenceRequired: input.next_evidence_required ?? [], predictionEvaluationIds: [...new Set(input.prediction_evaluation_ids ?? [])], revisedHypothesis: input.revised_hypothesis ?? "",
          ...(readBack ? { readBack: settleReadBack((input as { read_back?: ReadBackInput }).read_back, readBackIds) } : {}),
          ...(review ? { selfReview: { whatITried: review.what_i_tried, whatHappened: review.what_happened, why: review.why, whatIKeep: review.what_i_keep, whatIChangeNow: review.what_i_change_now } } : {}),
          ...(experiment ? { experiment: { trying: experiment.trying, why: experiment.why, conclusionOnLast: experiment.conclusion_on_last } } : {}),
          ...(bets?.length ? { expectations: bets.map(row => ({ itemId: row.item, onHerOwn: row.right })) } : {}),
          ...(notes?.length ? { gameNotes: notes.map(row => ({ nodeId: row.game, verdict: row.verdict, why: row.why })) } : {}),
          ...(schoolForecast ? { schoolForecast } : {}),
          ...(ready?.length ? { readyOnPaper: ready.map(row => ({ concept: row.concept.trim(), chance: row.chance, why: row.why, proof: row.proof, ...(row.items?.length ? { items: [...new Set(row.items)] } : {}) })) } : {}) };
        state.result = undefined;
        const graded = state.decision.readBack;
        // Said inside the same conversation (never a veto): a grade on nothing real is saved as unclear.
        const readBackNote = !readBack || !graded ? {} : graded.missing ? {}
          : graded.claimedGrade || graded.unknownEvidenceIds?.length ? { read_back: `saved as ${graded.grade}${graded.unknownEvidenceIds?.length ? `; not offered ids: ${graded.unknownEvidenceIds.join(", ")}` : ""}${graded.claimedGrade ? `; your grade ${graded.claimedGrade} cited no offered id` : ""}. Call decide again to fix.` } : {};
        return { ok: true, result: { action: input.progression_action, ...readBackNote } };
      } }),
    problems ? tool({ name: "add_step", description: "Add one step: a game on the menu, built for her from her chart and this step's story, with any of her recorded problems. Returns its step_id.",
      schema: z.object({ built_in: enumOf([...fresh.keys()], "none").describe("The game for this step."),
        problems: z.array(writeProblems
          // Written ids exist only once add_problem returns them, so the field is text and run checks each id against the board.
          ? z.string().min(1).describe(`A problem id: one of her recorded problems, or one add_problem returned on this board. Her recorded problems: ${JSON.stringify([...problems.keys()])}`)
          : pickFrom([...problems.keys()], "none", "her recorded problems", "A problem id: one of her recorded problems in the question.")).describe(`Which of her recorded problems this step uses, by id. At least one.${writeProblems ? " A problem you wrote with add_problem uses the id it returned." : ""}`),
        check_first: z.boolean().describe("True when this step checks what she can do on her own before any help; false for practice."),
        title: text("The short name she sees under the portal: 2 to 4 words."), purpose: text("What this step is for, in one sentence."),
        story: text("What this stop is in her world: one or two sentences Elli can tell her as it opens."), picture: text("What this stop's picture on her map shows, for the illustrator."),
        ...(encounters.length ? { encounter: enumOf(["none", ...encounters], "none").describe("quest or boss only on the one step your progression_action authorizes; none for every other step.") } : {}),
        ...(facts.aimedGames ? { focus: z.string().optional().describe("The one specific error this game is aimed at, in your words (for example odd plus even). The game builder reads it. Leave out for no single aim.") } : {}),
        ...buildFromField, ...libraryField }).strict(),
      run: (state, input) => {
        const game = fresh.get(input.built_in);
        if (!game) return { ok: false, error: `no game ${input.built_in}` };
        if (!input.problems.length) return { ok: false, error: `${input.built_in} needs the problems it uses` };
        if (new Set(input.problems).size !== input.problems.length) return { ok: false, error: "a problem is listed more than once" };
        const unwritten = input.problems.find(id => !problemOf(state, id));
        if (unwritten) return { ok: false, error: `${unwritten} is not one of her recorded problems or the problems add_problem returned on this board; valid: ${JSON.stringify([...problems.keys(), ...Object.keys(state.written ?? {})])}. A new problem needs add_problem first.` };
        const encounter = input.encounter && input.encounter !== "none" ? input.encounter as Encounter : undefined;
        if (encounter) {
          if (!state.decision || encounterFor(state.decision.progressionAction) !== encounter) return { ok: false, error: `a ${encounter} step needs progression_action generate_${encounter}: decide first` };
          if (state.steps.some(row => row.encounter)) return { ok: false, error: "the board already has its one encounter step" };
          // A math Quest or Boss checks unseen problems on her own: one she has answered already is no longer unseen.
          const seen = input.problems.filter(id => answered.has(id));
          if (!input.check_first || seen.length) return { ok: false, error: `the ${encounter} checks problems she has not seen, on her own: set check_first${seen.length ? ` and leave out ${seen.join(", ")}, which she has answered already` : ""}` };
        }
        const focus = typeof input.focus === "string" ? input.focus.trim() : "";
        const from = buildFromOf(input as { built_in: string; build_from?: string });
        if (!from.ok) return from;
        const libraryGame = libraryOf(input as { library_game?: string }, encounter);
        if (!libraryGame.ok) return libraryGame;
        state.next += 1;
        const id = `${facts.idPrefix}-${state.next}`;
        state.steps.push({ id, title: input.title, purpose: input.purpose, story: input.story, picture: input.picture, wordIds: [], problemIds: [...input.problems], checkFirst: input.check_first, fresh: game, ...(encounter ? { encounter } : {}), ...(focus ? { focus } : {}), ...from.value, ...libraryGame.value });
        state.result = undefined;
        const seen = input.check_first ? input.problems.filter(id => answered.has(id)) : [];
        return { ok: true, result: { step_id: id, problems: input.problems.length, role: input.check_first ? "fresh_checkpoint" : "practice", ...(encounter ? { encounter } : {}),
          ...(seen.length ? { note: `${seen.join(", ")} she has answered before, so her answer there is recorded as practice, not an unseen check` } : {}) } };
      } }) :
    tool({ name: "add_step", description: "Add one step: any game and mode on the menu, with any of her words, or a re-run of a built-in she played, for all of its own words or fewer. Returns its step_id.",
      schema: z.object({ built_in: pickFrom([...builtIns.keys(), ...fresh.keys()], "none", "the games and modes on the menu or the built-ins she played", "The game and mode for this step (the menu in the question), or the built-in it re-runs (its builtIn id in the question)."),
        words: z.array(pickFrom(allWordIds, "none", "her words", "One of her words, by wordId (her saved spelling words in the question).")).describe("Which of her words this step uses. For a re-run, empty means all of its own words."),
        title: text("The short name she sees under the portal: 2 to 4 words."), purpose: text("What this step is for, in one sentence."),
        story: text("What this stop is in her world: one or two sentences Elli can tell her as it opens."), picture: text("What this stop's picture on her map shows, for the illustrator."),
        ...(encounters.length ? { encounter: enumOf(["none", ...encounters], "none").describe("quest or boss only on the one step your progression_action authorizes; none for every other step.") } : {}),
        ...(facts.creatureEncounters ? { creature_encounter: z.string().optional().describe("Leave out for no creature. To place this board's one creature encounter here, say why now. It is a rare reward, not practice: when she finishes this step a creature may appear, and each word she got right on this step is one throw at it. The encounter asks no new questions and adds no evidence, so place it to reward and motivate (for example after words that are close to secure), never to get more practice.") } : {}),
        ...(facts.aimedGames ? { focus: z.string().optional().describe("generated-game only: the one specific error this game is aimed at, in your words (for example the m before p in import). The game builder reads it. Leave out for no single aim.") } : {}),
        ...buildFromField, ...libraryField }).strict(),
      run: (state, input) => {
        if (new Set(input.words).size !== input.words.length) return { ok: false, error: "a word is listed more than once" };
        const creatureReason = typeof input.creature_encounter === "string" ? input.creature_encounter.trim() : "";
        const creatureHolder = state.steps.find(row => row.creatureEncounter);
        if (creatureReason && creatureHolder) return { ok: false, error: `the board already has its one creature encounter, on ${creatureHolder.id}: remove it there first` };
        const creature = creatureReason ? { creatureEncounter: creatureReason } : {};
        const focus = typeof input.focus === "string" ? input.focus.trim() : "";
        const from = buildFromOf(input as { built_in: string; build_from?: string });
        if (!from.ok) return from;
        if (focus && fresh.get(input.built_in)?.setup.type !== "generated-game") return { ok: false, error: `focus aims a generated-game; ${input.built_in} plays as it is` };
        const encounter = input.encounter && input.encounter !== "none" ? input.encounter as Encounter : undefined;
        const libraryGame = libraryOf(input as { library_game?: string }, encounter);
        if (!libraryGame.ok) return libraryGame;
        if (encounter) {
          if (!state.decision || encounterFor(state.decision.progressionAction) !== encounter) return { ok: false, error: `a ${encounter} step needs progression_action generate_${encounter}: decide first` };
          if (state.steps.some(row => row.encounter)) return { ok: false, error: "the board already has its one encounter step" };
          // Her words are hidden and typed without help: a hidden-word check, her own generated game, or the owner's library game.
          const id = input.built_in, checkable = libraryGame.value.libraryGame || fresh.get(id)?.checkpoint || builtIns.get(id)?.checkpoint || fresh.get(id)?.setup.type === "generated-game";
          if (!checkable) return { ok: false, error: `${id} cannot be the ${encounter}: use a hidden-word check or generated-game, where her words are hidden and typed` };
        }
        const game = fresh.get(input.built_in);
        if (game) {
          if (!input.words.length) return { ok: false, error: `${input.built_in} needs the words it practices` };
          state.next += 1;
          const id = `${facts.idPrefix}-${state.next}`;
          state.steps.push({ id, title: input.title, purpose: input.purpose, story: input.story, picture: input.picture, wordIds: [...input.words], fresh: game, ...(encounter ? { encounter } : {}), ...creature, ...(focus ? { focus } : {}), ...from.value, ...libraryGame.value });
          state.result = undefined;
          return { ok: true, result: { step_id: id, words: input.words.length, role: encounter || game.checkpoint ? "fresh_checkpoint" : "practice", ...(encounter ? { encounter } : {}), ...(creatureReason ? { creature_encounter: true } : {}) } };
        }
        const builtIn = builtIns.get(input.built_in);
        if (!builtIn) return { ok: false, error: `no built-in ${input.built_in}` };
        const foreign = input.words.find(word => !builtIn.wordIds.includes(word));
        if (foreign) return { ok: false, error: `${foreign} is not one of ${builtIn.title}'s words (${builtIn.wordIds.join(", ")})` };
        if (input.words.length && !facts.rerunnable(builtIn.nodeId, input.words)) return { ok: false, error: `${builtIn.title} cannot be re-run for just those words (its questions or tiles use its other words). It can be re-run with all of its words: leave words empty, or choose another built-in.${facts.explainer && builtIn.implementationType === "visual-explainer" ? " To teach just those words, write a new page with add_explainer." : ""}` };
        state.next += 1;
        const id = `${facts.idPrefix}-${state.next}`;
        state.steps.push({ id, title: input.title, purpose: input.purpose, story: input.story, picture: input.picture, wordIds: input.words.length ? [...input.words] : [...builtIn.wordIds], builtIn, ...(encounter ? { encounter } : {}), ...creature, ...libraryGame.value });
        state.result = undefined;
        return { ok: true, result: { step_id: id, words: state.steps.at(-1)!.wordIds.length, role: builtIn.checkpoint ? "fresh_checkpoint" : "practice", ...(encounter ? { encounter } : {}), ...(creatureReason ? { creature_encounter: true } : {}) } };
      } }),
    ...(facts.explainer ? [explainerPageTool<SuccessorState>({ grade: facts.explainer.grade, returns: "step_id",
      word: enumOf(facts.explainer.words.map(row => row.word), "none").describe("One of her words."),
      look: { story: text("What this stop is in her world: one or two sentences Elli can tell her as it opens."), picture: text("What this stop's picture on her map shows, for the illustrator.") },
      run: (state, page, input) => {
        state.next += 1;
        const id = `${facts.idPrefix}-${state.next}`;
        const wordIds = page.words.map(word => facts.explainer!.words.find(row => row.word === word)!.wordId);
        // The same completion every Teaching page goes through, so both reach the kiosk in one form.
        const { activityConfig } = deriveNativeActivity({ id, type: "visual-explainer", activityConfig: page.activityConfig }) as { activityConfig: Record<string, unknown> };
        state.steps.push({ id, title: input.title, purpose: String(activityConfig.learningGoal), story: input.story, picture: input.picture, wordIds, page: activityConfig });
        state.result = undefined;
        return { ok: true, result: { step_id: id, words: wordIds.length, role: "practice" } };
      } })] : []),
    ...(facts.rewardBreak ? [rewardBreakTool<SuccessorState>({ returns: "step_id", add: (state, input) => {
      state.next += 1;
      const id = `${facts.idPrefix}-${state.next}`;
      state.steps.push({ id, title: input.title, purpose: "A reward break: play time.", story: input.story, picture: input.picture, wordIds: [], reward: true });
      state.result = undefined;
      return { ok: true, result: { step_id: id, words: 0, role: "reward" } };
    } })] : []),
    ...(facts.record ? [tool({ name: "read_record", description: `Read any part of her full record, a page at a time. Lists come back in pages: give offset and limit.${facts.childEvidence ? ` Read from her files as of this question: ${LIVE_RECORD_SECTIONS.join(", ")}. Her talk and transcripts are speech-to-text of the room, so another person's words can appear as hers.` : ""}`,
      schema: z.object({ section: enumOf([...Object.keys(facts.record), ...(facts.childEvidence ? LIVE_RECORD_SECTIONS.filter(name => !(name in facts.record!)) : [])], "none"), offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
      run: (_state, input) => {
        const live = facts.childEvidence && (LIVE_RECORD_SECTIONS as readonly string[]).includes(input.section) && !(input.section in facts.record!);
        const value = live ? readChildEvidenceSection(input.section as LiveRecordSection, facts.childEvidence!) : facts.record![input.section];
        if (!Array.isArray(value)) return { ok: true, result: { section: input.section, value: value ?? null } };
        const offset = input.offset ?? 0, limit = input.limit ?? 40;
        return { ok: true, result: { section: input.section, total: value.length, offset, rows: value.slice(offset, offset + limit) } };
      } })] : []),
    ...(facts.childEvidence ? [tool({ name: "read_board_wording", description: "The exact words a board showed her: each stop's title, story, aim and opening screen as you wrote them, and the words inside each built game.",
      schema: z.object({ board: z.number().int().min(1).describe("The board number on this assignment, 1 = her first.") }).strict(),
      run: (_state, input) => {
        const cycle = getLearningCycle(facts.childEvidence!.childId, facts.childEvidence!.homeworkId, { rootDir: facts.childEvidence!.rootDir });
        if (!cycle) return { ok: false, error: "her record for this assignment is not readable now" };
        const wording = boardWording(cycle, input.board, { rootDir: facts.childEvidence!.rootDir });
        return "stops" in wording ? { ok: true as const, result: wording } : { ok: false as const, error: String(wording.error) };
      } })] : []),
    // Owner 2026-11-24 (contract 63): a tutor tells the parents what they saw and what to try; parents are not always
    // there, so it never waits for a reply and never blocks a board. The note lands in her planner journal.
    ...(facts.childEvidence ? [tool({ name: "ask_parents", description: "Leave a dated note or question for her parents: what you see in her work, or what you want to know from them. Teaching her is Sunny's job. It is saved in your journal for them; it never waits for a reply.",
      schema: z.object({ note: text("The note or question, in plain words for a parent.") }).strict(),
      run: (_state, input) => {
        const file = plannerJournalFile({ childId: facts.childEvidence!.childId, homeworkId: facts.childEvidence!.homeworkId }, { rootDir: facts.childEvidence!.rootDir });
        try {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.appendFileSync(file, `\n## Note for her parents (${familyClock(new Date())})\n\n${input.note.trim()}\n`);
        } catch (error) {
          console.error(` 🎮 [planner] [ask-parents] [failed] homework=${facts.childEvidence!.homeworkId}`, error);
          return { ok: false, error: "the note could not be saved now" };
        }
        console.log(` 🎮 [planner] [ask-parents] [saved] child=${facts.childEvidence!.childId} homework=${facts.childEvidence!.homeworkId}`);
        return { ok: true, result: { saved: true } };
      } })] : []),
    ...(facts.pastWeeks?.weeks.length ? [pastWeeksTool<SuccessorState>(facts.pastWeeks)] : []),
    ...(facts.pastWeeks?.claims ? [claimHowSheLearnsTool<SuccessorState>(facts.pastWeeks)!] : []),
    ...(facts.pastWeeks?.claims?.asOfSequence !== undefined ? [queryRecordTool<SuccessorState>(facts.pastWeeks.childId, facts.pastWeeks.claims.asOfSequence)] : []),
    ...(writeProblems ? [tool({ name: "add_problem", description: "Write a new problem for her, harder or different from her worksheet, to push her past what she has done. Give the arithmetic that produces its answer: Sunny computes the answer from it and scores her against that, so a wrong key can never mark her wrong. Returns the problem's id for add_step; it counts as unseen.",
      schema: z.object({ based_on: z.string().min(1).describe("The recorded problem this one grows from: an id from Her recorded problems in the question (a step id names a stop, not a problem)."), prompt: text("The problem exactly as she will see it, with every number she needs."),
        answer_expression: z.string().min(1).max(200).describe("Numbers and + - * / ( ) only, giving the answer, for example 298 + 171 - 402."),
        unit: z.string().max(30).optional(), why: text("Why this problem, for her, now.") }).strict(),
      run: (state, input) => {
        const expression = input.answer_expression.trim();
        if (!/^[\d\s+\-*/().]+$/.test(expression)) return { ok: false, error: "answer_expression may hold only numbers and + - * / ( )" };
        let answer: number;
        try { answer = Number(Function(`"use strict"; return (${expression});`)()); } catch { return { ok: false, error: "answer_expression does not compute" }; }
        if (!Number.isFinite(answer)) return { ok: false, error: "answer_expression does not give a number" };
        answer = Math.round(answer * 1e9) / 1e9;
        const source = basedOn(input.based_on);
        if (!source.ok) return source;
        const base = problems!.get(source.id)!, id = nextProblemId(state);
        state.written = { ...(state.written ?? {}), [id]: { id, prompt: input.prompt.trim(), lineage: { sourceEvidenceIds: [...base.lineage.sourceEvidenceIds, `planner-written:${id}`], exposure: "unseen", measurementRole: "practice" },
          response: { mode: "numeric", expected: answer, ...(input.unit?.trim() ? { unit: input.unit.trim() } : {}) } } as LearningCycleMathItem };
        state.result = undefined;
        // The answer in her problem's words is on her screen (Reina, 2026-11-25): written anyway, never blocked; the
        // Planner is told and decides, and her answer to it is recorded as helped (learningCycleRuntime).
        const shown = answerInWording(input.prompt, answer);
        console.log(` 🎮 [planner-tools] [problem-written] id=${id} based_on=${source.id}${source.id !== input.based_on ? ` from_step=${input.based_on}` : ""} answer=${answer}${shown ? ` answer_in_wording="${shown}"` : ""}`);
        return { ok: true, result: { problem_id: id, answer, based_on: source.id,
          ...(shown ? { answer_in_wording: `Her answer ${answer} is in your wording ("${shown}"), so she can read it off the screen and her answer will count as helped, not as a check. Rewrite it with add_problem if you want it to measure her; keep it if showing it is the point.` } : {}) } };
      } })] : []),
    tool({ name: "remove_step", description: "Remove a step you added, and take it off the order and the choice.",
      schema: z.object({ step_id: text("A step_id you were given.") }).strict(),
      run: (state, input) => {
        if (!state.steps.some(row => row.id === input.step_id)) return { ok: false, error: `no step ${input.step_id}` };
        state.steps = state.steps.filter(row => row.id !== input.step_id);
        removeFromJourney(state, input.step_id);
        state.result = undefined;
        return { ok: true, result: { removed: input.step_id } };
      } }),
    ...journeyOrderTools<SuccessorState>({ exists: (state, id) => state.steps.some(row => row.id === id), idName: "step_id", onChange: state => { state.result = undefined; } }),
    tool({ name: "finish_board", description: "Finish after deciding (and, unless you await calibration, placing every step). Sunny first shows you the board as she will see it, once, next to your change list; call finish_board again to accept it. Otherwise it says exactly what to fix.",
      schema: z.object({ title: text("The board's name she sees."), endpoint_label: text("Name of the finish portal."), single_path_reason: z.string().describe("When there is no choice, why one path is right. Empty when there is a choice.") }).strict(),
      run: (state, input) => {
        if (!state.decision) return { ok: false, error: "make your decision first with decide" };
        const base = { ...state.decision, ...(state.decision.revisedHypothesis.trim() ? {} : { revisedHypothesis: undefined }) };
        if (state.decision.progressionAction === "await_calibration") {
          state.result = { decision: { ...base, nextInstruments: [] } };
          return { ok: true, result: { accepted: true, board: false } };
        }
        const wanted = encounterFor(state.decision.progressionAction), marked = state.steps.filter(row => row.encounter);
        if (wanted && (marked.length !== 1 || marked[0].encounter !== wanted)) return { ok: false, error: `generate_${wanted} needs exactly one step added with encounter ${wanted}` };
        if (!wanted && marked.length) return { ok: false, error: `remove the ${marked[0].encounter} step: your progression_action does not authorize it` };
        const sequence = finishJourneySequence(state, state.steps, input, { add: "add_step", plural: "steps", remove: "remove_step" });
        if (!sequence.ok) return sequence;
        const journey = expandJourneySequence(sequence.sequence, state.steps);
        const word = (id: string) => facts.explainer?.words.find(row => row.wordId === id)?.word ?? id;
        const pageOf = (row: Step): LessonPage | undefined => {
          if (!row.page) return row.builtIn?.page;
          const config = row.page as { strategy: { title: string; steps: string[] }; words: Array<{ text: string; tip: string }>; check: { prompt: string } };
          return { trick: config.strategy.title, steps: config.strategy.steps, words: config.words.map(item => ({ word: item.text, tip: item.tip })), check: config.check.prompt };
        };
        const nextInstruments = state.steps.map(row => row.reward ? {
          // A reward break is play: no words, no measurement, never learning evidence.
          nodeId: row.id, title: row.title, academicTarget: row.purpose, mechanic: "mystery", theme: row.story, picture: row.picture, openingPurpose: row.purpose, reward: true,
        } : row.problemIds ? {
          // Her recorded problems exactly as saved at intake; only this step's measurement role is code's to write.
          nodeId: row.id, title: row.title, academicTarget: row.purpose, mechanic: row.libraryGame ? "generated-game" : row.fresh!.setup.type, theme: row.story, picture: row.picture, openingPurpose: row.purpose,
          ...(row.encounter ? { encounter: row.encounter } : {}), ...(row.focus ? { focus: row.focus } : {}), ...(row.buildFrom ? { buildFrom: row.buildFrom } : {}), ...(row.libraryGame ? { libraryGame: row.libraryGame } : {}),
          items: row.problemIds.map(id => { const item = structuredClone(problemOf(state, id)!); return { ...item, lineage: { ...item.lineage, measurementRole: row.checkFirst ? "fresh_checkpoint" : "practice" } }; }),
        } : ({
          nodeId: row.id, title: row.title, academicTarget: row.purpose, mechanic: row.page ? "visual-explainer" : row.builtIn?.implementationType ?? row.fresh!.setup.type, theme: row.story, picture: row.picture, openingPurpose: row.purpose,
          ...(row.encounter ? { encounter: row.encounter } : {}),
          ...(row.creatureEncounter ? { creatureEncounter: { reason: row.creatureEncounter } } : {}),
          ...(row.focus ? { focus: row.focus } : {}),
          ...(row.buildFrom ? { buildFrom: row.buildFrom } : {}),
          ...(row.libraryGame ? { libraryGame: row.libraryGame } : {}),
          spelling: row.encounter
            ? { wordIds: [...row.wordIds], measurementRole: "fresh_checkpoint", responseMode: "spelling_letters", ...(row.builtIn ? { builtInActivityId: row.builtIn.nodeId } : { activity: { id: row.fresh!.id, ...structuredClone(row.fresh!.setup) } }) }
            : row.page
            ? { wordIds: [...row.wordIds], measurementRole: "practice", responseMode: "tap_selection", activity: { id: "visual-explainer", type: "visual-explainer", activityConfig: row.page } }
            : row.builtIn
            ? { wordIds: [...row.wordIds], measurementRole: row.builtIn.checkpoint ? "fresh_checkpoint" : "practice", responseMode: row.builtIn.responseMode, builtInActivityId: row.builtIn.nodeId }
            : { wordIds: [...row.wordIds], measurementRole: row.fresh!.checkpoint ? "fresh_checkpoint" : "practice", responseMode: "spelling_letters", activity: { id: row.fresh!.id, ...structuredClone(row.fresh!.setup) } },
        }));
        const finished = { decision: { ...base, nextInstruments }, journey };
        state.selfChecks = state.selfChecks ?? 0;
        if (state.selfChecks < MAX_SELF_CHECKS) {
          state.selfChecks += 1;
          state.draft = finished;
          console.log(` 🎮 [planner-tools] [self-check] [shown] steps=${nextInstruments.length}`);
          return { ok: true, result: { accepted: false, your_change_list: state.decision.change,
            board_as_served: state.steps.map(row => ({ step_id: row.id, title: row.title, story: row.story, game: row.reward ? "reward break" : row.page ? "visual-explainer" : row.builtIn?.implementationType ?? row.fresh!.setup.type,
              ...(row.problemIds ? { problems: row.problemIds.map(id => `${id}: ${problemOf(state, id)!.prompt}`), check_first: row.checkFirst } : { words: row.wordIds.map(word) }), ...(row.focus ? { aimed_at: row.focus } : {}), ...(row.buildFrom ? { built_from: played.find(game => game.nodeId === row.buildFrom)?.title } : {}), ...(row.libraryGame ? { library_game: library.find(game => game.id === row.libraryGame)?.title } : {}), ...(pageOf(row) ? { lesson_page: pageOf(row) } : {}) })),
            next: `This is what she will see. Compare it with your change list: does each stop really teach what you said? Fix anything that does not with ${problems ? "add_step" : "add_step, add_explainer"} or remove_step, then call finish_board again. If it is right, call finish_board again now.` } };
        }
        state.result = finished;
        console.log(` 🎮 [planner-tools] [self-check] [${JSON.stringify(state.draft?.decision.nextInstruments) === JSON.stringify(nextInstruments) ? "confirmed" : "revised"}] steps=${nextInstruments.length}`);
        return { ok: true, result: { accepted: true, steps: nextInstruments.length } };
      } }),
  ];
  return {
    tools,
    initialState: (): SuccessorState => ({ next: 0, steps: [] }),
    finished: (state: SuccessorState) => Boolean(state.result),
    /** A board reached the self-check, so it stands even if the Planner never finishes again. */
    drafted: (state: SuccessorState) => Boolean(state.draft),
    result: (state: SuccessorState) => { const finished = state.result ?? state.draft; if (!finished) throw new Error("successor_board_unfinished"); return finished; },
  };
}
