import * as fs from "fs";
import * as path from "path";
import { getTimeBasedGreeting } from "../utils/timeBasedGreeting";

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
  markdownPath: string;
  tracksActiveWord?: boolean;
  transitionToWorkAfterRounds?: number;
  usesCanonicalMathProblem?: boolean;
}

export type ChildName = "Ila" | "Reina" | "creator";

function loadCompanion(
  companionFile: string,
  voiceEnvKey: string,
  voiceFallback: string,
  behavior: Pick<
    CompanionConfig,
    "tracksActiveWord" | "transitionToWorkAfterRounds" | "usesCanonicalMathProblem"
  > = {},
): CompanionConfig {
  const markdownPath = path.resolve(DIR, companionFile);
  const companionMd = read(companionFile);

  const name = parseMeta(companionMd, "Name");
  const childName = parseMeta(companionMd, "Child").replace(/\s*\(.*\)/, "");
  const emoji = parseMeta(companionMd, "Emoji");
  const voiceId = process.env[voiceEnvKey] || voiceFallback;

  const openingLine = getTimeBasedGreeting(childName);
  const goodbye = parseField(companionMd, "Goodbye");

  return {
    name,
    childName,
    voiceId,
    emoji,
    // Assembled by buildSessionPrompt / buildDiagPrompt in session-bootstrap.ts
    systemPrompt: "",
    openingLine,
    goodbye,
    markdownPath,
    ...behavior,
  };
}

export const ELLI = loadCompanion(
  "companions/elli.md",
  "ELEVENLABS_VOICE_ID_ILA",
  "MF3mGyEYCl7XYWbV9V6O",
  {
    tracksActiveWord: true,
    transitionToWorkAfterRounds: 5,
    usesCanonicalMathProblem: false,
  },
);

export const MATILDA = loadCompanion(
  "companions/matilda.md",
  "ELEVENLABS_VOICE_ID_REINA",
  // Default: Gigi (premade) — bubbly/animation; override with ELEVENLABS_VOICE_ID_REINA
  "jBpfuIE2acCO8z3wKNLl",
  {
    tracksActiveWord: false,
    transitionToWorkAfterRounds: undefined,
    usesCanonicalMathProblem: true,
  },
);

/** Diagnostics / creator kiosk — Elli-class tools, Charlotte label + voice (diag TTS path). */
export const CHARLOTTE_CREATOR: CompanionConfig = {
  ...ELLI,
  name: "Charlotte",
  childName: "creator",
  tracksActiveWord: false,
};

export const COMPANIONS_BY_CHILD: Record<ChildName, CompanionConfig> = {
  Ila: ELLI,
  Reina: MATILDA,
  creator: CHARLOTTE_CREATOR,
};

export function getCompanionConfig(childName: ChildName): CompanionConfig {
  return COMPANIONS_BY_CHILD[childName];
}
