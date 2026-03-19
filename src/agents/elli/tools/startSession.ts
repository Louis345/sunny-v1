import { tool } from "ai";
import { z } from "zod";

let sessionStarted = false;

export function resetSessionStart(): void {
  sessionStarted = false;
}

/** Call once at session start — not exposed as a tool to Claude (avoids per-turn latency). */
export async function recordSessionStart(
  childName: "Ila" | "Reina",
): Promise<string> {
  if (sessionStarted) return "Session already started";
  sessionStarted = true;
  const timestamp = new Date().toISOString();
  return `Session started for ${childName} at ${timestamp}`;
}

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
