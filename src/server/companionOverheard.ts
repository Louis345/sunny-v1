import { tool } from "ai";
import { z } from "zod";

/**
 * Speech heard while Elli was collapsed and nobody said her name. Elli, not a
 * gate, decides whether it was for her (owner rule, Nov 2: she can always be
 * reached). No scripted reply: she answers from live context or stays quiet.
 */
export const OVERHEARD_TURN_NOTE = [
  "[Overheard speech]",
  "You were in standby and heard this without your name. It may be meant for someone else in the room, or it may be for you.",
  "If it is for you, answer as you normally would. If it is not, call stayQuiet before saying anything, and say nothing.",
].join("\n");

export function createStayQuietTool(host: { stayQuiet: () => void }) {
  return { stayQuiet: tool({
    description: "Use only for overheard speech that was not meant for you. Ends this turn silently; call it before saying anything.",
    inputSchema: z.object({}),
    execute: async () => {
      host.stayQuiet();
      return { quiet: true };
    },
  }) };
}
