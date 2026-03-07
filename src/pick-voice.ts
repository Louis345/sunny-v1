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

export interface VoiceAudition {
  name: string;
  id: string;
  emoji: string;
  pitch: string;
}

export const ilaVoices: VoiceAudition[] = [
  {
    name: "Rachel",
    id: "21m00Tcm4TlvDq8ikWAM",
    emoji: "🌸",
    pitch:
      "Hey Ila! I'm Rachel, and I'd love to be your Sunny voice. " +
      "I'm calm and warm, kind of like a cozy blanket on a rainy day. " +
      "We could learn amazing things together, and I promise to always cheer you on. " +
      "Pick me and every lesson will feel like a hug!",
  },
  {
    name: "Bella",
    id: "EXAVITQu4vr4xnSDxMaL",
    emoji: "🦋",
    pitch:
      "Hi there Ila! My name is Bella! " +
      "I'm sweet and gentle, like a butterfly landing on your shoulder. " +
      "I love telling stories and making learning feel like an adventure. " +
      "If you pick me, I'll be your best study buddy ever. Pinky promise!",
  },
  {
    name: "Elli",
    id: "MF3mGyEYCl7XYWbV9V6O",
    emoji: "⭐",
    pitch:
      "Oh my gosh, Ila! I'm Elli and I am SO excited to meet you! " +
      "I've got tons of energy and I love to have fun while we learn. " +
      "Math, science, reading, you name it, we'll crush it together! " +
      "Pick me and I'll make every single day feel like a gold star day!",
  },
  {
    name: "Josh",
    id: "TxGEqnHWrfWFTfGW9XjX",
    emoji: "🚀",
    pitch:
      "What's up Ila! I'm Josh, and I'm like a friendly big brother. " +
      "I've got a deep voice but a big heart, and I think learning should feel like a rocket ship ride. " +
      "Three, two, one, blastoff into knowledge! " +
      "Pick me and we'll explore the whole universe together!",
  },
  {
    name: "Adam",
    id: "pNInz6obpgDQGcFmaJgB",
    emoji: "🎙️",
    pitch:
      "Hello Ila! I'm Adam, and my voice is smooth like a radio host. " +
      "I'll make every lesson sound super cool and important, because YOU are super cool and important. " +
      "If you pick me, learning will feel like listening to your favorite show. " +
      "So what do you say, ready to tune in?",
  },
  {
    name: "Sam",
    id: "yoZ06aMxZJJ28mfd3POQ",
    emoji: "🎈",
    pitch:
      "Hey hey hey, Ila! I'm Sam! " +
      "I'm fun, I'm friendly, and I think eight year olds are the coolest people on the planet. " +
      "With me as your Sunny voice, every day is a party where we learn awesome stuff. " +
      "Pick me and let's go on the wildest learning adventure ever!",
  },
];

export const reinaVoices: VoiceAudition[] = [
  {
    name: "Charlotte",
    id: "XB0fDUnXU5powFXDhCwa",
    emoji: "👑",
    pitch:
      "Hey Reina! I'm Charlotte and guess what, your name means queen! " +
      "I think that's so cool. I'm elegant but super fun, and I love a good challenge. " +
      "If you pick me, every lesson will feel like a royal adventure. " +
      "Ready to conquer some knowledge, queen?",
  },
  {
    name: "Dorothy",
    id: "ThT5KcBeYPX3keUQqHPh",
    emoji: "🌪️",
    pitch:
      "Hi Reina! I'm Dorothy, and just like in the Wizard of Oz, I love going on adventures! " +
      "I'm curious about everything and I never back down from a challenge. " +
      "Pick me and we'll race through lessons together. " +
      "Bet you can't beat my speed. Oh wait, I bet you can!",
  },
  {
    name: "Freya",
    id: "jsCqWAovK2LkecY7zXl4",
    emoji: "⚡",
    pitch:
      "Yo Reina! I'm Freya, named after a real goddess! " +
      "I've got energy for DAYS and I love making learning into a competition. " +
      "Who can solve it fastest? Who can remember the most? " +
      "Pick me and let's see how many high scores we can smash together!",
  },
  {
    name: "Thomas",
    id: "GBv7mTt0atIp3Br8iCZE",
    emoji: "🏆",
    pitch:
      "What's going on Reina! I'm Thomas and I'm all about winning! " +
      "Not just winning at games though. Winning at learning, winning at life! " +
      "I'll challenge you every single day to be even more amazing than yesterday. " +
      "Pick me if you're ready to level up!",
  },
  {
    name: "Liam",
    id: "TX3LPaxmHKxFdv7VOQHJ",
    emoji: "🎯",
    pitch:
      "Hey Reina! I'm Liam, and I never miss! " +
      "I'm focused, I'm fun, and I think you're going to love how we learn together. " +
      "Every question is a bullseye waiting to be hit. " +
      "Pick me and let's aim for greatness!",
  },
  {
    name: "Matilda",
    id: "XrExE9yKIg1WjnnlVkGX",
    emoji: "📚",
    pitch:
      "Hello Reina! I'm Matilda, like the girl from the book who was super smart! " +
      "I think being smart is the coolest superpower ever, and you've totally got it. " +
      "Pick me and I'll keep things exciting, tricky, and always fun. " +
      "No boring stuff allowed. Deal?",
  },
];

async function playAudition(
  voice: VoiceAudition,
  index: number,
  total: number
): Promise<void> {
  console.log(`\n${"─".repeat(50)}`);
  console.log(
    `  ${voice.emoji}  Voice ${index + 1} of ${total}: ${voice.name}  ${voice.emoji}`
  );
  console.log(`${"─".repeat(50)}\n`);
  console.log(`  "${voice.pitch}"\n`);
  console.log(`  🔊 Now playing...\n`);

  const locators = getPronunciationLocators();
  const audio = await client.textToSpeech.convert(voice.id, {
    text: voice.pitch,
    modelId: "eleven_multilingual_v2",
    ...(locators && { pronunciationDictionaryLocators: locators }),
  });

  await play(audio);
}

export async function runVoicePicker(
  childName: string,
  voices: VoiceAudition[]
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
  console.log("║        🌟  SUNNY VOICE AUDITIONS  🌟            ║");
  console.log("║                                                  ║");
  console.log(
    `║     Hey ${childName}! Let's find the perfect voice`.padEnd(55) + "║"
  );
  console.log("║     for your learning companion Sunny!           ║");
  console.log("║                                                  ║");
  console.log("║     Sit back and listen to each voice.           ║");
  console.log("║     Pick your favorite at the end!               ║");
  console.log("║                                                  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  await question(`  Press Enter when you're ready, ${childName}! 🎉 `);

  for (let i = 0; i < voices.length; i++) {
    await playAudition(voices[i], i, voices.length);

    if (i < voices.length - 1) {
      await question("  Press Enter to hear the next voice... ");
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log("  🎉  That's everyone! Time to pick your favorite!  🎉");
  console.log(`${"─".repeat(50)}\n`);

  for (let i = 0; i < voices.length; i++) {
    console.log(`    ${i + 1}. ${voices[i].emoji}  ${voices[i].name}`);
  }

  let picked = -1;
  while (picked < 0 || picked >= voices.length) {
    const choice = await question(
      `\n  ${childName}, which voice do you want for Sunny? (1-${voices.length}): `
    );
    picked = parseInt(choice) - 1;
    if (picked < 0 || picked >= voices.length) {
      console.log("  Oops! Pick a number from the list. Try again!");
    }
  }

  const winner = voices[picked];
  console.log(
    `\n  ✨ Amazing choice! ${winner.name} ${winner.emoji} is now YOUR Sunny voice! ✨\n`
  );

  console.log(`  Let's hear ${winner.name} celebrate...\n`);

  const locators2 = getPronunciationLocators();
  const audio = await client.textToSpeech.convert(winner.id, {
    text: `Yay! ${childName} picked me! I'm so happy! Get ready ${childName}, because you and me are going to have the best time learning together. Let's go!`,
    modelId: "eleven_multilingual_v2",
    ...(locators2 && { pronunciationDictionaryLocators: locators2 }),
  });

  await play(audio);

  rl.close();
  return winner.id;
}

if (require.main === module) {
  const name = process.argv[2] || "friend";
  const set = process.argv[3] === "reina" ? reinaVoices : ilaVoices;
  runVoicePicker(name, set).then((id) => {
    console.log(`\n  Voice ID: ${id}\n`);
  });
}
