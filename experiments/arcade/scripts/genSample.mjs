// Sample assets for the arcade prototype: 2 painted backgrounds (Grok), 3 sound effects + 1 voice line (ElevenLabs).
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(" 🎮 [arcade-sample]", ...a);

async function grok(name, prompt) {
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROK_API_KEY.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.GROK_IMAGE_MODEL?.trim() || "grok-imagine-image", prompt, n: 1, response_format: "b64_json" }),
  });
  if (!res.ok) throw new Error(`grok ${name} ${res.status} ${await res.text()}`);
  const j = await res.json();
  const d = j.data?.[0];
  const buf = d?.b64_json ? Buffer.from(d.b64_json, "base64") : Buffer.from(await (await fetch(d.url)).arrayBuffer());
  fs.writeFileSync(path.join(OUT, name), buf);
  log("[image] [saved]", name, buf.length);
}

async function sfx(name, text, seconds) {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY.trim(), "Content-Type": "application/json" },
    body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: 0.6 }),
  });
  if (!res.ok) throw new Error(`sfx ${name} ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(OUT, name), buf);
  log("[sfx] [saved]", name, buf.length);
}

async function voice(name, text, voiceId) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY.trim(), "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!res.ok) throw new Error(`voice ${name} ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(OUT, name), buf);
  log("[voice] [saved]", name, buf.length);
}

const jobs = [
  grok("bg-reina.jpg", "Wide side-scrolling video game background, no characters, no text. A bright, epic kids' wrestling championship arena: blue wrestling mats in the foreground, glowing spotlights, cheering crowd as soft colorful silhouettes in the stands, red and gold championship banners, confetti in the air. Polished modern indie game art, painterly, vibrant saturated colors, depth and atmospheric light, cinematic 16:9."),
  grok("bg-ila.jpg", "Wide side-scrolling video game background, no characters, no text. A magical night forest full of glowing paper lanterns hanging from twisted trees, friendly spirit lights floating, a big moon, a sleepy volcano softly smoking far in the distance, mossy stones and fireflies. Polished modern indie game art, painterly, cozy and a little spooky-cute, rich purples teals and warm lantern gold, depth and atmospheric light, cinematic 16:9."),
  sfx("jump.mp3", "Bouncy cartoon jump, springy whoosh, video game, short and clean", 0.6),
  sfx("correct.mp3", "Magical crystal shatter into sparkles with a bright rising success chime, arcade game reward, satisfying", 1.5),
  sfx("boss-roar.mp3", "Big friendly cartoon boss monster roar with heavy stomp and arena crowd gasp, video game boss appears", 2.5),
  voice("ila-dormant.mp3", "Dormant. The sleepy volcano is dormant.", process.env.ELEVENLABS_VOICE_ID_ILA.trim()),
];
const results = await Promise.allSettled(jobs);
results.forEach((r, i) => { if (r.status === "rejected") console.error(" 🎮 [arcade-sample] [failed]", i, r.reason?.message ?? r.reason); });
log("[done]", results.filter((r) => r.status === "fulfilled").length, "of", results.length);
