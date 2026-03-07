import "dotenv/config";
import { ElevenLabsClient, play } from "@elevenlabs/elevenlabs-js";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

function getPronunciationLocators() {
  const dictId = process.env.ELEVENLABS_PRONUNCIATION_DICT_ID;
  const versionId = process.env.ELEVENLABS_PRONUNCIATION_DICT_VERSION;
  if (!dictId || !versionId) return undefined;
  return [{ pronunciationDictionaryId: dictId, versionId }];
}

/** Elli voice — ILA's pick (silly, playful, get-to-know-her vibe) */
const ELLI_ID = "MF3mGyEYCl7XYWbV9V6O";

/**
 * Victory message for ILA: Elli celebrates being chosen.
 * - ILA wants to get to know Elli → Elli shares a bit about herself
 * - Silly and playful tone
 * - Warm, buddy vibe (not competitive like Reina's Matilda)
 */
const VICTORY_MESSAGE =
  "Oh my gosh, ILA! You picked me! I'm Elli! " +
  "Okay okay, so you want to get to know me? Here's the deal. I love gold stars. I love making funny voices when we read. And I think the sillier we are, the more we learn. True story! " +
  "I'm gonna be so silly with you. We can make up silly words and do happy dances when you get something right. I might even do a little wiggle. You'll see! " +
  "I'm so excited we're gonna be buddies. You're gonna know me so well and I'm gonna know you. Let's be silly and playful and learn everything together. Ready? Let's go, ILA!";

async function playVictory(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║     ⭐  ELLI VICTORY — For ILA  ⭐               ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log("  Playing Elli's message...\n");

  const locators = getPronunciationLocators();
  const audio = await client.textToSpeech.convert(ELLI_ID, {
    text: VICTORY_MESSAGE,
    modelId: "eleven_multilingual_v2",
    ...(locators && { pronunciationDictionaryLocators: locators }),
  });

  await play(audio);
  console.log("\n  ✨ Done!\n");
}

if (require.main === module) {
  playVictory().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { playVictory, VICTORY_MESSAGE, ELLI_ID };
