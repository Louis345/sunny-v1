import { z } from "zod";

const sourceEvidenceIdsSchema = z.array(z.string().min(1)).min(
  1,
  "sourceEvidenceIds must identify at least one captured homework source",
);

const responseSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("selection"),
    options: z.array(z.object({
      id: z.string().min(1),
      label: z.string().min(1),
    })).min(2),
    correctOptionId: z.string().min(1),
  }),
  z.object({
    mode: z.literal("numeric"),
    correctValue: z.number().finite(),
  }),
  z.object({
    mode: z.literal("text"),
    acceptedAnswers: z.array(z.string().min(1)).min(1),
  }),
]);

const itemSchema = z.object({
  id: z.string().min(1),
  targetId: z.string().min(1),
  sourceEvidenceIds: sourceEvidenceIdsSchema,
  exposure: z.enum(["unseen", "taught", "practiced"]),
  prompt: z.string().min(1),
  response: responseSchema,
  timerSeconds: z.number().positive().nullable(),
}).superRefine((item, context) => {
  const response = item.response;
  if (response.mode === "selection" && !response.options.some(
    (option) => option.id === response.correctOptionId,
  )) {
    context.addIssue({
      code: "custom",
      path: ["response", "correctOptionId"],
      message: "correctOptionId must reference one of the supplied options",
    });
  }
}).meta({ id: "HatchHuntAssignmentItem" });

export const hatchHuntAssignmentConfigSchema = z.object({
  schemaVersion: z.literal(1),
  activityId: z.literal("hatch-hunt"),
  mode: z.literal("baseline_assignment"),
  encounterId: z.string().min(1),
  childId: z.string().min(1),
  homeworkId: z.string().min(1),
  domain: z.enum(["spelling", "vocabulary", "reading", "science", "math"]),
  // Mossback is the first supported Hatch Hunt renderer. Expand this literal
  // only when the encounter renderer gains the matching creature registry.
  creatureId: z.literal("mossback"),
  source: z.object({
    fingerprint: z.string().min(1),
    documentIds: z.array(z.string().min(1)).min(1),
  }),
  baselineItems: z.array(itemSchema).min(2),
  verificationItems: z.array(itemSchema).min(1),
  recoveryByTarget: z.record(z.string(), z.array(z.object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    workedExplanation: z.string().min(1),
  })).min(1)),
  evidencePolicy: z.object({
    purpose: z.literal("baseline"),
    firstAttemptIndependent: z.literal(true),
    maximumClaim: z.literal("practice_only"),
    captureIsAcademicEvidence: z.literal(false),
  }),
}).superRefine((config, context) => {
  const ids = [...config.baselineItems, ...config.verificationItems].map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      path: ["baselineItems"],
      message: "Hatch Hunt item ids must be unique within an encounter",
    });
  }

  config.baselineItems.forEach((item, index) => {
    if (item.timerSeconds !== null) {
      context.addIssue({
        code: "custom",
        path: ["baselineItems", index, "timerSeconds"],
        message: "A baseline timer is forbidden before the independent first attempt is captured",
      });
    }
    if (!config.recoveryByTarget[item.targetId]?.length) {
      context.addIssue({
        code: "custom",
        path: ["recoveryByTarget", item.targetId],
        message: "Every baseline target requires one Planner-authored recovery",
      });
    }
  });

  config.verificationItems.forEach((item) => {
    if (!config.recoveryByTarget[item.targetId]?.length) {
      context.addIssue({
        code: "custom",
        path: ["recoveryByTarget", item.targetId],
        message: "Every verification target requires one Planner-authored recovery",
      });
    }
  });
}).meta({ id: "HatchHuntAssignmentConfig" });

export type HatchHuntAssignmentConfig = z.infer<typeof hatchHuntAssignmentConfigSchema>;
export type HatchHuntAssignmentItem = HatchHuntAssignmentConfig["baselineItems"][number];

export function parseHatchHuntAssignmentConfig(value: unknown): HatchHuntAssignmentConfig {
  const parsed = hatchHuntAssignmentConfigSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  const details = parsed.error.issues.map((issue) => {
    const field = issue.path.length ? issue.path.join(".") : "config";
    return `${field}: ${issue.message}`;
  }).join("; ");
  throw new Error(`Invalid Hatch Hunt assignment config: ${details}`);
}
