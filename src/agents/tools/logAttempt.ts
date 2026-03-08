import { tool } from "ai";
import path from "path";
import { z } from "zod";
import fs from "fs";

export const logAttempt = tool({
  description: "logs an attempt by the child",
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina"]),
    timestamp: z.string(),
    word: z.string(),
    correct: z.boolean(),
  }),
  execute: async ({ childName, timestamp, word, correct }) => {
    let filePath = "";

    childName === "Ila"
      ? (filePath = path.resolve(
          process.cwd(),
          "src",
          "context",
          "ila_context.md",
        ))
      : (filePath = path.resolve(
          process.cwd(),
          "src",
          "context",
          "reina_context.md",
        ));

    await fs.promises.appendFile(
      filePath,
      `[${timestamp}] ${word} ${correct ? "correctly" : "incorrectly"} `,
      "utf-8",
    );
    return `${childName} attempted "${word}" — ${correct ? "✅ correct" : "❌ incorrect"} at ${timestamp}`;
  },
});
