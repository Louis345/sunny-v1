import { z } from "zod";
import type { AssignmentPlanningPacket } from "./assignmentPlanner";
import type { LearningCycleMathItem } from "./learningCycleRepository";
import { plannerMenu, rewardBreakTool } from "./plannerMenu";
import { toolFor, type PlannerTool } from "./plannerToolLoop";

/**
 * The intake tools for a subject whose items have answers code can check (math first). Same shape as
 * spelling's intake (owner, 2026-11-08: one pipeline): the Planner records the worksheet and plans her first
 * board; code checks facts (pages, ids, arithmetic) and answers mistakes in the conversation, never blocks.
 */
/** One stop on her first board, in the Planner's order. A reward break (Law 16) has no problems and no prediction. */
export type IntakeStop = {
  id: string; title: string; story: string; picture: string; purpose: string; itemIds: string[]; checkFirst: boolean;
  prediction: { min: number; max: number; confidence: number; why: string } | null;
  reward?: true;
};
export type ItemIntakeState = { items?: LearningCycleMathItem[]; sourceNotes: string[]; stops: IntakeStop[]; finished?: { title: string; theory: string } };
export type ItemIntakeResult = { title: string; theory: string; items: LearningCycleMathItem[]; stops: IntakeStop[]; sourceNotes: string[] };

const text = (description: string) => z.string().min(1).describe(description);
const answerSchema = z.union([
  z.object({ kind: z.literal("number"), value: z.number().describe("The correct answer.") }).strict(),
  z.object({ kind: z.literal("choice"), options: z.array(z.object({ id: text("Short option id, like odd."), label: text("What she sees.") }).strict()).min(2).max(6),
    correct_option_id: text("The id of the correct option.") }).strict(),
]);

/** The result of the first chain of sums and differences in a problem (36 + 95 + 115), when there is one. */
function arithmeticOf(problem: string): number | null {
  const chain = problem.replace(/−/g, "-").match(/\d+(?:\s*[+-]\s*\d+)+/)?.[0];
  if (!chain) return null;
  return [...chain.matchAll(/([+-]?)\s*(\d+)/g)].reduce((total, [, sign, digits]) => total + (sign === "-" ? -1 : 1) * Number(digits), 0);
}

function checkAnswer(id: string, problem: string, answer: z.infer<typeof answerSchema>): string | null {
  const computed = arithmeticOf(problem);
  if (computed === null) return null;
  if (answer.kind === "number" && answer.value !== computed) return `${id}: ${problem} works out to ${computed}, not ${answer.value}`;
  const ids = answer.kind === "choice" ? answer.options.map(option => option.id.toLowerCase()) : [];
  if (answer.kind === "choice" && ids.includes("even") && ids.includes("odd")) {
    const parity = Math.abs(computed) % 2 === 0 ? "even" : "odd";
    if (answer.correct_option_id.toLowerCase() !== parity) return `${id}: ${problem} works out to ${computed}, which is ${parity}`;
  }
  return null;
}

export function buildItemIntakePrompt(packet: AssignmentPlanningPacket): string {
  return `This is the intake for a math assignment in Sunny. The goal: she wants to come back to Sunny, and she can do this work on her own by the time it is due. You have the worksheet, her chart and the tools.
1. record_items: every problem on the worksheet, with its page and its answer. Sunny checks the arithmetic and tells you about any mismatch.
2. add_stop: each stop on her first board: its story and picture, the problems it uses, whether it checks what she knows before any teaching (check_first), and your prediction for it. Sunny builds a game for each stop from her chart and your story.${plannerMenu(packet.activityCatalog ?? []).rewardBreak ? `
   add_reward: a Mystery reward break wherever you want one on her board; it has no problems and no prediction, and is recorded as play, apart from her learning evidence. Stops and reward breaks keep the order you add them.` : ""}
3. finish_intake: the assignment title and your theory of where she is.
Problems not in any stop stay unknown until a later board.
SOURCE:
${JSON.stringify(packet.sourceDocument)}
CHILD CHART:
${JSON.stringify(packet.childChart)}`;
}

export function itemIntakeToolkit(packet: AssignmentPlanningPacket) {
  const pages = new Set(packet.sourceDocument.pages.map(page => page.pageNumber));
  // The one menu (Law 16): the reward break is on every stage's menu. Math's games are its stated exception.
  const menu = plannerMenu(packet.activityCatalog ?? []);
  const tool = toolFor<ItemIntakeState>();
  const tools: PlannerTool<ItemIntakeState>[] = [
    tool({ name: "record_items", description: "Record every problem on the worksheet with its page and answer. Calling it again replaces the list.",
      schema: z.object({
        items: z.array(z.object({ id: text("A short unique id, like p1."), problem: text("The problem as she will see it."), page_number: z.number().int().min(1), answer: answerSchema }).strict()).min(1),
        source_notes: z.array(z.string()).describe("Notes about the worksheet. Informational."),
      }).strict(),
      run: (state, input) => {
        const page = input.items.find(row => !pages.has(row.page_number));
        if (page) return { ok: false, error: `the worksheet has no page ${page.page_number}` };
        const ids = input.items.map(row => row.id);
        const twice = ids.find((id, index) => ids.indexOf(id) !== index);
        if (twice) return { ok: false, error: `the id ${twice} is used twice` };
        const mismatches = input.items.flatMap(row => checkAnswer(row.id, row.problem, row.answer) ?? []);
        if (mismatches.length) return { ok: false, error: `check these answers: ${mismatches.join("; ")}` };
        state.items = input.items.map(row => ({
          id: row.id, prompt: row.problem,
          lineage: { sourceEvidenceIds: [`assignment:${packet.sourceDocument.fileHash}:page:${row.page_number}`], exposure: "unseen", measurementRole: "practice" },
          response: row.answer.kind === "number" ? { mode: "numeric", expected: row.answer.value }
            : { mode: "selection", options: row.answer.options.map(option => ({ id: option.id, label: option.label, correct: option.id === (row.answer as { correct_option_id: string }).correct_option_id })) },
        }) as LearningCycleMathItem);
        state.sourceNotes = input.source_notes;
        state.stops = [];
        state.finished = undefined;
        return { ok: true, result: { items: ids.length } };
      } }),
    tool({ name: "add_stop", description: "Add one stop to her first board. Returns its stop id.",
      schema: z.object({
        title: text("The stop's title as she sees it."), story: text("The world and story of this stop's game."), picture: text("The stop's picture on her map."),
        purpose: text("What this stop is for."), item_ids: z.array(text("A recorded problem id.")).min(1),
        check_first: z.boolean().describe("True when this stop finds out what she knows before any teaching."),
        prediction: z.object({ expected_correct_min: z.number().min(0).max(1), expected_correct_max: z.number().min(0).max(1), confidence: z.number().min(0).max(1),
          why: text("What you expect and why. A prediction, not a learning result.") }).strict(),
      }).strict(),
      run: (state, input) => {
        if (!state.items) return { ok: false, error: "record the problems first with record_items" };
        const known = new Set(state.items.map(item => item.id));
        const unknown = input.item_ids.filter(id => !known.has(id));
        if (unknown.length) return { ok: false, error: `not recorded problems: ${unknown.join(", ")}` };
        if (input.prediction.expected_correct_min > input.prediction.expected_correct_max) return { ok: false, error: "expected_correct_min is above expected_correct_max" };
        const id = `stop-${state.stops.length + 1}`;
        state.stops.push({ id, title: input.title, story: input.story, picture: input.picture, purpose: input.purpose, itemIds: [...input.item_ids], checkFirst: input.check_first,
          prediction: { min: input.prediction.expected_correct_min, max: input.prediction.expected_correct_max, confidence: input.prediction.confidence, why: input.prediction.why } });
        state.finished = undefined;
        return { ok: true, result: { stop_id: id } };
      } }),
    ...(menu.rewardBreak ? [rewardBreakTool<ItemIntakeState>({ returns: "stop_id", add: (state, input) => {
      if (!state.items) return { ok: false, error: "record the problems first with record_items" };
      const id = `stop-${state.stops.length + 1}`;
      state.stops.push({ id, title: input.title, story: input.story, picture: input.picture, purpose: "A reward break: play time.", itemIds: [], checkFirst: false, prediction: null, reward: true });
      state.finished = undefined;
      return { ok: true, result: { stop_id: id } };
    } })] : []),
    tool({ name: "finish_intake", description: "Finish when the problems are recorded and her first board has its stops. Sunny replies accepted, or says what to fix.",
      schema: z.object({ title: text("The assignment's title."), theory: text("Your theory of where she is with this work.") }).strict(),
      run: (state, input) => {
        if (!state.items) return { ok: false, error: "record the problems first with record_items" };
        if (!state.stops.some(stop => !stop.reward)) return { ok: false, error: "add at least one stop with add_stop" };
        state.finished = { title: input.title, theory: input.theory };
        return { ok: true, result: { accepted: true, stops: state.stops.length } };
      } }),
  ];
  return {
    tools,
    initialState: (): ItemIntakeState => ({ sourceNotes: [], stops: [] }),
    finished: (state: ItemIntakeState) => Boolean(state.finished),
    result: (state: ItemIntakeState): ItemIntakeResult => {
      if (!state.finished || !state.items) throw new Error("item_intake_unfinished");
      return { ...state.finished, items: state.items, stops: state.stops, sourceNotes: state.sourceNotes };
    },
  };
}
