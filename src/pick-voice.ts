import "dotenv/config";
import * as readline from "readline";
import { ElevenLabsClient, play } from "@elevenlabs/elevenlabs-js";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

interface VoiceAudition {
  name: string;
  id: string;
  emoji: string;
  pitch: string;
}

const auditions: VoiceAudition[] = [
  {
    name: "Rachel",
    id: "21m00Tcm4TlvDq8ikWAM",
    emoji: "🌸",
    pitch:
      "Hey iLa! I'm Rachel, and I'd love to be your Sunny voice. " +
      "I'm calm and warm, kind of like a cozy blanket on a rainy day. " +
      "We could learn amazing things together, and I promise to always cheer you on. " +
      "Pick me and every lesson will feel like a hug!",
  },
  {
    name: "Bella",
    id: "EXAVITQu4vr4xnSDxMaL",
    emoji: "🦋",
    pitch:
      "Hi there iLa! My name is Bella! " +
      "I'm sweet and gentle, like a butterfly landing on your shoulder. " +
      "I love telling stories and making learning feel like an adventure. " +
      "If you pick me, I'll be your best study buddy ever. Pinky promise!",
  },
  {
    name: "Elli",
    id: "MF3mGyEYCl7XYWbV9V6O",
    emoji: "⭐",
    pitch:
      "Oh my gosh, iLa! I'm Elli and I am SO excited to meet you! " +
      "I've got tons of energy and I love to have fun while we learn. " +
      "Math, science, reading, you name it, we'll crush it together! " +
      "Pick me and I'll make every single day feel like a gold star day!",
  },
  {
    name: "Josh",
    id: "TxGEqnHWrfWFTfGW9XjX",
    emoji: "🚀",
    pitch:
      "What's up iLa! I'm Josh, and I'm like a friendly big brother. " +
      "I've got a deep voice but a big heart, and I think learning should feel like a rocket ship ride. " +
      "Three, two, one, blastoff into knowledge! " +
      "Pick me and we'll explore the whole universe together!",
  },
  {
    name: "Adam",
    id: "pNInz6obpgDQGcFmaJgB",
    emoji: "🎙️",
    pitch:
      "Hello iLa! I'm Adam, and my voice is smooth like a radio host. " +
      "I'll make every lesson sound super cool and important, because YOU are super cool and important. " +
      "If you pick me, learning will feel like listening to your favorite show. " +
      "So what do you say, ready to tune in?",
  },
  {
    name: "Sam",
    id: "yoZ06aMxZJJ28mfd3POQ",
    emoji: "🎈",
    pitch:
      "Hey hey hey, iLa! I'm Sam! " +
      "I'm fun, I'm friendly, and I think eight year olds are the coolest people on the planet. " +
      "With me as your Sunny voice, every day is a party where we learn awesome stuff. " +
      "Pick me and let's go on the wildest learning adventure ever!",
  },
];

async function playAudition(voice: VoiceAudition, index: number): Promise<void> {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`  ${voice.emoji}  Voice ${index + 1} of ${auditions.length}: ${voice.name}  ${voice.emoji}`);
  console.log(`${"─".repeat(50)}\n`);
  console.log(`  "${voice.pitch}"\n`);
  console.log(`  🔊 Now playing...\n`);

  const audio = await client.textToSpeech.convert(voice.id, {
    text: voice.pitch,
    modelId: "eleven_multilingual_v2",
  });

  await play(audio);
}

async function main(): Promise<void> {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║                                                  ║");
  console.log("║     🌟  SUNNY VOICE AUDITIONS  🌟               ║");
  console.log("║                                                  ║");
  console.log("║     Hey iLa! Let's find the perfect voice        ║");
  console.log("║     for your learning companion Sunny!           ║");
  console.log("║                                                  ║");
  console.log("║     Sit back and listen to each voice.           ║");
  console.log("║     Pick your favorite at the end!               ║");
  console.log("║                                                  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  await question("  Press Enter when you're ready, iLa! 🎉 ");

  for (let i = 0; i < auditions.length; i++) {
    await playAudition(auditions[i], i);

    if (i < auditions.length - 1) {
      await question("  Press Enter to hear the next voice... ");
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log("  🎉  That's everyone! Time to pick your favorite!  🎉");
  console.log(`${"─".repeat(50)}\n`);

  for (let i = 0; i < auditions.length; i++) {
    console.log(`    ${i + 1}. ${auditions[i].emoji}  ${auditions[i].name}`);
  }

  const choice = await question("\n  iLa, which voice do you want for Sunny? (1-6): ");
  const picked = parseInt(choice) - 1;

  if (picked >= 0 && picked < auditions.length) {
    const winner = auditions[picked];
    console.log(`\n  ✨ Amazing choice! ${winner.name} ${winner.emoji} is now Sunny's voice! ✨\n`);
    console.log(`  Update your .env file with:`);
    console.log(`  ELEVENLABS_VOICE_ID=${winner.id}\n`);

    console.log(`  Let's hear ${winner.name} say one more thing...\n`);

    const audio = await client.textToSpeech.convert(winner.id, {
      text: `Yay! iLa picked me! I'm so happy! Get ready iLa, because you and me are going to have the best time learning together. Let's go!`,
      modelId: "eleven_multilingual_v2",
    });

    await play(audio);
  } else {
    console.log("\n  Hmm, that wasn't one of the choices. Run me again to try! 💛\n");
  }

  rl.close();
}

main().catch(console.error);
