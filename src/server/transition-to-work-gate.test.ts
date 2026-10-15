import { describe, expect, it, vi } from "vitest";
import * as gate from "./transition-to-work-gate";
import { runCompanionResponseForSession } from "./companion-response-runner";

describe("resolved session companion transition policy", () => {
  // The human heard silence after successful STT: the demo child is registered,
  // but has no legacy COMPANIONS_BY_CHILD entry. Bootstrap had already selected
  // Elli. Prior tests used legacy child names and missed this second lookup.
  it("supports a resolved companion with no work-transition policy", () => {
    expect(gate.shouldTriggerTransitionToWorkPhase(1, {}, false)).toBe(false);
  });
  it("preserves the selected companion's threshold and one-time transition", () => {
    const companion = { transitionToWorkAfterRounds: 3 };
    expect(gate.shouldTriggerTransitionToWorkPhase(2, companion, false)).toBe(false);
    expect(gate.shouldTriggerTransitionToWorkPhase(3, companion, false)).toBe(true);
    expect(gate.shouldTriggerTransitionToWorkPhase(4, companion, true)).toBe(false);
  });
  it("passes the actual selected companion from a demo session into the gate", async () => {
    const companion = { name: "Elli" };
    const spy = vi.spyOn(gate, "shouldTriggerTransitionToWorkPhase").mockImplementation(() => { throw new Error("gate reached"); });
    try {
      await expect(runCompanionResponseForSession({
        sessionId: "demo-regression", childName: "Demo-pashley", companion,
        roundNumber: 1, transitionedToWork: false,
        turnSM: { getState: () => "IDLE", onStartCompanionFromIdle: vi.fn() },
      }, "Elli, can you hear me?")).rejects.toThrow("gate reached");
      expect(spy).toHaveBeenCalledWith(1, companion, false);
    } finally { spy.mockRestore(); }
  });
});
