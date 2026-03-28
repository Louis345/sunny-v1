import { tool } from "ai";
import { z } from "zod";
import { shouldPersistSessionData } from "../../../utils/runtimeMode";

/** Persistence runs in session-manager after validation — execute only returns intent. */
export const logWorksheetAttempt = tool({
  description: `Call this after a genuine worksheet answer attempt — correct or incorrect.
You decide if the child answered correctly based on what they said. Be generous — if the meaning matches, it is correct.
Do NOT call if they only repeat the spoken question, only ask for clarification ("which one?", "which problem?"), or give meta talk without an answer — respond helpfully and wait for their next try.
Do NOT call if the child is only expressing confusion or asking for help without attempting an answer.`,
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina"]),
    problemId: z.string(),
    correct: z.boolean(),
    childSaid: z.string().describe("exact transcript"),
    expectedAnswer: z.string(),
  }),
  execute: async (args) => {
    if (!shouldPersistSessionData()) {
      return { logged: false, correct: args.correct, skipped: "stateless demo/test mode" };
    }
    return { logged: true, correct: args.correct, problemId: args.problemId };
  },
});
