import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MODEL = process.env.SUNNY_SANDBOX_MODEL?.trim() || "claude-sonnet-5";
const ROOT = path.resolve(__dirname, "../../..");
const OUTPUT = path.join(
  ROOT,
  "outputs/math-creative-sandbox/unleashed",
  new Date().toISOString().replace(/[:.]/g, "-"),
);

const PROMPT = `Create one complete interactive learning experience that helps a child understand:

Multiplication as equal groups and arrays, connected to skip-counting and word-problem interpretation.

Teach the mathematical concept rather than reproducing worksheet questions.

You have full creative authority over:

- pedagogy and content;
- experience form;
- interaction;
- visual world;
- mission and purpose;
- consequences and recovery;
- progression and payoff;
- animation, audio, and effects;
- replay behavior;
- whether this is a game, simulation, story, manipulative, challenge, or another format.

You may use third-party browser libraries and public HTTPS assets. You may use technologies such as Three.js, PixiJS, Phaser, Matter.js, GSAP, Tone.js, Canvas, WebGL, SVG, CSS animation, or another suitable tool. Choose tools because they strengthen the experience, not merely to demonstrate them.

The mathematical reasoning should meaningfully affect what happens in the experience. Do not reproduce the original worksheet questions.

Return one complete HTML document that runs inside a 1365×768 iframe with touch or mouse.

Do not explain your choices. Return HTML only.`;

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function extractHtml(raw: string): string {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] || raw).trim();
}

async function main(): Promise<void> {
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, "scenario-d.prompt.txt"), PROMPT);

  const started = Date.now();
  const response = await new Anthropic().messages.stream({
    model: MODEL,
    max_tokens: 32_000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages: [{ role: "user", content: PROMPT }],
  } as never, { timeout: 600_000 }).finalMessage();

  const raw = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  const html = extractHtml(raw);
  fs.writeFileSync(path.join(OUTPUT, "scenario-d.raw-response.txt"), raw);
  fs.writeFileSync(path.join(OUTPUT, "scenario-d.html"), html);
  fs.writeFileSync(path.join(OUTPUT, "scenario-d.srcdoc.txt"), html);
  fs.writeFileSync(path.join(OUTPUT, "generation.json"), JSON.stringify({
    model: MODEL,
    elapsedMs: Date.now() - started,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    stopReason: response.stop_reason,
    rawResponseHash: hash(raw),
    savedHtmlHash: hash(html),
    iframeSrcDocHash: hash(html),
    normalizationApplied: raw === html ? null : "markdown_code_fence_removed",
  }, null, 2));

  process.stdout.write(`${OUTPUT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
