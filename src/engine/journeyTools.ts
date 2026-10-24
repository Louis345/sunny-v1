import { z } from "zod";
import type { JourneySequence } from "../shared/adventureBoardDefinition";
import { toolFor, type PlannerTool } from "./plannerToolLoop";

/** The order and choice tools every spelling board shares: one rule set for Teaching and the
 * next board. The Planner names the order; code builds portals, paths and links from it. */
export type JourneyOrderState = {
  order?: { opening: string[]; closing: string[] };
  choice?: { purpose: string; label: string; options: Array<{ id: string; label: string; hypothesis: string; nodeIds: string[] }> };
};
const text = (description: string) => z.string().min(1).describe(description);
export const repeatedValue = (values: readonly string[]) => values.find((value, index) => values.indexOf(value) !== index);

export function journeyOrderTools<S extends JourneyOrderState>(input: { exists: (state: S, id: string) => boolean; idName: string; onChange?: (state: S) => void }): PlannerTool<S>[] {
  const tool = toolFor<S>();
  const unknown = (state: S, ids: readonly string[]) => ids.find(id => !input.exists(state, id));
  return [
    tool({ name: "set_order", description: `Set the shared path: opening ${input.idName}s everyone plays first, in order, and closing ${input.idName}s everyone plays after the choice (or after the opening when there is no choice). Calling it again replaces the order.`,
      schema: z.object({ opening: z.array(text(`A ${input.idName} you were given.`)), closing: z.array(text(`A ${input.idName} you were given.`)) }).strict(),
      run: (state, given) => {
        const ids = [...given.opening, ...given.closing];
        const missing = unknown(state, ids); if (missing) return { ok: false, error: `no ${input.idName} ${missing}; use one you were given` };
        const twice = repeatedValue(ids); if (twice) return { ok: false, error: `${twice} is on the path more than once` };
        state.order = { opening: [...given.opening], closing: [...given.closing] };
        input.onChange?.(state);
        return { ok: true, result: { opening: given.opening.length, closing: given.closing.length } };
      } }),
    tool({ name: "add_choice", description: `Offer her a choice between 2 to 8 options, each a short sequence of ${input.idName}s, between the opening and the closing. Calling it again replaces the choice.`,
      schema: z.object({ purpose: text("The question she reads on the choice screen, in a few friendly words. Never explains your reasoning."), label: text("Short name of the choice portal."),
        options: z.array(z.object({ label: text("Short option name she reads."), hypothesis: text("Why this option might work for her."), ids: z.array(text(`A ${input.idName}.`)).min(1) }).strict()).min(2).max(8) }).strict(),
      run: (state, given) => {
        for (const option of given.options) {
          const missing = unknown(state, option.ids); if (missing) return { ok: false, error: `no ${input.idName} ${missing}; use one you were given` };
          const twice = repeatedValue(option.ids); if (twice) return { ok: false, error: `${twice} is in option ${option.label} more than once` };
        }
        state.choice = { purpose: given.purpose, label: given.label, options: given.options.map((option, index) => ({ id: `option-${index + 1}`, label: option.label, hypothesis: option.hypothesis, nodeIds: [...option.ids] })) };
        input.onChange?.(state);
        return { ok: true, result: { options: given.options.length } };
      } }),
  ];
}

/** Takes an item off the order and the choice when it is removed. */
export function removeFromJourney(state: JourneyOrderState, id: string): void {
  if (state.order) state.order = { opening: state.order.opening.filter(row => row !== id), closing: state.order.closing.filter(row => row !== id) };
  if (state.choice) state.choice.options = state.choice.options.map(option => ({ ...option, nodeIds: option.nodeIds.filter(row => row !== id) }));
}

/** The journey sequence at finish, or what the model must fix first. */
export function finishJourneySequence(state: JourneyOrderState, items: ReadonlyArray<{ id: string; title: string }>, given: { title: string; endpoint_label: string; single_path_reason: string }, names: { add: string; plural: string; remove: string }):
  { ok: true; sequence: JourneySequence } | { ok: false; error: string } {
  if (!items.length) return { ok: false, error: `add ${names.plural} first with ${names.add}` };
  if (!state.order) return { ok: false, error: "set the path first with set_order" };
  const options = state.choice?.options.filter(option => option.nodeIds.length) ?? [];
  const shared = new Set([...state.order.opening, ...state.order.closing]);
  const inBoth = options.flatMap(option => option.nodeIds).find(id => shared.has(id));
  if (inBoth) return { ok: false, error: `${inBoth} is both on the shared path and in a choice option; put it in one place` };
  const placed = new Set([...shared, ...options.flatMap(option => option.nodeIds)]);
  const loose = items.find(row => !placed.has(row.id));
  if (loose) return { ok: false, error: `${loose.id} (${loose.title}) is not on any path; place it with set_order or add_choice, or remove it with ${names.remove}` };
  if (options.length < 2 && !given.single_path_reason.trim()) return { ok: false, error: "explain single_path_reason when there is no choice" };
  return { ok: true, sequence: {
    title: given.title, opening: state.order.opening,
    ...(options.length >= 2 ? { choice: { purpose: state.choice!.purpose, label: state.choice!.label, options: options.map(({ id, label, hypothesis, nodeIds }) => ({ id, label, hypothesis, nodeIds })) } } : {}),
    closing: options.length === 1 ? [...options[0].nodeIds, ...state.order.closing] : state.order.closing,
    ...(options.length >= 2 ? {} : { singlePathReason: given.single_path_reason.trim() }), endpointLabel: given.endpoint_label,
  } };
}
