import type { Tool } from "ai";
import { launchGame } from "./launchGame";
import { dateTime } from "./dateTime";
import { createSixTools } from "../../tools/six-tools";
import { SixToolsMemoryHarness } from "../../tools/six-tools-apply";

/** Default host for docs + rare CLI paths (single-session). */
const _defaultSixHost = new SixToolsMemoryHarness();
const _six = createSixTools(_defaultSixHost);

/** Every `tool()` exposed to Elli — single registry for runtime + docs. */
export const ALL_TOOLS = {
  ..._six,
  launchGame,
  dateTime,
} as const;

function getDescription(t: Tool): string {
  const d = (t as { description?: string }).description;
  return typeof d === "string" ? d : "";
}

/** Markdown list of tool names and their `description` fields (no duplication). */
export function generateToolDocs(): string {
  return Object.entries(ALL_TOOLS)
    .map(([name, tool]) => `### ${name}\n${getDescription(tool as Tool)}`)
    .join("\n\n");
}
