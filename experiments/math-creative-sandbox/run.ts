import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium, type Page } from "playwright";
import {
  buildRefactorPrompt,
  buildScenarioPackets,
  chooseStrongestCandidate,
  explorationTurnAllowed,
  parseGeneratedHtml,
  resolveSandboxOutput,
  type CandidateReview,
  type ScenarioPacket,
} from "./experiment";

type Usage = {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
};

type Candidate = {
  id: string;
  label: string;
  concept: string;
  htmlPath: string;
  relativeHtmlPath: string;
  promptPath?: string;
  prompt?: string;
  generation?: {
    model: string;
    elapsedMs: number;
    stopReason: string | null;
    usage: Usage;
  };
};

type BrowserAction = {
  kind: "click_text" | "click_at" | "fill" | "press" | "wait";
  text?: string;
  x?: number;
  y?: number;
  value?: string;
  key?: string;
  ms?: number;
  captureLabel: "first-action" | "incorrect-recovery" | "progress" | "completion" | "exploration";
  reason: string;
};

type ExplorationDecision = {
  done: boolean;
  summary: string;
  action?: BrowserAction;
};

type ExplorationResult = {
  candidateId: string;
  screenshots: string[];
  actions: Array<BrowserAction & { ok: boolean; error?: string }>;
  visibleText: string;
  consoleMessages: string[];
};

const EVALUATOR_CALIBRATION = `
Human calibration from prior Sunny work:

Positive:
- "Skyglider Skip-Count Run" was judged beautiful, understandable, and finally
  delivered an emotional payoff. The math action was visually central.
- "Comet Trail Facts Sprint" and "Comet Trail Story Sprint" were judged amazing.

Negative:
- Moonlit Cargo, Tidepool, and Rope-and-Peg were judged bland when attractive
  scenery surrounded ordinary answer buttons.
- A harbor Quest was rejected as "a three-stage answer-button quiz wearing a
  harbor costume": the world disappeared during play and the promised rope,
  lantern, and cargo mechanics were labels rather than tangible interactions.

These are calibration judgments, not templates. Do not demand gliders, comets,
harbors, timers, competition, or any named mechanic. Judge the finished work on
its own merits and actively look for confident AI self-praise masking mediocrity.
`;

function arg(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

function textFromResponse(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.type === "text" ? block.text : "")
    .join("\n");
}

function toolInput(response: Anthropic.Messages.Message, name: string): Record<string, unknown> {
  const block = response.content.find((item) => item.type === "tool_use" && item.name === name);
  if (!block || block.type !== "tool_use") throw new Error(`sandbox_tool_output_missing:${name}`);
  return block.input as Record<string, unknown>;
}

function usageOf(response: Anthropic.Messages.Message): Usage {
  const inputTokens = response.usage.input_tokens ?? 0;
  const outputTokens = response.usage.output_tokens ?? 0;
  const inputRateText = process.env.SUNNY_SANDBOX_INPUT_COST_PER_MTOK?.trim() ?? "";
  const outputRateText = process.env.SUNNY_SANDBOX_OUTPUT_COST_PER_MTOK?.trim() ?? "";
  const inputRate = Number(inputRateText);
  const outputRate = Number(outputRateText);
  const estimatedCostUsd = inputRateText && outputRateText
    && Number.isFinite(inputRate) && Number.isFinite(outputRate)
    ? (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000
    : null;
  return { inputTokens, outputTokens, estimatedCostUsd };
}

function creatorPrompt(packet: ScenarioPacket): string {
  return `Create one original, complete, standalone HTML learning experience.

Mathematical concept:
${packet.concept}

Experimental condition:
${packet.label}

Available factual context:
${JSON.stringify(packet.context, null, 2)}

Teach and challenge the concept rather than reproducing worksheet questions.
You own the pedagogy, questions, experience form, mechanics, stakes,
consequences, progression, payoff, replay structure, and visual identity.
The experience may be a game, simulation, construction, demonstration, mystery,
story, or another form you judge stronger.

Create an experience a child can use with touch or mouse. Everything must live
inside one HTML document using inline CSS, JavaScript, SVG, or Canvas. Do not use
external libraries, network assets, Sunny runtime contracts, test hooks, or
parent-window messaging.

Return raw complete HTML only.`;
}

async function generateHtml(input: {
  client: Anthropic;
  model: string;
  prompt: string;
}): Promise<{
  html: string | null;
  rawText: string;
  response: Anthropic.Messages.Message;
  elapsedMs: number;
}> {
  const startedAt = Date.now();
  const response = await input.client.messages.stream({
    model: input.model,
    max_tokens: Number(process.env.SUNNY_SANDBOX_MAX_TOKENS ?? 32000),
    thinking: { type: "adaptive" },
    output_config: {
      effort: process.env.SUNNY_SANDBOX_CREATOR_EFFORT ?? "medium",
    },
    messages: [{ role: "user", content: input.prompt }],
  } as never, {
    timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 600000),
  }).finalMessage();
  const rawText = textFromResponse(response);
  const parsed = parseGeneratedHtml(rawText);
  return {
    html: parsed.ok ? parsed.html : null,
    rawText,
    response,
    elapsedMs: Date.now() - startedAt,
  };
}

function imageBlock(file: string): Record<string, unknown> {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: fs.readFileSync(file).toString("base64"),
    },
  };
}

function explorationDecisionSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["done", "summary"],
    properties: {
      done: { type: "boolean" },
      summary: { type: "string" },
      action: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "captureLabel", "reason"],
        properties: {
          kind: { enum: ["click_text", "click_at", "fill", "press", "wait"] },
          text: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          value: { type: "string" },
          key: { type: "string" },
          ms: { type: "number" },
          captureLabel: {
            enum: ["first-action", "incorrect-recovery", "progress", "completion", "exploration"],
          },
          reason: { type: "string" },
        },
      },
    },
  };
}

function reviewSchema(): Record<string, unknown> {
  const score = { type: "integer", minimum: 1, maximum: 5 };
  return {
    type: "object",
    additionalProperties: false,
    required: ["candidateId", "verdict", "scores", "evidence", "critique", "nextMove"],
    properties: {
      candidateId: { type: "string" },
      verdict: { enum: ["exceptional", "promising", "mediocre", "reject"] },
      scores: {
        type: "object",
        additionalProperties: false,
        required: [
          "designQuality",
          "originality",
          "craft",
          "functionality",
          "learningIntegration",
          "replayAppeal",
        ],
        properties: {
          designQuality: score,
          originality: score,
          craft: score,
          functionality: score,
          learningIntegration: score,
          replayAppeal: score,
        },
      },
      evidence: { type: "array", items: { type: "string" }, minItems: 2 },
      critique: { type: "string" },
      nextMove: { enum: ["refine", "pivot", "stop"] },
    },
  };
}

async function pageInventory(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const elements = [...document.querySelectorAll(
      "button,a,input,select,textarea,[role='button'],[tabindex],canvas",
    )].slice(0, 80);
    return {
      title: document.title,
      visibleText: (document.body.innerText || "").slice(0, 6000),
      interactive: elements.map((element, index) => {
        const rect = element.getBoundingClientRect();
        return {
          index,
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || "").trim().slice(0, 160),
          ariaLabel: element.getAttribute("aria-label"),
          placeholder: element.getAttribute("placeholder"),
          testId: element.getAttribute("data-testid"),
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }),
    };
  });
}

async function askNextExplorationAction(input: {
  client: Anthropic;
  model: string;
  candidate: Candidate;
  screenshot: string;
  inventory: Record<string, unknown>;
  priorActions: ExplorationResult["actions"];
}): Promise<{ decision: ExplorationDecision; response: Anthropic.Messages.Message }> {
  const response = await input.client.messages.create({
    model: input.model,
    max_tokens: 1400,
    messages: [{
      role: "user",
      content: [
        imageBlock(input.screenshot),
        {
          type: "text",
          text: `You are a skeptical child-experience evaluator controlling Chromium.
Choose exactly ONE next action based only on the CURRENT visible screen, or mark
done when you have enough evidence. You will receive a fresh screenshot after
every action. Never plan future clicks against controls that are not currently
visible.

Explore like a curious child. Seek evidence of the apparent first action,
incorrect/recovery behavior, successful progression, and payoff when reasonably
reachable. This is open-ended quality exploration, not a fixed acceptance test.

Candidate: ${input.candidate.id}
Concept: ${input.candidate.concept}
Actions already attempted:
${JSON.stringify(input.priorActions, null, 2)}

CURRENT visible page inventory:
${JSON.stringify(input.inventory, null, 2)}

For click_text and fill, use exact visible text when possible. Use click_at for
Canvas or graphical controls. Coordinates refer to the current 1365x768
screenshot. If done=true, omit action.`,
        },
      ] as never,
    }],
    tools: [{
      name: "sandbox_exploration_decision",
      description: "Choose one current-screen browser action or finish exploration.",
      input_schema: explorationDecisionSchema(),
    }],
    tool_choice: { type: "tool", name: "sandbox_exploration_decision" },
  } as never);
  return {
    decision: toolInput(
      response,
      "sandbox_exploration_decision",
    ) as unknown as ExplorationDecision,
    response,
  };
}

async function clickVisibleText(page: Page, text: string): Promise<void> {
  const roleButton = page.getByRole("button", { name: text, exact: false }).first();
  if (await roleButton.count()) {
    await roleButton.click({ timeout: 4000 });
    return;
  }
  await page.getByText(text, { exact: false }).first().click({ timeout: 4000 });
}

async function executeAction(page: Page, action: BrowserAction): Promise<void> {
  if (action.kind === "click_text") {
    if (!action.text) throw new Error("click_text_missing_text");
    await clickVisibleText(page, action.text);
  } else if (action.kind === "click_at") {
    if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) {
      throw new Error("click_at_missing_coordinates");
    }
    await page.mouse.click(action.x!, action.y!);
  } else if (action.kind === "fill") {
    if (!action.text) throw new Error("fill_missing_target");
    const target = page.getByPlaceholder(action.text, { exact: false }).first();
    if (await target.count()) await target.fill(action.value ?? "");
    else await page.getByLabel(action.text, { exact: false }).first().fill(action.value ?? "");
  } else if (action.kind === "press") {
    await page.keyboard.press(action.key ?? "Enter");
  } else {
    await page.waitForTimeout(Math.min(3000, Math.max(100, action.ms ?? 500)));
  }
  await page.waitForTimeout(400);
}

async function exploreCandidate(input: {
  client: Anthropic;
  evaluatorModel: string;
  browserBaseUrl: string;
  candidate: Candidate;
  outputDir: string;
  browser: Awaited<ReturnType<typeof chromium.launch>>;
}): Promise<{
  result: ExplorationResult;
  decisionUsage: Usage[];
}> {
  const candidateDir = path.join(input.outputDir, input.candidate.id);
  fs.mkdirSync(candidateDir, { recursive: true });
  const page = await input.browser.newPage({ viewport: { width: 1365, height: 768 } });
  const consoleMessages: string[] = [];
  page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
  await page.goto(`${input.browserBaseUrl}/${input.candidate.relativeHtmlPath}`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(800);
  const opening = path.join(candidateDir, "00-opening.png");
  await page.screenshot({ path: opening, fullPage: false });

  const screenshots = [opening];
  const actions: ExplorationResult["actions"] = [];
  const decisions: ExplorationDecision[] = [];
  const decisionUsage: Usage[] = [];
  for (let turn = 0; explorationTurnAllowed(turn, 8); turn += 1) {
    const currentScreenshot = screenshots.at(-1)!;
    const decided = await askNextExplorationAction({
      client: input.client,
      model: input.evaluatorModel,
      candidate: input.candidate,
      screenshot: currentScreenshot,
      inventory: await pageInventory(page),
      priorActions: actions,
    });
    decisions.push(decided.decision);
    decisionUsage.push(usageOf(decided.response));
    if (decided.decision.done) break;
    const action = decided.decision.action;
    if (!action) {
      actions.push({
        kind: "wait",
        ms: 100,
        captureLabel: "exploration",
        reason: "Evaluator omitted an action while continuing.",
        ok: false,
        error: "exploration_action_missing",
      });
      break;
    }
    try {
      await executeAction(page, action);
      actions.push({ ...action, ok: true });
    } catch (error) {
      actions.push({
        ...action,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const screenshot = path.join(
      candidateDir,
      `${String(turn + 1).padStart(2, "0")}-${slug(action.captureLabel ?? "exploration")}.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: false });
    screenshots.push(screenshot);
  }
  fs.writeFileSync(
    path.join(candidateDir, "exploration-decisions.json"),
    `${JSON.stringify(decisions, null, 2)}\n`,
  );
  const visibleText = await page.locator("body").innerText().catch(() => "");
  await page.close();
  return {
    result: {
      candidateId: input.candidate.id,
      screenshots,
      actions,
      visibleText: visibleText.slice(0, 8000),
      consoleMessages,
    },
    decisionUsage,
  };
}

async function reviewCandidate(input: {
  client: Anthropic;
  model: string;
  candidate: Candidate;
  exploration: ExplorationResult;
}): Promise<{ review: CandidateReview; response: Anthropic.Messages.Message }> {
  const screenshotFiles = [
    input.exploration.screenshots[0],
    ...input.exploration.screenshots.slice(1, 4),
    input.exploration.screenshots.at(-1),
  ].filter((file, index, all): file is string => Boolean(file) && all.indexOf(file) === index);
  const response = await input.client.messages.create({
    model: input.model,
    max_tokens: 4500,
    messages: [{
      role: "user",
      content: [
        ...screenshotFiles.map(imageBlock),
        {
          type: "text",
          text: `You are an independent, skeptical evaluator of a finished child
learning experience. Question its quality rather than checking whether it merely
contains required pieces.

Primary question:
Is this genuinely excellent, original, engaging work—or functional AI content
wearing attractive artwork?

Judge design quality, originality, craft, functionality, mathematical integration,
and replay appeal. Look for generic answer-button structures, decorative worlds
that do not participate in play, shallow progression, unearned payoff, and
interactions that random clicking can defeat. Do not invent a preferred mechanic.

${EVALUATOR_CALIBRATION}

Candidate: ${input.candidate.id}
Concept: ${input.candidate.concept}
Exploration trace:
${JSON.stringify(input.exploration.actions, null, 2)}
Final visible text:
${input.exploration.visibleText}
Console:
${JSON.stringify(input.exploration.consoleMessages)}

Scores must cite what is visible in the supplied screenshots or trace. Be willing
to reject polished mediocrity.`,
        },
      ] as never,
    }],
    tools: [{
      name: "sandbox_quality_review",
      description: "Return a skeptical evidence-based quality judgment.",
      input_schema: reviewSchema(),
    }],
    tool_choice: { type: "tool", name: "sandbox_quality_review" },
  } as never);
  const review = toolInput(response, "sandbox_quality_review") as unknown as CandidateReview;
  review.candidateId = input.candidate.id;
  return { review, response };
}

async function comparativeSelection(input: {
  client: Anthropic;
  model: string;
  reviews: CandidateReview[];
}): Promise<{
  selectedCandidateId: string;
  reason: string;
  response: Anthropic.Messages.Message;
}> {
  const candidateIds = input.reviews.map((review) => review.candidateId);
  const response = await input.client.messages.create({
    model: input.model,
    max_tokens: 1800,
    messages: [{
      role: "user",
      content: `Compare these independent reviews and select the strongest candidate
for exactly one diagnostic refactor. Selection is not publication and all
candidates may be poor. Choose the candidate with the most promising substantive
experience, not merely the prettiest opening screen.

${JSON.stringify(input.reviews, null, 2)}`,
    }],
    tools: [{
      name: "sandbox_comparative_selection",
      description: "Select one candidate for one bounded refactor.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["selectedCandidateId", "reason"],
        properties: {
          selectedCandidateId: { type: "string", enum: candidateIds },
          reason: { type: "string" },
        },
      },
    }],
    tool_choice: { type: "tool", name: "sandbox_comparative_selection" },
  } as never);
  const selected = toolInput(response, "sandbox_comparative_selection");
  return {
    selectedCandidateId: String(selected.selectedCandidateId),
    reason: String(selected.reason),
    response,
  };
}

function startServer(root: string): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const requestPath = decodeURIComponent((request.url ?? "/").split("?")[0]);
      const file = path.resolve(root, `.${requestPath}`);
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const resolved = fs.statSync(file, { throwIfNoEntry: false })?.isDirectory()
        ? path.join(file, "index.html")
        : file;
      if (!fs.existsSync(resolved)) {
        response.writeHead(404).end("Not found");
        return;
      }
      const extension = path.extname(resolved);
      const contentType = extension === ".html" ? "text/html; charset=utf-8" : "application/octet-stream";
      response.writeHead(200, { "Content-Type": contentType });
      fs.createReadStream(resolved).pipe(response);
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("sandbox_server_address_missing"));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((done, fail) => {
          server.close((error) => error ? fail(error) : done());
        }),
      });
    });
  });
}

function scoreCards(): string {
  const fields = [
    "overall",
    "design-quality",
    "originality",
    "craft",
    "functionality",
    "learning-integration",
    "replay-appeal",
  ];
  return fields.map((field) => `<label>${htmlEscape(field.replace(/-/g, " "))}
    <select data-human-score="${field}">
      <option value="">—</option>
      <option>1</option><option>2</option><option>3</option><option>4</option><option>5</option>
    </select>
  </label>`).join("");
}

function relativeToOutput(outputDir: string, file: string): string {
  return path.relative(outputDir, file).split(path.sep).join("/");
}

function gallery(input: {
  outputDir: string;
  candidates: Candidate[];
  explorations: Map<string, ExplorationResult>;
  reviews: Map<string, CandidateReview>;
  selectedCandidateId: string;
  selectionReason: string;
  runSummary: Record<string, unknown>;
}): string {
  const sections = input.candidates.map((candidate) => {
    const exploration = input.explorations.get(candidate.id);
    const review = input.reviews.get(candidate.id);
    const screenshots = exploration?.screenshots.map((file) =>
      `<figure><img src="${htmlEscape(relativeToOutput(input.outputDir, file))}"><figcaption>${htmlEscape(path.basename(file))}</figcaption></figure>`
    ).join("") ?? "";
    return `<section class="candidate" data-candidate="${htmlEscape(candidate.id)}">
      <header>
        <div><p class="eyebrow">${htmlEscape(candidate.id)}</p><h2>${htmlEscape(candidate.label)}</h2></div>
        <a href="${htmlEscape(candidate.relativeHtmlPath)}" target="_blank">Play full screen ↗</a>
      </header>
      ${candidate.id === input.selectedCandidateId ? `<p class="selected">Selected for the bounded refactor</p>` : ""}
      <div class="screens">${screenshots}</div>
      <details open><summary>Evaluator judgment</summary><pre>${htmlEscape(JSON.stringify(review, null, 2))}</pre></details>
      <div class="human" data-human-card="${htmlEscape(candidate.id)}">
        ${scoreCards()}
        <label class="notes">Human notes<textarea data-human-notes placeholder="What felt alive? What felt generic?"></textarea></label>
      </div>
    </section>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
  <title>Sunny Math Creative Sandbox Comparison</title>
  <style>
  :root{font-family:Inter,system-ui;color:#f7f3e8;background:#090b15}*{box-sizing:border-box}
  body{margin:0;padding:32px;background:radial-gradient(circle at top,#24204b,#090b15 42%) fixed}
  main{max-width:1600px;margin:auto}h1{font-size:clamp(40px,7vw,88px);line-height:.94;margin:8px 0 18px}
  h2{margin:3px 0}.eyebrow{color:#84ead0;text-transform:uppercase;letter-spacing:.15em;font-size:12px;font-weight:800}
  .intro{margin-bottom:32px;color:#c8c5d3;max-width:1000px}.candidate{background:#121524;border:1px solid #343a59;border-radius:22px;padding:20px;margin:28px 0}
  header{display:flex;justify-content:space-between;align-items:center;gap:16px}a{background:#84ead0;color:#07110f;text-decoration:none;padding:10px 14px;border-radius:999px;font-weight:800}
  .selected{color:#ffd56a;font-weight:800}.screens{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin:18px 0}
  figure{margin:0;background:#080a11;border-radius:14px;overflow:hidden}img{display:block;width:100%;aspect-ratio:1365/768;object-fit:cover}figcaption{padding:8px;color:#aaa}
  pre{white-space:pre-wrap;color:#d8d6df}.human{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;border-top:1px solid #303650;padding-top:16px}
  label{display:grid;gap:6px;text-transform:capitalize;color:#c8c5d3}select,textarea{background:#090b15;color:#fff;border:1px solid #414866;border-radius:9px;padding:10px;font:inherit}
  .notes{grid-column:1/-1}.notes textarea{min-height:90px}.summary{background:#0d1020;border-radius:16px;padding:18px}
  </style></head><body><main>
    <p class="eyebrow">Measured scenario experiment</p><h1>Which context produced the strongest experience?</h1>
    <p class="intro">Your judgment is the primary result. Evaluator scores support comparison but cannot select production content.</p>
    <div class="summary"><strong>Evaluator selection:</strong> ${htmlEscape(input.selectedCandidateId)}<br>${htmlEscape(input.selectionReason)}
    <details><summary>Run summary</summary><pre>${htmlEscape(JSON.stringify(input.runSummary, null, 2))}</pre></details></div>
    ${sections}
  </main><script>
  document.querySelectorAll("[data-human-card]").forEach(card=>{
    const id=card.dataset.humanCard;
    card.querySelectorAll("[data-human-score]").forEach(control=>{
      const key="sunny-quality:"+id+":"+control.dataset.humanScore;
      control.value=localStorage.getItem(key)||"";
      control.addEventListener("change",()=>localStorage.setItem(key,control.value));
    });
    const notes=card.querySelector("[data-human-notes]");
    const key="sunny-quality:"+id+":notes";
    notes.value=localStorage.getItem(key)||"";
    notes.addEventListener("input",()=>localStorage.setItem(key,notes.value));
  });</script></body></html>`;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const childId = arg("child") || "reina";
  const pdf = arg("pdf") || "/Users/jamaltaylor/Downloads/pashley-math-2-multiplication.pdf";
  const concept = arg("concept")
    || "multiplication as equal groups and arrays, connected to skip-counting and interpreted in word problems";
  const model = process.env.SUNNY_SANDBOX_MODEL
    ?? process.env.SUNNY_GENERATION_MODEL
    ?? "claude-sonnet-5";
  const evaluatorModel = process.env.SUNNY_SANDBOX_EVALUATOR_MODEL ?? model;
  const sourceRun = arg("source-run");
  const profileFile = path.join(root, "src", "context", childId, "learning_profile.json");
  const controlFile = arg("control")
    || path.join(root, "src", "context", childId, "homework", "games", "hw-math-a179d2a0", "skip-count-glider.html");
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("sandbox_requires_ANTHROPIC_API_KEY");
  if (!fs.existsSync(pdf)) throw new Error(`sandbox_assignment_missing:${pdf}`);
  if (!fs.existsSync(profileFile)) throw new Error(`sandbox_profile_missing:${profileFile}`);
  if (!sourceRun && !fs.existsSync(controlFile)) {
    throw new Error(`sandbox_control_missing:${controlFile}`);
  }
  if (sourceRun && !fs.existsSync(sourceRun)) {
    throw new Error(`sandbox_source_run_missing:${sourceRun}`);
  }

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${sourceRun ? "reevaluation-" : ""}${childId}`;
  const outputDir = resolveSandboxOutput(root, runId);
  fs.mkdirSync(outputDir, { recursive: true });
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const profile = readJson(profileFile);
  const packets = buildScenarioPackets({
    concept,
    profile,
    factualProfileEvidence: {
      observations: [
        {
          fact: "Reina independently selected wrestling and handling competition losses as a conversation topic.",
          source: "src/context/reina/reina_context.md",
        },
        {
          fact: "Reina has repeatedly requested multiplication and division work.",
          source: "src/context/reina/reina_context.md",
        },
        {
          fact: "Observed addition-fact performance reached 100% with fast responses during challenge-framed sessions.",
          source: "src/context/reina/reina_context.md",
        },
        {
          fact: "Observed coin performance was 86% in an applied store activity and 26% on a mechanical worksheet.",
          source: "src/context/reina/reina_context.md",
        },
        {
          fact: "Reina requested another action story involving bad guys and accurately followed literal events.",
          source: "src/context/reina/reina_context.md",
        },
        {
          fact: "Reina is bilingual in English and Japanese, wrestles competitively, and enjoys chess and strategy games.",
          source: "src/context/reina/soul.md",
        },
        {
          fact: "Observed productive session focus is commonly 15–20 minutes before a pivot or break.",
          source: "src/context/reina/reina_context.md",
        },
      ],
      confidence: "mixed; each observation is source-cited and remains factual rather than a design directive",
    },
  });
  fs.writeFileSync(path.join(outputDir, "scenario-inputs.json"), `${JSON.stringify({
    childId,
    assignmentFile: pdf,
    concept,
    model,
    evaluatorModel,
    packets,
  }, null, 2)}\n`);

  const controlCopy = "scenario-0-control.html";
  fs.copyFileSync(
    sourceRun ? path.join(sourceRun, controlCopy) : controlFile,
    path.join(outputDir, controlCopy),
  );
  const candidates: Candidate[] = [{
    id: "scenario-0-control",
    label: "Scenario 0 — current Sunny control",
    concept,
    htmlPath: path.join(outputDir, controlCopy),
    relativeHtmlPath: controlCopy,
  }];

  let generated: Candidate[];
  let generationFailures: Array<{ scenario: string; reason: string }> = [];
  if (sourceRun) {
    console.log(` 🎮 [math-creative-sandbox] [reuse] source=${sourceRun}`);
    const regenerateProfileScenarios = arg("regenerate-profile-scenarios") === "true";
    generated = await Promise.all(packets.map(async (packet): Promise<Candidate> => {
      if (regenerateProfileScenarios && packet.id !== "scenario-1-concept-only") {
        const prompt = creatorPrompt(packet);
        const promptPath = path.join(outputDir, `${packet.id}.prompt.txt`);
        fs.writeFileSync(promptPath, prompt);
        const result = await generateHtml({ client, model, prompt });
        fs.writeFileSync(path.join(outputDir, `${packet.id}.raw-response.txt`), result.rawText);
        const generation = {
          model,
          elapsedMs: result.elapsedMs,
          stopReason: result.response.stop_reason,
          usage: usageOf(result.response),
        };
        fs.writeFileSync(
          path.join(outputDir, `${packet.id}.generation.json`),
          `${JSON.stringify(generation, null, 2)}\n`,
        );
        if (!result.html) {
          throw new Error(
            `sandbox_creator_returned_incomplete_html:${packet.id}:stop=${result.response.stop_reason}`,
          );
        }
        const relativeHtmlPath = `${packet.id}.html`;
        const htmlPath = path.join(outputDir, relativeHtmlPath);
        fs.writeFileSync(htmlPath, result.html);
        console.log(` 🎮 [math-creative-sandbox] [generate] complete=${packet.id} chars=${result.html.length}`);
        return {
          id: packet.id,
          label: packet.label,
          concept,
          htmlPath,
          relativeHtmlPath,
          promptPath,
          prompt,
          generation,
        };
      }
      const relativeHtmlPath = `${packet.id}.html`;
      const sourceHtml = path.join(sourceRun, relativeHtmlPath);
      if (!fs.existsSync(sourceHtml)) {
        throw new Error(`sandbox_source_candidate_missing:${sourceHtml}`);
      }
      const htmlPath = path.join(outputDir, relativeHtmlPath);
      fs.copyFileSync(sourceHtml, htmlPath);

      const promptName = `${packet.id}.prompt.txt`;
      const generationName = `${packet.id}.generation.json`;
      const sourcePrompt = path.join(sourceRun, promptName);
      const sourceGeneration = path.join(sourceRun, generationName);
      const prompt = fs.existsSync(sourcePrompt)
        ? fs.readFileSync(sourcePrompt, "utf8")
        : creatorPrompt(packet);
      fs.writeFileSync(path.join(outputDir, promptName), prompt);
      const generation = fs.existsSync(sourceGeneration)
        ? readJson(sourceGeneration) as Candidate["generation"]
        : undefined;
      if (generation) {
        fs.writeFileSync(
          path.join(outputDir, generationName),
          `${JSON.stringify(generation, null, 2)}\n`,
        );
      }
      return {
        id: packet.id,
        label: packet.label,
        concept,
        htmlPath,
        relativeHtmlPath,
        promptPath: path.join(outputDir, promptName),
        prompt,
        generation,
      };
    }));
  } else {
    console.log(" 🎮 [math-creative-sandbox] [generate] starting scenarios 1-3 in parallel");
    const generatedSettled = await Promise.allSettled(packets.map(async (packet): Promise<Candidate> => {
      const prompt = creatorPrompt(packet);
      const promptPath = path.join(outputDir, `${packet.id}.prompt.txt`);
      fs.writeFileSync(promptPath, prompt);
      const result = await generateHtml({ client, model, prompt });
      fs.writeFileSync(path.join(outputDir, `${packet.id}.raw-response.txt`), result.rawText);
      const generation = {
        model,
        elapsedMs: result.elapsedMs,
        stopReason: result.response.stop_reason,
        usage: usageOf(result.response),
      };
      fs.writeFileSync(
        path.join(outputDir, `${packet.id}.generation.json`),
        `${JSON.stringify(generation, null, 2)}\n`,
      );
      if (!result.html) {
        throw new Error(
          `sandbox_creator_returned_incomplete_html:${packet.id}:stop=${result.response.stop_reason}`,
        );
      }
      const relativeHtmlPath = `${packet.id}.html`;
      const htmlPath = path.join(outputDir, relativeHtmlPath);
      fs.writeFileSync(htmlPath, result.html);
      console.log(` 🎮 [math-creative-sandbox] [generate] complete=${packet.id} chars=${result.html.length}`);
      return {
        id: packet.id,
        label: packet.label,
        concept,
        htmlPath,
        relativeHtmlPath,
        promptPath,
        prompt,
        generation,
      };
    }));
    generated = generatedSettled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    generationFailures = generatedSettled.flatMap((result, index) =>
      result.status === "rejected"
        ? [{
            scenario: packets[index].id,
            reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
          }]
        : []
    );
  }
  fs.writeFileSync(
    path.join(outputDir, "generation-outcomes.json"),
    `${JSON.stringify({
      completed: generated.map((candidate) => candidate.id),
      failures: generationFailures,
    }, null, 2)}\n`,
  );
  if (generationFailures.length > 0) {
    throw new Error(`sandbox_generation_incomplete:${JSON.stringify(generationFailures)}`);
  }
  candidates.push(...generated);

  const server = await startServer(outputDir);
  const browser = await chromium.launch({ headless: true });
  const explorations = new Map<string, ExplorationResult>();
  const reviews = new Map<string, CandidateReview>();
  const evaluatorUsage: Usage[] = [];
  try {
    for (const candidate of candidates) {
      console.log(` 🎮 [math-creative-sandbox] [evaluate] exploring=${candidate.id}`);
      const explored = await exploreCandidate({
        client,
        evaluatorModel,
        browserBaseUrl: server.baseUrl,
        candidate,
        outputDir,
        browser,
      });
      explorations.set(candidate.id, explored.result);
      evaluatorUsage.push(...explored.decisionUsage);
      fs.writeFileSync(
        path.join(outputDir, candidate.id, "exploration-result.json"),
        `${JSON.stringify(explored.result, null, 2)}\n`,
      );
      const reviewed = await reviewCandidate({
        client,
        model: evaluatorModel,
        candidate,
        exploration: explored.result,
      });
      reviews.set(candidate.id, reviewed.review);
      evaluatorUsage.push(usageOf(reviewed.response));
      fs.writeFileSync(
        path.join(outputDir, candidate.id, "quality-review.json"),
        `${JSON.stringify(reviewed.review, null, 2)}\n`,
      );
    }

    const generatedReviews = generated.map((candidate) => reviews.get(candidate.id)!)
      .filter(Boolean);
    const weightedFallback = chooseStrongestCandidate(generatedReviews);
    const comparison = await comparativeSelection({
      client,
      model: evaluatorModel,
      reviews: generatedReviews,
    });
    evaluatorUsage.push(usageOf(comparison.response));
    const selectedCandidate = generated.find(
      (candidate) => candidate.id === comparison.selectedCandidateId,
    ) ?? generated.find((candidate) => candidate.id === weightedFallback.candidateId)!;
    const selectedReview = reviews.get(selectedCandidate.id)!;
    const move = selectedReview.nextMove === "refine" ? "refine" : "pivot";
    const refactorPrompt = buildRefactorPrompt({
      concept,
      originalPrompt: selectedCandidate.prompt ?? "",
      critique: selectedReview.critique,
      html: fs.readFileSync(selectedCandidate.htmlPath, "utf8"),
      move,
    });
    fs.writeFileSync(path.join(outputDir, "scenario-4-refactor.prompt.txt"), refactorPrompt);
    console.log(` 🎮 [math-creative-sandbox] [refactor] source=${selectedCandidate.id} move=${move}`);
    const refactored = await generateHtml({ client, model, prompt: refactorPrompt });
    fs.writeFileSync(path.join(outputDir, "scenario-4-refactor.raw-response.txt"), refactored.rawText);
    if (!refactored.html) {
      throw new Error(
        `sandbox_creator_returned_incomplete_html:scenario-4:stop=${refactored.response.stop_reason}`,
      );
    }
    const refactorFile = "scenario-4-evaluator-refactor.html";
    const refactorCandidate: Candidate = {
      id: "scenario-4-evaluator-refactor",
      label: `Scenario 4 — evaluator-guided ${move} of ${selectedCandidate.id}`,
      concept,
      htmlPath: path.join(outputDir, refactorFile),
      relativeHtmlPath: refactorFile,
      prompt: refactorPrompt,
      promptPath: path.join(outputDir, "scenario-4-refactor.prompt.txt"),
      generation: {
        model,
        elapsedMs: refactored.elapsedMs,
        stopReason: refactored.response.stop_reason,
        usage: usageOf(refactored.response),
      },
    };
    fs.writeFileSync(refactorCandidate.htmlPath, refactored.html);
    fs.writeFileSync(
      path.join(outputDir, "scenario-4-refactor.generation.json"),
      `${JSON.stringify(refactorCandidate.generation, null, 2)}\n`,
    );
    candidates.push(refactorCandidate);
    const refactorExploration = await exploreCandidate({
      client,
      evaluatorModel,
      browserBaseUrl: server.baseUrl,
      candidate: refactorCandidate,
      outputDir,
      browser,
    });
    explorations.set(refactorCandidate.id, refactorExploration.result);
    evaluatorUsage.push(...refactorExploration.decisionUsage);
    fs.writeFileSync(
      path.join(outputDir, refactorCandidate.id, "exploration-result.json"),
      `${JSON.stringify(refactorExploration.result, null, 2)}\n`,
    );
    const refactorReview = await reviewCandidate({
      client,
      model: evaluatorModel,
      candidate: refactorCandidate,
      exploration: refactorExploration.result,
    });
    reviews.set(refactorCandidate.id, refactorReview.review);
    evaluatorUsage.push(usageOf(refactorReview.response));
    fs.writeFileSync(
      path.join(outputDir, refactorCandidate.id, "quality-review.json"),
      `${JSON.stringify(refactorReview.review, null, 2)}\n`,
    );

    const generationUsage = candidates.flatMap((candidate) =>
      candidate.generation ? [candidate.generation.usage] : []
    );
    const allUsage = [...generationUsage, ...evaluatorUsage];
    const totalInputTokens = allUsage.reduce((sum, usage) => sum + usage.inputTokens, 0);
    const totalOutputTokens = allUsage.reduce((sum, usage) => sum + usage.outputTokens, 0);
    const costs = allUsage.map((usage) => usage.estimatedCostUsd);
    const runSummary = {
      checkpoint: "f172e1b",
      childId,
      concept,
      model,
      evaluatorModel,
      selectedCandidateId: selectedCandidate.id,
      selectionReason: comparison.reason,
      allGeneratedCandidatesRejected: weightedFallback.allRejected,
      refactorMove: move,
      totalInputTokens,
      totalOutputTokens,
      estimatedCostUsd: costs.every((cost) => cost !== null)
        ? costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0)
        : null,
      costNote: costs.every((cost) => cost !== null)
        ? "Calculated from SUNNY_SANDBOX_*_COST_PER_MTOK."
        : "Token usage recorded; pricing rates were not configured.",
    };
    fs.writeFileSync(path.join(outputDir, "run-summary.json"), `${JSON.stringify(runSummary, null, 2)}\n`);
    fs.writeFileSync(path.join(outputDir, "comparison.html"), gallery({
      outputDir,
      candidates,
      explorations,
      reviews,
      selectedCandidateId: selectedCandidate.id,
      selectionReason: comparison.reason,
      runSummary,
    }));
    fs.writeFileSync(
      path.join(outputDir, "README.md"),
      `# Math Creative Sandbox Result

Open \`comparison.html\` and judge the screenshots before reading the evaluator.

- Control: Scenario 0
- Raw generation conditions: Scenarios 1–3
- Evaluator selection: ${selectedCandidate.id}
- Bounded refactor: Scenario 4 (${move})
- Published to Sunny: no
- Child state changed: no
`,
    );
    console.log(` 🎮 [math-creative-sandbox] [complete] gallery=${path.join(outputDir, "comparison.html")}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(` 🎮 [math-creative-sandbox] [failed] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
