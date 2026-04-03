import "dotenv/config";
import * as readline from "readline";
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

/** Matilda — for Reina (8), playful, excited to help, second audition with "pick me pretty please" */
const MATILDA_ID = "jBpfuIE2acCO8z3wKNLl";

const AUDITION_1 =
  "Hey Reina! I'm Matilda, like the girl from the book who loved reading and being super smart! " +
  "I am SO excited to help you learn — we're gonna play with words and numbers and make everything an adventure. " +
  "I'm super playful and I can't wait to cheer you on. Ready to have the best time together?";

const AUDITION_2 =
  "Reina, that was so much fun! I really, really want to be your Sunny voice. " +
  "I'll be playful every day and I'll get so excited whenever you get something right. " +
  "So… will you pick me? Pretty please? I promise I'll make learning the most fun ever. Pick me, pretty please!";

async function playScript(
  voiceId: string,
  text: string,
  label: string
): Promise<void> {
  console.log(`\n  📚 ${label}\n`);
  console.log(`  "${text}"\n`);
  console.log(`  🔊 Playing...\n`);

  const locators = getPronunciationLocators();
  const audio = await client.textToSpeech.convert(voiceId, {
    text,
    modelId: "eleven_multilingual_v2",
    ...(locators && { pronunciationDictionaryLocators: locators }),
  });

  await play(audio);
}

async function runReinaMatildaAudition(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  console.log("\n");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║                                                  ║");
  console.log("║     📚  MATILDA'S SECOND AUDITION  📚            ║");
  console.log("║         For Reina (8) — Playful & Excited        ║");
  console.log("║                                                  ║");
  console.log("║     Hey Reina! You liked Matilda? She's back!     ║");
  console.log("║     Listen to her two auditions and then pick.   ║");
  console.log("║                                                  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  await question("  Press Enter when you're ready, Reina! 🎉 ");

  console.log(`\n${"─".repeat(50)}`);
  console.log("  📚  Audition 1: Meet Matilda  📚");
  console.log(`${"─".repeat(50)}`);
  await playScript(MATILDA_ID, AUDITION_1, "Audition 1");

  await question("\n  Press Enter for Matilda's second audition... ");

  console.log(`\n${"─".repeat(50)}`);
  console.log("  📚  Audition 2: Pick me, pretty please!  📚");
  console.log(`${"─".repeat(50)}`);
  await playScript(MATILDA_ID, AUDITION_2, "Audition 2");

  console.log(`\n${"─".repeat(50)}`);
  console.log("  🎉  Did Reina pick Matilda?  🎉");
  console.log(`${"─".repeat(50)}\n`);

  let choice = "";
  while (choice !== "y" && choice !== "n" && choice !== "yes" && choice !== "no") {
    choice = (
      await question("  Reina, do you want Matilda as your Sunny voice? (y/n): ")
    )
      .trim()
      .toLowerCase();
    if (choice !== "y" && choice !== "n" && choice !== "yes" && choice !== "no") {
      console.log("  Type y for yes or n for no. 😊");
    }
  }

  const picked = choice === "y" || choice === "yes";

  if (picked) {
    console.log("\n  ✨ Yay! Matilda 📚 is your Sunny voice! ✨\n");
    console.log("  Let's hear Matilda celebrate...\n");

    const locators = getPronunciationLocators();
    const audio = await client.textToSpeech.convert(MATILDA_ID, {
      text:
        "Yay! Reina picked me! I'm so, so happy! Get ready Reina, we're gonna have the best time learning together. Pretty please paid off! Let's go!",
      modelId: "eleven_multilingual_v2",
      ...(locators && { pronunciationDictionaryLocators: locators }),
    });
    await play(audio);
    console.log("\n  Voice ID for .env: " + MATILDA_ID + "\n");
  } else {
    console.log("\n  No worries, Reina! You can run the main voice picker anytime.\n");
  }

  rl.close();
}

if (require.main === module) {
  runReinaMatildaAudition().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
