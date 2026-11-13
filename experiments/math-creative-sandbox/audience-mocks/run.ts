import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MODEL = process.env.SUNNY_SANDBOX_MODEL?.trim() || "claude-sonnet-5";
const ROOT = path.resolve(__dirname, "../../..");
const OUTPUT = path.join(
  ROOT,
  "outputs/math-creative-sandbox/audience-mocks",
  new Date().toISOString().replace(/[:.]/g, "-"),
);

const CONCEPT =
  "Multiplication as equal groups and arrays, connected to skip-counting and word-problem interpretation.";

const FACTUAL_CHILD_CONTEXT = `Factual observations about Reina:
- She is nine years old.
- She has repeatedly requested difficult challenges.
- She has sustained engagement with fast-paced riddles and multi-step logic.
- She notices errors and questions faulty reasoning.
- Applied store-based math produced substantially stronger performance than mechanical worksheet-style practice.
- She has requested action stories involving adversaries.
- Competitive framing has coincided with high engagement.
- These observations come from a limited set of sessions and do not prove permanent preferences.`;

const DESIGN_PROMPT = `Act as an exceptional children's experience designer and learning designer.

Create three materially different design artifacts for a sequence of interactive experiences that teaches:

${CONCEPT}

Teach the concept, not copied worksheet questions.

${FACTUAL_CHILD_CONTEXT}

Audience and learning-position boundary:
- The child should understand what to do in the first few seconds without reading a manual.
- Interaction literacy should remain coherent as mathematical independence increases.
- Difficulty should come from mathematical thinking, not decoding an unfamiliar interface.

This is not an instruction to make a particular genre, game, mood, consequence system, visual style, or mechanic. You own those decisions. You may choose a game, simulation, construction experience, story, puzzle, or another form.

Design three distinct directions. Each direction must describe a progression from an approachable teaching node through guided application and an ambitious independent Quest. The directions must differ in premise, interaction, visual language, stakes, progression, and payoff.

For every direction return:
- id and title;
- audience rationale grounded only in supplied facts;
- opening promise;
- what is visually obvious in the first three seconds;
- first child action;
- how the interface teaches that action without explanation;
- core interaction;
- how multiplication is the power used to advance;
- stakes and consequences selected by you;
- recovery selected by you;
- node sequence with rising mathematical independence;
- interaction continuity across nodes;
- visible world progression;
- payoff;
- replay variation;
- visual and motion direction;
- optional browser libraries that would materially help;
- a falsifiable engagement prediction.

Return JSON only:
{
  "designs": [
    {
      "id": "A",
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
      "nodeSequence": [
        {
          "role": "teach | guided_application | independent_quest",
          "mathematicalDemand": "",
          "experienceBeat": "",
          "supportAvailable": ""
        }
      ],
      "interactionContinuity": "",
      "worldProgression": "",
      "payoff": "",
      "replayVariation": "",
      "visualDirection": "",
      "motionDirection": "",
      "usefulLibraries": [],
      "engagementPrediction": "",
      "falsifyingEvidence": ""
    }
  ]
}`;

function responseText(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function extractJson(raw: string): { designs: Array<Record<string, unknown>> } {
  return JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
}

function extractHtml(raw: string): string {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] || raw).trim();
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function call(
  client: Anthropic,
  prompt: string,
  maxTokens: number,
  effort: "medium" | "high",
  useThinking = true,
) {
  const started = Date.now();
  const request = {
    model: MODEL,
    max_tokens: maxTokens,
    ...(useThinking
      ? { thinking: { type: "adaptive" }, output_config: { effort } }
      : {}),
    messages: [{ role: "user", content: prompt }],
  };
  const response = await client.messages
    .stream(
      request as never,
      { timeout: 600_000 },
    )
    .finalMessage();
  return {
    response,
    raw: responseText(response),
    elapsedMs: Date.now() - started,
  };
}

function mockPrompt(design: Record<string, unknown>): string {
  return `Create a fast, polished, interactive visual mock from this design artifact.

Learning concept:
${CONCEPT}

Audience facts:
${FACTUAL_CHILD_CONTEXT}

Design artifact:
${JSON.stringify(design, null, 2)}

This is a review mock, not a complete game. Make the opening state and first meaningful interaction real so a human can judge the direction quickly. Show a visible preview of progression and payoff; do not build every node.

The first action must be visually self-evident for a nine-year-old. Preserve the artifact's chosen stakes, consequences, interaction, visual identity, and mathematical role. Do not replace it with a lesson menu or decorative multiple-choice quiz.

You have free rein over implementation, animation, audio, graphics, and presentation. You may use any public HTTPS browser library or asset that materially improves the mock, including Three.js, PixiJS, Phaser, Matter.js, GSAP, Tone.js, canvas, WebGL, SVG, or CSS animation. Library use is optional and is your decision.

Keep this review mock concise: the complete HTML must be under 14,000 characters.

Return one complete self-contained HTML document that works with touch or mouse in a 1365×768 iframe. External HTTPS resources are allowed. Return raw HTML only.`;
}

function comparisonHtml(
  designs: Array<Record<string, unknown>>,
  entries: Array<{ id: string; title: string; file: string }>,
): string {
  const cards = entries
    .map((entry) => {
      const design = designs.find((candidate) => candidate.id === entry.id) || {};
      return `<article>
        <header>
          <div><span>Direction ${entry.id}</span><h2>${entry.title}</h2></div>
          <a href="./${entry.file}" target="_blank">Open full screen ↗</a>
        </header>
        <iframe title="${entry.title}" src="./${entry.file}" allow="autoplay; fullscreen"></iframe>
        <details>
          <summary>Review the design artifact</summary>
          <pre>${escapeHtml(JSON.stringify(design, null, 2))}</pre>
        </details>
        <section class="score">
          <label>First action <input type="number" min="1" max="5"></label>
          <label>Visual pull <input type="number" min="1" max="5"></label>
          <label>Math integration <input type="number" min="1" max="5"></label>
          <label>Want to continue <input type="number" min="1" max="5"></label>
          <textarea placeholder="What works? What is confusing?"></textarea>
        </section>
      </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Audience-aware math mock comparison</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#0c1020;color:#f7f5ef;font-family:Inter,system-ui,sans-serif}
    main{max-width:1500px;margin:auto;padding:32px}h1{font-size:clamp(32px,5vw,68px);margin:0 0 8px}
    .intro{color:#adb8d7;font-size:18px;margin:0 0 28px}article{background:#171d31;border:1px solid #323b5c;border-radius:22px;padding:18px;margin:0 0 34px;box-shadow:0 24px 80px #0006}
    header{display:flex;justify-content:space-between;gap:16px;align-items:end;margin:0 4px 14px}header span{color:#8da2ff;text-transform:uppercase;letter-spacing:.14em;font-weight:800}
    h2{font-size:30px;margin:4px 0}a{color:#fff;background:#415bd3;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:800}
    iframe{display:block;width:100%;aspect-ratio:1365/768;border:0;border-radius:14px;background:#000}
    details{margin:14px 2px}summary{cursor:pointer;color:#bfc9e8}pre{white-space:pre-wrap;color:#cdd5ec;background:#0d1222;padding:16px;border-radius:12px}
    .score{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}.score label{display:flex;justify-content:space-between;align-items:center;background:#222a43;padding:10px;border-radius:10px}
    input{width:48px;background:#0f1425;color:#fff;border:1px solid #566184;border-radius:7px;padding:6px}textarea{grid-column:1/-1;min-height:76px;background:#0f1425;color:#fff;border:1px solid #566184;border-radius:10px;padding:12px}
    @media(max-width:800px){main{padding:14px}.score{grid-template-columns:1fr 1fr}header{align-items:start;flex-direction:column}}
  </style>
</head>
<body><main>
  <h1>Three directions. One audience.</h1>
  <p class="intro">Judge the first action, visual pull, mathematical role, and whether you want to continue. These are deliberately incomplete mocks.</p>
  ${cards}
</main></body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function main(): Promise<void> {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const client = new Anthropic();

  fs.writeFileSync(path.join(OUTPUT, "00-design.prompt.txt"), DESIGN_PROMPT);
  const savedDesignPath = process.env.SUNNY_SANDBOX_DESIGNS?.trim();
  process.stdout.write(
    savedDesignPath
      ? "Loading the existing three design directions...\n"
      : "Designing three audience-aware directions...\n",
  );
  const designCall = savedDesignPath
    ? null
    : await call(client, DESIGN_PROMPT, 12_000, "high");
  if (designCall) fs.writeFileSync(path.join(OUTPUT, "00-design.raw.txt"), designCall.raw);
  const designPacket = savedDesignPath
    ? (JSON.parse(fs.readFileSync(savedDesignPath, "utf8")) as {
        designs: Array<Record<string, unknown>>;
      })
    : extractJson(designCall!.raw);
  if (designPacket.designs.length !== 3) {
    throw new Error(`expected_three_designs_received_${designPacket.designs.length}`);
  }
  fs.writeFileSync(
    path.join(OUTPUT, "00-designs.json"),
    JSON.stringify(designPacket, null, 2),
  );

  process.stdout.write("Building three review mocks in parallel...\n");
  const mockCalls = await Promise.all(
    designPacket.designs.map(async (design) => {
      const id = String(design.id);
      const prompt = mockPrompt(design);
      fs.writeFileSync(path.join(OUTPUT, `${id}-mock.prompt.txt`), prompt);
      const result = await call(client, prompt, 20_000, "medium", false);
      const html = extractHtml(result.raw);
      const file = `${id}-mock.html`;
      fs.writeFileSync(path.join(OUTPUT, `${id}-mock.raw.txt`), result.raw);
      fs.writeFileSync(path.join(OUTPUT, file), html);
      fs.writeFileSync(
        path.join(OUTPUT, `${id}-mock.json`),
        JSON.stringify(
          {
            model: MODEL,
            elapsedMs: result.elapsedMs,
            inputTokens: result.response.usage.input_tokens,
            outputTokens: result.response.usage.output_tokens,
            stopReason: result.response.stop_reason,
            responseHash: hash(result.raw),
            htmlHash: hash(html),
          },
          null,
          2,
        ),
      );
      return {
        id,
        title: String(design.title),
        file,
        result,
      };
    }),
  );

  fs.writeFileSync(
    path.join(OUTPUT, "comparison.html"),
    comparisonHtml(designPacket.designs, mockCalls),
  );
  const calls = [
    ...(designCall ? [designCall] : []),
    ...mockCalls.map((entry) => entry.result),
  ];
  fs.writeFileSync(
    path.join(OUTPUT, "run.json"),
    JSON.stringify(
      {
        model: MODEL,
        calls: calls.length,
        wallClockStrategy: "one design call, then three parallel mock calls",
        aggregateModelElapsedMs: calls.reduce((sum, callResult) => sum + callResult.elapsedMs, 0),
        inputTokens: calls.reduce(
          (sum, callResult) => sum + callResult.response.usage.input_tokens,
          0,
        ),
        outputTokens: calls.reduce(
          (sum, callResult) => sum + callResult.response.usage.output_tokens,
          0,
        ),
        files: mockCalls.map(({ id, title, file }) => ({ id, title, file })),
      },
      null,
      2,
    ),
  );

  process.stdout.write(`${OUTPUT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
