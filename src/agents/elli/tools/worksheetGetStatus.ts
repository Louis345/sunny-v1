import { tool } from "ai";
import { z } from "zod";
import type { WorksheetSession } from "../../../server/worksheet-tools";

/**
 * Factory: returns an AI SDK tool bound to a specific WorksheetSession.
 * Claude calls this to orient herself — "what problem are we on?"
 */
export function createGetSessionStatusTool(session: WorksheetSession) {
  return tool({
    description:
      "Get the current worksheet session status. Call this when you need to know: " +
      "what problem you're on, how many are done, whether a reward is earned, " +
      "or what's showing on the canvas. No side effects — just reads state.",
    inputSchema: z.object({}),
    execute: async () => {
      return session.getSessionStatus();
    },
  });
}
