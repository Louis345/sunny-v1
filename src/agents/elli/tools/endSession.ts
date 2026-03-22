import { tool } from "ai";
import { z } from "zod";

export const endSession = tool({
  description: `End the session ONLY when the child or parent says the exact phrase 'end session' or 'end the session'.

Nothing else triggers this tool.
Not 'stop', not 'bye', not 'I'm done', not 'goodbye', not 'I have to go', not 'we're done'.

ONLY: 'end session' or 'end the session'.

If they say anything else, stay in session.`,
  inputSchema: z.object({
    childName: z.string(),
    reason: z.enum(["child_requested", "session_complete", "goodbye"]),
  }),
  execute: async (args) => ({ ended: true, childName: args.childName }),
});
