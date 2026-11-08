import { afterEach, describe, expect, it, vi } from "vitest";
import { createStarterCompanionCarePlan } from "../engine/companionCareEngine";
import { CHEST_TABLE } from "../shared/rewardCatalog";
import { awardBossDropOnCompletion, awardNodeChestOnCompletion, rewardDropSystemEvent } from "./bossDropAward";

const saved: unknown[] = [];
vi.mock("../profiles/childChart", () => ({ getChildChart: vi.fn(() => ({ companionCare: { plan: saved.at(-1) ?? createStarterCompanionCarePlan({ childId: "demo-pashley", companionId: "elli" }) } })) }));
vi.mock("../profiles/companionCarePlan", () => ({ saveCompanionCarePlan: vi.fn((_chart, plan) => saved.push(plan)), mirrorCompanionCareToLearningProfile: vi.fn() }));
afterEach(() => { saved.length = 0; vi.clearAllMocks(); });

const cycle = (role: string, state = "completed") => ({ childId: "demo-pashley", homeworkId: "hw", nodes: [{ nodeId: "hw:b9:boss", role, state }] }) as never;

// Owner, 2026-11-05: beating the Boss drops loot; it is saved once and shown again on replay.
it("drops loot once when she finishes a Boss, and the same card on replay", () => {
  const first = awardBossDropOnCompletion(cycle("boss"), "hw:b9:boss", () => 0.9);
  expect(first).toMatchObject({ tier: "epic", coins: 60, bossNodeId: "hw:b9:boss" });
  expect(awardBossDropOnCompletion(cycle("boss"), "hw:b9:boss", () => 0)).toEqual(first);
  expect(saved).toHaveLength(1);
});

it("drops nothing for a Quest, an ordinary stop, or an unfinished Boss", () => {
  expect(awardBossDropOnCompletion(cycle("quest"), "hw:b9:boss")).toBeUndefined();
  expect(awardBossDropOnCompletion(cycle("baseline"), "hw:b9:boss")).toBeUndefined();
  expect(awardBossDropOnCompletion(cycle("boss", "ready"), "hw:b9:boss")).toBeUndefined();
  expect(saved).toHaveLength(0);
});

// Owner, 2026-11-06: every finished stop except the Boss opens a treasure chest; the Boss keeps its loot card.
it("gives a chest for a finished ordinary stop, once, and none for the Boss or an unfinished stop", () => {
  const rolls = [0.1, 0, 0.99]; // stays common, low end of the coin range, no bonus
  const first = awardNodeChestOnCompletion(cycle("baseline"), "hw:b9:boss", () => rolls.shift() ?? 0.99);
  expect(first?.chest).toMatchObject({ kind: "common", coins: CHEST_TABLE.common.coinRange[0] });
  expect(first?.balance).toBe(saved.at(-1) && (saved.at(-1) as { economy: { coins: number } }).economy.coins);
  expect(awardNodeChestOnCompletion(cycle("baseline"), "hw:b9:boss", () => 0)).toEqual(first);
  expect(awardNodeChestOnCompletion(cycle("boss"), "hw:b9:boss")).toBeUndefined();
  expect(awardNodeChestOnCompletion(cycle("quest", "ready"), "hw:b9:boss")).toBeUndefined();
  expect(saved).toHaveLength(1);
});

// Owner, 2026-11-07: when a chest drops something, the companion reacts in her own words from the facts.
describe("what the companion is told when a chest opens", () => {
  const base = { homeworkId: "hw", nodeId: "n1", kind: "rare" as const, rarity: "rare" as const, coins: 35, bonusChance: 0.25, droppedAt: "2026-11-07T00:00:00.000Z" };
  it("says nothing for a chest of coins alone", () => {
    expect(rewardDropSystemEvent(base)).toBeNull();
  });
  it("states the found item as facts, never a line to read", () => {
    const text = rewardDropSystemEvent({ ...base, bonus: { kind: "item", itemId: "outfit:comet-hoodie" } })!;
    expect(text).toMatch(/^\[System event: treasure chest opened\]/);
    expect(text).toContain("Comet Hoodie");
    expect(text).toContain("rare outfit");
    expect(text).toContain("now in her collection");
    expect(text).not.toMatch(/\bsay\b|"/i);
  });
  it("states bonus call minutes", () => {
    expect(rewardDropSystemEvent({ ...base, bonus: { kind: "call_minutes", minutes: 5 } })).toContain("5 extra call minutes");
  });
});

// Owner, 2026-11-07, after Ila's session: she spelled 12 Discovery words and got nothing to open. A finished
// Discovery stop opens a chest too, at least rare, once; an unfinished Discovery gives nothing.
it("opens a chest, at least rare, for a finished Discovery stop", async () => {
  const { awardDiscoveryChest } = await import("./bossDropAward");
  const discovery = (state: string) => ({ childId: "demo-pashley", homeworkId: "hw", nodes: [{ nodeId: "hw:discovery", role: "evaluation", state }] }) as never;
  expect(awardDiscoveryChest(discovery("active"), "hw:discovery")).toBeUndefined();
  const rolls = [0.1, 0, 0.99];
  const opened = awardDiscoveryChest(discovery("completed"), "hw:discovery", () => rolls.shift() ?? 0.99);
  expect(opened?.chest).toMatchObject({ kind: "rare", rarity: "rare", nodeId: "hw:discovery" });
  expect(awardDiscoveryChest(discovery("completed"), undefined)?.chest).toEqual(opened?.chest);
  expect(saved).toHaveLength(1);
});
