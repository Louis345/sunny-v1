// Curriculum Planner Agent — written by Jamal

import fs from "fs";
import path from "path";
import "dotenv/config";
import { CURRICULUM_PLANNER_PROMPT } from "../prompts";

function loadAttemptHistory(): string {
  const attemptsPath = path.resolve(process.cwd(), "src/logs/ila_attempts.json");
  if (!fs.existsSync(attemptsPath)) return "(no attempt history yet)";

  const lines = fs.readFileSync(attemptsPath, "utf-8").trim().split("\n");
  if (lines.length === 0 || (lines.length === 1 && !lines[0])) return "(no attempt history yet)";

  const byWord: Record<string, { correct: number; incorrect: number }> = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const { word, correct } = JSON.parse(line) as { word: string; correct: boolean };
      const key = word.toLowerCase().trim();
      if (!byWord[key]) byWord[key] = { correct: 0, incorrect: 0 };
      if (correct) byWord[key].correct++;
      else byWord[key].incorrect++;
    } catch {
      // skip malformed lines
    }
  }

  const entries = Object.entries(byWord)
    .sort((a, b) => {
      const totalA = a[1].correct + a[1].incorrect;
      const totalB = b[1].correct + b[1].incorrect;
      return totalB - totalA;
    })
    .map(([word, { correct, incorrect }]) => `- ${word}: ${correct} correct, ${incorrect} incorrect`);

  return entries.length ? entries.join("\n") : "(no attempt history yet)";
}

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

  const attemptHistory = loadAttemptHistory();

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

// Entry point when run directly
curriculumPlanner().catch(console.error);
