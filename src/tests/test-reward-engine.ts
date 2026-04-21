import { describe, expect, it } from "vitest";
import { sessionEventBus } from "../server/session-event-bus";
import { RewardEngine } from "../server/reward-engine";

describe("RewardEngine", () => {
  it("tracks streak on correct_answer", () => {
    const sent: string[] = [];
    const engine = new RewardEngine();
    engine.attach((type) => sent.push(type), "Ila", "ila", "sid");
    sessionEventBus.fire({
      type: "correct_answer",
      sessionId: "sid",
      childId: "ila",
      timestamp: Date.now(),
    });
    sessionEventBus.fire({
      type: "correct_answer",
      sessionId: "sid",
      childId: "ila",
      timestamp: Date.now(),
    });
    expect(engine.getCorrectStreak()).toBe(2);
    sessionEventBus.fire({
      type: "wrong_answer",
      sessionId: "sid",
      childId: "ila",
      timestamp: Date.now(),
    });
    expect(engine.getCorrectStreak()).toBe(0);
    expect(sent.some((t) => t === "reward")).toBe(true);
    engine.detach();
  });
});
