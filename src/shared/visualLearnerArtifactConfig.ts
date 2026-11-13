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

const researchNoteSchema = z.object({
  source: z.string().min(1),
  summary: z.string().min(1),
  url: z.string().min(1).optional(),
});

const engagementWrapperSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  promptLanguage: z.string().min(1),
});

const displaySchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().min(1),
  predictionKicker: z.string().min(1).optional(),
  predictionTitle: z.string().min(1).optional(),
});

const recallQuestionSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1).optional(),
  prompt: z.string().min(1),
  answer: z.string().min(1),
  options: z.array(optionSchema).min(2),
  correctOptionId: z.string().min(1),
  targetConcept: z.string().min(1),
  evidenceTarget: z.string().min(1),
  difficulty: z.number().min(0).max(1),
  stake: z.number().int().min(1).optional(),
  misconceptionTag: z.string().min(1).optional(),
  teachBackPrompt: z.string().min(1).optional(),
  companion: z.object({
    mistake: z.boolean().optional(),
    selectedOptionId: z.string().min(1).optional(),
  }).optional(),
});

const recallGameSchema = z.object({
  type: z.literal("co-op-recall"),
  sourceInterventionId: z.string().min(1),
  turnMode: z.enum(["child-and-companion"]),
  stakes: z.object({
    currency: z.string().min(1),
    lossMode: z.enum(["half-stake-floor-zero", "opportunity-cost"]).default("half-stake-floor-zero"),
    profilePersistence: z.enum(["true-net", "earn-only-net", "none"]).default("true-net"),
  }),
  companionPolicy: z.object({
    accuracyMode: z.enum(["match-child-mastery", "configured"]),
    configuredAccuracy: z.number().min(0).max(1).optional(),
    helperRole: z.literal("accurate-hint-only"),
  }),
  questions: z.array(recallQuestionSchema).min(1),
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
  display: displaySchema.optional(),
  reuseDecision: z.object({
    status: z.enum(["candidate", "reuse", "revise", "retire"]),
    reason: z.string().min(1),
  }),
  engagementWrapper: engagementWrapperSchema.optional(),
  assumptions: z.array(z.string().min(1)).default([]),
  falsifyCriteria: z.array(z.string().min(1)).default([]),
  researchNotes: z.array(researchNoteSchema).default([]),
  parentApproval: z.object({
    status: z.enum(["pending", "approved", "rejected", "regenerating"]),
    reviewer: z.string().min(1).nullable().optional(),
    reviewedAt: z.string().min(1).nullable().optional(),
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
    hintText: z.string().min(1).optional(),
    hintsByPhase: z.record(z.string(), z.string().min(1)).optional(),
  }),
  evidence: z.object({
    targetResults: z.array(z.string().min(1)).min(1),
    completion: z.string().min(1),
  }),
  recallGame: recallGameSchema.optional(),
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
