import { z } from "zod";
import { visualBriefIdSchema } from "./visualBriefSchema";

export const studioMentalModelSchema = z.enum([
  "carrier-flow",
  "part-whole",
  "sequence-change",
  "compare-contrast",
  "cause-effect",
  "cycle",
  "map-system",
]);

export const studioEvidenceWriteSchema = z.enum([
  "activity_target_result",
  "activity_complete",
  "recall_result",
  "teachback_result",
]);

export const visualStudioBriefSchema = z.object({
  id: visualBriefIdSchema,
  concept: z.object({
    id: z.string().min(1),
    target: z.string().min(1),
    learnerProblem: z.string().min(1),
    mentalModel: studioMentalModelSchema,
    evidenceTargets: z.array(z.string().min(1)).min(1),
    misconceptions: z.array(z.string().min(1)).default([]),
  }),
  intervention: z.object({
    id: z.string().min(1),
    type: z.literal("visual-explainer"),
    briefId: visualBriefIdSchema,
    template: studioMentalModelSchema,
    goal: z.string().min(1),
    predictionTarget: z.string().min(1),
    renderer: z.object({
      current: z.string().min(1),
      targetQuality: z.string().min(1),
    }),
  }),
  recall: z.object({
    id: z.string().min(1),
    type: z.literal("co-op-quiz"),
    template: z.literal("sunny-coop-jeopardy"),
    sourceInterventionId: z.string().min(1),
    stakes: z.literal("sun-coins"),
    turnMode: z.literal("child-and-companion"),
    categories: z.array(z.string().min(1)).min(2),
    questions: z
      .array(
        z.object({
          id: z.string().min(1),
          targetConcept: z.string().min(1),
          prompt: z.string().min(1),
          answer: z.string().min(1),
          options: z.array(z.string().min(1)).min(2),
          stake: z.number().int().positive(),
          misconception: z.string().min(1).optional(),
          companion: z.object({
            choice: z.string().min(1),
            correct: z.boolean(),
            reaction: z.string().min(1),
          }),
        }),
      )
      .min(1),
  }),
  evidence: z.object({
    writes: z.array(studioEvidenceWriteSchema).min(3),
    recordTo: z.literal("child-chart"),
    successClaim: z.string().min(1),
    falsifyClaim: z.string().min(1),
  }),
});

export type VisualStudioBrief = z.infer<typeof visualStudioBriefSchema>;
export type VisualStudioBriefId = VisualStudioBrief["id"];

export function validateVisualStudioBrief(input: unknown): VisualStudioBrief {
  return visualStudioBriefSchema.parse(input);
}
