import { z } from "zod";
import { COMPANION_EMOTES } from "../../companionEmotes";
import type { CapabilityDefinition } from "../companionContract";

const emotePayloadSchema = z
  .object({
    emote: z.enum(COMPANION_EMOTES),
    intensity: z.number().min(0).max(1).optional().default(0.8),
    duration_ms: z.number().positive().optional(),
  })
  .strict();

export const emoteCapability: CapabilityDefinition = {
  type: "emote",
  version: "1.0",
  phase: 0.5,
  description:
    "Facial / body expression on the VRM companion (happy, sad, celebrating, etc.).",
  whenToUse: [
    "When the moment calls for visible warmth, encouragement, or shared feeling — alongside what you say.",
    "Never replace speech with only an emote; use both when it helps the child feel seen.",
  ],
  payloadSchema: emotePayloadSchema,
  defaultPayload: { emote: "happy", intensity: 0.8 },
  diagLabel: "Emote",
  diagControls: [
    {
      kind: "dropdown",
      key: "emote",
      label: "Emote",
      options: [...COMPANION_EMOTES],
    },
    {
      kind: "slider",
      key: "intensity",
      label: "Intensity",
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.8,
    },
    {
      kind: "slider",
      key: "duration_ms",
      label: "Duration (ms)",
      min: 0,
      max: 5000,
      step: 100,
      default: 2000,
    },
  ],
};
