/**
 * Pick a British / UK-adjacent female premade voice for diagnostics mode
 * (ELEVENLABS_VOICE_ID_DIAG). Same interaction pattern as voice-showdown.ts.
 *
 * Usage: npm run voice-creator [your-name]
 *
 * Premade accent metadata: https://elevenlabs-sdk.mintlify.app/voices/premade-voices
 */
import "dotenv/config";
import * as readline from "readline";
import { ElevenLabsClient, play } from "@elevenlabs/elevenlabs-js";
import type { VoiceAudition } from "./pick-voice";
import { britishFemaleDiagVoices } from "./diag-voices";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

function getPronunciationLocators() {
  const dictId = process.env.ELEVENLABS_PRONUNCIATION_DICT_ID;
  const versionId = process.env.ELEVENLABS_PRONUNCIATION_DICT_VERSION;
  if (!dictId || !versionId) return undefined;
  return [{ pronunciationDictionaryId: dictId, versionId }];
}

/** Diagnostics-oriented lines (creator / demo audience). */
const getDiagSample = (voiceName: string, addressee: string): string => {
  const samples: Record<string, string> = {
    Alice: `Right — ${addressee}, I'm in Sunny's diagnostics mode. I'll call the dateTime tool first, then walk you through what's on the canvas manifest. No rush.`,
    Dorothy: `Oh, hiya ${addressee}! Fancy a quick tour? I'm meant for storytime voices, but for diagnostics I'll keep things friendly and clear — shall we peek at the tools next?`,
    Lily: `${addressee}, picture this: diagnostics mode, manifest-driven canvas, no guessing from memory. I'll narrate what I'm doing so you can hear how this voice carries technical chat.`,
    Charlotte: `${addressee}, diagnostics with a bit of polish — I'll demonstrate a canvas mode, confirm what I called, and you can judge whether this tone fits your kiosk.`,
    Mimi: `${addressee}! Diagnostics party! I'm going to sound excited while I prove the pipeline — tools, canvas, the lot — tell me if I'm too much or just right!`,
  };
  return (
    samples[voiceName] ??
    `${addressee}, I'm ${voiceName}, running through Sunny diagnostics — clear, steady, and ready when you are.`
  );
};

const GLAD_DIAG: Record<string, (who: string) => string> = {
  Alice: (who) =>
    `${who}, you queued my sample — good taste. Pick me for diag and your walkthroughs will sound like a calm briefing, not a cartoon.`,
  Dorothy: (who) =>
    `${who}, if you want diagnostics to feel gentle and human, I'm your voice — pick me and I'll make demos feel like a chat, not a lecture.`,
  Lily: (who) =>
    `${who}, you get storytelling energy with a British edge — pick Lily if you want diag sessions people actually remember.`,
  Charlotte: (who) =>
    `${who}, a touch of drama never hurt a demo — pick Charlotte if you want diagnostics to sound premium.`,
  Mimi: (who) =>
    `${who}, pick me if you want diagnostics loud, bright, and impossible to ignore — we'll make the manifest fun!`,
};

async function playText(voiceId: string, text: string): Promise<void> {
  const locators = getPronunciationLocators();
  const audio = await client.textToSpeech.convert(voiceId, {
    text,
    modelId: "eleven_multilingual_v2",
    ...(locators && { pronunciationDictionaryLocators: locators }),
  });
  await play(audio);
}

export async function runDiagVoiceCreator(
  addressee: string,
  voices: VoiceAudition[],
): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  console.log("\n");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║                                                  ║");
  console.log("║   SUNNY VOICE CREATOR — DIAG / BRITISH FEMALE    ║");
  console.log("║                                                  ║");
  console.log(
    `║   Hi${addressee ? " " + addressee : ""}! Pick a voice for diagnostics.`.padEnd(
      55,
    ) + "║",
  );
  console.log("║   Premade voices: British or UK-adjacent accents ║");
  console.log("║   Default diag voice if unset: Charlotte premade ║");
  console.log("║   (Also in Reina voice-showdown if you pick her.) ║");
  console.log("║   Same flow as voice-showdown: number = hear,    ║");
  console.log("║   PICK = lock in + print ELEVENLABS_VOICE_ID_DIAG║");
  console.log("║                                                  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  for (let i = 0; i < voices.length; i++) {
    console.log(`    ${i + 1}. ${voices[i].emoji}  ${voices[i].name}`);
  }

  let lastPicked: VoiceAudition | null = null;

  while (true) {
    const choice = await question(
      `\n  Which voice? (1-${voices.length}) or PICK to choose ${lastPicked ? lastPicked.name : "one you heard"}: `,
    );

    const trimmed = choice.trim().toUpperCase();

    if (trimmed === "PICK" && lastPicked) {
      console.log(
        `\n  ✨ Locked in: ${lastPicked.name} ${lastPicked.emoji} for diagnostics. ✨\n`,
      );
      console.log("  Add to your .env:\n");
      console.log(`  ELEVENLABS_VOICE_ID_DIAG=${lastPicked.id}\n`);
      console.log("  Then run: npm run sunny:mode:diag (or sunny:testmode:diag)\n");
      await playText(
        lastPicked.id,
        `Lovely — you picked me for diagnostics. I'll sound great when Sunny calls dateTime and walks you through the canvas. Let's go!`,
      );
      rl.close();
      return lastPicked.id;
    }

    if (trimmed === "PICK" && !lastPicked) {
      console.log(
        "  Hear at least one voice first — enter a number from 1 to " +
          voices.length +
          ".",
      );
      continue;
    }

    const num = parseInt(choice, 10) - 1;
    if (num < 0 || num >= voices.length || Number.isNaN(num)) {
      console.log(
        `  Enter 1–${voices.length}, or PICK after you've heard a voice.`,
      );
      continue;
    }

    const voice = voices[num];
    lastPicked = voice;

    const sample = getDiagSample(voice.name, addressee || "there");
    const gladText =
      GLAD_DIAG[voice.name]?.(addressee || "there") ??
      `${addressee || "there"}, thanks for listening — pick me if this fits your diagnostics kiosk!`;

    console.log(`\n${"─".repeat(50)}`);
    console.log(`  ${voice.emoji}  ${voice.name}  ${voice.emoji}`);
    console.log(`${"─".repeat(50)}\n`);
    console.log(`  ${voice.pitch}\n`);
    console.log(`  Sample: "${sample}"\n`);
    console.log(`  🔊 Playing sample...\n`);
    await playText(voice.id, sample);

    console.log(`  Pitch: "${gladText}"\n`);
    console.log(`  🔊 Playing response...\n`);
    await playText(voice.id, gladText);

    console.log(
      `  Another number to compare, or PICK to set ELEVENLABS_VOICE_ID_DIAG to ${voice.name}.`,
    );
  }
}

if (require.main === module) {
  const addressee = (process.argv[2] || "").trim();
  runDiagVoiceCreator(addressee, britishFemaleDiagVoices)
    .then((id) => {
      console.log(`\n  Voice ID (again): ${id}\n`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
