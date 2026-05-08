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
import { readLearningProfile } from "../../utils/learningProfileIO";
import type { LearningProfile } from "../../context/schemas/learningProfile";

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
export type TodaysPlanningMode = "review" | "homework";

export function assertTodaysPlanInvariants(plan: TodaysPlanActivity[]): void {
  if (plan.filter((a) => a.required).length < 1) {
    throw new Error("todaysPlan must include at least one required activity");
  }
  for (const activity of plan) {
    if (activity.required !== false && activity.skipConditions) {
      delete activity.skipConditions;
    }
  }
}

function loadSoulSnippet(childName: "Ila" | "Reina", maxChars: number): string {
  const folder = childName === "Ila" ? "ila" : "reina";
  const full = fs.readFileSync(
    path.resolve(process.cwd(), "src", "context", folder, "soul.md"),
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
- If the evidence includes active pending homework, the first required activity must directly target that assignment's domain/topic before broader probe targets.
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

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pendingHomeworkAnchorActivity(
  pendingHomework: LearningProfile["pendingHomework"] | undefined,
): TodaysPlanActivity | null {
  if (!pendingHomework) return null;
  const captured = pendingHomework.capturedContent ?? null;
  const profile = pendingHomework.contentProfile ?? captured?.contentProfile ?? null;
  if (!captured && !profile && pendingHomework.wordList.length === 0) return null;

  const topic = profile?.topic?.trim() || captured?.title?.trim() || "homework";
  const title = captured?.title?.trim() || titleCase(topic);
  const practiceDomain = profile?.practiceDomain ?? captured?.type ?? "generic";
  const concepts = profile?.concepts ?? [];
  const words = pendingHomework.wordList.length > 0 ? pendingHomework.wordList : concepts;
  const academicFocus =
    concepts.length > 0 ? concepts.slice(0, 4).join(", ") : topic;
  const activityPrefix =
    practiceDomain === "math"
      ? "Homework Math"
      : practiceDomain === "spelling"
        ? "Homework Spelling"
        : "Homework Reading";

  return {
    activity: `${activityPrefix} – ${titleCase(topic)}`,
    priority: 1,
    required: true,
    reason: `Active uploaded homework is "${title}", so today's required work must anchor on ${academicFocus} before broader profile goals.`,
    timeboxMinutes: practiceDomain === "spelling" ? 8 : 12,
    method:
      practiceDomain === "math"
        ? "Solve assignment-aligned examples first, then use profile motivators only as framing."
        : "Read the assignment-aligned content, ask evidence-based checks, then use profile motivators only as framing.",
    source: "pendingHomework",
    words: words.length > 0 ? words : undefined,
    probeSequence:
      practiceDomain === "math"
        ? ["Identify the problem type", "Solve one together", "Explain the strategy"]
        : [
            "Read or preview the assignment content",
            "Ask what changed or happened",
            "Ask why it happened using text evidence",
            "Have the child explain the concept back",
          ],
  };
}

type PendingHomeworkNode = NonNullable<
  LearningProfile["pendingHomework"]
>["nodes"][number] & {
  carePlan?: {
    role?: string;
    targetSkills?: string[];
    targetConcepts?: string[];
    targetWords?: string[];
    algorithmTargets?: string[];
    measures?: string[];
    reason?: string;
  };
};

function activityNameForHomeworkNode(node: PendingHomeworkNode): string {
  const role = node.carePlan?.role ?? node.type;
  if (role === "baseline-evaluator") return "Homework Baseline Check";
  if (role === "story") return "Homework Story Reading";
  if (role === "pronunciation") return "Homework Pronunciation Practice";
  if (role === "concept-builder") return "Homework Concept Builder";
  if (role === "exit-evaluator") return "Homework Exit Check";
  if (role === "spelling-retrieval") return "Homework Spelling Retrieval";
  if (role === "spelling-production") return "Homework Spelling Production";
  return `Homework ${titleCase(role.replace(/[-_]/g, " "))}`;
}

function timeboxForHomeworkNode(node: PendingHomeworkNode): number {
  const role = node.carePlan?.role ?? node.type;
  if (role === "story") return 12;
  if (role === "pronunciation") return 6;
  if (role === "concept-builder") return 8;
  if (role === "baseline-evaluator" || role === "exit-evaluator") return 5;
  return 7;
}

function homeworkCarePlanActivities(
  pendingHomework: LearningProfile["pendingHomework"] | undefined,
): TodaysPlanActivity[] {
  if (!pendingHomework) return [];
  return (pendingHomework.nodes as PendingHomeworkNode[])
    .filter((node) => node.carePlan)
    .map((node) => {
      const carePlan = node.carePlan!;
      const targetConcepts = carePlan.targetConcepts ?? [];
      const targetWords = carePlan.targetWords ?? [];
      const words = targetWords.length > 0 ? targetWords : targetConcepts;
      const measures = carePlan.measures ?? [];
      return {
        activity: activityNameForHomeworkNode(node),
        priority: 1,
        required: true,
        reason:
          carePlan.reason ??
          `Assignment-aligned ${carePlan.role ?? node.type} node for the active homework.`,
        timeboxMinutes: timeboxForHomeworkNode(node),
        method:
          measures.length > 0
            ? `Measure: ${measures.join("; ")}. Algorithm targets: ${(carePlan.algorithmTargets ?? []).join(", ") || "assignment practice"}.`
            : `Algorithm targets: ${(carePlan.algorithmTargets ?? []).join(", ") || "assignment practice"}.`,
        source: `pendingHomework:${carePlan.role ?? node.type}`,
        words: words.length > 0 ? words : undefined,
        probeSequence:
          measures.length > 0
            ? measures
            : targetConcepts.map((concept) => `Explain ${concept} using the assignment`),
      };
    });
}

export function anchorTodaysPlanToPendingHomework(
  data: PsychologistStructuredOutput,
  pendingHomework: LearningProfile["pendingHomework"] | undefined,
  options: { planningMode?: TodaysPlanningMode } = {},
): PsychologistStructuredOutput {
  if (options.planningMode !== "homework") return data;
  const anchor = pendingHomeworkAnchorActivity(pendingHomework);
  if (!anchor || !pendingHomework) return data;
  const carePlanActivities = homeworkCarePlanActivities(pendingHomework);
  if (carePlanActivities.length > 0) {
    return {
      ...data,
      todaysPlan: [anchor, ...carePlanActivities].map((activity, idx) => ({
        ...activity,
        priority: idx + 1,
      })),
      stopAfter:
        "After the homework exit check shows the assignment concept is understood, or earlier if frustration is rising.",
      rewardPolicy:
        "Reward only after the homework care-plan sequence, not before the assignment is checked.",
    };
  }

  return {
    ...data,
    todaysPlan: [anchor].map((activity, idx) => ({
      ...activity,
      priority: idx + 1,
    })),
    stopAfter:
      "After the active homework check is complete, or earlier if frustration is rising.",
    rewardPolicy:
      "Reward only after the active homework is checked; broader review goals belong in review mode.",
  };
}

/**
 * Produces a structured care plan from on-disk context (no tool loop).
 * Calls the model — mock \`generateObject\` in tests without a key.
 */
export async function buildTodaysPlan(
  childName: "Ila" | "Reina",
  options: { planningMode?: TodaysPlanningMode } = {},
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

  const learningProfile = readLearningProfile(slug);
  const anchored = anchorTodaysPlanToPendingHomework(
    object,
    learningProfile?.pendingHomework,
    { planningMode: options.planningMode ?? "review" },
  );
  assertTodaysPlanInvariants(anchored.todaysPlan);
  writePersistedTodaysPlan(childName, anchored);
  return anchored;
}
