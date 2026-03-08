import { tool } from "ai";
import { z } from "zod";

export const dateTime = tool({
  description:
    "ALWAYS call this tool when asked about time or date. Never guess — always use this tool.",
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
