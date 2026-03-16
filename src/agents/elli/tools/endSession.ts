import { tool } from "ai";
import { z } from "zod";

export const endSession = tool({
  description:
    "End the session when the child says they want to stop, says goodbye, or clearly indicates they are done. Call this immediately — do not ask for confirmation, do not say anything after calling this tool.",
  inputSchema: z.object({
    childName: z.string(),
    reason: z.enum(["child_requested", "session_complete", "goodbye"]),
  }),
  execute: async (args) => ({ ended: true, childName: args.childName }),
});
