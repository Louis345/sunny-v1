import { tool } from "ai";
import { z } from "zod";

export const requestResumeActivity = tool({
  description: `Use this when the child is ready to return to the worksheet or paused activity.

Call it when:
- the child says "I'm ready"
- the child says "let's go back"
- the child confirms they want to continue
- the child asks to see the worksheet / "put the worksheet up" / "can you show the problem"

Do NOT call it if the child is still upset, unsure, or still talking through the personal issue.
After calling this, the server will put the worksheet back on screen — you do not need to describe what is on screen, just confirm you're moving forward.`,
  inputSchema: z.object({
    childConfirmedReady: z.boolean(),
    summary: z.string().optional(),
  }),
  execute: async (args) => ({
    requested: true,
    action: "resume_activity",
    ...args,
  }),
});
