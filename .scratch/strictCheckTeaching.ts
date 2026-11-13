import { config } from "dotenv";
config({ path: "/Users/jamaltaylor/Development/sunny/.env" });
import Anthropic from "@anthropic-ai/sdk";
import { buildAssignmentPlanningPacket } from "../src/engine/assignmentPlanner";
import { spellingTeachingToolkit } from "../src/engine/spellingTeachingTools";
import { plannerToolDefinitions } from "../src/engine/plannerToolLoop";
import { strictBudget } from "../src/engine/plannerTransport";
const text = "Spelling\nsign\nknow\nwrite";
const packet = buildAssignmentPlanningPacket({ childId: "demo-pashley", extraction: { sourceKind: "scanned_assignment_image", sourcePath: "/tmp/demo.pdf", filename: "demo.pdf", mediaType: "application/pdf", fileHash: "c".repeat(64), extractionMethod: "tesseract", pages: [{ pageNumber: 1, text }], fullText: text, warnings: [] } as any, childChart: { childId: "demo-pashley", rootDir: process.cwd(), identity: { childId: "demo-pashley" }, learningProfile: { childId: "demo-pashley" }, homework: { recent: [] }, artifacts: { contentCatalog: [] }, activityResults: { recent: [] }, decisionTrace: [] } as any });
packet.capturedHomework = { ...packet.capturedHomework, words: ["sign", "know", "write"] };
(packet as any).discoveryEvidence = { observations: [{ observationId: "obs-1" }], summary: { constructs: [] }, history: { constructs: {} } };
const tools = plannerToolDefinitions(spellingTeachingToolkit(packet).tools);
console.log("BUDGET", JSON.stringify(strictBudget(tools)), "TOOLS", tools.map(t => t.name).join(","), "SCHEMA_CHARS", JSON.stringify(tools).length);
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const started = Date.now();
(async () => { try {
  const message = await client.messages.create({ model: process.env.CHECK_MODEL ?? "claude-sonnet-5", max_tokens: 200, tools, tool_choice: { type: "auto" },
    messages: [{ role: "user", content: "This is a schema compile check. Call set_order once with empty opening and closing lists, and nothing else." }] });
  console.log("COMPILED_OK", Date.now() - started, "ms stop=", message.stop_reason, "usage=", JSON.stringify(message.usage), "calls=", JSON.stringify(message.content.filter(b => b.type === "tool_use").map(b => (b as any).name + JSON.stringify((b as any).input))));
} catch (error) { console.log("COMPILE_FAILED", error instanceof Error ? error.message : String(error)); } })().catch(error => console.log("COMPILE_FAILED", String(error)));
