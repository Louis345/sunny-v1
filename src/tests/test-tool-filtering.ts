/**
 * Contract: The tool set passed to runAgent() must vary by session type.
 * - worksheet → NO showCanvas, NO mathProblem. YES logWorksheetAttempt.
 * - freeform → YES showCanvas, YES mathProblem. NO logWorksheetAttempt.
 * - spelling → YES blackboard. NO showCanvas.
 * - wordle → session-specific tools only.
 */
import { describe, it, expect } from "vitest";
import { getToolsForSessionType } from "../server/session-type-registry";

describe("tool filtering by session type", () => {
  it("worksheet sessions exclude showCanvas and mathProblem", () => {
    const tools = getToolsForSessionType("worksheet");
    const toolNames = Object.keys(tools);
    expect(toolNames).not.toContain("showCanvas");
    expect(toolNames).not.toContain("mathProblem");
    expect(toolNames).toContain("logWorksheetAttempt");
    expect(toolNames).toContain("transitionToWork");
    expect(toolNames).toContain("dateTime");
  });

  it("freeform sessions include showCanvas and mathProblem", () => {
    const tools = getToolsForSessionType("freeform");
    const toolNames = Object.keys(tools);
    expect(toolNames).toContain("showCanvas");
    expect(toolNames).toContain("mathProblem");
    expect(toolNames).toContain("logAttempt");
    expect(toolNames).not.toContain("logWorksheetAttempt");
  });

  it("spelling sessions include blackboard but not showCanvas", () => {
    const tools = getToolsForSessionType("spelling");
    const toolNames = Object.keys(tools);
    expect(toolNames).toContain("blackboard");
    expect(toolNames).not.toContain("showCanvas");
    expect(toolNames).toContain("logAttempt");
  });

  it("every session type includes dateTime", () => {
    const types = ["freeform", "worksheet", "spelling", "wordle"] as const;
    for (const t of types) {
      const tools = getToolsForSessionType(t);
      expect(Object.keys(tools)).toContain("dateTime");
    }
  });

  it("unknown session type defaults to freeform tools", () => {
    const tools = getToolsForSessionType("unknown_garbage" as never);
    const toolNames = Object.keys(tools);
    expect(toolNames).toContain("showCanvas");
  });
});
