import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spellingVoice } from "../../src/chart/spelling/voice";

/**
 * Serves one sandbox run's play page on this Mac and speaks the games' lines in Elli's voice (Sunny's own
 * ElevenLabs voice). Every line is saved in the run folder, so it is paid for once. A cap on new lines per
 * server start bounds the spend; past it, or without a key, the page falls back to the browser voice.
 * Usage: npx tsx experiments/spelling-creative-sandbox/serve.ts --run=outputs/spelling-creative-sandbox/<run> [--port=8930] [--max-new-lines=300]
 */
const arg = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const runDir = path.resolve(arg("run") ?? "");
const port = Number(arg("port") ?? 8930);
const maxNewLines = Number(arg("max-new-lines") ?? 300);
if (!fs.existsSync(path.join(runDir, "index.html"))) throw new Error(`sandbox_run_missing:${runDir}`);
const voiceDir = path.join(runDir, "voice");
fs.mkdirSync(voiceDir, { recursive: true });
let newLines = 0;

async function speak(text: string): Promise<Buffer> {
  const file = path.join(voiceDir, `${crypto.createHash("sha256").update(`${spellingVoice.key}:${text}`).digest("hex").slice(0, 24)}.mp3`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  if (newLines >= maxNewLines) throw new Error(`sandbox_voice_cap_reached:${maxNewLines}`);
  newLines += 1;
  const audio = await spellingVoice.speak(text);
  fs.writeFileSync(file, audio);
  console.log(` 🎮 [spelling-sandbox] [voice] [new-line] ${newLines}/${maxNewLines} chars=${text.length}`);
  return audio;
}

const server = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/speak") {
    let body = "";
    request.on("data", chunk => { body += chunk; if (body.length > 4000) request.destroy(); });
    request.on("end", () => {
      let text = "";
      try { text = String(JSON.parse(body).text ?? "").trim().slice(0, 300); } catch { /* answered below */ }
      if (!text) { response.writeHead(400).end("no text"); return; }
      speak(text).then(audio => { response.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" }).end(audio); })
        .catch(error => { console.warn(` 🎮 [spelling-sandbox] [voice] [unavailable] reason=${error instanceof Error ? error.message : error}`); response.writeHead(503).end("voice unavailable"); });
    });
    return;
  }
  if (request.method === "GET" && (request.url === "/" || request.url === "/index.html")) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(fs.readFileSync(path.join(runDir, "index.html")));
    return;
  }
  response.writeHead(404).end("not found");
});
// Only this Mac can reach it.
server.listen(port, "127.0.0.1", () => console.log(` 🎮 [spelling-sandbox] [server] [listening] url=http://127.0.0.1:${port}/ voice=${process.env.ELEVENLABS_API_KEY ? "elli" : "browser (no ELEVENLABS_API_KEY)"} max_new_lines=${maxNewLines}`));
