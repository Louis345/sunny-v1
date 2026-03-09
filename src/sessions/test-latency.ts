import "dotenv/config";
import { runAgent } from "../agents/conversation/run";
import { ELLI } from "../companions/loader";
import type { ModelMessage } from "ai";

const TEST_MESSAGES = ["hi", "what's 2 plus 2", "tell me a story"];

async function main(): Promise<void> {
  console.log("\n⏱️  Latency test — ELLI profile, no mic/TTS/Deepgram\n");
  console.log("─".repeat(60));

  const history: ModelMessage[] = [];

  for (let i = 0; i < TEST_MESSAGES.length; i++) {
    const msg = TEST_MESSAGES[i];
    console.log(`\n  Turn ${i + 1}: "${msg}"`);

    let firstTokenMs: number | null = null;
    const toolsFired: string[] = [];
    let stepCount = 0;

    const start = Date.now();

    const response = await runAgent({
      history,
      userMessage: msg,
      profile: ELLI,
      onToken: () => {
        if (firstTokenMs === null) {
          firstTokenMs = Date.now() - start;
        }
      },
      onStepFinish: (step) => {
        stepCount++;
        for (const tc of step.toolCalls ?? []) {
          const name = (tc as { toolName?: string }).toolName;
          if (name) toolsFired.push(name);
        }
      },
      quiet: true,
    });

    const totalMs = Date.now() - start;

    history.push({ role: "user", content: msg });
    history.push({ role: "assistant", content: response });

    console.log(`\n  📊 Timing:`);
    console.log(`     First token: ${firstTokenMs ?? "—"} ms`);
    console.log(`     Total:       ${totalMs} ms`);
    console.log(`     Steps:      ${stepCount}`);
    console.log(`     Tools:      ${toolsFired.length > 0 ? toolsFired.join(", ") : "none"}`);
    console.log(`     Response:   ${response.slice(0, 80)}${response.length > 80 ? "…" : ""}`);
    console.log("─".repeat(60));
  }

  console.log("\n  ✅ Done.\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
