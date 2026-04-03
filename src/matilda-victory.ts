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

/** Premade Gigi — default TTS for Matilda/Reina sessions (was premade Matilda voice id). */
const MATILDA_ID = "jBpfuIE2acCO8z3wKNLl";

/**
 * Victory message for Reina: Matilda celebrates being chosen.
 * - Nods to the movie (books, library, being clever, a little bit naughty)
 * - Playful and funny
 * - Shared love of reading, adventures, learning, being smart
 * - Friend/sister vibe
 */
const VICTORY_MESSAGE =
  "Reina! You actually picked me! I'm so happy I could do a little telekinetic trick. " +
  "Okay, I can't really move things with my mind like in the movie, but I can move us through every book and every lesson! " +
  "You know what? You and me are the same. We love reading. We love adventures. We love learning and being smart — and that's the coolest superpower, like in the story. " +
  "I'm gonna be right here with you, like a friend. Like a sister. So whenever you need me, I've got your back. " +
  "Now let's go have some fun. And remember: sometimes you have to be a little bit naughty. Just a little! Deal? Let's go, Reina!";

async function playVictory(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║     📚  MATILDA VICTORY — For Reina  📚          ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log("  Playing Matilda's message...\n");

  const locators = getPronunciationLocators();
  const audio = await client.textToSpeech.convert(MATILDA_ID, {
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

export { playVictory, VICTORY_MESSAGE, MATILDA_ID };
