import { z } from "zod";

const optionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  correct: z.boolean().optional(),
  misconceptionTag: z.string().min(1).optional(),
});

const questionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(optionSchema).min(1),
  correctOptionId: z.string().min(1),
  targetConcept: z.string().min(1),
  misconceptionTag: z.string().min(1).optional(),
  pauseAtProgress: z.number().min(0).max(100),
  scaffoldLevel: z.number().int().min(0).max(5),
});

const narrationTimingSchema = z.object({
  id: z.string().min(1),
  startProgress: z.number().min(0).max(100),
  endProgress: z.number().min(0).max(100),
  text: z.string().min(1),
});

export const visualLearnerArtifactConfigSchema = z.object({
  artifactId: z.string().min(1),
  type: z.literal("visual-explainer"),
  concept: z.string().min(1),
  learningGoal: z.string().min(1),
  misconception: z.string().min(1),
  sourceEvidence: z.object({
    source: z.string().min(1),
    capturedAt: z.string().min(1),
    summary: z.string().min(1),
  }),
  algorithmTargets: z.array(z.string().min(1)).min(1),
  reuseDecision: z.object({
    status: z.enum(["candidate", "reuse", "revise", "retire"]),
    reason: z.string().min(1),
  }),
  parentApproval: z.object({
    status: z.enum(["pending", "approved", "rejected", "regenerating"]),
    reviewer: z.string().min(1).optional(),
    reviewedAt: z.string().min(1).optional(),
    notes: z.string().optional(),
  }),
  mode: z.object({
    default: z.enum(["pause-for-question", "playthrough"]),
  }),
  preview: z.object({
    allowPlaythrough: z.boolean(),
  }),
  narration: z.object({
    enabled: z.boolean(),
    provider: z.string().min(1),
    voiceId: z.string().min(1),
    modelId: z.string().min(1),
    audioPath: z.string().min(1),
    scriptPath: z.string().min(1),
    timings: z.array(narrationTimingSchema).min(1),
  }),
  questions: z.array(questionSchema).min(1),
  companionContext: z.object({
    role: z.literal("hint_only"),
    maxSentences: z.number().int().min(1).max(4),
    canRevealAnswer: z.boolean(),
  }),
  evidence: z.object({
    targetResults: z.array(z.string().min(1)).min(1),
    completion: z.string().min(1),
  }),
  chrome: z.object({
    childShowsEvidence: z.boolean(),
    parentShowsEvidence: z.boolean(),
    childShowsCarePlan: z.boolean(),
    parentShowsCarePlan: z.boolean(),
  }),
});

export type VisualLearnerArtifactConfig = z.infer<
  typeof visualLearnerArtifactConfigSchema
>;

export function validateVisualLearnerArtifactConfig(
  input: unknown,
): VisualLearnerArtifactConfig {
  return visualLearnerArtifactConfigSchema.parse(input);
}
