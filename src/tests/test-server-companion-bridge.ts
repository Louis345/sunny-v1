import { describe, expect, it, vi } from "vitest";
import * as mapCoord from "../server/map-coordinator";
import { sessionEventBus } from "../server/session-event-bus";
import {
  ServerCompanionBridge,
  clearPreviewSession,
  markSessionAsPreview,
} from "../server/companion-bridge";

describe("ServerCompanionBridge", () => {
  it("routes correct_answer to map broadcast via global EventBus", () => {
    const spy = vi.spyOn(mapCoord, "broadcastCompanionEventToMapChild");
    sessionEventBus.fire({
      type: "correct_answer",
      sessionId: "x",
      childId: "ila",
      timestamp: Date.now(),
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("preview mode suppresses reactive companion events (global bus)", () => {
    const spy = vi.spyOn(mapCoord, "broadcastCompanionEventToMapChild");
    markSessionAsPreview("x");
    sessionEventBus.fire({
      type: "correct_answer",
      sessionId: "x",
      childId: "ila",
      timestamp: Date.now(),
    });
    expect(spy).not.toHaveBeenCalled();
    clearPreviewSession("x");
    spy.mockRestore();
  });

  it("expressCompanion still sends when bridge attached", async () => {
    const spy = vi.spyOn(mapCoord, "broadcastCompanionEventToMapChild");
    const sent: string[] = [];
    const bridge = new ServerCompanionBridge();
    bridge.attach(
      "ila",
      (type) => {
        sent.push(type);
      },
      true,
    );
    await bridge.expressCompanion({ emote: "happy" });
    expect(sent).toContain("companion_event");
    expect(spy).toHaveBeenCalled();
    bridge.detach();
    spy.mockRestore();
  });
});
