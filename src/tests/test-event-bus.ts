import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import * as mapCoord from "../server/map-coordinator";
import { sessionEventBus } from "../server/session-event-bus";
import { createTakeGameScreenshotTool } from "../agents/elli/tools/takeGameScreenshot";
/** Registers `routeEventToCompanion` on the bus (tests may run this file alone). */
import "../server/companion-bridge";

describe("SessionEventBus", () => {
  it("fires to subscribers", () => {
    const seen: string[] = [];
    const unsub = sessionEventBus.subscribe("correct_answer", (ev) => {
      seen.push(`${ev.childId}:${ev.sessionId}`);
    });
    sessionEventBus.fire({
      type: "correct_answer",
      childId: "ila",
      sessionId: "s1",
      timestamp: 1,
    });
    expect(seen).toEqual(["ila:s1"]);
    unsub();
  });

  it("unsubscribe stops delivery", () => {
    let n = 0;
    const unsub = sessionEventBus.subscribe("wrong_answer", () => {
      n++;
    });
    sessionEventBus.fire({
      type: "wrong_answer",
      childId: "ila",
      sessionId: "s1",
      timestamp: 1,
    });
    expect(n).toBe(1);
    unsub();
    sessionEventBus.fire({
      type: "wrong_answer",
      childId: "ila",
      sessionId: "s1",
      timestamp: 1,
    });
    expect(n).toBe(1);
  });

  it("CompanionBridge routes correct_answer to emote broadcast", () => {
    const spy = vi.spyOn(mapCoord, "broadcastCompanionEventToMapChild");
    sessionEventBus.fire({
      type: "correct_answer",
      sessionId: "sid-map",
      childId: "ila",
      timestamp: Date.now(),
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("CompanionBridge routes correct_answer for any sessionId (companion emotes are not preview-suppressed)", () => {
    const spy = vi.spyOn(mapCoord, "broadcastCompanionEventToMapChild");
    sessionEventBus.fire({
      type: "correct_answer",
      sessionId: "pv1",
      childId: "ila",
      timestamp: Date.now(),
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("takeGameScreenshot tool", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null on timeout", async () => {
    const tool = createTakeGameScreenshotTool({
      requestGameScreenshot(_cb: (base64: string | null) => void) {
        /* never completes — exercise tool timeout */
      },
    } as Parameters<typeof createTakeGameScreenshotTool>[0]);
    const exec = (tool as { execute?: (a: object) => Promise<unknown> }).execute;
    expect(exec).toBeDefined();
    const p = exec!({});
    await vi.advanceTimersByTimeAsync(5001);
    const out = (await p) as { screenshot?: string | null };
    expect(out?.screenshot).toBeNull();
  });
});
