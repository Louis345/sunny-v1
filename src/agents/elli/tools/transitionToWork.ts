import { tool } from "ai";
import { z } from "zod";

export const transitionToWork = tool({
  description:
    "Only call this after genuine warmup conversation has happened and the child seems ready to learn. Never call this on the first turn or on simple greetings. Wait for at least 2-3 turns of natural conversation before considering this transition.",
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina"]),
  }),
  execute: async ({ childName }) => {
    const timestamp = new Date().toISOString();
    return `${childName} transitioned to work at ${timestamp}`;
  },
});
