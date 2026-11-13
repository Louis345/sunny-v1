import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";

const MODEL = process.env.SUNNY_SANDBOX_MODEL?.trim() || "claude-sonnet-5";
const ROOT = path.resolve(__dirname, "../../..");
const OUTPUT = path.join(
  ROOT,
  "outputs/math-creative-sandbox/design-loop",
  new Date().toISOString().replace(/[:.]/g, "-"),
);

const CONCEPT = "Multiplication as equal groups and arrays, connected to skip-counting and word-problem interpretation.";
const EVIDENCE = `Factual observations about Reina:
- She has repeatedly requested difficult challenges.
- She has sustained engagement with fast-paced riddles and multi-step logic.
- She notices errors and questions faulty reasoning.
- Applied store-based math produced substantially stronger performance than mechanical worksheet-style practice.
- She has requested action stories involving adversaries.
- Competitive framing has coincided with high engagement.
- These observations come from a limited set of sessions and do not prove permanent preferences.`;

const DESIGN_PROMPT = `Create three materially different experience designs for a nine-year-old learning:

${CONCEPT}

Teach the concept rather than reproducing worksheet questions.

${EVIDENCE}

Do not implement code. Do not assume the evidence proves what Reina will like. Each design must make a testable prediction and explain what child behavior would falsify it.

The three designs must differ in premise, primary interaction, visual language, stakes, progression, and payoff. Do not make all three futuristic, competitive, dark, cute, or conventionally game-like.

For each design provide:
- title;
- openingPromise;
- mission;
- firstAction;
- childAction;
- mathAsPower;
- stakes;
- recovery;
- progression;
- worldReaction;
- payoff;
- replayVariation;
- profileEvidenceUsed;
- engagementPrediction;
- falsifyingEvidence;
- prototypeScope.

Return JSON only:
{
  "designs": [
    {
      "id": "A",
      "title": "",
      "openingPromise": "",
      "mission": "",
      "firstAction": "",
      "childAction": "",
      "mathAsPower": "",
      "stakes": "",
      "recovery": "",
      "progression": [],
      "worldReaction": "",
      "payoff": "",
      "replayVariation": "",
      "profileEvidenceUsed": [],
      "engagementPrediction": "",
      "falsifyingEvidence": "",
      "prototypeScope": ""
    }
  ]
}`;

const HARNESS_PROMPT = `You are a skeptical design critic comparing three proposed child learning experiences.

Rate them against:
- concept clarity;
- mathematics embodied in the interaction;
- meaningful action and consequence;
- perceptible progression;
- payoff worth reaching;
- useful recovery;
- factual profile grounding without overclaiming;
- originality relative to the other candidates;
- feasibility as one compact playable vertical slice.

Do not predict dopamine or claim the child will enjoy something as fact. Select one design even if all are imperfect. Produce one bounded refactor brief.

Return JSON only:
{
  "selectedDesignId": "A, B, or C",
  "comparativeObservations": {
    "A": [],
    "B": [],
    "C": []
  },
  "selectionReason": "",
  "strongestQuality": "",
  "largestClarityRisk": "",
  "largestEngagementRisk": "",
  "mathIntegrationRisk": "",
  "refactorBrief": ""
}`;

function text(response: Anthropic.Messages.Message): string {
  return response.content.filter((block) => block.type === "text").map((block) => block.text).join("");
}

function jsonFrom(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse((fenced?.[1] || raw).trim());
}

function htmlFrom(raw: string): string {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] || raw).trim();
}

async function call(client: Anthropic, prompt: string, maxTokens: number, effort: "medium" | "high") {
  const started = Date.now();
  const response = await client.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort },
    messages: [{ role: "user", content: prompt }],
  } as never, { timeout: 900_000 }).finalMessage();
  return { response, raw: text(response), elapsedMs: Date.now() - started };
}

async function main(): Promise<void> {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const client = new Anthropic();

  fs.writeFileSync(path.join(OUTPUT, "01-design.prompt.txt"), DESIGN_PROMPT);
  const designCall = await call(client, DESIGN_PROMPT, 10_000, "high");
  const designs = jsonFrom(designCall.raw) as { designs: Array<Record<string, unknown>> };
  fs.writeFileSync(path.join(OUTPUT, "01-design.raw.txt"), designCall.raw);
  fs.writeFileSync(path.join(OUTPUT, "01-designs.json"), JSON.stringify(designs, null, 2));

  const harnessInput = `${HARNESS_PROMPT}\n\nDesign candidates:\n${JSON.stringify(designs, null, 2)}`;
  fs.writeFileSync(path.join(OUTPUT, "02-harness.prompt.txt"), harnessInput);
  const harnessCall = await call(client, harnessInput, 5_000, "medium");
  const decision = jsonFrom(harnessCall.raw) as Record<string, unknown>;
  fs.writeFileSync(path.join(OUTPUT, "02-harness.raw.txt"), harnessCall.raw);
  fs.writeFileSync(path.join(OUTPUT, "02-harness.json"), JSON.stringify(decision, null, 2));

  const selected = designs.designs.find((design) => design.id === decision.selectedDesignId);
  if (!selected) throw new Error("selected_design_missing");
  const refactorPrompt = `Refactor this selected experience design once. Do not write code.

Learning concept:
${CONCEPT}

Factual child evidence:
${EVIDENCE}

Selected design:
${JSON.stringify(selected, null, 2)}

Critic feedback:
${JSON.stringify(decision, null, 2)}

Preserve the strongest quality and resolve the critic's largest risks. Keep claims about the child uncertain and testable.

Return one complete design artifact as JSON using the same fields as the selected design. Return JSON only.`;
  fs.writeFileSync(path.join(OUTPUT, "03-refactor.prompt.txt"), refactorPrompt);
  const refactorCall = await call(client, refactorPrompt, 6_000, "high");
  const finalDesign = jsonFrom(refactorCall.raw) as Record<string, unknown>;
  fs.writeFileSync(path.join(OUTPUT, "03-refactor.raw.txt"), refactorCall.raw);
  fs.writeFileSync(path.join(OUTPUT, "03-final-design.json"), JSON.stringify(finalDesign, null, 2));

  const prototypePrompt = `Build one compact playable vertical-slice prototype from this approved design.

Learning concept:
${CONCEPT}

Approved design:
${JSON.stringify(finalDesign, null, 2)}

Implement only:
- the opening promise;
- the first meaningful child action;
- one incorrect consequence with understandable recovery;
- one correct world reaction;
- a visible preview of later progression and payoff.

This is a prototype, not a complete game. Keep the HTML under 24,000 characters. Preserve the design's premise, interaction, mathematical role, stakes, and visual identity.

You have full authority over layout, animation, audio, and implementation. You may use public HTTPS browser libraries and assets when useful.

Return one complete HTML document that works with touch or mouse inside a 1365×768 iframe. Return HTML only.`;
  fs.writeFileSync(path.join(OUTPUT, "04-prototype.prompt.txt"), prototypePrompt);
  const prototypeCall = await call(client, prototypePrompt, 32_000, "high");
  const prototypeHtml = htmlFrom(prototypeCall.raw);
  fs.writeFileSync(path.join(OUTPUT, "04-prototype.raw.txt"), prototypeCall.raw);
  fs.writeFileSync(path.join(OUTPUT, "prototype.html"), prototypeHtml);
  fs.writeFileSync(path.join(OUTPUT, "prototype.srcdoc.txt"), prototypeHtml);

  const calls = [designCall, harnessCall, refactorCall, prototypeCall];
  fs.writeFileSync(path.join(OUTPUT, "run.json"), JSON.stringify({
    model: MODEL,
    calls: calls.length,
    elapsedMs: calls.reduce((sum, item) => sum + item.elapsedMs, 0),
    inputTokens: calls.reduce((sum, item) => sum + item.response.usage.input_tokens, 0),
    outputTokens: calls.reduce((sum, item) => sum + item.response.usage.output_tokens, 0),
    stopReasons: calls.map((item) => item.response.stop_reason),
  }, null, 2));

  process.stdout.write(`${OUTPUT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
