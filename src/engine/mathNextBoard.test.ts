import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedSpellingLab } from "../scripts/fixtures/spellingEvidenceFirst";
import { plainDraw, saveOldFormDecision } from "../scripts/fixtures/successorToolConversation";
import { runItemsIntake } from "../scripts/itemsIntake";
import { resolveChildContextDir } from "../utils/contextRoot";
import * as canvas from "./adventureBoardCanvas";
import { prepareSuccessorBoard } from "./canonicalProgressionGenerator";
import { currentBoardInstance } from "./learningBoardInstances";
import { getLearningCycle, isRetryablePlannerBlock, transitionLearningCycle } from "./learningCycleRepository";
import * as runtime from "./learningCycleRuntime";
import type { ToolLoopRequest } from "./plannerToolLoop";
import type { SpellingGameClient } from "./spellingGameBuilder";

// Human-caught 2026-11-08 on Saori: Reina finished all 4 stops of her first math board (hw-math-c63fde7a,
// built by the one-pipeline item intake), then her next board never came: the cycle blocked with
// `planner_decision_invalid:board_definition_missing`. The human caught it because the kiosk showed no next
// board; the log named the block but not why (the math decision still went to the retired single form,
// which has no journey tools, so the Planner's answer carried no board). The lab missed it because every
// next-board robot was spelling; no test played a math board through to its next-board decision.
vi.setConfig({ testTimeout: 60_000 });
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const childId = "lab-child";
const parity = (id: string, problem: string, correct: "even" | "odd") => ({ id, problem, page_number: 1,
  answer: { kind: "choice", options: [{ id: "even", label: "Even" }, { id: "odd", label: "Odd" }], correct_option_id: correct } });
const prediction = { expected_correct_min: 0.4, expected_correct_max: 0.8, confidence: 0.5, why: "Sums are familiar; parity is new." };
const message = (turn: string, model: string, calls: Array<{ name: string; input: unknown }>) => ({ id: turn, type: "message", role: "assistant", model, stop_reason: "tool_use", stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 }, content: calls.map((call, index) => ({ type: "tool_use", id: `${turn}-${index}`, ...call })) }) as never;

/** The intake Planner, recorded: three problems and a first board of two stops (like itemsIntake.test). */
const intakeSend = async (request: ToolLoopRequest, turn: number) => message(`intake-${turn}`, request.model, [
  { name: "record_items", input: { items: [parity("p1", "7 + 6. Is the sum even or odd?", "odd"), { id: "p2", problem: "15 - 8 =", page_number: 1, answer: { kind: "number", value: 7 } },
    parity("p3", "4 + 8. Is the sum even or odd?", "even")], source_notes: [] } },
  { name: "add_stop", input: { title: "Scout Camp", story: "A race up Lantern Mountain", picture: "Lanterns", purpose: "See what she knows first", item_ids: ["p1", "p2"], check_first: true, prediction } },
  { name: "add_stop", input: { title: "River Run", story: "Rafting the parity river", picture: "A raft", purpose: "Practice even and odd sums", item_ids: ["p3"], check_first: false, prediction } },
  { name: "finish_intake", input: { title: "Even and odd sums", theory: "Secure on sums; parity is new." } },
]);

const GOOD = `<!doctype html><html><head><title>Game</title></head><body><p id="q"></p><input id="box"><script>
const items = window.GAME_PARAMS.itemBindings; let i = 0;
const open = () => { document.getElementById("q").textContent = items[i].display; window.openItem(items[i].itemId, "Camp " + (i + 1)); };
open();
document.getElementById("box").onchange = event => { window.fireAttemptEvent({ target: items[i].itemId, attemptedValue: event.target.value });
  i += 1; if (i < items.length) open(); else window.sendNodeComplete({ completed: true }); };
</script></body></html>`;
function recordedBuilder(): { requests: any[]; client: SpellingGameClient } {
  const requests: any[] = [];
  return { requests, client: { messages: { stream: (request: any) => { requests.push(request);
    return { finalMessage: async () => ({ content: [{ type: "text", text: GOOD }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: "end_turn" }) as never }; } } } };
}

/** What the retired single form answered on Saori: a decision and steps, but no board. */
const OLD_FORM_DECISION = { status: "revised", reason: "Parity on her own missed; drill sums.", progressionAction: "generate_support", preserve: [], change: ["More parity practice."], testNext: [], nextEvidenceRequired: ["Parity on her own"], predictionEvaluationIds: [],
  nextInstruments: [{ nodeId: "parity-drill", title: "Parity Drill", academicTarget: "Parity", mechanic: "generated-game", theme: "Rafting", openingPurpose: "Practice", creatorPrompt: "Build a parity game",
    items: [{ id: "n1", prompt: "3 + 4. Even or odd?", lineage: { sourceEvidenceIds: ["lab"], exposure: "unseen", measurementRole: "practice" }, response: { mode: "selection", options: [{ id: "even", label: "Even", correct: false }, { id: "odd", label: "Odd", correct: true }] } }] }] };

/** The next-board Planner, as a robot: the shared tools when offered, the old single form otherwise. */
function nextBoardRobot() {
  const requests: any[] = [];
  const stream = vi.fn((request: any) => {
    requests.push(structuredClone(request));
    const names: string[] = (request.tools ?? []).map((tool: any) => tool.name);
    const turn = (request.messages ?? []).filter((row: any) => row.role === "assistant").length;
    const reply = () => {
      if (!names.includes("decide")) return message(`old-${requests.length}`, request.model, [{ name: "decide_learning_cycle_progression", input: OLD_FORM_DECISION }]);
      const evaluations: string[] = request.tools.find((tool: any) => tool.name === "decide").input_schema.properties.prediction_evaluation_ids.items?.enum ?? [];
      // When Quest is offered, every step says whether it is the encounter.
      const none = request.tools.find((tool: any) => tool.name === "add_step").input_schema.properties.encounter ? { encounter: "none" } : {};
      if (turn === 0) return message(`next-${requests.length}`, request.model, [
        { name: "decide", input: { status: "revised", reason: "She missed the parity check on her own.", progression_action: "generate_support", preserve: ["Lantern story"], change: ["Aim a game at odd plus even."], test_next: ["p1 on her own"], next_evidence_required: ["p1 on her own"],
          prediction_evaluation_ids: evaluations.slice(0, 1), revised_hypothesis: "",
          self_review: { what_i_tried: "A first check on p1 and p2.", what_happened: "She wrote even for 7 + 6.", why: "She adds, then guesses parity.", what_i_keep: "She liked the river game.", what_i_change_now: "A game aimed at odd plus even." } } },
        { name: "add_step", input: { built_in: "generated-game", problems: ["p1", "p3"], title: "Parity Raft", purpose: "Practice odd plus even.", story: "A raft that floats only on odd sums.", picture: "A raft on a river", check_first: false, focus: "odd plus even is odd", ...none } },
        { name: "add_reward", input: { title: "Treasure Break", story: "A chest glows at the river bend.", picture: "A glowing chest" } },
        { name: "add_step", input: { built_in: "generated-game", problems: ["p1"], title: "Lantern Check", purpose: "Check p1 on her own.", story: "The last lantern.", picture: "A lantern", check_first: true, ...none } },
      ]);
      const answers = (request.messages.at(-1).content as any[]).filter(block => block.type === "tool_result" && !block.is_error).map(block => JSON.parse(block.content));
      if (answers.some(row => row?.board_as_served)) return message(`next-${requests.length}`, request.model, [{ name: "finish_board", input: { title: "Parity River", endpoint_label: "Finish", single_path_reason: "One path." } }]);
      const ids = answers.filter(row => row?.step_id).map(row => row.step_id as string);
      return message(`next-${requests.length}`, request.model, [
        { name: "set_order", input: { opening: ids, closing: [] } },
        { name: "finish_board", input: { title: "Parity River", endpoint_label: "Finish", single_path_reason: "One path." } },
      ]);
    };
    return { finalMessage: async () => reply() };
  });
  return { requests, stream, client: { messages: { stream } } as never };
}

/** A math cycle shaped like itemsIntake's output, its first board played to the end. */
async function playedMathCycle() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-math-next-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  vi.stubGlobal("fetch", () => { throw Error("lab_forbids_network"); });
  seedSpellingLab(rootDir, ["night"], "", childId);
  const sourceFile = path.join(rootDir, "even-odd.txt");
  fs.writeFileSync(sourceFile, "Even and odd sums\n1. 7 + 6. Is the sum even or odd?\n2. 15 - 8 = ___\n3. 4 + 8. Is the sum even or odd?\n");
  const opts = { rootDir };
  const { homeworkId } = await runItemsIntake({ childId, sourceFile, rootDir, testDate: "2026-11-09" }, { send: intakeSend, draw: plainDraw, gameClient: recordedBuilder().client });
  const [check, practice] = getLearningCycle(childId, homeworkId, opts)!.nodes;
  runtime.recordCanonicalNodeCompletion({ childId, homeworkId, sessionId: "kiosk-1", nodeId: check!.nodeId, result: { completed: true, accuracy: 1, timeSpent_ms: 1000,
    targetResults: [{ target: "p1", correct: true, attemptedValue: "even", screenAtOpen: "Camp 1. 7 + 6" }, { target: "p2", correct: true, attemptedValue: "7", screenAtOpen: "Camp 2. 15 - 8" }] as never } }, opts);
  const played = runtime.recordCanonicalNodeCompletion({ childId, homeworkId, sessionId: "kiosk-1", nodeId: practice!.nodeId, result: { completed: true, accuracy: 1, timeSpent_ms: 1000,
    targetResults: [{ target: "p3", correct: true, attemptedValue: "even", screenAtOpen: "Camp 1. 4 + 8" }] as never } }, opts)!;
  return { rootDir, opts, homeworkId, played };
}

describe("Reina's math next board (one next-board toolkit for both subjects)", () => {
  it("decides and builds a played math board's next board through the shared tools, never blocking on a missing board", async () => {
    const f = await playedMathCycle();
    expect(f.played.lifecycle).toBe("baseline_evaluating");
    // Owner 2026-11-09: one setting chooses the next-board Planner for every subject (both girls on the same model).
    vi.stubEnv("SUNNY_EXPERIENCE_PLANNER_MODEL", "claude-opus-5-5"); vi.stubEnv("SUNNY_INGEST_MODEL", "claude-sonnet-5");
    const robot = nextBoardRobot();
    const decided = await runtime.advanceCanonicalCycleFromEvidence({ childId, homeworkId: f.homeworkId, client: robot.client, draw: plainDraw }, f.opts).catch((error: Error) => error);
    // Seen before the fix: the math decision went to the old single form and the cycle blocked.
    const latest = getLearningCycle(childId, f.homeworkId, f.opts)!;
    expect(latest.decisionHistory.at(-1)?.reason).not.toBe("planner_decision_invalid:board_definition_missing");
    expect(decided).not.toBeInstanceOf(Error);
    expect(latest.lifecycle).toBe("baseline_generating");
    // The same tool names as spelling's next board, minus math's stated exception (the spelling lesson page).
    expect(robot.requests[0].model).toBe("claude-opus-5-5");
    expect(robot.requests[0].tools.map((tool: any) => tool.name)).toEqual(["decide", "add_step", "add_reward", "read_record", "remove_step", "set_order", "add_choice", "finish_board"]);
    const addStep = robot.requests[0].tools.find((tool: any) => tool.name === "add_step").input_schema;
    expect(addStep.properties.built_in.enum).toEqual(["generated-game"]);
    expect(addStep.properties.problems.items.enum).toEqual(["p1", "p2", "p3"]);
    // Her goal, her school test and her own record per problem, beside the Planner's journal.
    const content = robot.requests[0].messages[0].content;
    const prompt: string = typeof content === "string" ? content : content.map((block: any) => block.text ?? "").join("");
    expect(prompt).toContain("her math tutor");
    expect(prompt).toContain("School test: Monday 2026-11-09");
    expect(prompt).toMatch(/Her track record on each problem[^\n]*\n- p1 "7 \+ 6\. Is the sum even or odd\?": board 1: "even" missed on her own/);
    expect(prompt).toContain("Your journal:");
    // The decision carries its self-review, and her folder keeps it in the planner journal.
    const decision = latest.decisionHistory.at(-1)!;
    expect(decision.selfReview?.whatIChangeNow).toBe("A game aimed at odd plus even.");
    const journal = path.join(resolveChildContextDir(childId, f.opts), "homework", "planner-journal", `${f.homeworkId}.md`);
    expect(fs.readFileSync(journal, "utf8")).toContain("What I change now: A game aimed at odd plus even.");

    // The next board: one built game per step from her recorded problems (never re-authored), and the reward break.
    vi.spyOn(canvas, "verifyPreparingBoardCanvas").mockResolvedValue(undefined);
    const builder = recordedBuilder();
    const after = await prepareSuccessorBoard({ childId, homeworkId: f.homeworkId, spellingGameClient: builder.client }, f.opts);
    const board = currentBoardInstance(after);
    expect(board.kind).toBe("successor");
    expect(board.publishedAt).not.toBeNull();
    const nodes = after.nodes.filter(node => board.nodeIds.includes(node.nodeId));
    expect(nodes.map(node => node.implementationType)).toEqual(["generated-game", "mystery", "generated-game"]);
    const [raft, treat, lantern] = nodes;
    const intakeP1 = after.nodes[0]!.evidenceContract.itemContracts!.p1!;
    expect(raft!.evidenceContract.itemContracts!.p1).toEqual({ ...intakeP1, lineage: { ...intakeP1.lineage, exposure: "practiced", measurementRole: "practice" } });
    expect(raft!.evidenceContract.itemRoles).toEqual({ p1: "practice", p3: "practice" });
    expect(raft!.focus).toBe("odd plus even is odd");
    expect(lantern!.evidenceContract.itemRoles).toEqual({ p1: "fresh_checkpoint" });
    expect(treat!.evidenceContract.academic).toBe(false);
    expect(treat!.evidenceContract.itemContracts).toBeUndefined();
    for (const node of [raft!, lantern!]) expect(node.artifactBinding?.validationStatus).toBe("passed");
    // The builder saw her problems and the Planner's aim, never the answers.
    expect(builder.requests).toHaveLength(2);
    expect(builder.requests[0].messages[0].content).toContain("odd plus even is odd");
    expect(builder.requests[0].messages[0].content).not.toMatch(/correct_option|"expected"/);
  });

  it("lets an operator retry a math cycle already blocked on board_definition_missing, through the shared tools", async () => {
    const f = await playedMathCycle();
    // Saori's state: the old single form was bought and answered with no board, and the cycle blocked.
    await saveOldFormDecision({ rootDir: f.rootDir, childId, homeworkId: f.homeworkId, decision: OLD_FORM_DECISION });
    const blocked = transitionLearningCycle(childId, f.homeworkId, f.played.revision, { type: "block", reason: "planner_decision_invalid:board_definition_missing" }, f.opts);
    const block = blocked.decisionHistory.at(-1)!;
    expect(isRetryablePlannerBlock(block.reason)).toBe(false);
    expect(isRetryablePlannerBlock(block.reason, blocked)).toBe(true);
    const log = vi.spyOn(console, "log");
    const reopened = runtime.authorizeCanonicalPlannerRetry({ childId, homeworkId: f.homeworkId, blockedDecisionId: block.decisionId, reason: "Math now decides through the shared tools" }, f.opts);
    expect(reopened.lifecycle).toBe("baseline_evaluating");
    expect(log.mock.calls.flat().join("\n")).toContain("[canonical-progression] [retry] [math-shared-tools]");
    const robot = nextBoardRobot();
    const decided = await runtime.advanceCanonicalCycleFromEvidence({ childId, homeworkId: f.homeworkId, client: robot.client, draw: plainDraw }, f.opts);
    expect(decided.decisionHistory.at(-1)?.eventType).toBe("theory_decided");
    expect(decided.lifecycle).toBe("baseline_generating");
    expect(robot.requests[0].tools[0].name).toBe("decide");
  });
});
