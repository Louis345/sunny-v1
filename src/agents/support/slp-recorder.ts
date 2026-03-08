import path from "path";
import fs from "fs";
import type { ModelMessage } from "ai";
import { SLP_PROMPT, REINA_LEARNING_PROMPT } from "../prompts";

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

  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  const entry = `\n\n## Session — ${timestamp}\n${summary}`;

  const fileName = childName === "Ila" ? "ila_context.md" : "reina_context.md";
  const filePath = path.resolve(process.cwd(), "src", "context", fileName);
  await fs.promises.appendFile(filePath, entry, "utf-8");

  console.log(`  ✅ Session saved to ${fileName}`);
}
