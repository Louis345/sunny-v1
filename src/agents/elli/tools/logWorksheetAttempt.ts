import { tool } from "ai";
import { z } from "zod";
import { shouldPersistSessionData } from "../../../utils/runtimeMode";

/** Persistence runs in session-manager after validation — execute only returns intent. */
export const logWorksheetAttempt = tool({
  description: `Call this after EVERY worksheet problem attempt — correct or incorrect.
You decide if the child answered correctly based on what they said. Be generous — if the meaning matches, it is correct.
Do NOT call this if the child is asking a question, expressing confusion, or asking for help.
Only call when the child has genuinely attempted an answer.`,
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
