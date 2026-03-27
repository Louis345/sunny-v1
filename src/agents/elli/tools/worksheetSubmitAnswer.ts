import { tool } from "ai";
import { z } from "zod";
import type { WorksheetSession } from "../../../server/worksheet-tools";

/**
 * Factory: returns an AI SDK tool that logs a graded answer.
 * Claude does the grading — she has the worksheet image.
 * The server just records the attempt and returns the remaining count.
 */
export function createSubmitAnswerTool(session: WorksheetSession) {
  return tool({
    description:
      "Log the child's answer to the current worksheet problem. " +
      "YOU grade whether the answer is correct — you can see the worksheet image. " +
      "The server records your grading and tells you how many problems remain. " +
      "Only call this when the child has given an actual answer attempt. " +
      "Do NOT call this when the child is asking a question, making a comment, " +
      "or saying something unrelated to the problem. " +
      "If the child is wrong, you decide whether to give a hint and let them retry, " +
      "or explain the answer and submit correct=true to move on. " +
      "The server does NOT auto-advance on wrong answers — you control the pace.",
    inputSchema: z.object({
      problemId: z.string().describe("The problem ID from getNextProblem"),
      correct: z.boolean().describe("Your grading: true if the child's answer is correct"),
      childSaid: z.string().describe("What the child actually said (their exact words)"),
    }),
    execute: async ({ problemId, correct, childSaid }) => {
      return session.submitAnswer({ problemId, correct, childSaid });
    },
  });
}
