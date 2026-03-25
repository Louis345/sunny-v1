import { tool } from "ai";
import { z } from "zod";

export const launchGame = tool({
  description:
    "Launch any game by name. **Game names:** Only use ids that appear exactly as `###` headings under Teaching Tools and Reward Games in CANVAS_CAPABILITIES.md (from the live manifest). If the child’s request does not match exactly, pick the closest manifest name by meaning; never invent a name not in the manifest. Teaching tools may require a word — use startWordBuilder or startSpellCheck instead when a spelling word is required.",

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

  execute: async (args: { name: string; type: "tool" | "reward" }) => args,
});
