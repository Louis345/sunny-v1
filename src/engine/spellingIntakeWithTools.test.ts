import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { ChildChart } from "../profiles/childChart";
import { buildAssignmentPlanningPacket, parseSpellingIntake, prepareSpellingDiagnosticPacket, type AssignmentSourceExtraction } from "./assignmentPlanner";
import { planSpellingIntakeWithTools } from "./spellingIntakeWithTools";

function packet() {
  const text = "Spelling Week 4\nsign\nknow";
  const extraction: AssignmentSourceExtraction = { sourceKind: "scanned_assignment_image", sourcePath: "/nonexistent/demo.png", filename: "demo.png", mediaType: "image/png", fileHash: "e".repeat(64), extractionMethod: "tesseract", pages: [{ pageNumber: 1, text }], fullText: text, warnings: [] };
  const chart = { childId: "demo-pashley", rootDir: process.cwd(), identity: { childId: "demo-pashley" }, learningProfile: { childId: "demo-pashley" }, homework: { recent: [] }, artifacts: { contentCatalog: [] }, activityResults: { recent: [] }, decisionTrace: [], learningHistory: { constructs: {} } } as unknown as ChildChart;
  return prepareSpellingDiagnosticPacket(buildAssignmentPlanningPacket({ childId: "demo-pashley", extraction, childChart: chart }), chart);
}
let n = 0;
const turn = (...calls: Array<{ name: string; input: unknown }>): Anthropic.Messages.Message => ({ id: `m${++n}`, type: "message", role: "assistant", model: "claude-sonnet-5", stop_reason: "tool_use", stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 } as Anthropic.Messages.Usage, content: calls.map((call, index) => ({ type: "tool_use", id: `t${n}_${index}`, name: call.name, input: call.input })) as Anthropic.Messages.ContentBlock[] });

describe("Discovery intake through tools", () => {
  it("returns an intake today's reader accepts, with the artist's drawing on a code-built journey, and no correction call", async () => {
    const p = packet();
    const instrument = `${p.spellingDiagnostics!.instruments[0].activityId}:${p.spellingDiagnostics!.instruments[0].modeId}`;
    const turns = [turn(
      { name: "record_words", input: { words: [{ word: "sign", page_number: 1 }, { word: "know", page_number: 1 }], uncertainty: [], source_notes: [] } },
      { name: "choose_discovery", input: { action: "select", instrument, reason: "r", evidence_ids: [p.spellingDiagnostics!.evidenceIds[0]], uncertainty: ["u"], next_evidence_needed: ["n"] } },
      { name: "finish_intake", input: { title: "Week 4", portal_label: "Radar Check", endpoint_label: "Done" } },
    )];
    const sent: unknown[] = [];
    let drawn = 0;
    const result = await planSpellingIntakeWithTools(p, { model: "claude-sonnet-5", send: async request => { sent.push(request); return turns.shift()!; },
      draw: async journey => { drawn += 1; return { composition: { theme: { background: { type: "solid", value: "#000" }, palette: { path: "#111", completed: "#222", available: "#333", locked: "#444", current: "#555", preview: "#666", text: "#fff", panel: "#000" } },
        portals: journey.portals.map((portal, index) => ({ id: portal.id, position: { landscape: { x: 0.2 + index * 0.3, y: 0.5 }, portrait: { x: 0.5, y: 0.2 + index * 0.3 } } })), edges: journey.edges.map(edge => ({ id: edge.id, style: "glow" as const })) }, pattern: "river" }; } });
    expect(sent).toHaveLength(1);
    expect(drawn).toBe(1);
    const parsed = parseSpellingIntake(result.output, p);
    expect(parsed.words.map(row => row.word)).toEqual(["sign", "know"]);
    expect(parsed.boardDefinition!.pattern).toBe("river");
    expect(parsed.boardDefinition!.portals.find(portal => portal.kind === "activity")).toMatchObject({ label: "Radar Check", activityNodeId: "diagnostic" });
  });

  it("does not publish an unfinished intake", async () => {
    const p = packet();
    const bad = () => turn({ name: "finish_intake", input: { title: "T", portal_label: "P", endpoint_label: "E" } });
    const turns = [bad(), bad(), bad()];
    await expect(planSpellingIntakeWithTools(p, { model: "claude-sonnet-5", send: async () => turns.shift()!, draw: async () => { throw new Error("not drawn"); } })).rejects.toThrow("spelling_intake_tools_unfinished:cap_errors");
  });
});
