import { tool } from "ai";
import { z } from "zod";

let sessionStarted = false;

export const startSession = tool({
  description: "starts a new session for the child",
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina"]),
    timestamp: z.string(),
  }),
  execute: async ({ childName, timestamp }) => {
    if (sessionStarted) return "Session already started";
    sessionStarted = true;
    return `Session started for ${childName} at ${timestamp}`;
  },
});
