import type { PsychologistStructuredOutput } from "../psychologist/today-plan";

/** Full psychologist plan object used for session injection. */
export type TodaysPlan = PsychologistStructuredOutput;

const FORBIDDEN = [
  "complete activities in order",
  "complete in order",
  "do not proceed until",
  "must finish",
  "finish before moving on",
  "mandatory",
] as const;

const REQUIRED = [
  "hold loosely",
  "you read the child",
  "you are the tutor",
  "the plan bends",
] as const;

function normalizeForScan(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

/**
 * Ensures care plan copy stays discretionary, not rigid checklist language.
 * Throws if forbidden phrases appear or required tutor-discretion phrases are missing.
 */
export function assertCarePlanSectionLanguage(section: string): void {
  const n = normalizeForScan(section);
  for (const phrase of FORBIDDEN) {
    if (n.includes(phrase)) {
      throw new Error(
        `care plan section must not contain rigid language: "${phrase}"`,
      );
    }
  }
  for (const phrase of REQUIRED) {
    if (!n.includes(phrase)) {
      throw new Error(
        `care plan section missing required discretion language: "${phrase}"`,
      );
    }
  }
}

/**
 * Structured care plan block for the tutor (context, not a script).
 */
export function buildCarePlanSection(plan: TodaysPlan): string {
  const sorted = [...plan.todaysPlan].sort((a, b) => a.priority - b.priority);

  const activityBlocks = sorted
    .map((activity) => {
      const lines: string[] = [
        `**${activity.priority}. ${activity.activity}**`,
        `${activity.required ? "⚠️ Required" : "○ Use judgment"}`,
        `Reason: ${activity.reason}`,
        `Time: ~${activity.timeboxMinutes} min`,
      ];
      if (activity.method) lines.push(`Method: ${activity.method}`);
      if (activity.source) lines.push(`Validated by: ${activity.source}`);
      if (activity.words?.length)
        lines.push(`Words: ${activity.words.join(", ")}`);
      if (activity.probeSequence?.length)
        lines.push(`Probe: ${activity.probeSequence.join(" → ")}`);
      if (activity.skipConditions?.length)
        lines.push(`Skip if: ${activity.skipConditions.join(", ")}`);
      return lines.join("\n");
    })
    .join("\n\n");

  const section = `## Today's Care Plan
${plan.childProfile}

${plan.stopAfter}

The plan bends to fit the child — sequence is a suggestion, not a lock.

Activities (hold loosely — you read the child):

${activityBlocks}

Reward policy: ${plan.rewardPolicy}

You are the tutor. The plan is context, not a script. If the child needs a game break — give it. If they're exhausted — compress. If they're energized — do everything.

When you skip an activity, call:
sessionLog({
  skipped: true,
  activity: "activity_name",
  reason: "child fatigue"
})
So the Psychologist knows what happened. Skips are data. Never skip logging.`.trim();

  assertCarePlanSectionLanguage(section);
  return section;
}
