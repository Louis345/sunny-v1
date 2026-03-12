import type { ModelMessage } from "ai";
import { SLP_PROMPT, REINA_LEARNING_PROMPT } from "../prompts";
import { appendToContext } from "../../utils/appendToContext";
import { runPsychologist } from "../psychologist/psychologist";

export async function recordSession(
  history: ModelMessage[],
  childName: "Ila" | "Reina",
): Promise<void> {
  console.log("\n  💾 Saving session memory...");

  const { generateText } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");

  const { text: summary } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: childName === "Ila" ? SLP_PROMPT : REINA_LEARNING_PROMPT,
    prompt: history.map((m) => `${m.role}: ${m.content}`).join("\n"),
    maxOutputTokens: 600,
  });

  await appendToContext(childName, "Session", summary);
  await runPsychologist(childName);
}
