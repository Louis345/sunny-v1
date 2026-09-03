import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { askDirectMathPlanner } from "../engine/directMathExperience";
import { getChildChart } from "../profiles/childChart";
import type { AssignmentSourceExtraction } from "../engine/assignmentSourceExtraction";

const rootDir = process.cwd();
const pdf = "/Users/jamaltaylor/Development/sunny/output/pdf/summer-work-day-22-graphs.pdf";
if (!fs.existsSync(pdf)) throw new Error(`comparison_pdf_missing:${pdf}`);
const pdfBytes = fs.readFileSync(pdf);
const fileHash = crypto.createHash("sha256").update(pdfBytes).digest("hex");
const stamp = new Date().toISOString().replace(/[:]/g, "-");
const outputDir = path.join(rootDir, "outputs", "discovery-summary-planner-comparison", stamp);
fs.mkdirSync(outputDir, { recursive: true });

const extraction: AssignmentSourceExtraction = {
  sourceKind: "scanned_assignment_image",
  sourcePath: pdf,
  filename: path.basename(pdf),
  mediaType: "application/pdf",
  fileHash,
  extractionMethod: "native_pdf",
  pages: [{ pageNumber: 1, text: "" }],
  fullText: "Day 22 school assignment: read a graph, compare represented values, and combine represented values.",
  warnings: ["comparison_uses_original_pdf_as_authoritative_source"],
};

const rawDiscoveryCycle = {
  homeworkId: "experiment-day-22-graphs",
  lifecycle: "evidence_ready",
  observations: [
    {
      observationId: "observation:graph-read:1",
      itemId: "graph-read-1",
      constructLinks: [{ constructId: "math.graphs.read", role: "primary", confidence: 1 }],
      result: { correct: true, score: 1 },
      assistance: { status: "unassisted", scaffolds: [] },
      exposure: "unseen",
      provenance: "independent_probe",
      confounds: ["response_mode:tap_selection", "representation:bar_graph"],
    },
    {
      observationId: "observation:graph-compare:1",
      itemId: "graph-compare-1",
      constructLinks: [{ constructId: "math.graphs.compare", role: "primary", confidence: 1 }],
      result: { correct: true, score: 1 },
      assistance: { status: "assisted", scaffolds: ["support:elli:1"] },
      exposure: "unseen",
      provenance: "practice",
      confounds: ["assistance_present", "response_mode:tap_selection", "representation:bar_graph"],
    },
    {
      observationId: "observation:graph-combine:1",
      itemId: "graph-combine-1",
      constructLinks: [{ constructId: "math.graphs.combine", role: "primary", confidence: 1 }],
      result: { observedErrorType: "instrument_ambiguous" },
      assistance: { status: "unknown", scaffolds: [] },
      exposure: "unseen",
      provenance: "practice",
      confounds: ["instrument_ambiguous", "interface_friction", "response_mode:drag_construct", "representation:bar_graph"],
    },
  ],
};

const summary = {
  version: 1,
  homeworkId: rawDiscoveryCycle.homeworkId,
  evaluationId: "evaluation:day-22-graphs",
  constructs: [
    { constructId: "math.graphs.read", independentCorrect: 1, independentIncorrect: 0, assisted: 0, ambiguous: 0, responseModes: ["tap_selection"], representationIds: ["bar_graph"], representationCount: 1, confounds: ["response_mode:tap_selection", "representation:bar_graph"], observationIds: ["observation:graph-read:1"] },
    { constructId: "math.graphs.compare", independentCorrect: 0, independentIncorrect: 0, assisted: 1, ambiguous: 0, responseModes: ["tap_selection"], representationIds: ["bar_graph"], representationCount: 1, confounds: ["assistance_present", "response_mode:tap_selection", "representation:bar_graph"], observationIds: ["observation:graph-compare:1"] },
    { constructId: "math.graphs.combine", independentCorrect: 0, independentIncorrect: 0, assisted: 1, ambiguous: 1, responseModes: ["drag_construct"], representationIds: ["bar_graph"], representationCount: 1, confounds: ["instrument_ambiguous", "interface_friction", "response_mode:drag_construct", "representation:bar_graph"], observationIds: ["observation:graph-combine:1"] },
  ],
};

const write = (file: string, value: unknown): void => {
  fs.writeFileSync(path.join(outputDir, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
write("fixture.json", { extraction: { ...extraction, sourcePath: pdf }, rawDiscoveryCycle, summary });

async function runArm(name: "raw" | "summary", discoveryEvidenceSummary?: unknown): Promise<void> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  const wrapped = {
    messages: {
      stream: (request: Record<string, unknown>, options: Record<string, unknown>) => {
        const sanitized = structuredClone(request) as { messages?: Array<{ content?: unknown }> };
        for (const message of sanitized.messages ?? []) {
          if (!Array.isArray(message.content)) continue;
          message.content = message.content.map((block) => {
            if (!block || typeof block !== "object" || (block as { type?: string }).type !== "document") return block;
            return { ...(block as Record<string, unknown>), source: { type: "base64", media_type: "application/pdf", data: `<sha256:${fileHash};bytes:${pdfBytes.length}>` } };
          });
        }
        write(`${name}-request.json`, sanitized);
        return anthropic.messages.stream(request as never, options as never);
      },
    },
  };
  const startedAt = Date.now();
  try {
    const plan = await askDirectMathPlanner({
      childId: "reina",
      chart: getChildChart("reina", { rootDir }),
      extraction,
      client: wrapped as never,
      model: process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5",
      priorOutcomes: { discoveryCycle: rawDiscoveryCycle },
      discoveryEvidenceSummary,
      rawResponseFile: path.join(outputDir, `${name}-response.json`),
      maxTokens: 32_000,
    });
    write(`${name}-plan.json`, plan);
    write(`${name}-result.json`, { status: "valid", latencyMs: Date.now() - startedAt });
  } catch (error) {
    write(`${name}-result.json`, { status: "invalid", latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
  }
}

async function main(): Promise<void> {
  await runArm("raw");
  await runArm("summary", summary);
  write("manifest.json", {
    experiment: "raw Discovery cycle versus identical cycle plus factual construct summary",
    calls: 2,
    retries: 0,
    boardGenerationCalls: 0,
    outputDir,
  });
  console.log(` 🎮 [planner-summary-comparison] [complete] output=${outputDir}`);
}

void main().catch((error) => {
  console.error(` 🎮 [planner-summary-comparison] [failed] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
