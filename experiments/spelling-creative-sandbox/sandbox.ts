import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
export type Candidate = { model: string; html: string; inputTokens: number; outputTokens: number; costUsd: number; ms: number; error?: string; checks: Check[]; screenshot?: string };
export type Ask = { prompt: string; hash: string };
export type SandboxRun = { runId: string; createdAt: string; pickers: string[]; cases: Array<{ child: SandboxChild; ask: Ask; candidates: Candidate[] }> };

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

/** The one ask every model gets for this child. Its fingerprint proves the comparison was fair. */
export function buildAsk(child: SandboxChild): Ask {
  const prompt = `Build one spelling game for a child. It runs inside Sunny, a study helper for kids.

About her (her own profile; empty means we know nothing yet):
${child.soul.trim() || "(no profile yet)"}
Grade: ${child.grade}
Her 10 spelling words: ${child.words.join(", ")}
Words she missed on her first check: ${child.missedWords.join(", ")}

Make it something she will want to play again, and that helps her spell these words without help.

How the game must work:
- One complete, self-contained HTML document: inline CSS and JavaScript only. No external files, no internet, no image URLs; draw with CSS, SVG, canvas or emoji. It runs in a sandboxed frame about 900×650 pixels, with mouse or touch.
- She spells each of the 10 words at least once, by typing or tapping letters. While she spells a word, do not show that word on screen; give a clue instead: say it aloud with speechSynthesis, a picture or emoji, or a sentence with a blank.
- After every spelling attempt, call parent.postMessage({type: "spelling-answer", word: "<the target word>", typed: "<what she typed>", correct: true or false}, "*").
- When she finishes, call parent.postMessage({type: "spelling-done"}, "*").
- Keep instructions short and also say them aloud. A wrong answer never ends the game.

Reply with only the HTML document.`;
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

const frameDoc = (html: string) => /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, match => `${match}${CSP}`) : `${CSP}${html}`;
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
    return { model, html, inputTokens, outputTokens, costUsd, ms: Date.now() - started, checks: [], ...(html ? {} : { error: `no game in the reply (stop=${message.stop_reason})` }) };
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
  return { id: "dry", type: "message", role: "assistant", model: request.model, stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 }, content: [{ type: "text", text: dryGame(child) }] } as unknown as Anthropic.Messages.Message;
} }) } };

/** A fixed shuffle per run and child, so A, B and C never follow the order the models were asked in. */
export function blindOrder<T>(runId: string, caseId: string, items: T[]): T[] {
  const key = (index: number) => crypto.createHash("sha256").update(`${runId}:${caseId}:${index}`).digest("hex");
  return items.map((item, index) => ({ item, key: key(index) })).sort((a, b) => a.key.localeCompare(b.key)).map(row => row.item);
}

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
const playable = (candidate: Candidate) => !candidate.error && candidate.html.length > 0 && candidate.checks.filter(check => ["game in reply", "no internet", "reports answers"].includes(check.name)).every(check => check.passed);

/** The play page: blind games in locked-down frames; answers and picks recorded per player; Reveal last. */
export function renderPage(run: SandboxRun): string {
  const reveal: Record<string, unknown> = {};
  const sections = run.cases.map(({ child, ask, candidates }) => {
    const cards = blindOrder(run.runId, child.id, candidates).map((candidate, index) => {
      const label = String.fromCharCode(65 + index), id = `${child.id}:${label}`;
      reveal[id] = { model: candidate.model, tokens: candidate.inputTokens + candidate.outputTokens, costUsd: Math.round(candidate.costUsd * 1000) / 1000, seconds: Math.round(candidate.ms / 1000), error: candidate.error ?? null, checks: candidate.checks };
      const game = playable(candidate)
        ? `<div class="stage"><iframe sandbox="allow-scripts" data-card="${escape(id)}" title="Game ${label}" srcdoc="${attr(frameDoc(candidate.html))}"></iframe></div>`
        : `<div class="broken">This game did not build${candidate.error ? "" : " safely"}, so nobody plays it.</div>`;
      const picks = run.pickers.map(name => `<button class="pick" data-case="${escape(child.id)}" data-card="${escape(id)}" data-picker="${escape(name)}">${escape(name)} picks ${label}</button>`).join("");
      return `<article class="card" data-card="${escape(id)}"><header><h3>${label}</h3>${playable(candidate) ? `<button class="restart" data-card="${escape(id)}">Start over</button>` : ""}<span class="score" data-card="${escape(id)}"></span></header>${game}<div class="picks">${picks}</div><div class="reveal" hidden></div></article>`;
    }).join("");
    return `<section><h2>${escape(child.id)} <small>grade ${child.grade}</small></h2><details><summary>Her profile, her 10 words, and the ask (the same for every model)</summary><pre>${escape(ask.prompt)}</pre><p class="small">Ask fingerprint ${ask.hash.slice(0, 12)}</p></details><div class="cards">${cards}</div></section>`;
  }).join("");
  const data = JSON.stringify({ runId: run.runId, reveal }).replace(/</g, "\\u003c");
  const players = run.pickers.map((name, index) => `<button class="player${index === 0 ? " on" : ""}" data-player="${escape(name)}">${escape(name)}</button>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Spelling Sandbox</title>
<style>:root{--bg:#f7f7fb;--fg:#1f2937;--muted:#6b7280;--card:#fff;--line:#e5e7eb;--accent:#7c3aed;--good:#15803d;--bad:#b91c1c}@media (prefers-color-scheme:dark){:root{--bg:#111827;--fg:#f3f4f6;--muted:#9ca3af;--card:#1f2937;--line:#374151;--accent:#a78bfa;--good:#4ade80;--bad:#f87171}}
*{box-sizing:border-box}body{background:var(--bg);color:var(--fg);font:16px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1900px;padding:16px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:16px}.card{background:var(--card);border:2px solid var(--line);border-radius:14px;padding:12px}.card.picked{border-color:var(--accent)}.card header{display:flex;align-items:center;gap:10px}h3{margin:0;font-size:30px}.stage{position:relative;width:100%;aspect-ratio:900/650;overflow:hidden;border:1px solid var(--line);border-radius:10px;background:#fff;margin-top:8px}.stage iframe{position:absolute;top:0;left:0;width:900px;height:650px;border:0;transform-origin:0 0}.broken{padding:40px 16px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:10px;margin-top:8px}.small,small{color:var(--muted);font-size:14px}.score{margin-left:auto;color:var(--muted);font-size:14px}.picks{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}button{font:inherit;border-radius:999px;border:1px solid var(--line);background:var(--bg);color:var(--fg);padding:6px 12px;cursor:pointer}button.on{background:var(--accent);color:#fff;border-color:var(--accent)}.bar{position:sticky;top:0;background:var(--bg);padding:8px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;z-index:1;border-bottom:1px solid var(--line)}.reveal{margin-top:10px;font-size:14px}.ok{color:var(--good)}.no{color:var(--bad)}pre{white-space:pre-wrap;font-size:13px}</style></head>
<body><h1>Spelling Sandbox</h1><p class="small">Run ${escape(run.runId)}. Each card is a game a different AI model built for the same pretend child. Pick who is playing, play, then pick a favorite. Reveal shows which model built each game.</p>
<div class="bar"><span>Who's playing?</span>${players}<span style="flex:1"></span><button id="reveal">Reveal</button><button id="download">Download results</button><button id="clear">Clear</button></div>${sections}
<script type="application/json" id="data">${data}</script>
<script>const data=JSON.parse(document.getElementById('data').textContent);const key='spelling-sandbox:'+data.runId;
const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}};const write=()=>{try{localStorage.setItem(key,JSON.stringify(state))}catch{}};
const state=Object.assign({picks:{},answers:{}},read());let player=document.querySelector('.player.on')?.dataset.player;
const frames=new Map([...document.querySelectorAll('iframe[data-card]')].map(f=>[f.contentWindow,f.dataset.card]));
const tally=(card,who)=>{const rows=(state.answers[card]||[]).filter(r=>!who||r.player===who);return {right:rows.filter(r=>r.correct).length,total:rows.length}};
const paint=()=>{document.querySelectorAll('.player').forEach(b=>b.classList.toggle('on',b.dataset.player===player));
document.querySelectorAll('.pick').forEach(b=>b.classList.toggle('on',state.picks[b.dataset.case+'|'+b.dataset.picker]===b.dataset.card));
document.querySelectorAll('.card').forEach(c=>c.classList.toggle('picked',Object.values(state.picks).includes(c.dataset.card)));
document.querySelectorAll('.score').forEach(s=>{const t=tally(s.dataset.card,player);s.textContent=t.total?player+': '+t.right+' of '+t.total+' right':''})};
addEventListener('message',e=>{const card=frames.get(e.source);if(!card||!e.data||typeof e.data!=='object')return;
if(e.data.type==='spelling-answer'){(state.answers[card]=state.answers[card]||[]).push({player,word:String(e.data.word||''),typed:String(e.data.typed||''),correct:e.data.correct===true,at:new Date().toISOString()});write();paint()}});
document.querySelectorAll('.player').forEach(b=>b.addEventListener('click',()=>{player=b.dataset.player;paint()}));
document.querySelectorAll('.pick').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.case+'|'+b.dataset.picker;state.picks[k]=state.picks[k]===b.dataset.card?undefined:b.dataset.card;write();paint()}));
document.querySelectorAll('.restart').forEach(b=>b.addEventListener('click',()=>{const f=document.querySelector('iframe[data-card="'+b.dataset.card+'"]');frames.delete(f.contentWindow);f.srcdoc=f.srcdoc;f.addEventListener('load',()=>frames.set(f.contentWindow,f.dataset.card),{once:true})}));
document.getElementById('clear').addEventListener('click',()=>{if(confirm('Clear all picks and answers for this run?')){state.picks={};state.answers={};write();paint()}});
document.getElementById('download').addEventListener('click',()=>{const revealed=!!document.body.dataset.revealed;const picks=Object.entries(state.picks).filter(([,v])=>v).map(([k,card])=>{const [child,picker]=k.split('|');return {child,picker,card,model:revealed?data.reveal[card].model:'(hidden until Reveal)'}});
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({runId:data.runId,picks,answers:state.answers},null,2)],{type:'application/json'}));a.download='sandbox-results-'+data.runId+'.json';a.click()});
document.getElementById('reveal').addEventListener('click',()=>{document.body.dataset.revealed='1';document.querySelectorAll('.card').forEach(c=>{const r=data.reveal[c.dataset.card],el=c.querySelector('.reveal');el.hidden=false;el.textContent='';
const line=(t,cls)=>{const d=document.createElement('div');if(cls)d.className=cls;d.textContent=t;el.appendChild(d)};const head=document.createElement('b');head.textContent=r.model;el.appendChild(head);
line('$'+r.costUsd.toFixed(3)+' · '+r.tokens+' tokens · '+r.seconds+' s'+(r.error?' · '+r.error:''));
for(const name of new Set((state.answers[c.dataset.card]||[]).map(x=>x.player))){const t=tally(c.dataset.card,name);line(name+': '+t.right+' of '+t.total+' right')}
(r.checks||[]).forEach(x=>line((x.passed?'✓ ':'✗ ')+x.name+': '+x.detail,x.passed?'ok':'no'))})});
// Games are built for 900×650; each is shown at that size and scaled to fit its card.
const fit=()=>document.querySelectorAll('.stage').forEach(s=>{s.firstElementChild.style.transform='scale('+(s.clientWidth/900)+')'});addEventListener('resize',fit);fit();
paint();</script></body></html>`;
}

export async function runSandbox(input: { models: string[]; caseIds?: string[]; pickers?: string[]; dry?: boolean; maxTokens?: number; outputRoot?: string; client?: Client; skipBrowser?: boolean }): Promise<{ run: SandboxRun; file: string }> {
  const children = SANDBOX_CHILDREN.filter(child => !input.caseIds?.length || input.caseIds.includes(child.id));
  for (const child of children) if (REAL_CHILDREN.has(child.id)) throw new Error(`sandbox_real_child_refused:${child.id}`);
  const cap = input.maxTokens ?? 200_000;
  const runId = new Date().toISOString().replace(/[:.]/g, "-") + (input.dry ? "-dry" : "");
  const run: SandboxRun = { runId, createdAt: new Date().toISOString(), pickers: input.pickers ?? ["Ila", "Reina", "Saori"], cases: [] };
  const client = input.client ?? (input.dry ? dryClient : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 }));
  let tokens = 0;
  for (const child of children) {
    const ask = buildAsk(child), candidates: Candidate[] = [];
    // The models build in parallel for one child; the cap is checked before each child.
    const asked = tokens >= cap
      ? input.models.map(model => ({ model, html: "", inputTokens: 0, outputTokens: 0, costUsd: 0, ms: 0, error: `token cap ${cap} reached; not asked`, checks: [] } as Candidate))
      : await Promise.all(input.models.map(model => askModel(client, model, ask)));
    for (const candidate of asked) {
      tokens += candidate.inputTokens + candidate.outputTokens;
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
    caseIds: list(arg("cases")),
    pickers: list(arg("pickers")),
    dry: process.argv.includes("--dry"),
    maxTokens: arg("max-tokens") ? Number(arg("max-tokens")) : undefined,
  }).catch(error => { console.error(` 🎮 [spelling-sandbox] [run] [failed] reason=${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
