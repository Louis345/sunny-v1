import { describe, expect, it } from "vitest";
import type { ChildChart } from "../profiles/childChart";
import { buildAssignmentPlanningPacket, hydrateNativeLearningProgram, type AssignmentPlanningPacket, type AssignmentSourceExtraction } from "./assignmentPlanner";
import { plannerToolDefinitions } from "./plannerToolLoop";
import { strictBudget } from "./plannerTransport";
import { spellingTeachingToolkit } from "./spellingTeachingTools";

function packet(): AssignmentPlanningPacket {
  const text = "Benchmark Advance Spelling\nUnit 9 Week 3\nSilent Letters\nsign\nknow\nwrite\nHigh-Frequency Words\namong\nbuilding\ncircle";
  const extraction: AssignmentSourceExtraction = { sourceKind: "scanned_assignment_image", sourcePath: "/tmp/demo.pdf", filename: "demo.pdf", mediaType: "application/pdf", fileHash: "b".repeat(64), extractionMethod: "tesseract", pages: [{ pageNumber: 1, text }], fullText: text, warnings: [] };
  const chart = { childId: "demo-pashley", rootDir: process.cwd(), identity: { childId: "demo-pashley", displayName: "Demo" }, learningProfile: { childId: "demo-pashley", name: "Demo", age: 8, grade: 3, diagnoses: [], learningGoals: [], preferences: {}, strengths: [], challenges: [], notes: [], sessionHistory: [], totalSessions: 0, lastUpdated: "2026-10-24T00:00:00.000Z" },
    homework: { pending: null, selectedDomain: "spelling", lanes: {}, recent: [] }, activeSessionPlan: null, carePlan: { current: null, source: "missing" }, companion: { presetId: "elli", config: {}, displayName: "Elli" }, companionCare: { plan: {}, view: {}, filePath: "", existed: true }, artifacts: { contentCatalog: [] }, activityResults: { latest: null, recent: [] }, decisionTrace: [] } as unknown as ChildChart;
  const built = buildAssignmentPlanningPacket({ childId: "demo-pashley", extraction, childChart: chart });
  // The sample sheet's OCR text does not split into words here; a confirmed list is what intake hands on.
  built.capturedHomework = { ...built.capturedHomework, words: ["sign", "know", "write", "among", "building", "circle"] };
  (built as any).discoveryEvidence = { observations: [{ observationId: "obs-1" }, { observationId: "obs-2" }], summary: { constructs: [] }, history: { constructs: {} } };
  return built;
}
const prediction = (overrides: Record<string, unknown> = {}) => ({ expected_accuracy_min: 0.4, expected_accuracy_max: 0.8, confidence: 0.5, reason: "She missed these in Discovery.", uncertainty: "One session of evidence.", support_criteria: "Most words correct.", revise_criteria: "Half correct.", falsify_criteria: "Few correct.", evidence_ids: ["obs-1"], max_delay_days: 1, ...overrides });
const theory = { hypothesis: "Chunking silent letters helps.", evidence_summary: ["Missed silent-letter words."], intervention: "Teach, practice, then check.", support_criteria: ["Check accuracy rises."], revise_criteria: ["No change."], falsify_criteria: ["Accuracy falls."] };

function session(p = packet()) {
  const kit = spellingTeachingToolkit(p);
  const state = kit.initialState();
  const call = (name: string, input: unknown) => {
    const tool = kit.tools.find(row => row.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    // Every stop carries a story and a picture; tests that are not about them get plain ones.
    const look = ["add_activity", "add_explainer", "add_reward"].includes(name) ? { story: "A story.", picture: "A picture." } : {};
    const parsed = tool.schema.safeParse({ ...look, ...(input as object) });
    if (!parsed.success) return { ok: false as const, error: `schema: ${parsed.error.message}` };
    return tool.run(state, parsed.data);
  };
  // Academic activities are added, then predicted, as the model does it.
  const addPredicted = (name: string, input: Record<string, unknown>, overrides: Record<string, unknown> = {}) => {
    const added = call(name, input);
    if (!added.ok) return added;
    const predicted = call("predict", { activity_id: (added as any).result.activity_id, ...prediction(overrides) });
    return predicted.ok ? added : predicted;
  };
  return { p, kit, state, call, addPredicted };
}
const words = (p: AssignmentPlanningPacket) => p.capturedHomework.words;

describe("spelling Teaching tools", () => {
  it("offers only small strict tools with pick-lists built from her assignment and evidence", () => {
    const { p, kit } = session();
    const definitions = plannerToolDefinitions(kit.tools);
    expect(definitions.map(tool => tool.name).sort()).toEqual(["add_activity", "add_choice", "add_explainer", "add_reward", "finish_board", "predict", "remove_activity", "request_capability", "set_order"]);
    // Only the explainer's large teaching content is unlocked (too big for the strict grammar).
    expect(definitions.filter(tool => !(tool as { strict?: boolean }).strict).map(tool => tool.name)).toEqual(["add_explainer"]);
    const budget = strictBudget(definitions.filter(tool => (tool as { strict?: boolean }).strict));
    expect(budget.unsupported).toEqual([]);
    expect(budget.optional).toBeLessThanOrEqual(24);
    expect(budget.unions).toBeLessThanOrEqual(16);
    const add = JSON.stringify(definitions.find(tool => tool.name === "add_activity"));
    for (const word of words(p)) expect(add).toContain(`"${word}"`);
    expect(add).toContain("word-radar:hidden_word_recall");
    expect(JSON.stringify(definitions.find(tool => tool.name === "predict"))).toContain('"obs-1"');
    for (const bookkeeping of ["planId", "version", "activityNodeId", "portals", "edges", "inputMode", "showTimer", "finalCheck", "evidenceType"]) expect(JSON.stringify(definitions)).not.toContain(`"${bookkeeping}"`);
  });

  it("assembles a program that today's reader accepts, with code-owned fields filled in", () => {
    const { p, kit, state, call, addPredicted } = session();
    const [first, second] = words(p);
    const practice = addPredicted("add_activity", { activity: "word-radar:partial_visual_recall", role: "practice", words: [first, second], title: "Letter Hunt"});
    const check = addPredicted("add_activity", { activity: "word-radar:hidden_word_recall", role: "fresh_checkpoint", words: [first, second], title: "Radar Check"});
    expect(practice).toMatchObject({ ok: true });
    const practiceId = (practice as any).result.activity_id, checkId = (check as any).result.activity_id;
    expect(call("set_order", { opening: [practiceId], closing: [checkId] })).toMatchObject({ ok: true });
    expect(call("finish_board", { title: "Silent Letter Trail", endpoint_label: "Finish", single_path_reason: "Practice comes before the check.", plan_theory: theory, review_questions: [] })).toMatchObject({ ok: true });
    expect(kit.finished(state)).toBe(true);
    const output = hydrateNativeLearningProgram(kit.program(state), p);
    expect(output.notReady).toEqual([]);
    expect(output.activeSessionPlan.nodePlan.map(node => node.id)).toEqual([practiceId, checkId]);
    expect(output.activeSessionPlan.nodePlan[1].wordRadarConfig?.recallMode).toBe("hidden_word_recall");
    const checkMeasure = output.plannedMeasurements.find(row => row.id === `measure-${checkId}`)!;
    expect(checkMeasure.evidenceType).toBe("diagnostic");
    expect(checkMeasure.spelling).toMatchObject({ role: "fresh_checkpoint", finalCheck: true, interventionNodeIds: [practiceId], evidenceIds: ["obs-1"], expectedAccuracy: { min: 0.4, max: 0.8 } });
    expect(output.plannedMeasurements.find(row => row.id === `measure-${practiceId}`)!.spelling).toMatchObject({ role: "practice", finalCheck: false });
  });

  it("answers mistakes with a reason the model can act on", () => {
    const { p, call, addPredicted } = session();
    const [first] = words(p);
    expect(addPredicted("add_activity", { activity: "word-radar:visible_read", role: "fresh_checkpoint", words: [first], title: "Peek"})).toMatchObject({ ok: false, error: expect.stringContaining("hidden_word_recall") });
    expect(addPredicted("add_activity", { activity: "word-radar:partial_visual_recall", role: "practice", words: [first, first], title: "Twice"})).toMatchObject({ ok: false, error: expect.stringContaining("more than once") });
    expect(addPredicted("add_activity", { activity: "word-radar:partial_visual_recall", role: "practice", words: [first], title: "Backwards"}, { expected_accuracy_min: 0.9, expected_accuracy_max: 0.2 })).toMatchObject({ ok: false, error: expect.stringContaining("expected_accuracy_min") });
    expect(call("set_order", { opening: ["nope"], closing: [] })).toMatchObject({ ok: false, error: expect.stringContaining("nope") });
    // The rejected prediction left its activity in place, so the next missing step is the order.
    expect(call("finish_board", { title: "T", endpoint_label: "E", single_path_reason: "r", plan_theory: theory, review_questions: [] })).toMatchObject({ ok: false, error: expect.stringContaining("set_order") });
  });

  it("refuses a finish that would leave an activity off the board or repeat one", () => {
    const { p, call, addPredicted } = session();
    const [first] = words(p);
    const a = (addPredicted("add_activity", { activity: "word-radar:partial_visual_recall", role: "practice", words: [first], title: "A"}) as any).result.activity_id;
    const b = (addPredicted("add_activity", { activity: "word-radar:hidden_word_recall", role: "fresh_checkpoint", words: [first], title: "B"}) as any).result.activity_id;
    expect(call("set_order", { opening: [a], closing: [a] })).toMatchObject({ ok: false, error: expect.stringContaining("more than once") });
    expect(call("set_order", { opening: [a], closing: [] })).toMatchObject({ ok: true });
    expect(call("finish_board", { title: "T", endpoint_label: "E", single_path_reason: "r", plan_theory: theory, review_questions: [] })).toMatchObject({ ok: false, error: expect.stringContaining(b) });
    expect(call("remove_activity", { activity_id: b })).toMatchObject({ ok: true });
    expect(call("finish_board", { title: "T", endpoint_label: "E", single_path_reason: "r", plan_theory: theory, review_questions: [] })).toMatchObject({ ok: true });
  });

  it("builds a choice, a reward, an explainer and a capability request the reader accepts", () => {
    const { p, kit, state, call, addPredicted } = session();
    const [first, second] = words(p);
    const explainer = addPredicted("add_explainer", { title: "Silent Letters", topic: "Silent letters", learning_goal: "Spot the silent letter.", misconception: "Every letter makes a sound.", strategy: { title: "Find the quiet one", steps: ["Say it slowly.", "Find the quiet letter."] },
      words: [{ text: first, chunks: [first.slice(0, 2), first.slice(2)], spoken_chunks: ["one", "two"], focus_chunk: first.slice(0, 2), tip: "Look for the quiet letter." }],
      check: { target_word: first, prompt: "Which letter is silent?", options: [{ label: "The first", correct: false }, { label: "The quiet one", correct: true }] } });
    expect(explainer).toMatchObject({ ok: true });
    const game = (addPredicted("add_activity", { activity: "letter-rush:read-and-race", role: "practice", words: [first, second], title: "Race"}) as any).result.activity_id;
    const radar = (addPredicted("add_activity", { activity: "word-radar:partial_visual_recall", role: "practice", words: [first, second], title: "Hunt"}) as any).result.activity_id;
    const check = (addPredicted("add_activity", { activity: "word-radar:hidden_word_recall", role: "fresh_checkpoint", words: [first, second], title: "Check"}) as any).result.activity_id;
    const reward = (call("add_reward", { title: "Mystery Box" }) as any).result.activity_id;
    expect(call("add_choice", { purpose: "How do you want to practice?", label: "Pick a path", options: [{ label: "Race", hypothesis: "Speed keeps her going.", ids: [game] }, { label: "Hunt", hypothesis: "Calm practice helps.", ids: [radar] }] })).toMatchObject({ ok: true });
    expect(call("set_order", { opening: [(explainer as any).result.activity_id], closing: [check, reward] })).toMatchObject({ ok: true });
    expect(call("request_capability", { skill_target: "Silent letter sorting", mechanic_constraints: "Drag words into bins.", reason: "No sorting game exists." })).toMatchObject({ ok: true });
    expect(call("finish_board", { title: "Trail", endpoint_label: "Done", single_path_reason: "", plan_theory: theory, review_questions: ["Did the explainer help?"] })).toMatchObject({ ok: true });
    const program = kit.program(state) as any;
    expect(program.journey.choice.options.map((option: any) => option.nodeIds)).toEqual([[game], [radar]]);
    expect(program.generationRequests).toEqual([expect.objectContaining({ domain: "spelling", skillTarget: "Silent letter sorting" })]);
    const output = hydrateNativeLearningProgram(program, p);
    expect(output.notReady).toEqual([]);
    expect(output.activeSessionPlan.journey!.portals.some(portal => portal.kind === "choice")).toBe(true);
    expect(output.plannedMeasurements).toHaveLength(4);
    expect(output.plannedMeasurements.find(row => row.id === `measure-${check}`)!.spelling!.interventionNodeIds.sort()).toEqual([(explainer as any).result.activity_id, game, radar].sort());
  });

  it("will not finish while an academic activity has no prediction", () => {
    const { p, call } = session();
    const id = (call("add_activity", { activity: "word-radar:hidden_word_recall", role: "fresh_checkpoint", words: [words(p)[0]], title: "Check" }) as any).result.activity_id;
    call("set_order", { opening: [], closing: [id] });
    expect(call("finish_board", { title: "T", endpoint_label: "E", single_path_reason: "One check.", plan_theory: theory, review_questions: [] })).toMatchObject({ ok: false, error: expect.stringContaining(`predict`) });
    expect(call("predict", { activity_id: "missing", ...prediction() })).toMatchObject({ ok: false, error: expect.stringContaining("missing") });
  });

  // 2026-10-26 parent test (Saori, demo-pashley): the syllables page was too much to read for her child,
  // with adult words, slash sounds like "/nock/" and four strategy steps. Logs could not show confusion;
  // the lab only checked that chunks join to spell the word. The explainer tool now caps it at kid size.
  it("keeps an explainer short and readable for her: 2 to 3 short steps, short tips, no slash sounds", () => {
    const graded = packet(); graded.childChart.grade = 3;
    const { p, call, kit } = session(graded);
    const [first] = words(p);
    const explainer = (over: Record<string, unknown> = {}, word: Record<string, unknown> = {}) => call("add_explainer", { title: "Sneaky Letters", topic: "Silent letters", learning_goal: "Keep the silent letter.", misconception: "Every letter makes a sound.",
      strategy: { title: "Sneaky letters", steps: ["Some letters hide.", "Write them anyway!"] },
      words: [{ text: first, chunks: [first.slice(0, 2), first.slice(2)], spoken_chunks: ["sss", "ine"], focus_chunk: first.slice(0, 2), tip: "The g hides quietly.", ...word }],
      check: { target_word: first, prompt: "Which word has a sneaky letter?", options: [{ label: first, correct: true }, { label: "sin", correct: false }] }, ...over });
    expect(explainer()).toMatchObject({ ok: true });
    expect(explainer({ strategy: { title: "Spot the Silent Partner", steps: ["Find the pattern.", "Say it slowly.", "Write the chunk.", "Check it."] } })).toMatchObject({ ok: false });
    expect(explainer({ strategy: { title: "Sneaky letters", steps: ["Find the hidden-letter pattern in the word before you start to write it down.", "Write it."] } })).toMatchObject({ ok: false });
    expect(explainer({}, { tip: "Say /sine/ but remember the silent g before n." })).toMatchObject({ ok: false, error: expect.stringContaining("slash") });
    expect(explainer({}, { tip: "Remember that the silent letter g is still written even though you cannot hear it at all." })).toMatchObject({ ok: false });
    // She is told who reads it: her grade, and that Elli reads with her.
    const add = JSON.stringify(plannerToolDefinitions(kit.tools).find(tool => tool.name === "add_explainer"));
    expect(add).toContain("grade 3");
  });

  it("rejects an explainer check without exactly one correct answer", () => {
    const { p, call } = session();
    const [first] = words(p);
    expect(call("add_explainer", { title: "X", topic: "t", learning_goal: "g", misconception: "m", strategy: { title: "s", steps: ["a", "b"] }, words: [{ text: first, chunks: [first.slice(0, 2), first.slice(2)], spoken_chunks: ["a", "b"], focus_chunk: first.slice(0, 2), tip: "t" }],
      check: { target_word: first, prompt: "p", options: [{ label: "x", correct: true }, { label: "y", correct: true }] } })).toMatchObject({ ok: false, error: expect.stringContaining("exactly one") });
  });

  it("gives the same calls the same program, plan id included", () => {
    const build = () => {
      const { p, kit, state, call, addPredicted } = session();
      const [first] = words(p);
      const a = (addPredicted("add_activity", { activity: "word-radar:hidden_word_recall", role: "fresh_checkpoint", words: [first], title: "Check"}) as any).result.activity_id;
      call("set_order", { opening: [], closing: [a] });
      call("finish_board", { title: "T", endpoint_label: "E", single_path_reason: "One check.", plan_theory: theory, review_questions: [] });
      return kit.program(state);
    };
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  // 2026-10-25 kiosk catch: Ila's real Teaching request offered all 251 evidence IDs from her history
  // as predict's pick-list, and the provider refused the strict forms ("Schema is too complex for
  // compilation"), so her board never built. Demo and lab charts have a handful of IDs, so nothing
  // caught it. The pick-list is this homework's evidence; a long history never grows the forms.
  it("offers only this homework's evidence, so a long history never grows the forms", () => {
    const small = packet();
    const large = packet();
    (large as any).discoveryEvidence.history = { constructs: { "spelling.word.history": {
      observations: Array.from({ length: 200 }, (_, i) => ({ observationId: `history-obs-${i}` })),
      evaluations: Array.from({ length: 50 }, (_, i) => ({ evaluationId: `history-eval-${i}` })) } } };
    const forms = (p: AssignmentPlanningPacket) => plannerToolDefinitions(spellingTeachingToolkit(p).tools);
    const predict = forms(large).find(tool => tool.name === "predict")!;
    const offered: string[] = (predict.input_schema as any).properties.evidence_ids.items.enum;
    expect(offered).toEqual(expect.arrayContaining(["obs-1", "obs-2"]));
    expect(offered.filter(id => id.startsWith("history-"))).toEqual([]);
    expect(JSON.stringify(forms(large))).toBe(JSON.stringify(forms(small)));
  });
});
