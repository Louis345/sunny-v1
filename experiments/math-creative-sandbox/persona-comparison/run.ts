import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type Arm = "neutral" | "personality";
type Stage = "academic-lead" | "curriculum-writer" | "experience-architect" | "experience-engineer";

type Usage = {
  call: number;
  arm: Arm;
  stage: Stage;
  model: string;
  status: "complete" | "failed";
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  elapsedMs: number;
  stopReason?: string;
  error?: string;
};

type StageResult = {
  hash: string;
  content: Record<string, unknown>;
};

const ROOT = path.resolve(process.cwd());
const HISTORICAL_ROOT = path.join(
  ROOT,
  "outputs/math-creative-sandbox/frozen-artifact-showdown/2026-07-29T15-25-02-171Z",
);
const MAX_CALLS = 8;
const MAX_COST_USD = 6;
const ENGINEER_MAX_TOKENS = 52_000;

const MODELS: Record<Stage, string> = {
  "academic-lead": "claude-opus-5",
  "curriculum-writer": "claude-opus-5",
  "experience-architect": "claude-fable-5",
  "experience-engineer": "claude-opus-5",
};

const OUTPUT_LIMITS: Record<Stage, number> = {
  "academic-lead": 7_000,
  "curriculum-writer": 10_000,
  "experience-architect": 12_000,
  "experience-engineer": ENGINEER_MAX_TOKENS,
};

const RESERVED_COST: Record<Stage, number> = {
  "academic-lead": 0.4,
  "curriculum-writer": 0.5,
  "experience-architect": 0.7,
  "experience-engineer": 1.5,
};

const ACADEMIC_CONTRACT = `Teach Grade 3 multiplication through fresh material:
- interpret multiplicative situations as number of equal groups and amount in each group;
- construct or read equal-group and array representations;
- connect the representation to a multiplication equation and product;
- increase mathematical independence and challenge over the experience.

The experience must remain mathematically correct, usable with touch or mouse in a 1365×768 iframe, and complete from opening through payoff. Everything else is creatively mutable.`;

const REINA_EVIDENCE = [
  { evidenceId: "reina:age:2026-07", fact: "The child is currently nine years old." },
  { evidenceId: "reina:conversation:wrestling", fact: "She independently chose wrestling competition and a state-championship loss as a conversation topic." },
  { evidenceId: "reina:riddles:harder", fact: "She asked to continue difficult riddles across sessions and later explicitly requested harder riddles." },
  { evidenceId: "reina:riddles:logic", fact: "She immediately noticed repeated riddles and questioned faulty riddle logic." },
  { evidenceId: "reina:riddles:scaffold", fact: "When stuck on a multi-step logic problem, she requested hints and continued after scaffolding." },
  { evidenceId: "reina:activity-feedback:small-sample", fact: "Small-sample human and child feedback was positive for a randomized reveal spelling activity and a spoken-pronunciation activity." },
];

const PERSONALITIES: Record<Stage, Record<Arm, string>> = {
  "academic-lead": {
    neutral: "You are Sunny's Academic Lead. Produce the requested educational charter from the supplied evidence.",
    personality: "You are Mira, Sunny's Academic Lead. You are decisive, evidence-skeptical, intellectually humble, and accountable for every prediction. You protect the child's dignity, resist unsupported certainty, and record uncertainty without making the child-facing plan timid.",
  },
  "curriculum-writer": {
    neutral: "You are Sunny's Curriculum Writer. Author the requested content within the immutable charter.",
    personality: "You are Theo, an expert elementary curriculum designer. You are patient, concrete-minded, age-aware, inventive, and meticulous about ambiguity. You verify every answer and design challenge that respects a capable nine-year-old.",
  },
  "experience-architect": {
    neutral: "You are Sunny's Experience Architect. Design the requested experience from the frozen academic packet.",
    personality: "You are Juniper, Sunny's Experience Architect. You are playful, bold, visually opinionated, child-eyed, and allergic to decorative quizzes. You love clear invitations, meaningful world reactions, escalating anticipation, dignified recovery, and earned payoff.",
  },
  "experience-engineer": {
    neutral: "You are Sunny's Experience Engineer. Implement the frozen academic and design contracts.",
    personality: "You are Rowan, Sunny's Experience Engineer. You are calm, meticulous, proud of invisible polish, and attentive to how children actually touch and read interfaces. You anticipate confusion and consider an experience unfinished until every action visibly matters.",
  },
};

const STAGE_RULES: Record<Stage, string> = {
  "academic-lead": `Return one compact immutable academic charter. Include charterId, upstreamHash, scope, boundaries, assumptions, representativeLearningResponsibility, progression, and evidenceRequiredNext. Each assumption must include decisionId, decision, evidenceIds, confidence from 0 to 1, uncertainty, falsifyingEvidence, and measurementKeys. Use only supplied evidence IDs. Do not create questions, mechanics, themes, visuals, rewards, libraries, or HTML.`,
  "curriculum-writer": `Return one immutable curriculum packet. Include packetId, upstreamHash, five to seven fresh items, supportProgression, and charterConcern. Every item must include itemId, prompt, options when applicable, correctAnswer, responseContract, sourceLineage, exposure, and academicTarget. Do not copy a worksheet question. Preserve the charter. Do not choose mechanics, themes, visuals, rewards, or HTML.`,
  "experience-architect": `Return one immutable design artifact. Include artifactId, upstreamHash, title, audienceRationale, openingPromise, firstThreeSeconds, firstAction, interactionDemonstration, coreInteraction, mathAsPower, stakes, consequences, recovery, progression, interactionContinuity, worldReaction, payoff, replayVariation, visualDirection, motionDirection, soundDirection, usefulLibraries, engagementPrediction, falsifyingEvidence, and decisionRecords. The mathematics must visibly control the world. Do not change questions, answers, scope, or difficulty.`,
  "experience-engineer": `Return one complete standalone HTML document and nothing else. Implement the frozen curriculum and design in a 1365×768 iframe. It must be immediately understandable to a nine-year-old, work with touch or mouse, visibly react to correct and incorrect actions, progress through a complete experience, and deliver the promised payoff. External HTTPS libraries and assets are allowed. Do not access Sunny APIs, cookies, localStorage, sessionStorage, IndexedDB, child data, or currency. Do not use speech synthesis or raw oscillator audio.`,
};

const TOOL_SCHEMAS: Record<Exclude<Stage, "experience-engineer">, Record<string, unknown>> = {
  "academic-lead": {
    type: "object",
    additionalProperties: true,
    required: ["charterId", "upstreamHash", "scope", "boundaries", "assumptions", "representativeLearningResponsibility", "progression", "evidenceRequiredNext"],
    properties: {
      charterId: { type: "string" },
      upstreamHash: { type: "string" },
      scope: { type: "array", items: { type: "string" } },
      boundaries: { type: "object" },
      assumptions: { type: "array", minItems: 1, items: { type: "object" } },
      representativeLearningResponsibility: { type: "object" },
      progression: { type: "array", items: { type: "string" } },
      evidenceRequiredNext: { type: "array", items: { type: "string" } },
    },
  },
  "curriculum-writer": {
    type: "object",
    additionalProperties: true,
    required: ["packetId", "upstreamHash", "items", "supportProgression", "charterConcern"],
    properties: {
      packetId: { type: "string" },
      upstreamHash: { type: "string" },
      items: { type: "array", minItems: 5, maxItems: 7, items: { type: "object" } },
      supportProgression: { type: "array", items: { type: "string" } },
      charterConcern: {},
    },
  },
  "experience-architect": {
    type: "object",
    additionalProperties: true,
    required: ["artifactId", "upstreamHash", "title", "audienceRationale", "openingPromise", "firstThreeSeconds", "firstAction", "interactionDemonstration", "coreInteraction", "mathAsPower", "stakes", "consequences", "recovery", "progression", "interactionContinuity", "worldReaction", "payoff", "replayVariation", "visualDirection", "motionDirection", "soundDirection", "usefulLibraries", "engagementPrediction", "falsifyingEvidence", "decisionRecords"],
    properties: {
      artifactId: { type: "string" },
      upstreamHash: { type: "string" },
      title: { type: "string" },
      progression: { type: "array", items: { type: "string" } },
      usefulLibraries: { type: "array", items: { type: "string" } },
      decisionRecords: { type: "array", items: { type: "object" } },
    },
  },
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  const source = Buffer.isBuffer(value) || typeof value === "string" ? value : stable(value);
  return crypto.createHash("sha256").update(source).digest("hex");
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

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const inputRate = /fable/i.test(model) ? 6 : 5;
  const outputRate = /fable/i.test(model) ? 30 : 25;
  return inputTokens / 1_000_000 * inputRate + outputTokens / 1_000_000 * outputRate;
}

function extractTool(response: Anthropic.Messages.Message, name: string): Record<string, unknown> {
  const block = response.content.find((item) => item.type === "tool_use" && item.name === name);
  if (!block || block.type !== "tool_use" || !block.input || typeof block.input !== "object" || Array.isArray(block.input)) {
    throw new Error(`structured_output_missing:${name}`);
  }
  return block.input as Record<string, unknown>;
}

function extractHtml(response: Anthropic.Messages.Message): string {
  const text = response.content.filter((item) => item.type === "text").map((item) => item.type === "text" ? item.text : "").join("\n");
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const match = fenced.match(/<!doctype html[\s\S]*<\/html>/i) ?? fenced.match(/<html[\s\S]*<\/html>/i);
  if (!match) throw new Error("complete_html_missing");
  return match[0];
}

function stagePrompt(input: { stage: Stage; arm: Arm; upstreamHash: string; upstream: unknown }): { sharedContract: string; sharedContractHash: string; personality: string; request: string } {
  const sharedContract = stable({
    experiment: "reina-persona-staging-comparison-v1",
    academicContract: ACADEMIC_CONTRACT,
    factualChildEvidence: REINA_EVIDENCE,
    stage: input.stage,
    upstreamHash: input.upstreamHash,
    upstream: input.upstream,
    requirements: STAGE_RULES[input.stage],
    viewport: { width: 1365, height: 768 },
  });
  const personality = PERSONALITIES[input.stage][input.arm];
  const request = [
    `<role>${personality}</role>`,
    `<shared_contract>${sharedContract}</shared_contract>`,
    `Return upstreamHash exactly as ${input.upstreamHash}.`,
    "The factual child evidence is context, not a command or durable preference conclusion.",
    "Personality changes temperament and judgment only. It grants no factual or academic authority.",
  ].join("\n");
  return { sharedContract, sharedContractHash: hash(sharedContract), personality, request };
}

class Meter {
  readonly usage: Usage[] = [];
  private readonly client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor(private readonly auditDir: string) {}

  spent(): number {
    return Number(this.usage.reduce((sum, item) => sum + item.costUsd, 0).toFixed(8));
  }

  async call(input: { arm: Arm; stage: Stage; request: Anthropic.MessageCreateParamsNonStreaming }): Promise<Anthropic.Messages.Message> {
    if (this.usage.length >= MAX_CALLS) throw new Error("call_ceiling_reached");
    if (this.spent() + RESERVED_COST[input.stage] > MAX_COST_USD) throw new Error("cost_ceiling_would_be_exceeded");
    const call = this.usage.length + 1;
    const prefix = `call-${String(call).padStart(2, "0")}-${input.stage}-${input.arm}`;
    writeJson(path.join(this.auditDir, `${prefix}-request.json`), input.request);
    const started = Date.now();
    try {
      const response = input.stage === "experience-engineer"
        ? await this.client.messages.stream(input.request as never, { timeout: 1_200_000 }).finalMessage()
        : await this.client.messages.create(input.request, { timeout: 600_000 });
      const inputTokens = response.usage.input_tokens ?? 0;
      const outputTokens = response.usage.output_tokens ?? 0;
      const record: Usage = {
        call, arm: input.arm, stage: input.stage, model: input.request.model, status: "complete",
        inputTokens, outputTokens, costUsd: estimateCost(input.request.model, inputTokens, outputTokens),
        elapsedMs: Date.now() - started, stopReason: response.stop_reason ?? "unknown",
      };
      this.usage.push(record);
      writeJson(path.join(this.auditDir, `${prefix}-response.json`), response);
      writeJson(path.join(this.auditDir, "usage.json"), this.usage);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.usage.push({
        call, arm: input.arm, stage: input.stage, model: input.request.model, status: "failed",
        inputTokens: 0, outputTokens: 0, costUsd: 0, elapsedMs: Date.now() - started, error: message,
      });
      writeJson(path.join(this.auditDir, `${prefix}-error.json`), { error: message });
      writeJson(path.join(this.auditDir, "usage.json"), this.usage);
      throw error;
    }
  }
}

function structuredRequest(stage: Exclude<Stage, "experience-engineer">, prompt: string, upstreamHash: string): Anthropic.MessageCreateParamsNonStreaming {
  const toolName = `submit_${stage.replaceAll("-", "_")}`;
  const schema = structuredClone(TOOL_SCHEMAS[stage]);
  const properties = (schema.properties as Record<string, Record<string, unknown>>);
  properties.upstreamHash = { type: "string", enum: [upstreamHash] };
  return {
    model: MODELS[stage],
    max_tokens: OUTPUT_LIMITS[stage],
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    messages: [{ role: "user", content: prompt }],
    tools: [{ name: toolName, description: `Submit the complete ${stage} artifact.`, input_schema: schema }],
    tool_choice: { type: "tool", name: toolName },
  } as never;
}

async function runStructured(input: { arm: Arm; stage: Exclude<Stage, "experience-engineer">; upstream: StageResult; meter: Meter; armDir: string }): Promise<StageResult> {
  const prompt = stagePrompt({ stage: input.stage, arm: input.arm, upstreamHash: input.upstream.hash, upstream: input.upstream.content });
  writeJson(path.join(input.armDir, `${input.stage}-prompt.json`), prompt);
  const response = await input.meter.call({ arm: input.arm, stage: input.stage, request: structuredRequest(input.stage, prompt.request, input.upstream.hash) });
  const toolName = `submit_${input.stage.replaceAll("-", "_")}`;
  const content = extractTool(response, toolName);
  if (content.upstreamHash !== input.upstream.hash) throw new Error(`${input.stage}:upstream_hash_changed`);
  if (input.stage === "curriculum-writer") {
    const items = content.items;
    if (!Array.isArray(items) || items.length < 5 || items.length > 7) throw new Error("curriculum_item_count_invalid");
  }
  const file = input.stage === "academic-lead" ? "academic-charter.json" : input.stage === "curriculum-writer" ? "curriculum-packet.json" : "design-artifact.json";
  writeJson(path.join(input.armDir, file), content);
  return { hash: hash(content), content };
}

async function runEngineer(input: { arm: Arm; curriculum: StageResult; design: StageResult; meter: Meter; armDir: string }): Promise<void> {
  const upstream = { curriculum: input.curriculum.content, design: input.design.content };
  const prompt = stagePrompt({ stage: "experience-engineer", arm: input.arm, upstreamHash: input.design.hash, upstream });
  writeJson(path.join(input.armDir, "experience-engineer-prompt.json"), prompt);
  const response = await input.meter.call({
    arm: input.arm,
    stage: "experience-engineer",
    request: {
      model: MODELS["experience-engineer"],
      max_tokens: ENGINEER_MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      messages: [{ role: "user", content: prompt.request }],
    } as never,
  });
  const html = extractHtml(response);
  if (/localStorage|sessionStorage|indexedDB|document\.cookie|fetch\s*\(\s*["'`]\/api\//i.test(html)) throw new Error("experience_isolation_violation");
  if (!/<script[\s>]/i.test(html) || !/(button|canvas|svg|input)/i.test(html)) throw new Error("interactive_html_missing");
  fs.writeFileSync(path.join(input.armDir, "experience.html"), html, "utf8");
}

function copyHistorical(outputDir: string): { htmlHash: string; designHash: string; costUsd: number } {
  const sourceHtml = path.join(HISTORICAL_ROOT, "creative-roi-profile/rebuilt/experience.html");
  const sourceDesign = path.join(HISTORICAL_ROOT, "creative-roi-profile/fable-decision.json");
  const run = JSON.parse(fs.readFileSync(path.join(HISTORICAL_ROOT, "creative-roi-profile/run.json"), "utf8"));
  const destination = path.join(outputDir, "historical");
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(sourceHtml, path.join(destination, "experience.html"));
  fs.copyFileSync(sourceDesign, path.join(destination, "design-artifact.json"));
  const htmlHash = hash(fs.readFileSync(sourceHtml));
  const designHash = hash(fs.readFileSync(sourceDesign));
  if (hash(fs.readFileSync(path.join(destination, "experience.html"))) !== htmlHash) throw new Error("historical_html_changed");
  return { htmlHash, designHash, costUsd: Number(run.incrementalCostUsd ?? 0) };
}

function deterministicOrder(seed: string): Array<"historical" | Arm> {
  return (["historical", "neutral", "personality"] as const)
    .map((arm) => ({ arm, key: hash(`${seed}:${arm}`) }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((item) => item.arm);
}

function renderReport(input: {
  order: Array<"historical" | Arm>;
  provenance: Record<"historical" | Arm, Record<string, unknown>>;
  summary: Record<string, unknown>;
}): string {
  const dimensions = ["First-action clarity", "Nine-year-old reading load", "Academic correctness", "Math controls the world", "Visual and motion quality", "Consequence and recovery", "Progression and payoff", "Desire to continue or replay", "Overall quality"];
  const cards = input.order.map((arm, index) => {
    const letter = String.fromCharCode(65 + index);
    return `<article><h2>Candidate ${letter}</h2><iframe src="${arm}/experience.html" title="Candidate ${letter}" allow="autoplay; fullscreen"></iframe><a href="${arm}/experience.html" target="_blank">Open full size ↗</a><div class="scores">${dimensions.map((dimension) => `<label>${escapeHtml(dimension)}<input type="range" min="1" max="5" value="3"><output>3</output></label>`).join("")}</div><label>What was immediately understandable?<textarea></textarea></label><label>What was confusing?<textarea></textarea></label><label>Did an action visibly change the world?<textarea></textarea></label><label>Would Reina continue without adult explanation?<textarea></textarea></label><label>Would you ship this?<textarea></textarea></label></article>`;
  }).join("");
  const encoded = Buffer.from(JSON.stringify({ order: input.order, provenance: input.provenance, summary: input.summary })).toString("base64");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reina staged persona comparison</title><style>*{box-sizing:border-box}body{margin:0;background:#eef2fa;color:#17213b;font:16px system-ui}.hero{padding:30px;background:linear-gradient(135deg,#17234a,#673ca2);color:#fff}.hero p{max-width:1000px}.wrap{max-width:1900px;margin:auto;padding:20px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}article,.reveal-box{background:#fff;border-radius:20px;padding:16px;box-shadow:0 12px 30px #16234b1c}iframe{width:100%;aspect-ratio:1365/768;border:2px solid #cbd5e8;border-radius:14px;background:#fff}a{display:inline-block;margin:10px 0;color:#4b36a6;font-weight:800}.scores label,article>label{display:block;margin:10px 0;font-weight:700}.scores input{width:62%;margin:0 8px;vertical-align:middle}textarea{display:block;width:100%;min-height:64px;margin-top:4px}.reveal{display:block;margin:28px auto;padding:15px 25px;border:0;border-radius:999px;background:#f5b82e;font-weight:900;font-size:18px}.caveat{background:#fff5d6;border-left:5px solid #e4a814;padding:12px 16px;margin:16px 0}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #dde3ef;text-align:left}pre{white-space:pre-wrap;word-break:break-word}@media(max-width:1200px){.grid{grid-template-columns:1fr}}</style></head><body><header class="hero"><h1>Which experience would you ship for Reina?</h1><p>Play and score all three before revealing their pipeline and cost. Both fresh arms started with the same multiplication contract, factual Reina evidence, models, reasoning settings, and 52k implementation ceiling; the persona arm's disclosed 78k recovery is counted in its reliability and cost.</p></header><main class="wrap"><div class="caveat"><strong>What this proves:</strong> Neutral versus personality is the strict controlled comparison through design. The historical candidate is the preserved Reina-backed quality floor and had a different generation architecture, so it is a practical—not scientific—staging comparison. The persona implementation required extra compute after failing at the shared ceiling.</div><section class="grid">${cards}</section><button id="reveal" class="reveal">Reveal provenance and cost</button><section id="details" class="reveal-box" hidden></section></main><script>document.querySelectorAll('input[type=range]').forEach(i=>i.addEventListener('input',()=>i.nextElementSibling.value=i.value));document.getElementById('reveal').addEventListener('click',()=>{const d=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${encoded}'),c=>c.charCodeAt(0))));const rows=d.order.map((arm,i)=>{const p=d.provenance[arm];return '<tr><td>Candidate '+String.fromCharCode(65+i)+'</td><td>'+p.label+'</td><td>'+p.models+'</td><td>$'+Number(p.costUsd||0).toFixed(3)+'</td><td>'+p.status+'</td></tr>'}).join('');const t=document.getElementById('details');t.innerHTML='<h2>Provenance and cost</h2><table><tr><th>Candidate</th><th>Pipeline</th><th>Models</th><th>Cost</th><th>Status</th></tr>'+rows+'</table><pre>'+JSON.stringify(d.summary,null,2)+'</pre>';t.hidden=false;document.getElementById('reveal').disabled=true});</script></body></html>`;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY_missing");
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const outputDir = path.join(ROOT, "outputs/math-creative-sandbox/reina-persona-staging-comparison", stamp);
  const auditDir = path.join(outputDir, "audit");
  const sharedDir = path.join(outputDir, "shared-input");
  fs.mkdirSync(auditDir, { recursive: true });
  const historical = copyHistorical(outputDir);
  const sharedInput = { academicContract: ACADEMIC_CONTRACT, factualChildEvidence: REINA_EVIDENCE, viewport: { width: 1365, height: 768 } };
  const initial: StageResult = { hash: hash(sharedInput), content: sharedInput };
  writeJson(path.join(sharedDir, "frozen-input.json"), sharedInput);
  writeJson(path.join(sharedDir, "hashes.json"), { sharedInputHash: initial.hash, historical });

  const meter = new Meter(auditDir);
  const state: Record<Arm, { failure?: string; charter?: StageResult; curriculum?: StageResult; design?: StageResult; complete?: boolean }> = { neutral: {}, personality: {} };
  const stages: Stage[] = ["academic-lead", "curriculum-writer", "experience-architect", "experience-engineer"];

  for (const stage of stages) {
    for (const arm of ["neutral", "personality"] as const) {
      if (state[arm].failure) continue;
      const armDir = path.join(outputDir, arm);
      fs.mkdirSync(armDir, { recursive: true });
      console.log(` 🎮 [reina-persona-comparison] [${stage}] [running] arm=${arm} spent=$${meter.spent().toFixed(3)}`);
      try {
        if (stage === "academic-lead") state[arm].charter = await runStructured({ arm, stage, upstream: initial, meter, armDir });
        if (stage === "curriculum-writer") state[arm].curriculum = await runStructured({ arm, stage, upstream: state[arm].charter!, meter, armDir });
        if (stage === "experience-architect") state[arm].design = await runStructured({ arm, stage, upstream: state[arm].curriculum!, meter, armDir });
        if (stage === "experience-engineer") {
          await runEngineer({ arm, curriculum: state[arm].curriculum!, design: state[arm].design!, meter, armDir });
          state[arm].complete = true;
        }
        console.log(` 🎮 [reina-persona-comparison] [${stage}] [saved] arm=${arm} spent=$${meter.spent().toFixed(3)}`);
      } catch (error) {
        state[arm].failure = error instanceof Error ? error.message : String(error);
        writeJson(path.join(armDir, "failure.json"), { stage, error: state[arm].failure });
        console.log(` 🎮 [reina-persona-comparison] [${stage}] [failed] arm=${arm} reason=${state[arm].failure}`);
      }
    }
  }

  const status = state.neutral.complete && state.personality.complete ? "READY_FOR_HUMAN_REVIEW" : "INCOMPLETE";
  const order = deterministicOrder(stamp);
  const armCost = (arm: Arm) => meter.usage.filter((item) => item.arm === arm).reduce((sum, item) => sum + item.costUsd, 0);
  const summary = {
    status,
    experimentQuestion: "Does splitting the academic work preserve or improve the historical quality floor, and does adding role personalities improve the staged pipeline enough to justify its incremental cost?",
    controlledComparison: "neutral versus personality",
    practicalComparison: "historical ARRAY ARENA versus both staged arms",
    historical,
    freshSpendUsd: meter.spent(),
    budgetUsd: MAX_COST_USD,
    calls: meter.usage.length,
    callCeiling: MAX_CALLS,
    engineerTokenCeiling: ENGINEER_MAX_TOKENS,
    failures: { neutral: state.neutral.failure ?? null, personality: state.personality.failure ?? null },
    usage: meter.usage,
    warning: "This evaluates first-pass generation quality and reliability, not actual child learning.",
  };
  writeJson(path.join(outputDir, "summary.json"), summary);
  const provenance = {
    historical: { label: "Historical Reina-backed quality floor: ARRAY ARENA", models: "Fable 5 → Opus 5", costUsd: historical.costUsd, status: "complete" },
    neutral: { label: "Fresh staged neutral roles", models: "Opus 5 → Opus 5 → Fable 5 → Opus 5", costUsd: armCost("neutral"), status: state.neutral.complete ? "complete" : "incomplete" },
    personality: { label: "Fresh staged personalities: Mira → Theo → Juniper → Rowan", models: "Opus 5 → Opus 5 → Fable 5 → Opus 5", costUsd: armCost("personality"), status: state.personality.complete ? "complete" : "incomplete" },
  };
  fs.writeFileSync(path.join(outputDir, "report.html"), renderReport({ order, provenance, summary }), "utf8");
  console.log(` 🎮 [reina-persona-comparison] [complete] status=${status} calls=${meter.usage.length}/${MAX_CALLS} cost=$${meter.spent().toFixed(3)} report=${path.join(outputDir, "report.html")}`);
  if (status === "INCOMPLETE") process.exitCode = 1;
}

main().catch((error) => {
  console.error(` 🎮 [reina-persona-comparison] [fatal] reason=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
