import { tool } from "ai";
import { z } from "zod";
import type { WorksheetSession } from "../../../server/worksheet-tools";

/**
 * Factory: returns an AI SDK tool that clears the canvas.
 * Claude calls this before switching contexts (worksheet → game, game → worksheet).
 */
export function createClearCanvasTool(session: WorksheetSession) {
  return tool({
    description:
      "Clear the canvas. Call this before launching a game while a problem " +
      "is showing, or when the child needs a clean screen for a conversation break. " +
      "Safe to call when canvas is already idle (no-op).",
    inputSchema: z.object({}),
    execute: async () => {
      return session.clearCanvas();
    },
  });
}
