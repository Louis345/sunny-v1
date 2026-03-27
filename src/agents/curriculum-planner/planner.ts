// Curriculum Planner Agent — written by Jamal

import fs from "fs";
import path from "path";
import "dotenv/config";
import { CURRICULUM_PLANNER_PROMPT } from "../prompts";
import { loadAttemptHistory } from "../../utils/attempts";
import { shouldLoadPersistedHistory } from "../../utils/runtimeMode";

export async function curriculumPlanner(
  childName: "Ila" | "Reina" = "Ila"
): Promise<void> {
  const { generateText } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");

  const contextFile =
    childName === "Reina" ? "reina_context.md" : "ila_context.md";
  const curriculumFile =
    childName === "Reina" ? "reina_curriculum.md" : "ila_curriculum.md";

  const contextPath = path.resolve(process.cwd(), "src", "context", contextFile);
  const curriculumPath = path.resolve(
    process.cwd(),
    "src",
    "curriculum",
    curriculumFile,
  );

  const context = shouldLoadPersistedHistory()
    ? fs.readFileSync(contextPath, "utf-8")
    : "(stateless run — persisted context not loaded)";
  const curriculum = fs.readFileSync(curriculumPath, "utf-8");
  const attemptHistory = loadAttemptHistory(childName);

  const { text: updatedCurriculum } = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: CURRICULUM_PLANNER_PROMPT,
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
  console.log(`✅ Curriculum updated → src/curriculum/${curriculumFile}`);
}

// Entry point when run directly (not when imported)
if (require.main === module) {
  const childArg = process.argv[2]?.toLowerCase();
  const childName = childArg === "reina" ? "Reina" : "Ila";
  curriculumPlanner(childName).catch(console.error);
}
