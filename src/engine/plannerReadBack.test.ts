import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedSpellingLab } from "../scripts/fixtures/spellingEvidenceFirst";
import { plainDraw } from "../scripts/fixtures/successorToolConversation";
import { runItemsIntake } from "../scripts/itemsIntake";
import { resolveChildContextDir } from "../utils/contextRoot";
import { getLearningCycle } from "./learningCycleRepository";
import { boardWording } from "./boardWording";
import * as canvas from "./adventureBoardCanvas";
import { prepareSuccessorBoard } from "./canonicalProgressionGenerator";
import { FROZEN_RECORD_SECTIONS, LIVE_RECORD_SECTIONS } from "../profiles/childEvidence";
import * as runtime from "./learningCycleRuntime";
import type { ToolLoopRequest } from "./plannerToolLoop";
import { offeredValues } from "./plannerTransport";
import type { SpellingGameClient } from "./spellingGameBuilder";

// The Planner's thinking loop (docs/specs/child-knowledge-store.md stages 1-2; owner + Saori 2026-11-22). Human-caught:
// both parents saw in five minutes that Ila does not have the rounding concept ("I don't understand the concept",
// 23:23 UTC); the Planner drilled the rule. Why the logs did not show it: every decision logged a status and a reason,
// never a belief about her thinking graded against what happened. Why the lab missed it: no lab question checked that
// her words reach the Planner or that a decision reads its last theory back.
vi.setConfig({ testTimeout: 60_000 });
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const childId = "lab-child";
const message = (turn: string, model: string, calls: Array<{ name: string; input: unknown }>) => ({ id: turn, type: "message", role: "assistant", model, stop_reason: "tool_use", stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 }, content: calls.map((call, index) => ({ type: "tool_use", id: `${turn}-${index}`, ...call })) }) as never;
const round = (id: string, problem: string, value: number) => ({ id, problem, page_number: 1, answer: { kind: "number", value } });
const prediction = { expected_correct_min: 0.4, expected_correct_max: 0.8, confidence: 0.5, why: "Rounding is new." };
const intakeSend = async (request: ToolLoopRequest, turn: number) => message(`intake-${turn}`, request.model, [
  { name: "record_items", input: { items: [round("r1", "Round 652 to the nearest hundred.", 700), round("r2", "Round 247 to the nearest hundred.", 200), round("r3", "Round 143 to the nearest hundred.", 100)], source_notes: [] } },
  { name: "add_stop", input: { title: "Fuji Check", story: "Snow on Fuji", picture: "A mountain", purpose: "See what she knows first", item_ids: ["r1", "r2"], check_first: true, prediction } },
  { name: "add_stop", input: { title: "Stay or Roll", story: "Snowballs roll", picture: "A snowball", purpose: "Practice rounding", item_ids: ["r3"], check_first: false, prediction } },
  { name: "finish_intake", input: { title: "Rounding to hundreds", theory: "She rounds by the peek digit when reminded." } },
]);
const GOOD = `<!doctype html><html><head><title>Game</title></head><body><p id="q"></p><input id="box"><script>
const items = window.GAME_PARAMS.itemBindings; let i = 0;
const open = () => { document.getElementById("q").textContent = items[i].display; window.openItem(items[i].itemId, "Camp " + (i + 1)); };
open();
document.getElementById("box").onchange = event => { window.fireAttemptEvent({ target: items[i].itemId, attemptedValue: event.target.value });
  i += 1; if (i < items.length) open(); else { window.reportStep("done", "All answered."); window.sendNodeComplete({ completed: true }); } };
function hint(id) { window.reportHint(id, "Peek"); }
</script></body></html>`;
const builder: SpellingGameClient = { messages: { stream: () => ({ finalMessage: async () => ({ content: [{ type: "text", text: GOOD }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" }) as never }) } } as never;

/** Ila's shape: 652 → "60", 247 → "300" on her own, 143 → "200", and "I don't understand the concept" to Elli. */
async function ilaShapedRounding() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-readback-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  vi.stubGlobal("fetch", () => { throw Error("lab_forbids_network"); });
  seedSpellingLab(rootDir, ["night"], "", childId);
  const sourceFile = path.join(rootDir, "rounding.txt");
  fs.writeFileSync(sourceFile, "Rounding\n1. Round 652\n2. Round 247\n3. Round 143\n");
  const opts = { rootDir };
  const { homeworkId } = await runItemsIntake({ childId, sourceFile, rootDir, testDate: "2026-11-30" }, { send: intakeSend, draw: plainDraw, gameClient: builder });
  const [check, practice] = getLearningCycle(childId, homeworkId, opts)!.nodes;
  runtime.recordCanonicalNodeCompletion({ childId, homeworkId, sessionId: "kiosk-1", nodeId: check!.nodeId, result: { completed: true, accuracy: 0, timeSpent_ms: 1000,
    targetResults: [{ target: "r1", correct: false, attemptedValue: "60" }, { target: "r2", correct: false, attemptedValue: "300" }] as never } }, opts);
  runtime.recordCanonicalNodeCompletion({ childId, homeworkId, sessionId: "kiosk-1", nodeId: practice!.nodeId, result: { completed: true, accuracy: 0, timeSpent_ms: 1000,
    targetResults: [{ target: "r3", correct: false, attemptedValue: "200" }] as never } }, opts);
  const now = new Date().toISOString();
  const words = path.join(resolveChildContextDir(childId, opts), "companion_interactions");
  fs.mkdirSync(words, { recursive: true });
  fs.writeFileSync(path.join(words, `${now.slice(0, 10)}.ndjson`), JSON.stringify({ id: "ci-concept", childId, callSource: "activity_help", questionText: "I don't understand the concept.", createdAt: now }) + "\n");
  return { opts, homeworkId };
}

/** The next-board Planner as a robot: its decide input is given per test; it always builds a one-step board. */
function robot(decideInput: (request: any) => Record<string, unknown>) {
  const requests: any[] = [];
  const stream = vi.fn((request: any) => {
    requests.push(structuredClone(request));
    const turn = (request.messages ?? []).filter((row: any) => row.role === "assistant").length;
    const none = request.tools.find((tool: any) => tool.name === "add_step").input_schema.properties.encounter ? { encounter: "none" } : {};
    const reply = () => {
      if (turn === 0) return message(`next-${requests.length}`, request.model, [
        { name: "decide", input: decideInput(request) },
        { name: "add_step", input: { built_in: "generated-game", problems: ["r1", "r3"], title: "Two Houses", purpose: "Tell her two explanations apart.", story: "Snowballs choose a house.", picture: "Two houses", check_first: false, focus: "which whole hundred is nearer", ...none } },
      ]);
      const answers = (request.messages.at(-1).content as any[]).filter(block => block.type === "tool_result" && !block.is_error).map(block => JSON.parse(block.content));
      if (answers.some(row => row?.board_as_served)) return message(`next-${requests.length}`, request.model, [{ name: "finish_board", input: { title: "Two Houses", endpoint_label: "Finish", single_path_reason: "One path." } }]);
      const ids = answers.filter(row => row?.step_id).map(row => row.step_id as string);
      return message(`next-${requests.length}`, request.model, [
        { name: "set_order", input: { opening: ids, closing: [] } },
        { name: "finish_board", input: { title: "Two Houses", endpoint_label: "Finish", single_path_reason: "One path." } },
      ]);
    };
    return { finalMessage: async () => reply() };
  });
  return { requests, client: { messages: { stream } } as never };
}

const baseDecision = (request: any) => ({ status: "revised", reason: "Every rounding answer missed.", progression_action: "generate_support", preserve: [], change: ["Meaning first."], test_next: ["r2 on her own"], next_evidence_required: ["r2 on her own"],
  prediction_evaluation_ids: (offeredValues(request.tools.find((tool: any) => tool.name === "decide").input_schema.properties.prediction_evaluation_ids.items) ?? []).slice(0, 1), revised_hypothesis: "",
  self_review: { what_i_tried: "A first check.", what_happened: "60, 300, 200.", why: "Unknown yet.", what_i_keep: "Fuji.", what_i_change_now: "Two houses." } });
const promptOf = (request: any): string => { const content = request.messages[0].content; return typeof content === "string" ? content : content.map((block: any) => block.text ?? "").join(""); };

describe("the Planner reads its last theory back before each board", () => {
  it("B1: her words, help-dependence and her actual wrong answers reach the next-board question, with ids to cite", async () => {
    const f = await ilaShapedRounding();
    const planner = robot(baseDecision);
    await runtime.advanceCanonicalCycleFromEvidence({ childId, homeworkId: f.homeworkId, client: planner.client, draw: plainDraw }, f.opts);
    const prompt = promptOf(planner.requests[0]);
    expect(prompt).toContain(`[said:ci-concept]`);
    expect(prompt).toContain(`"I don't understand the concept."`);
    expect(prompt).toMatch(/"Round 652 to the nearest hundred\." → "60" \(on her own\) \[ans-[0-9a-f]{8}\]/);
    expect(prompt).toContain(`"Round 247 to the nearest hundred." → "300" (on her own)`);
  });

  it("B2: the question asks for a graded read-back of the last theory, and a cited grade is saved with the decision", async () => {
    const f = await ilaShapedRounding();
    const planner = robot(request => ({ ...baseDecision(request), read_back: {
      previous_theory: "She rounds by the peek digit when reminded.", grade: "falsified",
      why: "On her own she wrote 60 for 652 and 300 for 247; she said she does not understand the concept.",
      evidence_ids: ["said:ci-concept", "not-an-id"],
      how_she_thinks: "She changes the digit she looks at instead of choosing the nearer whole hundred.",
      competing_explanation: "She knows which hundred is nearer but misreads which digit to round.",
      board_tells_apart: "Ask 'is 247 nearer 200 or 300?' before any digits: meaning right, digits wrong favours the second.",
    } }));
    await runtime.advanceCanonicalCycleFromEvidence({ childId, homeworkId: f.homeworkId, client: planner.client, draw: plainDraw }, f.opts);
    const prompt = promptOf(planner.requests[0]);
    expect(prompt).toContain("Your theory going into this board");
    expect(prompt).toContain("She rounds by the peek digit when reminded.");
    const readBack = planner.requests[0].tools.find((tool: any) => tool.name === "decide").input_schema.properties.read_back;
    expect(Object.keys(readBack.properties)).toEqual(["previous_theory", "grade", "why", "evidence_ids", "how_she_thinks", "competing_explanation", "board_tells_apart"]);
    expect(readBack.properties.grade.enum).toEqual(["supported", "revised", "falsified", "unclear"]);
    const decision = getLearningCycle(childId, f.homeworkId, f.opts)!.decisionHistory.at(-1)!;
    expect(decision.readBack).toMatchObject({ grade: "falsified", evidenceIds: ["said:ci-concept"], unknownEvidenceIds: ["not-an-id"],
      howSheThinks: "She changes the digit she looks at instead of choosing the nearer whole hundred." });
    const journal = fs.readFileSync(path.join(resolveChildContextDir(childId, f.opts), "homework", "planner-journal", `${f.homeworkId}.md`), "utf8");
    expect(journal).toContain("Read-back: falsified");
    expect(journal).toContain("How she thinks: She changes the digit she looks at");
  });

  it("B3: a parent's teaching note is read first, before her track record, and the read-back may cite it", async () => {
    const f = await ilaShapedRounding();
    fs.writeFileSync(path.join(resolveChildContextDir(childId, f.opts), "teaching_notes.md"), "## 2026-11-22 Parent\nMeaning first worked: about 10 or about 20?\n");
    const planner = robot(request => ({ ...baseDecision(request), read_back: { previous_theory: "x", grade: "revised", why: "y", evidence_ids: ["note:2026-11-22:1"], how_she_thinks: "z", competing_explanation: "w", board_tells_apart: "v" } }));
    await runtime.advanceCanonicalCycleFromEvidence({ childId, homeworkId: f.homeworkId, client: planner.client, draw: plainDraw }, f.opts);
    const prompt = promptOf(planner.requests[0]);
    expect(prompt).toContain("[note:2026-11-22:1] 2026-11-22, Parent:");
    expect(prompt.indexOf("Teaching notes from outside Sunny")).toBeLessThan(prompt.indexOf("Her track record on each problem"));
    expect(getLearningCycle(childId, f.homeworkId, f.opts)!.decisionHistory.at(-1)!.readBack).toMatchObject({ grade: "revised", evidenceIds: ["note:2026-11-22:1"] });
  });

  it("the whole record is reachable on demand, and the Planner can reread the exact words its board showed her", async () => {
    const f = await ilaShapedRounding();
    const planner = robot(baseDecision);
    await runtime.advanceCanonicalCycleFromEvidence({ childId, homeworkId: f.homeworkId, client: planner.client, draw: plainDraw }, f.opts);
    const tools = planner.requests[0].tools;
    const sections: string[] = tools.find((tool: any) => tool.name === "read_record").input_schema.properties.section.enum;
    expect([...sections].sort()).toEqual([...FROZEN_RECORD_SECTIONS, ...LIVE_RECORD_SECTIONS].sort());
    expect(tools.map((tool: any) => tool.name)).toContain("read_board_wording");
    const prompt = promptOf(planner.requests[0]);
    expect(prompt).toContain("read_board_wording");
    expect(prompt).toMatch(/question your own wording/i);
    // Board 1 as she met it: the Planner's own story and aim, and the words inside the built game.
    const wording = boardWording(getLearningCycle(childId, f.homeworkId, f.opts)!, 1, f.opts) as any;
    expect(wording.stops.map((stop: any) => stop.title)).toEqual(["Fuji Check", "Stay or Roll"]);
    expect(wording.stops[0].game_text).toContain("All answered.");
    expect(boardWording(getLearningCycle(childId, f.homeworkId, f.opts)!, 9, f.opts)).toMatchObject({ error: expect.stringContaining("boards 1 to") });
  });

  it("C2: a math answer is filed under the skill the Planner named for its problem, not under the board's goal sentence", async () => {
    // Seen 11/22 in Ila's math cycle: 26 construct ids for one assignment, each a board goal ("math.check.on.her.own.with.new
    // .problems…"), so no skill accumulated across boards. The Planner already names each problem's concept in ready_on_paper.
    const f = await ilaShapedRounding();
    const before = getLearningCycle(childId, f.homeworkId, f.opts)!;
    expect(before.observations.find(row => row.itemId === "r1")!.constructLinks[0]!.constructId).not.toBe("math.rounding.to.hundreds");
    const planner = robot(request => ({ ...baseDecision(request), ready_on_paper: [{ concept: "Rounding to hundreds", chance: 0.2, why: "all missed", proof: "the worksheet", items: ["r1", "r2", "r3"] }] }));
    await runtime.advanceCanonicalCycleFromEvidence({ childId, homeworkId: f.homeworkId, client: planner.client, draw: plainDraw }, f.opts);
    vi.spyOn(canvas, "verifyPreparingBoardCanvas").mockResolvedValue(undefined);
    const built = await prepareSuccessorBoard({ childId, homeworkId: f.homeworkId, spellingGameClient: builder }, f.opts);
    const twoHouses = built.nodes.find(node => node.title === "Two Houses")!;
    expect(twoHouses.academicTarget.skill).toBe("Tell her two explanations apart.");
    runtime.recordCanonicalNodeCompletion({ childId, homeworkId: f.homeworkId, sessionId: "kiosk-2", nodeId: twoHouses.nodeId, result: { completed: true, accuracy: 1, timeSpent_ms: 1000,
      targetResults: [{ target: "r3", correct: true, attemptedValue: "100" }] as never } }, f.opts);
    const after = getLearningCycle(childId, f.homeworkId, f.opts)!;
    expect(after.observations.filter(row => row.sourceId.includes("kiosk-2")).map(row => row.constructLinks[0]!.constructId)).toEqual(["math.rounding.to.hundreds"]);
    // Older answers keep the id they were saved with.
    expect(after.observations.find(row => row.itemId === "r1")!.constructLinks[0]!.constructId).toBe(before.observations.find(row => row.itemId === "r1")!.constructLinks[0]!.constructId);
  });

  it("B2 degrades, never blocks: no read-back, or a grade citing nothing real, is saved as unclear and the board still builds", async () => {
    const log = vi.spyOn(console, "log");
    const f = await ilaShapedRounding();
    const planner = robot(baseDecision);
    await runtime.advanceCanonicalCycleFromEvidence({ childId, homeworkId: f.homeworkId, client: planner.client, draw: plainDraw }, f.opts);
    const cycle = getLearningCycle(childId, f.homeworkId, f.opts)!;
    expect(cycle.lifecycle).toBe("baseline_generating");
    expect(cycle.decisionHistory.at(-1)!.readBack).toMatchObject({ grade: "unclear", missing: true });
    expect(log.mock.calls.flat().join("\n")).toMatch(/🎮 \[planner-read-back\] \[missing\] \[recorded-unclear\] homework=/);

    const g = await ilaShapedRounding();
    const uncited = robot(request => ({ ...baseDecision(request), read_back: { previous_theory: "x", grade: "supported", why: "y", evidence_ids: ["made-up"], how_she_thinks: "z", competing_explanation: "w", board_tells_apart: "v" } }));
    await runtime.advanceCanonicalCycleFromEvidence({ childId, homeworkId: g.homeworkId, client: uncited.client, draw: plainDraw }, g.opts);
    expect(getLearningCycle(childId, g.homeworkId, g.opts)!.decisionHistory.at(-1)!.readBack).toMatchObject({ grade: "unclear", claimedGrade: "supported", evidenceIds: [], unknownEvidenceIds: ["made-up"] });
  });
});
