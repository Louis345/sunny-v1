import { tool } from "ai";
import { z } from "zod";

export const dateTime = tool({
  description:
    "returns the current time and date. Could to use when understanding the duration of each conversation session",
  inputSchema: z.object({}),
  execute: async () => {
    return new Date().toISOString();
  },
});
