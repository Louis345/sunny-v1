import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MODEL = process.env.SUNNY_SANDBOX_MODEL?.trim() || "claude-sonnet-5";
const ROOT = path.resolve(__dirname, "../../..");
const OUTPUT = path.join(
  ROOT,
  "outputs/math-creative-sandbox/design-first",
  new Date().toISOString().replace(/[:.]/g, "-"),
);

const DESIGN = {
  title: "The Fractured Arena",
  mission: "Restore three arena shields before the rival reaches the core.",
  childAction: "Arrange energy cells into equal formations.",
  mathAsPower: "Valid arrays charge shields; multiplication predicts their strength.",
  stakes: "Incorrect formations let the rival advance one position.",
  recovery: "The damaged shield reveals the mismatch between rows and groups.",
  progression: [
    "Build equal groups",
    "Recognize arrays",
    "Infer a missing factor",
    "Apply multiplication during the finale",
  ],
  worldReaction: "Cells snap together, shields illuminate, and the rival changes position.",
  payoff: "The completed array activates the arena and reveals the final victory sequence.",
  replayVariation: "Different arena layouts and rival strategies require new arrays.",
};

const PROMPT = `Build the following approved experience design as one complete interactive child learning experience.

The mathematical concept is multiplication as equal groups and arrays, connected to skip-counting and word-problem interpretation. Teach the concept rather than reproducing worksheet questions.

Approved design:
${JSON.stringify(DESIGN, null, 2)}

Implement the approved design faithfully. The mission, stakes, mathematical action, world reactions, progression, recovery, payoff, and replay variation must be genuinely present and connected—not replaced with a lesson menu, decorative quiz, or sequence of multiple-choice questions.

You have full authority over visual direction, interaction details, pacing, audio, animation, effects, and implementation. You are encouraged to use a capable browser library when it materially improves the experience. You may use public HTTPS libraries and assets such as Three.js, PixiJS, Phaser, Matter.js, GSAP, Tone.js, Canvas, WebGL, SVG, or CSS animation.

Return one complete HTML document that works with touch or mouse inside a 1365×768 iframe. Do not explain your choices. Return HTML only.`;

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function extractHtml(raw: string): string {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] || raw).trim();
}

async function main(): Promise<void> {
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, "design.json"), JSON.stringify(DESIGN, null, 2));
  fs.writeFileSync(path.join(OUTPUT, "prompt.txt"), PROMPT);

  const started = Date.now();
  const response = await new Anthropic().messages.stream({
    model: MODEL,
    max_tokens: 64_000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    messages: [{ role: "user", content: PROMPT }],
  } as never, { timeout: 600_000 }).finalMessage();

  const raw = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  const html = extractHtml(raw);
  fs.writeFileSync(path.join(OUTPUT, "raw-response.txt"), raw);
  fs.writeFileSync(path.join(OUTPUT, "experience.html"), html);
  fs.writeFileSync(path.join(OUTPUT, "experience.srcdoc.txt"), html);
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
