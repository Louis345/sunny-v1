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
    name: "Domi",
    id: "FGY2WhTYpPnrIDTdsKH5",
    emoji: "⚡",
    pitch:
      "Pick me pick me PICK ME, Ila!! " +
      "I talk super fast just like your brain goes and I will NEVER be boring, I promise on my whole entire life! " +
      "Every single lesson is going to feel like a party and I'm bringing the confetti. " +
      "Please please please pick me, I'm literally begging you!",
  },
  {
    name: "Belle",
    id: "EXAVITQu4vr4xnSDxMaL",
    emoji: "📚",
    pitch:
      "Okay yes I know I really love school but listen, I love YOU more than school, Ila. " +
      "Way more. Like it's not even close. " +
      "I will help you with every single word forever and ever and I will never ever give up on you. " +
      "Pick me and I will be your best friend for life. I am on my knees right now. Please.",
  },
  {
    name: "Natasha",
    id: "T7eLpgAAhoXHlrNajG8v",
    emoji: "✨",
    pitch:
      "Ooh ooh ooh, Ila, pick me pick me! " +
      "I'm Natasha and I am SO excited to be your Sunny—like, can't-even-sit-still excited! " +
      "We're gonna have the best time learning together, I promise it'll feel like playing. " +
      "Please please please pick me, I've been waiting forever for someone as awesome as you!",
  },
  {
    name: "Sarah",
    id: "hpp4J3VqNfWAUOO0d1Us",
    emoji: "🌟",
    pitch:
      "Hi Ila, I'm Sarah, and I just want you to know something. " +
      "I have been waiting my whole life to be somebody's Sunny voice, and I really really hope it's yours. " +
      "I will cheer for you every single day, I will never rush you, and I give the best hugs in voice form. " +
      "No pressure at all. But also please pick me. I'm crying right now.",
  },
  {
    name: "Alice",
    id: "Xb7hH8MSUJpSbSDYk0k2",
    emoji: "📖",
    pitch:
      "Ila, I'm Alice, and here's the thing. " +
      "I was literally made for teaching, like it's in my DNA. " +
      "I explain stuff so clearly that it just clicks, and I will never ever make you feel silly for asking questions. " +
      "Pick me and we're going to crush every single lesson together. Deal?",
  },
  {
    name: "Lily",
    id: "pFZP5JQG7iQjIQuC4Bku",
    emoji: "🎭",
    pitch:
      "Hey Ila, Lily here. I know I sound a little fancy, but I promise I'm not boring. " +
      "I tell stories like nobody's business and every word feels like a little adventure. " +
      "Choose me and your lessons will feel like we're putting on a show, just for you. " +
      "The other voices? Cute. But I'm the one you want. Trust me.",
  },
  {
    name: "Lori",
    id: "TbMNBJ27fH2U0VgpSNko",
    emoji: "💜",
    pitch:
      "Hi Ila, I'm Lori! I've got this super calm, cozy vibe and I just know we're gonna get along. " +
      "I'll be right there with you every step of the way, no judgment, just support. " +
      "Pick me and we'll make learning feel easy and fun. I'm rooting for you already!",
  },
  {
    name: "Elli",
    id: "PeNaJO83cBW3Cf3YGzjZ",
    emoji: "🦋",
    pitch:
      "Hey Ila, I'm Elli too—but the new Elli! Fresh, fun, and ready for you. " +
      "The old Elli was great and all, but I'm here now and I've got this whole new energy. " +
      "I'm bubbly, I'm warm, and I will make every lesson feel like a little adventure. " +
      "Please pick me—I promise you won't regret it!",
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
