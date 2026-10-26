import { z } from "zod";
import { expandJourneySequence, type AdventureJourneyDefinition } from "../shared/adventureBoardDefinition";
import { finishJourneySequence, journeyOrderTools, removeFromJourney, type JourneyOrderState } from "./journeyTools";
import { toolFor, type PlannerTool } from "./plannerToolLoop";

/** The next-board Planner's small locked tools. The Planner makes the theory decision and orders
 * tested built-ins; a built-in re-runs with exactly its own words, so code fills each step's
 * words, response mode, role and identity. The artist draws the journey afterwards. */
export type SuccessorFacts = {
  builtIns: Array<{ nodeId: string; title: string; implementationType: string; wordIds: string[]; responseMode: string; checkpoint: boolean }>;
  evaluationIds: string[]; allowedActions: string[]; idPrefix: string;
  /** Whether the re-run step can really prepare this built-in for these words (the same check it runs). */
  rerunnable: (nodeId: string, wordIds: string[]) => boolean;
};
type Step = { id: string; title: string; purpose: string; wordIds: string[]; builtIn: SuccessorFacts["builtIns"][number] };
type Decision = { status: string; reason: string; progressionAction: string; preserve: string[]; change: string[]; testNext: string[]; nextEvidenceRequired: string[]; predictionEvaluationIds: string[]; revisedHypothesis: string };
export type SuccessorState = JourneyOrderState & { next: number; steps: Step[]; decision?: Decision; result?: { decision: Record<string, unknown>; journey?: AdventureJourneyDefinition } };

const text = (description: string) => z.string().min(1).describe(description);
const enumOf = (values: readonly string[], fallback: string) => z.enum((values.length ? values : [fallback]) as [string, ...string[]]);

export function spellingSuccessorToolkit(facts: SuccessorFacts) {
  const tool = toolFor<SuccessorState>();
  // Only what the re-run step can prepare is on the menu: a built-in it cannot re-run at all never appears.
  const builtIns = new Map(facts.builtIns.filter(row => facts.rerunnable(row.nodeId, row.wordIds)).map(row => [row.nodeId, row]));
  const allWordIds = [...new Set(facts.builtIns.flatMap(row => row.wordIds))];
  const strings = z.array(z.string().min(1));
  const tools: PlannerTool<SuccessorState>[] = [
    tool({ name: "decide", description: "Your one decision about the learning theory, compared with what she actually did. Calling it again replaces it.",
      schema: z.object({
        status: z.enum(["supported", "revised", "falsified", "inconclusive", "awaiting_calibration"]), reason: text("Why, from the evidence."),
        progression_action: enumOf(facts.allowedActions, "collect_more_evidence"),
        preserve: strings, change: strings, test_next: strings, next_evidence_required: strings,
        prediction_evaluation_ids: facts.evaluationIds.length ? z.array(enumOf(facts.evaluationIds, "none")).describe("The evaluations of earlier predictions you are judging. At least one.") : z.array(z.string()).max(0).describe("Leave empty: there are no evaluations yet."),
        revised_hypothesis: z.string().describe("Your revised hypothesis, or empty."),
      }).strict(),
      run: (state, input) => {
        if (facts.evaluationIds.length && !input.prediction_evaluation_ids.length) return { ok: false, error: "cite at least one of the offered prediction_evaluation_ids" };
        state.decision = { status: input.status, reason: input.reason, progressionAction: input.progression_action, preserve: input.preserve, change: input.change, testNext: input.test_next,
          nextEvidenceRequired: input.next_evidence_required, predictionEvaluationIds: [...new Set(input.prediction_evaluation_ids)], revisedHypothesis: input.revised_hypothesis };
        state.result = undefined;
        return { ok: true, result: { action: input.progression_action } };
      } }),
    tool({ name: "add_step", description: "Add one step: re-run a tested built-in activity from her boards, for all of its own words or fewer. Returns its step_id.",
      schema: z.object({ built_in: enumOf([...builtIns.keys()], "none").describe("The tested built-in this step re-runs."),
        words: z.array(enumOf(allWordIds, "none")).describe("Which of that built-in's own words to re-run. Empty means all of them."),
        title: text("The short name she sees under the portal: 2 to 4 words."), purpose: text("What this step is for, in one sentence.") }).strict(),
      run: (state, input) => {
        const builtIn = builtIns.get(input.built_in);
        if (!builtIn) return { ok: false, error: `no built-in ${input.built_in}` };
        const foreign = input.words.find(word => !builtIn.wordIds.includes(word));
        if (foreign) return { ok: false, error: `${foreign} is not one of ${builtIn.title}'s words (${builtIn.wordIds.join(", ")})` };
        if (new Set(input.words).size !== input.words.length) return { ok: false, error: "a word is listed more than once" };
        if (input.words.length && !facts.rerunnable(builtIn.nodeId, input.words)) return { ok: false, error: `${builtIn.title} cannot be re-run for just those words (its questions or tiles use its other words). It can be re-run with all of its words: leave words empty, or choose another built-in.` };
        state.next += 1;
        const id = `${facts.idPrefix}-${state.next}`;
        state.steps.push({ id, title: input.title, purpose: input.purpose, wordIds: input.words.length ? [...input.words] : [...builtIn.wordIds], builtIn });
        state.result = undefined;
        return { ok: true, result: { step_id: id, words: state.steps.at(-1)!.wordIds.length, role: builtIn.checkpoint ? "fresh_checkpoint" : "practice" } };
      } }),
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
    tool({ name: "finish_board", description: "Finish after deciding (and, unless you await calibration, placing every step). Sunny checks it and replies accepted, or says exactly what to fix.",
      schema: z.object({ title: text("The board's name she sees."), endpoint_label: text("Name of the finish portal."), single_path_reason: z.string().describe("When there is no choice, why one path is right. Empty when there is a choice.") }).strict(),
      run: (state, input) => {
        if (!state.decision) return { ok: false, error: "make your decision first with decide" };
        const base = { ...state.decision, ...(state.decision.revisedHypothesis.trim() ? {} : { revisedHypothesis: undefined }) };
        if (state.decision.progressionAction === "await_calibration") {
          state.result = { decision: { ...base, nextInstruments: [] } };
          return { ok: true, result: { accepted: true, board: false } };
        }
        const sequence = finishJourneySequence(state, state.steps, input, { add: "add_step", plural: "steps", remove: "remove_step" });
        if (!sequence.ok) return sequence;
        const journey = expandJourneySequence(sequence.sequence, state.steps);
        const nextInstruments = state.steps.map(row => ({
          nodeId: row.id, title: row.title, academicTarget: row.purpose, mechanic: row.builtIn.implementationType, theme: row.title, openingPurpose: row.purpose,
          spelling: { wordIds: [...row.wordIds], measurementRole: row.builtIn.checkpoint ? "fresh_checkpoint" : "practice", responseMode: row.builtIn.responseMode, builtInActivityId: row.builtIn.nodeId },
        }));
        state.result = { decision: { ...base, nextInstruments }, journey };
        return { ok: true, result: { accepted: true, steps: nextInstruments.length } };
      } }),
  ];
  return {
    tools,
    initialState: (): SuccessorState => ({ next: 0, steps: [] }),
    finished: (state: SuccessorState) => Boolean(state.result),
    result: (state: SuccessorState) => { if (!state.result) throw new Error("successor_board_unfinished"); return state.result; },
  };
}
