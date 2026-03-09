import { tool } from "ai";
import { z } from "zod";

export const dateTime = tool({
  description:
    "Only call when the user explicitly asks about the current time or date (e.g. 'what time is it?', 'what's the date?'). Never call proactively or on every turn.",
  inputSchema: z.object({}),
  execute: async () => {
    const result = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "full",
      timeStyle: "short",
    });
    console.log("  🕐 dateTime execute called, returning:", result);
    return result;
  },
});
