import { z } from "zod";
import type { CapabilityDefinition } from "../companionContract";

const petPayloadSchema = z
  .object({
    action: z.enum(["bring", "dismiss", "name"]),
    name: z.string().max(40).optional(),
    newName: z.string().max(40).optional(),
  })
  .strict();

/**
 * Her pet, by voice (owner 2026-11-22: "Elli, bring out Sparky" / "Elli, dismiss Sparky"). One tool for every companion.
 * Code finds the pet in her den and brings it out beside you or sends it home; the result says what happened.
 */
export const petCapability: CapabilityDefinition = {
  type: "pet",
  version: "1.0",
  phase: 0.5,
  description: `Bring out one of her caught pets to stay beside you on her screen, send it home to her den, or save the name she gives it.
     action: bring | dismiss | name. name: the pet's name or kind as she said it (leave it out to send the current pet home, or to name her newest unnamed pet).
     newName (action name only): the name she chose, as she said it; up to 16 letters are kept.
     The result says what happened, or why not (no pets yet, no pet by that name with her pets' names, or it needs more bond: feed it in her Den).`,
  whenToUse: [
    "When she asks you to bring out, call, show or summon her pet or creature.",
    "When she asks you to send her pet home, dismiss it, or put it away.",
    "When she says what she wants to call her pet (a new pet, or a new name for one she has).",
  ],
  payloadSchema: petPayloadSchema,
  defaultPayload: { action: "bring" },
  diagLabel: "Pet",
  diagControls: [],
};
