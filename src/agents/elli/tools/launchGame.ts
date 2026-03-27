import { tool } from "ai";
import { z } from "zod";
import { resolveLaunchGameRequest } from "../../../server/games/resolveLaunchGameRequest";

export const launchGame = tool({
  description:
    "Launch any game by name. Use live game ids from the current manifest. Friendly requests like 'BD reversal game' may resolve to a canonical live id such as 'bd-reversal'. If the game does not exist, the tool returns ok=false plus the current available ids. Teaching tools may require a word — use startWordBuilder or startSpellCheck instead when a spelling word is required.",

  inputSchema: z.object({
    name: z
      .string()
      .describe(
        "Exact game id from the Canvas Capabilities manifest (Teaching Tools or Reward Games). No other strings.",
      ),
    type: z
      .enum(["tool", "reward"])
      .describe("Whether this is a teaching tool or a reward game."),
  }),

  execute: async (args: { name: string; type: "tool" | "reward" }) =>
    resolveLaunchGameRequest(args),
});
