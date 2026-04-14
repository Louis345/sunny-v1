import { z } from "zod";
import type { CapabilityDefinition } from "../companionContract";

const animations = [
  "idle",
  "walk",
  "dance_victory",
  "think",
  "sit",
  "jump",
  "wave",
] as const;

const animatePayloadSchema = z
  .object({
    animation: z.enum(animations),
    loop: z.boolean().optional(),
    duration_ms: z.number().positive().optional(),
  })
  .strict();

/** Phase 1 — contract only; client/runtime not wired yet. */
export const animateCapability: CapabilityDefinition = {
  type: "animate",
  version: "1.0",
  phase: 1,
  description: "Play a named animation clip on the companion (future).",
  whenToUse: [
    "When movement reinforces a celebration or transition (implementation pending).",
  ],
  payloadSchema: animatePayloadSchema,
  defaultPayload: { animation: "idle", loop: false },
  diagLabel: "Animate (phase 1)",
  diagControls: [
    {
      kind: "dropdown",
      key: "animation",
      label: "Animation",
      options: [...animations],
    },
    { kind: "toggle", key: "loop", label: "Loop", default: false },
  ],
};
