import { config as loadDotenv } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

loadDotenv({ override: true });

type ResponsesUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: ResponsesUsage;
};

type ProbeOptions = {
  concept: string;
  model: string;
  budgetCents: number;
  outputRoot: string;
  autoYes: boolean;
};

const INPUT_PRICE_PER_MILLION_CENTS = 500;
const OUTPUT_PRICE_PER_MILLION_CENTS = 3000;
const ESTIMATED_INPUT_TOKENS = 6_000;
const ESTIMATED_OUTPUT_TOKENS = 14_000;

function log(action: string, result: string): void {
  console.log(`🎮 [openai-visual-probe] ${action} ${result}`);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function estimateCostCents(inputTokens: number, outputTokens: number): number {
  return Math.ceil(
    (inputTokens / 1_000_000) * INPUT_PRICE_PER_MILLION_CENTS +
      (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_MILLION_CENTS,
  );
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function extractOutputText(payload: ResponsesPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("OpenAI response did not include output text.");
  }

  return text;
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1]!.trim() : trimmed;
}

function validateHtmlContract(html: string): string[] {
  const errors: string[] = [];
  const lower = html.toLowerCase();
  const allowedNamespaceUrls = new Set([
    "http://www.w3.org/1999/xhtml",
    "http://www.w3.org/2000/svg",
    "http://www.w3.org/1999/xlink",
  ]);
  const externalUrls = Array.from(new Set(html.match(/\bhttps?:\/\/[^\s"'<>)]*/gi) ?? [])).filter(
    (url) => !allowedNamespaceUrls.has(url.replace(/\/$/, "")),
  );

  if (!lower.includes("<!doctype html") && !lower.includes("<html")) {
    errors.push("Output is not a complete HTML document.");
  }
  if (!lower.includes("<svg")) {
    errors.push("Output must contain an SVG visual scene.");
  }
  if (!lower.includes("sunny-visual-probe")) {
    errors.push("Output must include the sunny-visual-probe marker.");
  }
  if (!lower.includes("data-evidence-event")) {
    errors.push("Output must expose visible evidence events with data-evidence-event.");
  }
  if (!lower.includes("play")) {
    errors.push("Output must include a play control.");
  }
  if (/<script[^>]+\bsrc\s*=/i.test(html)) {
    errors.push("Output must not load external scripts.");
  }
  if (externalUrls.length > 0) {
    errors.push(`Output must not reference external network URLs: ${externalUrls.slice(0, 5).join(", ")}`);
  }
  if (/\b(localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|eval)\b/.test(html)) {
    errors.push("Output must not use network, storage, or eval APIs.");
  }

  return errors;
}

async function promptForConcept(defaultValue = ""): Promise<string> {
  if (defaultValue.trim()) return defaultValue.trim();

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question("Concept to explain (example: centimeters vs inches): ");
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function confirmOrAbort(message: string, autoYes: boolean): Promise<void> {
  if (autoYes) {
    log("confirm", "auto-approved by --yes");
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${message} Continue? [y/N] `);
    if (answer.trim().toLowerCase() !== "y") {
      throw new Error("Aborted before paid OpenAI call.");
    }
  } finally {
    rl.close();
  }
}

function buildPrompt(concept: string): string {
  return `Create a premium standalone Sunny visual explainer for a child who is struggling with this concept: ${concept}

Sunny product context:
- Sunny is a therapeutic educational companion.
- The visual explainer is a teaching intervention room selected from a care-plan hypothesis.
- The scene must teach first, then pause for prediction, then reveal, then emit evidence.
- The next node may be a co-op quiz against the AI companion, so include a small JSON data island for recall questions.

Hard output rules:
- Return one complete standalone HTML document only. No Markdown fences.
- Use inline HTML, CSS, SVG, and vanilla JavaScript only.
- Do not load external scripts, fonts, images, stylesheets, or network URLs.
- Do not use fetch, XMLHttpRequest, WebSocket, localStorage, sessionStorage, indexedDB, or eval.
- Include the text marker "sunny-visual-probe" in the document.
- Include a play/pause button, progress scrubber, 4-5 checkpoints, companion bubble, prediction pause, reveal moment, and visible evidence console.
- Include at least one element with data-evidence-event.
- Make the visual feel polished enough to compare with a Claude Design canvas mock: layered composition, clear focal motion, tuned palette, child-friendly but not generic clipart.
- The scene should be interactive SVG, not a static poster. The scrubber must visibly change the scene.
- Keep text concise and avoid explaining the UI itself.

Pedagogy requirements:
- Include a care-plan assumption at the top in parent/preview tone.
- The child-facing scene should focus on one strong mental model for "${concept}".
- The prediction question should test the core misconception.
- Include a recallGame JSON island with 3 co-op quiz questions, sun-coin stakes, and target evidence ids.

Implementation requirements:
- Use requestAnimationFrame or interval logic only when playing; stop it when paused.
- Keep animation deterministic.
- Keep the page viewable at 1600x900 and responsive down to tablet width.
- Use accessible button labels.

Return the HTML now.`;
}

function parseArgs(argv: string[]): Partial<ProbeOptions> {
  const parsed: Partial<ProbeOptions> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--concept" && next) {
      parsed.concept = next;
      index += 1;
    } else if (arg === "--model" && next) {
      parsed.model = next;
      index += 1;
    } else if (arg === "--budget-cents" && next) {
      parsed.budgetCents = Number(next);
      index += 1;
    } else if (arg === "--out" && next) {
      parsed.outputRoot = next;
      index += 1;
    } else if (arg === "--yes") {
      parsed.autoYes = true;
    }
  }

  return parsed;
}

async function callOpenAi(model: string, concept: string): Promise<{ html: string; usage: ResponsesUsage }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required.");
  }
  if (apiKey.includes("your_") || apiKey.includes("placeholder")) {
    throw new Error(
      "OPENAI_API_KEY still looks like a placeholder. Put the real key in /Users/jamaltaylor/Development/sunny/.env or unset the shell placeholder.",
    );
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text:
                "You are a senior product designer and React/SVG engineer for Sunny. Generate only safe, standalone HTML that follows the user's contract exactly.",
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: buildPrompt(concept) }],
        },
      ],
      reasoning: { effort: "high" },
      max_output_tokens: 24_000,
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI API failed (${response.status}): ${raw.slice(0, 800)}`);
  }

  const payload = JSON.parse(raw) as ResponsesPayload;
  return {
    html: stripCodeFence(extractOutputText(payload)),
    usage: payload.usage ?? {},
  };
}

async function withHeartbeat<T>(label: string, work: Promise<T>): Promise<T> {
  const frames = ["-", "\\", "|", "/"];
  let tick = 0;
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    process.stdout.write(
      `\r🎮 [openai-visual-probe] ${label} ${frames[tick % frames.length]} ${seconds}s elapsed`,
    );
    tick += 1;
  }, 1000);

  try {
    return await work;
  } finally {
    clearInterval(timer);
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    process.stdout.write(`\r🎮 [openai-visual-probe] ${label} done after ${seconds}s\n`);
  }
}

async function writeProbeFiles(options: ProbeOptions, html: string, usage: ResponsesUsage): Promise<string> {
  const conceptSlug = slugify(options.concept);
  if (!conceptSlug) {
    throw new Error("Concept must contain at least one letter or number.");
  }

  const id = `${conceptSlug}-${Date.now()}`;
  const root = path.resolve(options.outputRoot, id);
  await mkdir(root, { recursive: true });

  const brief = {
    id,
    provider: "openai",
    model: options.model,
    concept: options.concept,
    createdAt: new Date().toISOString(),
    usage,
    safety: {
      externalScripts: false,
      externalUrls: false,
      storage: false,
      network: false,
    },
  };

  await writeFile(path.join(root, "index.html"), html, "utf8");
  await writeFile(path.join(root, "brief.json"), `${JSON.stringify(brief, null, 2)}\n`, "utf8");

  const manifestPath = path.resolve(options.outputRoot, "manifest.json");
  let manifest: Array<{ id: string; concept: string; model: string; url: string; createdAt: string }> = [];
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as typeof manifest;
  } catch {
    manifest = [];
  }
  manifest = manifest.filter((entry) => entry.id !== id);
  manifest.push({
    id,
    concept: options.concept,
    model: options.model,
    url: `/generated/openai-visual-probe/${id}/index.html`,
    createdAt: brief.createdAt,
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return `http://localhost:5174/generated/openai-visual-probe/${id}/index.html`;
}

async function writeRejectedProbeFiles(
  options: ProbeOptions,
  html: string,
  usage: ResponsesUsage,
  errors: string[],
): Promise<string> {
  const conceptSlug = slugify(options.concept);
  if (!conceptSlug) {
    throw new Error("Concept must contain at least one letter or number.");
  }

  const id = `${conceptSlug}-rejected-${Date.now()}`;
  const root = path.resolve(options.outputRoot, "_rejected", id);
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "index.html"), html, "utf8");
  await writeFile(
    path.join(root, "rejection.json"),
    `${JSON.stringify(
      {
        id,
        provider: "openai",
        model: options.model,
        concept: options.concept,
        createdAt: new Date().toISOString(),
        usage,
        errors,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return path.join(root, "index.html");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const concept = await promptForConcept(args.concept ?? "");
  const model = args.model ?? process.env.OPENAI_VISUAL_MODEL ?? "gpt-5.5";
  const budgetCents = args.budgetCents ?? Number(process.env.SUNNY_BUDGET_CENTS ?? "1000");
  const outputRoot =
    args.outputRoot ?? path.resolve(process.cwd(), "web/public/generated/openai-visual-probe");
  const autoYes = args.autoYes ?? false;

  if (!Number.isFinite(budgetCents) || budgetCents <= 0) {
    throw new Error("Budget must be a positive cent value. Set SUNNY_BUDGET_CENTS or --budget-cents.");
  }

  const estimatedCents = estimateCostCents(ESTIMATED_INPUT_TOKENS, ESTIMATED_OUTPUT_TOKENS);
  if (estimatedCents > budgetCents) {
    throw new Error(
      `Estimated cost ${formatDollars(estimatedCents)} exceeds budget ${formatDollars(budgetCents)}.`,
    );
  }

  log("start", `concept="${concept}" model=${model} budget=${formatDollars(budgetCents)}`);
  await confirmOrAbort(
    `About to call OpenAI ${model}. Estimated cost: ${formatDollars(
      estimatedCents,
    )}. Budget: ${formatDollars(budgetCents)}.`,
    autoYes,
  );

  const { html, usage } = await withHeartbeat("waiting for OpenAI scene", callOpenAi(model, concept));
  const actualCents = estimateCostCents(usage.input_tokens ?? 0, usage.output_tokens ?? 0);
  log(
    "api-call",
    `complete input=${usage.input_tokens ?? "unknown"} output=${
      usage.output_tokens ?? "unknown"
    } estimated-actual=${formatDollars(actualCents)}`,
  );

  if (actualCents > budgetCents) {
    throw new Error(
      `Actual token estimate ${formatDollars(actualCents)} exceeded budget ${formatDollars(
        budgetCents,
      )}; refusing to write output.`,
    );
  }

  const errors = validateHtmlContract(html);
  if (errors.length > 0) {
    const rejectedPath = await writeRejectedProbeFiles(
      { concept, model, budgetCents, outputRoot, autoYes },
      html,
      usage,
      errors,
    );
    throw new Error(
      `Generated HTML failed contract and was saved for review at ${rejectedPath}:\n- ${errors.join(
        "\n- ",
      )}`,
    );
  }
  log("contract", "passed");

  const url = await writeProbeFiles(
    { concept, model, budgetCents, outputRoot, autoYes },
    html,
    usage,
  );
  log("write", `saved preview at ${url}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`🎮 [openai-visual-probe] error ${message}`);
  process.exitCode = 1;
});
