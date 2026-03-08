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
    : parseField(companionMd, "Returning Greeting");
  const goodbye = parseField(companionMd, "Goodbye");

  const systemPrompt =
    `You are ${name}, ${childName}'s learning companion.\n\n` +
    `YOUR PERSONALITY:\n${personality}\n\n` +
    `YOUR VOICE & TONE:\n${voiceTone}\n\n` +
    (sessionStructure
      ? `SESSION STRUCTURE (follow this every session):\n${sessionStructure}\n\n`
      : "") +
    `CURRICULUM:\n\n${curriculum}\n\n` +
    `${childName.toUpperCase()}'S SOUL FILE (read this carefully — this is who they are):\n\n${soul}\n\n` +
    `SESSION CONTEXT:\n\n${context}`;

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
