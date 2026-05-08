import { describe, expect, it, vi } from "vitest";

import { hostSessionEnd } from "./host-tool-handlers";
import { finalizePendingSessionEnd } from "./companion-response-runner";
import { runHandleToolCall } from "./tool-call-router";

describe("hostSessionEnd", () => {
  it("defers finalization until the active companion turn is recorded", async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const session: any = { end };

    const result = await hostSessionEnd(
      session,
      { childName: "Ray-nah", reason: "child_requested" },
    );

    expect(end).not.toHaveBeenCalled();
    expect(session.pendingSessionEndRequest).toEqual({
      childName: "Ray-nah",
      reason: "child_requested",
    });
    expect(result).toEqual({
      ended: true,
      childName: "Ray-nah",
      reason: "child_requested",
      finalization: "after_agent_turn",
    });
  });

  it("finalizes exactly once after the companion turn is recorded", async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const session = {
      end,
      pendingSessionEndRequest: {
        childName: "Ray-nah",
        reason: "child_requested",
      },
    };

    await expect(finalizePendingSessionEnd(session)).resolves.toBe(true);

    expect(end).toHaveBeenCalledTimes(1);
    expect(session.pendingSessionEndRequest).toBeNull();
  });

  it("does not emit session_ended from the router before deferred finalization", () => {
    const send = vi.fn();
    const session = {
      normalizeToolName: (tool: string) => tool,
      send,
      toolCallsMadeThisTurn: 0,
    };

    runHandleToolCall(
      session,
      "sessionEnd",
      { reason: "child_requested" },
      { ended: true },
    );

    expect(send).toHaveBeenCalledWith(
      "tool_call",
      expect.objectContaining({ tool: "sessionEnd" }),
    );
    expect(send).not.toHaveBeenCalledWith("session_ended", expect.anything());
  });
});
