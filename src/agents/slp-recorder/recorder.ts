import type { ModelMessage } from "ai";
import { readSoul, SLP_PROMPT } from "../prompts";
import { appendToContext } from "../../utils/appendToContext";
import { runPsychologist } from "../psychologist/psychologist";
import { shouldPersistSessionData } from "../../utils/runtimeMode";

function summarizerSystemPrompt(childName: "Ila" | "Reina"): string {
  const soul = readSoul(childName.toLowerCase());
  if (childName === "Ila") {
    return SLP_PROMPT(childName, soul);
  }
  return `
You are a learning coach documenting sessions with ${childName}.
Here is her complete profile:
${soul}
Format: Engagement / Wins / Watch

`;
}

export async function recordSession(
  history: ModelMessage[],
  childName: "Ila" | "Reina" | "creator",
): Promise<void> {
  if (!shouldPersistSessionData()) {
    console.log("\n  💾 Stateless run — skipping session memory save.");
    return;
  }

  if (childName === "creator") {
    console.log(
      "\n  🔇 Creator/diagnostic session — skipping SLP context append and psychologist.",
    );
    return;
  }

  console.log("\n  💾 Saving session memory...");

  const { generateText } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");

  const { text: summary } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: summarizerSystemPrompt(childName),
    prompt: history.map((m) => `${m.role}: ${m.content}`).join("\n"),
    maxOutputTokens: 600,
  });

  await appendToContext(childName, "Session", summary);
  await runPsychologist(childName);
}
