import { expect, it } from "vitest";
import { discoveryCompletionRewards } from "../utils/canonicalNodeCompletion";

// Owner, 2026-11-07: Discovery opens a chest too; the screen takes it from the completion response.
it("reads the Discovery chest and new balance from the completion response, or nothing", () => {
  const chest = { homeworkId: "hw", nodeId: "hw:discovery", kind: "rare", rarity: "rare", coins: 14, bonusChance: 0.25 };
  expect(discoveryCompletionRewards({ ok: true, nodeChest: chest, coinAward: { amount: 14, balance: 199 } })).toEqual({ nodeChest: chest, balance: 199 });
  expect(discoveryCompletionRewards({ ok: true })).toEqual({ nodeChest: null, balance: null });
  expect(discoveryCompletionRewards({ ok: true, nodeChest: { kind: "rare" } })).toEqual({ nodeChest: null, balance: null });
});
