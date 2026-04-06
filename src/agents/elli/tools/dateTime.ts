import { tool } from "ai";
import { z } from "zod";

/** Same string the dateTime tool returns — use for one-shot server injection at session start. */
export function formatDateTimeEastern(): string {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "full",
    timeStyle: "short",
  });
}

export const dateTime = tool({
  description:
    "Only when the user explicitly asks for the current time or date (e.g. 'what time is it?'). Never call on session start — the server already injected the session time. Never call on every turn.",
  inputSchema: z.object({}),
  execute: async () => {
    const result = formatDateTimeEastern();
    console.log("  🕐 dateTime execute called, returning:", result);
    return result;
  },
});
