import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Review = {
  score: number;
  childFeedback: string[];
  adultObservation: string;
};

type RevisionPromptInput = {
  curriculum: unknown;
  design: unknown;
  originalHtml: string;
  curriculumHash: string;
  designHash: string;
  htmlHash: string;
  feedback: Review;
};

type ReportInput = {
  feedback: Review;
  originalHash: string;
  revisedHash: string;
  designHash: string;
  curriculumHash: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
};

const MODEL = "claude-opus-5";
const MAX_TOKENS = 78_000;

function hash(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;",
  }[character]!));
}

function extractHtml(response: Anthropic.Messages.Message): string {
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.type === "text" ? block.text : "")
    .join("\n");
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const match = fenced.match(/<!doctype html[\s\S]*<\/html>/i) ?? fenced.match(/<html[\s\S]*<\/html>/i);
  if (!match) throw new Error("candidate_c_revision_complete_html_missing");
  return match[0].trim();
}

export function buildCandidateCRevisionPrompt(input: RevisionPromptInput): string {
  return `You are Rowan, Sunny's Experience Engineer. Revise one already successful child-facing implementation using factual human review.

Revise implementation only. Do not change the academic packet, its questions, answers, scope, progression, or difficulty. Do not redesign the approved experience identity, world, visible example, or successful design qualities. Do not hardcode a universal replacement interaction; choose the most natural implementation correction for this frozen artifact.

The child gave this experience ${input.feedback.score}/10.
Child feedback:
${input.feedback.childFeedback.map((line) => `- ${line}`).join("\n")}
Adult observation:
- ${input.feedback.adultObservation}

Required correction:
- Preserve the visible worked example and overall experience identity.
- Reduce the need for adult orientation: the first valid action must be visually obvious before reading a paragraph.
- Make the existing interaction less cumbersome on both touch and mouse. You may improve hit targets, snapping, gesture tolerance, visible affordances, feedback, or provide an artifact-consistent equivalent interaction when that best preserves the design intent.
- Keep every action visibly consequential and preserve dignified recovery.

Frozen hashes:
- curriculumHash: ${input.curriculumHash}
- designHash: ${input.designHash}
- originalHtmlHash: ${input.htmlHash}

Frozen curriculum packet:
${JSON.stringify(input.curriculum, null, 2)}

Frozen design artifact:
${JSON.stringify(input.design, null, 2)}

Original implementation to revise:
${input.originalHtml}

Return exactly one complete standalone HTML document for a 1365×768 iframe and nothing else. It must work with touch and mouse. Do not access Sunny APIs, cookies, localStorage, sessionStorage, IndexedDB, child data, or currency. Do not use speech synthesis or raw oscillator audio.`;
}

export function validateCandidateCRevision(html: string): void {
  if (!/^\s*<!doctype html/i.test(html) || !/<\/html>\s*$/i.test(html)) {
    throw new Error("candidate_c_revision_incomplete_html");
  }
  if (/localStorage|sessionStorage|indexedDB|document\.cookie|fetch\s*\(\s*["'`]\/api\//i.test(html)) {
    throw new Error("candidate_c_revision_isolation_violation");
  }
  if (!/<script[\s>]/i.test(html) || !/(button|canvas|svg|input|pointerdown|click)/i.test(html)) {
    throw new Error("candidate_c_revision_interaction_missing");
  }
}

export function renderCandidateCRevisionReport(input: ReportInput): string {
  const feedback = input.feedback.childFeedback.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Candidate C evidence-driven revision</title><style>*{box-sizing:border-box}body{margin:0;background:#eef2fa;color:#17213b;font:16px system-ui}.hero{padding:28px 34px;background:linear-gradient(135deg,#17234a,#7040a8);color:white}.hero p{max-width:980px}.wrap{max-width:1450px;margin:auto;padding:22px}.evidence,.decision,.card,.audit{background:white;border-radius:20px;box-shadow:0 12px 30px #17213b1a;padding:18px}.evidence,.decision{margin-bottom:18px}.decision-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.decision-grid div{padding:14px;border-radius:14px;background:#f3f0ff}.pending{border-left:6px solid #f0ad28}.grid{display:grid;grid-template-columns:1fr;gap:18px}.card h2{margin-top:0}iframe{display:block;width:100%;aspect-ratio:1365/768;border:2px solid #c9d3e8;border-radius:14px;background:white}.open{display:inline-block;margin:10px 0 16px;font-weight:800;color:#5634a8}.score label{display:block;margin:10px 0}.score input{margin-right:8px}.score textarea{display:block;width:100%;min-height:70px;margin-top:5px}.audit{margin-top:18px}code{word-break:break-all}@media(max-width:850px){.decision-grid{grid-template-columns:1fr}}</style></head><body><header class="hero"><h1>Did Sunny learn from the child’s feedback?</h1><p>The academic packet and design artifact are frozen. Only Candidate C’s implementation was revised from factual review.</p></header><main class="wrap"><section class="evidence"><h2>Evidence supplied to the revision</h2><p><strong>Original child score: ${input.feedback.score}/10</strong></p><ul>${feedback}</ul><p>${escapeHtml(input.feedback.adultObservation)}</p></section><section class="decision"><h2>Evidence → revision decision</h2><div class="decision-grid"><div><strong>What Sunny observed</strong><p>The visible example helped and the experience earned a high rating. Dragging was cumbersome and the first action still needed adult orientation.</p></div><div><strong>What the revision preserved</strong><p>The frozen math, worked example, visual identity, world, and successful design qualities.</p></div><div><strong>What the revision changed</strong><p>Implementation affordances: clearer first-action demonstration, tap-or-drag control, larger targets, and more visible action feedback.</p></div></div><p class="pending"><strong>Your as-child verdict is still required.</strong> Begin with no explanation and judge whether the revision solved the observed confusion. This does not prove mastery or establish a universal child preference.</p></section><section class="grid"><article class="card"><h2>Before</h2><iframe src="before/experience.html" title="Candidate C before"></iframe><a class="open" href="before/experience.html" target="_blank">Open before full size ↗</a></article><article class="card"><h2>After</h2><iframe src="after/experience.html" title="Candidate C after"></iframe><a class="open" href="after/experience.html" target="_blank">Open after full size ↗</a><div class="score"><h3>Parent-preview acceptance</h3><label><input type="checkbox">First action understood without adult explanation</label><label><input type="checkbox">Interaction is less cumbersome with mouse or touch</label><label><input type="checkbox">Visible example remains useful</label><label><input type="checkbox">Experience identity and strongest qualities remain intact</label><label>What was still confusing?<textarea></textarea></label><label>Would you ship this?<textarea></textarea></label></div></article></section><details class="audit"><summary>Hashes, usage, and cost</summary><p>Curriculum: <code>${input.curriculumHash}</code></p><p>Design: <code>${input.designHash}</code></p><p>Original HTML: <code>${input.originalHash}</code></p><p>Revised HTML: <code>${input.revisedHash}</code></p><p>One implementation revision call: $${input.costUsd.toFixed(3)}, ${input.inputTokens.toLocaleString()} input tokens, ${input.outputTokens.toLocaleString()} output tokens, ${(input.elapsedMs / 1000).toFixed(1)} seconds.</p></details></main></body></html>`;
}

export async function runCandidateCRevision(runDir: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY_missing");
  const personalityDir = path.join(runDir, "personality");
  const curriculumFile = path.join(personalityDir, "curriculum-packet.json");
  const designFile = path.join(personalityDir, "design-artifact.json");
  const htmlFile = path.join(personalityDir, "experience.html");
  const reviewFile = path.join(runDir, "human-review.json");
  for (const file of [curriculumFile, designFile, htmlFile, reviewFile]) {
    if (!fs.existsSync(file)) throw new Error(`candidate_c_revision_input_missing:${file}`);
  }

  const curriculumText = fs.readFileSync(curriculumFile, "utf8");
  const designText = fs.readFileSync(designFile, "utf8");
  const originalHtml = fs.readFileSync(htmlFile, "utf8");
  const review = JSON.parse(fs.readFileSync(reviewFile, "utf8")) as {
    candidates?: Array<{ candidate?: string; score?: number; childFeedback?: string[]; adultObservation?: string }>;
  };
  const candidate = review.candidates?.find((entry) => entry.candidate === "C");
  if (!candidate || typeof candidate.score !== "number") throw new Error("candidate_c_review_missing");
  const feedback: Review = {
    score: candidate.score,
    childFeedback: candidate.childFeedback ?? [],
    adultObservation: candidate.adultObservation ?? "",
  };
  const curriculumHash = hash(curriculumText);
  const designHash = hash(designText);
  const originalHash = hash(originalHtml);
  const prompt = buildCandidateCRevisionPrompt({
    curriculum: JSON.parse(curriculumText),
    design: JSON.parse(designText),
    originalHtml,
    curriculumHash,
    designHash,
    htmlHash: originalHash,
    feedback,
  });

  const outputDir = path.join(runDir, "candidate-c-revision");
  const beforeDir = path.join(outputDir, "before");
  const afterDir = path.join(outputDir, "after");
  const auditDir = path.join(outputDir, "audit");
  fs.mkdirSync(beforeDir, { recursive: true });
  fs.mkdirSync(afterDir, { recursive: true });
  fs.mkdirSync(auditDir, { recursive: true });
  fs.copyFileSync(htmlFile, path.join(beforeDir, "experience.html"));
  writeJson(path.join(auditDir, "request.json"), {
    model: MODEL,
    maxTokens: MAX_TOKENS,
    frozenHashes: { curriculumHash, designHash, originalHash },
    feedback,
    prompt,
  });

  console.log(` 🎮 [candidate-c-revision] [running] model=${MODEL} maxTokens=${MAX_TOKENS}`);
  const startedAt = Date.now();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    messages: [{ role: "user", content: prompt }],
  } as never, { timeout: 1_200_000 }).finalMessage();
  writeJson(path.join(auditDir, "response.json"), response);
  if (response.stop_reason === "max_tokens") throw new Error("candidate_c_revision_truncated");
  const revisedHtml = extractHtml(response);
  validateCandidateCRevision(revisedHtml);
  if (hash(curriculumText) !== curriculumHash || hash(designText) !== designHash || hash(originalHtml) !== originalHash) {
    throw new Error("candidate_c_revision_frozen_input_changed");
  }
  fs.writeFileSync(path.join(afterDir, "experience.html"), revisedHtml, "utf8");
  const inputTokens = response.usage.input_tokens ?? 0;
  const outputTokens = response.usage.output_tokens ?? 0;
  const costUsd = inputTokens / 1_000_000 * 5 + outputTokens / 1_000_000 * 25;
  const elapsedMs = Date.now() - startedAt;
  const summary = {
    status: "READY_FOR_PARENT_PREVIEW",
    model: MODEL,
    calls: 1,
    inputTokens,
    outputTokens,
    costUsd,
    elapsedMs,
    stopReason: response.stop_reason,
    frozenHashes: { curriculumHash, designHash, originalHash },
    revisedHash: hash(revisedHtml),
    feedback,
    interpretation: "This proves implementation adaptation to factual feedback; it does not prove learning or establish a universal interaction preference.",
  };
  writeJson(path.join(outputDir, "summary.json"), summary);
  fs.writeFileSync(path.join(outputDir, "report.html"), renderCandidateCRevisionReport({
    feedback,
    originalHash,
    revisedHash: summary.revisedHash,
    designHash,
    curriculumHash,
    costUsd,
    inputTokens,
    outputTokens,
    elapsedMs,
  }), "utf8");
  console.log(` 🎮 [candidate-c-revision] [saved] cost=$${costUsd.toFixed(3)} report=${path.join(outputDir, "report.html")}`);
  return outputDir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runDir = process.argv[2];
  if (!runDir) throw new Error("usage: revise-candidate-c.ts /absolute/run-directory");
  runCandidateCRevision(path.resolve(runDir)).catch((error) => {
    console.error(` 🎮 [candidate-c-revision] [failed] reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
