import type { BossDropTier, CompanionStoreItem } from "./companionCareTypes";

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
  /** Coins to buy it outright (the wardrobe store's price); absent means it can only be found in chests. */
  price?: number;
};

export const REWARD_CATALOG: readonly RewardItem[] = [
  { id: "game:asteroid", kind: "game", name: "Asteroid", icon: "🚀", rarity: "rare", gameId: "asteroid" },
  { id: "game:space-frogger", kind: "game", name: "Space Frogger", icon: "🐸", rarity: "epic", gameId: "space-frogger" },
  { id: "game:space-invaders", kind: "game", name: "Space Invaders", icon: "👾", rarity: "legendary", gameId: "space-invaders" },
  { id: "outfit:cat-ears", kind: "outfit", name: "Cat Ears", icon: "🐱", rarity: "common", wardrobeItemId: "cat-ears", price: 40 },
  { id: "outfit:royal-crown", kind: "outfit", name: "Royal Crown", icon: "👑", rarity: "common", wardrobeItemId: "royal-crown", price: 50 },
  { id: "outfit:star-halo", kind: "outfit", name: "Star Halo", icon: "✨", rarity: "rare", wardrobeItemId: "star-halo", price: 60 },
  { id: "outfit:comet-hoodie", kind: "outfit", name: "Comet Hoodie", icon: "🧥", rarity: "rare", wardrobeItemId: "comet-hoodie" },
  { id: "outfit:navy-ribbon-dress", kind: "outfit", name: "Navy Ribbon Dress", icon: "👗", rarity: "epic", wardrobeItemId: "sleeveless-dress", price: 130 },
  { id: "outfit:teal-ribbon-dress", kind: "outfit", name: "Teal Ribbon Dress", icon: "👗", rarity: "epic", wardrobeItemId: "teal-ribbon-dress", price: 130 },
  { id: "outfit:plum-ribbon-dress", kind: "outfit", name: "Plum Ribbon Dress", icon: "👗", rarity: "epic", wardrobeItemId: "plum-ribbon-dress", price: 150 },
  { id: "outfit:rose-ribbon-dress", kind: "outfit", name: "Rose Ribbon Dress", icon: "👗", rarity: "legendary", wardrobeItemId: "rose-ribbon-dress", price: 150 },
];

/** What coins buy (owner, 2026-11-07): coins must be scarce enough to mean something. One board pays about
 * 50-70 coins (option B, from the replay), enough for one or two treats, so she chooses or saves. */
export const PRICE_LIST = { gamePlay: 25, callMinutes5: 30, mysteryChest: 60 } as const;
/** The earned call (owner, 2026-11-07): finishing a board earns a call with free minutes; after that the
 * call burns minutes and more cost coins, so she wants to come back and earn again. Placeholder until tuned. */
export const CALL_RULES = { freeMinutesPerBoard: 5, warnAtSecondsLeft: 60 } as const;
/** Reward games are timed (owner, 2026-11-08): one game play (PRICE_LIST.gamePlay) buys these minutes on the
 * same paid-minute meter as the call; at time up she inserts another coin or goes back to her map. */
export const ARCADE_RULES = { minutesPerPlay: 3, warnAtSecondsLeft: 60 } as const;

/** What each chest pays: coins always, and a bonus by chance (call minutes or a catalog item). */
/** Option B (owner, 2026-11-07), tuned on a replay of the girls' real history: about 50-70 coins a session,
 * so a call top-up or a game is a session's treat and a dress is a week's goal. */
export const CHEST_TABLE: Record<RewardRarity, { coins: number; coinRange: readonly [number, number]; bonusChance: number; minutes: number }> = {
  // Loot like World of Warcraft (owner, 2026-11-08): with ITEM_SHARE 0.75, an item drops from about 1/3 of
  // common chests, 1/2 of rare and 3/4 of epic and legendary; the rest of a bonus is call minutes.
  common: { coins: 8, coinRange: [5, 11], bonusChance: 0.45, minutes: 2 },
  rare: { coins: 16, coinRange: [12, 20], bonusChance: 0.67, minutes: 3 },
  epic: { coins: 30, coinRange: [24, 36], bonusChance: 1, minutes: 5 },
  legendary: { coins: 60, coinRange: [50, 70], bonusChance: 1, minutes: 10 },
};

/** Every chest is a surprise (owner, 2026-11-07, after Ila's session): a stop's kind is only the floor; the chest
 * rolls its rarity from these odds, then its coins within that rarity's range. Average stays about 11 per stop. */
export const CHEST_RARITY_ODDS: ReadonlyArray<{ rarity: RewardRarity; below: number }> = [
  { rarity: "common", below: 0.7 },
  { rarity: "rare", below: 0.92 },
  { rarity: "epic", below: 0.99 },
  { rarity: "legendary", below: Infinity },
];
/** Of the bonuses, the share that is a catalog item while she still has items to find; the rest is call minutes. */
export const ITEM_SHARE = 0.75;
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

/** Food in the store (Elli and her creatures eat the same food), by price. */
export const COMPANION_STORE_ITEMS: readonly CompanionStoreItem[] = [
  { id: "apple_bite", label: "Apple Bite", cost: 25, rarity: "common" },
  { id: "star_candy", label: "Star Candy", cost: 50, rarity: "uncommon" },
  { id: "mystery_snack", label: "Mystery Snack", cost: 100, rarity: "rare" },
];
