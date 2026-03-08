import { tool } from "ai";
import { z } from "zod";

export const transitionToWork = tool({
  description: "transitions the child to work mode",
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina"]),
    timestamp: z.string(),
  }),
  execute: async ({ timestamp, childName }) => {
    return `${childName} transitioned to work at ${timestamp}`;
  },
});
