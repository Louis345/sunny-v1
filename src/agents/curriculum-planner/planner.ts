// Curriculum Planner Agent — written by Jamal

import fs from "fs";
import path from "path";
import "dotenv/config";
import { CURRICULUM_PLANNER_PROMPT } from "../prompts";
import { loadAttemptHistory } from "../../utils/attempts";

export async function curriculumPlanner(): Promise<void> {
  const { generateText } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");

  const ilaContext = fs.readFileSync(
    path.resolve(process.cwd(), "src/context/ila_context.md"),
    "utf-8",
  );

  const ilaCurriculum = fs.readFileSync(
    path.resolve(process.cwd(), "src/curriculum/ila_curriculum.md"),
    "utf-8",
  );

  const attemptHistory = loadAttemptHistory("Ila");

  const { text: curriculum } = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: CURRICULUM_PLANNER_PROMPT,
    prompt: `
Current session notes:
${ilaContext}

Word attempt history (correct vs incorrect per word):
${attemptHistory}

Do not repeat words with 3+ correct attempts. Focus new sessions on words with errors or no attempts yet.

Current curriculum:
${ilaCurriculum}

Generate the updated curriculum plan.
    `,
    maxOutputTokens: 1000,
  });

  const filePath = path.resolve(
    process.cwd(),
    "src/curriculum/ila_curriculum.md",
  );
  await fs.promises.writeFile(filePath, curriculum, "utf-8");
  console.log("✅ Curriculum updated → src/curriculum/ila_curriculum.md");
}

// Entry point when run directly (not when imported)
if (require.main === module) {
  curriculumPlanner().catch(console.error);
}
