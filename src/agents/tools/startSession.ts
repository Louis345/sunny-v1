import { tool } from "ai";
import { z } from "zod";

export const startSession = tool({
  description: "starts a new session for the child",
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina"]),
    timestamp: z.string(),
  }),
  execute: async ({ childName, timestamp }) => {
    return `Session started for ${childName} at ${timestamp}`;
  },
});
