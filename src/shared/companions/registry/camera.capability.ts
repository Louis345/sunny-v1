import { z } from "zod";
import {
  CAMERA_ANGLES,
  type CapabilityDefinition,
} from "../companionContract";

const cameraPayloadSchema = z
  .object({
    angle: z.enum(CAMERA_ANGLES),
    transition_ms: z.number().nonnegative().optional(),
  })
  .strict();

export const cameraCapability: CapabilityDefinition = {
  type: "camera",
  version: "1.0",
  phase: 0.5,
  description: "Adjust the Three.js camera framing on the companion viewport.",
  whenToUse: [
    "When you want emphasis (close-up) or to show the full character (full-body / wide).",
    "Use sparingly so changes feel intentional, not busy.",
  ],
  payloadSchema: cameraPayloadSchema,
  defaultPayload: { angle: "mid-shot", transition_ms: 400 },
  diagLabel: "Camera",
  diagControls: [
    {
      kind: "dropdown",
      key: "angle",
      label: "Angle",
      options: [...CAMERA_ANGLES],
    },
    {
      kind: "slider",
      key: "transition_ms",
      label: "Transition (ms)",
      min: 0,
      max: 3000,
      step: 50,
      default: 400,
    },
  ],
};
