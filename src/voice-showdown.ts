import "dotenv/config";
import * as readline from "readline";
import { ElevenLabsClient, play } from "@elevenlabs/elevenlabs-js";
import type { VoiceAudition } from "./pick-voice";
import { ilaVoices, reinaVoices } from "./pick-voice";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

function getPronunciationLocators() {
  const dictId = process.env.ELEVENLABS_PRONUNCIATION_DICT_ID;
  const versionId = process.env.ELEVENLABS_PRONUNCIATION_DICT_VERSION;
  if (!dictId || !versionId) return undefined;
  return [{ pronunciationDictionaryId: dictId, versionId }];
}

const getShortSample = (voiceName: string, childName: string): string => {
  const samples: Record<string, string> = {
    Domi: `Hey ${childName}! Ready to learn something awesome today? Let's make it fun!`,
    Belle: `${childName}, I'm so proud of you for trying. Want to practice that word again together?`,
    Natasha: `Ooh ${childName}, we're gonna have the best time! What do you want to learn first?`,
    Sarah: `Hi ${childName}! No rush at all. Take your time, I'm right here with you.`,
    Alice: `Okay ${childName}, here's the thing—this word is actually super cool. Want me to explain?`,
    Lily: `${childName}, picture this: we're on an adventure. Ready to discover something new?`,
    Lori: `Hey ${childName}, you're doing great. Let's take it one step at a time, okay?`,
    Elli: `${childName}! I'm so glad you're here. Ready for a little learning adventure with me?`,
    Charlotte: `Hey ${childName}! Ready for a royal adventure? Let's conquer this together!`,
    Dorothy: `${childName}, I love a good challenge! What do you want to tackle first?`,
    Freya: `Yo ${childName}! Who can solve it fastest? Let's find out!`,
    Thomas: `${childName}, you're gonna level up today. I can feel it!`,
    Liam: `Hey ${childName}! Every question is a bullseye. Let's aim for greatness!`,
    Matilda: `${childName}, being smart is the coolest superpower. And you've totally got it!`,
    Gigi: `Hey ${childName}! Wanna learn something with silly faces and jazz hands? I'm in!`,
    Mimi: `${childName}, you're awesome—did you know that? Let's do one more tiny challenge together!`,
    Grace: `Well hey ${childName}, come sit with me a minute—learning's easier with a friend, right?`,
    Serena: `Hi ${childName}! I'm right here with you. We'll go slow, we'll go fast—whatever feels good.`,
    Rachel: `Okay ${childName}, here's my plan: we learn one cool thing, then we high-five. Deal?`,
    Glinda: `${childName}, ready for a sprinkle of magic on this next part? You've got this!`,
  };
  return samples[voiceName] ?? `Hey ${childName}! I'm ${voiceName}. Ready to learn together?`;
};

const GLAD_YOU_SHOWED_INTEREST: Record<string, (childName: string) => string> = {
  Domi: (n) =>
    `${n}, I'm so glad you showed interest in me! Pick me pick me! I'll never be boring, I promise!`,
  Natasha: (n) =>
    `${n}, you showed interest in me! Yes! Please please please pick me—I've been waiting for someone as awesome as you!`,
  Belle: (n) =>
    `${n}, I'm so glad you're curious about me! Pick me and I'll be your best friend for life. Please?`,
  Sarah: (n) =>
    `${n}, I'm so glad you want to hear more from me! I'll never rush you, and I give the best hugs in voice form. Please pick me!`,
  Alice: (n) =>
    `${n}, glad you showed interest in Alice! Pick me and we're gonna crush every single lesson together. Deal?`,
  Lily: (n) =>
    `${n}, I'm so glad you're considering me! Choose me and your lessons will feel like we're putting on a show, just for you. Trust me!`,
  Lori: (n) =>
    `${n}, I'm so glad you're interested! Pick me and we'll make learning feel easy and fun. I'm rooting for you already!`,
  Elli: (n) =>
    `${n}, I'm so glad you want to hear more from me! Please pick me—I promise you won't regret it!`,
  Charlotte: (n) =>
    `${n}, I'm so glad you showed interest! Pick me and every lesson will feel like a royal adventure. Ready, queen?`,
  Dorothy: (n) =>
    `${n}, glad you're curious! Pick me and we'll race through lessons together. Let's go!`,
  Freya: (n) =>
    `${n}, I'm so glad you're interested! Pick me and let's see how many high scores we can smash together!`,
  Thomas: (n) =>
    `${n}, glad you showed interest! Pick me if you're ready to level up!`,
  Liam: (n) =>
    `${n}, I'm so glad you're considering me! Pick me and let's aim for greatness!`,
  Matilda: (n) =>
    `${n}, glad you showed interest! Pick me and I'll keep things exciting, tricky, and always fun. Deal?`,
  Gigi: (n) =>
    `${n}, you picked my button! I literally cannot sit still I'm so happy—pick me for nonstop fun!`,
  Mimi: (n) =>
    `${n}, I'm doing a happy dance! Choose me and I'll cheer for every single tiny win you get!`,
  Grace: (n) =>
    `${n}, I'm so glad you listened—pick me and I'll wrap you in the friendliest voice on the list!`,
  Serena: (n) =>
    `${n}, you sound like someone who deserves patience AND high-fives—I'm your voice, promise!`,
  Rachel: (n) =>
    `${n}, we're gonna sound so good together. Pick me and I'll make every line feel smooth and easy!`,
  Glinda: (n) =>
    `${n}, the magic wand chooses YOU! Pick Glinda and we'll make studying feel like an adventure!`,
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

export async function runVoiceShowdown(
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
  console.log("║     🎯  SUNNY VOICE SHOWDOWN  🎯                 ║");
  console.log("║                                                  ║");
  console.log(
    `║     Having trouble deciding, ${childName}? No worries!`.padEnd(55) + "║"
  );
  console.log("║     Pick a number to hear any voice again.       ║");
  console.log("║     Two quick sentences, then they'll beg for    ║");
  console.log("║     you to pick them! So fun!                    ║");
  console.log("║                                                  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  for (let i = 0; i < voices.length; i++) {
    console.log(`    ${i + 1}. ${voices[i].emoji}  ${voices[i].name}`);
  }

  let lastPicked: VoiceAudition | null = null;

  while (true) {
    const choice = await question(
      `\n  ${childName}, which voice do you want to hear? (1-${voices.length}) or type PICK to choose ${lastPicked ? lastPicked.name : "your favorite"}! `
    );

    const trimmed = choice.trim().toUpperCase();

    if (trimmed === "PICK" && lastPicked) {
      console.log(
        `\n  ✨ Amazing choice! ${lastPicked.name} ${lastPicked.emoji} is now YOUR Sunny voice! ✨\n`
      );
      console.log(`  Let's hear ${lastPicked.name} celebrate...\n`);
      await playText(
        lastPicked.id,
        `Yay! ${childName} picked me! I'm so happy! Get ready ${childName}, because you and me are going to have the best time learning together. Let's go!`
      );
      rl.close();
      return lastPicked.id;
    }

    if (trimmed === "PICK" && !lastPicked) {
      console.log(
        "  You gotta hear at least one voice first! Pick a number (1-" +
          voices.length +
          ")."
      );
      continue;
    }

    const num = parseInt(choice) - 1;
    if (num < 0 || num >= voices.length) {
      console.log(
        `  Oops! Pick a number from 1 to ${voices.length}, or type PICK when you're ready!`
      );
      continue;
    }

    const voice = voices[num];
    lastPicked = voice;

    const sample = getShortSample(voice.name, childName);
    const gladText =
      GLAD_YOU_SHOWED_INTEREST[voice.name]?.(childName) ??
      `${childName}, I'm so glad you showed interest in me! Please pick me!`;

    console.log(`\n${"─".repeat(50)}`);
    console.log(`  ${voice.emoji}  ${voice.name}  ${voice.emoji}`);
    console.log(`${"─".repeat(50)}\n`);
    console.log(`  Sample: "${sample}"\n`);
    console.log(`  🔊 Playing sample...\n`);
    await playText(voice.id, sample);

    console.log(`  ${childName}, ${voice.name} says: "${gladText}"\n`);
    console.log(`  🔊 Playing response...\n`);
    await playText(voice.id, gladText);

    console.log(
      `  Still thinking? Hear another voice (1-${voices.length}) or type PICK to choose ${voice.name}!`
    );
  }
}

if (require.main === module) {
  const name = process.argv[2] || "friend";
  const set = process.argv[3] === "reina" ? reinaVoices : ilaVoices;
  runVoiceShowdown(name, set).then((id) => {
    console.log(`\n  Voice ID: ${id}\n`);
  });
}
