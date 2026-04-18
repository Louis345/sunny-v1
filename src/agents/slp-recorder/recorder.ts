import type { ModelMessage } from "ai";
import { getReinaLearningPrompt, getSLPSystemIla } from "../prompts";
import { appendToContext } from "../../utils/appendToContext";
import { runPsychologist } from "../psychologist/psychologist";
import { shouldPersistSessionData } from "../../utils/runtimeMode";

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
    system: childName === "Ila" ? getSLPSystemIla() : getReinaLearningPrompt(),
    prompt: history.map((m) => `${m.role}: ${m.content}`).join("\n"),
    maxOutputTokens: 600,
  });

  await appendToContext(childName, "Session", summary);
  await runPsychologist(childName);
}
