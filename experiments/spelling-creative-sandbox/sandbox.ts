import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildAssignmentPlanningPacket, type AssignmentSourceExtraction } from "../../src/engine/assignmentPlanner";
import { requestForModel } from "../../src/engine/plannerTransport";
import type { ChildChart } from "../../src/profiles/childChart";
import { SANDBOX_CHILDREN, type SandboxChild } from "./cases";

/**
 * Spelling creative sandbox: every model gets the same ask for the same fictional child (her soul file,
 * her words, the words she missed, Sunny's real spelling menu) and answers with 3 activities through one
 * tool. One page shows the answers blind (A, B, C); children pick what they would play; Reveal shows which
 * model made each, its tokens and time, and the code checks. Nothing here touches a real child or Sunny's
 * running code; a winning model reaches Sunny only on the owner's green light.
 */
export type MenuGame = { id: string; label: string; modes: string[]; bestFor: string[] };
export type Activity = { title: string; story: string; game: string; mode: string; words: string[]; picture: string; why_her: string };
export type Check = { name: string; passed: boolean; detail: string };
export type Candidate = { model: string; activities: Activity[]; inputTokens: number; outputTokens: number; ms: number; error?: string; checks: Check[] };
export type Ask = { prompt: string; tool: Anthropic.Messages.Tool; hash: string };
export type SandboxRun = { runId: string; createdAt: string; pickers: string[]; cases: Array<{ child: SandboxChild; menu: MenuGame[]; ask: Ask; candidates: Candidate[] }> };

const TOOL = "propose_activities";
const REAL_CHILDREN = new Set(["ila", "reina"]);
// Reward and encounter nodes carry no words, so they are not spelling activities to propose.
const NOT_WORD_GAMES = new Set(["mystery", "quest", "boss"]);

/** Sunny's real spelling menu: the launchable cards the Teaching Planner is offered, read from the catalog. */
export function spellingMenu(child: SandboxChild): MenuGame[] {
  const text = ["Spelling", ...child.words].join("\n");
  const extraction = { sourceKind: "scanned_assignment_image", sourcePath: "/tmp/sandbox.png", filename: "sandbox.png", mediaType: "image/png", fileHash: "a".repeat(64), extractionMethod: "tesseract", pages: [{ pageNumber: 1, text }], fullText: text, warnings: [] } as AssignmentSourceExtraction;
  const chart = { childId: child.id, rootDir: process.cwd(), identity: { childId: child.id }, learningProfile: { childId: child.id }, homework: { recent: [] }, artifacts: { contentCatalog: [] }, activityResults: { recent: [] }, decisionTrace: [], learningHistory: { constructs: {} } } as unknown as ChildChart;
  return buildAssignmentPlanningPacket({ childId: child.id, extraction, childChart: chart }).activityCatalog
    .filter(card => card.launchable && !NOT_WORD_GAMES.has(card.activityId))
    .map(card => ({ id: card.activityId, label: card.label, modes: card.capabilityModes.map(mode => mode.id).filter(Boolean), bestFor: card.bestFor.slice(0, 3) }));
}

/** The one ask every model gets for this child. Its hash proves the comparison was fair. */
export function buildAsk(child: SandboxChild, menu: MenuGame[]): Ask {
  const prompt = `You are Sunny's tutor, designing spelling practice for one child. The goal: she wants to come back, and she knows her words by the school test.
About her (her own profile; empty means we know nothing yet):
${child.soul.trim() || "(no profile yet)"}
Her spelling words: ${child.words.join(", ")}
Words she missed on her first check: ${child.missedWords.join(", ")}
Games Sunny can run (use only these, with one of their modes when they list any):
${JSON.stringify(menu.map(game => ({ game: game.id, name: game.label, modes: game.modes, good_for: game.bestFor })))}
Propose exactly 3 activities for her with ${TOOL}. Use only her words. Write the story and title the way she would hear them.`;
  const tool: Anthropic.Messages.Tool = {
    name: TOOL,
    description: "Propose exactly 3 spelling activities for this child.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["activities"],
      properties: {
        activities: {
          type: "array", minItems: 3, maxItems: 3,
          items: {
            type: "object", additionalProperties: false,
            required: ["title", "story", "game", "mode", "words", "picture", "why_her"],
            properties: {
              title: { type: "string", description: "The name she sees, 2 to 5 words." },
              story: { type: "string", description: "One to three sentences that set up the activity for her." },
              game: { type: "string", enum: menu.map(game => game.id) },
              mode: { type: "string", description: "One of the game's modes, or empty when it lists none." },
              words: { type: "array", minItems: 1, items: { type: "string", enum: child.words } },
              picture: { type: "string", description: "What the stop's picture shows." },
              why_her: { type: "string", description: "Why this fits her, in one sentence." },
            },
          },
        },
      },
    },
  };
  return { prompt, tool, hash: crypto.createHash("sha256").update(JSON.stringify({ prompt, tool })).digest("hex") };
}

/** Facts code can check. They describe an answer; they never pick a winner. */
export function checkActivities(activities: Activity[], child: SandboxChild, menu: MenuGame[]): Check[] {
  const words = new Set(child.words);
  const foreign = activities.flatMap(row => row.words.filter(word => !words.has(word)));
  const unknown = activities.filter(row => { const game = menu.find(entry => entry.id === row.game); return !game || (game.modes.length > 0 ? !game.modes.includes(row.mode) : row.mode !== ""); });
  const covered = child.missedWords.filter(word => activities.some(row => row.words.includes(word)));
  const favorites = child.soul.split("## Favorite Things")[1]?.split("\n").filter(line => line.trim().startsWith("-"))
    .flatMap(line => line.toLowerCase().match(/[a-z]{5,}/g) ?? []) ?? [];
  const interested = activities.filter(row => favorites.some(word => `${row.title} ${row.story} ${row.picture}`.toLowerCase().includes(word.slice(0, 6))));
  return [
    { name: "3 activities", passed: activities.length === 3, detail: `${activities.length} proposed` },
    { name: "only her words", passed: foreign.length === 0, detail: foreign.length ? `not hers: ${[...new Set(foreign)].join(", ")}` : "every word is on her list" },
    { name: "real games", passed: unknown.length === 0, detail: unknown.length ? `not on the menu: ${unknown.map(row => `${row.game}:${row.mode}`).join(", ")}` : "every game and mode is on Sunny's menu" },
    { name: "different games", passed: new Set(activities.map(row => row.game)).size === activities.length, detail: `${new Set(activities.map(row => row.game)).size} different games` },
    { name: "missed words", passed: covered.length === child.missedWords.length, detail: `${covered.length} of ${child.missedWords.length} missed words practiced` },
    { name: "her interests (rough)", passed: favorites.length === 0 || interested.length > 0, detail: favorites.length ? `${interested.length} of ${activities.length} mention a favorite thing` : "no favorites in her profile" },
  ];
}

type Client = { messages: { create: (request: Anthropic.Messages.MessageCreateParamsNonStreaming) => Promise<Anthropic.Messages.Message> } };

/** One call per model and child, through Sunny's one rule for how each model is asked. */
export async function askModel(client: Client, model: string, ask: Ask, child: SandboxChild, menu: MenuGame[]): Promise<Candidate> {
  const started = Date.now();
  try {
    const message = await client.messages.create(requestForModel({ model, max_tokens: 4000, messages: [{ role: "user", content: ask.prompt }], tools: [ask.tool], tool_choice: { type: "tool", name: TOOL } }));
    const block = message.content.find(row => row.type === "tool_use" && row.name === TOOL) as { input?: { activities?: Activity[] } } | undefined;
    const base = { model, inputTokens: message.usage?.input_tokens ?? 0, outputTokens: message.usage?.output_tokens ?? 0, ms: Date.now() - started };
    if (!block?.input?.activities) {
      const text = message.content.flatMap(row => row.type === "text" ? [row.text] : []).join(" ").slice(0, 200);
      console.warn(` 🎮 [spelling-sandbox] [answer] [no-tool-call] model=${model} child=${child.id} stop=${message.stop_reason}`);
      return { ...base, activities: [], error: `no ${TOOL} call (stop=${message.stop_reason}) ${text}`, checks: [] };
    }
    const activities = block.input.activities;
    console.log(` 🎮 [spelling-sandbox] [answer] [received] model=${model} child=${child.id} activities=${activities.length} tokens=${base.inputTokens + base.outputTokens}`);
    return { ...base, activities, checks: checkActivities(activities, child, menu) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(` 🎮 [spelling-sandbox] [answer] [failed] model=${model} child=${child.id} reason=${reason}`);
    return { model, activities: [], inputTokens: 0, outputTokens: 0, ms: Date.now() - started, error: reason, checks: [] };
  }
}

/** A fixed shuffle per run and child, so A, B and C never line up with the order the models were asked in. */
export function blindOrder<T>(runId: string, caseId: string, items: T[]): T[] {
  const key = (index: number) => crypto.createHash("sha256").update(`${runId}:${caseId}:${index}`).digest("hex");
  return items.map((item, index) => ({ item, key: key(index) })).sort((a, b) => a.key.localeCompare(b.key)).map(row => row.item);
}

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

/** One page: blind cards with pick buttons per child; model names exist only in the reveal data. */
export function renderPage(run: SandboxRun): string {
  const reveal: Record<string, unknown> = {};
  const sections = run.cases.map(({ child, menu, ask, candidates }) => {
    const cards = blindOrder(run.runId, child.id, candidates).map((candidate, index) => {
      const label = String.fromCharCode(65 + index), id = `${child.id}:${label}`;
      reveal[id] = { model: candidate.model, tokens: candidate.inputTokens + candidate.outputTokens, seconds: Math.round(candidate.ms / 100) / 10, error: candidate.error ?? null, checks: candidate.checks };
      const games = new Map(menu.map(game => [game.id, game.label]));
      const body = candidate.error ? `<p class="error">This one did not answer.</p>`
        : candidate.activities.map(row => `<div class="activity"><h4>${escape(row.title)}</h4><p class="game">${escape(games.get(row.game) ?? row.game)}${row.mode ? ` · ${escape(row.mode.replace(/_/g, " "))}` : ""}</p><p>${escape(row.story)}</p><p class="small">Words: ${row.words.map(escape).join(", ")}</p><p class="small">Picture: ${escape(row.picture)}</p><p class="small">Why her: ${escape(row.why_her)}</p></div>`).join("");
      const picks = run.pickers.map(name => `<button class="pick" data-case="${escape(child.id)}" data-card="${escape(id)}" data-picker="${escape(name)}">${escape(name)} picks ${label}</button>`).join("");
      return `<article class="card" data-card="${escape(id)}"><h3>${label}</h3>${body}<div class="picks">${picks}</div><div class="reveal" hidden></div></article>`;
    }).join("");
    return `<section><h2>${escape(child.id)}</h2><details><summary>About her, her words, and the ask (same for every model)</summary><pre>${escape(ask.prompt)}</pre><p class="small">Ask fingerprint: ${ask.hash.slice(0, 12)}</p></details><div class="cards">${cards}</div></section>`;
  }).join("");
  const data = JSON.stringify({ runId: run.runId, reveal }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Spelling Sandbox</title>
<style>:root{--bg:#f7f7fb;--fg:#1f2937;--muted:#6b7280;--card:#fff;--line:#e5e7eb;--accent:#7c3aed;--good:#15803d;--bad:#b91c1c}@media (prefers-color-scheme:dark){:root{--bg:#111827;--fg:#f3f4f6;--muted:#9ca3af;--card:#1f2937;--line:#374151;--accent:#a78bfa;--good:#4ade80;--bad:#f87171}}
body{background:var(--bg);color:var(--fg);font:16px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1300px;padding:16px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.card{background:var(--card);border:2px solid var(--line);border-radius:14px;padding:14px}.card.picked{border-color:var(--accent)}.activity{border-top:1px solid var(--line);padding-top:8px;margin-top:8px}h3{margin:0;font-size:28px}h4{margin:4px 0}.game{color:var(--accent);font-weight:600;margin:0}.small{color:var(--muted);font-size:14px;margin:4px 0}.picks{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}button{font:inherit;border-radius:999px;border:1px solid var(--line);background:var(--bg);color:var(--fg);padding:6px 12px;cursor:pointer}button.on{background:var(--accent);color:#fff;border-color:var(--accent)}.bar{position:sticky;top:0;background:var(--bg);padding:8px 0;display:flex;gap:8px;flex-wrap:wrap;z-index:1}.reveal{margin-top:10px;font-size:14px}.ok{color:var(--good)}.no,.error{color:var(--bad)}pre{white-space:pre-wrap;font-size:13px}</style></head>
<body><h1>Spelling Sandbox</h1><p class="small">Run ${escape(run.runId)}. Each card is one model's 3 activities for the same pretend child. Pick the one you would play; Reveal shows which model made each.</p>
<div class="bar"><button id="reveal">Reveal</button><button id="download">Download picks</button><button id="clear">Clear picks</button></div>${sections}
<script type="application/json" id="data">${data}</script>
<script>const data=JSON.parse(document.getElementById('data').textContent);const key='spelling-sandbox-picks:'+data.runId;
const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}};const write=v=>{try{localStorage.setItem(key,JSON.stringify(v))}catch{}};
let picks=read();const paint=()=>{document.querySelectorAll('.pick').forEach(b=>b.classList.toggle('on',picks[b.dataset.case+'|'+b.dataset.picker]===b.dataset.card));document.querySelectorAll('.card').forEach(c=>c.classList.toggle('picked',Object.values(picks).includes(c.dataset.card)))};
document.querySelectorAll('.pick').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.case+'|'+b.dataset.picker;picks[k]=picks[k]===b.dataset.card?undefined:b.dataset.card;write(picks);paint()}));
document.getElementById('clear').addEventListener('click',()=>{picks={};write(picks);paint()});
document.getElementById('download').addEventListener('click',()=>{const rows=Object.entries(picks).filter(([,v])=>v).map(([k,card])=>{const [child,picker]=k.split('|');return {child,picker,card,model:document.body.dataset.revealed?data.reveal[card].model:'(hidden until Reveal)'}});const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({runId:data.runId,picks:rows},null,2)],{type:'application/json'}));a.download='picks-'+data.runId+'.json';a.click()});
document.getElementById('reveal').addEventListener('click',()=>{document.body.dataset.revealed='1';document.querySelectorAll('.card').forEach(c=>{const r=data.reveal[c.dataset.card],el=c.querySelector('.reveal');el.hidden=false;el.innerHTML='<b></b><br><span></span>'+(r.checks||[]).map(x=>'<div class="'+(x.passed?'ok':'no')+'"></div>').join('');el.querySelector('b').textContent=r.model;el.querySelector('span').textContent=r.tokens+' tokens · '+r.seconds+' s'+(r.error?' · '+r.error:'');el.querySelectorAll('div').forEach((d,i)=>{const x=r.checks[i];d.textContent=(x.passed?'✓ ':'✗ ')+x.name+': '+x.detail})})});
paint();</script></body></html>`;
}

/** Fake answers for a $0 run: proves the page and the checks without calling any model. */
export function dryClient(seed: string): Client {
  return { messages: { create: async request => {
    const tool = request.tools?.[0] as Anthropic.Messages.Tool;
    const schema = (tool.input_schema.properties as any).activities.items.properties;
    const games: string[] = schema.game.enum, words: string[] = schema.words.items.enum;
    // The seed varies the answers but never appears in them: a model's name in a card would unblind it.
    const shift = parseInt(crypto.createHash("sha256").update(seed).digest("hex").slice(0, 2), 16);
    const activities = [0, 1, 2].map(index => ({ title: `Practice idea ${index + 1}`, story: "A practice round.", game: games[(index + shift) % games.length], mode: "", words: words.slice(index, index + 3), picture: "A simple picture.", why_her: "Dry run." }));
    return { id: "dry", type: "message", role: "assistant", model: request.model, stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 }, content: [{ type: "tool_use", id: "dry", name: TOOL, input: { activities } }] } as unknown as Anthropic.Messages.Message;
  } } };
}

export async function runSandbox(input: { models: string[]; caseIds?: string[]; pickers?: string[]; dry?: boolean; maxTokens?: number; outputRoot?: string; client?: Client }): Promise<{ run: SandboxRun; file: string }> {
  const children = SANDBOX_CHILDREN.filter(child => !input.caseIds?.length || input.caseIds.includes(child.id));
  for (const child of children) if (REAL_CHILDREN.has(child.id)) throw new Error(`sandbox_real_child_refused:${child.id}`);
  const cap = input.maxTokens ?? 100_000;
  const runId = new Date().toISOString().replace(/[:.]/g, "-") + (input.dry ? "-dry" : "");
  const run: SandboxRun = { runId, createdAt: new Date().toISOString(), pickers: input.pickers ?? ["Ila", "Reina", "Saori"], cases: [] };
  let tokens = 0;
  for (const child of children) {
    const menu = spellingMenu(child), ask = buildAsk(child, menu), candidates: Candidate[] = [];
    for (const model of input.models) {
      if (tokens >= cap) { candidates.push({ model, activities: [], inputTokens: 0, outputTokens: 0, ms: 0, error: `token cap ${cap} reached; not asked`, checks: [] }); continue; }
      const client = input.client ?? (input.dry ? dryClient(model) : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 }));
      const candidate = await askModel(client, model, ask, child, menu);
      tokens += candidate.inputTokens + candidate.outputTokens;
      candidates.push(candidate);
    }
    run.cases.push({ child, menu, ask, candidates });
  }
  const directory = path.join(input.outputRoot ?? path.join(process.cwd(), "outputs/spelling-creative-sandbox"), runId);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "run.json"), JSON.stringify(run, null, 2));
  const file = path.join(directory, "index.html");
  fs.writeFileSync(file, renderPage(run));
  console.log(` 🎮 [spelling-sandbox] [page] [written] file=${file} cases=${run.cases.length} models=${input.models.length} tokens=${tokens}`);
  return { run, file };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
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
