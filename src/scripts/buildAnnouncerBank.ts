/**
 * Write and record a child's announcer line bank for the week.
 *
 *   npx tsx src/scripts/buildAnnouncerBank.ts --child ila --words carnival,dormant,pardon,charge --missed pardon
 *   npx tsx src/scripts/buildAnnouncerBank.ts --child reina --dry      (write lines, record nothing)
 *
 * Claude writes the lines from the parts of soul.md about who she is and what she loves (never the
 * clinical sections); code checks every line (checkAnnouncerLine) and drops the ones that fail;
 * ElevenLabs records the rest once. Japanese lines are written in Japanese script, recorded with the
 * Japanese language code, and kept only if a Japanese speech recognizer hears Japanese back.
 * Output goes to web/public/generated/announcer/<child>/ (git-ignored: her name and voice clips stay
 * off the public repo). The game then plays clips with no model call and no wait.
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CREATURE_CATALOG } from "../shared/capturedMonsterCatalog";
import { checkAnnouncerLine, type AnnouncerBank, type AnnouncerClip, type AnnouncerEvent } from "../shared/announcer";

interface ChildSetup {
  /** How to say her name (spelled for the voice, not for the screen). */
  sayName: string;
  world: string;
  announcerVoice: string;
  /** The companion's voice, for the target words themselves. */
  companionVoiceEnv?: string;
  sibling: string;
}

const CHILDREN: Record<string, ChildSetup> = {
  ila: {
    sayName: "Eye-lah",
    world: "a warm yokai festival night: lanterns, a torii gate, fireflies, friendly spirits. Narrator, not a shouting host: playful, cozy, proud.",
    announcerVoice: "cgSgspJ2msm6clMCkdW9",
    companionVoiceEnv: "ELEVENLABS_VOICE_ID_ILA",
    sibling: "Reina",
  },
  reina: {
    sayName: "Ray-nah",
    world: "a wrestling championship under arena lights: ring announcer energy, takedowns, pins, belts, personal records.",
    announcerVoice: "nPczCjzI2devNBz1zQrb",
    companionVoiceEnv: "ELEVENLABS_VOICE_ID_REINA",
    sibling: "Ila",
  },
};

const LINE_COUNTS: Array<[AnnouncerEvent, number, string]> = [
  ["intro", 3, "a creature appears and the practice starts (the creature's name is said right after your line)"],
  ["right", 6, "a right answer (short)"],
  ["perfect", 6, "a right answer landed exactly on the music's beat: the biggest hype"],
  ["miss", 5, "she missed one. Warm, forward-looking, never says wrong/missed/oops/no. Example: 'Next one is yours!'"],
  ["catch", 4, "the creature is caught (its name is said right after your line)"],
  ["breakFree", 4, "the creature broke free of the orb; playful, not sad, 'it'll be back' energy"],
  ["hatch", 4, "her egg hatches into her own pet (its name is said right after your line)"],
  ["eggIntro", 3, "the next-day egg check starts: only what she remembers on her own cracks it"],
  ["eggCrack", 4, "she proved a word on a later day and the egg cracks"],
  ["eggNotYet", 4, "not proven yet; the egg is safe, we'll practice that one more. Never sad."],
];

const PRIVATE_LINE = /adhd|dyslex|diagnos|delay|percentile|iep|therap|disorder|disabilit|score|evaluat|wiat|celf|gfta|standard|school psych|pediatric/i;
const KEEP_SECTION = /who she is|what works|what doesn.t work|her life|favorite|her brain/i;

/** Only the parts of soul.md about who she is and what lands with her; clinical lines are cut. */
function softSoul(childId: string): string {
  const path = resolve(process.cwd(), "src/context", childId, "soul.md");
  const text = readFileSync(path, "utf8");
  const sections = text.split(/^## /m).slice(1);
  return sections
    .filter((section) => KEEP_SECTION.test(section.split("\n")[0]))
    .map((section) =>
      `## ${section}`
        .split("\n")
        .filter((line) => !PRIVATE_LINE.test(line) && !/^\|/.test(line) && !/^###/.test(line))
        .join("\n"),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isoWeek(date = new Date()): string {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

interface WrittenLines {
  lines: Array<{ event: AnnouncerEvent; text: string; lang: "en" | "ja" }>;
  callbacks: Array<{ word: string; text: string }>;
  streakTemplate: string;
  roundTemplate: string;
}

async function writeLines(childId: string, setup: ChildSetup, words: string[], missed: string[]): Promise<WrittenLines> {
  const client = new Anthropic();
  const prompt = [
    `You write the announcer's lines for a child's practice game. The lines are recorded once this week and replayed during play, so they must stay true whatever happens.`,
    ``,
    `The child (from her own profile; use what she loves, never mention anything clinical, school scores, or her sister ${setup.sibling}):`,
    softSoul(childId),
    ``,
    `The world: ${setup.world}`,
    `Her name, spelled for the voice: "${setup.sayName}". Use it in a few lines, not most.`,
    ``,
    `Write lines for each moment (count, then what happens):`,
    ...LINE_COUNTS.map(([event, count, what]) => `- ${event} (${count}): ${what}`),
    ``,
    `Rules:`,
    `- At most 8 words per line. They land on a music beat.`,
    `- Never spell letters out, never say chunks of a word, never say any of these practice words: ${words.join(", ") || "(none)"}.`,
    `- Never criticize, compare, or rush. Celebrate care and effort, not speed.`,
    `- If her profile shows she loves Japanese, write about a quarter of the right/perfect/catch/hatch lines in natural Japanese (Japanese script, kana or simple kanji, at most 10 characters), lang "ja". Otherwise none.`,
    `- You may start a line with ONE delivery tag for the voice: [excited], [whispers], [laughs], [shouts], [cheerfully]. English lines only.`,
    `- Make them specific to her: her shows, her sport, her food, her world. Funny where it fits. Fresh, not generic sports clichés.`,
    missed.length
      ? `- Callbacks: for each of these words she missed on an earlier day (${missed.join(", ")}), write 1 line said right after she gets it right today, like a rival she just beat. These lines MAY say that word.`
      : `- No callbacks this week.`,
    `- streakTemplate: a streak call with {n} for the number (e.g. "{n} in a row!"), in her world. roundTemplate: a round call with {n}.`,
    ``,
    `Save them with the save_lines tool.`,
  ].join("\n");
  // A tool with a schema makes the reply a filled-in form, not free text that can break.
  const line = { type: "object", properties: { event: { type: "string", enum: LINE_COUNTS.map(([event]) => event) }, text: { type: "string" }, lang: { type: "string", enum: ["en", "ja"] } }, required: ["event", "text", "lang"] };
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    tools: [{
      name: "save_lines",
      description: "Save the announcer lines.",
      input_schema: {
        type: "object",
        properties: {
          lines: { type: "array", items: line },
          callbacks: { type: "array", items: { type: "object", properties: { word: { type: "string" }, text: { type: "string" } }, required: ["word", "text"] } },
          streakTemplate: { type: "string" },
          roundTemplate: { type: "string" },
        },
        required: ["lines", "callbacks", "streakTemplate", "roundTemplate"],
      },
    }],
    messages: [{ role: "user", content: prompt }],
  });
  const saved = response.content.find((block) => block.type === "tool_use");
  if (!saved || saved.type !== "tool_use") throw new Error("The writer returned no lines");
  return saved.input as WrittenLines;
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const spoken = (text: string) => text.replace(/^\s*\[[a-z ]+\]\s*/i, "");

async function record(text: string, voiceId: string, lang: "en" | "ja", out: string): Promise<void> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_v3", ...(lang === "ja" ? { language_code: "ja" } : {}) }),
  });
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 200)}`);
  writeFileSync(out, Buffer.from(await response.arrayBuffer()));
}

/** A Japanese recognizer must hear Japanese back, or the clip is an English-accented guess. */
async function soundsJapanese(file: string): Promise<{ ok: boolean; heard: string }> {
  if (!process.env.DEEPGRAM_API_KEY) return { ok: true, heard: "(no recognizer key: unchecked)" };
  const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&language=ja", {
    method: "POST",
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "audio/mpeg" },
    body: readFileSync(file),
  });
  const body = (await response.json()) as { results?: { channels: Array<{ alternatives: Array<{ transcript: string }> }> } };
  const heard = body.results?.channels[0]?.alternatives[0]?.transcript ?? "";
  return { ok: /[぀-ヿ一-龯]/.test(heard), heard };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const childId = flag("child") ?? "ila";
  const setup = CHILDREN[childId];
  if (!setup) throw new Error(`No announcer setup for child "${childId}"`);
  const words = (flag("words") ?? "").split(",").map((word) => word.trim()).filter(Boolean);
  const missed = (flag("missed") ?? "").split(",").map((word) => word.trim()).filter(Boolean);
  const dry = args.includes("--dry");
  const voice = flag("voice") ?? setup.announcerVoice;

  console.log(` 🎮 [announcer] [write] [start] child=${childId} words=${words.length} missed=${missed.length}`);
  const written = await writeLines(childId, setup, words, missed);
  const clips: Array<AnnouncerClip & { voice: string }> = [];
  const keep = (clip: AnnouncerClip, voiceId = voice) => {
    const check = checkAnnouncerLine(spoken(clip.text), clip.event, words, { avoidNames: [setup.sibling] });
    const tooLongJa = clip.lang === "ja" && spoken(clip.text).length > 14;
    if (!check.ok || tooLongJa) {
      console.log(` 🎮 [announcer] [line] [dropped] ${clip.event} "${clip.text}" reason=${check.ok ? "too long" : check.reason}`);
      return;
    }
    clips.push({ ...clip, voice: voiceId });
  };
  const count = new Map<string, number>();
  for (const line of written.lines) {
    const index = (count.get(line.event) ?? 0) + 1;
    count.set(line.event, index);
    keep({ id: `${line.event}-${index}`, event: line.event, text: line.text, lang: line.lang === "ja" ? "ja" : "en", file: `clips/${line.event}-${index}.mp3` });
  }
  for (const callback of written.callbacks ?? []) {
    if (!missed.includes(callback.word)) continue;
    keep({ id: `callback-${callback.word}`, event: "callback", text: callback.text, lang: "en", word: callback.word, file: `clips/callback-${callback.word}.mp3` });
  }
  keep({ id: "slot-name", event: "slot", slot: "name", text: `[excited] ${setup.sayName}!`, lang: "en", file: "clips/slot-name.mp3" });
  // The game's own cue in the same voice, so the announcer owns every spoken line (no browser voice on top).
  keep({ id: "slot-ready", event: "slot", slot: "ready", text: "[excited] Ready? Go!", lang: "en", file: "clips/slot-ready.mp3" });
  for (let n = 3; n <= 10; n += 1) {
    keep({ id: `slot-streak-${n}`, event: "slot", slot: `streak:${n}`, text: `[excited] ${written.streakTemplate.replace("{n}", NUMBER_WORDS[n])}`, lang: "en", file: `clips/slot-streak-${n}.mp3` });
  }
  for (let n = 2; n <= 12; n += 1) {
    keep({ id: `slot-round-${n}`, event: "slot", slot: `round:${n}`, text: written.roundTemplate.replace("{n}", NUMBER_WORDS[n]), lang: "en", file: `clips/slot-round-${n}.mp3` });
  }
  for (const creature of CREATURE_CATALOG) {
    keep({ id: `slot-creature-${creature.id}`, event: "slot", slot: `creature:${creature.id}`, text: `${creature.speciesName}!`, lang: "en", file: `clips/slot-creature-${creature.id}.mp3` });
  }
  const companionVoice = setup.companionVoiceEnv ? process.env[setup.companionVoiceEnv] : undefined;
  if (companionVoice) {
    // The companion says the practice word itself: the clearest, truest sound in the game.
    for (const word of words) {
      clips.push({ id: `slot-word-${word}`, event: "slot", slot: `word:${word}`, text: word, lang: "en", file: `clips/slot-word-${word}.mp3`, voice: companionVoice });
    }
  } else if (words.length) console.log(` 🎮 [announcer] [words] [skipped] no companion voice in ${setup.companionVoiceEnv}`);

  const outDir = resolve(process.cwd(), "web/public/generated/announcer", childId);
  console.log(` 🎮 [announcer] [write] [done] lines=${clips.length}`);
  clips.forEach((clip) => console.log(`    ${clip.id.padEnd(26)} ${clip.lang} ${clip.text}`));
  if (dry) return;

  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "clips"), { recursive: true });
  const recorded: AnnouncerClip[] = [];
  for (const clip of clips) {
    const out = join(outDir, clip.file);
    try {
      await record(clip.text, clip.voice, clip.lang, out);
      if (clip.lang === "ja") {
        const check = await soundsJapanese(out);
        console.log(` 🎮 [announcer] [japanese] [${check.ok ? "ok" : "dropped"}] ${clip.id} wrote="${clip.text}" heard="${check.heard}"`);
        if (!check.ok) continue;
      }
      const { voice: _voice, ...bankClip } = clip;
      recorded.push(bankClip);
    } catch (error) {
      console.warn(` 🎮 [announcer] [record] [failed] ${clip.id}`, error);
    }
  }
  const bank: AnnouncerBank = { childId, week: isoWeek(), clips: recorded };
  writeFileSync(join(outDir, "bank.json"), JSON.stringify(bank, null, 2));
  const characters = clips.reduce((sum, clip) => sum + clip.text.length, 0);
  console.log(` 🎮 [announcer] [bank] [ready] child=${childId} week=${bank.week} clips=${recorded.length}/${clips.length} characters=${characters} dir=${outDir}`);
}

main().catch((error) => {
  console.error(" 🎮 [announcer] [build] [failed]", error);
  process.exit(1);
});
