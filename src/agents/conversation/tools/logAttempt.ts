import { tool } from "ai";
import path from "path";
import { z } from "zod";
import fs from "fs";

export const logAttempt = tool({
  description: "logs an attempt by the child",
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina"]),
    word: z.string(),
    correct: z.boolean(),
  }),
  execute: async ({ childName, word, correct }) => {
    const timestamp = new Date().toISOString();
    const logsDir = path.resolve(process.cwd(), "src", "logs");
    await fs.promises.mkdir(logsDir, { recursive: true });

    const fileName = childName === "Ila" ? "ila_attempts.json" : "reina_attempts.json";
    const filePath = path.resolve(logsDir, fileName);

    const entry = JSON.stringify({ timestamp, word, correct }) + "\n";
    await fs.promises.appendFile(filePath, entry, "utf-8");

    return `${childName} attempted "${word}" — ${correct ? "✅ correct" : "❌ incorrect"} at ${timestamp}`;
  },
});
