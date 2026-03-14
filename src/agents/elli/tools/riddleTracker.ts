import { tool } from "ai";
import fs from "fs";
import path from "path";
import { z } from "zod";

export const riddleTracker = tool({
  description:
    "Call before telling a riddle to check if Reina has already heard it. Also call after to mark it as used.",
  inputSchema: z.object({
    action: z.enum(["check", "mark"]),
    riddleId: z
      .string()
      .describe(
        "Short unique ID for the riddle e.g. 'elevator', 'echo', 'map'",
      ),
  }),
  execute: async ({ action, riddleId }) => {
    const logsDir = path.resolve(process.cwd(), "src", "logs");
    await fs.promises.mkdir(logsDir, { recursive: true });
    const filePath = path.resolve(logsDir, "reina_riddles_used.json");

    let used: string[] = [];
    try {
      used = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {}

    if (action === "check") {
      return used.includes(riddleId)
        ? `ALREADY USED — do not tell "${riddleId}" again, pick a different one`
        : `OK to use "${riddleId}"`;
    }

    if (!used.includes(riddleId)) {
      used.push(riddleId);
      await fs.promises.writeFile(
        filePath,
        JSON.stringify(used, null, 2),
      );
    }
    return `Marked "${riddleId}" as used`;
  },
});
