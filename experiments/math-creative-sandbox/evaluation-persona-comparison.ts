import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

type ArchitectInput = {
  evaluationContract: Record<string, unknown>;
  evaluationHash: string;
  factualChildEvidence: Array<{ evidenceId: string; fact: string }>;
  viewport: { width: number; height: number };
};

type ArchitectPrompt = {
  arm: "neutral" | "persona";
  sharedPrompt: string;
  variantBlock: string;
  fullPrompt: string;
};

type ArchitectPromptPair = {
  neutral: ArchitectPrompt;
  persona: ArchitectPrompt;
};

type ComparisonStage =
  | "neutral-architect"
  | "persona-architect"
  | "neutral-builder"
  | "persona-builder"
  | "review-harness";

type ComparisonUsage = {
  call: number;
  stage: ComparisonStage;
  model: string;
  status: "complete" | "failed";
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
  costUsd?: number;
  stopReason?: string;
  error?: string;
};

type ComparisonManifest = {
  status: string;
  callsEnabled: boolean;
  sourceEvaluationGate: string;
  evaluationHash: string;
  prompts: ArchitectPromptPair;
  builderInstruction: string;
  harnessPrompt: string;
  promptHashes: Record<string, string>;
};

type Arm = "neutral" | "persona";

type ArmResult = {
  arm: Arm;
  designArtifact: Record<string, unknown>;
  designHash: string;
  html: string;
  htmlHash: string;
  diagnostics: Record<string, unknown>;
};

const MODELS = {
  architect: "claude-fable-5",
  builder: "claude-opus-5",
  harness: "claude-fable-5",
} as const;

const OUTPUT_LIMITS = {
  architect: 18_000,
  builder: 52_000,
  harness: 8_000,
} as const;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stable(value)).digest("hex");
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = model === MODELS.architect || model === MODELS.harness
    ? { input: 10, output: 50 }
    : { input: 5, output: 25 };
  return Number(((inputTokens * rates.input + outputTokens * rates.output) / 1_000_000).toFixed(6));
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[character]!));
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function buildArchitectPrompts(input: ArchitectInput): ArchitectPromptPair {
  const sharedPrompt = `OBJECTIVE
Design one child-facing evaluation that accurately reveals what the child independently understands about the constructs in the immutable evaluation contract.

SUCCESS CONDITIONS
- The first required action is understandable from the finished screen.
- The response method preserves the intended mathematics without making reading, typing, pointer precision, or interface discovery the construct being measured.
- Each item collects an independent response before instructional support, an example, a hint, feedback about correctness, or answer exposure.
- An incorrect, uncertain, or instrument-ambiguous response never traps the child.
- The experience reports factual attempts, assistance, exposure, possible confounds, friction, and completion without declaring mastery or a learning preference.

EXPERIENTIAL COMPLETENESS
- Give the child an immediately understandable reason to act, expressed through openingPromise and firstThreeSeconds.
- Define a mission and a coreInteraction in which the required mathematics is the means of affecting the experience; record that causal relationship as mathAsPower.
- Define stakesAndConsequences that make actions matter while preserving dignity and truthful evidence.
- Make correct, incorrect, uncertain, and recovered actions produce understandable worldReaction without exposing answers before commitment.
- Define visible progression, an earned payoff, and replayVariation that does not reuse evaluation exposures or contaminate independent evidence.
- State what the experience predicts about continued participation and what observations would falsify that prediction.
- No theme, mechanic, world, character, visual style, sound style, or reward form has been selected. You choose all of them.

AUTHORITY
You own the presentation, world, interaction, pacing, feedback, visual treatment, motion, sound cues, recovery, and payoff. Choose them from the objective, immutable contract, and factual evidence. Creative constraints imposed by the experiment: none.

BOUNDARIES
Do not change evaluation identity, constructs, item meaning, correct-answer contracts, difficulty boundaries, exposure identities, evidence requirements, possible confounds, or upstream hash. Treat factual child evidence as context and hypotheses, never as permission to invent a preference. Return a structured design artifact and no HTML.

TARGET VIEWPORT
${input.viewport.width}×${input.viewport.height}, touch and mouse, no keyboard requirement.

FACTUAL CHILD EVIDENCE
${JSON.stringify(input.factualChildEvidence, null, 2)}

IMMUTABLE EVALUATION CONTRACT
Hash: ${input.evaluationHash}
${JSON.stringify(input.evaluationContract, null, 2)}

OUTPUT CONTRACT
Return artifactId, upstreamHash, title, designRationale, independentlyChosenPrinciples, openingPromise, firstThreeSeconds, firstAction, mission, coreInteraction, mathAsPower, responseAffordances, stakesAndConsequences, recovery, progression, worldReaction, payoff, replayVariation, visualDirection, motionDirection, soundDirection, usefulLibraries, anticipatedChildConfusions, instrumentRisks, engagementPrediction, falsifyingEvidence, and measurementResponsibilities. upstreamHash must equal ${input.evaluationHash}.`;

  const neutralBlock = `ROLE MODE: neutral professional
No additional reasoning persona is supplied. Solve the objective using your own professional judgment.`;
  const personaBlock = `ROLE MODE: accountable reasoning persona
You are Juniper, accountable for whether this evaluation produces trustworthy evidence about the child rather than merely producing a finished interface. Form your own design point of view from the objective, immutable contract, and factual evidence. Commit to your decisions, identify where the child may misunderstand the task, and state what observations would show that your design judgment was wrong. You retain complete creative authority; no aesthetic style or mechanic has been selected for you.`;

  return {
    neutral: {
      arm: "neutral",
      sharedPrompt,
      variantBlock: neutralBlock,
      fullPrompt: `${neutralBlock}\n\n${sharedPrompt}`,
    },
    persona: {
      arm: "persona",
      sharedPrompt,
      variantBlock: personaBlock,
      fullPrompt: `${personaBlock}\n\n${sharedPrompt}`,
    },
  };
}

export function buildNeutralBuilderPrompt(input: {
  evaluationContract: Record<string, unknown>;
  evaluationHash: string;
  designArtifact: Record<string, unknown>;
  designHash: string;
  viewport: { width: number; height: number };
}): { instruction: string; payload: string; fullPrompt: string } {
  const instruction = `Implement one complete standalone child-facing HTML evaluation from the immutable academic and design artifacts.

Implement the artifacts faithfully. You own implementation details needed to make the declared interaction work, but you may not add another design doctrine, change academic content, expose an answer before the first committed response, or make learning conclusions.

The document must work at the declared viewport with touch and mouse and no keyboard requirement. The child must always be able to continue after an incorrect, uncertain, or instrument-ambiguous response. Every queried DOM element must exist before JavaScript accesses it. Use no parent application endpoints, cookies, localStorage, sessionStorage, IndexedDB, currency, browser speech synthesis, or oscillator audio.

Post evaluation_ready, evaluation_attempt, evaluation_friction, and evaluation_complete messages to window.parent. Every attempt must include itemId, constructId, result, assistance, exposure, responseMode, possibleConfounds, and attemptedValue. Return one complete HTML document and nothing else.`;
  const payload = `TARGET VIEWPORT
${input.viewport.width}×${input.viewport.height}

IMMUTABLE EVALUATION CONTRACT
Hash: ${input.evaluationHash}
${JSON.stringify(input.evaluationContract, null, 2)}

IMMUTABLE DESIGN ARTIFACT
Hash: ${input.designHash}
${JSON.stringify(input.designArtifact, null, 2)}`;
  return { instruction, payload, fullPrompt: `${instruction}\n\n${payload}` };
}

export function buildHarnessPrompt(input: {
  evaluationHash: string;
  neutralDesignHash: string;
  personaDesignHash: string;
}): string {
  return `You are conducting a review-only inspection of two blinded child-facing evaluation candidates derived from the same immutable academic contract.

Observe and report only directly supportable conditions:
- whether the first required action is visible and understandable;
- clipped, obscured, overlapping, illegible, or off-screen content at 1365×768;
- whether visible controls respond and state changes are understandable;
- whether an incorrect or uncertain response can continue;
- whether the mathematics required by the contract controls the interaction;
- whether reading, interface discovery, or response mechanics may confound the measurement;
- whether emitted events preserve independent, assisted, exposed, ambiguous, and friction evidence classification;
- whether either candidate changes the immutable academic contract.

You have authority only to record observations with screenshot or event references and confidence. Do not modify either candidate, select a candidate, infer child preference, infer mastery, or introduce aesthetic criteria.

Academic contract hash: ${input.evaluationHash}
Candidate design hashes: ${input.neutralDesignHash}, ${input.personaDesignHash}`;
}

export class ComparisonCallBudget {
  private calls = 0;

  constructor(private readonly ceiling: number) {
    if (!Number.isInteger(ceiling) || ceiling < 1) throw new Error("evaluation_persona_invalid_call_ceiling");
  }

  begin(_stage: ComparisonStage): number {
    if (this.calls >= this.ceiling) throw new Error("evaluation_persona_call_ceiling_reached");
    this.calls += 1;
    return this.calls;
  }

  count(): number {
    return this.calls;
  }
}

export function resolveComparisonOutput(root: string, runId: string): string {
  const base = path.resolve(root, "outputs", "math-creative-sandbox", "evaluation-persona-comparison");
  const resolved = path.resolve(base, runId);
  if (!resolved.startsWith(`${base}${path.sep}`)) throw new Error("evaluation_persona_output_escape");
  return resolved;
}

export function extractComparisonHtml(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const complete = fenced.match(/<!doctype html[\s\S]*<\/html>/i) ?? fenced.match(/<html[\s\S]*<\/html>/i);
  if (!complete) throw new Error("evaluation_persona_complete_html_missing");
  return complete[0];
}

function responseText(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.type === "text" ? block.text : "")
    .join("\n");
}

export function extractToolArtifact(content: Array<Record<string, unknown>>, toolName: string): Record<string, unknown> {
  const block = content.find((item) => item.type === "tool_use" && item.name === toolName);
  if (!block || !block.input || typeof block.input !== "object" || Array.isArray(block.input)) {
    throw new Error(`evaluation_persona_structured_output_missing:${toolName}`);
  }
  return block.input as Record<string, unknown>;
}

function toolInput(response: Anthropic.Messages.Message, toolName: string): Record<string, unknown> {
  return extractToolArtifact(response.content as unknown as Array<Record<string, unknown>>, toolName);
}

function architectSchema(upstreamHash: string): Record<string, unknown> {
  const required = [
    "artifactId", "upstreamHash", "title", "designRationale", "independentlyChosenPrinciples",
    "openingPromise", "firstThreeSeconds", "firstAction", "mission", "coreInteraction", "mathAsPower",
    "responseAffordances", "stakesAndConsequences", "recovery", "progression", "worldReaction",
    "payoff", "replayVariation", "visualDirection", "motionDirection", "soundDirection", "usefulLibraries",
    "anticipatedChildConfusions", "instrumentRisks", "engagementPrediction", "falsifyingEvidence",
    "measurementResponsibilities",
  ];
  return {
    type: "object",
    additionalProperties: true,
    required,
    properties: Object.fromEntries(required.map((field) => [field, field === "upstreamHash"
      ? { type: "string", enum: [upstreamHash] }
      : field === "artifactId" || field === "title"
        ? { type: "string", minLength: 1 }
        : {}])),
  };
}

function harnessSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["scope", "candidateA", "candidateB", "limitations"],
    properties: {
      scope: { type: "string" },
      candidateA: { type: "object" },
      candidateB: { type: "object" },
      limitations: { type: "array", items: { type: "string" } },
    },
  };
}

function assertIsolatedHtml(html: string): void {
  if (/localStorage|sessionStorage|indexedDB|document\.cookie|fetch\s*\(\s*["'`]\/api\//i.test(html)) {
    throw new Error("evaluation_persona_experience_isolation_violation");
  }
  for (const eventName of ["evaluation_ready", "evaluation_attempt", "evaluation_friction", "evaluation_complete"]) {
    if (!html.includes(eventName)) throw new Error(`evaluation_persona_event_contract_missing:${eventName}`);
  }
}

class ComparisonCalls {
  private readonly client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private readonly budget: ComparisonCallBudget;
  readonly usage: ComparisonUsage[] = [];

  constructor(private readonly auditDir: string, ceiling = 5) {
    this.budget = new ComparisonCallBudget(ceiling);
  }

  async architect(stage: "neutral-architect" | "persona-architect", prompt: string, upstreamHash: string): Promise<Record<string, unknown>> {
    const call = this.budget.begin(stage);
    const toolName = "submit_evaluation_design_artifact";
    const request = {
      model: MODELS.architect,
      max_tokens: OUTPUT_LIMITS.architect,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      messages: [{ role: "user", content: prompt }],
      tools: [{ name: toolName, description: "Submit the complete evaluation design artifact.", input_schema: architectSchema(upstreamHash) }],
      tool_choice: { type: "tool", name: toolName },
    } as never;
    const response = await this.perform(call, stage, MODELS.architect, request, 900_000, false);
    const artifact = toolInput(response, toolName);
    if (artifact.upstreamHash !== upstreamHash) throw new Error(`${stage}:upstream_hash_changed`);
    return artifact;
  }

  async builder(stage: "neutral-builder" | "persona-builder", prompt: string): Promise<string> {
    const call = this.budget.begin(stage);
    const request = {
      model: MODELS.builder,
      max_tokens: OUTPUT_LIMITS.builder,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      messages: [{ role: "user", content: prompt }],
    } as never;
    const response = await this.perform(call, stage, MODELS.builder, request, 1_200_000, true);
    const html = extractComparisonHtml(responseText(response));
    assertIsolatedHtml(html);
    return html;
  }

  async harness(prompt: string, candidates: Array<{ label: string; screenshot: string; diagnostics: Record<string, unknown> }>): Promise<Record<string, unknown>> {
    const stage: ComparisonStage = "review-harness";
    const call = this.budget.begin(stage);
    const content: Array<Record<string, unknown>> = [{
      type: "text",
      text: `${prompt}\n\nBLINDED MACHINE DIAGNOSTICS\n${JSON.stringify(candidates.map(({ label, diagnostics }) => ({ label, diagnostics })), null, 2)}\n\nEach following image is labeled only Candidate A or Candidate B. Report observations only.`,
    }];
    for (const candidate of candidates) {
      content.push({ type: "text", text: candidate.label });
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/png", data: fs.readFileSync(candidate.screenshot).toString("base64") },
      });
    }
    const toolName = "submit_blinded_evaluation_review";
    const request = {
      model: MODELS.harness,
      max_tokens: OUTPUT_LIMITS.harness,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      messages: [{ role: "user", content }],
      tools: [{ name: toolName, description: "Submit review-only observations for both blinded candidates.", input_schema: harnessSchema() }],
      tool_choice: { type: "tool", name: toolName },
    } as never;
    const response = await this.perform(call, stage, MODELS.harness, request, 900_000, false);
    return toolInput(response, toolName);
  }

  private async perform(
    call: number,
    stage: ComparisonStage,
    model: string,
    request: never,
    timeout: number,
    stream: boolean,
  ): Promise<Anthropic.Messages.Message> {
    const prefix = `call-${String(call).padStart(2, "0")}-${stage}`;
    writeJson(path.join(this.auditDir, `${prefix}-request.json`), request);
    const startedAt = Date.now();
    console.log(` 🎮 [evaluation-persona-comparison] [${stage}] [running] call=${call} model=${model}`);
    try {
      const response = stream
        ? await this.client.messages.stream(request, { timeout }).finalMessage()
        : await this.client.messages.create(request, { timeout });
      this.usage.push({
        call, stage, model, status: "complete",
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0,
        elapsedMs: Date.now() - startedAt,
        costUsd: estimateCost(model, response.usage.input_tokens ?? 0, response.usage.output_tokens ?? 0),
        stopReason: response.stop_reason ?? "unknown",
      });
      writeJson(path.join(this.auditDir, `${prefix}-response.json`), response);
      writeJson(path.join(this.auditDir, "usage.json"), this.usage);
      console.log(` 🎮 [evaluation-persona-comparison] [${stage}] [saved] call=${call} elapsed=${Math.round((Date.now() - startedAt) / 1000)}s`);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.usage.push({ call, stage, model, status: "failed", inputTokens: 0, outputTokens: 0, elapsedMs: Date.now() - startedAt, error: message });
      writeJson(path.join(this.auditDir, `${prefix}-error.json`), { error: message });
      writeJson(path.join(this.auditDir, "usage.json"), this.usage);
      console.error(` 🎮 [evaluation-persona-comparison] [${stage}] [failed] call=${call} reason=${message}`);
      throw error;
    }
  }
}

async function inspectCandidate(htmlFile: string, screenshot: string): Promise<Record<string, unknown>> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load", timeout: 30_000 });
    await page.waitForTimeout(1_500);
    const visible = await page.evaluate(() => {
      const controls = [...document.querySelectorAll("button,input,select,textarea,[role=button]")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        });
      return {
        title: document.title,
        visibleText: document.body.innerText.slice(0, 2_500),
        visibleControlCount: controls.length,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      };
    });
    await page.screenshot({ path: screenshot, fullPage: false });
    return { ...visible, consoleErrors, pageErrors };
  } finally {
    await browser.close();
  }
}

export function verifyPromptManifestIntegrity<T extends {
  prompts: ArchitectPromptPair;
  builderInstruction: string;
  harnessPrompt: string;
  promptHashes: Record<string, string>;
}>(manifest: T, options: { sealMissingHashes?: boolean } = {}): T {
  const actual = {
    shared: hash(manifest.prompts.neutral.sharedPrompt),
    neutralVariant: hash(manifest.prompts.neutral.variantBlock),
    personaVariant: hash(manifest.prompts.persona.variantBlock),
    neutralFull: hash(manifest.prompts.neutral.fullPrompt),
    personaFull: hash(manifest.prompts.persona.fullPrompt),
    builderInstruction: hash(manifest.builderInstruction),
    harness: hash(manifest.harnessPrompt),
  };
  const sealed = { ...manifest, promptHashes: { ...manifest.promptHashes } };
  for (const [key, value] of Object.entries(actual)) {
    const recorded = sealed.promptHashes[key];
    if (!recorded && options.sealMissingHashes) sealed.promptHashes[key] = value;
    else if (recorded !== value) throw new Error(`evaluation_persona_prompt_hash_mismatch:${key}`);
  }
  if (manifest.prompts.neutral.sharedPrompt !== manifest.prompts.persona.sharedPrompt) {
    throw new Error("evaluation_persona_shared_prompt_changed");
  }
  return sealed;
}

export function renderComparisonReport(input: {
  candidates: Array<{ label: string; relativePath: string; arm: string; designHash: string; htmlHash: string }>;
  harnessReview: Record<string, unknown>;
  usage: ComparisonUsage[];
  promptManifestRelativePath: string;
}): string {
  const hiddenProvenance = Buffer.from(JSON.stringify({
    candidates: input.candidates.map(({ label, arm, designHash, htmlHash }) => ({ label, arm, designHash, htmlHash })),
    usage: input.usage,
  })).toString("base64");
  const harness = escapeHtml(JSON.stringify(input.harnessReview, null, 2));
  const candidateCards = input.candidates.map((candidate) => `<article class="candidate"><h2>${escapeHtml(candidate.label)}</h2><iframe id="${escapeHtml(candidate.label.replace(/\s+/g, "-").toLowerCase())}" src="${escapeHtml(candidate.relativePath)}" title="${escapeHtml(candidate.label)} evaluation"></iframe><a href="${escapeHtml(candidate.relativePath)}" target="_blank">Open full size ↗</a><div class="events" data-events-for="${escapeHtml(candidate.label)}">Waiting for activity events…</div><div class="scores">${[
    "First-action clarity",
    "Age-appropriate burden",
    "Mathematical validity",
    "Visible action feedback",
    "Recovery and continuation",
    "Evidence trustworthiness",
    "Desire to continue",
    "Overall quality",
  ].map((criterion) => `<label>${criterion}<input type="range" min="1" max="5" value="3" data-candidate="${escapeHtml(candidate.label)}" data-criterion="${escapeHtml(criterion)}"><output>3</output></label>`).join("")}</div><label>What was immediately understandable?<textarea data-note="understandable" data-candidate="${escapeHtml(candidate.label)}"></textarea></label><label>What was confusing?<textarea data-note="confusing" data-candidate="${escapeHtml(candidate.label)}"></textarea></label></article>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evaluation persona comparison</title><style>
*{box-sizing:border-box}body{margin:0;background:#edf1f9;color:#17203a;font:16px system-ui}.hero{padding:26px 30px;background:linear-gradient(135deg,#17234a,#5b3da0);color:#fff}.hero h1{margin:0 0 8px}.notice{margin-top:12px;padding:10px 14px;background:#fff3c9;color:#18213a;border-radius:10px;font-weight:750}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:18px;max-width:1900px;margin:auto}.candidate,.panel{background:#fff;border-radius:18px;padding:16px;box-shadow:0 10px 28px #1d2a4d1a}.candidate iframe{width:100%;aspect-ratio:1365/768;border:2px solid #c2cade;border-radius:13px;background:#10162c}.candidate>a{display:inline-block;margin:9px 0;color:#533ab0;font-weight:800}.events{padding:9px 11px;background:#edf5ff;border-radius:10px;font-size:14px}.scores{display:grid;grid-template-columns:1fr 1fr;gap:8px 15px;margin-top:12px}.scores label{display:grid;grid-template-columns:1fr 110px 22px;align-items:center;gap:5px}.candidate>label{display:block;margin-top:10px;font-weight:700}textarea{display:block;width:100%;min-height:60px;margin-top:4px}.wide{grid-column:1/-1}.actions{display:flex;gap:10px;flex-wrap:wrap}button{border:0;border-radius:999px;padding:11px 16px;background:#563db4;color:#fff;font-weight:850;cursor:pointer}pre{white-space:pre-wrap;word-break:break-word;background:#121a30;color:#eaf0ff;padding:15px;border-radius:12px;max-height:420px;overflow:auto}.hidden{display:none}@media(max-width:1000px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}.scores{grid-template-columns:1fr}}</style></head><body><header class="hero"><h1>Blinded evaluation comparison</h1><p>The academic contract is identical. One architect received no reasoning persona; one received the approved accountable persona. Both builders received the same neutral instruction.</p><div class="notice">Judge the child experience before revealing provenance. Neither candidate writes Sunny or child state.</div></header><main class="grid">${candidateCards}<section class="panel wide"><h2>Evaluation quality scorecard</h2><p>Complete the candidate controls above, then record which instrument better reveals independent understanding without introducing unrelated friction.</p><div class="actions"><button id="download">Download human review</button><button id="reveal">Reveal provenance and usage</button><a href="${escapeHtml(input.promptManifestRelativePath)}" target="_blank">Review exact prompt manifest ↗</a></div><div id="provenance" class="hidden"><h3>Provenance and token usage</h3><pre></pre></div></section><section class="panel wide"><h2>Review-only harness observations</h2><p>The harness records observable defects and limitations. It did not modify either candidate or select a winner.</p><pre>${harness}</pre></section></main><script>
const captured={"Candidate A":[],"Candidate B":[]};const frames=[...document.querySelectorAll('iframe')];window.addEventListener('message',event=>{const index=frames.findIndex(frame=>frame.contentWindow===event.source);if(index<0||!event.data||typeof event.data.type!=='string'||!event.data.type.startsWith('evaluation_'))return;const label=index===0?'Candidate A':'Candidate B';captured[label].push({...event.data,capturedAt:new Date().toISOString()});document.querySelector('[data-events-for="'+label+'"]').textContent=captured[label].length+' factual event(s) captured';});document.querySelectorAll('input[type=range]').forEach(input=>input.addEventListener('input',()=>input.nextElementSibling.value=input.value));const provenance=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${hiddenProvenance}'),c=>c.charCodeAt(0))));document.getElementById('reveal').addEventListener('click',()=>{const target=document.getElementById('provenance');target.classList.remove('hidden');target.querySelector('pre').textContent=JSON.stringify(provenance,null,2);});document.getElementById('download').addEventListener('click',()=>{const scores={};document.querySelectorAll('[data-criterion]').forEach(input=>{scores[input.dataset.candidate]??={};scores[input.dataset.candidate][input.dataset.criterion]=Number(input.value);});const notes={};document.querySelectorAll('[data-note]').forEach(area=>{notes[area.dataset.candidate]??={};notes[area.dataset.candidate][area.dataset.note]=area.value;});const review={createdAt:new Date().toISOString(),scores,notes,events:captured,claim:'Human review of generated evaluation instruments; not mastery or causal evidence.'};const anchor=document.createElement('a');anchor.href=URL.createObjectURL(new Blob([JSON.stringify(review,null,2)],{type:'application/json'}));anchor.download='evaluation-persona-human-review.json';anchor.click();URL.revokeObjectURL(anchor.href);});
</script></body></html>`;
}

export function renderPromptManifest(input: {
  prompts: ArchitectPromptPair;
  builderInstruction: string;
  harnessPrompt: string;
  evaluationContract: Record<string, unknown>;
  promptHashes: Record<string, string>;
  callsEnabled: boolean;
}): string {
  const status = input.callsEnabled
    ? "Paid calls are enabled for this frozen manifest."
    : "Paid calls are locked. Review this manifest before generation.";
  const block = (title: string, value: string) => `<section><h2>${escapeHtml(title)}</h2><pre>${escapeHtml(value)}</pre></section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evaluation persona prompt manifest</title><style>
*{box-sizing:border-box}body{margin:0;background:#eef2fa;color:#17203a;font:16px system-ui}.hero{padding:28px;background:linear-gradient(135deg,#17234a,#59399a);color:white}.hero h1{margin:0 0 8px}.status{margin-top:16px;padding:13px 16px;border-radius:12px;background:${input.callsEnabled ? "#d8f7e6" : "#fff0c7"};color:#18213a;font-weight:800}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:1800px;margin:auto;padding:18px}section{background:white;border-radius:16px;padding:18px;box-shadow:0 9px 26px #1c28461a}section.wide{grid-column:1/-1}pre{white-space:pre-wrap;word-break:break-word;background:#11182d;color:#eaf0ff;padding:16px;border-radius:12px;max-height:560px;overflow:auto}.diff{display:grid;grid-template-columns:1fr 1fr;gap:14px}.hashes code{display:block;margin:6px 0;word-break:break-all}@media(max-width:900px){.grid,.diff{grid-template-columns:1fr}.wide{grid-column:auto}}</style></head><body><header class="hero"><h1>Prompt manifest — neutral vs accountable persona</h1><p>Every instruction below is frozen before any paid call. The only architect-arm difference is the declared reasoning-persona block.</p><div class="status">${escapeHtml(status)}</div></header><main class="grid"><section class="wide"><h2>Exact variant diff</h2><div class="diff"><div><h3>Exact neutral-only block</h3><pre>${escapeHtml(input.prompts.neutral.variantBlock)}</pre></div><div><h3>Exact persona-only block</h3><pre>${escapeHtml(input.prompts.persona.variantBlock)}</pre></div></div></section>${block("Exact shared architect prompt", input.prompts.neutral.sharedPrompt)}${block("Exact neutral builder instruction", input.builderInstruction)}${block("Exact review-only harness prompt", input.harnessPrompt)}<section><h2>Prompt hashes</h2><div class="hashes">${Object.entries(input.promptHashes).map(([key, value]) => `<code><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</code>`).join("")}</div></section><section class="wide"><h2>Immutable evaluation contract</h2><pre>${escapeHtml(JSON.stringify(input.evaluationContract, null, 2))}</pre></section></main></body></html>`;
}

function latestEvaluationGate(root: string): string {
  const base = path.join(root, "outputs", "math-creative-sandbox", "evaluation-design-gate");
  const candidates = fs.readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name))
    .filter((directory) => fs.existsSync(path.join(directory, "evaluation-contract.json"))
      && fs.existsSync(path.join(directory, "shared-input.json")))
    .sort();
  const selected = candidates.at(-1);
  if (!selected) throw new Error("evaluation_persona_frozen_gate_missing");
  return selected;
}

export function createLockedPromptManifest(root = process.cwd()): string {
  const sourceDir = latestEvaluationGate(root);
  const evaluationContract = JSON.parse(fs.readFileSync(path.join(sourceDir, "evaluation-contract.json"), "utf8"));
  const sharedInput = JSON.parse(fs.readFileSync(path.join(sourceDir, "shared-input.json"), "utf8"));
  const evaluationHash = String(evaluationContract.evaluationHash ?? hash(evaluationContract));
  const factualChildEvidence = Array.isArray(sharedInput.childEvidence) ? sharedInput.childEvidence : [];
  const viewport = sharedInput.viewport ?? { width: 1365, height: 768 };
  const prompts = buildArchitectPrompts({ evaluationContract, evaluationHash, factualChildEvidence, viewport });
  const builderInstruction = buildNeutralBuilderPrompt({
    evaluationContract,
    evaluationHash,
    designArtifact: { artifactId: "injected_after_frozen_architect_call" },
    designHash: "injected_after_frozen_architect_call",
    viewport,
  }).instruction;
  const harnessPrompt = buildHarnessPrompt({
    evaluationHash,
    neutralDesignHash: "injected_after_frozen_architect_call",
    personaDesignHash: "injected_after_frozen_architect_call",
  });
  const promptHashes = {
    shared: hash(prompts.neutral.sharedPrompt),
    neutralVariant: hash(prompts.neutral.variantBlock),
    personaVariant: hash(prompts.persona.variantBlock),
    neutralFull: hash(prompts.neutral.fullPrompt),
    personaFull: hash(prompts.persona.fullPrompt),
    builderInstruction: hash(builderInstruction),
    harness: hash(harnessPrompt),
  };
  const runId = new Date().toISOString().replaceAll(":", "-");
  const outputDir = resolveComparisonOutput(root, runId);
  fs.mkdirSync(outputDir, { recursive: true });
  writeJson(path.join(outputDir, "prompt-manifest.json"), {
    status: "AWAITING_HUMAN_PROMPT_APPROVAL",
    callsEnabled: false,
    sourceEvaluationGate: sourceDir,
    evaluationHash,
    prompts,
    builderInstruction,
    harnessPrompt,
    promptHashes,
  });
  fs.writeFileSync(path.join(outputDir, "prompt-manifest.html"), renderPromptManifest({
    prompts,
    builderInstruction,
    harnessPrompt,
    evaluationContract,
    promptHashes,
    callsEnabled: false,
  }), "utf8");
  console.log(` 🎮 [evaluation-persona-comparison] [prompt-manifest] [locked] file=${path.join(outputDir, "prompt-manifest.html")}`);
  return outputDir;
}

function settledValue<T>(result: PromiseSettledResult<T>, stage: string): T {
  if (result.status === "fulfilled") return result.value;
  throw new Error(`${stage}:${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
}

export async function runApprovedComparison(outputDir: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY_missing");
  const resolvedOutput = path.resolve(outputDir);
  const expectedRoot = path.resolve(process.cwd(), "outputs", "math-creative-sandbox", "evaluation-persona-comparison");
  if (!resolvedOutput.startsWith(`${expectedRoot}${path.sep}`)) throw new Error("evaluation_persona_run_path_outside_output_root");
  const manifestFile = path.join(resolvedOutput, "prompt-manifest.json");
  if (!fs.existsSync(manifestFile)) throw new Error("evaluation_persona_prompt_manifest_missing");
  if (fs.existsSync(path.join(resolvedOutput, "approval.json"))) throw new Error("evaluation_persona_approved_run_already_started");

  const manifestText = fs.readFileSync(manifestFile, "utf8");
  const manifest = verifyPromptManifestIntegrity(JSON.parse(manifestText) as ComparisonManifest);
  const evaluationContractFile = path.join(manifest.sourceEvaluationGate, "evaluation-contract.json");
  const sharedInputFile = path.join(manifest.sourceEvaluationGate, "shared-input.json");
  const evaluationContract = JSON.parse(fs.readFileSync(evaluationContractFile, "utf8")) as Record<string, unknown>;
  const sharedInput = JSON.parse(fs.readFileSync(sharedInputFile, "utf8")) as Record<string, unknown>;
  const viewport = (sharedInput.viewport ?? { width: 1365, height: 768 }) as { width: number; height: number };
  const auditDir = path.join(resolvedOutput, "audit");
  fs.mkdirSync(auditDir, { recursive: true });
  writeJson(path.join(resolvedOutput, "approval.json"), {
    approvedAt: new Date().toISOString(),
    approvedBy: "human_in_thread",
    manifestHash: hash(manifestText),
    promptHashes: manifest.promptHashes,
    callCeiling: 5,
    retryPolicy: "none",
  });
  fs.copyFileSync(evaluationContractFile, path.join(resolvedOutput, "evaluation-contract.json"));
  fs.copyFileSync(sharedInputFile, path.join(resolvedOutput, "shared-input.json"));

  const calls = new ComparisonCalls(auditDir);
  try {
    verifyPromptManifestIntegrity(manifest);
    const architectResults = await Promise.allSettled([
      calls.architect("neutral-architect", manifest.prompts.neutral.fullPrompt, manifest.evaluationHash),
      calls.architect("persona-architect", manifest.prompts.persona.fullPrompt, manifest.evaluationHash),
    ]);
    const neutralDesign = settledValue(architectResults[0]!, "neutral-architect");
    const personaDesign = settledValue(architectResults[1]!, "persona-architect");
    const neutralDesignHash = hash(neutralDesign);
    const personaDesignHash = hash(personaDesign);

    verifyPromptManifestIntegrity(manifest);
    const neutralBuilder = buildNeutralBuilderPrompt({
      evaluationContract, evaluationHash: manifest.evaluationHash,
      designArtifact: neutralDesign, designHash: neutralDesignHash, viewport,
    });
    const personaBuilder = buildNeutralBuilderPrompt({
      evaluationContract, evaluationHash: manifest.evaluationHash,
      designArtifact: personaDesign, designHash: personaDesignHash, viewport,
    });
    if (neutralBuilder.instruction !== manifest.builderInstruction || personaBuilder.instruction !== manifest.builderInstruction) {
      throw new Error("evaluation_persona_builder_instruction_changed");
    }
    const builderResults = await Promise.allSettled([
      calls.builder("neutral-builder", neutralBuilder.fullPrompt),
      calls.builder("persona-builder", personaBuilder.fullPrompt),
    ]);
    const neutralHtml = settledValue(builderResults[0]!, "neutral-builder");
    const personaHtml = settledValue(builderResults[1]!, "persona-builder");

    const armResults: Array<Omit<ArmResult, "diagnostics"> & { diagnostics?: Record<string, unknown> }> = [
      { arm: "neutral", designArtifact: neutralDesign, designHash: neutralDesignHash, html: neutralHtml, htmlHash: hash(neutralHtml) },
      { arm: "persona", designArtifact: personaDesign, designHash: personaDesignHash, html: personaHtml, htmlHash: hash(personaHtml) },
    ];
    if (crypto.randomInt(2) === 1) armResults.reverse();
    const candidates: Array<ArmResult & { label: string; relativePath: string; screenshot: string }> = [];
    for (let index = 0; index < armResults.length; index += 1) {
      const source = armResults[index]!;
      const slug = `candidate-${index === 0 ? "a" : "b"}`;
      const label = `Candidate ${index === 0 ? "A" : "B"}`;
      const directory = path.join(resolvedOutput, slug);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "experience.html"), source.html, "utf8");
      writeJson(path.join(directory, "design-artifact.json"), source.designArtifact);
      const screenshot = path.join(directory, "opening.png");
      const diagnostics = await inspectCandidate(path.join(directory, "experience.html"), screenshot);
      writeJson(path.join(directory, "opening-diagnostics.json"), diagnostics);
      candidates.push({
        ...source,
        diagnostics,
        label,
        relativePath: `${slug}/experience.html`,
        screenshot,
      });
    }

    verifyPromptManifestIntegrity(manifest);
    const actualHarnessPrompt = `${manifest.harnessPrompt}\n\nACTUAL BLINDED CANDIDATE HASHES\n${candidates.map((candidate) => `${candidate.label}: design=${candidate.designHash}; html=${candidate.htmlHash}`).join("\n")}`;
    fs.writeFileSync(path.join(auditDir, "review-harness-approved-base-prompt.txt"), manifest.harnessPrompt, "utf8");
    fs.writeFileSync(path.join(auditDir, "review-harness-runtime-supplement.txt"), actualHarnessPrompt.slice(manifest.harnessPrompt.length), "utf8");
    const harnessReview = await calls.harness(actualHarnessPrompt, candidates);
    writeJson(path.join(resolvedOutput, "harness-review.json"), harnessReview);

    const report = renderComparisonReport({
      candidates: candidates.map((candidate) => ({
        label: candidate.label,
        relativePath: candidate.relativePath,
        arm: candidate.arm,
        designHash: candidate.designHash,
        htmlHash: candidate.htmlHash,
      })),
      harnessReview,
      usage: calls.usage,
      promptManifestRelativePath: "prompt-manifest.html",
    });
    fs.writeFileSync(path.join(resolvedOutput, "report.html"), report, "utf8");
    const totalCostUsd = Number(calls.usage.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0).toFixed(6));
    writeJson(path.join(resolvedOutput, "provenance.json"), {
      candidates: candidates.map(({ label, arm, designHash, htmlHash }) => ({ label, arm, designHash, htmlHash })),
      promptHashes: manifest.promptHashes,
      evaluationHash: manifest.evaluationHash,
      usage: calls.usage,
    });
    writeJson(path.join(resolvedOutput, "summary.json"), {
      status: "READY_FOR_BLINDED_HUMAN_REVIEW",
      calls: calls.usage.length,
      totalInputTokens: calls.usage.reduce((sum, entry) => sum + entry.inputTokens, 0),
      totalOutputTokens: calls.usage.reduce((sum, entry) => sum + entry.outputTokens, 0),
      totalCostUsd,
      report: path.join(resolvedOutput, "report.html"),
      claim: "This compares generated evaluation quality and first-pass reliability; it does not establish learning, mastery, or causation.",
    });
    console.log(` 🎮 [evaluation-persona-comparison] [complete] [ready-for-human-review] calls=${calls.usage.length} cost=$${totalCostUsd.toFixed(2)} report=${path.join(resolvedOutput, "report.html")}`);
    return resolvedOutput;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeJson(path.join(resolvedOutput, "summary.json"), {
      status: "INCOMPLETE",
      reason: message,
      calls: calls.usage.length,
      usage: calls.usage,
      retryPolicy: "none",
    });
    throw error;
  }
}

export async function continueApprovedComparison(outputDir: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY_missing");
  const resolvedOutput = path.resolve(outputDir);
  const expectedRoot = path.resolve(process.cwd(), "outputs", "math-creative-sandbox", "evaluation-persona-comparison");
  if (!resolvedOutput.startsWith(`${expectedRoot}${path.sep}`)) throw new Error("evaluation_persona_run_path_outside_output_root");
  const continuationApproval = path.join(resolvedOutput, "continuation-approval.json");
  if (fs.existsSync(continuationApproval)) throw new Error("evaluation_persona_continuation_already_started");

  const manifest = verifyPromptManifestIntegrity(JSON.parse(fs.readFileSync(path.join(resolvedOutput, "prompt-manifest.json"), "utf8")) as ComparisonManifest);
  const evaluationContract = JSON.parse(fs.readFileSync(path.join(resolvedOutput, "evaluation-contract.json"), "utf8")) as Record<string, unknown>;
  const sharedInput = JSON.parse(fs.readFileSync(path.join(resolvedOutput, "shared-input.json"), "utf8")) as Record<string, unknown>;
  const viewport = (sharedInput.viewport ?? { width: 1365, height: 768 }) as { width: number; height: number };
  const originalAudit = path.join(resolvedOutput, "audit");
  const toolName = "submit_evaluation_design_artifact";
  const neutralResponse = JSON.parse(fs.readFileSync(path.join(originalAudit, "call-01-neutral-architect-response.json"), "utf8")) as { content: Array<Record<string, unknown>> };
  const personaResponse = JSON.parse(fs.readFileSync(path.join(originalAudit, "call-02-persona-architect-response.json"), "utf8")) as { content: Array<Record<string, unknown>> };
  const neutralDesign = extractToolArtifact(neutralResponse.content, toolName);
  const personaDesign = extractToolArtifact(personaResponse.content, toolName);
  if (neutralDesign.upstreamHash !== manifest.evaluationHash || personaDesign.upstreamHash !== manifest.evaluationHash) {
    throw new Error("evaluation_persona_recovered_design_hash_changed");
  }
  const neutralDesignHash = hash(neutralDesign);
  const personaDesignHash = hash(personaDesign);
  const continuationId = new Date().toISOString().replaceAll(":", "-");
  const continuationDir = path.join(resolvedOutput, "continuations", continuationId);
  const continuationAudit = path.join(continuationDir, "audit");
  fs.mkdirSync(continuationAudit, { recursive: true });
  writeJson(continuationApproval, {
    approvedAt: new Date().toISOString(),
    approvedBy: "human_in_thread_after_funding",
    reason: "Resume from two frozen successful Fable artifacts; run only two builders and one review harness.",
    recoveredDesignHashes: { neutral: neutralDesignHash, persona: personaDesignHash },
    newCallCeiling: 3,
    retryPolicy: "none_within_continuation",
    continuationDir,
  });
  writeJson(path.join(continuationDir, "neutral-design-artifact.json"), neutralDesign);
  writeJson(path.join(continuationDir, "persona-design-artifact.json"), personaDesign);

  const calls = new ComparisonCalls(continuationAudit, 3);
  try {
    verifyPromptManifestIntegrity(manifest);
    const neutralBuilder = buildNeutralBuilderPrompt({
      evaluationContract, evaluationHash: manifest.evaluationHash,
      designArtifact: neutralDesign, designHash: neutralDesignHash, viewport,
    });
    const personaBuilder = buildNeutralBuilderPrompt({
      evaluationContract, evaluationHash: manifest.evaluationHash,
      designArtifact: personaDesign, designHash: personaDesignHash, viewport,
    });
    if (neutralBuilder.instruction !== manifest.builderInstruction || personaBuilder.instruction !== manifest.builderInstruction) {
      throw new Error("evaluation_persona_builder_instruction_changed");
    }
    const builderResults = await Promise.allSettled([
      calls.builder("neutral-builder", neutralBuilder.fullPrompt),
      calls.builder("persona-builder", personaBuilder.fullPrompt),
    ]);
    const neutralHtml = settledValue(builderResults[0]!, "neutral-builder");
    const personaHtml = settledValue(builderResults[1]!, "persona-builder");
    const armResults: Array<Omit<ArmResult, "diagnostics">> = [
      { arm: "neutral", designArtifact: neutralDesign, designHash: neutralDesignHash, html: neutralHtml, htmlHash: hash(neutralHtml) },
      { arm: "persona", designArtifact: personaDesign, designHash: personaDesignHash, html: personaHtml, htmlHash: hash(personaHtml) },
    ];
    if (crypto.randomInt(2) === 1) armResults.reverse();
    const candidates: Array<ArmResult & { label: string; relativePath: string; screenshot: string }> = [];
    for (let index = 0; index < armResults.length; index += 1) {
      const source = armResults[index]!;
      const slug = `candidate-${index === 0 ? "a" : "b"}`;
      const label = `Candidate ${index === 0 ? "A" : "B"}`;
      const directory = path.join(resolvedOutput, slug);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "experience.html"), source.html, "utf8");
      writeJson(path.join(directory, "design-artifact.json"), source.designArtifact);
      const screenshot = path.join(directory, "opening.png");
      const diagnostics = await inspectCandidate(path.join(directory, "experience.html"), screenshot);
      writeJson(path.join(directory, "opening-diagnostics.json"), diagnostics);
      candidates.push({ ...source, diagnostics, label, relativePath: `${slug}/experience.html`, screenshot });
    }

    verifyPromptManifestIntegrity(manifest);
    const actualHarnessPrompt = `${manifest.harnessPrompt}\n\nACTUAL BLINDED CANDIDATE HASHES\n${candidates.map((candidate) => `${candidate.label}: design=${candidate.designHash}; html=${candidate.htmlHash}`).join("\n")}`;
    fs.writeFileSync(path.join(continuationAudit, "review-harness-approved-base-prompt.txt"), manifest.harnessPrompt, "utf8");
    fs.writeFileSync(path.join(continuationAudit, "review-harness-runtime-supplement.txt"), actualHarnessPrompt.slice(manifest.harnessPrompt.length), "utf8");
    const harnessReview = await calls.harness(actualHarnessPrompt, candidates);
    writeJson(path.join(resolvedOutput, "harness-review.json"), harnessReview);

    const originalUsage = JSON.parse(fs.readFileSync(path.join(originalAudit, "usage.json"), "utf8")) as ComparisonUsage[];
    const allUsage = [...originalUsage, ...calls.usage.map((entry) => ({ ...entry, call: entry.call + originalUsage.length }))];
    fs.writeFileSync(path.join(resolvedOutput, "report.html"), renderComparisonReport({
      candidates: candidates.map(({ label, relativePath, arm, designHash, htmlHash }) => ({ label, relativePath, arm, designHash, htmlHash })),
      harnessReview,
      usage: allUsage,
      promptManifestRelativePath: "prompt-manifest.html",
    }), "utf8");
    const originalCostUsd = Number(originalUsage.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0).toFixed(6));
    const continuationCostUsd = Number(calls.usage.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0).toFixed(6));
    writeJson(path.join(resolvedOutput, "provenance.json"), {
      candidates: candidates.map(({ label, arm, designHash, htmlHash }) => ({ label, arm, designHash, htmlHash })),
      promptHashes: manifest.promptHashes,
      evaluationHash: manifest.evaluationHash,
      originalUsage,
      continuationUsage: calls.usage,
    });
    writeJson(path.join(resolvedOutput, "summary.json"), {
      status: "READY_FOR_BLINDED_HUMAN_REVIEW",
      originalSuccessfulArchitectCalls: 2,
      originalRejectedBuilderRequests: 2,
      continuationCalls: calls.usage.length,
      totalSuccessfulPaidCalls: originalUsage.filter((entry) => entry.status === "complete").length + calls.usage.filter((entry) => entry.status === "complete").length,
      originalCostUsd,
      continuationCostUsd,
      totalCostUsd: Number((originalCostUsd + continuationCostUsd).toFixed(6)),
      report: path.join(resolvedOutput, "report.html"),
      claim: "This compares generated evaluation quality and first-pass reliability; it does not establish learning, mastery, or causation.",
    });
    console.log(` 🎮 [evaluation-persona-comparison] [continuation] [ready-for-human-review] calls=${calls.usage.length} cost=$${continuationCostUsd.toFixed(2)} report=${path.join(resolvedOutput, "report.html")}`);
    return resolvedOutput;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeJson(path.join(continuationDir, "summary.json"), { status: "INCOMPLETE", reason: message, calls: calls.usage.length, usage: calls.usage });
    throw error;
  }
}

const invokedFile = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedFile) {
  const runCli = async (): Promise<void> => {
    const continueArgument = process.argv.find((argument) => argument.startsWith("--continue="));
    const runArgument = process.argv.find((argument) => argument.startsWith("--run="));
    if (continueArgument) await continueApprovedComparison(continueArgument.slice("--continue=".length));
    else if (runArgument) await runApprovedComparison(runArgument.slice("--run=".length));
    else createLockedPromptManifest();
  };
  runCli().catch((error) => {
    console.error(` 🎮 [evaluation-persona-comparison] [run] [failed] reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
