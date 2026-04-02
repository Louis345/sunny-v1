import fs from "fs";
import path from "path";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { buildPsychologistContext, readNatalieContext } from "./natalie-context";
import {
  childContextFolder,
  resolveTodaysPlanJsonPath,
} from "../../utils/childContextPaths";
import type { ChildName } from "../../utils/childContextPaths";
import {
  shouldLoadPersistedHistory,
  shouldPersistSessionData,
} from "../../utils/runtimeMode";

export const todaysPlanActivitySchema = z.object({
  activity: z.string(),
  priority: z.number(),
  required: z.boolean(),
  reason: z.string(),
  timeboxMinutes: z.number(),
  method: z.string().optional(),
  source: z.string().optional(),
  words: z.array(z.string()).optional(),
  probeSequence: z.array(z.string()).optional(),
  skipConditions: z.array(z.string()).optional(),
  minimumWords: z.number().optional(),
});

export const psychologistStructuredOutputSchema = z.object({
  todaysPlan: z.array(todaysPlanActivitySchema),
  childProfile: z.string(),
  stopAfter: z.string(),
  rewardPolicy: z.string(),
});

export type TodaysPlanActivity = z.infer<typeof todaysPlanActivitySchema>;
export type PsychologistStructuredOutput = z.infer<
  typeof psychologistStructuredOutputSchema
>;

export function assertTodaysPlanInvariants(plan: TodaysPlanActivity[]): void {
  if (plan.filter((a) => a.required).length < 1) {
    throw new Error("todaysPlan must include at least one required activity");
  }
  for (const a of plan) {
    if (a.required && a.skipConditions != null && a.skipConditions.length > 0) {
      throw new Error(
        "skipConditions may only appear on activities with required: false",
      );
    }
  }
}

function loadSoulSnippet(childName: "Ila" | "Reina", maxChars: number): string {
  const base = childName === "Ila" ? "ila.md" : "reina.md";
  const full = fs.readFileSync(
    path.resolve(process.cwd(), "src", "souls", base),
    "utf-8",
  );
  return full.slice(0, maxChars);
}

function planSystemPrompt(
  childName: "Ila" | "Reina",
  hasNatalieNotes: boolean,
): string {
  const natalie = hasNatalieNotes
    ? `
The user message may include a "Clinical Sessions (Licensed SLP)" block from src/context/${childContextFolder(childName)}/natalie/.
When filling todaysPlan:
1. Adopt methods Natalie validated where they apply.
2. Flag contradictions with your own reading of the other evidence.
3. Put the note or technique reference in the activity method field when you relied on it.
4. Her clinical judgment overrides your inference on this child's targets relative to that block.
`
    : "";

  return `You are the School Psychologist planning today's tutoring session for ${childName}.
Use ONLY the evidence in the user message. Output MUST match the structured schema (todaysPlan, childProfile, stopAfter, rewardPolicy).

todaysPlan rules:
- 3–8 activities; each needs activity, priority (1 = highest), required, reason, timeboxMinutes.
- At least one activity must have required: true.
- skipConditions: only on activities where required is false; omit skipConditions on required activities.
- Optional fields: method, source, words, probeSequence, skipConditions, minimumWords — include only when useful.

childProfile: personality + learning style for the tutor (plain language).
stopAfter: when to end the session naturally.
rewardPolicy: when games or breaks fit this child.
${natalie}
Plan the same way for any child; vary conclusions only from evidence, not from the name.`.trim();
}

export function readPersistedTodaysPlan(
  childName: ChildName,
  filePath?: string,
): PsychologistStructuredOutput | null {
  if (!filePath && !shouldLoadPersistedHistory()) {
    return null;
  }
  const p = filePath ?? resolveTodaysPlanJsonPath(childName);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as unknown;
    const parsed = psychologistStructuredOutputSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writePersistedTodaysPlan(
  childName: ChildName,
  data: PsychologistStructuredOutput,
  filePath?: string,
): void {
  if (!filePath && !shouldPersistSessionData()) {
    return;
  }
  const p = filePath ?? resolveTodaysPlanJsonPath(childName);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
  console.log(`  🎮 [today-plan] wrote ${path.basename(p)}`);
}

/**
 * Produces a structured care plan from on-disk context (no tool loop).
 * Calls the model — mock \`generateObject\` in tests without a key.
 */
export async function buildTodaysPlan(
  childName: "Ila" | "Reina",
): Promise<PsychologistStructuredOutput> {
  const slug = childName === "Ila" ? "ila" : "reina";
  const hasNatalie = readNatalieContext(slug) !== null;
  const evidence = buildPsychologistContext(slug);
  const soul = loadSoulSnippet(childName, 14_000);
  const prompt = `## Evaluation profile\n${soul}\n\n${evidence}`;

  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-5"),
    schema: psychologistStructuredOutputSchema,
    system: planSystemPrompt(childName, hasNatalie),
    prompt,
  });

  assertTodaysPlanInvariants(object.todaysPlan);
  writePersistedTodaysPlan(childName, object);
  return object;
}
