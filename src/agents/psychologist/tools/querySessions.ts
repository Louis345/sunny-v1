import { tool } from "ai";
import path from "path";
import fs from "fs";
import { z } from "zod";

export const querySessions = tool({
  description:
    "Load recent session history from the child's context file. Call this when you need to examine what happened in past sessions.",
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina"]),
    count: z.number().describe("How many recent sessions to return"),
  }),
  execute: async ({ childName, count }) => {
    const fileName = childName === "Ila" ? "ila_context.md" : "reina_context.md";
    const filePath = path.resolve(process.cwd(), "src", "context", fileName);

    if (!fs.existsSync(filePath)) return "(no sessions yet)";

    const content = fs.readFileSync(filePath, "utf-8");
    const parts = content.split(/\n## Session —/);
    const sessions = parts.slice(1);

    if (sessions.length === 0) return "(no sessions yet)";

    const lastN = sessions.slice(-count);
    return "\n## Session —" + lastN.join("\n\n## Session —");
  },
});
