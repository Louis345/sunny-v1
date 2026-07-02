import { z } from "zod";
import type { QuestBossKind } from "./questBossTeamPipeline";

export const questBossDynamicPromptBriefSchema = z.object({
  childHook: z.object({
    primaryMotivator: z.string().min(1),
    avoid: z.array(z.string()).default([]),
    reasonFromChart: z.string().min(1),
  }),
  learningTarget: z.object({
    domain: z.string().min(1),
    measuredSkill: z.string().min(1),
    targetWords: z.array(z.string().min(1)).min(1),
    weakPatterns: z.array(z.string()).default([]),
  }),
  worldBrief: z.object({
    theme: z.string().min(1),
    centralObject: z.string().min(1),
    mechanicMetaphor: z.string().min(1),
    visualProgression: z.array(z.string().min(1)).min(2),
  }),
  triggerDopamine: z.object({
    correct: z.array(z.string().min(1)).min(1),
    wrong: z.array(z.string().min(1)).min(1),
    recovery: z.array(z.string().min(1)).min(1),
    streak: z.array(z.string().min(1)).min(1),
    completion: z.preprocess(
      (value) => Array.isArray(value) ? value.map(String).filter(Boolean).join("; ") : value,
      z.string().min(1),
    ),
  }),
  guardPushback: z.object({
    behavior: z.string().min(1),
    tone: z.literal("firm-but-playful"),
    mustNotRevealAnswer: z.literal(true),
  }),
  evidenceContract: z.object({
    attemptEvents: z.literal(true),
    targetResults: z.literal(true),
    completionSummary: z.literal(true),
  }),
});

export type QuestBossDynamicPromptBrief = z.infer<typeof questBossDynamicPromptBriefSchema>;

const wrappedBriefKeys = [
  "dynamicPromptBrief",
  "questBossDynamicPromptBrief",
  "questBossBrief",
  "brief",
  "QuestBossDynamicPromptBrief",
] as const;

export function parseQuestBossDynamicPromptBrief(input: unknown): QuestBossDynamicPromptBrief {
  const direct = questBossDynamicPromptBriefSchema.safeParse(input);
  if (direct.success) return direct.data;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    for (const key of wrappedBriefKeys) {
      const wrapped = questBossDynamicPromptBriefSchema.safeParse(record[key]);
      if (wrapped.success) return wrapped.data;
    }
    const objectValues = Object.values(record).filter((value) => value && typeof value === "object" && !Array.isArray(value));
    if (objectValues.length === 1) {
      const wrapped = questBossDynamicPromptBriefSchema.safeParse(objectValues[0]);
      if (wrapped.success) return wrapped.data;
    }
  }
  return questBossDynamicPromptBriefSchema.parse(input);
}

export type QuestBossCreativeDirectorInput = {
  childId: string;
  kind: QuestBossKind;
  assignment: {
    domain: string;
    title: string;
    targetWords: string[];
    concepts: string[];
  };
  likelyHooks: string[];
  avoidOrSoften: string[];
  activityAffinity: string[];
  childSignals: string[];
  priorActivityEvidence: string[];
  questEvidence?: {
    contentId: string;
    accuracy: number;
    targetResults: Array<{
      target: string;
      correct: boolean;
      attempts: number;
      recovered?: boolean;
      hinted?: boolean;
    }>;
  } | null;
};

export function buildQuestBossCreativeDirectorInput(input: {
  childId: string;
  kind: QuestBossKind;
  assignment: QuestBossCreativeDirectorInput["assignment"];
  designerBrief: {
    likelyHooks: string[];
    avoidOrSoften: string[];
    activityAffinity: string[];
    signalSummary: string[];
  };
  baselineEvidence: Array<{ nodeId: string; summary: string }>;
  questEvidence?: QuestBossCreativeDirectorInput["questEvidence"];
}): QuestBossCreativeDirectorInput {
  return {
    childId: input.childId,
    kind: input.kind,
    assignment: {
      domain: input.assignment.domain,
      title: input.assignment.title,
      targetWords: [...input.assignment.targetWords],
      concepts: [...input.assignment.concepts],
    },
    likelyHooks: [...input.designerBrief.likelyHooks],
    avoidOrSoften: [...input.designerBrief.avoidOrSoften],
    activityAffinity: [...input.designerBrief.activityAffinity],
    childSignals: [...input.designerBrief.signalSummary],
    priorActivityEvidence: input.baselineEvidence.map((item) => item.summary),
    questEvidence: input.questEvidence ?? null,
  };
}

export function buildQuestBossCreativeDirectorPrompt(input: QuestBossCreativeDirectorInput): string {
  return `You are Sunny's Quest/Boss creative director.
Return JSON only matching QuestBossDynamicPromptBrief.

Evidence report:
${JSON.stringify(input, null, 2)}

Rules:
- Choose the creative wrapper from child evidence, prior activities, misses, recoveries, and affinity.
- Do not change target words, measured skill, or evidence requirements.
- Every correct, wrong, recovery, streak, and completion state must produce an observable world reaction.
- Text feedback alone is insufficient.
- Wrong/empty attempts must create guard pushback without revealing the answer.
- Correct attempts must advance the world state visibly.
- Trigger dopamine must be tied to real attempt evidence, recovery evidence, streak evidence, or completion evidence.
- Completion must be visually distinct from the first screen.`;
}

export function buildQuestBossArtifactPrompt(input: {
  brief: QuestBossDynamicPromptBrief;
}): string {
  const brief = questBossDynamicPromptBriefSchema.parse(input.brief);
  return [
    `Quest/Boss: ${brief.worldBrief.theme}; object=${brief.worldBrief.centralObject}; mechanic=${brief.worldBrief.mechanicMetaphor}.`,
    `Hook=${brief.childHook.primaryMotivator}; learning=${brief.learningTarget.domain}/${brief.learningTarget.measuredSkill}; words=${brief.learningTarget.targetWords.join(", ")}.`,
    "Text feedback alone is insufficient; every assessable click must visibly change the world.",
    `Wrong/empty: ${brief.guardPushback.behavior}; ${brief.triggerDopamine.wrong.join("; ")}; no answers.`,
    `Correct: ${brief.triggerDopamine.correct.join("; ")}. Recovery: ${brief.triggerDopamine.recovery.join("; ")}. Streak: ${brief.triggerDopamine.streak.join("; ")}.`,
    `Completion: ${brief.triggerDopamine.completion}. Progression: ${brief.worldBrief.visualProgression.join(" -> ")}.`,
    "Emit window.fireAttemptEvent per attempt and window.sendNodeComplete with targetResults plus summary.",
  ].join("\n");
}
