import { tool } from "ai";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { shouldPersistSessionData } from "../../../utils/runtimeMode";

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

    const timestamp = new Date().toISOString();
    const logsDir = path.resolve(process.cwd(), "src", "logs");
    await fs.promises.mkdir(logsDir, { recursive: true });
    const fileName =
      args.childName === "Ila" ? "ila_attempts.json" : "reina_attempts.json";
    const filePath = path.join(logsDir, fileName);
    const word = `worksheet-q${args.problemId}-${timestamp.slice(11, 23)}`;
    const entry =
      JSON.stringify({ timestamp, word, correct: args.correct }) + "\n";
    await fs.promises.appendFile(filePath, entry, "utf-8");
    console.log(
      `  🎮 [worksheet] logWorksheetAttempt ${args.correct ? "correct" : "incorrect"} q${args.problemId}`
    );
    return { logged: true, correct: args.correct };
  },
});
