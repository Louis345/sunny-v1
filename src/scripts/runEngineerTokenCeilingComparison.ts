import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { copyHistoricalBenchmark, validateExperienceIsolation } from "./runPlannerPersonaComparison";

type CeilingResult = {
  stopReason: string;
  htmlClosed: boolean;
  outputTokens: number;
  inputTokens?: number;
  costUsd?: number;
  elapsedMs?: number;
  htmlChars?: number;
  error?: string;
};

type BudgetRecord = { status: "complete" | "failed"; costUsd: number };

const MODEL = "claude-opus-5";
const HISTORICAL_SOURCE = "outputs/math-release-confidence-live/2026-08-08T16-02-39.895Z/quest";
const FROZEN_RUN = "outputs/planner-persona-comparison/2026-08-08T22-48-56.622Z";
const MAX_CALLS = 2;
const MAX_COST_USD = 5;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]!));
}

export function frozenPacketHash(packet: { curriculum: unknown; design: unknown }): string {
  return sha256(stable(packet));
}

export function buildCeilingRequest(input: { prompt: string; packetHash: string; maxTokens: 52_000 | 78_000 }): Record<string, any> {
  return {
    model: MODEL,
    max_tokens: input.maxTokens,
    messages: [{
      role: "user",
      content: `${input.prompt}\n\nFrozen comparison packet hash: ${input.packetHash}. Implement this exact packet without redesigning it.`,
    }],
  };
}

export class EngineerCeilingBudget {
  private readonly records: BudgetRecord[] = [];
  constructor(private readonly limits: { maxCalls: number; maxCostUsd: number }) {}
  record(record: BudgetRecord): void { this.records.push(record); }
  snapshot(): { attempts: number; spentUsd: number; failedAttempts: number } {
    return {
      attempts: this.records.length,
      spentUsd: Number(this.records.reduce((sum, item) => sum + item.costUsd, 0).toFixed(8)),
      failedAttempts: this.records.filter((item) => item.status === "failed").length,
    };
  }
  canStart(maximumPossibleCostUsd: number): { allowed: true } | { allowed: false; reason: "call_ceiling_reached" | "cost_ceiling_would_be_exceeded" } {
    if (this.records.length >= this.limits.maxCalls) return { allowed: false, reason: "call_ceiling_reached" };
    if (this.snapshot().spentUsd + maximumPossibleCostUsd > this.limits.maxCostUsd) return { allowed: false, reason: "cost_ceiling_would_be_exceeded" };
    return { allowed: true };
  }
}

export function evaluateCeilingRun(input: {
  historicalPlayable: boolean;
  prior26k: CeilingResult;
  doubled52k: CeilingResult;
  tripled78k: CeilingResult;
  costUsd: number;
}): { status: "READY_FOR_HUMAN_REVIEW" | "INCOMPLETE"; bottleneck: string; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.historicalPlayable) reasons.push("historical_control_missing");
  if (!input.doubled52k.htmlClosed) reasons.push("52k_html_incomplete");
  if (!input.tripled78k.htmlClosed) reasons.push("78k_html_incomplete");
  if (input.costUsd > MAX_COST_USD) reasons.push("cost_ceiling_exceeded");
  let bottleneck = "not_token_budget";
  if (input.doubled52k.htmlClosed && input.doubled52k.outputTokens < 52_000) bottleneck = "resolved_below_52k";
  else if (!input.doubled52k.htmlClosed && input.tripled78k.htmlClosed) bottleneck = "between_52k_and_78k";
  else if (!input.tripled78k.htmlClosed) bottleneck = "implementation_exceeds_78k_or_prompt_bloat";
  return { status: reasons.length === 0 ? "READY_FOR_HUMAN_REVIEW" : "INCOMPLETE", bottleneck, reasons };
}

export function renderCeilingReport(input: {
  historicalPath: string;
  doubledPath: string;
  tripledPath: string;
  summary: Record<string, any>;
}): string {
  const metrics = input.summary.results ?? {};
  const cards = [
    { label: "Historical production", path: input.historicalPath, result: metrics.historical ?? {} },
    { label: "Rowan · 52K ceiling", path: input.doubledPath, result: metrics.doubled52k ?? {} },
    { label: "Rowan · 78K ceiling", path: input.tripledPath, result: metrics.tripled78k ?? {} },
  ].map((candidate) => `<article><h2>${escapeHtml(candidate.label)}</h2><div class="meta">${Number(candidate.result.outputTokens ?? 0).toLocaleString()} output tokens · $${Number(candidate.result.costUsd ?? 0).toFixed(3)} · ${escapeHtml(candidate.result.stopReason ?? "historical")}</div><iframe src="${escapeHtml(candidate.path)}" title="${escapeHtml(candidate.label)}"></iframe><label>First action<input type="range" min="1" max="5" value="3"><output>3</output></label><label>Visual quality<input type="range" min="1" max="5" value="3"><output>3</output></label><label>Interaction depth<input type="range" min="1" max="5" value="3"><output>3</output></label><label>Would a child continue?<textarea></textarea></label></article>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rowan token ceiling comparison</title><style>:root{font-family:Inter,system-ui;color:#18213a;background:#eef2f9}*{box-sizing:border-box}body{margin:0}.hero{padding:32px;background:linear-gradient(135deg,#151f45,#6740a0);color:white}.hero p{max-width:950px}.wrap{max-width:1800px;margin:auto;padding:20px}.verdict,.diagnostic{background:white;border-radius:18px;padding:18px;margin:16px 0;box-shadow:0 8px 25px #1b28521a}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}article{background:white;border-radius:18px;padding:14px}iframe{width:100%;height:540px;border:2px solid #cbd4e8;border-radius:12px;background:white}.meta{font-size:13px;color:#59637b;margin-bottom:9px}label{display:block;font-weight:700;margin:10px 0}input{width:65%;margin:0 8px}textarea{display:block;width:100%;min-height:60px}.diagnostic{border-left:6px solid #e49b20}pre{white-space:pre-wrap;word-break:break-word}@media(max-width:1200px){.grid{grid-template-columns:1fr}iframe{height:720px}}</style></head><body><header class="hero"><h1>How much output room does a complete Rowan experience need?</h1><p>Same frozen Theo curriculum, same Juniper design, same Rowan prompt. Only the output ceiling changes. Historical production is the quality baseline.</p></header><main class="wrap"><section class="verdict"><h2>${escapeHtml(input.summary.status ?? "PENDING")}</h2><p><b>Bottleneck:</b> ${escapeHtml(input.summary.bottleneck ?? "pending")}</p><p><b>New spend:</b> $${Number(input.summary.costUsd ?? 0).toFixed(3)} / $${MAX_COST_USD.toFixed(2)}</p></section><section class="diagnostic"><h2>26K diagnostic</h2><p>The earlier Rowan response stopped at max_tokens before completing its CSS and JavaScript. It is preserved as failure evidence, not presented as a playable candidate.</p><pre>${escapeHtml(JSON.stringify(metrics.prior26k ?? {}, null, 2))}</pre></section><section class="grid">${cards}</section></main><script>document.querySelectorAll('input[type=range]').forEach(i=>i.addEventListener('input',()=>i.nextElementSibling.value=i.value))</script></body></html>`;
}

function estimateOpusCost(inputTokens: number, outputTokens: number): number {
  return inputTokens / 1_000_000 * 5 + outputTokens / 1_000_000 * 25;
}

function extractText(response: any): string {
  return (response?.content ?? []).filter((block: any) => block?.type === "text").map((block: any) => block.text).join("\n").trim();
}

function extractClosedHtml(text: string): string | null {
  const match = text.match(/<!doctype html[\s\S]*<\/html>/i) ?? text.match(/<html[\s\S]*<\/html>/i);
  return match?.[0] ?? null;
}

async function runCall(input: {
  client: Anthropic;
  budget: EngineerCeilingBudget;
  outputDir: string;
  prompt: string;
  packetHash: string;
  maxTokens: 52_000 | 78_000;
  reserveUsd: number;
}): Promise<CeilingResult> {
  const allowed = input.budget.canStart(input.reserveUsd);
  if (!allowed.allowed) return { stopReason: allowed.reason, htmlClosed: false, outputTokens: 0, error: allowed.reason };
  const label = `${Math.round(input.maxTokens / 1_000)}k`;
  const dir = path.join(input.outputDir, label);
  fs.mkdirSync(dir, { recursive: true });
  const request = buildCeilingRequest({ prompt: input.prompt, packetHash: input.packetHash, maxTokens: input.maxTokens });
  writeJson(path.join(dir, "request.json"), request);
  const started = Date.now();
  try {
    console.log(` 🎮 [engineer-ceiling] [${label}] [running] max_tokens=${input.maxTokens}`);
    const response = await input.client.messages.stream(request as any).finalMessage();
    writeJson(path.join(dir, "response.json"), response);
    const inputTokens = Number(response?.usage?.input_tokens ?? 0);
    const outputTokens = Number(response?.usage?.output_tokens ?? 0);
    const costUsd = estimateOpusCost(inputTokens, outputTokens);
    input.budget.record({ status: "complete", costUsd });
    const text = extractText(response);
    fs.writeFileSync(path.join(dir, "raw-text.txt"), text, "utf8");
    const html = extractClosedHtml(text);
    const result: CeilingResult = { stopReason: String(response?.stop_reason ?? "unknown"), htmlClosed: Boolean(html), inputTokens, outputTokens, costUsd, elapsedMs: Date.now() - started, htmlChars: html?.length ?? 0 };
    if (html) {
      const isolation = validateExperienceIsolation(html);
      if (!isolation.valid) {
        result.htmlClosed = false;
        result.error = `isolation_violation:${isolation.violations.join(",")}`;
      } else {
        fs.writeFileSync(path.join(dir, "experience.html"), html, "utf8");
      }
    } else result.error = "closed_html_missing";
    writeJson(path.join(dir, "result.json"), result);
    console.log(` 🎮 [engineer-ceiling] [${label}] [${result.htmlClosed ? "saved" : "incomplete"}] stop=${result.stopReason} output=${outputTokens} cost=$${costUsd.toFixed(3)}`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.budget.record({ status: "failed", costUsd: 0 });
    const result: CeilingResult = { stopReason: "provider_failure", htmlClosed: false, outputTokens: 0, elapsedMs: Date.now() - started, error: message };
    writeJson(path.join(dir, "result.json"), result);
    console.log(` 🎮 [engineer-ceiling] [${label}] [failed] reason=${message}`);
    return result;
  }
}

function prior26kResult(repoRoot: string): CeilingResult {
  const audit = path.join(repoRoot, FROZEN_RUN, "audit");
  const responseFile = fs.readdirSync(audit).find((file) => file.includes("experience_engineer-personality-response"));
  if (!responseFile) throw new Error("prior_26k_response_missing");
  const response = JSON.parse(fs.readFileSync(path.join(audit, responseFile), "utf8"));
  const text = extractText(response);
  return {
    stopReason: String(response.stop_reason ?? "unknown"),
    htmlClosed: Boolean(extractClosedHtml(text)),
    inputTokens: Number(response.usage?.input_tokens ?? 0),
    outputTokens: Number(response.usage?.output_tokens ?? 0),
    costUsd: estimateOpusCost(Number(response.usage?.input_tokens ?? 0), Number(response.usage?.output_tokens ?? 0)),
    htmlChars: text.length,
  };
}

export async function runEngineerTokenCeilingComparison(input: { repoRoot: string; outputDir?: string }): Promise<{ outputDir: string; reportPath: string; summary: Record<string, any> }> {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const outputDir = input.outputDir ?? path.join(input.repoRoot, "outputs/engineer-token-ceiling-comparison", stamp);
  fs.mkdirSync(outputDir, { recursive: true });
  const frozenRoot = path.join(input.repoRoot, FROZEN_RUN, "personality");
  const curriculum = JSON.parse(fs.readFileSync(path.join(frozenRoot, "curriculum-packet.json"), "utf8"));
  const design = JSON.parse(fs.readFileSync(path.join(frozenRoot, "design-artifact.json"), "utf8"));
  const promptPacket = JSON.parse(fs.readFileSync(path.join(frozenRoot, "experience_engineer-prompt.json"), "utf8"));
  const prompt = String(promptPacket.request);
  const packetHash = frozenPacketHash({ curriculum, design });
  const frozenDir = path.join(outputDir, "frozen-input");
  writeJson(path.join(frozenDir, "curriculum-packet.json"), curriculum);
  writeJson(path.join(frozenDir, "design-artifact.json"), design);
  fs.writeFileSync(path.join(frozenDir, "engineer-prompt.txt"), prompt, "utf8");
  writeJson(path.join(frozenDir, "hashes.json"), { packetHash, promptHash: sha256(prompt) });
  copyHistoricalBenchmark(path.join(input.repoRoot, HISTORICAL_SOURCE), path.join(outputDir, "historical"));

  const budget = new EngineerCeilingBudget({ maxCalls: MAX_CALLS, maxCostUsd: MAX_COST_USD });
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const doubled52k = await runCall({ client, budget, outputDir, prompt, packetHash, maxTokens: 52_000, reserveUsd: 1.6 });
  const tripled78k = await runCall({ client, budget, outputDir, prompt, packetHash, maxTokens: 78_000, reserveUsd: 2.3 });
  const prior26k = prior26kResult(input.repoRoot);
  const evaluation = evaluateCeilingRun({ historicalPlayable: true, prior26k, doubled52k, tripled78k, costUsd: budget.snapshot().spentUsd });
  const summary = {
    ...evaluation,
    costUsd: budget.snapshot().spentUsd,
    budget: { ...budget.snapshot(), maxCalls: MAX_CALLS, maxCostUsd: MAX_COST_USD },
    frozen: { packetHash, promptHash: sha256(prompt), sourceRun: FROZEN_RUN },
    results: { historical: { stopReason: "historical", outputTokens: 20_847, costUsd: 0.59665 }, prior26k, doubled52k, tripled78k },
    note: "Output ceilings are maximums, not required usage. Human judgment decides whether additional room created meaningful quality.",
  };
  writeJson(path.join(outputDir, "summary.json"), summary);
  const reportPath = path.join(outputDir, "report.html");
  fs.writeFileSync(reportPath, renderCeilingReport({ historicalPath: "historical/experience.html", doubledPath: "52k/experience.html", tripledPath: "78k/experience.html", summary }), "utf8");
  console.log(` 🎮 [engineer-ceiling] [complete] status=${summary.status} bottleneck=${summary.bottleneck} cost=$${summary.costUsd.toFixed(3)} report=${reportPath}`);
  return { outputDir, reportPath, summary };
}

if (process.argv[1]?.endsWith("runEngineerTokenCeilingComparison.ts")) {
  runEngineerTokenCeilingComparison({ repoRoot: process.cwd(), outputDir: process.env.SUNNY_ENGINEER_CEILING_OUTPUT })
    .then((result) => { if (result.summary.status === "INCOMPLETE") process.exitCode = 1; })
    .catch((error) => {
      console.error(` 🎮 [engineer-ceiling] [fatal] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
