/** Explicit paid synthetic probe; never opens a child chart or records learning evidence.
 * DOTENV_CONFIG_PATH=/path/to/.env npx tsx -r dotenv/config scripts/measureCompanionSpeech.ts --live /output/dir
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import WebSocket from "ws";
import { WsTtsBridge } from "../src/server/ws-tts-bridge";
import { runAgent } from "../src/agents/elli/run";
import { buildSessionPrompt } from "../src/agents/prompts";
import { createSpeechTools } from "../src/server/companionSpeechTools";
import { createReplayWordTools } from "../src/server/companionReplayTool";
import { buildCurrentBoardSnapshot, buildCurrentBoardSnapshotContext } from "../src/server/currentBoardSnapshot";

async function main() {
  if (process.argv[2] !== "--live" || !process.argv[3]) throw new Error("Explicit --live and output directory required (paid calls)");
  const out = path.resolve(process.argv[3]); fs.mkdirSync(out, { recursive: true });
  const sourceHash = createHash("sha256").update(fs.readFileSync("src/server/ws-tts-bridge.ts")).digest("hex");
  const phrase = "Dissatisfied. Listen to the sounds, then put them together. Dissatisfied.";
  const audio: unknown[] = [];
  // Same text, voice and provider path; rate is the only deliberate variation.
  for (const speed of (process.argv.includes("--conversation-only") ? [] : [1, 0.7])) {
    const chunks: Buffer[] = []; let firstAudioMs: number | undefined;
    const start = performance.now();
    const browser = { readyState: WebSocket.OPEN, send: (raw: string) => {
      const packet = JSON.parse(raw);
      if (packet.type === "audio") { firstAudioMs ??= performance.now() - start; chunks.push(Buffer.from(packet.data, "base64")); }
    } } as unknown as WebSocket;
    const bridge = new WsTtsBridge(browser, process.env.ELEVENLABS_VOICE_ID_ILA ?? "MF3mGyEYCl7XYWbV9V6O", 30_000);
    try {
      await bridge.connect(); // already open when the AI would choose its rate
      (bridge as any).elevenWs?.on("message", (raw: Buffer) => {
        const packet = JSON.parse(raw.toString());
        if (packet.error) fs.writeFileSync(path.join(out, "provider-error.json"), JSON.stringify({ speed, error: packet.error, message: packet.message }, null, 2));
      });
      await bridge.setSpeechRate(speed); bridge.sendText(phrase); await bridge.finish();
      const pcm = Buffer.concat(chunks); if (!pcm.length) throw new Error("No audio received");
      const wav = Buffer.alloc(44); wav.write("RIFF", 0); wav.writeUInt32LE(pcm.length + 36, 4);
      wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
      wav.write("data", 36); wav.writeUInt32LE(pcm.length, 40);
      fs.writeFileSync(path.join(out, `speech-${speed}.wav`), Buffer.concat([wav, pcm]));
      audio.push({ speed, durationMs: pcm.length / 48, firstAudioMs, totalMs: performance.now() - start, bytes: pcm.length, sha256: createHash("sha256").update(pcm).digest("hex") });
    } finally { bridge.close(); }
  }
  if (audio.length) fs.writeFileSync(path.join(out, "audio-measurements.json"), JSON.stringify({ synthetic: true, sourceHash, model: "eleven_flash_v2_5", phrase, audio, humanUsefulness: "not tested" }, null, 2));
  process.env.ADVENTURE_MAP = "true";
  if (fs.existsSync("src/context/practice/companion_context.md")) throw new Error("Synthetic profile path already exists; choose an isolated probe profile");
  const prompt = await buildSessionPrompt("Practice" as never, path.resolve("src/companions/elli.md"), "Synthetic spelling assignment", [], "homework", {carePlan:null});
  const conversations: unknown[] = [];
  for (const teaching of [true, false]) {
    const snapshot = buildCurrentBoardSnapshot({ childId: "synthetic-lab", sessionId: "capable-speech-probe", canonicalPractice: teaching,
      assessment: { itemId: "word-1", word: "myself" },
      state: { game: "word-radar", nodeId: "practice", itemId: "word-1", phase: "response", practiceCapture: teaching, assessmentMode: !teaching, answerVisibility: "hidden", launchToken: "synthetic" } });
    const actions: unknown[] = [];
    let configuredRate = 1;
    const speechHost = { getSpeechRate: () => configuredRate, setSpeechRate: (speed: number) => { configuredRate = speed; return { speed }; } };
    const tools = {
      ...createReplayWordTools({ snapshot: () => snapshot, playbackBusy: () => false, assessmentItemId: () => teaching ? undefined : "word-1", requestNarration: () => { actions.push({ tool: "replayWord", requested: true, playbackConfirmed: false }); } }) };
    const turns: unknown[] = []; const history: any[] = [];
    for (const user of ["Can you say it slower and help me sound it out?", "That did not help me. Can you break it into syllables?"]) {
      const start = performance.now();
      const response = await runAgent({ history, userMessage: user, injectedContextMessages: [{ role: "user", content: buildCurrentBoardSnapshotContext(snapshot) }],
        profile: { name: "Elli", voiceId: "synthetic", systemPrompt: prompt }, tools: { ...tools, ...createSpeechTools(speechHost, receipt => actions.push({ tool: "setSpeechRate", ...receipt })) }, onToken: () => {}, quiet: true, signal: AbortSignal.timeout(60_000) });
      turns.push({ user, response, elapsedMs: performance.now() - start });
      history.push({ role: "user", content: user }, { role: "assistant", content: response || "[Activity playback requested]" });
    }
    conversations.push({ mode: teaching ? "canonical_hidden_practice" : "independent_check", context: buildCurrentBoardSnapshotContext(snapshot), turns, actions });
    fs.writeFileSync(path.join(out, "conversation-probe.json"), JSON.stringify({ synthetic: true, model: process.env.SUNNY_VOICE_MODEL ?? "claude-sonnet-5", promptSha256: createHash("sha256").update(prompt).digest("hex"), conversations, limitations: "Isolated production runner and fully assembled synthetic adventure prompt; tools instrumented, not audible conversation or full SessionManager. Human usefulness unverified." }, null, 2));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
