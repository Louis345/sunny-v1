import { z } from "zod";

export const visualBriefIdSchema = z.enum(["erosion", "red-blood-cells"]);

export const visualBriefPaletteSchema = z.object({
  page: z.string().min(1),
  sceneBgTop: z.string().min(1),
  sceneBgBottom: z.string().min(1),
  land: z.string().min(1),
  landDark: z.string().min(1),
  carrier: z.string().min(1),
  carrierLight: z.string().min(1),
  payload: z.string().min(1),
  payloadGlow: z.string().min(1),
  accent: z.string().min(1),
  ink: z.string().min(1),
  card: z.string().min(1),
});

export const visualBriefActorSchema = z.object({
  label: z.string().min(1),
  visual: z.string().min(1),
});

export const visualBriefCheckpointSchema = z.object({
  id: z.string().min(1),
  t: z.number().min(0).max(1),
  label: z.string().min(1),
  caption: z.string().min(1),
});

export const visualBriefPredictionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  correct: z.boolean(),
  misconception: z.string().nullable().optional(),
});

export const visualBriefSchema = z.object({
  id: visualBriefIdSchema,
  template: z.literal("carrier-flow"),
  topic: z.string().min(1),
  title: z.string().min(1),
  learningGoal: z.string().min(1),
  childHook: z.string().min(1),
  carePlanNote: z.object({
    assumption: z.string().min(1),
    intervention: z.string().min(1),
  }),
  palette: visualBriefPaletteSchema,
  world: z.enum(["earth-hill", "bloodstream"]),
  actors: z.object({
    carrier: visualBriefActorSchema,
    payload: visualBriefActorSchema,
    source: visualBriefActorSchema,
    destination: visualBriefActorSchema,
  }),
  checkpoints: z.array(visualBriefCheckpointSchema).min(4),
  prediction: z.object({
    roundId: z.string().min(1),
    targetConcept: z.string().min(1),
    prompt: z.string().min(1),
    reveal: z.string().min(1),
    options: z.array(visualBriefPredictionOptionSchema).min(2),
  }),
  exitCheck: z.object({
    prompt: z.string().min(1),
    answer: z.string().min(1),
  }),
  companionLines: z.object({
    intro: z.string().min(1),
    playing: z.string().min(1),
    pausedForPrediction: z.string().min(1),
    correct: z.string().min(1),
    support: z.string().min(1),
    exitCheck: z.string().min(1),
    complete: z.string().min(1),
  }),
});

export type VisualBriefId = z.infer<typeof visualBriefIdSchema>;
export type VisualBrief = z.infer<typeof visualBriefSchema>;

export function validateVisualBrief(input: unknown): VisualBrief {
  return visualBriefSchema.parse(input);
}
