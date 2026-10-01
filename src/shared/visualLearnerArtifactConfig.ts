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

const spellingVisualWordSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  chunks: z.array(z.string().min(1)).min(2).max(6),
  focusChunk: z.string().min(1),
  tip: z.string().min(1).max(160),
}).superRefine((word, context) => {
  const normalize = (value: string) => value.normalize("NFC").toLocaleLowerCase("en-US");
  if (normalize(word.chunks.join("")) !== normalize(word.text)) {
    context.addIssue({ code: "custom", path: ["chunks"], message: "chunks must reconstruct the target word" });
  }
  if (!word.chunks.some((chunk) => normalize(chunk) === normalize(word.focusChunk))) {
    context.addIssue({ code: "custom", path: ["focusChunk"], message: "focusChunk must be one complete chunk" });
  }
});

const spellingVisualCheckSchema = z.object({
  id: z.string().min(1),
  targetWord: z.string().min(1),
  prompt: z.string().min(1).max(180),
  options: z.array(optionSchema.extend({ correct: z.boolean() })).min(2).max(4),
  correctOptionId: z.string().min(1),
}).superRefine((check, context) => {
  const correct = check.options.filter((option) => option.correct);
  if (correct.length !== 1 || correct[0]?.id !== check.correctOptionId) {
    context.addIssue({ code: "custom", path: ["correctOptionId"], message: "check requires exactly one matching correct option" });
  }
});

export const spellingVisualExplainerPlanConfigSchema = z.object({
  schemaVersion: z.literal(1),
  activityId: z.literal("visual-explainer"),
  domain: z.literal("spelling"),
  topic: z.string().min(1).max(120),
  learningGoal: z.string().min(1).max(220),
  misconception: z.string().min(1).max(220),
  strategy: z.object({
    title: z.string().min(1).max(100),
    steps: z.array(z.string().min(1).max(140)).min(2).max(4),
  }),
  words: z.array(spellingVisualWordSchema).min(1).max(8),
  check: spellingVisualCheckSchema,
  evidencePolicy: z.object({
    writesPracticeEvidence: z.literal(true),
    writesMasteryEvidence: z.literal(false),
    requiresPerTargetResult: z.literal(false),
    allowedEvidence: z.array(z.enum(["practice", "companion"])).min(1),
  }),
}).superRefine((config, context) => {
  const normalize = (value: string) => value.normalize("NFC").toLocaleLowerCase("en-US");
  const words = new Set(config.words.map((word) => normalize(word.text)));
  if (!words.has(normalize(config.check.targetWord))) {
    context.addIssue({ code: "custom", path: ["check", "targetWord"], message: "check target must be one of the modeled words" });
  }
});

export type SpellingVisualExplainerPlanConfig = z.infer<typeof spellingVisualExplainerPlanConfigSchema>;

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
  spellingModel: z.object({
    strategy: spellingVisualExplainerPlanConfigSchema.shape.strategy,
    words: z.array(spellingVisualWordSchema).min(1).max(8),
  }).optional(),
});

export type VisualLearnerArtifactConfig = z.infer<
  typeof visualLearnerArtifactConfigSchema
>;

export function validateVisualLearnerArtifactConfig(
  input: unknown,
): VisualLearnerArtifactConfig {
  return visualLearnerArtifactConfigSchema.parse(input);
}

export function validateSpellingVisualExplainerPlanConfig(
  input: unknown,
): SpellingVisualExplainerPlanConfig {
  return spellingVisualExplainerPlanConfigSchema.parse(input);
}
