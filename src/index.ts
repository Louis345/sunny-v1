import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import * as readline from "readline";
import { selectProfile, type Profile } from "./profiles";
import { runAgent } from "./agents/elli/run";
import {
  setStreamVoiceId,
  createLiveStream,
  PlaybackHandle,
} from "./stream-speak";

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

async function main(): Promise<void> {
  const profile = await selectProfile();

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

  const history: Anthropic.MessageParam[] = [];
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

      const claudeStart = Date.now();
      console.log(`  ⏱️  [${ts()}] Input received`);

      try {
        const tts = createLiveStream(() => {
          console.log(
            `  ⏱️  [${ts()}] First audio (${Date.now() - claudeStart}ms from input)`
          );
        });

        currentPlayback = tts;

        const response = await runAgent({
          history,
          userMessage: trimmed,
          profile,
          onToken: (token) => tts.sendText(token),
        });

        history.push({ role: "user", content: trimmed });
        history.push({ role: "assistant", content: response });
        tts.finish();

        const claudeMs = Date.now() - claudeStart;
        console.log(
          `  ⏱️  [${ts()}] Claude done streaming (${claudeMs}ms)`
        );
        console.log(`\nSunny: ${response}\n`);

        tts.done.then(() => {
          console.log(`  ⏱️  [${ts()}] Audio finished`);
          if (currentPlayback === tts) {
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
