// Curriculum Planner Agent — written by Jamal

import fs from "fs";
import path from "path";
import "dotenv/config";
import { CURRICULUM_PLANNER_PROMPT } from "../prompts";

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

  const { text: curriculum } = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: CURRICULUM_PLANNER_PROMPT,
    prompt: `
Current session notes:
${ilaContext}

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

// Entry point when run directly
curriculumPlanner().catch(console.error);
