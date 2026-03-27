import { tool } from "ai";
import { z } from "zod";

export const requestPauseForCheckIn = tool({
  description: `Use this when the child needs to pause the current activity so they can talk, calm down, or have privacy.

Call it when:
- the child asks to clear, hide, or turn off the screen
- the child says they need to talk about something important or personal
- the child sounds upset and needs connection before continuing

Do NOT call it for normal confusion, ordinary side questions, or simple incorrect answers.

This asks the server to pause the active activity safely. It does NOT give you direct canvas control.`,
  inputSchema: z.object({
    reason: z.enum([
      "child_requested_break",
      "child_requested_privacy",
      "child_distress",
      "emotional_checkin",
      "needs_to_talk",
    ]),
    urgency: z.enum(["low", "medium", "high"]),
    childAskedToHideScreen: z.boolean().optional(),
    wantsToResumeLater: z.boolean().optional(),
    summary: z.string().optional(),
  }),
  execute: async (args) => ({
    requested: true,
    action: "pause_for_checkin",
    ...args,
  }),
});
