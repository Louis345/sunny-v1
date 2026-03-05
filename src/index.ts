import "dotenv/config";
import * as readline from "readline";
import { selectProfile } from "./profiles";
import { setSystemPrompt, ask } from "./sunny";
import { setStreamVoiceId, streamSpeak, PlaybackHandle } from "./stream-speak";

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

async function main(): Promise<void> {
  const profile = await selectProfile();

  setSystemPrompt(profile.systemPrompt);
  setStreamVoiceId(profile.voiceId);

  console.log("──────────────────────────────────────");
  console.log(`  Project Sunny — ${profile.name}'s Session`);
  console.log("  Type a message. Type 'exit' to quit.");
  console.log("  (You can type while Sunny speaks to interrupt!)");
  console.log("──────────────────────────────────────");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let currentPlayback: PlaybackHandle | null = null;

  const prompt = (): void => {
    rl.question(`\n${profile.name}: `, async (input) => {
      const trimmed = input.trim();

      if (!trimmed || trimmed.toLowerCase() === "exit") {
        currentPlayback?.stop();
        console.log(
          `\nSunny: Bye for now, ${profile.name}! You did great today. 💛\n`
        );
        rl.close();
        return;
      }

      if (currentPlayback) {
        currentPlayback.stop();
        currentPlayback = null;
        console.log("  ⏸️  [Sunny stopped to listen]");
      }

      const inputTime = Date.now();
      console.log(`  ⏱️  [${ts()}] STT complete`);

      try {
        console.log("\nSunny is thinking...");
        const response = await ask(trimmed);

        const claudeTime = Date.now();
        console.log(
          `  ⏱️  [${ts()}] Claude responded (${claudeTime - inputTime}ms)`
        );

        console.log(`\nSunny: ${response}\n`);

        const streamStart = Date.now();
        const playback = streamSpeak(response, () => {
          console.log(
            `  ⏱️  [${ts()}] First audio chunk (${Date.now() - streamStart}ms after stream start)`
          );
        });

        currentPlayback = playback;

        playback.done.then(() => {
          const audioEnd = Date.now();
          console.log(
            `  ⏱️  [${ts()}] Audio finished (${audioEnd - claudeTime}ms total playback)`
          );
          if (currentPlayback === playback) {
            currentPlayback = null;
          }
        });
      } catch (err) {
        console.error("Something went wrong:", err);
      }

      prompt();
    });
  };

  prompt();
}

main().catch(console.error);
