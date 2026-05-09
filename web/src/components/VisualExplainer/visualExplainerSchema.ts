import { z } from "zod";

export const visualExplainerOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  correct: z.boolean(),
  misconception: z.string().nullable().optional(),
});

export const visualExplainerCheckpointSchema = z.object({
  id: z.string().min(1),
  t: z.number().min(0).max(1),
  caption: z.string().min(1),
});

export const visualExplainerNarrationLineSchema = z.object({
  id: z.string().min(1),
  state: z.string().min(1),
  text: z.string().min(1),
  expression: z.enum(["idle", "thinking", "encouraging", "celebrating", "supporting"]),
});

export const visualExplainerConfigSchema = z.object({
  activityId: z.string().min(1),
  nodeId: z.string().min(1),
  topic: z.string().min(1),
  learningGoal: z.string().min(1),
  childHook: z.string().min(1),
  carePlanNote: z.object({
    assumption: z.string().min(1),
    intervention: z.string().min(1),
  }),
  animation: z.object({
    durationMs: z.number().min(1000),
    predictionAt: z.number().min(0).max(1),
  }),
  checkpoints: z.array(visualExplainerCheckpointSchema).min(3),
  prediction: z.object({
    roundId: z.string().min(1),
    targetConcept: z.string().min(1),
    prompt: z.string().min(1),
    reveal: z.string().min(1),
    options: z.array(visualExplainerOptionSchema).min(2),
  }),
  exitCheck: z.object({
    prompt: z.string().min(1),
    answer: z.string().min(1),
  }),
  companion: z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    role: z.string().min(1),
    avatar: z.string().min(1),
    provider: z.string().min(1),
    voiceId: z.string().optional(),
    lines: z.array(visualExplainerNarrationLineSchema).min(3),
  }),
});

export type VisualExplainerConfig = z.infer<typeof visualExplainerConfigSchema>;
export type VisualExplainerOption = z.infer<typeof visualExplainerOptionSchema>;
export type VisualExplainerNarrationLine = z.infer<typeof visualExplainerNarrationLineSchema>;

export function validateVisualExplainerConfig(input: unknown): VisualExplainerConfig {
  return visualExplainerConfigSchema.parse(input);
}
