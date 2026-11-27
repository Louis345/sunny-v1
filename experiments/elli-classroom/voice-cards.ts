/**
 * Give an existing lesson's word cards Elli's voice (lessons made before the Classroom read word cards aloud).
 *   DOTENV_CONFIG_PATH=~/Development/sunny/.env npx tsx experiments/elli-classroom/voice-cards.ts out/<lesson>/v2/lesson.json ...
 */
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const log = (action: string, result: string) => console.log(` 🎮 [voice-cards] [${action}] [${result}]`);
function words(steps: unknown[][]): string[] {
  return steps.flatMap(([name, ...args]) => {
    const own = name === "ask" && Array.isArray(args[1]) ? (args[1] as unknown[]).map(String).filter(c => !/^[0-9]+$/.test(c)) : [];
    const branch = (name === "ask" ? args[3] : name === "askNumber" ? args[2] : undefined) as Record<string, unknown[][]> | undefined;
    return [...own, ...["right", "wrong"].flatMap(k => Array.isArray(branch?.[k]) ? words(branch![k]) : [])];
  });
}
async function main(): Promise<void> {
for (const rel of process.argv.slice(2)) {
  const file = path.resolve(DIR, rel), lesson = JSON.parse(fs.readFileSync(file, "utf8"));
  const voiceDir = path.join(path.dirname(file), "..", "voice"); fs.mkdirSync(voiceDir, { recursive: true });
  let added = 0;
  for (const text of [...new Set(words(lesson.steps))]) {
    if (lesson.voice[text]) continue;
    const name = `${crypto.createHash("sha1").update(text).digest("hex").slice(0, 12)}.mp3`, out = path.join(voiceDir, name);
    if (!fs.existsSync(out)) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID_ILA}?output_format=mp3_44100_128`, { method: "POST",
        headers: { "xi-api-key": String(process.env.ELEVENLABS_API_KEY), "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }) });
      if (!res.ok) { log("voice", `failed status=${res.status} text=${JSON.stringify(text)}`); continue; }
      fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    }
    lesson.voice[text] = `../voice/${name}`; added += 1;
  }
  fs.writeFileSync(file, JSON.stringify(lesson, null, 2));
  log("done", `${rel} added=${added}`);
}
}
main().catch(error => { console.error(" 🎮 [voice-cards] [run] [failed]", error); process.exitCode = 1; });
