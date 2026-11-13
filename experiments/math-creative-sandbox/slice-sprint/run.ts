import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const SOURCE_ROOT = "/Users/jamaltaylor/Development/sunny-math-artifact-pipeline";
const HOMEWORK = "hw-math-7ead7e33";
const SOURCE_DRAFT = path.join(SOURCE_ROOT, "src/context/reina/homework/direct-drafts", HOMEWORK);
const SOURCE_GAME = path.join(SOURCE_ROOT, "src/context/reina/homework/games", HOMEWORK, "N3B.html");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = process.env.SUNNY_SLICE_RUN
  ? path.resolve(process.env.SUNNY_SLICE_RUN)
  : path.join(ROOT, "outputs/math-creative-sandbox/slice-sprint-redesign", stamp);
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const sha = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const save = (name: string, value: string | Buffer) => {
  const file = path.join(out, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
  return file;
};
const json = (name: string, value: unknown) => save(name, `${JSON.stringify(value, null, 2)}\n`);
const text = (message: Anthropic.Messages.Message) => message.content
  .filter((block) => block.type === "text")
  .map((block) => block.type === "text" ? block.text : "")
  .join("\n");
const extractJson = (raw: string) => {
  const fenced = raw.trim().match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const value = fenced || raw.trim();
  return JSON.parse(value.slice(value.indexOf("{"), value.lastIndexOf("}") + 1));
};
const extractHtml = (raw: string) => {
  const fenced = raw.trim().match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const value = fenced || raw.trim();
  const start = value.search(/<!doctype html|<html[\s>]/i);
  const end = value.toLowerCase().lastIndexOf("</html>");
  if (start < 0 || end < start) throw new Error("complete_html_document_missing");
  return value.slice(start, end + 7);
};
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function call(model: string, prompt: string, maxTokens: number, reasoning = true) {
  const started = Date.now();
  const response = await client.messages.stream({
    model,
    max_tokens: maxTokens,
    thinking: reasoning ? { type: "adaptive" } : { type: "disabled" },
    ...(reasoning ? { output_config: { effort: "high" } } : {}),
    messages: [{ role: "user", content: prompt }],
  } as never, { timeout: 600_000 }).finalMessage();
  return {
    raw: text(response),
    inputTokens: response.usage.input_tokens || 0,
    outputTokens: response.usage.output_tokens || 0,
    elapsedMs: Date.now() - started,
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY_missing");
  const program = JSON.parse(fs.readFileSync(path.join(SOURCE_DRAFT, "math-learning-program.json"), "utf8"));
  const checkpoint = JSON.parse(fs.readFileSync(path.join(SOURCE_DRAFT, "design-checkpoint.json"), "utf8"));
  const academic = program.activities.find((activity: { id: string }) => activity.id === "N3B");
  const currentDesign = checkpoint.artifacts.find((artifact: { nodeId: string }) => artifact.nodeId === "N3B");
  const currentHtml = fs.readFileSync(SOURCE_GAME);
  if (!academic || !currentDesign) throw new Error("slice_sprint_source_missing");

  save("control/experience.html", currentHtml);
  json("source/academic-contract.json", academic);
  json("source/current-design-artifact.json", currentDesign);

  const designPrompt = `You are the experience architect for one child learning activity.

The academic contract below is immutable. Preserve its target, difficulty boundaries, item content, response contracts, and evidence limits exactly.

ACADEMIC CONTRACT
${JSON.stringify(academic, null, 2)}

CURRENT DESIGN ARTIFACT
${JSON.stringify(currentDesign, null, 2)}

FACTUAL HUMAN OBSERVATIONS FROM THE CURRENT IMPLEMENTATION
- A human played the activity and judged it a strong learning activity but only a moderate game.
- The visible experience did not fully deliver the anticipation, changing world, or payoff promised by its title and design artifact.
- The opening required more reading than the human expected for a nine-year-old.
- The completion payoff appeared mostly static.
- Incorrect work advanced visible dock progress, which made completion progress and mathematical success difficult to distinguish.
- The human wants to keep experimenting and has not concluded which mechanic, theme, consequence, or presentation is best.

Independently decide whether to preserve, substantially revise, or replace the current creative direction. Do not treat the observations as instructions for a particular solution. Choose the experience form, mechanics, stakes, consequences, recovery, pacing, visual language, motion, sound, progression, and payoff yourself.

The result should be immediately understandable to a nine-year-old, make the mathematics causally affect what happens, and give the child a reason to continue. It may use any HTTPS browser library or asset that helps.

Return one complete design artifact as JSON only, using the same field names as CURRENT DESIGN ARTIFACT. Preserve nodeId and academicContractHash. Add one field named revisionRationale explaining what you preserved, changed, or replaced and why.`;
  save("prompts/design.txt", designPrompt);
  const existingDesignFile = path.join(out, "candidate/design-artifact.json");
  let designCall = { raw: "", inputTokens: 0, outputTokens: 0, elapsedMs: 0 };
  let revisedDesign: Record<string, unknown>;
  if (fs.existsSync(existingDesignFile)) {
    process.stdout.write("[1/2] Reusing frozen Fable design artifact\n");
    revisedDesign = JSON.parse(fs.readFileSync(existingDesignFile, "utf8"));
  } else {
    process.stdout.write("[1/2] Fable reconsidering the Slice Sprint design\n");
    designCall = await call("claude-fable-5", designPrompt, 14_000);
    save("responses/design.txt", designCall.raw);
    revisedDesign = extractJson(designCall.raw);
    json("candidate/design-artifact.json", revisedDesign);
  }

  const buildPrompt = `Implement one polished standalone browser experience from the frozen academic contract and architect-authored design artifact below.

ACADEMIC CONTRACT — DO NOT CHANGE
${JSON.stringify(academic, null, 2)}

DESIGN ARTIFACT — IMPLEMENT FAITHFULLY
${JSON.stringify(revisedDesign, null, 2)}

Build for a nine-year-old using a 1365×768 viewport. The first action must be visually understandable without reading a paragraph. Implement meaningful interaction through completion, including incorrect-action recovery, visible progression, world reaction, and payoff. Preserve the distinction between completion progress and mathematical success. You may use inline CSS, SVG, Canvas, WebGL, audio, and external HTTPS libraries or assets. Do not use Sunny runtime scaffolding; this is an isolated prototype.

Return one complete self-contained HTML document and nothing else.`;
  save("prompts/implementation.txt", buildPrompt);
  process.stdout.write("[2/2] Opus implementing the frozen revised artifact\n");
  const buildCall = await call("claude-opus-5", buildPrompt, 32_000, false);
  save("responses/implementation.txt", buildCall.raw);
  const candidateHtml = extractHtml(buildCall.raw);
  save("candidate/experience.html", candidateHtml);

  const fableCost = (designCall.inputTokens * 10 + designCall.outputTokens * 50) / 1_000_000;
  const opusCost = (buildCall.inputTokens * 5 + buildCall.outputTokens * 25) / 1_000_000;
  json("run.json", {
    status: "human_review",
    academicContractHash: sha(JSON.stringify(academic)),
    currentDesignHash: sha(JSON.stringify(currentDesign)),
    revisedDesignHash: sha(JSON.stringify(revisedDesign)),
    controlHtmlHash: sha(currentHtml),
    candidateHtmlHash: sha(candidateHtml),
    fable: { ...designCall, raw: undefined, estimatedCostUsd: fableCost },
    opus: { ...buildCall, raw: undefined, estimatedCostUsd: opusCost },
    totalEstimatedCostUsd: fableCost + opusCost,
  });

  const comparison = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Slice Sprint Experiment</title><style>
*{box-sizing:border-box}body{margin:0;background:#09111f;color:#f7f1df;font-family:system-ui;padding:24px}h1{text-align:center;margin:0;font-size:42px}.lede{text-align:center;color:#aab8d0;margin:8px 0 24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:1800px;margin:auto}.card{background:#141f34;border:1px solid #34445f;border-radius:18px;overflow:hidden}.card header{padding:15px 18px}.card h2{margin:0}.card p{margin:5px 0 0;color:#aab8d0}.card iframe{display:block;width:100%;aspect-ratio:1365/768;border:0;background:white}.card a{display:inline-block;margin:12px 16px;color:#70d7ff;font-weight:800}.card textarea{display:block;width:calc(100% - 32px);min-height:90px;margin:0 16px 16px;padding:10px;border-radius:10px;background:#09111f;color:white;border:1px solid #455573}.details{max-width:1800px;margin:18px auto;background:#141f34;border:1px solid #34445f;border-radius:18px;padding:18px}.details pre{white-space:pre-wrap;color:#cbd5e5}@media(max-width:1000px){.grid{grid-template-columns:1fr}}
</style></head><body><h1>Slice Sprint: Current vs Experimental</h1><p class="lede">Frozen academics · one Fable design decision · one Opus implementation · no production changes · estimated cost $${(fableCost + opusCost).toFixed(3)}</p><main class="grid"><section class="card"><header><h2>Current Slice Sprint</h2><p>Published control</p></header><iframe src="./control/experience.html" title="Current Slice Sprint" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe><a href="./control/experience.html" target="_blank">Open full size ↗</a><textarea placeholder="What works and what feels flat?"></textarea></section><section class="card"><header><h2>Fable → Opus Candidate</h2><p>One independent design reconsideration</p></header><iframe src="./candidate/experience.html" title="Experimental Slice Sprint" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen"></iframe><a href="./candidate/experience.html" target="_blank">Open full size ↗</a><textarea placeholder="Is this materially clearer and more exciting?"></textarea></section></main><section class="details"><details><summary>Fable's revised design artifact</summary><pre>${escape(JSON.stringify(revisedDesign, null, 2))}</pre></details></section></body></html>`;
  save("comparison.html", comparison);
  process.stdout.write(`Ready: ${path.join(out, "comparison.html")}\nCost: $${(fableCost + opusCost).toFixed(3)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
