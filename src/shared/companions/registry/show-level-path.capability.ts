import { z } from "zod";
import type { CapabilityDefinition } from "../companionContract";

const showLevelPathPayloadSchema = z.object({}).strict();

/** Read-only UI action. It never grants XP, rewards, or learning evidence. */
export const showLevelPathCapability: CapabilityDefinition = {
  type: "show_level_path",
  version: "1.0",
  phase: 0.5,
  description:
    "Open the child's read-only Level Path so they can see their current level and guaranteed future level rewards.",
  whenToUse: [
    "When the child asks what level they are on, what they earn next, or asks to see their level rewards.",
    "Never open it proactively; this view is child-invoked.",
  ],
  payloadSchema: showLevelPathPayloadSchema,
  defaultPayload: {},
  diagLabel: "Show level path",
  diagControls: [],
};
