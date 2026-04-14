import { z } from "zod";
import type { CapabilityDefinition } from "../companionContract";

const movePayloadSchema = z
  .object({
    target: z.string().min(1),
    speed: z.enum(["slow", "normal", "fast"]).optional(),
  })
  .strict();

/** Phase 1 — nudges VRM root position toward symbolic map targets in the viewport. */
export const moveCapability: CapabilityDefinition = {
  type: "move",
  version: "1.0",
  phase: 1,
  description:
    "Move the companion toward a named symbolic target (small world-space nudge for map context).",
  whenToUse: [
    "When the companion should shift on screen toward a map or story beat anchor.",
  ],
  payloadSchema: movePayloadSchema,
  defaultPayload: { target: "center", speed: "normal" },
  diagLabel: "Move (phase 1)",
  diagControls: [
    { kind: "dropdown", key: "target", label: "Target", options: ["center", "castle", "node_1"] },
    {
      kind: "dropdown",
      key: "speed",
      label: "Speed",
      options: ["slow", "normal", "fast"],
    },
  ],
};
