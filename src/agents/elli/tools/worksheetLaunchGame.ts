import { tool } from "ai";
import { z } from "zod";
import type { WorksheetSession } from "../../../server/worksheet-tools";

/**
 * Factory: returns an AI SDK tool that launches a game on the canvas.
 * Claude decides when to launch games — rewards, teaching tools, breaks.
 */
export function createLaunchGameTool(session: WorksheetSession) {
  return tool({
    description:
      "Launch a game on the canvas. Use type 'reward' for earned rewards " +
      "(like space-invaders or space-frogger after completing all problems). Use type 'tool' " +
      "for teaching games (like store-game for money practice). " +
      "The canvas must be idle — call clearCanvas first if something is showing.",
    inputSchema: z.object({
      name: z.string().describe("Game name: 'space-invaders', 'space-frogger', 'store-game', etc."),
      type: z.enum(["tool", "reward"]).describe("'reward' for earned rewards, 'tool' for teaching games"),
    }),
    execute: async ({ name, type }) => {
      return session.launchGame({ name, type });
    },
  });
}
