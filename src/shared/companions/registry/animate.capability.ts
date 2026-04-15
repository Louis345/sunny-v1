import { z } from "zod";
import {
  COMPANION_ANIMATION_IDS,
  type CapabilityDefinition,
} from "../companionContract";

const animations = COMPANION_ANIMATION_IDS;

const animatePayloadSchema = z
  .object({
    animation: z.enum(animations),
    loop: z.boolean().optional(),
    duration_ms: z.number().positive().optional(),
  })
  .strict();

/** Phase 1 — VRM layer maps clips to expression/idle cues (see `companionAnimateBridge`). */
export const animateCapability: CapabilityDefinition = {
  type: "animate",
  version: "1.0",
  phase: 1,
  description:
    "Play a named animation id on the companion (mapped to expressions until a clip graph ships).",
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
      options: [...animations],
    },
    { kind: "toggle", key: "loop", label: "Loop", default: false },
  ],
};
