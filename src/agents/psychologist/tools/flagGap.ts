import { tool } from "ai";
import fs from "fs";
import { resolveContextFilePath } from "../../../utils/childContextPaths";
import { z } from "zod";

export const flagGap = tool({
  description:
    "Cross-reference a CELF-5 skill against session history. Call this to surface clinical gaps that have never been addressed in session.",
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina"]),
    skill: z.string().describe("The skill name to search for (e.g. Following Directions)"),
  }),
  execute: async ({ childName, skill }) => {
    const filePath = resolveContextFilePath(childName);

    if (!fs.existsSync(filePath)) {
      return JSON.stringify({ skill, mentions: 0, verdict: "NEVER TESTED" as const });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const regex = new RegExp(skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = content.match(regex);
    const mentions = matches ? matches.length : 0;
    const verdict = mentions === 0 ? "NEVER TESTED" : (`tested ${mentions} times` as const);

    return JSON.stringify({ skill, mentions, verdict });
  },
});
