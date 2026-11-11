// Renders a cook-off entry's ordered assets (<script id="sunny-assets">) with ElevenLabs, in the child's companion voice.
//   node assets.mjs <entryDir> <child>
import fs from "node:fs"; import path from "node:path";
const VOICE = { ila: "PeNaJO83cBW3Cf3YGzjZ", reina: "XrExE9yKIg1WjnnlVkGX" };   // Elli, Matilda (src/prompts/companions/*/companion.json)
const log = (...a) => console.log(" 🎮 [cookoff-assets]", ...a);
export async function renderAssets(dir, child) {
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const m = html.match(/<script[^>]*id=["']sunny-assets["'][^>]*>([\s\S]*?)<\/script>/);
  if (!m) { log("[manifest] [missing]", dir); return { voice: 0, sfx: 0, errors: ["no sunny-assets block"] }; }
  let man; try { man = JSON.parse(m[1]); } catch (e) { return { voice: 0, sfx: 0, errors: ["sunny-assets is not valid JSON: " + e.message] }; }
  const key = process.env.ELEVENLABS_API_KEY?.trim(); const errors = []; let voice = 0, sfx = 0;
  const voices = (man.voice ?? []).slice(0, 40), sounds = (man.sfx ?? []).slice(0, 10);
  fs.mkdirSync(path.join(dir, "assets/voice"), { recursive: true }); fs.mkdirSync(path.join(dir, "assets/sfx"), { recursive: true });
  const jobs = [
    ...voices.map(v => async () => { const out = path.join(dir, "assets/voice", `${v.id}.mp3`); if (fs.existsSync(out)) return voice++;
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE[child]}`, { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text: String(v.text).slice(0, 200), model_id: "eleven_multilingual_v2", voice_settings: { stability: .5, similarity_boost: .75 } }) });
      if (!r.ok) throw new Error(`voice ${v.id} ${r.status} ${(await r.text()).slice(0, 120)}`); fs.writeFileSync(out, Buffer.from(await r.arrayBuffer())); voice++; }),
    ...sounds.map(s => async () => { const out = path.join(dir, "assets/sfx", `${s.id}.mp3`); if (fs.existsSync(out)) return sfx++;
      const r = await fetch("https://api.elevenlabs.io/v1/sound-generation", { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ text: String(s.prompt).slice(0, 400), duration_seconds: Math.min(22, Math.max(.5, +s.seconds || 2)), prompt_influence: .5, ...(s.loop ? { loop: true } : {}) }) });
      if (!r.ok) throw new Error(`sfx ${s.id} ${r.status} ${(await r.text()).slice(0, 120)}`); fs.writeFileSync(out, Buffer.from(await r.arrayBuffer())); sfx++; }),
  ];
  for (let i = 0; i < jobs.length; i += 4) (await Promise.allSettled(jobs.slice(i, i + 4).map(j => j()))).forEach(x => x.status === "rejected" && errors.push(x.reason.message));
  log("[rendered]", path.basename(dir), `voice=${voice}/${voices.length} sfx=${sfx}/${sounds.length} errors=${errors.length}`); errors.forEach(e => log("[error]", e));
  return { voice, sfx, errors };
}
if (import.meta.url === `file://${process.argv[1]}`) renderAssets(process.argv[2], process.argv[3]).catch(e => { console.error(" 🎮 [cookoff-assets] [failed]", e); process.exit(1); });
