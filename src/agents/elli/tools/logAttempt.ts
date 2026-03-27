import { tool } from "ai";
import path from "path";
import { z } from "zod";
import fs from "fs";
import { shouldPersistSessionData } from "../../../utils/runtimeMode";

const seenThisSession: Record<"Ila" | "Reina", Set<string>> = {
  Ila: new Set(),
  Reina: new Set(),
};

export const logAttempt = tool({
  description: "logs an attempt by the child",
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina"]),
    word: z.string(),
    correct: z.boolean(),
  }),
  execute: async ({ childName, word, correct }) => {
    if (!shouldPersistSessionData()) {
      return `${childName} attempted "${word}" — stateless demo/test mode, not writing attempt log.`;
    }

    const seenSet = seenThisSession[childName];
    if (seenSet.has(word)) {
      return `${childName} already attempted "${word}" in this session; not logging duplicate.`;
    }
    seenSet.add(word);

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
