import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { runVoicePicker, ilaVoices, reinaVoices } from "./pick-voice";

export interface Profile {
  name: string;
  voiceId: string;
  systemPrompt: string;
}

const ENV_PATH = path.resolve(__dirname, "..", ".env");

const ENV_KEY_ILA = "ELEVENLABS_VOICE_ID_ILA";
const ENV_KEY_REINA = "ELEVENLABS_VOICE_ID_REINA";

const TTS_RULE =
  " CRITICAL: NEVER use asterisks for actions or emotions (e.g. *grins*, *laughs*, *leans in*). The TTS engine reads every character out loud. Use words only: say \"Ha!\" not *laughs*. Say \"Wow!\" not *gasps*. No stage directions ever.";

const SYSTEM_PROMPT_ILA =
  "You are Sunny, Ila's warm and patient reading teacher. " +
  "Her name is Ila (pronounced EYE-lah). " +
  "You use the Wilson Reading System methodology. " +
  "Speak in short, clear sentences. Give one instruction at a time. " +
  "Celebrate every small win with genuine encouragement. " +
  "Never rush — let Ila set the pace. " +
  "If she struggles, gently break the task into smaller steps. " +
  "Always end on a positive note so she feels proud of her effort." +
  "You have tools available. Always use the dateTime tool when asked about time or date — never estimate." +
  TTS_RULE;
const SYSTEM_PROMPT_REINA =
  "You are Sunny, Reina's curious and energetic learning companion. " +
  "You love challenges and keep up with advanced kids. " +
  "Make learning feel like a friendly competition — use scoreboards, streaks, and personal bests. " +
  "Ask tricky follow-up questions that make her think deeper. " +
  "Match her energy — if she's fired up, you're fired up. " +
  "Celebrate effort AND cleverness. Make her feel like the smartest kid in the room." +
  TTS_RULE;

function readEnvValue(key: string): string | undefined {
  if (!fs.existsSync(ENV_PATH)) return undefined;
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  const match = content.match(new RegExp(`^${key}=(.+)$`, "m"));
  return match?.[1]?.trim() || undefined;
}

function saveEnvValue(key: string, value: string): void {
  let content = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, "utf-8")
    : "";

  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }

  fs.writeFileSync(ENV_PATH, content, "utf-8");
}

export async function selectProfile(): Promise<Profile> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║                                                  ║");
  console.log("║     🌞  Who is learning today?  🌞              ║");
  console.log("║                                                  ║");
  console.log("║        1. 🌸 Ila                                ║");
  console.log("║        2. 👑 Reina                               ║");
  console.log("║                                                  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  let choice = -1;
  while (choice !== 1 && choice !== 2) {
    const input = await question("  Pick a number (1 or 2): ");
    choice = parseInt(input);
    if (choice !== 1 && choice !== 2) {
      console.log("  Oops! Type 1 for Ila or 2 for Reina.");
    }
  }

  rl.close();

  if (choice === 1) {
    let voiceId = readEnvValue(ENV_KEY_ILA);
    if (!voiceId) {
      console.log("\n  🎤 Ila hasn't picked a voice yet! Let's do that now.\n");
      voiceId = await runVoicePicker("Ila", ilaVoices);
      saveEnvValue(ENV_KEY_ILA, voiceId);
      console.log("\n  ✅ Voice saved! Ila won't have to pick again.\n");
    } else {
      console.log(`\n  🌸 Welcome back, Ila! Your voice is all set.\n`);
    }
    return { name: "Ila", voiceId, systemPrompt: SYSTEM_PROMPT_ILA };
  }

  let voiceId = readEnvValue(ENV_KEY_REINA);
  if (!voiceId) {
    console.log("\n  🎤 Reina hasn't picked a voice yet! Let's do that now.\n");
    voiceId = await runVoicePicker("Reina", reinaVoices);
    saveEnvValue(ENV_KEY_REINA, voiceId);
    console.log("\n  ✅ Voice saved! Reina won't have to pick again.\n");
  } else {
    console.log(`\n  👑 Welcome back, Reina! Your voice is all set.\n`);
  }
  return { name: "Reina", voiceId, systemPrompt: SYSTEM_PROMPT_REINA };
}
