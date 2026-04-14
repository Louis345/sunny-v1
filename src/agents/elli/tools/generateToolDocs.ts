import type { Tool } from "ai";
import { launchGame } from "./launchGame";
import { dateTime } from "./dateTime";
import { createCompanionActTool } from "../../tools/companionAct";
import { createSixTools } from "../../tools/six-tools";
import { SixToolsMemoryHarness } from "../../tools/six-tools-apply";

/** Default host for docs + rare CLI paths (single-session). */
const _defaultSixHost = new SixToolsMemoryHarness();
const _six = createSixTools(_defaultSixHost);
const _companionAct = createCompanionActTool({
  companionAct: (a) => _defaultSixHost.companionAct(a),
});

/** Every `tool()` exposed to Elli — single registry for runtime + docs. */
export const ALL_TOOLS = {
  ..._six,
  companionAct: _companionAct,
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

/** Comma-separated tool keys — for compact prompts (e.g. diagnostic mode). */
export function generateToolNamesLine(): string {
  return Object.keys(ALL_TOOLS)
    .sort()
    .join(", ");
}
