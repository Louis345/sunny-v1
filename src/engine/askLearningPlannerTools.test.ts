import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import type { ChildChart } from "../profiles/childChart";
import { buildAssignmentPlanningPacket, type AssignmentPlanningPacket, type AssignmentSourceExtraction } from "./assignmentPlanner";
import { askLearningPlanner } from "./directMathExperience";

function fixture() {
  const text = "Spelling Week 4\nsign\nknow";
  const extraction: AssignmentSourceExtraction = { sourceKind: "scanned_assignment_image", sourcePath: "/nonexistent/demo.png", filename: "demo.png", mediaType: "image/png", fileHash: "f".repeat(64), extractionMethod: "tesseract", pages: [{ pageNumber: 1, text }], fullText: text, warnings: [] };
  const chart = { childId: "demo-pashley", rootDir: process.cwd(), identity: { childId: "demo-pashley" }, learningProfile: { childId: "demo-pashley" }, homework: { recent: [] }, artifacts: { contentCatalog: [] }, activityResults: { recent: [] }, decisionTrace: [], learningHistory: { constructs: {} } } as unknown as ChildChart;
  const packet: AssignmentPlanningPacket = buildAssignmentPlanningPacket({ childId: "demo-pashley", extraction, childChart: chart });
  packet.capturedHomework = { ...packet.capturedHomework, practiceDomain: "spelling", contentProfile: { ...packet.capturedHomework.contentProfile, practiceDomain: "spelling" }, words: ["sign", "know"] } as typeof packet.capturedHomework;
  (packet as any).discoveryEvidence = { observations: [{ observationId: "obs-1" }], summary: { constructs: [] }, history: { constructs: {} } };
  return { packet, chart, extraction };
}
const id = (n: number) => `act-${"f".repeat(6)}-${n}`;
const prediction = (activity_id: string) => ({ activity_id, expected_accuracy_min: 0.3, expected_accuracy_max: 0.7, confidence: 0.5, reason: "r", uncertainty: "u", support_criteria: "s", revise_criteria: "v", falsify_criteria: "f", evidence_ids: ["obs-1"], max_delay_days: 1 });
const theory = { hypothesis: "h", evidence_summary: ["e"], intervention: "i", support_criteria: ["s"], revise_criteria: ["v"], falsify_criteria: ["f"] };
let n = 0;
const turn = (...calls: Array<[string, unknown]>) => ({ id: `m${++n}`, type: "message", role: "assistant", model: "claude-sonnet-5", stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
  content: calls.map(([name, input], index) => ({ type: "tool_use", id: `t${n}_${index}`, name, input })) });
const script = () => [
  turn(["add_activity", { activity: "word-radar:partial_visual_recall", role: "practice", words: ["sign", "know"], title: "Letter Hunt" }], ["add_activity", { activity: "word-radar:hidden_word_recall", role: "fresh_checkpoint", words: ["sign", "know"], title: "Radar Check" }]),
  turn(["predict", prediction(id(1))], ["predict", prediction(id(2))], ["set_order", { opening: [id(1)], closing: [id(2)] }], ["finish_board", { title: "Trail", endpoint_label: "Done", single_path_reason: "Practice, then check.", plan_theory: theory, review_questions: [] }]),
];

describe("Teaching Planner through small locked tools", () => {
  it("builds the board in a short conversation, saves every turn, and never buys it twice", async () => {
    const { packet, chart, extraction } = fixture();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-teaching-tools-"));
    try {
      const turns = script();
      const stream = vi.fn((_request: any) => ({ finalMessage: async () => turns.shift() }));
      const args: any = { domain: "spelling", childId: packet.childId, packet, chart, extraction, model: "claude-sonnet-5", client: { messages: { stream } }, rawResponseFile: path.join(root, "provider-diagnostics", "targeted-planner-response.json") };
      const result = await askLearningPlanner(args);
      expect(stream).toHaveBeenCalledTimes(2);
      expect(result.plan.nodePlan.map((node: { id: string }) => node.id)).toEqual([id(1), id(2)]);
      expect(result.planningResult.output.plannedMeasurements.find((row: any) => row.id === `measure-${id(2)}`)!.spelling).toMatchObject({ role: "fresh_checkpoint", finalCheck: true, interventionNodeIds: [id(1)] });
      const request = stream.mock.calls[0]![0];
      expect(request.tool_choice).toEqual({ type: "auto" });
      expect(request.tools.filter((tool: any) => !tool.strict).map((tool: any) => tool.name)).toEqual(["add_explainer"]);
      expect(JSON.stringify(request.tools)).not.toContain("create_learning_program");
      // The finished order is saved beside the turns, for audit and replay.
      expect(JSON.parse(fs.readFileSync(args.rawResponseFile, "utf8"))).toMatchObject({ program: { planId: result.planId }, stats: { stop: "finished", turns: 2 } });
      const noCall = vi.fn(() => { throw new Error("must_not_repurchase_received_work"); });
      const replayed = await askLearningPlanner({ ...args, client: { messages: { stream: noCall } } });
      expect(noCall).not.toHaveBeenCalled();
      expect(replayed.planId).toBe(result.planId);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("leaves the board waiting, with the reason, when the conversation never finishes", async () => {
    const { packet, chart, extraction } = fixture();
    const finishEarly = () => turn(["finish_board", { title: "T", endpoint_label: "E", single_path_reason: "r", plan_theory: theory, review_questions: [] }]);
    const turns = [finishEarly(), finishEarly(), finishEarly()];
    const stream = vi.fn((_request: any) => ({ finalMessage: async () => turns.shift() }));
    await expect(askLearningPlanner({ domain: "spelling", childId: packet.childId, packet, chart, extraction, model: "claude-sonnet-5", client: { messages: { stream } } } as any)).rejects.toThrow("learning_planner_tools_unfinished:cap_errors");
    expect(stream).toHaveBeenCalledTimes(3);
  });

  // 2026-10-24: only a received old-form answer replays. One that never arrived is not resent as the
  // retired single form; the board is built through the tools like any new board.
  it("builds through the tools when an old single-form answer never arrived", async () => {
    const { packet, chart, extraction } = fixture();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-teaching-unreceived-"));
    try {
      const { runMathProviderStage } = await import("./adaptiveMathDiscovery");
      await runMathProviderStage({ draftDir: path.join(root, "provider-diagnostics"), stage: "targeted-planner", model: "claude-sonnet-5", request: { old: true },
        execute: async () => { throw Object.assign(new Error("recorded_rejection"), { status: 400 }); } }).catch(() => undefined);
      expect(fs.existsSync(path.join(root, "provider-diagnostics", "provider-receipts", "targeted-planner.stage.json"))).toBe(true);
      const turns = script();
      const stream = vi.fn((_request: any) => ({ finalMessage: async () => turns.shift() }));
      const result = await askLearningPlanner({ domain: "spelling", childId: packet.childId, packet, chart, extraction, model: "claude-sonnet-5", client: { messages: { stream } }, rawResponseFile: path.join(root, "provider-diagnostics", "targeted-planner-response.json") } as any);
      expect(stream.mock.calls.map(call => call[0].tools.map((tool: any) => tool.name)).flat()).not.toContain("create_learning_program");
      expect(result.plan.nodePlan.map((node: { id: string }) => node.id)).toEqual([id(1), id(2)]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
