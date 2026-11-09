import { z } from "zod";
import { expandJourneySequence, type AdventureJourneyDefinition } from "../shared/adventureBoardDefinition";
import { finishJourneySequence, journeyOrderTools, removeFromJourney, type JourneyOrderState } from "./journeyTools";
import { toolFor, type PlannerTool } from "./plannerToolLoop";
import { deriveNativeActivity } from "./assignmentPlanner";
import { explainerPageTool } from "./spellingTeachingTools";
import { rewardBreakTool } from "./plannerMenu";
import type { LearningCycleMathItem } from "./learningCycleRepository";

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
  /** Contract 56: a generated-game step can be aimed at one error. Older frozen questions lack it. */
  aimedGames?: boolean;
  /** Law 16: the reward break is on every board's menu. Older frozen questions lack it and replay as asked. */
  rewardBreak?: boolean;
  /** Math (owner, 2026-11-08: one next board for both subjects): her recorded problems, as saved at intake,
   * and the ones she has already answered. Spelling and older frozen questions have none. */
  problems?: LearningCycleMathItem[];
  answeredProblemIds?: string[];
  /** Whether the re-run step can really prepare this built-in for these words (the same check it runs). */
  rerunnable: (nodeId: string, wordIds: string[]) => boolean;
};
type Fresh = NonNullable<SuccessorFacts["activities"]>[number];
type Encounter = "quest" | "boss";
type Step = { id: string; title: string; purpose: string; story: string; picture: string; wordIds: string[]; reward?: true; problemIds?: string[]; checkFirst?: boolean; builtIn?: SuccessorFacts["builtIns"][number]; fresh?: Fresh; page?: Record<string, unknown>; encounter?: Encounter; creatureEncounter?: string; focus?: string };
type SelfReview = { whatITried: string; whatHappened: string; why: string; whatIChangeNow: string };
type Decision = { status: string; reason: string; progressionAction: string; preserve: string[]; change: string[]; testNext: string[]; nextEvidenceRequired: string[]; predictionEvaluationIds: string[]; revisedHypothesis: string; selfReview?: SelfReview };
type Finished = { decision: Record<string, unknown>; journey?: AdventureJourneyDefinition };
export type SuccessorState = JourneyOrderState & { next: number; steps: Step[]; decision?: Decision; result?: Finished; draft?: Finished; selfChecks?: number };

/** The Planner gets one look at the board as served before it is accepted; it can never loop on it. */
const MAX_SELF_CHECKS = 1;

const text = (description: string) => z.string().min(1).describe(description);
const enumOf = (values: readonly string[], fallback: string) => z.enum((values.length ? values : [fallback]) as [string, ...string[]]);

export function spellingSuccessorToolkit(facts: SuccessorFacts) {
  const tool = toolFor<SuccessorState>();
  // Only what the re-run step can prepare is on the menu: a built-in it cannot re-run at all never appears.
  const builtIns = new Map(facts.builtIns.filter(row => facts.rerunnable(row.nodeId, row.wordIds)).map(row => [row.nodeId, row]));
  const fresh = new Map((facts.activities ?? []).filter(row => !builtIns.has(row.id)).map(row => [row.id, row]));
  const allWordIds = [...new Set(facts.builtIns.flatMap(row => row.wordIds))];
  const strings = z.array(z.string().min(1));
  // Quest and Boss are offered only when the decision may authorize them, so older frozen questions keep their exact tools.
  const encounters = (["quest", "boss"] as const).filter(name => facts.allowedActions.includes(`generate_${name}`));
  const encounterFor = (action: string): Encounter | undefined => action === "generate_quest" ? "quest" : action === "generate_boss" ? "boss" : undefined;
  const problems = facts.problems ? new Map(facts.problems.map(item => [item.id, item])) : undefined;
  const answered = new Set(facts.answeredProblemIds ?? []);
  const missing = problems ? "problems" : "words";
  const tools: PlannerTool<SuccessorState>[] = [
    tool({ name: "decide", description: "Your one decision about the learning theory, compared with what she actually did. Calling it again replaces it.",
      schema: z.object({
        status: z.enum(["supported", "revised", "falsified", "inconclusive", "awaiting_calibration"]), reason: text("Why, from the evidence."),
        progression_action: enumOf(facts.allowedActions, "collect_more_evidence"),
        preserve: strings, change: strings, test_next: strings, next_evidence_required: strings,
        prediction_evaluation_ids: facts.evaluationIds.length ? z.array(enumOf(facts.evaluationIds, "none")).describe("The evaluations of earlier predictions you are judging. At least one.") : z.array(z.string()).max(0).describe("Leave empty: there are no evaluations yet."),
        revised_hypothesis: z.string().describe("Your revised hypothesis, or empty."),
        ...(facts.selfReview ? { self_review: z.object({
          what_i_tried: text(`What you tried on earlier boards for the ${missing} she is still missing, from your journal. On a first decision, say so.`),
          what_happened: text(`What happened to those ${missing}, from her track record: what she ${problems ? "answered" : "wrote"}, on her own and with help.`),
          why: text("Why you think it happened."),
          what_i_change_now: text("What you change now, and why that is a better try than the last."),
        }).strict().describe(`Your review of your own track record before deciding: your journal and her answers on each ${problems ? "problem" : "word"}, read side by side.`) } : {}),
      }).strict(),
      run: (state, input) => {
        if (facts.evaluationIds.length && !input.prediction_evaluation_ids.length) return { ok: false, error: "cite at least one of the offered prediction_evaluation_ids" };
        const review = (input as { self_review?: Record<"what_i_tried" | "what_happened" | "why" | "what_i_change_now", string> }).self_review;
        state.decision = { status: input.status, reason: input.reason, progressionAction: input.progression_action, preserve: input.preserve, change: input.change, testNext: input.test_next,
          nextEvidenceRequired: input.next_evidence_required, predictionEvaluationIds: [...new Set(input.prediction_evaluation_ids)], revisedHypothesis: input.revised_hypothesis,
          ...(review ? { selfReview: { whatITried: review.what_i_tried, whatHappened: review.what_happened, why: review.why, whatIChangeNow: review.what_i_change_now } } : {}) };
        state.result = undefined;
        return { ok: true, result: { action: input.progression_action } };
      } }),
    problems ? tool({ name: "add_step", description: "Add one step: a game on the menu, built for her from her chart and this step's story, with any of her recorded problems. Returns its step_id.",
      schema: z.object({ built_in: enumOf([...fresh.keys()], "none").describe("The game for this step."),
        problems: z.array(enumOf([...problems.keys()], "none")).describe("Which of her recorded problems this step uses, by id. At least one."),
        check_first: z.boolean().describe("True when this step checks what she can do on her own before any help; false for practice."),
        title: text("The short name she sees under the portal: 2 to 4 words."), purpose: text("What this step is for, in one sentence."),
        story: text("What this stop is in her world: one or two sentences Elli can tell her as it opens."), picture: text("What this stop's picture on her map shows, for the illustrator."),
        ...(encounters.length ? { encounter: enumOf(["none", ...encounters], "none").describe("quest or boss only on the one step your progression_action authorizes; none for every other step.") } : {}),
        ...(facts.aimedGames ? { focus: z.string().optional().describe("The one specific error this game is aimed at, in your words (for example odd plus even). The game builder reads it. Leave out for no single aim.") } : {}) }).strict(),
      run: (state, input) => {
        const game = fresh.get(input.built_in);
        if (!game) return { ok: false, error: `no game ${input.built_in}` };
        if (!input.problems.length) return { ok: false, error: `${input.built_in} needs the problems it uses` };
        if (new Set(input.problems).size !== input.problems.length) return { ok: false, error: "a problem is listed more than once" };
        const encounter = input.encounter && input.encounter !== "none" ? input.encounter as Encounter : undefined;
        if (encounter) {
          if (!state.decision || encounterFor(state.decision.progressionAction) !== encounter) return { ok: false, error: `a ${encounter} step needs progression_action generate_${encounter}: decide first` };
          if (state.steps.some(row => row.encounter)) return { ok: false, error: "the board already has its one encounter step" };
          // A math Quest or Boss checks unseen problems on her own: one she has answered already is no longer unseen.
          const seen = input.problems.filter(id => answered.has(id));
          if (!input.check_first || seen.length) return { ok: false, error: `the ${encounter} checks problems she has not seen, on her own: set check_first${seen.length ? ` and leave out ${seen.join(", ")}, which she has answered already` : ""}` };
        }
        const focus = typeof input.focus === "string" ? input.focus.trim() : "";
        state.next += 1;
        const id = `${facts.idPrefix}-${state.next}`;
        state.steps.push({ id, title: input.title, purpose: input.purpose, story: input.story, picture: input.picture, wordIds: [], problemIds: [...input.problems], checkFirst: input.check_first, fresh: game, ...(encounter ? { encounter } : {}), ...(focus ? { focus } : {}) });
        state.result = undefined;
        const seen = input.check_first ? input.problems.filter(id => answered.has(id)) : [];
        return { ok: true, result: { step_id: id, problems: input.problems.length, role: input.check_first ? "fresh_checkpoint" : "practice", ...(encounter ? { encounter } : {}),
          ...(seen.length ? { note: `${seen.join(", ")} she has answered before, so her answer there is recorded as practice, not an unseen check` } : {}) } };
      } }) :
    tool({ name: "add_step", description: "Add one step: any game and mode on the menu, with any of her words, or a re-run of a built-in she played, for all of its own words or fewer. Returns its step_id.",
      schema: z.object({ built_in: enumOf([...builtIns.keys(), ...fresh.keys()], "none").describe("The game and mode for this step, or the built-in it re-runs."),
        words: z.array(enumOf(allWordIds, "none")).describe("Which of her words this step uses. For a re-run, empty means all of its own words."),
        title: text("The short name she sees under the portal: 2 to 4 words."), purpose: text("What this step is for, in one sentence."),
        story: text("What this stop is in her world: one or two sentences Elli can tell her as it opens."), picture: text("What this stop's picture on her map shows, for the illustrator."),
        ...(encounters.length ? { encounter: enumOf(["none", ...encounters], "none").describe("quest or boss only on the one step your progression_action authorizes; none for every other step.") } : {}),
        ...(facts.creatureEncounters ? { creature_encounter: z.string().optional().describe("Leave out for no creature. To place this board's one creature encounter here, say why now. It is a rare, high-stakes reward: when she finishes this step a creature may appear, and she charges the orb to catch it by spelling this step's words again (recorded as practice). Best used sparingly, for example when these words are close to secure.") } : {}),
        ...(facts.aimedGames ? { focus: z.string().optional().describe("generated-game only: the one specific error this game is aimed at, in your words (for example the m before p in import). The game builder reads it. Leave out for no single aim.") } : {}) }).strict(),
      run: (state, input) => {
        if (new Set(input.words).size !== input.words.length) return { ok: false, error: "a word is listed more than once" };
        const creatureReason = typeof input.creature_encounter === "string" ? input.creature_encounter.trim() : "";
        const creatureHolder = state.steps.find(row => row.creatureEncounter);
        if (creatureReason && creatureHolder) return { ok: false, error: `the board already has its one creature encounter, on ${creatureHolder.id}: remove it there first` };
        const creature = creatureReason ? { creatureEncounter: creatureReason } : {};
        const focus = typeof input.focus === "string" ? input.focus.trim() : "";
        if (focus && fresh.get(input.built_in)?.setup.type !== "generated-game") return { ok: false, error: `focus aims a generated-game; ${input.built_in} plays as it is` };
        const encounter = input.encounter && input.encounter !== "none" ? input.encounter as Encounter : undefined;
        if (encounter) {
          if (!state.decision || encounterFor(state.decision.progressionAction) !== encounter) return { ok: false, error: `a ${encounter} step needs progression_action generate_${encounter}: decide first` };
          if (state.steps.some(row => row.encounter)) return { ok: false, error: "the board already has its one encounter step" };
          // Her words are hidden and typed without help: a hidden-word check, or her own generated game.
          const id = input.built_in, checkable = fresh.get(id)?.checkpoint || builtIns.get(id)?.checkpoint || fresh.get(id)?.setup.type === "generated-game";
          if (!checkable) return { ok: false, error: `${id} cannot be the ${encounter}: use a hidden-word check or generated-game, where her words are hidden and typed` };
        }
        const game = fresh.get(input.built_in);
        if (game) {
          if (!input.words.length) return { ok: false, error: `${input.built_in} needs the words it practices` };
          state.next += 1;
          const id = `${facts.idPrefix}-${state.next}`;
          state.steps.push({ id, title: input.title, purpose: input.purpose, story: input.story, picture: input.picture, wordIds: [...input.words], fresh: game, ...(encounter ? { encounter } : {}), ...creature, ...(focus ? { focus } : {}) });
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
        state.steps.push({ id, title: input.title, purpose: input.purpose, story: input.story, picture: input.picture, wordIds: input.words.length ? [...input.words] : [...builtIn.wordIds], builtIn, ...(encounter ? { encounter } : {}), ...creature });
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
          nodeId: row.id, title: row.title, academicTarget: row.purpose, mechanic: row.fresh!.setup.type, theme: row.story, picture: row.picture, openingPurpose: row.purpose,
          ...(row.encounter ? { encounter: row.encounter } : {}), ...(row.focus ? { focus: row.focus } : {}),
          items: row.problemIds.map(id => { const item = structuredClone(problems!.get(id)!); return { ...item, lineage: { ...item.lineage, measurementRole: row.checkFirst ? "fresh_checkpoint" : "practice" } }; }),
        } : ({
          nodeId: row.id, title: row.title, academicTarget: row.purpose, mechanic: row.page ? "visual-explainer" : row.builtIn?.implementationType ?? row.fresh!.setup.type, theme: row.story, picture: row.picture, openingPurpose: row.purpose,
          ...(row.encounter ? { encounter: row.encounter } : {}),
          ...(row.creatureEncounter ? { creatureEncounter: { reason: row.creatureEncounter } } : {}),
          ...(row.focus ? { focus: row.focus } : {}),
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
              ...(row.problemIds ? { problems: row.problemIds.map(id => `${id}: ${problems!.get(id)!.prompt}`), check_first: row.checkFirst } : { words: row.wordIds.map(word) }), ...(row.focus ? { aimed_at: row.focus } : {}), ...(pageOf(row) ? { lesson_page: pageOf(row) } : {}) })),
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
