import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type CandidateConfig = {
  id: string;
  label: string;
  provider: "anthropic" | "openai";
  model: string;
  inputRate: number;
  outputRate: number;
};

type CandidateRecord = {
  id: string;
  label: string;
  provider: string;
  model: string;
  status: "complete" | "failed";
  elapsedMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  artifactHash: string;
  promptHash: string;
  apiResponseHash: string | null;
  savedHtmlHash: string | null;
  iframeSrcDocHash: string | null;
  extractionMode: "raw_html" | "code_fence_removed" | null;
  error: string | null;
};

type HarnessDecision = {
  selectedCandidate: string;
  candidateObservations: Record<string, string[]>;
  selectionReason: string;
  strongestExistingQuality: string;
  largestWeakness: string;
  repairMode: "refine" | "pivot";
  repairBrief: string;
};

type EvidenceEntry = {
  screenshots?: Record<string, string>;
  trace?: Record<string, unknown>;
};

const ROOT = path.resolve(__dirname, "../../..");
const OUTPUT_ROOT = path.join(ROOT, "outputs/math-creative-sandbox/fractions-harness");
const PDF_PATH = "/Users/jamaltaylor/Downloads/pashley-math-3-fractions.pdf";
const MAX_TOKENS = 32_000;
const TIMEOUT_MS = Number(process.env.SUNNY_AI_TIMEOUT_MS || 600_000);
const SPEND_CEILING_USD = 8;
const PHASE = process.env.SUNNY_FRACTIONS_PHASE || "generate";
const RUN_DIR = process.env.SUNNY_FRACTIONS_RUN
  ? path.resolve(process.env.SUNNY_FRACTIONS_RUN)
  : null;

const CANDIDATES: CandidateConfig[] = [
  { id: "sonnet-5", label: "Claude Sonnet 5", provider: "anthropic", model: "claude-sonnet-5", inputRate: 2, outputRate: 10 },
  { id: "opus-5", label: "Claude Opus 5", provider: "anthropic", model: "claude-opus-5", inputRate: 5, outputRate: 25 },
  { id: "gpt-5-6-sol", label: "GPT-5.6 Sol", provider: "openai", model: "gpt-5.6-sol", inputRate: 5, outputRate: 30 },
  { id: "fable-5", label: "Claude Fable 5", provider: "anthropic", model: "claude-fable-5", inputRate: 10, outputRate: 50 },
  { id: "gpt-5-5", label: "GPT-5.5", provider: "openai", model: "gpt-5.5", inputRate: 5, outputRate: 30 },
];

const REINA_EVIDENCE = {
  childId: "reina",
  age: 9,
  observations: [
    { activity: "wheel-of-fortune", plays: 4, completions: 2, likedCount: 4, dislikedCount: 0, lastRating: "like", confidence: "low" },
    { activity: "pronunciation", plays: 2, completions: 2, accuracy: 0.955, likedCount: 2, dislikedCount: 0, lastRating: "like", confidence: "low" },
    { activity: "word-radar", plays: 112, completions: 112, accuracy: 0.655, engagementScore: 0.859, frustrationScore: 0.271 },
    { activity: "spell-check", plays: 167, completions: 167, accuracy: 1, engagementScore: 0.992, frustrationScore: 0.1 },
  ],
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

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractHtml(raw: string): { html: string; mode: "raw_html" | "code_fence_removed" } {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  const start = candidate.search(/<!doctype html|<html[\s>]/i);
  const end = candidate.toLowerCase().lastIndexOf("</html>");
  if (start < 0 || end < start) throw new Error("complete_html_document_missing");
  return {
    html: candidate.slice(start, end + "</html>".length),
    mode: fenced ? "code_fence_removed" : "raw_html",
  };
}

function extractJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("json_object_missing");
  return JSON.parse(candidate.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1")) as T;
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

async function callAnthropic(
  config: CandidateConfig,
  content: string | Array<Record<string, unknown>>,
  maxTokens = MAX_TOKENS,
  timeoutMs = TIMEOUT_MS,
  effort?: "low" | "high",
): Promise<{ raw: string; inputTokens: number; outputTokens: number }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const isFable = config.model === "claude-fable-5";
  const usesAdaptiveThinking = Boolean(effort) && (isFable || config.model === "claude-opus-5");
  const response = await client.messages.stream({
    model: config.model,
    max_tokens: maxTokens,
    thinking: usesAdaptiveThinking ? { type: "adaptive" } : { type: "disabled" },
    ...(usesAdaptiveThinking ? { output_config: { effort: effort ?? "low" } } : {}),
    messages: [{ role: "user", content }],
  } as never, { timeout: timeoutMs }).finalMessage();
  return {
    raw: anthropicText(response),
    inputTokens: response.usage.input_tokens || 0,
    outputTokens: response.usage.output_tokens || 0,
  };
}

async function callOpenAi(
  config: CandidateConfig,
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
      max_output_tokens: MAX_TOKENS,
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

async function callModel(
  config: CandidateConfig,
  prompt: string,
): Promise<{ raw: string; inputTokens: number; outputTokens: number }> {
  return config.provider === "anthropic"
    ? callAnthropic(config, prompt)
    : callOpenAi(config, prompt);
}

function designPrompt(): string {
  return `Read the attached Grade 3 math assignment as the academic source.

Create one structured design artifact for a complete interactive learning experience for a nine-year-old. Teach the mathematical concepts represented by the assignment rather than reproducing its questions. Author fresh examples and challenges.

The following are factual observations from prior learning experiences. They are evidence, not instructions or conclusions:
${JSON.stringify(REINA_EVIDENCE, null, 2)}

Do not infer a durable preference from weak evidence. Independently choose the world, mission, experience form, interaction, stakes, consequences, recovery, progression, payoff, replay variation, visual direction, motion, sound, and useful libraries. Make the first action immediately understandable while allowing mathematical difficulty and independence to increase.

Return JSON only with:
{
  "title": "",
  "academicSourceSummary": [],
  "audienceRationale": "",
  "openingPromise": "",
  "firstThreeSeconds": "",
  "firstAction": "",
  "interactionDemonstration": "",
  "coreInteraction": "",
  "mathAsPower": "",
  "stakes": "",
  "consequences": "",
  "recovery": "",
  "progression": [
    { "stage": "", "mathematicalDemand": "", "experienceBeat": "", "supportAvailable": "" }
  ],
  "worldReaction": "",
  "payoff": "",
  "replayVariation": "",
  "visualDirection": "",
  "motionDirection": "",
  "soundDirection": "",
  "usefulLibraries": [],
  "engagementPrediction": "",
  "falsifyingEvidence": ""
}

Do not return HTML.`;
}

function implementationPrompt(artifactText: string): string {
  return `Implement the following frozen design artifact as one complete standalone interactive learning experience.

The design artifact is the creative authority. Implement its mission, interaction, mathematical behavior, stakes, consequences, recovery, progression, world reactions, payoff, and replay variation faithfully. Do not replace it with a generic quiz or reinterpret its educational scope.

You have complete implementation freedom. You may use inline HTML, CSS, JavaScript, SVG, Canvas, WebGL, audio APIs, and external HTTPS libraries or assets, including Three.js, PixiJS, Phaser, GSAP, and Tone.js. The experience must work with touch or mouse inside a 1365x768 iframe.

Return one complete HTML document. Do not explain your work. Return raw HTML only.

FROZEN DESIGN ARTIFACT:
${artifactText}`;
}

async function generateCandidate(
  config: CandidateConfig,
  prompt: string,
  artifactHash: string,
  runDir: string,
): Promise<CandidateRecord> {
  const started = Date.now();
  const candidateDir = path.join(runDir, "candidates", config.id);
  fs.mkdirSync(candidateDir, { recursive: true });
  write(path.join(candidateDir, "prompt.txt"), prompt);
  try {
    const result = await callModel(config, prompt);
    write(path.join(candidateDir, "raw-response.txt"), result.raw);
    const extracted = extractHtml(result.raw);
    write(path.join(candidateDir, "experience.html"), extracted.html);
    const htmlHash = hash(extracted.html);
    const record: CandidateRecord = {
      id: config.id,
      label: config.label,
      provider: config.provider,
      model: config.model,
      status: "complete",
      elapsedMs: Date.now() - started,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd: (result.inputTokens * config.inputRate + result.outputTokens * config.outputRate) / 1_000_000,
      artifactHash,
      promptHash: hash(prompt),
      apiResponseHash: hash(result.raw),
      savedHtmlHash: htmlHash,
      iframeSrcDocHash: htmlHash,
      extractionMode: extracted.mode,
      error: null,
    };
    writeJson(path.join(candidateDir, "generation.json"), record);
    return record;
  } catch (error) {
    const record: CandidateRecord = {
      id: config.id,
      label: config.label,
      provider: config.provider,
      model: config.model,
      status: "failed",
      elapsedMs: Date.now() - started,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      artifactHash,
      promptHash: hash(prompt),
      apiResponseHash: null,
      savedHtmlHash: null,
      iframeSrcDocHash: null,
      extractionMode: null,
      error: error instanceof Error ? error.message : String(error),
    };
    writeJson(path.join(candidateDir, "generation.json"), record);
    return record;
  }
}

function evidencePath(runDir: string): string {
  return path.join(runDir, "evidence.json");
}

function relativeFromRun(runDir: string, file: string): string {
  return `./${path.relative(runDir, file).split(path.sep).join("/")}`;
}

function screenshotGallery(runDir: string, entry?: EvidenceEntry): string {
  if (!entry?.screenshots) return `<p class="missing">Evidence capture pending.</p>`;
  return `<div class="shots">${Object.entries(entry.screenshots).map(([label, file]) =>
    `<figure><img src="${escapeHtml(relativeFromRun(runDir, path.resolve(runDir, file)))}"><figcaption>${escapeHtml(label)}</figcaption></figure>`,
  ).join("")}</div>`;
}

function comparisonPage(runDir: string): string {
  const summary = readJson<any>(path.join(runDir, "run.json"));
  const artifactText = fs.readFileSync(path.join(runDir, "design-artifact.json"), "utf8");
  const evidence = fs.existsSync(evidencePath(runDir))
    ? readJson<{ candidates?: Record<string, EvidenceEntry>; repaired?: EvidenceEntry }>(evidencePath(runDir))
    : {};
  const records: CandidateRecord[] = summary.records;
  const repairedRecord: CandidateRecord | null = fs.existsSync(path.join(runDir, "repaired", "generation.json"))
    ? readJson<CandidateRecord>(path.join(runDir, "repaired", "generation.json"))
    : null;
  const all = [
    ...records.map((record) => ({ record, href: `./candidates/${record.id}/experience.html`, evidence: evidence.candidates?.[record.id] })),
    ...(repairedRecord ? [{ record: repairedRecord, href: "./repaired/experience.html", evidence: evidence.repaired }] : []),
  ];
  const cards = all.map(({ record, href, evidence: itemEvidence }) => {
    const metadata = `${record.model} - ${(record.elapsedMs / 1000).toFixed(1)}s - $${record.estimatedCostUsd.toFixed(3)} - ${record.inputTokens.toLocaleString()} in / ${record.outputTokens.toLocaleString()} out`;
    if (record.status === "failed") {
      return `<article class="candidate failed"><header><h2>${escapeHtml(record.label)}</h2><p>${escapeHtml(metadata)}</p></header><div class="error">${escapeHtml(record.error || "Generation failed")}</div></article>`;
    }
    const trace = itemEvidence?.trace ? `<details><summary>Factual trace</summary><pre>${escapeHtml(JSON.stringify(itemEvidence.trace, null, 2))}</pre></details>` : "";
    return `<article class="candidate"><header><h2>${escapeHtml(record.label)}</h2><p>${escapeHtml(metadata)}</p><a href="${href}" target="_blank">Open alone</a></header><iframe title="${escapeHtml(record.label)}" src="${href}" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe>${screenshotGallery(runDir, itemEvidence)}${trace}</article>`;
  }).join("");
  const harness = fs.existsSync(path.join(runDir, "harness.json"))
    ? `<section><h2>Harness decision</h2><pre>${escapeHtml(fs.readFileSync(path.join(runDir, "harness.json"), "utf8"))}</pre></section>`
    : `<section><h2>Next step</h2><p>Capture evidence in <code>evidence.json</code>, then run the review phase.</p></section>`;
  const dimensions = ["First-action clarity", "Visual quality", "Interaction quality", "Math integration", "Progression and payoff", "Functionality", "Desire to continue or replay", "Overall"];
  const headers = all.map(({ record }) => `<th>${escapeHtml(record.label)}</th>`).join("");
  const rows = dimensions.map((dimension) => `<tr><th>${dimension}</th>${all.map(() => `<td><select><option>-</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Fractions Harness Experiment</title><style>
*{box-sizing:border-box}body{margin:0;background:#0c1020;color:#f5f0df;font:16px system-ui;padding:24px}h1{margin:0 0 6px}.summary{color:#aeb9d3;margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.candidate,section{background:#171d31;border:1px solid #35405d;border-radius:18px;overflow:hidden}.candidate header{padding:15px 18px}.candidate h2{margin:0 0 5px}.candidate p{margin:0 0 8px;color:#aeb9d3;font-size:13px}.candidate a{color:#80d8ff}.candidate iframe{display:block;width:100%;aspect-ratio:1365/768;border:0;background:#fff}.failed{border-color:#a94b56}.error{padding:30px;color:#ffabb4}section{margin-top:26px;padding:20px;overflow:auto}.shots{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px}.shots img{width:100%;display:block}.shots figure{margin:0}.shots figcaption{font-size:11px;color:#aeb9d3}.missing{padding:10px 18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #45506b;padding:9px;text-align:left}textarea{width:100%;min-height:130px;background:#0c1020;color:#fff;border:1px solid #45506b;border-radius:10px;padding:12px}pre{white-space:pre-wrap;color:#cbd4e8}@media(max-width:1000px){.grid{grid-template-columns:1fr}}
</style></head><body><h1>Fractions PDF - Raw Model and Harness Experiment</h1><p class="summary">One PDF-derived design artifact, four raw implementations, one critique, one repair, human judgment.</p><main class="grid">${cards}</main>${harness}<section><h2>Human scorecard</h2><table><thead><tr><th>Dimension</th>${headers}</tr></thead><tbody>${rows}</tbody></table><h3>Ranking and notes</h3><textarea></textarea></section><section><details><summary>Frozen design artifact</summary><pre>${escapeHtml(artifactText)}</pre></details></section></body></html>`;
}

async function generatePhase(): Promise<void> {
  if (!fs.existsSync(PDF_PATH)) throw new Error(`pdf_missing:${PDF_PATH}`);
  const pdf = fs.readFileSync(PDF_PATH);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(OUTPUT_ROOT, stamp);
  fs.mkdirSync(path.join(runDir, "source"), { recursive: true });
  write(path.join(runDir, "source", path.basename(PDF_PATH)), pdf);
  writeJson(path.join(runDir, "source", "reina-evidence.json"), REINA_EVIDENCE);
  write(path.join(runDir, "source", "design-prompt.txt"), designPrompt());

  process.stdout.write("[1/3] Sonnet designing from the PDF\n");
  const designer = CANDIDATES[0];
  const designResult = await callAnthropic(designer, [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
    { type: "text", text: designPrompt() },
  ], 8_000);
  write(path.join(runDir, "source", "design-raw-response.txt"), designResult.raw);
  const artifact = extractJson<Record<string, unknown>>(designResult.raw);
  const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
  write(path.join(runDir, "design-artifact.json"), artifactText);
  const artifactHash = hash(artifactText.trim());
  const prompt = implementationPrompt(artifactText.trim());
  write(path.join(runDir, "shared-implementation-prompt.txt"), prompt);

  process.stdout.write("[2/3] Four models implementing the frozen artifact in parallel\n");
  const records = await Promise.all(CANDIDATES.map((config) => generateCandidate(config, prompt, artifactHash, runDir)));
  const totalCost = records.reduce((sum, record) => sum + record.estimatedCostUsd, 0)
    + (designResult.inputTokens * designer.inputRate + designResult.outputTokens * designer.outputRate) / 1_000_000;
  const completeCount = records.filter((record) => record.status === "complete").length;
  writeJson(path.join(runDir, "run.json"), {
    status: completeCount >= 3 ? "evidence_capture_required" : "experiment_failed",
    pdfPath: PDF_PATH,
    pdfHash: hash(pdf),
    artifactHash,
    promptHash: hash(prompt),
    identicalPromptProven: new Set(records.map((record) => record.promptHash)).size === 1,
    completeCount,
    modelCalls: 5,
    totalEstimatedCostUsd: totalCost,
    spendCeilingUsd: SPEND_CEILING_USD,
    spendCeilingExceeded: totalCost > SPEND_CEILING_USD,
    designUsage: { inputTokens: designResult.inputTokens, outputTokens: designResult.outputTokens },
    records,
  });
  writeJson(evidencePath(runDir), { candidates: {}, repaired: {} });
  write(path.join(runDir, "comparison.html"), comparisonPage(runDir));
  process.stdout.write(`[3/3] Capture usability evidence, then run review\n${path.join(runDir, "comparison.html")}\nRUN_DIR=${runDir}\n`);
  if (completeCount < 3) process.exitCode = 1;
}

function imageBlock(file: string): Record<string, unknown> {
  const bytes = fs.readFileSync(file);
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: isJpeg ? "image/jpeg" : "image/png",
      data: bytes.toString("base64"),
    },
  };
}

function harnessPrompt(
  runDir: string,
  records: CandidateRecord[],
  evidence: { candidates?: Record<string, EvidenceEntry> },
): Array<Record<string, unknown>> {
  const artifact = fs.readFileSync(path.join(runDir, "design-artifact.json"), "utf8");
  const content: Array<Record<string, unknown>> = [{
    type: "text",
    text: `You are an experimental usability and experience-quality critic comparing independently generated child learning experiences.

The frozen design artifact is the promised experience:
${artifact}

Examine the supplied HTML, screenshots, and factual traces. Be skeptical: attractive decoration alone is not proof of a strong experience.

For each candidate, cite specific evidence about first-action clarity, visual hierarchy and legibility, whether fractions are embodied in the interaction, visible world reaction, consequence and recovery, progression and payoff, resistance to random guessing, functional completeness, and whether a child might continue or replay.

Select the strongest candidate even if all are imperfect. Do not invent child preferences or product rules. Choose exactly one repair mode:
- refine: preserve the core interaction and correct its largest weaknesses;
- pivot: the core interaction is the weakness and should be replaced.

Return JSON only:
{
  "selectedCandidate": "",
  "candidateObservations": {},
  "selectionReason": "",
  "strongestExistingQuality": "",
  "largestWeakness": "",
  "repairMode": "refine or pivot",
  "repairBrief": ""
}`,
  }];
  for (const record of records.filter((item) => item.status === "complete")) {
    const html = fs.readFileSync(path.join(runDir, "candidates", record.id, "experience.html"), "utf8");
    const entry = evidence.candidates?.[record.id];
    content.push({ type: "text", text: `CANDIDATE ${record.id}\nHTML:\n${html}\nFACTUAL TRACE:\n${JSON.stringify(entry?.trace || {}, null, 2)}` });
    for (const [label, relative] of Object.entries(entry?.screenshots || {})) {
      content.push({ type: "text", text: `Candidate ${record.id} screenshot: ${label}` });
      content.push(imageBlock(path.resolve(runDir, relative)));
    }
  }
  return content;
}

async function reviewPhase(): Promise<void> {
  if (!RUN_DIR) throw new Error("SUNNY_FRACTIONS_RUN_required");
  const runDir = RUN_DIR;
  const summary = readJson<any>(path.join(runDir, "run.json"));
  const evidence = readJson<{ candidates?: Record<string, EvidenceEntry> }>(evidencePath(runDir));
  const complete = (summary.records as CandidateRecord[]).filter((record) => record.status === "complete");
  for (const record of complete) {
    const entry = evidence.candidates?.[record.id];
    if (!entry?.trace || Object.keys(entry.screenshots || {}).length === 0) {
      throw new Error(`evidence_missing:${record.id}`);
    }
  }

  process.stdout.write("[1/2] Opus reviewing usability and quality once\n");
  const critic = CANDIDATES[1];
  const review = await callAnthropic(critic, harnessPrompt(runDir, complete, evidence), 8_000);
  write(path.join(runDir, "harness-raw-response.txt"), review.raw);
  const decision = extractJson<HarnessDecision>(review.raw);
  if (!["refine", "pivot"].includes(decision.repairMode)) throw new Error("invalid_repair_mode");
  const selected = complete.find((record) => record.id === decision.selectedCandidate);
  if (!selected) throw new Error(`invalid_selected_candidate:${decision.selectedCandidate}`);
  writeJson(path.join(runDir, "harness.json"), decision);

  const artifact = fs.readFileSync(path.join(runDir, "design-artifact.json"), "utf8").trim();
  const selectedHtml = fs.readFileSync(path.join(runDir, "candidates", selected.id, "experience.html"), "utf8");
  const prompt = decision.repairMode === "refine"
    ? `Refactor this standalone learning experience exactly once. Preserve its strongest existing quality and address the repair brief. Do not change the frozen design artifact's mathematical scope.\n\nFROZEN DESIGN ARTIFACT:\n${artifact}\n\nREPAIR BRIEF:\n${decision.repairBrief}\n\nEXISTING HTML:\n${selectedHtml}\n\nReturn one complete self-contained HTML document with inline CSS and JavaScript. It must work with touch or mouse inside a 1365x768 iframe. External HTTPS libraries and assets are allowed. Return raw HTML only.`
    : `Create a substantially different standalone learning experience for the frozen design artifact. The previous core interaction was judged to be the primary weakness; do not cosmetically recreate it.\n\nFROZEN DESIGN ARTIFACT:\n${artifact}\n\nOBSERVED WEAKNESS:\n${decision.repairBrief}\n\nReturn one complete self-contained HTML document with inline CSS and JavaScript. It must work with touch or mouse inside a 1365x768 iframe. External HTTPS libraries and assets are allowed. Return raw HTML only.`;
  const selectedConfig = CANDIDATES.find((candidate) => candidate.id === selected.id)!;
  const started = Date.now();
  process.stdout.write(`[2/2] ${selected.label} performing one ${decision.repairMode}\n`);
  const repaired = await callModel(selectedConfig, prompt);
  const extracted = extractHtml(repaired.raw);
  const repairedDir = path.join(runDir, "repaired");
  write(path.join(repairedDir, "prompt.txt"), prompt);
  write(path.join(repairedDir, "raw-response.txt"), repaired.raw);
  write(path.join(repairedDir, "experience.html"), extracted.html);
  const repairedRecord: CandidateRecord = {
    id: "repaired",
    label: `Repaired ${selected.label}`,
    provider: selected.provider,
    model: selected.model,
    status: "complete",
    elapsedMs: Date.now() - started,
    inputTokens: repaired.inputTokens,
    outputTokens: repaired.outputTokens,
    estimatedCostUsd: (repaired.inputTokens * selectedConfig.inputRate + repaired.outputTokens * selectedConfig.outputRate) / 1_000_000,
    artifactHash: summary.artifactHash,
    promptHash: hash(prompt),
    apiResponseHash: hash(repaired.raw),
    savedHtmlHash: hash(extracted.html),
    iframeSrcDocHash: hash(extracted.html),
    extractionMode: extracted.mode,
    error: null,
  };
  writeJson(path.join(repairedDir, "generation.json"), repairedRecord);
  write(path.join(runDir, "comparison.html"), comparisonPage(runDir));
  process.stdout.write(`${path.join(runDir, "comparison.html")}\nCapture repaired evidence, then run render.\n`);
}

function renderPhase(): void {
  if (!RUN_DIR) throw new Error("SUNNY_FRACTIONS_RUN_required");
  write(path.join(RUN_DIR, "comparison.html"), comparisonPage(RUN_DIR));
  process.stdout.write(`${path.join(RUN_DIR, "comparison.html")}\n`);
}

type ArchitectNode = {
  nodeId: string;
  responsibility: string;
  academicBoundary: string;
  evidenceGoal: string;
};

type ArchitectProgram = {
  boardTitle: string;
  boardAcademicGoal: string;
  coherence: string;
  nodes: ArchitectNode[];
};

type ArchitectResult = {
  id: string;
  label: string;
  model: string;
  node: ArchitectNode;
  status: "complete" | "failed";
  artifact: Record<string, unknown> | null;
  artifactHash: string | null;
  artifactPromptHash: string;
  artifactInputTokens: number;
  artifactOutputTokens: number;
  artifactCostUsd: number;
  artifactElapsedMs: number;
  mockStatus: "complete" | "failed" | "not_run";
  mockPromptHash: string | null;
  mockHtmlHash: string | null;
  mockInputTokens: number;
  mockOutputTokens: number;
  mockCostUsd: number;
  mockElapsedMs: number;
  error: string | null;
};

const ARCHITECT_OUTPUT_ROOT = path.join(ROOT, "outputs/math-creative-sandbox/architect-comparison");
const ARCHITECT_TIMEOUT_MS = 240_000;
const ARCHITECTS = [CANDIDATES[0], CANDIDATES[1], CANDIDATES[3]];

function architectPlannerPrompt(): string {
  return `Read the attached Grade 3 fractions assignment and create one compact academic program with exactly three comparable nodes.

The three nodes must respectively address:
1. equal partitioning;
2. recognizing unit fractions;
3. comparing 1/3 and 1/4.

You own academic sequencing, fresh mathematical examples, boundaries, and evidence goals. Do not choose a world, story, mission, mechanic, stakes, visual style, sound, reward, or implementation. Do not reproduce the worksheet questions as the reusable content.

Return JSON only:
{
  "boardTitle": "",
  "boardAcademicGoal": "",
  "coherence": "",
  "nodes": [
    {
      "nodeId": "",
      "responsibility": "",
      "academicBoundary": "",
      "evidenceGoal": ""
    }
  ]
}`;
}

function architectPrompt(program: ArchitectProgram, node: ArchitectNode): string {
  return `You are the creative architect for one node in a coherent Grade 3 fractions chapter.

The complete academic program is supplied for context. Your assigned node contract is immutable. Do not change its responsibility, mathematical boundary, or evidence goal.

You independently own the experience design: title, world, mission, experience form, first action, demonstration, core interaction, mathematics-as-power, stakes, consequences, recovery, progression, world reactions, payoff, replay variation, visual identity, motion, sound, and useful libraries. The experience may be a game or another interactive form. Make the first action immediately understandable while allowing the mathematics to remain challenging.

The following child information is factual evidence, not creative instructions or conclusions:
${JSON.stringify(REINA_EVIDENCE, null, 2)}

Do not copy or name prior activities merely because they appear in the evidence.

COMPLETE BOARD PROGRAM:
${JSON.stringify(program, null, 2)}

YOUR IMMUTABLE NODE:
${JSON.stringify(node, null, 2)}

Return JSON only:
{
  "artifactId": "",
  "nodeId": "${node.nodeId}",
  "title": "",
  "audienceRationale": "",
  "openingPromise": "",
  "firstThreeSeconds": "",
  "firstAction": "",
  "interactionDemonstration": "",
  "coreInteraction": "",
  "mathAsPower": "",
  "stakes": "",
  "consequences": "",
  "recovery": "",
  "progression": [],
  "worldReaction": "",
  "payoff": "",
  "replayVariation": "",
  "visualDirection": "",
  "motionDirection": "",
  "soundDirection": "",
  "usefulLibraries": [],
  "engagementPrediction": "",
  "falsifyingEvidence": ""
}`;
}

function mockPrompt(program: ArchitectProgram, node: ArchitectNode, artifact: Record<string, unknown>): string {
  return `Build a lightweight interactive mock of this design artifact.

Show only the opening state and first meaningful interaction. The mock should make the mission, first action, mathematical action, and immediate world reaction visible. It is not a complete activity.

Use one self-contained HTML document with inline CSS and JavaScript. External HTTPS libraries and assets are allowed. It must work with touch or mouse inside a 1365x768 iframe. Keep the complete HTML under 14,000 characters.

Do not reinterpret the artifact or replace it with a generic quiz. Return raw HTML only.

BOARD CONTEXT:
${JSON.stringify({ boardTitle: program.boardTitle, boardAcademicGoal: program.boardAcademicGoal, coherence: program.coherence }, null, 2)}

NODE CONTRACT:
${JSON.stringify(node, null, 2)}

DESIGN ARTIFACT:
${JSON.stringify(artifact, null, 2)}`;
}

function architectComparisonPage(runDir: string, program: ArchitectProgram, results: ArchitectResult[]): string {
  const cards = results.map((result) => {
    const cost = result.artifactCostUsd + result.mockCostUsd;
    const metadata = `${result.model} · ${(result.artifactElapsedMs + result.mockElapsedMs) / 1000}s · $${cost.toFixed(3)}`;
    const frame = result.mockStatus === "complete"
      ? `<iframe title="${escapeHtml(result.label)}" src="./nodes/${result.id}/mock.html" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe>`
      : `<div class="failure">${escapeHtml(result.error || "Mock unavailable")}</div>`;
    return `<article>
      <header><p class="eyebrow">${escapeHtml(result.node.responsibility)}</p><h2>${escapeHtml(result.label)}</h2><p>${escapeHtml(metadata)}</p><a href="./nodes/${result.id}/mock.html" target="_blank">Open mock</a></header>
      ${frame}
      <details><summary>Design artifact</summary><pre>${escapeHtml(JSON.stringify(result.artifact, null, 2))}</pre></details>
    </article>`;
  }).join("");
  const headers = results.map((result) => `<th>${escapeHtml(result.label)}</th>`).join("");
  const dimensions = ["First-action clarity", "Visual quality", "Interaction quality", "Math integration", "Progression/payoff promise", "Desire to continue", "Overall"];
  const rows = dimensions.map((dimension) => `<tr><th>${dimension}</th>${results.map(() => `<td><select><option>—</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Three-Node Architect Comparison</title><style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#0b1020;color:#f7f1df;font:16px system-ui}h1{margin:0}.lede{color:#aebbd5}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}article,section{background:#171e32;border:1px solid #36415f;border-radius:18px;overflow:hidden}header{padding:16px}header h2{margin:2px 0 6px}header p{margin:0 0 8px;color:#aebbd5;font-size:13px}.eyebrow{color:#ffd166;text-transform:uppercase;letter-spacing:.08em}a{color:#7ddcff}iframe{display:block;width:100%;aspect-ratio:1365/768;border:0;background:#fff}.failure{min-height:280px;padding:30px;color:#ffabb4}details{padding:14px}pre{white-space:pre-wrap;color:#cbd5ea}section{margin-top:22px;padding:18px;overflow:auto}table{width:100%;border-collapse:collapse}th,td{border:1px solid #465270;padding:9px;text-align:left}textarea{width:100%;min-height:120px;background:#0b1020;color:#fff;border:1px solid #465270;border-radius:10px;padding:12px}@media(max-width:1100px){.grid{grid-template-columns:1fr}}
</style></head><body><h1>Three-Node Architect Comparison</h1><p class="lede">One fractions program. Three model architects. One shared Sonnet mock builder. Human judgment only.</p><main class="grid">${cards}</main><section><h2>Human scorecard</h2><table><thead><tr><th>Dimension</th>${headers}</tr></thead><tbody>${rows}</tbody></table><h3>Ranking and notes</h3><textarea></textarea></section><section><details><summary>Frozen academic program</summary><pre>${escapeHtml(JSON.stringify(program, null, 2))}</pre></details></section></body></html>`;
}

async function architectComparisonPhase(): Promise<void> {
  if (!fs.existsSync(PDF_PATH)) throw new Error(`pdf_missing:${PDF_PATH}`);
  const pdf = fs.readFileSync(PDF_PATH);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(ARCHITECT_OUTPUT_ROOT, stamp);
  fs.mkdirSync(path.join(runDir, "source"), { recursive: true });
  write(path.join(runDir, "source", path.basename(PDF_PATH)), pdf);
  writeJson(path.join(runDir, "source", "reina-evidence.json"), REINA_EVIDENCE);
  const plannerPrompt = architectPlannerPrompt();
  write(path.join(runDir, "source", "planner-prompt.txt"), plannerPrompt);

  process.stdout.write("[1/4] Sonnet creating one academic program\n");
  const plannerConfig = CANDIDATES[0];
  const plannerStarted = Date.now();
  const plannerResult = await callAnthropic(plannerConfig, [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
    { type: "text", text: plannerPrompt },
  ], 5_000, ARCHITECT_TIMEOUT_MS);
  write(path.join(runDir, "source", "planner-raw-response.txt"), plannerResult.raw);
  const program = extractJson<ArchitectProgram>(plannerResult.raw);
  if (!Array.isArray(program.nodes) || program.nodes.length !== 3) throw new Error("architect_program_requires_three_nodes");
  writeJson(path.join(runDir, "academic-program.json"), program);

  process.stdout.write("[2/4] Sonnet, Opus, and Fable designing one node each in parallel\n");
  const artifactSettled = await Promise.all(ARCHITECTS.map(async (config, index): Promise<ArchitectResult> => {
    const node = program.nodes[index];
    const nodeDir = path.join(runDir, "nodes", config.id);
    const prompt = architectPrompt(program, node);
    write(path.join(nodeDir, "artifact-prompt.txt"), prompt);
    const started = Date.now();
    try {
      const response = await callAnthropic(config, prompt, 7_000, ARCHITECT_TIMEOUT_MS);
      write(path.join(nodeDir, "artifact-raw-response.txt"), response.raw);
      const artifact = extractJson<Record<string, unknown>>(response.raw);
      writeJson(path.join(nodeDir, "artifact.json"), artifact);
      return {
        id: config.id, label: config.label, model: config.model, node, status: "complete", artifact,
        artifactHash: hash(JSON.stringify(artifact)), artifactPromptHash: hash(prompt),
        artifactInputTokens: response.inputTokens, artifactOutputTokens: response.outputTokens,
        artifactCostUsd: (response.inputTokens * config.inputRate + response.outputTokens * config.outputRate) / 1_000_000,
        artifactElapsedMs: Date.now() - started, mockStatus: "not_run", mockPromptHash: null, mockHtmlHash: null,
        mockInputTokens: 0, mockOutputTokens: 0, mockCostUsd: 0, mockElapsedMs: 0, error: null,
      };
    } catch (error) {
      return {
        id: config.id, label: config.label, model: config.model, node, status: "failed", artifact: null,
        artifactHash: null, artifactPromptHash: hash(prompt), artifactInputTokens: 0, artifactOutputTokens: 0,
        artifactCostUsd: 0, artifactElapsedMs: Date.now() - started, mockStatus: "not_run", mockPromptHash: null,
        mockHtmlHash: null, mockInputTokens: 0, mockOutputTokens: 0, mockCostUsd: 0, mockElapsedMs: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }));

  process.stdout.write("[3/4] Sonnet building three lightweight mocks in parallel\n");
  const mockBuilder = CANDIDATES[0];
  const results = await Promise.all(artifactSettled.map(async (result): Promise<ArchitectResult> => {
    if (result.status !== "complete" || !result.artifact) return result;
    const prompt = mockPrompt(program, result.node, result.artifact);
    const nodeDir = path.join(runDir, "nodes", result.id);
    write(path.join(nodeDir, "mock-prompt.txt"), prompt);
    const started = Date.now();
    try {
      const response = await callAnthropic(mockBuilder, prompt, 8_000, ARCHITECT_TIMEOUT_MS);
      write(path.join(nodeDir, "mock-raw-response.txt"), response.raw);
      const extracted = extractHtml(response.raw);
      write(path.join(nodeDir, "mock.html"), extracted.html);
      return {
        ...result,
        mockStatus: "complete",
        mockPromptHash: hash(prompt),
        mockHtmlHash: hash(extracted.html),
        mockInputTokens: response.inputTokens,
        mockOutputTokens: response.outputTokens,
        mockCostUsd: (response.inputTokens * mockBuilder.inputRate + response.outputTokens * mockBuilder.outputRate) / 1_000_000,
        mockElapsedMs: Date.now() - started,
      };
    } catch (error) {
      return { ...result, mockStatus: "failed", mockElapsedMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
    }
  }));

  const plannerCost = (plannerResult.inputTokens * plannerConfig.inputRate + plannerResult.outputTokens * plannerConfig.outputRate) / 1_000_000;
  const totalCost = plannerCost + results.reduce((sum, item) => sum + item.artifactCostUsd + item.mockCostUsd, 0);
  writeJson(path.join(runDir, "run.json"), {
    status: results.filter((item) => item.mockStatus === "complete").length >= 2 && totalCost <= 1.2 ? "human_review" : "experiment_failed",
    modelCalls: 7,
    planner: { model: plannerConfig.model, elapsedMs: Date.now() - plannerStarted, inputTokens: plannerResult.inputTokens, outputTokens: plannerResult.outputTokens, costUsd: plannerCost },
    totalEstimatedCostUsd: totalCost,
    spendCeilingUsd: 1.2,
    results,
  });
  write(path.join(runDir, "comparison.html"), architectComparisonPage(runDir, program, results));
  process.stdout.write(`[4/4] Human comparison ready\n${path.join(runDir, "comparison.html")}\nRUN_DIR=${runDir}\nTotal estimated cost: $${totalCost.toFixed(3)}\n`);
}

type ArchitectQualityReview = {
  nodeId: string;
  strongestQuality: string;
  usabilityIssues: string[];
  visualIssues: string[];
  repairBrief: string;
};

type ArchitectQualityDecision = {
  reviews: ArchitectQualityReview[];
  boardLevelObservations: string[];
};

function architectQualityPrompt(
  program: ArchitectProgram,
  results: ArchitectResult[],
  runDir: string,
): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [{
    type: "text",
    text: `You are performing one bounded implementation-quality review of three child-facing fractions mocks.

The academic program and each design artifact are immutable. Review only the rendered opening state and first meaningful interaction: first-action intuitiveness, visual hierarchy, legibility, CSS/layout defects, responsive behavior, interaction affordances, and immediate visible world reaction.

Do not change mathematics, node responsibility, theme, mission, stakes, consequences, core interaction, or child theory. Do not rank the architects and do not invent new product doctrine. Do not request additional modes, rounds, mechanics, shapes, curriculum, progression systems, or completion of missing full-game features. Give one concrete repair brief per node that improves only this lightweight mock and can be implemented without expanding its scope.

Be concise. For each node, return at most three usability issues and three visual issues. Each issue must be one sentence. Keep each repair brief under 100 words.

ACADEMIC PROGRAM:
${JSON.stringify(program, null, 2)}

Return JSON only:
{
  "reviews": [
    {
      "nodeId": "",
      "strongestQuality": "",
      "usabilityIssues": [],
      "visualIssues": [],
      "repairBrief": ""
    }
  ],
  "boardLevelObservations": []
}`,
  }];
  for (const result of results) {
    const nodeDir = path.join(runDir, "nodes", result.id);
    content.push({
      type: "text",
      text: `NODE ${result.node.nodeId}
ARCHITECT MODEL: ${result.model}
NODE CONTRACT:
${JSON.stringify(result.node, null, 2)}
FROZEN DESIGN ARTIFACT:
${fs.readFileSync(path.join(nodeDir, "artifact.json"), "utf8")}
CURRENT MOCK HTML:
${fs.readFileSync(path.join(nodeDir, "mock.html"), "utf8")}
OPENING SCREENSHOT:`,
    });
    content.push(imageBlock(path.join(runDir, "quality-evidence", `${result.id}-opening.png`)));
  }
  return content;
}

function qualityBoardPage(results: ArchitectResult[], reviews: ArchitectQualityReview[]): string {
  const reviewByNode = new Map(reviews.map((review) => [review.nodeId, review]));
  const cards = results.map((result) => {
    const review = reviewByNode.get(result.node.nodeId);
    const title = String(result.artifact?.title || result.label);
    return `<article>
      <p class="model">${escapeHtml(result.label)} architect · Sonnet implementation</p>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(result.node.responsibility)}</p>
      <div class="actions">
        <button data-src="./nodes/${result.id}/mock.html" data-label="Original ${escapeHtml(title)}">Original</button>
        <button class="repaired" data-src="./nodes/${result.id}/quality-repair/mock.html" data-label="Quality-pass ${escapeHtml(title)}">Quality pass</button>
      </div>
      <details><summary>Harness observations</summary><pre>${escapeHtml(JSON.stringify(review, null, 2))}</pre></details>
    </article>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Architect Quality A/B Board</title><style>
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#344679,#0a0e20 62%);color:#fff;font:16px system-ui;min-height:100vh;padding:38px}h1{text-align:center;font-size:48px;margin:0}.lede{text-align:center;color:#c9d4ef;margin:8px 0 38px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;max-width:1300px;margin:auto}article{background:#17203f;border:2px solid #52618e;border-radius:24px;padding:24px;box-shadow:0 20px 50px #0007}.model{color:#ffd66b;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.1em}h2{font-size:28px;margin:8px 0}article>p{color:#d5def3}.actions{display:flex;gap:10px;margin:20px 0}button{border:0;border-radius:999px;padding:12px 18px;font-weight:900;cursor:pointer}.repaired{background:#ffd66b;color:#1a1830}details{color:#bfcbea}pre{white-space:pre-wrap}.player{position:fixed;inset:0;background:#050812;display:none;z-index:10}.player.open{display:block}.player iframe{width:100%;height:100%;border:0;background:#fff}.back{position:absolute;top:16px;right:20px;z-index:11;background:#090d18dd;color:#fff;border:2px solid #fff}.badge{position:absolute;top:20px;left:20px;z-index:11;background:#ffd66b;color:#14172a;border-radius:999px;padding:10px 16px;font-weight:900}@media(max-width:950px){.grid{grid-template-columns:1fr}body{padding:22px}}
</style></head><body><h1>Original vs Quality Pass</h1><p class="lede">Same Planner, architects, artifacts, and Sonnet builder. One bounded usability and visual repair.</p><main class="grid">${cards}</main><section class="player" id="qualityPlayer"><div class="badge" id="qualityLabel"></div><button class="back" id="qualityBack">← Back to comparisons</button><iframe id="qualityFrame" title="Quality comparison" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe></section><script>
const p=document.getElementById('qualityPlayer'),f=document.getElementById('qualityFrame'),l=document.getElementById('qualityLabel');
document.querySelectorAll('[data-src]').forEach(b=>b.addEventListener('click',()=>{f.src=b.dataset.src;l.textContent=b.dataset.label;p.classList.add('open')}));
document.getElementById('qualityBack').addEventListener('click',()=>{p.classList.remove('open');f.src='about:blank'});
</script></body></html>`;
}

function qualityDemoBoardPage(results: ArchitectResult[]): string {
  const cards = results.map((result, index) => {
    const title = String(result.artifact?.title || result.label);
    const icon = ["🥧", "🏮", "🧪"][index] || "✦";
    return `<button class="node n${index + 1}" data-src="./nodes/${result.id}/quality-repair/mock.html">
      <div class="art">${icon}</div>
      <div class="copy"><div class="model">${escapeHtml(result.label)} architect</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(result.node.responsibility)}</p><span>Open node →</span></div>
    </button>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fable Quality-Passed Fractions Board</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 5%,#3a4d82,#151b38 50%,#080c1b);color:#fff;font-family:system-ui,sans-serif}.board{min-height:100vh;padding:40px}.eyebrow{text-align:center;color:#ffd768;font-weight:900;letter-spacing:.18em;text-transform:uppercase}h1{text-align:center;font-size:clamp(38px,5vw,72px);margin:8px 0}.lede{text-align:center;color:#c7d2ed;margin:0 0 42px}.path{max-width:1280px;margin:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:28px;position:relative}.path:before{content:"";position:absolute;left:12%;right:12%;top:102px;border-top:9px dashed #ffd76888}.node{position:relative;z-index:1;border:3px solid #ffffffb8;border-radius:28px;overflow:hidden;background:#192344;color:#fff;padding:0;text-align:left;cursor:pointer;box-shadow:0 22px 55px #0008;transition:.2s}.node:hover{transform:translateY(-7px);box-shadow:0 28px 70px #000b}.art{height:195px;display:grid;place-items:center;font-size:80px}.n1 .art{background:linear-gradient(145deg,#ffbd69,#df6c5c)}.n2 .art{background:linear-gradient(145deg,#57bde6,#293c83)}.n3 .art{background:linear-gradient(145deg,#ae6ce7,#4c2479)}.copy{padding:21px}.model{font-size:12px;color:#ffd768;font-weight:900;text-transform:uppercase;letter-spacing:.1em}.copy h2{font-size:27px;margin:7px 0}.copy p{color:#d6def2;line-height:1.4;min-height:88px}.copy span{display:inline-block;background:#fff;color:#18203d;border-radius:999px;padding:10px 15px;font-weight:900}.player{position:fixed;inset:0;background:#050812;display:none;z-index:10}.player.open{display:block}.player iframe{width:100%;height:100%;border:0;background:#fff}.back{position:absolute;top:16px;right:20px;z-index:11;border:2px solid #fff;background:#090d18dd;color:#fff;border-radius:999px;padding:12px 19px;font-weight:900;cursor:pointer}@media(max-width:900px){.path{grid-template-columns:1fr}.path:before{display:none}.board{padding:22px}}
</style></head><body><main class="board"><div class="eyebrow">Fable Quality Pass</div><h1>Choose a Fractions Mission</h1><p class="lede">Three model architects. One shared Sonnet builder. One bounded Fable usability and visual review.</p><section class="path">${cards}</section></main><section class="player" id="p"><button class="back" id="b">← Back to board</button><iframe id="f" title="Fractions experience" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe></section><script>
const p=document.getElementById('p'),f=document.getElementById('f');document.querySelectorAll('[data-src]').forEach(n=>n.addEventListener('click',()=>{f.src=n.dataset.src;p.classList.add('open')}));document.getElementById('b').addEventListener('click',()=>{p.classList.remove('open');f.src='about:blank'});
</script></body></html>`;
}

async function architectQualityPhase(): Promise<void> {
  if (!RUN_DIR) throw new Error("SUNNY_FRACTIONS_RUN_required");
  const runDir = RUN_DIR;
  const program = readJson<ArchitectProgram>(path.join(runDir, "academic-program.json"));
  const originalRun = readJson<{ results: ArchitectResult[] }>(path.join(runDir, "run.json"));
  const results = originalRun.results.filter((result) => result.status === "complete" && result.mockStatus === "complete");
  if (results.length !== 3) throw new Error("architect_quality_requires_three_complete_mocks");

  process.stdout.write("[1/3] Fable reviewing three existing mocks once\n");
  const critic = CANDIDATES[3];
  const reviewStarted = Date.now();
  const reviewRawFile = path.join(runDir, "quality-harness-raw-response.txt");
  const reviewResponse = fs.existsSync(reviewRawFile)
    ? { raw: fs.readFileSync(reviewRawFile, "utf8"), inputTokens: 0, outputTokens: 0 }
    : await callAnthropic(
        critic,
        architectQualityPrompt(program, results, runDir),
        8_000,
        ARCHITECT_TIMEOUT_MS,
        "high",
      );
  if (!fs.existsSync(reviewRawFile)) write(reviewRawFile, reviewResponse.raw);
  const decision = extractJson<ArchitectQualityDecision>(reviewResponse.raw);
  if (!Array.isArray(decision.reviews) || decision.reviews.length !== 3) throw new Error("architect_quality_requires_three_reviews");
  writeJson(path.join(runDir, "quality-harness.json"), decision);

  process.stdout.write("[2/3] Sonnet applying one implementation repair per mock in parallel\n");
  const builder = CANDIDATES[0];
  const repaired = await Promise.all(results.map(async (result) => {
    const review = decision.reviews.find((item) => item.nodeId === result.node.nodeId);
    if (!review) return { id: result.id, status: "failed", error: "quality_review_missing", costUsd: 0, elapsedMs: 0 };
    const nodeDir = path.join(runDir, "nodes", result.id);
    const repairDir = path.join(nodeDir, "quality-repair");
    const artifact = fs.readFileSync(path.join(nodeDir, "artifact.json"), "utf8");
    const existingHtml = fs.readFileSync(path.join(nodeDir, "mock.html"), "utf8");
    const prompt = `Repair this lightweight interactive mock exactly once.

The academic contract and design artifact are immutable. Apply only the usability, visual, CSS/layout, responsive, affordance, and implementation-fidelity corrections in the review. Preserve the theme, mission, stakes, core interaction, and mathematical responsibility. Keep this as an opening-state and first-interaction mock, not a complete activity.

Return one complete standalone HTML document under 14,000 characters with inline CSS and JavaScript. External HTTPS libraries and assets are allowed. It must work with touch or mouse inside a 1365x768 iframe. Return raw HTML only.

NODE CONTRACT:
${JSON.stringify(result.node, null, 2)}

FROZEN DESIGN ARTIFACT:
${artifact}

QUALITY REVIEW:
${JSON.stringify(review, null, 2)}

EXISTING MOCK HTML:
${existingHtml}`;
    write(path.join(repairDir, "prompt.txt"), prompt);
    const started = Date.now();
    try {
      const response = await callAnthropic(builder, prompt, 8_000, ARCHITECT_TIMEOUT_MS);
      write(path.join(repairDir, "raw-response.txt"), response.raw);
      const extracted = extractHtml(response.raw);
      write(path.join(repairDir, "mock.html"), extracted.html);
      return {
        id: result.id,
        status: "complete",
        error: null,
        costUsd: (response.inputTokens * builder.inputRate + response.outputTokens * builder.outputRate) / 1_000_000,
        elapsedMs: Date.now() - started,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        htmlHash: hash(extracted.html),
      };
    } catch (error) {
      return { id: result.id, status: "failed", error: error instanceof Error ? error.message : String(error), costUsd: 0, elapsedMs: Date.now() - started };
    }
  }));

  const reviewCost = (reviewResponse.inputTokens * critic.inputRate + reviewResponse.outputTokens * critic.outputRate) / 1_000_000;
  const totalCost = reviewCost + repaired.reduce((sum, item) => sum + item.costUsd, 0);
  writeJson(path.join(runDir, "quality-run.json"), {
    status: repaired.every((item) => item.status === "complete") ? "human_review" : "partial",
    modelCalls: 4,
    review: { model: critic.model, elapsedMs: Date.now() - reviewStarted, inputTokens: reviewResponse.inputTokens, outputTokens: reviewResponse.outputTokens, costUsd: reviewCost },
    repairs: repaired,
    totalEstimatedCostUsd: totalCost,
  });
  write(path.join(runDir, "quality-board.html"), qualityBoardPage(results, decision.reviews));
  if (repaired.every((item) => item.status === "complete")) {
    write(path.join(runDir, "board.html"), qualityDemoBoardPage(results));
  }
  process.stdout.write(`[3/3] Original-versus-quality comparison ready\n${path.join(runDir, "quality-board.html")}\nTotal estimated cost: $${totalCost.toFixed(3)}\n`);
}

async function fableSelfBuildPhase(): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(ROOT, "outputs/math-creative-sandbox/fable-self-build", stamp);
  const fable = CANDIDATES[3];
  const responsibility = "Interpret a multiplicative word problem by identifying the number of groups and the amount in each group, then represent the situation as an array and multiplication equation.";
  const factualReinaPacket = `Factual observations about Reina:
- She is nine years old.
- She has repeatedly requested difficult challenges.
- She has sustained engagement with fast-paced riddles and multi-step logic.
- She notices errors and questions faulty reasoning.
- Applied store-based math produced substantially stronger performance than mechanical worksheet-style practice.
- She has requested action stories involving adversaries.
- Competitive framing has coincided with high engagement.
- These observations come from a limited set of sessions and do not prove permanent preferences.`;

  const artifactPrompt = `Act as an exceptional children's experience designer and learning designer.

Create one complete design artifact for an interactive experience with this academic responsibility:

${responsibility}

Teach the concept through fresh material, not copied worksheet questions.

${factualReinaPacket}

Audience and learning-position boundary:
- The child should understand what to do in the first few seconds without reading a manual.
- Interaction literacy should remain coherent as mathematical independence increases.
- Difficulty should come from mathematical thinking, not decoding an unfamiliar interface.

This is not an instruction to make a particular genre, game, mood, consequence system, visual style, or mechanic. You own those decisions. You may choose a game, simulation, construction experience, story, puzzle, or another form.

Return one design artifact containing:
- id and title;
- audience rationale grounded only in supplied facts;
- opening promise;
- what is visually obvious in the first three seconds;
- first child action and how the interface demonstrates it;
- core interaction;
- how multiplication is the power used to advance;
- stakes, consequences, and recovery selected by you;
- progression from approachable teaching through guided application to ambitious independent challenge;
- interaction continuity;
- visible world progression and reaction;
- payoff and replay variation;
- visual, motion, and sound direction;
- optional browser libraries that materially help;
- a falsifiable engagement prediction.

Return JSON only. Do not return HTML.`;

  process.stdout.write("[1/2] Fable creating one design artifact\n");
  write(path.join(runDir, "artifact-prompt.txt"), artifactPrompt);
  const artifactStarted = Date.now();
  const artifactResponse = await callAnthropic(fable, artifactPrompt, 10_000, TIMEOUT_MS, "high");
  write(path.join(runDir, "artifact-raw-response.txt"), artifactResponse.raw);
  const artifact = extractJson<Record<string, unknown>>(artifactResponse.raw);
  writeJson(path.join(runDir, "design-artifact.json"), artifact);

  const implementationPrompt = `Implement the following frozen design artifact as one complete standalone interactive learning experience.

The design artifact is authoritative. Preserve its academic responsibility, premise, core interaction, stakes, consequences, recovery, progression, world reactions, payoff, and replay concept. Do not replace it with a lesson menu, decorative multiple-choice quiz, or a different experience.

The child must be able to play from the opening state through a visible conclusion. Use fresh multiplicative situations within the stated responsibility and increase mathematical independence as described by the artifact.

You have free rein over implementation, animation, audio, graphics, presentation, and browser libraries. Public HTTPS libraries and assets are allowed, including Three.js, PixiJS, Phaser, Matter.js, GSAP, Tone.js, Canvas, WebGL, SVG, and CSS animation. Use only what materially improves this artifact.

Return one complete self-contained HTML document with inline CSS and JavaScript that works with touch or mouse inside a 1365×768 iframe. Do not return commentary or Markdown.

ACADEMIC RESPONSIBILITY:
${responsibility}

FROZEN DESIGN ARTIFACT:
${JSON.stringify(artifact, null, 2)}`;

  process.stdout.write("[2/2] Fable implementing its frozen artifact once\n");
  write(path.join(runDir, "implementation-prompt.txt"), implementationPrompt);
  const implementationStarted = Date.now();
  const implementationResponse = await callAnthropic(fable, implementationPrompt, 32_000, TIMEOUT_MS, "high");
  write(path.join(runDir, "implementation-raw-response.txt"), implementationResponse.raw);
  const extracted = extractHtml(implementationResponse.raw);
  write(path.join(runDir, "experience.html"), extracted.html);

  const artifactCost = (artifactResponse.inputTokens * fable.inputRate + artifactResponse.outputTokens * fable.outputRate) / 1_000_000;
  const implementationCost = (implementationResponse.inputTokens * fable.inputRate + implementationResponse.outputTokens * fable.outputRate) / 1_000_000;
  writeJson(path.join(runDir, "run.json"), {
    status: "human_review",
    modelCalls: 2,
    model: fable.model,
    responsibility,
    artifactHash: hash(JSON.stringify(artifact)),
    implementationPromptHash: hash(implementationPrompt),
    savedHtmlHash: hash(extracted.html),
    artifact: {
      elapsedMs: implementationStarted - artifactStarted,
      inputTokens: artifactResponse.inputTokens,
      outputTokens: artifactResponse.outputTokens,
      estimatedCostUsd: artifactCost,
    },
    implementation: {
      elapsedMs: Date.now() - implementationStarted,
      inputTokens: implementationResponse.inputTokens,
      outputTokens: implementationResponse.outputTokens,
      estimatedCostUsd: implementationCost,
    },
    totalEstimatedCostUsd: artifactCost + implementationCost,
  });
  process.stdout.write(`Human review ready\n${path.join(runDir, "experience.html")}\nRUN_DIR=${runDir}\nTotal estimated cost: $${(artifactCost + implementationCost).toFixed(3)}\n`);
}

function frozenArtifactShowdownPage(runDir: string, records: CandidateRecord[]): string {
  const cards = records.map((record) => {
    const meta = `${record.model} · ${(record.elapsedMs / 1000).toFixed(1)}s · $${record.estimatedCostUsd.toFixed(3)} · ${record.inputTokens.toLocaleString()} in / ${record.outputTokens.toLocaleString()} out`;
    if (record.status === "failed") {
      return `<article class="card failed"><header><h2>${escapeHtml(record.label)}</h2><p>${escapeHtml(meta)}</p></header><div class="failure">${escapeHtml(record.error || "Generation failed")}</div></article>`;
    }
    const href = `./candidates/${record.id}/experience.html`;
    return `<article class="card"><header><h2>${escapeHtml(record.label)}</h2><p>${escapeHtml(meta)}</p><a href="${href}" target="_blank">Open full size ↗</a></header><iframe title="${escapeHtml(record.label)}" src="${href}" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe><footer><label>Overall <select><option>—</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label><textarea placeholder="Your notes"></textarea></footer></article>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frozen Artifact Builder Showdown</title><style>
*{box-sizing:border-box}body{margin:0;background:#090d1a;color:#f6f2e7;font:16px system-ui;padding:26px}h1{font-size:42px;margin:0;text-align:center}.lede{text-align:center;color:#aebbd5;margin:8px 0 28px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;max-width:1600px;margin:auto}.card{background:#151c30;border:1px solid #34405f;border-radius:20px;overflow:hidden;box-shadow:0 18px 45px #0007}.card header{padding:15px 18px}.card h2{margin:0 0 5px}.card p{margin:0 0 8px;color:#aebbd5;font-size:13px}.card a{color:#7edbff;font-weight:800}.card iframe{display:block;width:100%;aspect-ratio:1365/768;border:0;background:#fff}.card footer{display:grid;grid-template-columns:auto 1fr;gap:12px;padding:14px 18px;align-items:start}.card textarea{min-height:70px;background:#090d1a;color:#fff;border:1px solid #455372;border-radius:10px;padding:9px}.failed{border-color:#a64958}.failure{padding:30px;color:#ffacb7;white-space:pre-wrap}.artifact{max-width:1600px;margin:24px auto 0;background:#151c30;border:1px solid #34405f;border-radius:18px;padding:18px}.artifact pre{white-space:pre-wrap;color:#cbd4e8}@media(max-width:1000px){.grid{grid-template-columns:1fr}}
</style></head><body><h1>Frozen Cargo Code Artifact</h1><p class="lede">One immutable Fable design artifact. Five independent builders. No harness, repair, retry, or automatic winner.</p><main class="grid">${cards}</main><section class="artifact"><details><summary>Frozen design artifact</summary><pre>${escapeHtml(fs.readFileSync(path.join(runDir, "design-artifact.json"), "utf8"))}</pre></details></section></body></html>`;
}

async function frozenArtifactShowdownPhase(): Promise<void> {
  const sourceArtifact = path.resolve(
    process.env.SUNNY_FROZEN_ARTIFACT
      || path.join(ROOT, "outputs/math-creative-sandbox/fable-self-build/2026-07-29T14-46-43-374Z/design-artifact.json"),
  );
  if (!fs.existsSync(sourceArtifact)) throw new Error(`frozen_artifact_missing:${sourceArtifact}`);
  const artifactText = fs.readFileSync(sourceArtifact, "utf8");
  const artifactHash = hash(artifactText);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(ROOT, "outputs/math-creative-sandbox/frozen-artifact-showdown", stamp);
  write(path.join(runDir, "design-artifact.json"), artifactText);

  const prompt = `Implement the following frozen design artifact as a polished, complete playable vertical slice.

The artifact is authoritative. Preserve its academic responsibility, premise, core interaction, math-as-power relationship, rival, stakes, consequences, recovery, world reactions, and payoff. Do not replace it with a lesson menu, decorative multiple-choice quiz, or a different experience.

Create a coherent beginning, escalating middle, and visible conclusion. You choose how many encounters are sufficient. The child must interpret multiplicative situations, set groups and amount-in-each, see the array build, and use a multiplication equation to advance the world. The experience must be understandable from its opening screen and functional from start to finish.

You have implementation freedom over graphics, animation, audio, layout, and public HTTPS libraries or assets. Use only what materially improves the artifact.

Return one complete standalone HTML document with inline CSS and JavaScript that works with touch or mouse inside a 1365×768 iframe. Keep the complete HTML under 24,000 characters so it finishes reliably. Return raw HTML only.

FROZEN DESIGN ARTIFACT:
${artifactText}`;
  write(path.join(runDir, "implementation-prompt.txt"), prompt);

  const builders = ["sonnet-5", "opus-5", "gpt-5-5", "gpt-5-6-sol", "fable-5"]
    .map((id) => CANDIDATES.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is CandidateConfig => Boolean(candidate));
  process.stdout.write(`[1/2] Building frozen artifact with ${builders.length} models in parallel\n`);
  const records = await Promise.all(builders.map((builder) => generateCandidate(builder, prompt, artifactHash, runDir)));
  const totalEstimatedCostUsd = records.reduce((sum, record) => sum + record.estimatedCostUsd, 0);
  writeJson(path.join(runDir, "run.json"), {
    status: "human_review",
    modelCalls: builders.length,
    artifactSource: sourceArtifact,
    artifactHash,
    implementationPromptHash: hash(prompt),
    totalEstimatedCostUsd,
    records,
  });
  write(path.join(runDir, "comparison.html"), frozenArtifactShowdownPage(runDir, records));
  process.stdout.write(`[2/2] Human comparison ready\n${path.join(runDir, "comparison.html")}\nRUN_DIR=${runDir}\nCompleted: ${records.filter((record) => record.status === "complete").length}/${records.length}\nTotal estimated cost: $${totalEstimatedCostUsd.toFixed(3)}\n`);
}

async function resumeFrozenArtifactOpenAiPhase(): Promise<void> {
  if (!RUN_DIR) throw new Error("SUNNY_FRACTIONS_RUN_required");
  const runDir = RUN_DIR;
  const runFile = path.join(runDir, "run.json");
  const promptFile = path.join(runDir, "implementation-prompt.txt");
  const artifactFile = path.join(runDir, "design-artifact.json");
  if (!fs.existsSync(runFile) || !fs.existsSync(promptFile) || !fs.existsSync(artifactFile)) {
    throw new Error(`frozen_showdown_files_missing:${runDir}`);
  }
  const summary = readJson<{ records: CandidateRecord[] }>(runFile);
  const prompt = fs.readFileSync(promptFile, "utf8");
  const artifactHash = hash(fs.readFileSync(artifactFile, "utf8"));
  const builders = ["gpt-5-5", "gpt-5-6-sol"]
    .map((id) => CANDIDATES.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is CandidateConfig =>
      Boolean(candidate) && summary.records.find((record) => record.id === candidate?.id)?.status !== "complete",
    );

  process.stdout.write(`[1/2] Resuming ${builders.map((builder) => builder.label).join(" and ")} only\n`);
  const replacements = await Promise.all(builders.map((builder) => generateCandidate(builder, prompt, artifactHash, runDir)));
  const replacementById = new Map(replacements.map((record) => [record.id, record]));
  const records = summary.records.map((record) => replacementById.get(record.id) || record);
  const totalEstimatedCostUsd = records.reduce((sum, record) => sum + record.estimatedCostUsd, 0);
  writeJson(runFile, {
    ...summary,
    status: "human_review",
    modelCalls: records.length,
    totalEstimatedCostUsd,
    records,
  });
  write(path.join(runDir, "comparison.html"), frozenArtifactShowdownPage(runDir, records));
  process.stdout.write(`[2/2] Updated human comparison ready\n${path.join(runDir, "comparison.html")}\nCompleted: ${records.filter((record) => record.status === "complete").length}/${records.length}\nTotal estimated cost: $${totalEstimatedCostUsd.toFixed(3)}\n`);
}

type FrozenQualityReview = {
  candidateId: string;
  strongestQuality: string;
  functionalIssues: string[];
  usabilityIssues: string[];
  visualIssues: string[];
  artifactFidelityIssues: string[];
  repairBrief: string;
};

type CreativeRoiDecision = {
  mode: "refine" | "pivot";
  verdict: string;
  strongestExistingQuality: string;
  largestCreativeFailure: string;
  creativeDirection: {
    title: string;
    openingPromise: string;
    coreLoop: string;
    mathAsPower: string;
    stakes: string;
    consequenceAndRecovery: string;
    progression: string[];
    worldReaction: string;
    payoff: string;
    replay: string;
    visualAndSoundDirection: string;
  };
  opusBuilderBrief: string;
};

function frozenQualityPrompt(runDir: string, records: CandidateRecord[]): Array<Record<string, unknown>> {
  const artifact = fs.readFileSync(path.join(runDir, "design-artifact.json"), "utf8");
  const content: Array<Record<string, unknown>> = [{
    type: "text",
    text: `You are performing one bounded implementation-quality review of five independent implementations of the same frozen learning-experience artifact.

Review each candidate independently. Judge functionality, first-action clarity, visual hierarchy, viewport/layout defects, touch affordances, mathematical interaction, visible world reaction, progression/payoff, and fidelity to the frozen artifact.

Do not redesign the artifact, change its academic responsibility, invent new mechanics, or copy features between candidates. Do not rank candidates. Give each implementation one self-contained repair brief that its original builder can apply once. Limit each issue list to two concise, evidence-based items and each repair brief to 120 words.

FROZEN ARTIFACT:
${artifact}

Return JSON only:
{
  "reviews": [
    {
      "candidateId": "",
      "strongestQuality": "",
      "functionalIssues": [],
      "usabilityIssues": [],
      "visualIssues": [],
      "artifactFidelityIssues": [],
      "repairBrief": ""
    }
  ],
  "crossCandidateObservation": ""
}`,
  }];
  for (const record of records) {
    const candidateDir = path.join(runDir, "candidates", record.id);
    const evidenceDir = path.join(runDir, "quality-repair", "evidence");
    content.push({
      type: "text",
      text: `CANDIDATE ${record.id} (${record.model})
ORIGINAL HTML:
${fs.readFileSync(path.join(candidateDir, "experience.html"), "utf8")}

FIRST-PLAY DOM TRACE:
${fs.readFileSync(path.join(evidenceDir, `${record.id}-play-dom.txt`), "utf8")}

OPENING SCREENSHOT:`,
    });
    content.push(imageBlock(path.join(evidenceDir, `${record.id}-opening.png`)));
    content.push({ type: "text", text: "FIRST-PLAY SCREENSHOT:" });
    content.push(imageBlock(path.join(evidenceDir, `${record.id}-play.png`)));
  }
  return content;
}

function frozenQualityComparisonPage(
  runDir: string,
  originals: CandidateRecord[],
  repairs: CandidateRecord[],
  reviews: FrozenQualityReview[],
): string {
  const repairById = new Map(repairs.map((record) => [record.id, record]));
  const reviewById = new Map(reviews.map((review) => [review.candidateId, review]));
  const sections = originals.map((original) => {
    const repair = repairById.get(original.id);
    const review = reviewById.get(original.id);
    const originalHref = `./candidates/${original.id}/experience.html`;
    const repairHref = `./quality-repair/candidates/${original.id}/experience.html`;
    const repairedView = repair?.status === "complete"
      ? `<div><h3>Repaired · $${repair.estimatedCostUsd.toFixed(3)} · ${(repair.elapsedMs / 1000).toFixed(1)}s</h3><iframe src="${repairHref}" title="${escapeHtml(original.label)} repaired" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe><a href="${repairHref}" target="_blank">Open repaired full size ↗</a></div>`
      : `<div><h3>Repair failed</h3><p class="failure">${escapeHtml(repair?.error || "No repair generated")}</p></div>`;
    return `<section class="model"><header><h2>${escapeHtml(original.label)}</h2><p>Original $${original.estimatedCostUsd.toFixed(3)} + repair $${(repair?.estimatedCostUsd || 0).toFixed(3)}</p></header><div class="pair"><div><h3>Original</h3><iframe src="${originalHref}" title="${escapeHtml(original.label)} original" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe><a href="${originalHref}" target="_blank">Open original full size ↗</a></div>${repairedView}</div><details><summary>Fable review</summary><pre>${escapeHtml(JSON.stringify(review, null, 2))}</pre></details><textarea placeholder="Did the repair materially improve this model?"></textarea></section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frozen Artifact Quality Repair</title><style>
*{box-sizing:border-box}body{margin:0;background:#080c18;color:#f5f1e6;font:16px system-ui;padding:26px}h1{text-align:center;font-size:42px;margin:0}.lede{text-align:center;color:#acb9d4;margin:8px 0 28px}.model{max-width:1600px;margin:0 auto 28px;background:#151c30;border:1px solid #34405f;border-radius:20px;overflow:hidden}.model header{padding:16px 20px}.model h2{margin:0}.model header p{margin:5px 0 0;color:#acb9d4}.pair{display:grid;grid-template-columns:1fr 1fr;gap:2px;background:#34405f}.pair>div{background:#101629;padding:12px}.pair h3{margin:0 0 8px}.pair iframe{display:block;width:100%;aspect-ratio:1365/768;border:0;background:#fff}.pair a{display:inline-block;margin-top:8px;color:#7edbff;font-weight:800}details{padding:15px 20px}pre{white-space:pre-wrap;color:#cad4e8}.model>textarea{display:block;width:calc(100% - 40px);min-height:80px;margin:0 20px 20px;background:#080c18;color:#fff;border:1px solid #455372;border-radius:10px;padding:10px}.failure{color:#ffabb5}@media(max-width:1000px){.pair{grid-template-columns:1fr}}
</style></head><body><h1>Original vs One Quality Repair</h1><p class="lede">One frozen Fable artifact · one Fable critic · each original model repairs its own implementation once.</p>${sections}</body></html>`;
}

async function frozenArtifactQualityRepairPhase(): Promise<void> {
  if (!RUN_DIR) throw new Error("SUNNY_FRACTIONS_RUN_required");
  const runDir = RUN_DIR;
  const summary = readJson<{ records: CandidateRecord[] }>(path.join(runDir, "run.json"));
  const originals = summary.records.filter((record) => record.status === "complete");
  if (originals.length !== 5) throw new Error("quality_repair_requires_five_complete_originals");

  process.stdout.write("[1/3] Fable reviewing all five originals once\n");
  const critic = CANDIDATES.find((candidate) => candidate.id === "fable-5")!;
  const criticStarted = Date.now();
  const criticResponse = await callAnthropic(critic, frozenQualityPrompt(runDir, originals), 24_000, TIMEOUT_MS, "high");
  const qualityRoot = path.join(runDir, "quality-repair");
  write(path.join(qualityRoot, "harness-raw-response.txt"), criticResponse.raw);
  const decision = extractJson<{ reviews: FrozenQualityReview[]; crossCandidateObservation?: string }>(criticResponse.raw);
  if (!Array.isArray(decision.reviews) || decision.reviews.length !== 5) throw new Error("quality_repair_requires_five_reviews");
  writeJson(path.join(qualityRoot, "harness.json"), decision);

  process.stdout.write("[2/3] Each original model applying its own repair once in parallel\n");
  const repairs = await Promise.all(originals.map(async (original): Promise<CandidateRecord> => {
    const config = CANDIDATES.find((candidate) => candidate.id === original.id)!;
    const review = decision.reviews.find((item) => item.candidateId === original.id);
    const candidateDir = path.join(qualityRoot, "candidates", original.id);
    const existingHtml = fs.readFileSync(path.join(runDir, "candidates", original.id, "experience.html"), "utf8");
    const artifact = fs.readFileSync(path.join(runDir, "design-artifact.json"), "utf8");
    const prompt = `Repair your implementation exactly once using the bounded review below.

The frozen artifact is authoritative. Preserve its academic responsibility, premise, core interaction, math-as-power relationship, stakes, recovery, progression, and payoff. Correct only the cited functionality, usability, visual/layout, touch-affordance, and artifact-fidelity defects. Do not copy another candidate, add a new mechanic, or redesign the experience.

Return one complete standalone HTML document with inline CSS and JavaScript that works with touch or mouse inside a 1365×768 iframe. Keep the complete HTML under 24,000 characters. Return raw HTML only.

FROZEN ARTIFACT:
${artifact}

FABLE QUALITY REVIEW:
${JSON.stringify(review, null, 2)}

YOUR ORIGINAL HTML:
${existingHtml}`;
    write(path.join(candidateDir, "prompt.txt"), prompt);
    const started = Date.now();
    let result: { raw: string; inputTokens: number; outputTokens: number } | null = null;
    try {
      result = await callModel(config, prompt);
      write(path.join(candidateDir, "raw-response.txt"), result.raw);
      const extracted = extractHtml(result.raw);
      write(path.join(candidateDir, "experience.html"), extracted.html);
      const htmlHash = hash(extracted.html);
      const record: CandidateRecord = {
        id: original.id,
        label: original.label,
        provider: config.provider,
        model: config.model,
        status: "complete",
        elapsedMs: Date.now() - started,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: (result.inputTokens * config.inputRate + result.outputTokens * config.outputRate) / 1_000_000,
        artifactHash: original.artifactHash,
        promptHash: hash(prompt),
        apiResponseHash: hash(result.raw),
        savedHtmlHash: htmlHash,
        iframeSrcDocHash: htmlHash,
        extractionMode: extracted.mode,
        error: null,
      };
      writeJson(path.join(candidateDir, "generation.json"), record);
      return record;
    } catch (error) {
      const record: CandidateRecord = {
        ...original,
        status: "failed",
        elapsedMs: Date.now() - started,
        inputTokens: result?.inputTokens || 0,
        outputTokens: result?.outputTokens || 0,
        estimatedCostUsd: result
          ? (result.inputTokens * config.inputRate + result.outputTokens * config.outputRate) / 1_000_000
          : 0,
        promptHash: hash(prompt),
        apiResponseHash: result ? hash(result.raw) : null,
        savedHtmlHash: null,
        iframeSrcDocHash: null,
        extractionMode: null,
        error: error instanceof Error ? error.message : String(error),
      };
      writeJson(path.join(candidateDir, "generation.json"), record);
      return record;
    }
  }));

  const criticCost = (criticResponse.inputTokens * critic.inputRate + criticResponse.outputTokens * critic.outputRate) / 1_000_000;
  const repairCost = repairs.reduce((sum, record) => sum + record.estimatedCostUsd, 0);
  writeJson(path.join(qualityRoot, "run.json"), {
    status: "human_review",
    critic: {
      model: critic.model,
      elapsedMs: Date.now() - criticStarted,
      inputTokens: criticResponse.inputTokens,
      outputTokens: criticResponse.outputTokens,
      estimatedCostUsd: criticCost,
    },
    repairs,
    criticCostUsd: criticCost,
    repairCostUsd: repairCost,
    incrementalCostUsd: criticCost + repairCost,
    originalGenerationCostUsd: summary.records.reduce((sum, record) => sum + record.estimatedCostUsd, 0),
  });
  write(path.join(runDir, "quality-comparison.html"), frozenQualityComparisonPage(runDir, originals, repairs, decision.reviews));
  process.stdout.write(`[3/3] Original-versus-repair comparison ready\n${path.join(runDir, "quality-comparison.html")}\nRepairs complete: ${repairs.filter((record) => record.status === "complete").length}/${repairs.length}\nIncremental cost: $${(criticCost + repairCost).toFixed(3)}\n`);
}

function creativeRoiComparisonPage(
  original: CandidateRecord,
  rebuilt: CandidateRecord,
  decision: CreativeRoiDecision,
  criticCostUsd: number,
  totalCostUsd: number,
  designerLabel = "Fable",
): string {
  const rebuiltView = rebuilt.status === "complete"
    ? `<iframe src="./rebuilt/experience.html" title="Fable-directed Opus rebuild" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe><a href="./rebuilt/experience.html" target="_blank">Open rebuild full size ↗</a>`
    : `<pre class="failure">${escapeHtml(rebuilt.error || "Rebuild failed")}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Full-Authority Creative ROI</title><style>
*{box-sizing:border-box}body{margin:0;background:#080c18;color:#f5f1e6;font:16px system-ui;padding:26px}h1{text-align:center;font-size:42px;margin:0}.lede{text-align:center;color:#acb9d4;margin:8px 0 26px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:1600px;margin:auto}.candidate,.decision{background:#151c30;border:1px solid #34405f;border-radius:20px;overflow:hidden}.candidate header{padding:15px 18px}.candidate h2{margin:0 0 5px}.candidate p{margin:0;color:#acb9d4}.candidate iframe{display:block;width:100%;aspect-ratio:1365/768;border:0;background:#fff}.candidate a{display:inline-block;margin:10px 16px 15px;color:#7edbff;font-weight:800}.decision{max-width:1600px;margin:20px auto 0;padding:20px}.decision pre{white-space:pre-wrap;color:#cad4e8}.score{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:18px}.score textarea{min-height:100px;background:#080c18;color:#fff;border:1px solid #455372;border-radius:10px;padding:10px}.failure{padding:25px;color:#ffabb5}@media(max-width:1000px){.pair{grid-template-columns:1fr}}
</style></head><body><h1>Full-Authority Creative ROI</h1><p class="lede">Original Opus implementation vs one ${escapeHtml(designerLabel)}-directed Opus rebuild · ${escapeHtml(designerLabel)} chose ${escapeHtml(decision.mode)} · incremental cost $${totalCostUsd.toFixed(3)} (designer $${criticCostUsd.toFixed(3)})</p><main class="pair"><section class="candidate"><header><h2>Original Opus</h2><p>$${original.estimatedCostUsd.toFixed(3)} · frozen-artifact implementation</p></header><iframe src="../candidates/opus-5/experience.html" title="Original Opus" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe><a href="../candidates/opus-5/experience.html" target="_blank">Open original full size ↗</a></section><section class="candidate"><header><h2>${escapeHtml(designerLabel)} → Opus Rebuild</h2><p>$${rebuilt.estimatedCostUsd.toFixed(3)} · unrestricted creative direction</p></header>${rebuiltView}</section></main><section class="decision"><details open><summary>${escapeHtml(designerLabel)} creative decision</summary><pre>${escapeHtml(JSON.stringify(decision, null, 2))}</pre></details><div class="score"><textarea placeholder="Which experience is clearer and why?"></textarea><textarea placeholder="Is the rebuild materially more engaging—not merely prettier?"></textarea></div></section></body></html>`;
}

function creativeProfileComparisonPage(
  original: CandidateRecord,
  noProfileRun: {
    decision: CreativeRoiDecision;
    rebuilt: CandidateRecord;
    incrementalCostUsd: number;
  },
  profileRun: {
    decision: CreativeRoiDecision;
    rebuilt: CandidateRecord;
    incrementalCostUsd: number;
  },
): string {
  const cards = [
    {
      title: "Original Opus",
      subtitle: `$${original.estimatedCostUsd.toFixed(3)} · frozen Cargo Code artifact`,
      href: "./candidates/opus-5/experience.html",
    },
    {
      title: "Fable → Opus · No Profile",
      subtitle: `$${noProfileRun.incrementalCostUsd.toFixed(3)} · ${noProfileRun.decision.mode} · ${noProfileRun.decision.creativeDirection.title}`,
      href: "./creative-roi/rebuilt/experience.html",
    },
    {
      title: "Fable → Opus · Factual Profile",
      subtitle: `$${profileRun.incrementalCostUsd.toFixed(3)} · ${profileRun.decision.mode} · ${profileRun.decision.creativeDirection.title}`,
      href: "./creative-roi-profile/rebuilt/experience.html",
    },
  ].map((card) => `<article><header><h2>${escapeHtml(card.title)}</h2><p>${escapeHtml(card.subtitle)}</p></header><iframe src="${card.href}" title="${escapeHtml(card.title)}" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe><a href="${card.href}" target="_blank">Open full size ↗</a><textarea placeholder="What changed, if anything?"></textarea></article>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Child Context Isolation Test</title><style>
*{box-sizing:border-box}body{margin:0;background:#080c18;color:#f5f1e6;font:16px system-ui;padding:24px}h1{text-align:center;font-size:42px;margin:0}.lede{text-align:center;color:#acb9d4;margin:8px 0 26px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;max-width:1900px;margin:auto}article{background:#151c30;border:1px solid #34405f;border-radius:18px;overflow:hidden}header{padding:14px 16px}h2{font-size:21px;margin:0 0 5px}p{font-size:13px;color:#acb9d4;margin:0}iframe{display:block;width:100%;aspect-ratio:1365/768;border:0;background:#fff}a{display:inline-block;margin:10px 14px;color:#7edbff;font-weight:800}textarea{display:block;width:calc(100% - 28px);min-height:90px;margin:0 14px 14px;background:#080c18;color:#fff;border:1px solid #455372;border-radius:10px;padding:10px}.details{max-width:1900px;margin:20px auto 0;background:#151c30;border:1px solid #34405f;border-radius:18px;padding:18px}.details pre{white-space:pre-wrap;color:#cad4e8}@media(max-width:1100px){.grid{grid-template-columns:1fr}}
</style></head><body><h1>Does Child Context Improve the Design?</h1><p class="lede">Same multiplication contract, Fable architect, Opus builder, budgets, and starting candidate. Only the factual Reina packet changed.</p><main class="grid">${cards}</main><section class="details"><details><summary>Profile-free Fable decision</summary><pre>${escapeHtml(JSON.stringify(noProfileRun.decision, null, 2))}</pre></details><details><summary>Profile-informed Fable decision</summary><pre>${escapeHtml(JSON.stringify(profileRun.decision, null, 2))}</pre></details></section></body></html>`;
}

function architectModelComparisonPage(
  fableRun: { decision: CreativeRoiDecision; incrementalCostUsd: number },
  opusRun: { decision: CreativeRoiDecision; incrementalCostUsd: number },
): string {
  const cards = [
    {
      title: "Fable → Opus",
      subtitle: `$${fableRun.incrementalCostUsd.toFixed(3)} · ${fableRun.decision.creativeDirection.title}`,
      href: "./creative-roi-profile/rebuilt/experience.html",
    },
    {
      title: "Opus → Opus",
      subtitle: `$${opusRun.incrementalCostUsd.toFixed(3)} · ${opusRun.decision.creativeDirection.title}`,
      href: "./creative-roi-profile-opus/rebuilt/experience.html",
    },
  ].map((card) => `<article><header><h2>${escapeHtml(card.title)}</h2><p>${escapeHtml(card.subtitle)}</p></header><iframe src="${card.href}" title="${escapeHtml(card.title)}" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe><a href="${card.href}" target="_blank">Open full size ↗</a><textarea placeholder="Clarity, engagement, stakes, math integration, and replay value"></textarea></article>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fable vs Opus Architect</title><style>
*{box-sizing:border-box}body{margin:0;background:#080c18;color:#f5f1e6;font:16px system-ui;padding:24px}h1{text-align:center;font-size:42px;margin:0}.lede{text-align:center;color:#acb9d4;margin:8px 0 26px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;max-width:1700px;margin:auto}article,.details{background:#151c30;border:1px solid #34405f;border-radius:18px;overflow:hidden}header{padding:14px 16px}h2{margin:0 0 5px}p{color:#acb9d4;margin:0}iframe{display:block;width:100%;aspect-ratio:1365/768;border:0;background:#fff}a{display:inline-block;margin:10px 14px;color:#7edbff;font-weight:800}textarea{display:block;width:calc(100% - 28px);min-height:90px;margin:0 14px 14px;background:#080c18;color:#fff;border:1px solid #455372;border-radius:10px;padding:10px}.details{max-width:1700px;margin:20px auto 0;padding:18px}.details pre{white-space:pre-wrap;color:#cad4e8}@media(max-width:1000px){.grid{grid-template-columns:1fr}}
</style></head><body><h1>Is Fable Worth the Architect Premium?</h1><p class="lede">Same multiplication contract, factual Reina packet, original candidate, Opus builder, and implementation budget. Only the architect model changed.</p><main class="grid">${cards}</main><section class="details"><details><summary>Fable design decision</summary><pre>${escapeHtml(JSON.stringify(fableRun.decision, null, 2))}</pre></details><details><summary>Opus design decision</summary><pre>${escapeHtml(JSON.stringify(opusRun.decision, null, 2))}</pre></details></section></body></html>`;
}

async function frozenArtifactCreativeRoiPhase(): Promise<void> {
  if (!RUN_DIR) throw new Error("SUNNY_FRACTIONS_RUN_required");
  const runDir = RUN_DIR;
  const profileMode = process.env.SUNNY_CREATIVE_PROFILE === "1";
  const designerId = process.env.SUNNY_CREATIVE_DESIGNER || "fable-5";
  const original = readJson<CandidateRecord>(path.join(runDir, "candidates", "opus-5", "generation.json"));
  if (original.status !== "complete") throw new Error("creative_roi_requires_complete_opus_original");
  const originalHtml = fs.readFileSync(path.join(runDir, "candidates", "opus-5", "experience.html"), "utf8");
  const outputName = designerId === "fable-5"
    ? (profileMode ? "creative-roi-profile" : "creative-roi")
    : `creative-roi${profileMode ? "-profile" : ""}-${designerId.replace(/-5$/, "")}`;
  const outputDir = path.join(runDir, outputName);
  const evidenceDir = path.join(runDir, "quality-repair", "evidence");
  const critic = CANDIDATES.find((candidate) => candidate.id === designerId);
  if (!critic || critic.provider !== "anthropic") throw new Error(`unsupported_creative_designer:${designerId}`);
  const academicContract = `Teach Grade 3 multiplication through fresh material:
- interpret multiplicative situations as number of equal groups and amount in each group;
- construct or read equal-group and array representations;
- connect the representation to a multiplication equation and product;
- increase mathematical independence and challenge over the experience.

The experience must remain mathematically correct, usable with touch or mouse in a 1365×768 iframe, and complete from opening through payoff. Everything else is creatively mutable.`;
  const factualProfileEvidence = profileMode
    ? `The following are limited factual observations about the child. They are evidence, not design instructions or durable preference conclusions:
- The child is currently nine years old.
- She independently chose wrestling competition and a state-championship loss as a conversation topic.
- She asked to continue difficult riddles across sessions and later explicitly requested harder riddles.
- She immediately noticed repeated riddles and questioned faulty riddle logic.
- When stuck on a multi-step logic problem, she requested hints and continued after scaffolding.
- Small-sample human/child feedback was positive for a randomized reveal spelling activity and a spoken-pronunciation activity.

Decide independently whether any observation is relevant. Do not copy a prior activity or infer that one observation defines the child.`
    : "No child-profile evidence is supplied in this condition.";
  write(path.join(outputDir, "profile-evidence.txt"), `${factualProfileEvidence}\n`);
  const criticPrompt: Array<Record<string, unknown>> = [{
    type: "text",
    text: `Act as a world-class creative director for one child learning experience, not as a software QA reviewer.

Your job is to decide whether the existing experience deserves refinement or whether its core creative direction should be replaced. You have full authority over the premise, world, game or non-game form, core interaction, stakes, consequences, recovery, pacing, progression, visual composition, sound, payoff, and replay structure.

Preserve only this academic contract:
${academicContract}

CHILD CONTEXT CONDITION:
${factualProfileEvidence}

Do not preserve Cargo Code, Vex, the harbor, dials, arrays-as-cargo, or any current mechanic merely because they already exist. Do not limit yourself to bug fixes. A polished but ordinary educational game is not success. Seek a coherent experience whose mathematical reasoning visibly powers the world and that a nine-year-old could understand quickly and want to continue.

Choose exactly:
- refine, only if the current core loop is genuinely strong enough to preserve;
- pivot, if a different core experience has greater potential.

Return JSON only:
{
  "mode": "refine or pivot",
  "verdict": "",
  "strongestExistingQuality": "",
  "largestCreativeFailure": "",
  "creativeDirection": {
    "title": "",
    "openingPromise": "",
    "coreLoop": "",
    "mathAsPower": "",
    "stakes": "",
    "consequenceAndRecovery": "",
    "progression": [],
    "worldReaction": "",
    "payoff": "",
    "replay": "",
    "visualAndSoundDirection": ""
  },
  "opusBuilderBrief": ""
}

EXISTING OPUS HTML:
${originalHtml}

OPENING SCREENSHOT:`,
  }];
  const opening = path.join(evidenceDir, "opus-5-opening.png");
  const play = path.join(evidenceDir, "opus-5-play.png");
  if (fs.existsSync(opening)) criticPrompt.push(imageBlock(opening));
  criticPrompt.push({ type: "text", text: "FIRST-PLAY SCREENSHOT:" });
  if (fs.existsSync(play)) criticPrompt.push(imageBlock(play));

  process.stdout.write(`[1/2] ${critic.label} choosing an unrestricted creative direction\n`);
  const criticStarted = Date.now();
  const criticResult = await callAnthropic(critic, criticPrompt, 12_000, TIMEOUT_MS, "high");
  write(path.join(outputDir, `${critic.id}-raw-response.txt`), criticResult.raw);
  const decision = extractJson<CreativeRoiDecision>(criticResult.raw);
  if (decision.mode !== "refine" && decision.mode !== "pivot") throw new Error("creative_roi_invalid_mode");
  writeJson(path.join(outputDir, `${critic.id}-decision.json`), decision);
  const criticElapsedMs = Date.now() - criticStarted;
  const criticCostUsd = (criticResult.inputTokens * critic.inputRate + criticResult.outputTokens * critic.outputRate) / 1_000_000;

  const builder = CANDIDATES.find((candidate) => candidate.id === "opus-5")!;
  const originalSection = decision.mode === "refine"
    ? `\nEXISTING HTML TO REFINE:\n${originalHtml}`
    : "\nThe previous HTML is intentionally withheld. Build the new direction from first principles.";
  const builderPrompt = `Build one exceptional standalone child learning experience from the creative direction below.

The creative direction is authoritative for the experience. Preserve only the academic contract and implement the direction as a coherent playable vertical slice—not a lesson menu, decorative quiz, or static mock.

ACADEMIC CONTRACT:
${academicContract}

${critic.label.toUpperCase()} CREATIVE DECISION:
${JSON.stringify(decision, null, 2)}
${originalSection}

You have full implementation freedom over HTML, CSS, JavaScript, SVG, Canvas, WebGL, audio, animation, and public HTTPS libraries or assets. Make the first action understandable, let mathematical reasoning visibly control success, and deliver a perceptible escalation and payoff.

Return one complete standalone HTML document that works with touch or mouse inside a 1365×768 iframe. Keep it under 32,000 characters. Return raw HTML only.`;
  write(path.join(outputDir, "opus-prompt.txt"), builderPrompt);
  process.stdout.write(`[2/2] Opus performing one ${decision.mode} rebuild\n`);
  const rebuilt = await generateCandidate(builder, builderPrompt, hash(academicContract), path.join(outputDir, "work"));
  const generatedDir = path.join(outputDir, "work", "candidates", "opus-5");
  const rebuiltDir = path.join(outputDir, "rebuilt");
  fs.mkdirSync(rebuiltDir, { recursive: true });
  for (const file of ["experience.html", "generation.json", "raw-response.txt", "prompt.txt"]) {
    const source = path.join(generatedDir, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(rebuiltDir, file));
  }
  const totalCostUsd = criticCostUsd + rebuilt.estimatedCostUsd;
  writeJson(path.join(outputDir, "run.json"), {
    status: "human_review",
    academicContract,
    original,
    decision,
    critic: {
      model: critic.model,
      elapsedMs: criticElapsedMs,
      inputTokens: criticResult.inputTokens,
      outputTokens: criticResult.outputTokens,
      estimatedCostUsd: criticCostUsd,
    },
    rebuilt,
    incrementalCostUsd: totalCostUsd,
  });
  write(path.join(outputDir, "comparison.html"), creativeRoiComparisonPage(
    original,
    rebuilt,
    decision,
    criticCostUsd,
    totalCostUsd,
    critic.label,
  ));
  if (profileMode && designerId === "fable-5" && fs.existsSync(path.join(runDir, "creative-roi", "run.json"))) {
    const noProfileRun = readJson<{
      decision: CreativeRoiDecision;
      rebuilt: CandidateRecord;
      incrementalCostUsd: number;
    }>(path.join(runDir, "creative-roi", "run.json"));
    write(path.join(runDir, "creative-profile-comparison.html"), creativeProfileComparisonPage(
      original,
      noProfileRun,
      { decision, rebuilt, incrementalCostUsd: totalCostUsd },
    ));
  }
  if (profileMode && designerId === "opus-5" && fs.existsSync(path.join(runDir, "creative-roi-profile", "run.json"))) {
    const fableRun = readJson<{
      decision: CreativeRoiDecision;
      incrementalCostUsd: number;
    }>(path.join(runDir, "creative-roi-profile", "run.json"));
    write(path.join(runDir, "architect-model-comparison.html"), architectModelComparisonPage(
      fableRun,
      { decision, incrementalCostUsd: totalCostUsd },
    ));
  }
  process.stdout.write(`Comparison ready\n${path.join(outputDir, "comparison.html")}\nMode: ${decision.mode}\nIncremental cost: $${totalCostUsd.toFixed(3)}\n`);
  if (profileMode) process.stdout.write(`Three-way comparison\n${path.join(runDir, "creative-profile-comparison.html")}\n`);
  if (profileMode && designerId === "opus-5") {
    process.stdout.write(`Architect comparison\n${path.join(runDir, "architect-model-comparison.html")}\n`);
  }
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY_missing");
  if (PHASE === "architect") return architectComparisonPhase();
  if (PHASE === "architect-quality") return architectQualityPhase();
  if (PHASE === "fable-self-build") return fableSelfBuildPhase();
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY_missing");
  if (PHASE === "frozen-artifact-showdown") return frozenArtifactShowdownPhase();
  if (PHASE === "frozen-artifact-resume-openai") return resumeFrozenArtifactOpenAiPhase();
  if (PHASE === "frozen-artifact-quality-repair") return frozenArtifactQualityRepairPhase();
  if (PHASE === "frozen-artifact-creative-roi") return frozenArtifactCreativeRoiPhase();
  if (PHASE === "generate") return generatePhase();
  if (PHASE === "review") return reviewPhase();
  if (PHASE === "render") return renderPhase();
  throw new Error(`unknown_phase:${PHASE}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
