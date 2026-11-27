import { z } from "zod";
import type { CapabilityDefinition } from "../companionContract";

const checkBackInPayloadSchema = z
  .object({
    after_seconds: z.number().min(20).max(600),
    how: z.enum(["raise_hand", "ask"]),
    words: z.string().max(200).optional(),
    why: z.string().min(1).max(300),
  })
  .strict();

/**
 * The companion's own check-in (2026-11-10, owner: "raise her hand… May I speak?… soft and gentle"). Silence can be
 * thinking; the companion decides whether, when and how to offer help later. Code keeps the appointment.
 */
export const checkBackInCapability: CapabilityDefinition = {
  type: "check_back_in",
  version: "1.0",
  phase: 0.5,
  description: `Ask Sunny to bring you back later if she has not answered by then.
     how: raise_hand (a quiet raised hand on your portrait; she taps it if she wants you) | ask (when it is due you get a fresh turn to check in, gently, in your own words).
     after_seconds: 20 to 600. why: what you noticed (you will be reminded of it). words: optional note to yourself; never replayed.
     Skipped automatically if she answers before then. One at a time; a new one replaces the old.`,
  whenToUse: [
    "When she is quiet or stuck in a game and you would rather not interrupt her thinking now, but want a chance to help later.",
  ],
  payloadSchema: checkBackInPayloadSchema,
  defaultPayload: { after_seconds: 90, how: "raise_hand", why: "quiet" },
  diagLabel: "Check back in",
  diagControls: [],
};
