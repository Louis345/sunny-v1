import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedSpellingLab } from "./fixtures/spellingEvidenceFirst";
import { plainDraw } from "./fixtures/successorToolConversation";
import { runItemsIntake } from "./itemsIntake";
import { buildIngestSummary } from "./ingestHomework";
import { canonicalJourneyLaunchable, getLearningCycle } from "../engine/learningCycleRepository";
import { recordCanonicalNodeCompletion } from "../engine/learningCycleRuntime";
import type { SpellingGameClient } from "../engine/spellingGameBuilder";
import type { ToolLoopRequest } from "../engine/plannerToolLoop";
import { getChildChart } from "../profiles/childChart";
import { buildChildExperiencePacket } from "../profiles/childExperiencePacket";
import { boardFinishedForCall } from "../server/bossDropAward";

// One pipeline for every subject (owner, 2026-11-08): a math worksheet goes through spelling's shape. The
// Planner records the problems and plans her first board with tools, Sunny builds each stop's game, and the
// board publishes even when one stop's game cannot bind her answers. No provider is called here.
vi.setConfig({ testTimeout: 60_000 });
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const childId = "lab-child";
function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-items-intake-")); roots.push(rootDir);
  seedSpellingLab(rootDir, ["night"], "", childId);
  const sourceFile = path.join(rootDir, "even-odd.txt");
  fs.writeFileSync(sourceFile, "Even and odd sums\n1. 7 + 6. Is the sum even or odd?\n2. 15 - 8 = ___\n3. 4 + 8. Is the sum even or odd?\n");
  return { rootDir, sourceFile };
}

const parity = (id: string, problem: string, correct: "even" | "odd") => ({ id, problem, page_number: 1,
  answer: { kind: "choice", options: [{ id: "even", label: "Even" }, { id: "odd", label: "Odd" }], correct_option_id: correct } });
const prediction = { expected_correct_min: 0.4, expected_correct_max: 0.8, confidence: 0.5, why: "Sums are familiar; parity is new." };

/** The Planner's side of the intake, as the model would answer through the tools in one turn. */
function plannerSend(requests: ToolLoopRequest[]) {
  return async (request: ToolLoopRequest, turn: number) => {
    requests.push(request);
    const calls = [
      { name: "record_items", input: { items: [parity("p1", "7 + 6. Is the sum even or odd?", "odd"), { id: "p2", problem: "15 - 8 =", page_number: 1, answer: { kind: "number", value: 7 } },
        parity("p3", "4 + 8. Is the sum even or odd?", "even")], source_notes: [] } },
      { name: "add_stop", input: { title: "Scout Camp", story: "A race up Lantern Mountain", picture: "A trail of lanterns up a mountain", purpose: "See what she knows first",
        item_ids: ["p1", "p2"], check_first: true, prediction } },
      { name: "add_stop", input: { title: "River Run", story: "Rafting the parity river", picture: "A raft on a bright river", purpose: "Practice even and odd sums",
        item_ids: ["p3"], check_first: false, prediction } },
      { name: "finish_intake", input: { title: "Even and odd sums", theory: "Secure on sums; parity is new." } },
    ];
    return { id: `intake-${turn}`, type: "message", role: "assistant", model: request.model, stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
      content: calls.map((call, index) => ({ type: "tool_use", id: `intake-${turn}-${index}`, ...call })) } as never;
  };
}

const GOOD = `<!doctype html><html><head><title>Lantern Mountain</title></head><body><p id="q"></p><input id="box"><script>
const items = window.GAME_PARAMS.itemBindings; let i = 0;
const open = () => { document.getElementById("q").textContent = items[i].display; window.openItem(items[i].itemId, "Camp " + (i + 1)); };
open();
document.getElementById("box").onchange = event => { window.fireAttemptEvent({ target: items[i].itemId, attemptedValue: event.target.value });
  i += 1; if (i < items.length) open(); else { window.reportStep("done", "All answered."); window.sendNodeComplete({ completed: true }); } };
</script></body></html>`;
// Reports answers but never opens a problem through the contract, so no answer could bind to her items.
const UNBOUND = GOOD.replace(/window\.openItem\(/g, "console.log(");

function recordedBuilder(replies: string[]): { requests: any[]; client: SpellingGameClient } {
  const requests: any[] = [];
  return { requests, client: { messages: { stream: (request: any) => { requests.push(request); const text = replies[Math.min(requests.length - 1, replies.length - 1)]!;
    return { finalMessage: async () => ({ content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: "end_turn" }) as never }; } } } };
}

describe("math intake through the one pipeline", () => {
  it("records the problems, builds a game per stop, publishes her board and points the kiosk at it", async () => {
    const f = fixture();
    const requests: ToolLoopRequest[] = [];
    const builder = recordedBuilder([GOOD]);
    const { homeworkId } = await runItemsIntake({ childId, sourceFile: f.sourceFile, rootDir: f.rootDir }, { send: plannerSend(requests), draw: plainDraw, gameClient: builder.client });
    expect(homeworkId).toMatch(/^hw-math-[0-9a-f]{8}$/);
    expect(requests).toHaveLength(1);
    // Law 16: the reward break is on every stage's menu, math included.
    expect(requests[0]!.tools.map(tool => tool.name)).toEqual(["record_items", "add_stop", "add_reward", "finish_intake"]);
    const cycle = getLearningCycle(childId, homeworkId, { rootDir: f.rootDir })!;
    expect(cycle.domain).toBe("math");
    expect(cycle.boards).toHaveLength(1);
    expect(cycle.boards![0]!.publishedAt).not.toBeNull();
    expect(cycle.lifecycle).toBe("board_ready");
    expect(cycle.nodes).toHaveLength(2);
    const [check, practice] = cycle.nodes;
    for (const node of cycle.nodes) {
      expect(node.implementationType).toBe("generated-game");
      expect(node.role).toBe("baseline");
      expect(node.artifactBinding?.localArtifactPath).toMatch(new RegExp(`^/homework/games/${homeworkId}/.+\\.html$`));
    }
    expect(check!.theme).toBe("A race up Lantern Mountain");
    expect(check!.artwork.prompt).toBe("A trail of lanterns up a mountain");
    expect(check!.evidenceContract.itemRoles).toEqual({ p1: "fresh_checkpoint", p2: "fresh_checkpoint" });
    expect(practice!.evidenceContract.itemRoles).toEqual({ p3: "practice" });
    expect(check!.evidenceContract.itemContracts?.p2?.response).toEqual({ mode: "numeric", expected: 7 });
    expect(cycle.academicPredictions.map(row => row.predictionId)).toEqual(cycle.nodes.map(node => node.predictionId));
    // The builder saw her problems, never their answers.
    expect(builder.requests).toHaveLength(2);
    expect(builder.requests[0].messages[0].content).toContain("7 + 6. Is the sum even or odd?");
    expect(builder.requests[0].messages[0].content).not.toMatch(/expected|correct_option/);
    // A restart replays the saved intake and builds nothing again.
    await runItemsIntake({ childId, sourceFile: f.sourceFile, rootDir: f.rootDir }, { send: plannerSend(requests), draw: plainDraw, gameClient: builder.client });
    expect(requests).toHaveLength(1);
    expect(builder.requests).toHaveLength(2);

    const contextDir = path.join(f.rootDir, "src/context", childId);
    const plan = JSON.parse(fs.readFileSync(path.join(contextDir, "plans/active_session_plan.json"), "utf8"));
    expect(plan.current.adventureBoard).toBeTruthy();
    expect(plan.current.activeHomeworkId).toBe(homeworkId);
    const current = JSON.parse(fs.readFileSync(path.join(contextDir, "homework/current.json"), "utf8"));
    expect(current.selectedDomain).toBe("math");
    expect(current.current.homeworkId).toBe(homeworkId);
    const packet = buildChildExperiencePacket(getChildChart(childId, { rootDir: f.rootDir }));
    const boardNodeIds = packet.activeSessionPlan!.adventureBoard!.nodes.map(node => node.activityNodeId ?? node.id);
    expect(boardNodeIds).toEqual(expect.arrayContaining([check!.nodeId, practice!.nodeId]));
    // The kiosk launches each stop with its problems to open (display = the problem as she sees it).
    expect(packet.itemBindings?.[check!.nodeId]).toEqual([{ itemId: "p1", display: "7 + 6. Is the sum even or odd?" }, { itemId: "p2", display: "15 - 8 =" }]);
    // Owner 2026-11-08 (Reina's math board showed locked stops): every built stop is open to choose, as on spelling.
    const published = getLearningCycle(childId, homeworkId, { rootDir: f.rootDir })!;
    for (const node of published.nodes) expect(canonicalJourneyLaunchable(published, node.nodeId), node.nodeId).toBe(true);
  });

  it("publishes the board with one Not ready stop when that stop's game still cannot bind her answers", async () => {
    const f = fixture();
    const builder = recordedBuilder([UNBOUND, UNBOUND, GOOD]);
    const { homeworkId } = await runItemsIntake({ childId, sourceFile: f.sourceFile, rootDir: f.rootDir }, { send: plannerSend([]), draw: plainDraw, gameClient: builder.client });
    const cycle = getLearningCycle(childId, homeworkId, { rootDir: f.rootDir })!;
    expect(cycle.boards![0]!.publishedAt).not.toBeNull();
    expect(cycle.nodes[0]!.notReadyReason).toMatch(/generated_game_problems/);
    expect(cycle.nodes[1]!.artifactBinding?.validationStatus).toBe("passed");
    expect(buildChildExperiencePacket(getChildChart(childId, { rootDir: f.rootDir })).activeSessionPlan?.adventureBoard).toBeTruthy();
    // Reina's first real run printed "BLOCKED, 0 launchable" for a published, playable board (2026-11-08):
    // the summary read the old readiness audit. It reads the published board.
    const summary = buildIngestSummary(childId, new Date().toISOString().slice(0, 10), { rootDir: f.rootDir });
    expect(summary).toMatchObject({ status: "FULL", launchableActivities: 1, plannedActivities: 2, readinessFailures: [] });
  });

  it("scores her first answer per problem by code and ends the board ready for the call", async () => {
    const f = fixture();
    const { homeworkId } = await runItemsIntake({ childId, sourceFile: f.sourceFile, rootDir: f.rootDir }, { send: plannerSend([]), draw: plainDraw, gameClient: recordedBuilder([GOOD]).client });
    const [check, practice] = getLearningCycle(childId, homeworkId, { rootDir: f.rootDir })!.nodes;
    // The contract builds these from her first answers; the game claimed every answer was right.
    const afterCheck = recordCanonicalNodeCompletion({ childId, homeworkId, sessionId: "kiosk-1", nodeId: check!.nodeId, result: { completed: true, accuracy: 1, timeSpent_ms: 1000,
      targetResults: [{ target: "p1", correct: true, attemptedValue: "even", screenAtOpen: "Camp 1. 7 + 6" }, { target: "p2", correct: true, attemptedValue: "7", screenAtOpen: "Camp 2. 15 - 8" }] as never } }, { rootDir: f.rootDir })!;
    expect(afterCheck.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: "p1", provenance: "independent_probe", result: expect.objectContaining({ correct: false }) }),
      expect.objectContaining({ itemId: "p2", provenance: "independent_probe", result: expect.objectContaining({ correct: true }) }),
    ]));
    const finished = recordCanonicalNodeCompletion({ childId, homeworkId, sessionId: "kiosk-1", nodeId: practice!.nodeId, result: { completed: true, accuracy: 1, timeSpent_ms: 1000,
      targetResults: [{ target: "p3", correct: true, attemptedValue: "even", screenAtOpen: "Camp 1. 4 + 8" }] as never } }, { rootDir: f.rootDir })!;
    expect(finished.observations.find(row => row.itemId === "p3")).toMatchObject({ provenance: "practice", result: { correct: true } });
    expect(boardFinishedForCall(finished.lifecycle)).toBe(true);
  });
});
