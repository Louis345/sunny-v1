// "Hey Elli" trial server (owner request 11/11): serves the cook-off arcade and lets the child talk to the companion inside a 3D game.
//   node experiments/arcade/cookoff/talk-server.mjs            → http://localhost:6140/
// Ears: browser mic → /listen (WebSocket) → Deepgram live (same vendor as Sunny's voice loop). The key never reaches the browser.
// Brain: POST /talk → Claude (Sonnet 5.5) with the companion's own personality.md and the game's live state.
// Voice: ElevenLabs in the companion's real voice (companion.json), returned as mp3 so the game lip-syncs it.
// Experiment only. Not the production path; the PR integration comes after the owner reviews this.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { WebSocketServer, WebSocket } from "ws";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const PORT = +(process.env.TALK_PORT ?? 6140);
const MODEL = process.env.TALK_MODEL ?? "claude-sonnet-5-5";
const log = (...a) => console.log(" 🎮 [companion-talk]", ...a);

// keys: environment first, then the main checkout's .env (never logged, never sent to the browser)
function loadEnv(file) { try { for (const line of fs.readFileSync(file, "utf8").split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "").trim(); } } catch (e) { log("[env] [not-read]", file, e.code); } }
loadEnv(path.join(REPO, ".env")); loadEnv(path.resolve(REPO, "../sunny/.env"));
for (const k of ["ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY", "DEEPGRAM_API_KEY"]) if (!process.env[k]) { console.error(` 🎮 [companion-talk] [env] [missing] ${k}`); process.exit(1); }
const anthropic = new Anthropic();

// the companion is whoever the game says the child is with; persona and voice come from the repo, not from this file
function companion(id) {
  const dir = path.join(REPO, "src/prompts/companions", id);
  const json = JSON.parse(fs.readFileSync(path.join(dir, "companion.json"), "utf8"));
  let personality = ""; try { personality = fs.readFileSync(path.join(dir, "personality.md"), "utf8"); } catch (e) { log("[persona] [missing]", id, e.code); }
  return { ...json, personality };
}

function systemPrompt(c, child) {
  return [
    `You are ${c.name}, ${child}'s companion in Sunny, a home tutor her dad built for her. You are inside a 3D game with her right now, as a character on screen. She just spoke to you out loud.`,
    c.personality ? `Who you are:\n${c.personality}` : "",
    "How to answer:",
    "- Talk like a friend sitting next to her, out loud. One or two short sentences, under 30 words. Simple words. No lists, no emoji, no stage directions.",
    "- You can see the game state below. Use it: answer about what is actually on screen.",
    "- If she asks for the answer, never give the whole answer. Give the next smallest nudge: a sound, a chunk, a picture clue, one letter. If she has already had several nudges, give a bigger one.",
    "- If she is frustrated, be warm and calm first, then one small step.",
    "- If she asks something off-topic, answer briefly and kindly, then invite her back to the game.",
    "- If she says something worrying about safety or feeling unsafe, gently tell her to tell her dad right now.",
  ].filter(Boolean).join("\n");
}

async function think(body) {
  const c = companion(body.companion);
  const history = (body.history ?? []).slice(-6).flatMap(t => [{ role: "user", content: t.child }, { role: "assistant", content: t.reply }]);
  const msg = await anthropic.messages.create({
    model: MODEL, max_tokens: 400, thinking: { type: "between_tools" }, system: systemPrompt(c, body.childName ?? body.child),
    messages: [...history, { role: "user", content: `Game state right now:\n${JSON.stringify(body.context ?? {}, null, 1)}\n\n${body.childName ?? "She"} said: "${String(body.text ?? "").slice(0, 400)}"` }],
  });
  const reply = msg.content.filter(b => b.type === "text").map(b => b.text).join(" ").trim();
  return { c, reply, usage: msg.usage };
}

async function voice(c, text) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${c.voiceId}?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: process.env.TALK_TTS_MODEL ?? "eleven_turbo_v2_5", voice_settings: { stability: .5, similarity_boost: .75 } }),
  });
  if (!r.ok) throw new Error(`elevenlabs ${r.status} ${(await r.text()).slice(0, 160)}`);
  return Buffer.from(await r.arrayBuffer());
}

// static files: the arcade, the shared 3D assets, the evidence contract and the talk client
const ROOTS = [["/a3d/", path.join(REPO, "experiments/arcade/a3d")], ["/games/", path.join(REPO, "web/public/games")], ["/talk/", HERE], ["/", path.join(HERE, "arcade")]];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".png": "image/png", ".vrm": "application/octet-stream", ".fbx": "application/octet-stream" };
function serveStatic(req, res) {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  for (const [prefix, dir] of ROOTS) {
    if (!url.startsWith(prefix)) continue;
    if (prefix === "/talk/" && !/^\/talk\/talk-client\.js$/.test(url)) break;   // only the client file is public from this folder
    let file = path.join(dir, url.slice(prefix.length)); if (!file.startsWith(dir)) break;
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html"); } catch { continue; }
    if (!fs.existsSync(file)) continue;
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(file).pipe(res); return;
  }
  res.writeHead(404); res.end("not found");
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/talk") {
    const t0 = Date.now(); let body;
    try { body = JSON.parse(await new Promise((ok, no) => { let s = ""; req.on("data", d => { s += d; if (s.length > 64e3) no(new Error("too big")); }); req.on("end", () => ok(s)); req.on("error", no); })); }
    catch (e) { log("[talk] [bad-request]", e.message); res.writeHead(400); res.end(); return; }
    try {
      const { c, reply, usage } = await think(body); const t1 = Date.now();
      const mp3 = await voice(c, reply); const t2 = Date.now();
      log(`[talk] [answered] ${body.child}/${c.name} heard="${String(body.text).slice(0, 80)}" reply="${reply}" think=${t1 - t0}ms voice=${t2 - t1}ms tokens=${usage.input_tokens}/${usage.output_tokens}`);
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ reply, audio: mp3.toString("base64"), ms: { think: t1 - t0, voice: t2 - t1 } }));
    } catch (e) { log("[talk] [failed]", e.message); res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  serveStatic(req, res);
});

// ears: one Deepgram live stream per open game; the browser sends webm/opus chunks, we forward transcripts back
const wss = new WebSocketServer({ server, path: "/listen" });
wss.on("connection", (browser, req) => {
  const words = new URL(req.url, "http://x").searchParams.getAll("keyterm").slice(0, 10);
  const q = new URLSearchParams({ model: "nova-3", language: "en-US", smart_format: "true", interim_results: "true", endpointing: "400", utterance_end_ms: "1200", vad_events: "true" });
  words.forEach(w => q.append("keyterm", w));
  const dg = new WebSocket(`wss://api.deepgram.com/v1/listen?${q}`, { headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` } });
  const pending = []; let closed = false;
  const keep = setInterval(() => { if (dg.readyState === WebSocket.OPEN) dg.send(JSON.stringify({ type: "KeepAlive" })); }, 8000);
  dg.on("open", () => { log("[listen] [open]", words.join(",")); while (pending.length) dg.send(pending.shift()); });
  dg.on("message", m => { if (browser.readyState === WebSocket.OPEN) browser.send(m.toString()); });
  dg.on("error", e => log("[listen] [deepgram-error]", e.message));
  dg.on("close", (code) => { if (!closed) log("[listen] [deepgram-closed]", code); clearInterval(keep); if (browser.readyState === WebSocket.OPEN) browser.close(); });
  browser.on("message", data => { if (dg.readyState === WebSocket.OPEN) dg.send(data); else if (pending.length < 40) pending.push(data); });
  browser.on("close", () => { closed = true; clearInterval(keep); try { dg.send(JSON.stringify({ type: "CloseStream" })); dg.close(); } catch (e) { log("[listen] [close-failed]", e.message); } log("[listen] [closed]"); });
});

server.listen(PORT, () => log("[server] [up]", `http://localhost:${PORT}/  model=${MODEL}`));
