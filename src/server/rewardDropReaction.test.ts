import { afterEach, expect, it, vi } from "vitest";

const chests: unknown[] = [];
vi.mock("../profiles/childChart", () => ({ getChildChart: vi.fn(() => ({ companionCare: { plan: { economy: { nodeChests: chests } } } })) }));
afterEach(() => { chests.length = 0; vi.clearAllMocks(); });

const saved = (bonus?: unknown) => ({ homeworkId: "hw", nodeId: "n1", kind: "rare", rarity: "rare", coins: 35, bonusChance: 0.25, droppedAt: "2026-11-07T00:00:00.000Z", ...(bonus ? { bonus } : {}) });
async function session() {
  const { reactToRewardDrop } = await import("./bossDropAward");
  const fake = { chartChildId: "lab-child", reacted: new Set<string>(), runCompanionResponse: vi.fn(async (_text: string, _source: string) => {}), bargeIn: vi.fn() };
  const host = { chartChildId: fake.chartChildId, reacted: fake.reacted, busy: () => false, bargeIn: fake.bargeIn, respond: (text: string) => fake.runCompanionResponse(text, "system") };
  const react = (input: { homeworkId: string; nodeId: string }) => reactToRewardDrop(host, input);
  return { fake, react };
}

// Owner, 2026-11-07: when a chest drops something, the companion reacts from the saved facts, once.
it("reacts once to the chest the server saved, never to what the screen claims", async () => {
  chests.push(saved({ kind: "item", itemId: "outfit:comet-hoodie" }));
  const { fake, react } = await session();
  await react({ homeworkId: "hw", nodeId: "n1" });
  await react({ homeworkId: "hw", nodeId: "n1" });
  expect(fake.runCompanionResponse).toHaveBeenCalledTimes(1);
  expect(fake.runCompanionResponse.mock.calls[0]).toEqual([expect.stringContaining("Comet Hoodie"), "system"]);
});

it("stays quiet for coins alone or a chest that was never saved", async () => {
  chests.push(saved());
  const { fake, react } = await session();
  await react({ homeworkId: "hw", nodeId: "n1" });
  await react({ homeworkId: "hw", nodeId: "invented" });
  expect(fake.runCompanionResponse).not.toHaveBeenCalled();
});
