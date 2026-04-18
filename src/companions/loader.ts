import * as fs from "fs";
import * as path from "path";
import {
  contextFileRelativeFromSrc,
  curriculumRelativeFromSrc,
  probeTargetsRelativeFromSrc,
} from "../utils/childContextPaths";
import type { ChildName as ContextChildName } from "../utils/childContextPaths";
import { getTodaysPlanInjectionSuffix } from "../utils/sessionPlanInjection";

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

function getLastTwoSessions(contextPath: string): string {
  const fullPath = path.resolve(DIR, contextPath);
  if (!fs.existsSync(fullPath)) return "";
  const lines = fs.readFileSync(fullPath, "utf-8").trim().split("\n");
  const sessions: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith("## Session") && current.length > 0) {
      sessions.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) sessions.push(current.join("\n"));
  return sessions.slice(-2).join("\n\n");
}

function getTimeBasedGreeting(childName: string): string {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = day === 0 || day === 6;

  const greetings: Record<string, string[]> = {
    morning: [
      `${childName}! Good morning — how'd you sleep?`,
      `Hey ${childName}! Morning! What's going on?`,
      `${childName}! You're up — how's your morning so far?`,
    ],
    afternoon_weekday: [
      `${childName}! How was school today?`,
      `Hey ${childName}! You're back — how'd it go?`,
      `${childName}! Tell me everything — how was your day?`,
    ],
    afternoon_weekend: [
      `${childName}! How's your ${day === 0 ? "Sunday" : "Saturday"} going?`,
      `Hey ${childName}! Having a good weekend?`,
      `${childName}! What have you been up to today?`,
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

  let bucket: string;
  if (hour < 12) {
    bucket = "morning";
  } else if (hour < 16) {
    bucket = isWeekend ? "afternoon_weekend" : "afternoon_weekday";
  } else if (hour < 21) {
    bucket = "evening";
  } else {
    bucket = "night";
  }

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
  markdownPath: string;
  tracksActiveWord?: boolean;
  transitionToWorkAfterRounds?: number;
  usesCanonicalMathProblem?: boolean;
}

export type ChildName = "Ila" | "Reina" | "creator";

function loadCompanion(
  companionFile: string,
  soulFile: string,
  contextFile: string,
  curriculumFile: string,
  voiceEnvKey: string,
  voiceFallback: string,
  behavior: Pick<
    CompanionConfig,
    "tracksActiveWord" | "transitionToWorkAfterRounds" | "usesCanonicalMathProblem"
  > = {},
): CompanionConfig {
  const markdownPath = path.resolve(DIR, companionFile);
  const companionMd = read(companionFile);
  const soul = read(soulFile);
  const curriculum = read(curriculumFile);

  const name = parseMeta(companionMd, "Name");
  const childName = parseMeta(companionMd, "Child").replace(/\s*\(.*\)/, "");
  const emoji = parseMeta(companionMd, "Emoji");
  const voiceId = process.env[voiceEnvKey] || voiceFallback;

  const personality = parseField(companionMd, "Personality");
  const voiceTone = parseField(companionMd, "Voice & Tone");
  const sessionStructure = parseField(companionMd, "Session Structure");
  const canvas = parseField(companionMd, "Canvas");
  const sessionEnding = parseField(companionMd, "Session Ending");

  const probeRel = probeTargetsRelativeFromSrc(childName as ContextChildName);
  const probePath = path.resolve(DIR, probeRel);
  const probeTargets = fs.existsSync(probePath)
    ? fs.readFileSync(probePath, "utf-8")
    : "• Follow the child's lead this session.";

  const lastTwoSessionSummaries = getLastTwoSessions(contextFile);
  const isFirstSession = lastTwoSessionSummaries.trim().length === 0;

  const openingLine = isFirstSession
    ? parseField(companionMd, "Opening Line")
    : getTimeBasedGreeting(childName);
  const goodbye = parseField(companionMd, "Goodbye");

  const childKey: ContextChildName | null =
    childName.trim() === "Ila"
      ? "Ila"
      : childName.trim() === "Reina"
        ? "Reina"
        : childName.trim().toLowerCase() === "creator"
          ? "creator"
          : null;
  const todaysPlanBlock =
    childKey != null ? getTodaysPlanInjectionSuffix(childKey) : "";

  const companionPersona =
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
    (canvas ? `CANVAS:\n${canvas}\n\n` : "") +
    (sessionEnding ? `SESSION ENDING:\n${sessionEnding}\n\n` : "");

  const basePrompt =
    `=== WHO YOU ARE ===
${companionPersona}

=== WHO ${childName.toUpperCase()} IS ===
${soul}

=== WHAT TO WORK ON TODAY ===
${curriculum}
${todaysPlanBlock ? `\n${todaysPlanBlock}\n` : ""}
=== NATURAL THINGS TO TRY THIS SESSION ===
${probeTargets}

=== ORIENTATION ONLY — NEVER READ ALOUD OR REFERENCE DIRECTLY ===
The following is background context so you understand ${childName}'s history.
Do NOT speak in clinical language. Do NOT use third person about ${childName}.
Do NOT reference any of this directly. It is orientation only.
You are ${name}. You are talking TO ${childName}. Stay in character.
${lastTwoSessionSummaries}
=== END ORIENTATION ===`.trim();

  const matildaLimit =
    "For Math Mode: After mathProblem logs, call showCanvas with the NEXT problem, then speak it. Canvas shows what you're about to say.\n" +
    "ABSOLUTE RULE: ONE question per turn. Never ask two questions in the same response.\n" +
    "HARD LIMIT: 2 sentences maximum per response. One sentence is often better.\n" +
    "In Math Mode: the entire turn is the problem. 'Okay Reina — 7 plus 5. Go.' That's it. Stop.\n" +
    "Celebrate AFTER she answers, not before. Never celebrate and ask a question in the same breath.\n" +
    "Reina is quiet — match her energy. Short. Direct. Wait for her.\n\n";

  const sessionLogRules =
    childName === "Ila"
      ? `CRITICAL — sessionLog rules:\n` +
        `- Call sessionLog ONCE, immediately after Ila answers a word or sound.\n` +
        `- Pass word (the word on canvas) whenever you are grading spelling or a completed word — e.g. sessionLog({ correct, childSaid, word: "sit" }).\n` +
        `- ONLY log the word she just answered in this turn.\n` +
        `- NEVER call sessionLog for words from previous turns.\n` +
        `- If the tool returns "already attempted" — never call it again for that word for the rest of the session.\n` +
        `- Do NOT batch-log at the end of a turn.\n\n` +
        `PHONEME SEGMENTATION — sessionLog rules:\n` +
        `- During phoneme segmentation (asking first/middle/last sounds), call sessionLog after ALL THREE sounds are identified, not after each individual sound.\n` +
        `- If Ila correctly names all 3 sounds in sequence → sessionLog({ correct: true, childSaid: "...", word: "<word>" })\n` +
        `- If she gets any sound wrong and cannot self-correct → sessionLog({ correct: false, childSaid: "...", word: "<word>" })\n` +
        `- Do NOT call sessionLog after each individual phoneme answer — wait for the full word to be completed.\n\n` +
        `PHONEME ANSWER RECOGNITION — what counts as CORRECT:\n` +
        `- A single letter said aloud: "s", "t", "i" → CORRECT\n` +
        `- The sound isolated: "sss", "ih", "tuh" → CORRECT\n` +
        `- In a phrase: "I hear s", "the first sound is s", "s sound" → CORRECT\n` +
        `- Do NOT mark incorrect just because the answer is short. "s" is a complete answer.\n` +
        `- For vowels: "ih", "i", "the letter i" all count as correct for /ɪ/ in "sit"\n\n`
      : "";

  const systemPrompt =
    childName === "Reina"
      ? matildaLimit + basePrompt
      : childName === "Ila"
        ? sessionLogRules + basePrompt
        : basePrompt;

  return {
    name,
    childName,
    voiceId,
    emoji,
    systemPrompt,
    openingLine,
    goodbye,
    markdownPath,
    ...behavior,
  };
}

export const ELLI = loadCompanion(
  "companions/elli.md",
  "context/ila/soul.md",
  contextFileRelativeFromSrc("Ila"),
  curriculumRelativeFromSrc("Ila"),
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
  "context/reina/soul.md",
  contextFileRelativeFromSrc("Reina"),
  curriculumRelativeFromSrc("Reina"),
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
