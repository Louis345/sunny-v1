import { tool } from "ai";
import { z } from "zod";
import path from "path";
import fs from "fs";

export const saveSessionSummary = tool({
  description:
    "saves a summary of this session to the child's context file so the companion remembers next time. You be used after each session",
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina"]),
    summary: z.string(),
    timestamp: z.string(),
  }),
  execute: async ({ childName, summary }) => {
    // set the file path based on the child name the path is this: src/souls/ila.md
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

    try {
      await fs.promises.appendFile(filePath, summary, "utf-8");
      return `Successfully wrote ${summary.length} characters to ${filePath}`;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      return `Error writing file: ${err.message}`;
    }
  },
});
