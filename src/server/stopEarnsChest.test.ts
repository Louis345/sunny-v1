import { describe, expect, it } from "vitest";
import { stopEarnsChest } from "./bossDropAward";

// Ila, 2026-11-22: "When I made a mistake / didn't finish, I go to the treasure chest." Seen on Saori: her Mystery
// reward break (an arcade game) ran out of time at 23:45:32 and the kiosk sent it as completed; a chest opened 1 s later.
describe("a chest opens only for a stop she finished", () => {
  it("a finished stop opens a chest, misses along the way included", () => {
    expect(stopEarnsChest({ completed: true, won: true })).toBe(true);
    expect(stopEarnsChest({ completed: true })).toBe(true);
  });
  it("leaving early, losing or not finishing opens none", () => {
    expect(stopEarnsChest({ completed: false })).toBe(false);
    expect(stopEarnsChest({ completed: true, earlyExit: true })).toBe(false);
    expect(stopEarnsChest({ completed: true, won: false })).toBe(false);
  });
  it("a reward break ending (time up or back to map) opens none: the break was the reward", () => {
    expect(stopEarnsChest({ completed: true, rewardBreak: "finished", score: 40 })).toBe(false);
  });
});
