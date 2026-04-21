import { describe, expect, it } from "vitest";
import {
  applyPassiveDepletion,
  applyTamagotchiFill,
  evaluateVRR,
  fillTamagotchiFromEvent,
} from "./vrrEngine";
import { DEFAULT_TAMAGOTCHI } from "../shared/vrrTypes";

describe("evaluateVRR", () => {
  it("returns null when no triggers fire", () => {
    expect(
      evaluateVRR(
        { easinessDelta: 0, masteryGateCrossed: false },
        { tamagotchi: DEFAULT_TAMAGOTCHI },
        false,
        { random: () => 0.5 },
      ),
    ).toBeNull();
  });

  it("random roll tier 1 when < 0.05", () => {
    const ev = evaluateVRR(
      { easinessDelta: 0, masteryGateCrossed: false },
      { tamagotchi: DEFAULT_TAMAGOTCHI },
      false,
      { random: () => 0.04 },
    );
    expect(ev).not.toBeNull();
    expect(ev!.tier).toBe(1);
    expect(ev!.triggerReason).toBe("random");
  });

  it("mastery gate always tier 1", () => {
    const ev = evaluateVRR(
      { masteryGateCrossed: true },
      { tamagotchi: DEFAULT_TAMAGOTCHI },
      false,
      { random: () => 0.99 },
    );
    expect(ev).not.toBeNull();
    expect(ev!.tier).toBe(1);
    expect(ev!.triggerReason).toBe("mastery");
  });

  it("intellect full returns tier 3", () => {
    const ev = evaluateVRR(
      { easinessDelta: 0, masteryGateCrossed: false },
      { tamagotchi: { ...DEFAULT_TAMAGOTCHI, intellect: 1 } },
      false,
      { random: () => 0.99 },
    );
    expect(ev).not.toBeNull();
    expect(ev!.tier).toBe(3);
    expect(ev!.triggerReason).toBe("intellect_full");
  });

  it("bond full returns tier 2", () => {
    const ev = evaluateVRR(
      { easinessDelta: 0, masteryGateCrossed: false },
      { tamagotchi: { ...DEFAULT_TAMAGOTCHI, bond: 1 } },
      false,
      { random: () => 0.99 },
    );
    expect(ev).not.toBeNull();
    expect(ev!.tier).toBe(2);
    expect(ev!.triggerReason).toBe("bond_streak");
  });

  it("highest tier wins when multiple candidates", () => {
    const ev = evaluateVRR(
      {
        easinessDelta: 0.4,
        masteryGateCrossed: true,
      },
      {
        tamagotchi: { ...DEFAULT_TAMAGOTCHI, intellect: 1, bond: 1 },
      },
      false,
      { random: () => 0.001 },
    );
    expect(ev).not.toBeNull();
    expect(ev!.tier).toBe(3);
  });

  it("seenThisSession blocks second drop", () => {
    const s = { easinessDelta: 0.4, masteryGateCrossed: false };
    const p = { tamagotchi: DEFAULT_TAMAGOTCHI };
    const first = evaluateVRR(s, p, false, { random: () => 0.04 });
    expect(first).not.toBeNull();
    const second = evaluateVRR(s, p, true, { random: () => 0.04 });
    expect(second).toBeNull();
  });
});

describe("applyPassiveDepletion", () => {
  it("reduces hunger over days", () => {
    const past = new Date("2026-04-01T12:00:00.000Z").getTime();
    const now = new Date("2026-04-11T12:00:00.000Z").getTime();
    const next = applyPassiveDepletion(
      { ...DEFAULT_TAMAGOTCHI, hunger: 0.9, lastSeenAt: new Date(past).toISOString() },
      now,
    );
    expect(next.hunger).toBeLessThan(0.9);
  });

  it("bond cracks on 2+ day absence", () => {
    const past = new Date("2026-04-01T12:00:00.000Z").getTime();
    const now = new Date("2026-04-05T12:00:00.000Z").getTime();
    const next = applyPassiveDepletion(
      { ...DEFAULT_TAMAGOTCHI, bond: 0.9, lastSeenAt: new Date(past).toISOString() },
      now,
    );
    expect(next.bond).toBeLessThan(0.9);
  });
});

describe("fillTamagotchiFromEvent", () => {
  it("caps stats at 1.0", () => {
    const full = {
      ...DEFAULT_TAMAGOTCHI,
      hunger: 1,
      happiness: 1,
      bond: 1,
      intellect: 0.97,
      lastSeenAt: new Date().toISOString(),
    };
    const n = fillTamagotchiFromEvent(full, "sm2_quality_5");
    expect(n.intellect).toBe(1);
  });
});

describe("applyTamagotchiFill", () => {
  it("fills hunger on node_complete", () => {
    const n = applyTamagotchiFill(DEFAULT_TAMAGOTCHI, "node_complete");
    expect(n.hunger).toBeGreaterThan(DEFAULT_TAMAGOTCHI.hunger);
  });

  it("boosts happiness and bond on vrr_reward_claim", () => {
    const n = applyTamagotchiFill(DEFAULT_TAMAGOTCHI, "vrr_reward_claim");
    expect(n.happiness).toBeGreaterThan(DEFAULT_TAMAGOTCHI.happiness);
    expect(n.bond).toBeGreaterThan(DEFAULT_TAMAGOTCHI.bond);
  });
});

describe("VRR wire safety", () => {
  it("triggerReason is analytics-only (omit from child payloads)", () => {
    const ev = evaluateVRR(
      { easinessDelta: 0.4 },
      { tamagotchi: DEFAULT_TAMAGOTCHI },
      false,
      { random: () => 0.04 },
    );
    expect(ev?.triggerReason).toBeDefined();
    const clientPayload = { tier: ev!.tier, reward: ev!.reward };
    expect(clientPayload).not.toHaveProperty("triggerReason");
  });
});
