import fs from "node:fs";
const OUT = process.argv[2];
async function sfx(name, text, seconds, loop) {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", { method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY.trim(), "Content-Type": "application/json" },
    body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: 0.5, ...(loop ? { loop: true } : {}) }) });
  if (!res.ok) throw new Error(`${name} ${res.status} ${await res.text()}`);
  fs.writeFileSync(`${OUT}/${name}`, Buffer.from(await res.arrayBuffer())); console.log(" 🎮 [arena-audio] [saved]", name);
}
const r = await Promise.allSettled([
  sfx("crowd-cheer.mp3", "Big indoor sports arena crowd erupting in cheers and applause, kids and families, excited roar", 4),
  sfx("crowd-loop.mp3", "Indoor sports arena crowd ambience, steady murmur and light cheering, seamless loop", 12, true),
  sfx("music-loop.mp3", "Upbeat energetic sports game background music loop, punchy drums, funky bass, bright synth stabs, hype but friendly for kids", 20, true),
  sfx("takedown.mp3", "Heavy body slam onto a wrestling mat, thud with a cartoon whoosh and impact boom", 1.2),
]);
r.forEach((x, i) => x.status === "rejected" && console.error(" 🎮 [arena-audio] [failed]", i, x.reason.message));
