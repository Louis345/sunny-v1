import { describe, expect, it } from "vitest";
import { parseCanonicalProgressionDecision } from "./learningCycleRuntime";
import { assembleAuthoredBoardDefinition } from "../shared/adventureBoardDefinition";
import { plannerToolDefinitions } from "./plannerToolLoop";
import { strictBudget } from "./plannerTransport";
import { spellingSuccessorToolkit, type SuccessorFacts } from "./spellingSuccessorTools";

const facts = (overrides: Partial<SuccessorFacts> = {}): SuccessorFacts => ({
  builtIns: [
    { nodeId: "act-1", title: "Silent Letter Detectives", implementationType: "visual-explainer", wordIds: ["w-sign", "w-write"], responseMode: "tap_selection", checkpoint: false },
    { nodeId: "act-3", title: "Hidden Letters Practice", implementationType: "word-radar", wordIds: ["w-write", "w-gnat"], responseMode: "spelling_letters", checkpoint: false },
    { nodeId: "act-6", title: "Spelling Checkpoint", implementationType: "word-radar", wordIds: ["w-sign", "w-write", "w-gnat"], responseMode: "spelling_letters", checkpoint: true },
  ],
  evaluationIds: ["eval-1", "eval-2"],
  allowedActions: ["generate_support", "collect_more_evidence", "await_calibration"],
  idPrefix: "next-r7",
  ...overrides,
});
function session(given = facts()) {
  const kit = spellingSuccessorToolkit(given);
  const state = kit.initialState();
  const call = (name: string, input: unknown) => {
    const tool = kit.tools.find(row => row.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: `schema: ${parsed.error.message}` };
    return tool.run(state, parsed.data);
  };
  return { kit, state, call };
}
const decision = (overrides: Record<string, unknown> = {}) => ({ status: "revised", reason: "Silent letters still missed.", progression_action: "generate_support", preserve: ["Explainer first."], change: ["More practice."], test_next: ["Silent letters."], next_evidence_required: ["Fresh recall."], prediction_evaluation_ids: ["eval-1"], revised_hypothesis: "More guided practice before recall.", ...overrides });
const step = (built_in: string, title: string, words: string[] = []) => ({ built_in, words, title, purpose: "Practice the missed silent letters." });

describe("spelling next-board tools", () => {
  it("offers small strict tools whose pick-lists are her tested built-ins and real evaluations", () => {
    const { kit } = session();
    const definitions = plannerToolDefinitions(kit.tools);
    expect(definitions.map(tool => tool.name)).toEqual(["decide", "add_step", "remove_step", "set_order", "add_choice", "finish_board"]);
    expect(definitions.every(tool => (tool as { strict?: boolean }).strict)).toBe(true);
    expect(strictBudget(definitions).unsupported).toEqual([]);
    const text = JSON.stringify(definitions);
    for (const value of ["act-1", "act-6", "eval-2", "await_calibration"]) expect(text).toContain(`"${value}"`);
    expect(text).not.toContain("generate_quest");
    for (const bookkeeping of ["boardDefinition", "nodeId", "wordIds", "responseMode", "measurementRole", "portals", "edges", "position"]) expect(text).not.toContain(`"${bookkeeping}"`);
  });

  it("assembles a decision today's reader accepts, with each step re-running a built-in with its own words", () => {
    const { kit, state, call } = session();
    expect(call("decide", decision())).toMatchObject({ ok: true });
    const a = (call("add_step", step("act-3", "Radar Again")) as any).result.step_id;
    const b = (call("add_step", step("act-6", "Final Check")) as any).result.step_id;
    expect(call("set_order", { opening: [a], closing: [b] })).toMatchObject({ ok: true });
    expect(call("finish_board", { title: "Silent Letters, Again", endpoint_label: "Done", single_path_reason: "Practice before the check." })).toMatchObject({ ok: true });
    const { decision: raw, journey } = kit.result(state);
    const parsed = parseCanonicalProgressionDecision({ ...raw, boardDefinition: assembleAuthoredBoardDefinition(journey!, {}) });
    expect(parsed.progressionAction).toBe("generate_support");
    expect(parsed.predictionEvaluationIds).toEqual(["eval-1"]);
    expect(parsed.successor!.instruments.map(row => [row.nodeId, row.title, row.spelling])).toEqual([
      [a, "Radar Again", { wordIds: ["w-write", "w-gnat"], measurementRole: "practice", responseMode: "spelling_letters", builtInActivityId: "act-3" }],
      [b, "Final Check", { wordIds: ["w-sign", "w-write", "w-gnat"], measurementRole: "fresh_checkpoint", responseMode: "spelling_letters", builtInActivityId: "act-6" }],
    ]);
    expect(parsed.successor!.boardDefinition!.portals.flatMap(portal => portal.activityNodeId ?? [])).toEqual([a, b]);
  });

  it("answers mistakes with reasons and refuses an incomplete finish", () => {
    const { call } = session();
    expect(call("finish_board", { title: "T", endpoint_label: "E", single_path_reason: "r" })).toMatchObject({ ok: false, error: expect.stringContaining("decide") });
    expect(call("decide", decision({ progression_action: "collect_more_evidence", prediction_evaluation_ids: [] }))).toMatchObject({ ok: false, error: expect.stringContaining("prediction_evaluation_ids") });
    call("decide", decision());
    expect(call("finish_board", { title: "T", endpoint_label: "E", single_path_reason: "r" })).toMatchObject({ ok: false, error: expect.stringContaining("add_step") });
    const a = (call("add_step", step("act-3", "Radar")) as any).result.step_id;
    expect(call("set_order", { opening: ["missing"], closing: [] })).toMatchObject({ ok: false, error: expect.stringContaining("missing") });
    expect(call("set_order", { opening: [], closing: [] })).toMatchObject({ ok: true });
    expect(call("finish_board", { title: "T", endpoint_label: "E", single_path_reason: "r" })).toMatchObject({ ok: false, error: expect.stringContaining(a) });
  });

  it("re-runs a built-in for fewer of its own words, never a word it lacks", () => {
    const { kit, state, call } = session();
    call("decide", decision());
    expect(call("add_step", step("act-3", "Gnat Again", ["w-sign"]))).toMatchObject({ ok: false, error: expect.stringContaining("w-sign") });
    const a = (call("add_step", step("act-3", "Gnat Again", ["w-gnat"])) as any).result.step_id;
    call("set_order", { opening: [a], closing: [] });
    call("finish_board", { title: "T", endpoint_label: "E", single_path_reason: "One step." });
    expect((kit.result(state).decision.nextInstruments as any[])[0].spelling.wordIds).toEqual(["w-gnat"]);
  });

  it("lets await_calibration finish without a board", () => {
    const { kit, state, call } = session();
    call("decide", decision({ progression_action: "await_calibration" }));
    expect(call("finish_board", { title: "T", endpoint_label: "E", single_path_reason: "Waiting for graded work." })).toMatchObject({ ok: true });
    const { decision: raw, journey } = kit.result(state);
    expect(journey).toBeUndefined();
    expect(parseCanonicalProgressionDecision(raw).successor).toBeUndefined();
  });

  it("does not ask for citations when there is nothing to cite", () => {
    const { call } = session(facts({ evaluationIds: [] }));
    expect(call("decide", decision({ prediction_evaluation_ids: [] }))).toMatchObject({ ok: true });
  });
});
