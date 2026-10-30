import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { requestForModel } from "../../src/engine/plannerTransport";
import { SANDBOX_CHILDREN, type SandboxChild } from "./cases";

/**
 * Spelling creative sandbox. Every model gets the same ask for the same fictional child (her profile and
 * her 10 spelling words) and builds one playable spelling game. Code checks each game in a real browser
 * (it loads, reaches nothing outside, reports answers). One page shows the games side by side, blind, in
 * locked-down frames: the family plays them, code records every answer, each player picks a favorite, and
 * Reveal shows which model built which game, its cost, and how each player did. A model that wins here
 * reaches Sunny only on the owner's green light. Never touches a real child or Sunny's running code.
 */
export type Check = { name: string; passed: boolean; detail: string };
export type Variant = "plain" | "goal" | "painted";
export type Candidate = { model: string; scene?: string; images?: number; html: string; inputTokens: number; outputTokens: number; costUsd: number; ms: number; error?: string; checks: Check[]; screenshot?: string };
export type Ask = { prompt: string; hash: string };
export type SandboxRun = { runId: string; createdAt: string; variant?: Variant; pickers: string[]; cases: Array<{ child: SandboxChild; ask: Ask; candidates: Candidate[] }> };

/** Dollars per million tokens, from the Claude API model table (cached 2026-10-06). */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
const EFFORT = "high"; // the same for every model, as Sunny's Planner uses
const REAL_CHILDREN = new Set(["ila", "reina"]);
// Games run with nothing outside the frame: no network, no external files.
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:">`;

const GOAL = `This should be the most exciting thing she sees today. When it opens she should gasp and want to go in.
Invent a world she has never seen, made for her: a real place with drama, light and danger, not an app screen. Choose your own colors and make them bold. Avoid the first idea anyone would have for this theme.
Keep her coming back, and help her spell these words without help.`;
const PAINTED_RULE = `No external files, no internet. A painter will make the background for your game: use it in CSS as var(--painting), for example background-image: var(--painting). Draw everything else with CSS, SVG, canvas or emoji.`;
const PAINTED_REPLY = `First write one line starting with SCENE: and one paragraph describing the painting. Then build the game on top of that painting. After the SCENE line, reply with only the HTML document.`;

/** The one ask every model gets for this child. Its fingerprint proves the comparison was fair. */
export function buildAsk(child: SandboxChild, variant: Variant = "plain"): Ask {
  const goal = variant === "plain" ? "Make it something she will want to play again, and that helps her spell these words without help." : GOAL;
  const drawing = variant === "painted" ? PAINTED_RULE : "No external files, no internet, no image URLs; draw with CSS, SVG, canvas or emoji.";
  const reply = variant === "painted" ? PAINTED_REPLY : "Reply with only the HTML document.";
  const prompt = `Build one spelling game for a child. It runs inside Sunny, a study helper for kids.

About her (her own profile; empty means we know nothing yet):
${child.soul.trim() || "(no profile yet)"}
Grade: ${child.grade}
Her 10 spelling words: ${child.words.join(", ")}
Words she missed on her first check: ${child.missedWords.join(", ")}

${goal}

How the game must work:
- One complete, self-contained HTML document: inline CSS and JavaScript only. ${drawing} It runs in a sandboxed frame about 900×650 pixels, with mouse or touch.
- She spells each of the 10 words at least once, by typing or tapping letters. While she spells a word, do not show that word on screen; give a clue instead: say it aloud with speechSynthesis, a picture or emoji, or a sentence with a blank.
- After every spelling attempt, call parent.postMessage({type: "spelling-answer", word: "<the target word>", typed: "<what she typed>", correct: true or false}, "*").
- When she finishes, call parent.postMessage({type: "spelling-done"}, "*").
- Keep instructions short and also say them aloud. A wrong answer never ends the game.

${reply}`;
  return { prompt, hash: crypto.createHash("sha256").update(prompt).digest("hex") };
}

/** The HTML document in a model's reply, with or without a code fence. */
export function extractHtml(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced && /<html[\s>]|<!doctype html/i.test(fenced)) return fenced;
  const start = text.search(/<!doctype html|<html[\s>]/i), end = text.toLowerCase().lastIndexOf("</html>");
  return start >= 0 && end > start ? text.slice(start, end + 7) : "";
}

/** Facts readable from the source before anything runs. */
export function staticChecks(html: string, child: SandboxChild): Check[] {
  const external = html.match(/(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\/[^"']+|\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|@import\s+url\(\s*["']?https?:/gi) ?? [];
  const missing = child.words.filter(word => !html.toLowerCase().includes(word.toLowerCase()));
  return [
    { name: "game in reply", passed: html.length > 0, detail: html.length ? `${Math.round(html.length / 1000)}k characters` : "no HTML document in the reply" },
    { name: "no internet", passed: external.length === 0, detail: external.length ? `reaches outside: ${[...new Set(external)].slice(0, 3).join(" ")}` : "nothing outside the page" },
    { name: "reports answers", passed: /postMessage/.test(html) && html.includes("spelling-answer"), detail: html.includes("spelling-answer") ? "sends spelling-answer" : "never sends spelling-answer" },
    { name: "says when done", passed: html.includes("spelling-done"), detail: html.includes("spelling-done") ? "sends spelling-done" : "never sends spelling-done" },
    { name: "all 10 words in the game", passed: missing.length === 0, detail: missing.length ? `missing: ${missing.join(", ")}` : "every word is in the game" },
  ];
}

export const frameDoc = (html: string) => /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, match => `${match}${CSP}`) : `${CSP}${html}`;
const attr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Load the game in a real browser, framed exactly as on the play page, and let a robot try one answer. */
export async function browserCheck(html: string, child: SandboxChild): Promise<{ checks: Check[]; screenshot?: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 940, height: 700 } });
    const requests: string[] = [], errors: string[] = [], messages: Array<{ type?: string }> = [];
    await page.route("**/*", route => { const url = route.request().url(); if (!url.startsWith("about:") && !url.startsWith("data:")) requests.push(url); return route.abort(); });
    page.on("console", message => { if (message.type() === "error" && !/Content Security Policy/i.test(message.text())) errors.push(message.text().slice(0, 160)); });
    page.on("pageerror", error => errors.push(error.message.slice(0, 160)));
    await page.exposeFunction("__sandboxMessage", (data: { type?: string }) => { messages.push(data); });
    await page.setContent(`<!doctype html><html><body style="margin:0"><iframe id="game" sandbox="allow-scripts" style="width:900px;height:650px;border:0" srcdoc="${attr(frameDoc(html))}"></iframe><script>addEventListener("message",event=>window.__sandboxMessage(event.data))</script></body></html>`);
    await page.waitForTimeout(2500);
    const frame = page.frames().find(row => row !== page.mainFrame());
    const visible = frame ? (await frame.locator("body").innerText({ timeout: 2000 }).catch(() => "")).toLowerCase() : "";
    const shown = child.words.filter(word => new RegExp(`\\b${word}\\b`, "i").test(visible));
    const screenshot = `data:image/png;base64,${(await page.locator("#game").screenshot()).toString("base64")}`;
    // The robot: press a start-like button, type into the first text box, press Enter and a check-like button.
    if (frame) {
      const start = frame.getByRole("button", { name: /start|play|go|begin|let'?s|ready/i }).first();
      if (await start.isVisible().catch(() => false)) await start.click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(800);
      const answered = () => messages.some(row => row.type === "spelling-answer");
      const box = frame.locator("input[type=text], input:not([type]), textarea").first();
      if (await box.isVisible().catch(() => false)) {
        await box.fill("zzz", { timeout: 2000 }).catch(() => undefined);
        await box.press("Enter").catch(() => undefined);
      } else {
        // Tap-keyboard games: tap a letter key a few times, or type on the keyboard the game listens to.
        const key = frame.getByRole("button", { name: /^z$/i }).first();
        if (await key.isVisible().catch(() => false)) for (let tap = 0; tap < 12 && !answered(); tap++) await key.click({ timeout: 1000 }).catch(() => undefined);
        else { await frame.locator("body").click({ timeout: 1000 }).catch(() => undefined); await page.keyboard.type("zzzzzzzzzzzz"); }
        await page.keyboard.press("Enter").catch(() => undefined);
      }
      await page.waitForTimeout(700);
      const check = frame.getByRole("button", { name: /check|submit|enter|done|go|spell|attack|throw|fire|✓|➜|→/i }).first();
      if (!answered() && await check.isVisible().catch(() => false)) await check.click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
    }
    const answered = messages.some(row => row.type === "spelling-answer");
    return { screenshot, checks: [
      { name: "loads", passed: errors.length === 0 && visible.trim().length > 0, detail: errors.length ? `errors: ${errors.slice(0, 2).join(" | ")}` : visible.trim() ? "shows a screen with no errors" : "blank screen" },
      { name: "no requests", passed: requests.length === 0, detail: requests.length ? `tried: ${requests.slice(0, 2).join(" ")}` : "asked for nothing outside" },
      { name: "words hidden at start", passed: shown.length === 0, detail: shown.length ? `first screen has the word ${shown.join(", ")} somewhere (often ordinary text, like a wrestling "match"; look before trusting it)` : "no spelling word on the first screen" },
      { name: "robot got an answer through", passed: answered, detail: answered ? "a robot's typed answer arrived" : "the simple robot could not finish a word (start screens, tap keyboards and custom buttons beat it); play it to be sure" },
    ] };
  } finally { await browser.close(); }
}

type Client = { messages: { stream: (request: Anthropic.Messages.MessageStreamParams) => { finalMessage: () => Promise<Anthropic.Messages.Message> } } };

/** Grok paints the model's scene for a game. The picture goes into the game itself, so the game stays offline. */
async function paintScene(scene: string, dry: boolean): Promise<string> {
  if (dry) return `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="650"><rect width="900" height="650" fill="#402060"/></svg>')}`;
  const apiKey = process.env.GROK_API_KEY?.trim();
  if (!apiKey) throw new Error("sandbox_missing_grok_key");
  const response = await fetch("https://api.x.ai/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.GROK_IMAGE_MODEL?.trim() || "grok-imagine-image", prompt: `${scene} Painted background for a children's game. No text, letters or numbers.`, n: 1 }) });
  if (!response.ok) throw new Error(`sandbox_painting_failed:${response.status}`);
  const url = ((await response.json()) as { data?: Array<{ url?: string }> }).data?.[0]?.url;
  if (!url) throw new Error("sandbox_painting_no_url");
  const image = await fetch(url);
  if (!image.ok) throw new Error(`sandbox_painting_download_failed:${image.status}`);
  return `data:${image.headers.get("content-type") ?? "image/jpeg"};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
}
const withPainting = (html: string, painting: string) => { const style = `<style>:root{--painting:url("${painting}")}</style>`; return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, match => `${match}${style}`) : `${style}${html}`; };

/** One game per model and child, asked through Sunny's one rule for how each model is asked. */
export async function askModel(client: Client, model: string, ask: Ask): Promise<Candidate> {
  const started = Date.now();
  try {
    const message = await client.messages.stream(requestForModel({ model, max_tokens: 64000, output_config: { effort: EFFORT }, messages: [{ role: "user", content: ask.prompt }] } as Anthropic.Messages.MessageStreamParams)).finalMessage();
    const text = message.content.flatMap(block => block.type === "text" ? [block.text] : []).join("\n");
    const inputTokens = message.usage?.input_tokens ?? 0, outputTokens = message.usage?.output_tokens ?? 0;
    const price = PRICES[model];
    const costUsd = price ? (inputTokens * price.input + outputTokens * price.output) / 1e6 : 0;
    const html = extractHtml(text);
    console.log(` 🎮 [spelling-sandbox] [game] [received] model=${model} chars=${html.length} tokens=${inputTokens + outputTokens} cost_usd=${costUsd.toFixed(3)} stop=${message.stop_reason}`);
    const scene = text.match(/^\s*SCENE:\s*(.+)$/m)?.[1]?.trim();
    return { model, ...(scene ? { scene } : {}), html, inputTokens, outputTokens, costUsd, ms: Date.now() - started, checks: [], ...(html ? {} : { error: `no game in the reply (stop=${message.stop_reason})` }) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(` 🎮 [spelling-sandbox] [game] [failed] model=${model} reason=${reason}`);
    return { model, html: "", inputTokens: 0, outputTokens: 0, costUsd: 0, ms: Date.now() - started, error: reason, checks: [] };
  }
}

/** A small working game, for a $0 run: proves the checks and the play page without any model. */
export function dryGame(child: SandboxChild): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font:22px system-ui;text-align:center;background:#fef3c7;margin:0;padding:24px}button,input{font:inherit;padding:8px 14px;border-radius:10px}#clue{font-size:64px}</style></head><body>
<h1>Practice game</h1><p>Listen, then spell the word.</p><div id="clue">🔊</div><p><button id="say">Hear it</button></p><p><input id="box" autocomplete="off"> <button id="check">Check</button></p><p id="note"></p>
<script>const words=${JSON.stringify(child.words)};let i=0;const say=()=>{try{speechSynthesis.speak(new SpeechSynthesisUtterance(words[i]))}catch(e){}};
document.getElementById("say").onclick=say;const check=()=>{const box=document.getElementById("box"),typed=box.value.trim(),correct=typed.toLowerCase()===words[i];
parent.postMessage({type:"spelling-answer",word:words[i],typed,correct},"*");document.getElementById("note").textContent=correct?"Yes!":"Nice try, next one.";box.value="";i++;
if(i>=words.length){parent.postMessage({type:"spelling-done"},"*");document.getElementById("note").textContent="All done!";}};
document.getElementById("check").onclick=check;document.getElementById("box").addEventListener("keydown",e=>{if(e.key==="Enter")check()});</script></body></html>`;
}

const dryClient: Client = { messages: { stream: request => ({ finalMessage: async () => {
  const child = SANDBOX_CHILDREN.find(row => String((request.messages[0] as { content: string }).content).includes(row.words.join(", ")))!;
  return { id: "dry", type: "message", role: "assistant", model: request.model, stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 }, content: [{ type: "text", text: `${String((request.messages[0] as { content: string }).content).includes("SCENE:") ? "SCENE: A purple practice hall.\n" : ""}${dryGame(child)}` }] } as unknown as Anthropic.Messages.Message;
} }) } };

/** A fixed shuffle per run and child, so A, B and C never follow the order the models were asked in. */
export function blindOrder<T>(runId: string, caseId: string, items: T[]): T[] {
  const key = (index: number) => crypto.createHash("sha256").update(`${runId}:${caseId}:${index}`).digest("hex");
  return items.map((item, index) => ({ item, key: key(index) })).sort((a, b) => a.key.localeCompare(b.key)).map(row => row.item);
}

export const playable = (candidate: Candidate) => !candidate.error && candidate.html.length > 0 && candidate.checks.filter(check => ["game in reply", "no internet", "reports answers"].includes(check.name)).every(check => check.passed);

/** The kids' page: a name, one game at a time, a pick by picture. Reveal lives behind the grown-ups door. */
export function renderPage(run: SandboxRun): string {
  const reveal: Record<string, unknown> = {};
  const rounds = run.cases.map(({ child, candidates }) => {
    const cards = blindOrder(run.runId, child.id, candidates).map((candidate, index) => {
      const card = `${child.id}:${String.fromCharCode(65 + index)}`;
      reveal[card] = { model: candidate.model, tokens: candidate.inputTokens + candidate.outputTokens, costUsd: Math.round(candidate.costUsd * 1000) / 1000, seconds: Math.round(candidate.ms / 1000), images: candidate.images ?? 0, scene: candidate.scene ?? null, error: candidate.error ?? null, checks: candidate.checks };
      return { card, candidate };
    });
    return { id: child.id, all: cards.map(row => row.card), games: cards.filter(row => playable(row.candidate)).map(row => ({ card: row.card, html: frameDoc(row.candidate.html), shot: row.candidate.screenshot ?? null })) };
  });
  const data = JSON.stringify({ runId: run.runId, variant: run.variant ?? "plain", players: run.pickers, rounds, reveal }).replace(/</g, "\\u003c");
  const template = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "play-page.html"), "utf8");
  return template.replace("/*DATA*/null", () => data);
}

export async function runSandbox(input: { models: string[]; variant?: Variant; caseIds?: string[]; pickers?: string[]; dry?: boolean; maxTokens?: number; outputRoot?: string; client?: Client; skipBrowser?: boolean }): Promise<{ run: SandboxRun; file: string }> {
  const children = SANDBOX_CHILDREN.filter(child => !input.caseIds?.length || input.caseIds.includes(child.id));
  for (const child of children) if (REAL_CHILDREN.has(child.id)) throw new Error(`sandbox_real_child_refused:${child.id}`);
  const cap = input.maxTokens ?? 200_000, variant = input.variant ?? "plain";
  const runId = new Date().toISOString().replace(/[:.]/g, "-") + `-${variant}` + (input.dry ? "-dry" : "");
  const run: SandboxRun = { runId, createdAt: new Date().toISOString(), variant, pickers: input.pickers ?? ["Ila", "Reina", "Saori"], cases: [] };
  const client = input.client ?? (input.dry ? dryClient : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 }));
  let tokens = 0;
  for (const child of children) {
    const ask = buildAsk(child, variant), candidates: Candidate[] = [];
    // The models build in parallel for one child; the cap is checked before each child.
    const asked = tokens >= cap
      ? input.models.map(model => ({ model, html: "", inputTokens: 0, outputTokens: 0, costUsd: 0, ms: 0, error: `token cap ${cap} reached; not asked`, checks: [] } as Candidate))
      : await Promise.all(input.models.map(model => askModel(client, model, ask)));
    for (const candidate of asked) {
      tokens += candidate.inputTokens + candidate.outputTokens;
      if (candidate.html && variant === "painted") {
        try {
          if (!candidate.scene) throw new Error("no SCENE line in the reply");
          candidate.html = withPainting(candidate.html, await paintScene(candidate.scene, Boolean(input.dry)));
          candidate.images = 1;
          console.log(` 🎮 [spelling-sandbox] [painting] [added] model=${candidate.model} child=${child.id}`);
        } catch (error) { console.error(` 🎮 [spelling-sandbox] [painting] [skipped] model=${candidate.model} child=${child.id} reason=${error instanceof Error ? error.message : error}`); }
      }
      if (candidate.html) {
        candidate.checks = staticChecks(candidate.html, child);
        if (!input.skipBrowser) {
          const browser = await browserCheck(candidate.html, child).catch(error => ({ checks: [{ name: "loads", passed: false, detail: `browser check failed: ${error instanceof Error ? error.message : error}` }], screenshot: undefined }));
          candidate.checks.push(...browser.checks);
          candidate.screenshot = browser.screenshot;
        }
        console.log(` 🎮 [spelling-sandbox] [checks] [${candidate.checks.every(check => check.passed) ? "all-passed" : "some-failed"}] model=${candidate.model} child=${child.id} ${candidate.checks.filter(check => !check.passed).map(check => check.name).join(",")}`);
      }
      candidates.push(candidate);
    }
    run.cases.push({ child, ask, candidates });
  }
  const directory = path.join(input.outputRoot ?? path.join(process.cwd(), "outputs/spelling-creative-sandbox"), runId);
  fs.mkdirSync(directory, { recursive: true });
  for (const { child, candidates } of run.cases) for (const candidate of candidates) if (candidate.html) fs.writeFileSync(path.join(directory, `${child.id}-${candidate.model}.html`), candidate.html);
  fs.writeFileSync(path.join(directory, "run.json"), JSON.stringify({ ...run, cases: run.cases.map(row => ({ ...row, candidates: row.candidates.map(({ html: _html, screenshot: _shot, ...rest }) => rest) })) }, null, 2));
  const file = path.join(directory, "index.html");
  fs.writeFileSync(file, renderPage(run));
  const spent = run.cases.flatMap(row => row.candidates).reduce((sum, row) => sum + row.costUsd, 0);
  console.log(` 🎮 [spelling-sandbox] [page] [written] file=${file} cases=${run.cases.length} models=${input.models.length} tokens=${tokens} cost_usd=${spent.toFixed(2)}`);
  return { run, file };
}

/** Re-run the checks on a finished run's saved games and rewrite its page. No model is called. */
export async function recheckRun(directory: string): Promise<string> {
  const saved = JSON.parse(fs.readFileSync(path.join(directory, "run.json"), "utf8")) as SandboxRun;
  for (const { child, candidates } of saved.cases) for (const candidate of candidates) {
    const file = path.join(directory, `${child.id}-${candidate.model}.html`);
    candidate.html = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (!candidate.html) continue;
    const browser = await browserCheck(candidate.html, child);
    candidate.checks = [...staticChecks(candidate.html, child), ...browser.checks];
    candidate.screenshot = browser.screenshot;
    console.log(` 🎮 [spelling-sandbox] [recheck] [${candidate.checks.every(check => check.passed) ? "all-passed" : "some-failed"}] model=${candidate.model} child=${child.id} ${candidate.checks.filter(check => !check.passed).map(check => check.name).join(",")}`);
  }
  fs.writeFileSync(path.join(directory, "run.json"), JSON.stringify({ ...saved, cases: saved.cases.map(row => ({ ...row, candidates: row.candidates.map(({ html: _html, screenshot: _shot, ...rest }) => rest) })) }, null, 2));
  const page = path.join(directory, "index.html");
  fs.writeFileSync(page, renderPage(saved));
  console.log(` 🎮 [spelling-sandbox] [page] [rewritten] file=${page}`);
  return page;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href && process.argv.some(value => value.startsWith("--recheck="))) {
  recheckRun(path.resolve(process.argv.find(value => value.startsWith("--recheck="))!.split("=").slice(1).join("="))).catch(error => { console.error(` 🎮 [spelling-sandbox] [recheck] [failed] reason=${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const arg = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const list = (value: string | undefined) => value?.split(",").map(row => row.trim()).filter(Boolean);
  runSandbox({
    models: list(arg("models")) ?? ["claude-sonnet-5", "claude-sonnet-5-5", "claude-opus-5-5"],
    variant: (arg("set") ?? "plain") as Variant,
    caseIds: list(arg("cases")),
    pickers: list(arg("pickers")),
    dry: process.argv.includes("--dry"),
    maxTokens: arg("max-tokens") ? Number(arg("max-tokens")) : undefined,
  }).catch(error => { console.error(` 🎮 [spelling-sandbox] [run] [failed] reason=${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
