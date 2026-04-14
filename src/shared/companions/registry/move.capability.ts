import { z } from "zod";
import type { CapabilityDefinition } from "../companionContract";

const movePayloadSchema = z
  .object({
    target: z.string().min(1),
    speed: z.enum(["slow", "normal", "fast"]).optional(),
  })
  .strict();

/** Phase 1 — contract only; client/runtime not wired yet. */
export const moveCapability: CapabilityDefinition = {
  type: "move",
  version: "1.0",
  phase: 1,
  description: "Move the companion toward a named map/node target (future).",
  whenToUse: [
    "When the companion should relocate on the adventure map (implementation pending).",
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
