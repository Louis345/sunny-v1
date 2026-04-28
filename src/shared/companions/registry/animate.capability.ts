import { z } from "zod";
import { ANIMATION_IDS } from "../animations.generated";
import type { CapabilityDefinition } from "../companionContract";

const animatePayloadSchema = z
  .object({
    animation: z.enum(ANIMATION_IDS),
    loop: z.boolean().optional(),
    duration_ms: z.number().positive().optional(),
  })
  .strict();

/** Phase 1 — VRM layer maps clips to expression/idle cues (see `companionAnimateBridge`). */
export const animateCapability: CapabilityDefinition = {
  type: "animate",
  version: "1.0",
  phase: 1,
  description: `Play a body animation on the VRM companion.
     Valid values: ${ANIMATION_IDS.join(" | ")}.
     Do not use any value not in this list.`,
  whenToUse: [
    "When movement or pose reinforces a celebration or transition alongside speech.",
  ],
  payloadSchema: animatePayloadSchema,
  defaultPayload: { animation: "idle", loop: false },
  diagLabel: "Animate (phase 1)",
  diagControls: [
    {
      kind: "dropdown",
      key: "animation",
      label: "Animation",
      options: [...ANIMATION_IDS],
    },
    { kind: "toggle", key: "loop", label: "Loop", default: false },
  ],
};
