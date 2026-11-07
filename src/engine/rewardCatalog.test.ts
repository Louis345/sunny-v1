import { describe, expect, it } from "vitest";
import { CHEST_TABLE, PRICE_LIST, REWARD_CATALOG, eligibleDrops, dropChance, collectionView } from "../shared/rewardCatalog";
import { REWARD_GAMES } from "../shared/gameRegistry.generated";

// Owner, 2026-11-07: one catalog of everything she can earn, shown greyed out until she finds it in a chest,
// so new content is one more entry, never new plumbing.
describe("reward catalog", () => {
  it("lists each collectible once, and every game is a registered reward game", () => {
    const ids = REWARD_CATALOG.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of REWARD_CATALOG.filter(row => row.kind === "game")) expect(REWARD_GAMES[item.gameId!], item.id).toBeTruthy();
    expect(REWARD_CATALOG.some(item => item.kind === "outfit")).toBe(true);
  });

  it("drops only items she does not own, no rarer than the chest", () => {
    const fromRare = eligibleDrops("rare", []).map(item => item.rarity);
    expect(fromRare.length).toBeGreaterThan(0);
    expect(fromRare.every(rarity => rarity === "common" || rarity === "rare")).toBe(true);
    const owned = eligibleDrops("legendary", []).map(item => item.id);
    expect(eligibleDrops("legendary", owned)).toEqual([]);
  });

  it("shows the real chance a chest drops an item, and none for an item she owns or a chest too plain for it", () => {
    const legendaryItem = REWARD_CATALOG.find(item => item.rarity === "legendary")!;
    expect(dropChance(legendaryItem, "rare", [])).toBe(0);
    const commonItem = REWARD_CATALOG.find(item => item.rarity === "common")!;
    const pool = eligibleDrops("epic", []).length;
    expect(dropChance(commonItem, "epic", [])).toBeCloseTo(0.5 * 0.5 / pool);
    expect(dropChance(commonItem, "epic", [commonItem.id])).toBe(0);
  });

  it("builds the collection: everything, owned first in colour, the rest locked with where to find them", () => {
    const owned = [REWARD_CATALOG[0].id];
    const view = collectionView(owned);
    expect(view).toHaveLength(REWARD_CATALOG.length);
    expect(view.find(row => row.item.id === owned[0])).toMatchObject({ owned: true });
    const locked = view.find(row => !row.owned)!;
    expect(locked.bestChest).toBeTruthy();
    expect(locked.bestChance).toBeGreaterThan(0);
  });
});

// Owner, 2026-11-07 (option B, tuned on a replay of the girls' real history): a typical session earns a
// treat or two (a call top-up or a game) but never a dress; a dress is a goal she saves for over the week.
it("a typical session pays for a small treat but not a dress", () => {
  const typicalSession = 5 * CHEST_TABLE.common.coins + CHEST_TABLE.rare.coins;
  expect(typicalSession).toBeGreaterThanOrEqual(PRICE_LIST.callMinutes5);
  expect(typicalSession).toBeGreaterThanOrEqual(PRICE_LIST.gamePlay);
  const cheapestDress = Math.min(...REWARD_CATALOG.filter(item => item.name.includes("Dress") && item.price).map(item => item.price!));
  expect(cheapestDress).toBeGreaterThanOrEqual(2 * typicalSession);
  const outfitTotal = REWARD_CATALOG.reduce((sum, item) => sum + (item.price ?? 0), 0);
  expect(outfitTotal).toBeGreaterThanOrEqual(10 * typicalSession);
});
