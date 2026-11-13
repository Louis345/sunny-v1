import { config } from "dotenv";
config({ path: "/Users/jamaltaylor/Development/sunny/.env" });
import Anthropic from "@anthropic-ai/sdk";
import { buildAssignmentPlanningPacket } from "../src/engine/assignmentPlanner";
import { spellingTeachingToolkit } from "../src/engine/spellingTeachingTools";
import { plannerToolDefinitions } from "../src/engine/plannerToolLoop";
const text = "Spelling\nsign\nknow\nwrite";
const packet = buildAssignmentPlanningPacket({ childId: "demo-pashley", extraction: { sourceKind: "scanned_assignment_image", sourcePath: "/tmp/demo.pdf", filename: "demo.pdf", mediaType: "application/pdf", fileHash: "c".repeat(64), extractionMethod: "tesseract", pages: [{ pageNumber: 1, text }], fullText: text, warnings: [] } as any, childChart: { childId: "demo-pashley", rootDir: process.cwd(), identity: { childId: "demo-pashley" }, learningProfile: { childId: "demo-pashley" }, homework: { recent: [] }, artifacts: { contentCatalog: [] }, activityResults: { recent: [] }, decisionTrace: [] } as any });
packet.capturedHomework = { ...packet.capturedHomework, words: ["sign", "know", "write"] };
(packet as any).discoveryEvidence = { observations: [{ observationId: "obs-1" }], summary: { constructs: [] }, history: { constructs: {} } };
const strip = (node: any): any => Array.isArray(node) ? node.map(strip) : node && typeof node === "object" ? Object.fromEntries(Object.entries(node).filter(([k]) => !(process.env.STRIP && k === "description")).map(([k, v]) => [k, k === "properties" ? Object.fromEntries(Object.entries(v as any).map(([pk, pv]) => [pk, strip(pv)])) : strip(v)])) : node;
const all = plannerToolDefinitions(spellingTeachingToolkit(packet).tools).map(t => ({ ...t, input_schema: strip(t.input_schema) }));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sets: Record<string, string[]> = JSON.parse(process.argv[2]);
(async () => {
  for (const [label, names] of Object.entries(sets)) {
    const tools = all.filter(t => names.includes(t.name));
    try {
      // tool_choice none still compiles nothing? use auto with a text-only ask; max_tokens 1 keeps output cost ~0.
      const m = await client.messages.create({ model: "claude-sonnet-5", max_tokens: 1, tools, tool_choice: { type: "auto" }, messages: [{ role: "user", content: "Reply ok." }] });
      console.log("OK", label, JSON.stringify(tools).length, "in=", m.usage.input_tokens);
    } catch (e) { console.log("FAIL", label, JSON.stringify(tools).length, String(e).slice(0, 90)); }
  }
})();
