// Curriculum Planner Agent — written by Jamal

import fs from "fs";
import path from "path";
import "dotenv/config";
import { buildCurriculumPlannerPrompt } from "../prompts";
import { loadAttemptHistory } from "../../utils/attempts";
import { shouldLoadPersistedHistory } from "../../utils/runtimeMode";
import {
  resolveContextFilePath,
  resolveCurriculumFilePath,
} from "../../utils/childContextPaths";

export async function curriculumPlanner(
  childName: "Ila" | "Reina" = "Ila"
): Promise<void> {
  const { generateText } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");

  const contextPath = resolveContextFilePath(childName);
  const curriculumPath = resolveCurriculumFilePath(childName);

  const context = shouldLoadPersistedHistory()
    ? fs.readFileSync(contextPath, "utf-8")
    : "(stateless run — persisted context not loaded)";
  const curriculum = fs.readFileSync(curriculumPath, "utf-8");
  const attemptHistory = loadAttemptHistory(childName);

  const { text: updatedCurriculum } = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: buildCurriculumPlannerPrompt(childName),
    prompt: `
Current session notes:
${context}

Word attempt history (correct vs incorrect per word):
${attemptHistory}

Do not repeat words with 3+ correct attempts. Focus new sessions on words with errors or no attempts yet.

Current curriculum:
${curriculum}

Generate the updated curriculum plan.
    `,
    maxOutputTokens: 1000,
  });

  await fs.promises.writeFile(curriculumPath, updatedCurriculum, "utf-8");
  console.log(
    `✅ Curriculum updated → ${path.relative(process.cwd(), curriculumPath)}`,
  );
}

// Entry point when run directly (not when imported)
if (require.main === module) {
  const childArg = process.argv[2]?.toLowerCase();
  const childName = childArg === "reina" ? "Reina" : "Ila";
  curriculumPlanner(childName).catch(console.error);
}
