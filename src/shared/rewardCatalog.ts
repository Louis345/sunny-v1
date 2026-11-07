import type { BossDropTier } from "./companionCareTypes";

/** Everything a child can earn (owner, 2026-11-07). She sees all of it, greyed out until a chest drops it,
 * so new content is one more entry here, never new plumbing. Rewards follow the learning; they never change
 * learning evidence or choose an educational step. Placeholder rarities and odds until the owner tunes them. */
export type RewardRarity = BossDropTier;
export type RewardItem = {
  id: string;
  kind: "game" | "outfit";
  name: string;
  icon: string;
  rarity: RewardRarity;
  /** A key of REWARD_GAMES in the game registry. */
  gameId?: string;
  /** An item id in the wardrobe store catalog. */
  wardrobeItemId?: string;
};

export const REWARD_CATALOG: readonly RewardItem[] = [
  { id: "game:asteroid", kind: "game", name: "Asteroid", icon: "🚀", rarity: "rare", gameId: "asteroid" },
  { id: "game:space-frogger", kind: "game", name: "Space Frogger", icon: "🐸", rarity: "epic", gameId: "space-frogger" },
  { id: "game:space-invaders", kind: "game", name: "Space Invaders", icon: "👾", rarity: "legendary", gameId: "space-invaders" },
  { id: "outfit:cat-ears", kind: "outfit", name: "Cat Ears", icon: "🐱", rarity: "common", wardrobeItemId: "cat-ears" },
  { id: "outfit:royal-crown", kind: "outfit", name: "Royal Crown", icon: "👑", rarity: "common", wardrobeItemId: "royal-crown" },
  { id: "outfit:star-halo", kind: "outfit", name: "Star Halo", icon: "✨", rarity: "rare", wardrobeItemId: "star-halo" },
  { id: "outfit:comet-hoodie", kind: "outfit", name: "Comet Hoodie", icon: "🧥", rarity: "rare", wardrobeItemId: "comet-hoodie" },
  { id: "outfit:navy-ribbon-dress", kind: "outfit", name: "Navy Ribbon Dress", icon: "👗", rarity: "epic", wardrobeItemId: "sleeveless-dress" },
  { id: "outfit:teal-ribbon-dress", kind: "outfit", name: "Teal Ribbon Dress", icon: "👗", rarity: "epic", wardrobeItemId: "teal-ribbon-dress" },
  { id: "outfit:plum-ribbon-dress", kind: "outfit", name: "Plum Ribbon Dress", icon: "👗", rarity: "epic", wardrobeItemId: "plum-ribbon-dress" },
  { id: "outfit:rose-ribbon-dress", kind: "outfit", name: "Rose Ribbon Dress", icon: "👗", rarity: "legendary", wardrobeItemId: "rose-ribbon-dress" },
];

/** What each chest pays: coins always, and a bonus by chance (call minutes or a catalog item). */
export const CHEST_TABLE: Record<RewardRarity, { coins: number; bonusChance: number; minutes: number }> = {
  common: { coins: 25, bonusChance: 0.1, minutes: 5 },
  rare: { coins: 35, bonusChance: 0.25, minutes: 5 },
  epic: { coins: 60, bonusChance: 0.5, minutes: 10 },
  legendary: { coins: 120, bonusChance: 1, minutes: 15 },
};
/** Of the bonuses, the share that is a catalog item while she still has items to find; the rest is call minutes. */
export const ITEM_SHARE = 0.5;
const RANK: Record<RewardRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
const CHESTS: RewardRarity[] = ["common", "rare", "epic", "legendary"];

/** Items a chest of this rarity can drop: ones she does not own, no rarer than the chest. */
export function eligibleDrops(chest: RewardRarity, ownedIds: readonly string[]): RewardItem[] {
  return REWARD_CATALOG.filter(item => !ownedIds.includes(item.id) && RANK[item.rarity] <= RANK[chest]);
}

/** The chance one chest drops this item, before any pity bonus. */
export function dropChance(item: RewardItem, chest: RewardRarity, ownedIds: readonly string[]): number {
  const pool = eligibleDrops(chest, ownedIds);
  if (!pool.some(row => row.id === item.id)) return 0;
  return CHEST_TABLE[chest].bonusChance * ITEM_SHARE / pool.length;
}

export type CollectionEntry = { item: RewardItem; owned: boolean; bestChest?: RewardRarity; bestChance?: number };

/** Her collection: everything, owned first, then the rest by rarity with the chest most likely to drop each. */
export function collectionView(ownedIds: readonly string[]): CollectionEntry[] {
  return REWARD_CATALOG.map(item => {
    if (ownedIds.includes(item.id)) return { item, owned: true };
    const [bestChest, bestChance] = CHESTS.map(chest => [chest, dropChance(item, chest, ownedIds)] as const)
      .reduce((best, row) => row[1] > best[1] ? row : best);
    return { item, owned: false, bestChest, bestChance };
  }).sort((a, b) => Number(b.owned) - Number(a.owned) || RANK[a.item.rarity] - RANK[b.item.rarity]);
}
