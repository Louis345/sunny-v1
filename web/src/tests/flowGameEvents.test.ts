import { afterEach, describe, expect, it, vi } from "vitest";
import { createFlowGameEvents } from "../utils/flowGameEvents";

describe("createFlowGameEvents", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports flow-state attempts through the shared attempt_event contract", () => {
    vi.spyOn(Date, "now").mockReturnValue(12345);
    const sendMessage = vi.fn();
    const bridge = createFlowGameEvents({
      game: "word-radar",
      childId: "ila",
      sendMessage,
    });

    bridge.reportAttempt({
      domain: "spelling",
      target: "blister",
      attemptedValue: "blster",
      correct: false,
      quality: 1,
      scaffoldLevel: 0,
    });

    expect(sendMessage).toHaveBeenCalledWith("game_event", {
      event: {
        type: "attempt_event",
        payload: expect.objectContaining({
          childId: "ila",
          domain: "spelling",
          target: "blister",
          attemptedValue: "blster",
          correct: false,
          quality: 1,
          scaffoldLevel: 0,
          attemptId: expect.stringMatching(/^word-radar:12345:/),
          timestamp: 12345,
        }),
        version: "1.0",
      },
    });
  });
});
