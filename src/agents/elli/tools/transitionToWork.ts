import { tool } from "ai";
import { z } from "zod";

export const transitionToWork = tool({
  description:
    "Call this EXACTLY ONCE per session — the moment you first transition from warm-up chat to learning activities. NEVER call it again after the first time. It is NOT a redirect tool. Do not call it when the child goes off-topic mid-session. If the child gets distracted during learning, simply ask your next question — do not call this tool again.",
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina"]),
  }),
  execute: async ({ childName }) => {
    const timestamp = new Date().toISOString();
    return `${childName} transitioned to work at ${timestamp}`;
  },
});
