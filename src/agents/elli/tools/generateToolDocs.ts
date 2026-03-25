import type { Tool } from "ai";
import { endSession } from "./endSession";
import { transitionToWork } from "./transitionToWork";
import { logAttempt } from "./logAttempt";
import { dateTime } from "./dateTime";
import { mathProblem } from "./mathProblem";
import { riddleTracker } from "./riddleTracker";
import { showCanvas } from "./showCanvas";
import { blackboard } from "./blackboard";
import { startWordBuilder } from "./startWordBuilder";
import { startSpellCheck } from "./startSpellCheck";
import { launchGame } from "./launchGame";

/** Every `tool()` exposed to Elli — single registry for runtime + docs. */
export const ALL_TOOLS = {
  endSession,
  transitionToWork,
  logAttempt,
  dateTime,
  mathProblem,
  riddleTracker,
  showCanvas,
  blackboard,
  startWordBuilder,
  startSpellCheck,
  launchGame,
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
