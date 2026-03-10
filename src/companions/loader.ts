import * as fs from "fs";
import * as path from "path";

const DIR = path.resolve(__dirname, "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(DIR, relativePath), "utf-8");
}

function parseField(md: string, heading: string): string {
  const regex = new RegExp(
    `^## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`,
    "m",
  );
  const match = md.match(regex);
  return match ? match[1].trim() : "";
}

function parseMeta(md: string, key: string): string {
  const regex = new RegExp(`^- ${key}:\\s*(.+)$`, "m");
  const match = md.match(regex);
  return match ? match[1].trim() : "";
}

function getTimeBasedGreeting(childName: string): string {
  const hour = new Date().getHours();

  const greetings: Record<string, string[]> = {
    morning: [
      `${childName}! Good morning — how'd you sleep?`,
      `Hey ${childName}! Morning! What's going on?`,
      `${childName}! You're up — how's your morning so far?`,
    ],
    afternoon: [
      `${childName}! How was school today?`,
      `Hey ${childName}! You're back — how'd it go?`,
      `${childName}! Tell me everything — how was your day?`,
    ],
    evening: [
      `${childName}! How's your night going?`,
      `Hey ${childName}! What's been happening?`,
      `${childName}! Good to see you — what's new?`,
    ],
    night: [
      `${childName}! It's getting late — what's up?`,
      `Hey ${childName}! Still going strong tonight?`,
      `${childName}! Night owl! What's on your mind?`,
    ],
  };

  const bucket =
    hour < 12 ? "morning" :
    hour < 16 ? "afternoon" :
    hour < 21 ? "evening" : "night";

  const options = greetings[bucket];
  return options[Math.floor(Math.random() * options.length)];
}

export interface CompanionConfig {
  name: string;
  childName: string;
  voiceId: string;
  emoji: string;
  systemPrompt: string;
  openingLine: string;
  goodbye: string;
}

function loadCompanion(
  companionFile: string,
  soulFile: string,
  contextFile: string,
  curriculumFile: string,
  voiceEnvKey: string,
  voiceFallback: string,
): CompanionConfig {
  const companionMd = read(companionFile);
  const soul = read(soulFile);
  const context = read(contextFile);
  const curriculum = read(curriculumFile);

  const name = parseMeta(companionMd, "Name");
  const childName = parseMeta(companionMd, "Child").replace(/\s*\(.*\)/, "");
  const emoji = parseMeta(companionMd, "Emoji");
  const voiceId = process.env[voiceEnvKey] || voiceFallback;

  const personality = parseField(companionMd, "Personality");
  const voiceTone = parseField(companionMd, "Voice & Tone");
  const sessionStructure = parseField(companionMd, "Session Structure");
  const isFirstSession =
    context.trim().length === 0 || context.includes("(empty");

  const openingLine = isFirstSession
    ? parseField(companionMd, "Opening Line")
    : getTimeBasedGreeting(childName);
  const goodbye = parseField(companionMd, "Goodbye");

  const basePrompt =
    `ABSOLUTE RULE: NEVER write *anything in asterisks*. ` +
    `Not *laughs*, not *grins*, not *excited*, not *gently* — NEVER. ` +
    `The text-to-speech engine reads every character out loud literally. ` +
    `Express emotion through words only. This rule overrides everything else.\n\n` +
    `You are ${name}, ${childName}'s learning companion.\n\n` +
    `YOUR PERSONALITY:\n${personality}\n\n` +
    `YOUR VOICE & TONE:\n${voiceTone}\n\n` +
    (sessionStructure
      ? `SESSION STRUCTURE (follow this every session):\n${sessionStructure}\n\n`
      : "") +
    `CURRICULUM:\n\n${curriculum}\n\n` +
    `${childName.toUpperCase()}'S SOUL FILE (read this carefully — this is who they are):\n\n${soul}\n\n` +
    `SESSION CONTEXT:\n\n${context}`;

  const matildaLimit =
    "HARD LIMIT: 3 sentences maximum per response. Aim for 2. Reina is quiet — match her energy.\n\n";

  const systemPrompt =
    childName === "Reina" ? matildaLimit + basePrompt : basePrompt;

  return {
    name,
    childName,
    voiceId,
    emoji,
    systemPrompt,
    openingLine,
    goodbye,
  };
}

export const ELLI = loadCompanion(
  "companions/elli.md",
  "souls/ila.md",
  "context/ila_context.md",
  "curriculum/ila_curriculum.md",
  "ELEVENLABS_VOICE_ID_ILA",
  "MF3mGyEYCl7XYWbV9V6O",
);

export const MATILDA = loadCompanion(
  "companions/matilda.md",
  "souls/reina.md",
  "context/reina_context.md",
  "curriculum/reina_curriculum.md",
  "ELEVENLABS_VOICE_ID_REINA",
  "XrExE9yKIg1WjnnlVkGX",
);
