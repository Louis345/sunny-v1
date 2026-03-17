import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { PSYCHOLOGIST_PROMPT, PSYCHOLOGIST_CONTEXT } from "../prompts";
import { loadChildFiles } from "../../utils/loadChildFiles";
import { appendToContext } from "../../utils/appendToContext";
import { querySessions, flagGap } from "./tools";
import { curriculumPlanner } from "../curriculum-planner/planner";
import { runTranslator } from "../translator/translator";

export async function runPsychologist(
  childName: "Ila" | "Reina",
  dryRun = false,
): Promise<void> {
  console.log("runPsychologist called with dryRun:", dryRun);
  const { context, curriculum, attempts } = loadChildFiles(childName);

  const prompt = PSYCHOLOGIST_CONTEXT(context, attempts, curriculum);

  const tools = { querySessions, flagGap };
  console.log("Tools registered:", Object.keys(tools));

  const { text, steps } = await generateText({
    model: anthropic("claude-sonnet-4-5"),
    system: PSYCHOLOGIST_PROMPT(childName),
    prompt,
    tools,
    stopWhen: stepCountIs(10),
    maxOutputTokens: 1500,
    onStepFinish: (step) => {
      console.log(
        "Step:",
        step.finishReason,
        step.toolCalls?.length ?? 0,
        "tool calls",
      );
    },
  });

  console.log("Full steps count:", steps?.length ?? 0);
  console.log("Full text length:", text.length);
  console.log("Full text:", text);

  if (dryRun) {
    console.log("\n--- Psychologist Report (dry run) ---\n");
    console.log(text);
    console.log("\n--- End Report ---\n");
  } else {
    await appendToContext(childName, "Psychologist Report", text);
    await runTranslator(childName, text);
  }

  if (text.includes("ADVANCE") && !dryRun) {
    await curriculumPlanner(childName);
  }
}
