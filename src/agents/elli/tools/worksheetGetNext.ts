import { tool } from "ai";
import { z } from "zod";
import type { WorksheetSession } from "../../../server/worksheet-tools";

/**
 * Factory: returns an AI SDK tool that presents the next worksheet problem.
 * Renders the problem on the canvas. Claude decides WHEN to call this.
 */
export function createGetNextProblemTool(session: WorksheetSession) {
  return tool({
    description:
      "Present the next worksheet problem on the canvas. The server renders " +
      "the problem visually — you speak the question to the child. " +
      "Returns the question text and hint (grade from the worksheet image, not from the server). " +
      "Call this when the child is ready for the next problem. " +
      "Do NOT call this during a conversation or when the child is talking about something else. " +
      "If the canvas is occupied by a game, call clearCanvas first.",
    inputSchema: z.object({}),
    execute: async () => {
      return session.getNextProblem();
    },
  });
}
