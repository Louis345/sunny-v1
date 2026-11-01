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
    { nodeId: "act-5", title: "Word Puzzle", implementationType: "wordle", wordIds: ["w-write", "w-gnat"], responseMode: "spelling_letters", checkpoint: false },
  ],
  // What the re-run step can really prepare: the explainer only with all its words, Wordle never.
  rerunnable: (nodeId, wordIds) => nodeId === "act-5" ? false : nodeId === "act-1" ? wordIds.length === 2 : true,
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
const step = (built_in: string, title: string, words: string[] = []) => ({ built_in, words, title, purpose: "Practice the missed silent letters.", story: `Story: ${title}`, picture: `Picture: ${title}` });

describe("spelling next-board tools", () => {
  // 2026-11-01: the Planner's decision and the board it built disagreed: a stop was retitled but its page still
  // taught the old lesson. Nothing showed the Planner the board as served next to what it said it would change.
  describe("the Planner's one look at its own board", () => {
    const page = { title: "Silent Clues", story: "Story: clues", picture: "Picture: clues", topic: "Silent letters", learning_goal: "Spot the silent letter.", misconception: "She spells what she hears.",
      strategy: { title: "Spot the quiet letter", steps: ["Say the word.", "Find the quiet letter."] },
      words: [{ text: "sign", chunks: ["si", "gn"], spoken_chunks: ["sigh", "n"], focus_chunk: "gn", tip: "The g stays quiet." }],
      check: { target_word: "sign", prompt: "Which letter is quiet?", options: [{ label: "g", correct: true }, { label: "n", correct: false }] } };
    const reviewed = () => {
      const old = facts({ explainer: { grade: "3", words: [{ wordId: "w-sign", word: "sign" }, { wordId: "w-write", word: "write" }, { wordId: "w-gnat", word: "gnat" }] } });
      old.builtIns[0].page = { trick: "Old Trick", steps: ["Old step."], words: [{ word: "sign", tip: "Old tip." }], check: "Old question?" };
      const run = session(old);
      run.call("decide", decision({ change: ["Teach the vowel pair instead."] }));
      const added = run.call("add_step", step("act-1", "Rain Clues"));
      const fresh = run.call("add_explainer", page);
      const ids = [added, fresh].map(row => (row as { result: { step_id: string } }).result.step_id);
      run.call("set_order", { opening: ids, closing: [] });
      return { ...run, ids };
    };
    const finish = { title: "Next", endpoint_label: "Finish", single_path_reason: "One path." };

    it("shows the board as served next to its change list before accepting it", () => {
      const { call, kit, state } = reviewed();
      const first = call("finish_board", finish) as { ok: true; result: any };
      expect(first.ok).toBe(true);
      expect(kit.finished(state)).toBe(false);
      expect(first.result.your_change_list).toEqual(["Teach the vowel pair instead."]);
      expect(first.result.board_as_served[0]).toMatchObject({ title: "Rain Clues", story: "Story: Rain Clues", words: ["sign", "write"], lesson_page: { trick: "Old Trick", words: [{ word: "sign", tip: "Old tip." }], check: "Old question?" } });
      expect(first.result.board_as_served[1]).toMatchObject({ title: "Silent Clues", words: ["sign"], lesson_page: { trick: "Spot the quiet letter", check: "Which letter is quiet?" } });
    });

    it("lets it fix the board once, then accepts", () => {
      const { call, kit, state, ids } = reviewed();
      call("finish_board", finish);
      call("remove_step", { step_id: ids[0] });
      expect(call("finish_board", finish)).toMatchObject({ ok: true, result: { accepted: true, steps: 1 } });
      expect(kit.finished(state)).toBe(true);
      expect((kit.result(state).decision.nextInstruments as unknown[])).toHaveLength(1);
    });

    it("never holds back a board: the drafted board stands if the Planner never finishes", () => {
      const { call, kit, state, ids } = reviewed();
      expect(kit.drafted(state)).toBe(false);
      call("finish_board", finish);
      call("remove_step", { step_id: ids[1] });
      expect(kit.finished(state)).toBe(false);
      expect(kit.drafted(state)).toBe(true);
      expect((kit.result(state).decision.nextInstruments as unknown[])).toHaveLength(2);
    });

    it("skips the look when there is no board to look at", () => {
      const { call, kit, state } = session();
      call("decide", decision({ status: "inconclusive", progression_action: "await_calibration" }));
      expect(call("finish_board", finish)).toMatchObject({ ok: true, result: { accepted: true, board: false } });
      expect(kit.finished(state)).toBe(true);
    });
  });

  // 2026-11-01: a board decision said to teach new vowel patterns for two words, but add_step refused those
  // words for the old page and told the Planner to leave them empty. The stop got a new title over the old
  // lesson. The human caught it reading the board; nothing compared the page with the decision.
  describe("a new explainer on a next board", () => {
    const words = [{ wordId: "w-sign", word: "sign" }, { wordId: "w-write", word: "write" }, { wordId: "w-gnat", word: "gnat" }];
    const page = (overrides: Record<string, unknown> = {}) => ({ title: "Silent Clues", story: "Story: clues", picture: "Picture: clues", topic: "Silent letters", learning_goal: "Spot the silent letter.", misconception: "She spells what she hears.",
      strategy: { title: "Spot the quiet letter", steps: ["Say the word.", "Find the quiet letter."] },
      words: [{ text: "sign", chunks: ["si", "gn"], spoken_chunks: ["sigh", "n"], focus_chunk: "gn", tip: "The g stays quiet." }],
      check: { target_word: "sign", prompt: "Which letter is quiet?", options: [{ label: "g", correct: true }, { label: "n", correct: false }] }, ...overrides });
    const withExplainer = () => session(facts({ explainer: { grade: "3", words } }));

    it("offers the same page tool Teaching has, for any of her words", () => {
      expect(session().kit.tools.map(row => row.name)).not.toContain("add_explainer");
      const { kit } = withExplainer();
      const tool = plannerToolDefinitions(kit.tools).find(row => row.name === "add_explainer")!;
      expect(tool.description).toContain("grade 3");
      expect((tool as { strict?: boolean }).strict).toBeUndefined();
    });

    it("serves only the words the page teaches, and carries the page to the board", () => {
      const { call, state, kit } = withExplainer();
      call("decide", decision());
      const added = call("add_explainer", page());
      expect(added).toMatchObject({ ok: true, result: { words: 1 } });
      const id = (added as { result: { step_id: string } }).result.step_id;
      call("set_order", { opening: [id], closing: [] });
      expect(call("finish_board", { title: "Next", endpoint_label: "Finish", single_path_reason: "One lesson." }).ok).toBe(true);
      const instrument = (kit.result(state).decision.nextInstruments as Array<any>)[0];
      expect(instrument.spelling).toMatchObject({ wordIds: ["w-sign"], measurementRole: "practice", activity: { id: "visual-explainer", type: "visual-explainer" } });
      expect(instrument.spelling.activity.activityConfig.words.map((row: { text: string }) => row.text)).toEqual(["sign"]);
      expect(instrument).toMatchObject({ mechanic: "visual-explainer", theme: "Story: clues", picture: "Picture: clues" });
    });

    it("holds a next-board page to the same checks as a Teaching page", () => {
      const { call } = withExplainer();
      expect(call("add_explainer", page({ strategy: { title: "x".repeat(33), steps: ["a", "b"] } }))).toMatchObject({ ok: false });
      expect(call("add_explainer", page({ words: [{ text: "sign", chunks: ["si", "n"], spoken_chunks: ["sigh", "n"], focus_chunk: "si", tip: "t" }] }))).toMatchObject({ ok: false, error: expect.stringContaining("join to spell") });
      expect(call("add_explainer", page({ strategy: { title: "Spot", steps: ["Say /sign/.", "Find it."] } }))).toMatchObject({ ok: false, error: expect.stringContaining("slash") });
    });

    it("points the Planner to add_explainer when an old page cannot be cut down to some of its words", () => {
      const { call } = withExplainer();
      expect(call("add_step", step("act-1", "Part of It", ["w-sign"]))).toMatchObject({ ok: false, error: expect.stringContaining("add_explainer") });
    });
  });

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

  // 2026-10-24 live board 3: add_step accepted "re-run the explainer for just gnat" and Wordle; the
  // re-run step then refused both and the child saw Not ready. The tool now asks the same question first.
  it("never offers a built-in that cannot be re-run, and refuses a word set it cannot be re-run for", () => {
    const { kit, call } = session();
    const builtIns = (plannerToolDefinitions(kit.tools).find(tool => tool.name === "add_step")!.input_schema as any).properties.built_in.enum;
    expect(builtIns).not.toContain("act-5");
    call("decide", decision());
    expect(call("add_step", step("act-1", "Gnat Review", ["w-sign"]))).toMatchObject({ ok: false, error: expect.stringContaining("all of its words") });
    expect(call("add_step", step("act-1", "Letters Review", []))).toMatchObject({ ok: true });
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
