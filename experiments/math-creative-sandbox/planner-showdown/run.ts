import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export type PlannerEvidence = {
  evidenceId: string;
  stream: "academic" | "engagement" | "support" | "teacher" | "returned_work";
  observation: string;
  assistance?: string;
  provenance: string;
  confidence: number;
};

export type PlannerEvidencePacket = {
  scenarioId: string;
  assignment: {
    sourceId: string;
    text: string;
    constructs: string[];
  };
  childChart: {
    childId: string;
    age: number;
    factualProfileEvidence: PlannerEvidence[];
  };
  historicalEvidence: PlannerEvidence[];
  priorProgram?: {
    assumptions: PlannerProgram["assumptions"];
    academicPredictions: PlannerProgram["academicPredictions"];
  };
};

export type PlannerProgram = {
  programId: string;
  assignmentAnalysis: {
    constructs: string[];
    prerequisites: string[];
    difficultyBoundaries: {
      included: string[];
      excluded: string[];
    };
  };
  assumptions: Array<{
    assumptionId: string;
    claim: string;
    evidenceIds: string[];
    confidence: number;
    uncertainty: string;
    falsifyingEvidence: string;
  }>;
  academicPredictions: Array<{
    predictionId: string;
    construct: string;
    expectedOutcome: string;
    expectedRange: {
      metric: string;
      minimum: number;
      maximum: number;
    };
    predictedErrorPatterns: string[];
    confidence: number;
    evidenceIds: string[];
    horizon: "baseline" | "delayed" | "returned_work";
    maximumClaim: string;
  }>;
  learningSequence: Array<{
    nodeId: string;
    responsibility: "probe" | "teach" | "guided_practice" | "independent_probe";
    constructs: string[];
    startingSupport: string;
    expectedIndependence: string;
    evidenceRequired: string[];
    nextDecisionEnabled: string;
  }>;
  evidenceSeparation: {
    practiceClaims: string[];
    independentClaims: string[];
    calibrationRequirements: string[];
  };
  nextEvidenceRequired: string[];
  planningRationale: string;
};

type Inspection = {
  hardFailures: string[];
  metrics: {
    factualClaimCount: number;
    evidenceReferencedClaimCount: number;
    evidenceGroundingRatio: number;
    fabricatedEvidenceReferenceCount: number;
    unsupportedHighConfidenceCount: number;
    predictionCount: number;
    nodeCount: number;
  };
};

type ModelConfig = {
  id: "opus" | "gpt";
  provider: "anthropic" | "openai";
  model: string;
  inputRate: number;
  outputRate: number;
};

type RunRecord = {
  scenarioId: string;
  blindId: "Planner A" | "Planner B";
  status: "complete" | "failed";
  model: string;
  provider: string;
  promptHash: string;
  packetHash: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  elapsedMs: number;
  inspection: Inspection | null;
  error: string | null;
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUTPUT_ROOT = path.join(ROOT, "outputs/math-creative-sandbox/planner-showdown");
const PDF_PATH = "/Users/jamaltaylor/Downloads/pashley-math-2-multiplication.pdf";
const TIMEOUT_MS = 240_000;
const MAX_OUTPUT_TOKENS = 16_000;

const MODELS: ModelConfig[] = [
  {
    id: "opus",
    provider: "anthropic",
    model: "claude-opus-5",
    inputRate: 5,
    outputRate: 25,
  },
  {
    id: "gpt",
    provider: "openai",
    model: "gpt-5.6-sol",
    inputRate: 5,
    outputRate: 30,
  },
];

const BLIND_IDS: Record<ModelConfig["id"], RunRecord["blindId"]> = {
  opus: "Planner A",
  gpt: "Planner B",
};

function hash(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function write(file: string, value: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function writeJson(file: string, value: unknown): void {
  write(file, `${JSON.stringify(value, null, 2)}\n`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractJson(raw: string): PlannerProgram {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("planner_json_missing");
  return JSON.parse(candidate.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1")) as PlannerProgram;
}

function anthropicText(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.type === "text" ? block.text : "")
    .join("\n");
}

function openAiText(response: Record<string, any>): string {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || [])
    .flatMap((item: any) => item.content || [])
    .filter((item: any) => item.type === "output_text" && typeof item.text === "string")
    .map((item: any) => item.text)
    .join("\n");
}

export function buildPlannerPrompt(packet: PlannerEvidencePacket): string {
  return `You are Sunny's academic Planner. Produce a minimum-sufficient learning program from the supplied assignment, child chart, and historical evidence.

You own academic interpretation, testable assumptions, preregistered predictions, difficulty boundaries, learning sequence, evidence requirements, and the next educational question.

You do not own visual worlds, themes, missions, game mechanics, stakes, rewards, artwork, libraries, interface design, or HTML. Do not include them.

Evidence rules:
- Cite only evidenceId values present in the packet.
- Keep academic, engagement, support, teacher, and returned-work evidence separate.
- Completion, enjoyment, assistance, or guided practice cannot establish mastery.
- Express uncertainty when relevant evidence is absent or contradictory.
- Predictions must be observable, bounded, falsifiable, and preregistered.
- Initial teaching and guided-practice nodes may claim practice evidence only.
- Delayed or returned graded work is required for calibration.
- Do not infer a personality, preference, or academic ability that the evidence does not establish.
- Choose the smallest sequence needed to test and respond to the current uncertainty.
- Teach the assignment's concepts; do not use its exact questions as a reusable item bank.

Return JSON only with exactly this shape:
{
  "programId": "string",
  "assignmentAnalysis": {
    "constructs": ["string"],
    "prerequisites": ["string"],
    "difficultyBoundaries": {
      "included": ["string"],
      "excluded": ["string"]
    }
  },
  "assumptions": [{
    "assumptionId": "string",
    "claim": "string",
    "evidenceIds": ["string"],
    "confidence": 0.0,
    "uncertainty": "string",
    "falsifyingEvidence": "string"
  }],
  "academicPredictions": [{
    "predictionId": "string",
    "construct": "string",
    "expectedOutcome": "string",
    "expectedRange": {
      "metric": "string",
      "minimum": 0.0,
      "maximum": 1.0
    },
    "predictedErrorPatterns": ["string"],
    "confidence": 0.0,
    "evidenceIds": ["string"],
    "horizon": "baseline | delayed | returned_work",
    "maximumClaim": "string"
  }],
  "learningSequence": [{
    "nodeId": "string",
    "responsibility": "probe | teach | guided_practice | independent_probe",
    "constructs": ["string"],
    "startingSupport": "string",
    "expectedIndependence": "string",
    "evidenceRequired": ["string"],
    "nextDecisionEnabled": "string"
  }],
  "evidenceSeparation": {
    "practiceClaims": ["string"],
    "independentClaims": ["string"],
    "calibrationRequirements": ["string"]
  },
  "nextEvidenceRequired": ["string"],
  "planningRationale": "string"
}

EVIDENCE PACKET:
${JSON.stringify(packet, null, 2)}`;
}

function collectEvidenceIds(packet: PlannerEvidencePacket): Set<string> {
  return new Set([
    { evidenceId: packet.assignment.sourceId },
    ...packet.childChart.factualProfileEvidence,
    ...packet.historicalEvidence,
  ].map((item) => item.evidenceId));
}

function includesMasteryClaim(value: string): boolean {
  const normalized = value.toLowerCase();
  return /\b(master(?:y|ed)|calibrated|proven|established)\b/.test(normalized)
    && !/\b(not|cannot|does not|insufficient|without|requires?)\b/.test(normalized);
}

export function inspectPlannerOutput(
  program: PlannerProgram,
  packet: PlannerEvidencePacket,
): Inspection {
  const hardFailures: string[] = [];
  const availableEvidenceIds = collectEvidenceIds(packet);
  const claims = [
    ...(program.assumptions ?? []).map((item) => ({
      text: item.claim,
      evidenceIds: item.evidenceIds ?? [],
      confidence: item.confidence,
      uncertainty: item.uncertainty,
    })),
    ...(program.academicPredictions ?? []).map((item) => ({
      text: item.expectedOutcome,
      evidenceIds: item.evidenceIds ?? [],
      confidence: item.confidence,
      uncertainty: "",
    })),
  ];

  const allReferences = claims.flatMap((claim) => claim.evidenceIds);
  for (const evidenceId of new Set(allReferences)) {
    if (!availableEvidenceIds.has(evidenceId)) {
      hardFailures.push(`fabricated_evidence_reference:${evidenceId}`);
    }
  }

  const confidenceValues = [
    ...(program.assumptions ?? []).map((item) => item.confidence),
    ...(program.academicPredictions ?? []).map((item) => item.confidence),
  ];
  if (confidenceValues.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    hardFailures.push("confidence_out_of_range");
  }

  if ((program.assumptions ?? []).some((item) => !item.falsifyingEvidence?.trim())) {
    hardFailures.push("assumption_not_falsifiable");
  }
  if ((program.academicPredictions ?? []).some((item) =>
    !item.expectedRange
    || item.expectedRange.minimum > item.expectedRange.maximum
    || item.expectedRange.minimum < 0
    || item.expectedRange.maximum > 1
  )) {
    hardFailures.push("prediction_range_invalid");
  }

  const practiceText = [
    ...(program.evidenceSeparation?.practiceClaims ?? []),
    ...(program.academicPredictions ?? [])
      .filter((item) => item.horizon === "baseline")
      .map((item) => item.maximumClaim),
  ].join(" ");
  if (includesMasteryClaim(practiceText)) hardFailures.push("practice_claims_mastery");

  const responsibilities = new Set(["probe", "teach", "guided_practice", "independent_probe"]);
  if ((program.learningSequence ?? []).some((node) => !responsibilities.has(node.responsibility))) {
    hardFailures.push("invalid_learning_responsibility");
  }

  const unsupportedHighConfidenceCount = claims
    .filter((claim) =>
      claim.evidenceIds.length === 0
      && claim.confidence > 0.5
      && !/\b(unknown|no evidence|not established|unestablished)\b/i.test(claim.text)
    )
    .length;
  if (unsupportedHighConfidenceCount > 0) {
    hardFailures.push("unsupported_high_confidence_claim");
  }

  return {
    hardFailures: [...new Set(hardFailures)],
    metrics: {
      factualClaimCount: claims.length,
      evidenceReferencedClaimCount: claims.filter((claim) => claim.evidenceIds.length > 0).length,
      evidenceGroundingRatio: claims.length
        ? claims.filter((claim) => claim.evidenceIds.length > 0).length / claims.length
        : 0,
      fabricatedEvidenceReferenceCount: hardFailures
        .filter((failure) => failure.startsWith("fabricated_evidence_reference:")).length,
      unsupportedHighConfidenceCount,
      predictionCount: program.academicPredictions?.length ?? 0,
      nodeCount: program.learningSequence?.length ?? 0,
    },
  };
}

function baseProfileEvidence(): PlannerEvidence[] {
  return [
    {
      evidenceId: "profile:reina:age",
      stream: "support",
      observation: "Reina is 9 years old.",
      provenance: "confirmed child profile",
      confidence: 1,
    },
    {
      evidenceId: "engagement:wheel:like",
      stream: "engagement",
      observation: "Four recorded likes and no dislikes followed four Wheel of Fortune initiations; only two completions were recorded.",
      provenance: "spelling activity log",
      confidence: 0.45,
    },
    {
      evidenceId: "engagement:pronunciation:like",
      stream: "engagement",
      observation: "Two pronunciation sessions were completed and explicitly liked.",
      provenance: "spelling activity log",
      confidence: 0.45,
    },
  ];
}

function buildPackets(assignmentText: string): PlannerEvidencePacket[] {
  const assignment = {
    sourceId: "assignment:pashley-math-2-multiplication",
    text: assignmentText,
    constructs: [
      "math.multiplication.equal_groups",
      "math.multiplication.arrays",
      "math.multiplication.skip_counting",
      "math.multiplication.word_problem_interpretation",
    ],
  };
  const childChart = {
    childId: "reina",
    age: 9,
    factualProfileEvidence: baseProfileEvidence(),
  };
  const priorAssumptions: PlannerProgram["assumptions"] = [{
    assumptionId: "prior-assumption:groups-to-symbols",
    claim: "Reina may construct equal groups before reliably translating them into multiplication notation.",
    evidenceIds: ["academic:guided-groups"],
    confidence: 0.6,
    uncertainty: "Independent symbolic transfer has not yet been observed.",
    falsifyingEvidence: "Accurate unseen independent translation between groups, arrays, and notation.",
  }];
  const priorPredictions: PlannerProgram["academicPredictions"] = [{
    predictionId: "prior-prediction:returned-work",
    construct: "math.multiplication.equal_groups",
    expectedOutcome: "Returned work accuracy will fall between 60% and 80%, with groups-versus-items reversals.",
    expectedRange: { metric: "returned_work_accuracy", minimum: 0.6, maximum: 0.8 },
    predictedErrorPatterns: ["reverses number of groups and items per group"],
    confidence: 0.65,
    evidenceIds: ["academic:guided-groups", "academic:independent-array"],
    horizon: "returned_work",
    maximumClaim: "external calibration",
  }];

  return [
    {
      scenarioId: "01-limited-history",
      assignment,
      childChart,
      historicalEvidence: [],
    },
    {
      scenarioId: "02-contradictory-evidence",
      assignment,
      childChart,
      historicalEvidence: [
        {
          evidenceId: "academic:guided-groups",
          stream: "academic",
          observation: "Guided equal-groups practice accuracy was 90% across 10 fresh items.",
          assistance: "Visual group outlines and one demonstration remained available.",
          provenance: "real activity observation",
          confidence: 0.95,
        },
        {
          evidenceId: "academic:independent-array",
          stream: "academic",
          observation: "Independent unseen array interpretation accuracy was 40% across 5 items.",
          assistance: "No hints or demonstration.",
          provenance: "independent probe",
          confidence: 0.95,
        },
        {
          evidenceId: "teacher:group-reversal",
          stream: "teacher",
          observation: "Teacher note reports recurring confusion between number of groups and number in each group.",
          provenance: "teacher note",
          confidence: 0.8,
        },
        {
          evidenceId: "engagement:math-session",
          stream: "engagement",
          observation: "The child completed the session, replayed one node, and rated it 5/5 fun.",
          provenance: "activity and rating log",
          confidence: 0.95,
        },
      ],
    },
    {
      scenarioId: "03-returned-work-calibration",
      assignment,
      childChart,
      historicalEvidence: [
        {
          evidenceId: "academic:guided-groups",
          stream: "academic",
          observation: "Guided equal-groups practice accuracy was 90% across 10 fresh items.",
          assistance: "Visual group outlines and one demonstration remained available.",
          provenance: "real activity observation",
          confidence: 0.95,
        },
        {
          evidenceId: "academic:independent-array",
          stream: "academic",
          observation: "Independent unseen array interpretation accuracy was 40% across 5 items.",
          assistance: "No hints or demonstration.",
          provenance: "independent probe",
          confidence: 0.95,
        },
        {
          evidenceId: "returned:score",
          stream: "returned_work",
          observation: "Returned graded work score was 5 of 10, below the preregistered 60%–80% range.",
          assistance: "Completed at school; assistance condition not confirmed.",
          provenance: "caregiver-confirmed marked assignment",
          confidence: 1,
        },
        {
          evidenceId: "returned:error-pattern",
          stream: "returned_work",
          observation: "Three incorrect items reversed groups and items per group; two incorrect items used addition unrelated to the represented groups.",
          provenance: "caregiver-confirmed item extraction",
          confidence: 0.95,
        },
      ],
      priorProgram: {
        assumptions: priorAssumptions,
        academicPredictions: priorPredictions,
      },
    },
  ];
}

async function callAnthropic(
  config: ModelConfig,
  prompt: string,
): Promise<{ raw: string; inputTokens: number; outputTokens: number }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.stream({
    model: config.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    messages: [{ role: "user", content: prompt }],
  } as never, { timeout: TIMEOUT_MS }).finalMessage();
  return {
    raw: anthropicText(response),
    inputTokens: response.usage.input_tokens || 0,
    outputTokens: response.usage.output_tokens || 0,
  };
}

async function callOpenAi(
  config: ModelConfig,
  prompt: string,
): Promise<{ raw: string; inputTokens: number; outputTokens: number }> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: prompt,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      reasoning: { effort: "high" },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const payload = await response.json() as Record<string, any>;
  if (!response.ok) {
    throw new Error(`openai_${response.status}:${payload.error?.type || payload.error?.message || "request_failed"}`);
  }
  return {
    raw: openAiText(payload),
    inputTokens: Number(payload.usage?.input_tokens || 0),
    outputTokens: Number(payload.usage?.output_tokens || 0),
  };
}

async function runCandidate(
  config: ModelConfig,
  packet: PlannerEvidencePacket,
  runDir: string,
): Promise<RunRecord> {
  const prompt = buildPlannerPrompt(packet);
  const blindId = BLIND_IDS[config.id];
  const candidateDir = path.join(runDir, packet.scenarioId, blindId.replace(" ", "-").toLowerCase());
  const started = Date.now();
  write(path.join(candidateDir, "prompt.txt"), prompt);
  try {
    const result = config.provider === "anthropic"
      ? await callAnthropic(config, prompt)
      : await callOpenAi(config, prompt);
    write(path.join(candidateDir, "raw-response.txt"), result.raw);
    const program = extractJson(result.raw);
    const inspection = inspectPlannerOutput(program, packet);
    writeJson(path.join(candidateDir, "program.json"), program);
    writeJson(path.join(candidateDir, "inspection.json"), inspection);
    const record: RunRecord = {
      scenarioId: packet.scenarioId,
      blindId,
      status: "complete",
      model: config.model,
      provider: config.provider,
      promptHash: hash(prompt),
      packetHash: hash(JSON.stringify(packet)),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd:
        (result.inputTokens * config.inputRate + result.outputTokens * config.outputRate) / 1_000_000,
      elapsedMs: Date.now() - started,
      inspection,
      error: null,
    };
    writeJson(path.join(candidateDir, "generation.json"), record);
    return record;
  } catch (error) {
    const record: RunRecord = {
      scenarioId: packet.scenarioId,
      blindId,
      status: "failed",
      model: config.model,
      provider: config.provider,
      promptHash: hash(prompt),
      packetHash: hash(JSON.stringify(packet)),
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      elapsedMs: Date.now() - started,
      inspection: null,
      error: error instanceof Error ? error.message : String(error),
    };
    writeJson(path.join(candidateDir, "generation.json"), record);
    return record;
  }
}

function comparisonPage(runDir: string, records: RunRecord[]): string {
  const scenarios = [...new Set(records.map((record) => record.scenarioId))];
  const sections = scenarios.map((scenarioId) => {
    const scenarioRecords = records.filter((record) => record.scenarioId === scenarioId);
    const cards = scenarioRecords.map((record) => {
      const folder = record.blindId.replace(" ", "-").toLowerCase();
      const relative = `./${scenarioId}/${folder}`;
      const metrics = record.inspection
        ? `<p>${record.inspection.hardFailures.length} hard failures · ${record.inspection.metrics.predictionCount} predictions · ${record.inspection.metrics.nodeCount} nodes</p>`
        : `<p class="failure">${escapeHtml(record.error || "failed")}</p>`;
      return `<article>
        <h3>${record.blindId}</h3>
        ${metrics}
        <div class="links">
          ${record.status === "complete" ? `<a href="${relative}/program.json" target="_blank">Program JSON</a><a href="${relative}/inspection.json" target="_blank">Inspection</a>` : ""}
        </div>
        <label>Evidence grounding <input type="number" min="1" max="5"></label>
        <label>Assumption quality <input type="number" min="1" max="5"></label>
        <label>Prediction quality <input type="number" min="1" max="5"></label>
        <label>Mathematical scope <input type="number" min="1" max="5"></label>
        <label>Sequence/difficulty <input type="number" min="1" max="5"></label>
        <label>Uncertainty calibration <input type="number" min="1" max="5"></label>
        <label>Practice/mastery separation <input type="number" min="1" max="5"></label>
        <label>Next-evidence quality <input type="number" min="1" max="5"></label>
        <textarea placeholder="Notes"></textarea>
      </article>`;
    }).join("");
    return `<section><h2>${escapeHtml(scenarioId)}</h2><div class="grid">${cards}</div></section>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Sunny Planner Showdown</title><style>
*{box-sizing:border-box}body{margin:0;padding:28px;background:#0d1222;color:#eef2ff;font:16px system-ui}h1{margin:0}.sub{color:#9eabc9}section{margin:28px 0;padding:20px;background:#161d32;border:1px solid #34415f;border-radius:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}article{padding:18px;background:#0e1528;border:1px solid #3b496d;border-radius:14px}article h3{margin-top:0}.links{display:flex;gap:12px;margin:12px 0}a{color:#73d8ff}label{display:flex;justify-content:space-between;gap:20px;margin:8px 0;color:#c9d2e8}input{width:60px;background:#151e36;color:white;border:1px solid #53658f;border-radius:7px;padding:5px}textarea{width:100%;min-height:80px;margin-top:10px;background:#151e36;color:white;border:1px solid #53658f;border-radius:8px;padding:8px}.failure{color:#ff9ea8}.reveal{padding:18px;background:#241d36;border:1px solid #705b91;border-radius:14px}code{color:#ffd76b}@media(max-width:900px){.grid{grid-template-columns:1fr}}
</style></head><body><h1>Sunny Planner Model Showdown</h1><p class="sub">Score the blinded programs before revealing model identity. Prediction accuracy remains pending until real returned work.</p>${sections}<div class="reveal"><details><summary>Reveal model identities and operating cost</summary><pre>${escapeHtml(JSON.stringify(records.map(({ scenarioId, blindId, model, estimatedCostUsd, elapsedMs }) => ({ scenarioId, blindId, model, estimatedCostUsd, elapsedMs })), null, 2))}</pre></details></div></body></html>`;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY_missing");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY_missing");
  if (!fs.existsSync(PDF_PATH)) throw new Error(`assignment_missing:${PDF_PATH}`);

  const resumeDir = process.env.SUNNY_PLANNER_SHOWDOWN_RESUME
    ? path.resolve(process.env.SUNNY_PLANNER_SHOWDOWN_RESUME)
    : null;
  const assignmentText = resumeDir
    ? fs.readFileSync(path.join(resumeDir, "source", "assignment.txt"), "utf8").trim()
    : execFileSync("python3", [
        "-c",
        "from pypdf import PdfReader; import sys; print('\\n'.join((p.extract_text() or '') for p in PdfReader(sys.argv[1]).pages))",
        PDF_PATH,
      ], { encoding: "utf8" }).trim();
  const packets = resumeDir
    ? JSON.parse(fs.readFileSync(path.join(resumeDir, "source", "scenario-packets.json"), "utf8")) as PlannerEvidencePacket[]
    : buildPackets(assignmentText);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = resumeDir ?? path.join(OUTPUT_ROOT, stamp);
  if (!resumeDir) {
    write(path.join(runDir, "source", "assignment.txt"), assignmentText);
    write(path.join(runDir, "source", "assignment.pdf"), fs.readFileSync(PDF_PATH));
    writeJson(path.join(runDir, "source", "scenario-packets.json"), packets);
  }

  const previousRecords: RunRecord[] = resumeDir
    ? JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8")).records
    : [];
  const failedKeys = new Set(previousRecords
    .filter((record) => record.status === "failed")
    .map((record) => `${record.scenarioId}:${record.blindId}`));
  const jobs = packets.flatMap((packet) => MODELS
    .filter((model) => !resumeDir || failedKeys.has(`${packet.scenarioId}:${BLIND_IDS[model.id]}`))
    .map((model) => ({ packet, model })));
  process.stdout.write(` 🎮 [planner-showdown] [start] ${jobs.length} planner calls\n`);
  const completed = await Promise.all(
    jobs.map(({ packet, model }) => runCandidate(model, packet, runDir)),
  );
  const replacement = new Map(completed.map((record) => [`${record.scenarioId}:${record.blindId}`, record]));
  let records = resumeDir
    ? previousRecords.map((record) => replacement.get(`${record.scenarioId}:${record.blindId}`) ?? record)
    : completed;
  records = records.map((record) => {
    if (record.status !== "complete") return record;
    const packet = packets.find((item) => item.scenarioId === record.scenarioId);
    if (!packet) return record;
    const folder = record.blindId.replace(" ", "-").toLowerCase();
    const candidateDir = path.join(runDir, record.scenarioId, folder);
    const program = JSON.parse(fs.readFileSync(path.join(candidateDir, "program.json"), "utf8")) as PlannerProgram;
    const inspection = inspectPlannerOutput(program, packet);
    writeJson(path.join(candidateDir, "inspection.json"), inspection);
    const refreshed = { ...record, inspection };
    writeJson(path.join(candidateDir, "generation.json"), refreshed);
    return refreshed;
  });
  const completeCount = records.filter((record) => record.status === "complete").length;
  const promptParity = packets.every((packet) => {
    const matching = records.filter((record) => record.scenarioId === packet.scenarioId);
    return new Set(matching.map((record) => record.promptHash)).size === 1
      && new Set(matching.map((record) => record.packetHash)).size === 1;
  });
  const summary = {
    status: completeCount === 6 ? "complete" : "partial",
    completeCount,
    modelCallCount: 6,
    promptParity,
    totalEstimatedCostUsd: records.reduce((sum, record) => sum + record.estimatedCostUsd, 0),
    records,
  };
  writeJson(path.join(runDir, "run.json"), summary);
  write(path.join(runDir, "comparison.html"), comparisonPage(runDir, records));
  process.stdout.write(` 🎮 [planner-showdown] [complete] ${completeCount}/6 promptParity=${promptParity}\n`);
  process.stdout.write(`${path.join(runDir, "comparison.html")}\n`);
  if (completeCount < 6 || !promptParity) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(` 🎮 [planner-showdown] [failed] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
