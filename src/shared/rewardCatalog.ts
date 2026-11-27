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
  /** Where she wears it: on her head (an accessory) or as her clothes. */
  slot?: "head" | "body";
  /** A seasonal drop: chests give it only inside the season's window; once won it is hers forever. */
  season?: string;
};

/** Christmas drop 2026 (owner, 2026-11-25): chest-only items, dropped Nov 27 to Jan 6 (inclusive). Opened early on 11-27 so the kids see it this weekend. */
export const CHRISTMAS_2026 = { id: "christmas-2026", name: "Christmas", from: "2026-11-27", until: "2027-01-06" } as const;
const SEASONS: Record<string, { from: string; until: string }> = { [CHRISTMAS_2026.id]: CHRISTMAS_2026 };
/** The family's calendar day (the kiosk is in New York), so the window opens at their midnight, not UTC's. */
function familyDay(nowIso: string): string {
  return new Date(nowIso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
/** Whether a chest can drop this item now. Items with no season are always in. */
export function inSeason(item: RewardItem, nowIso: string): boolean {
  const season = item.season ? SEASONS[item.season] : undefined;
  if (!season) return item.season === undefined;
  const day = familyDay(nowIso);
  return day >= season.from && day <= season.until;
}
/** A season that has ended: what she never won leaves her collection; what she won stays. */
function seasonOver(item: RewardItem, nowIso: string): boolean {
  const season = item.season ? SEASONS[item.season] : undefined;
  return Boolean(season && familyDay(nowIso) > season.until);
}
const christmas = (wardrobeItemId: string, name: string, icon: string, rarity: RewardRarity, slot: "head" | "body"): RewardItem =>
  ({ id: `outfit:${wardrobeItemId}`, kind: "outfit", name, icon, rarity, wardrobeItemId, slot, season: CHRISTMAS_2026.id });

export const REWARD_CATALOG: readonly RewardItem[] = [
  { id: "game:asteroid", kind: "game", name: "Asteroid", icon: "🚀", rarity: "rare", gameId: "asteroid" },
  { id: "game:space-frogger", kind: "game", name: "Space Frogger", icon: "🐸", rarity: "epic", gameId: "space-frogger" },
  { id: "game:space-invaders", kind: "game", name: "Space Invaders", icon: "👾", rarity: "legendary", gameId: "space-invaders" },
  { id: "outfit:cat-ears", kind: "outfit", name: "Cat Ears", icon: "🐱", rarity: "common", wardrobeItemId: "cat-ears", price: 40 },
  { id: "outfit:royal-crown", kind: "outfit", name: "Royal Crown", icon: "👑", rarity: "common", wardrobeItemId: "royal-crown", price: 50 },
  { id: "outfit:star-halo", kind: "outfit", name: "Star Halo", icon: "✨", rarity: "rare", wardrobeItemId: "star-halo", price: 60 },
  { id: "outfit:comet-hoodie", kind: "outfit", name: "Comet Hoodie", icon: "🧥", rarity: "rare", wardrobeItemId: "comet-hoodie", price: 110 },
  { id: "outfit:constellation-blazer", kind: "outfit", name: "Constellation Blazer", icon: "🧥", rarity: "epic", wardrobeItemId: "constellation-blazer", price: 120 },
  { id: "outfit:navy-ribbon-dress", kind: "outfit", name: "Navy Ribbon Dress", icon: "👗", rarity: "epic", wardrobeItemId: "sleeveless-dress", price: 130 },
  { id: "outfit:teal-ribbon-dress", kind: "outfit", name: "Teal Ribbon Dress", icon: "👗", rarity: "epic", wardrobeItemId: "teal-ribbon-dress", price: 130 },
  { id: "outfit:plum-ribbon-dress", kind: "outfit", name: "Plum Ribbon Dress", icon: "👗", rarity: "epic", wardrobeItemId: "plum-ribbon-dress", price: 150 },
  { id: "outfit:rose-ribbon-dress", kind: "outfit", name: "Rose Ribbon Dress", icon: "👗", rarity: "legendary", wardrobeItemId: "rose-ribbon-dress", price: 150 },
  { id: "outfit:sky-ribbon-dress", kind: "outfit", name: "Sky Ribbon Dress", icon: "👗", rarity: "epic", wardrobeItemId: "sky-ribbon-dress", price: 130 },
  { id: "outfit:sunflower-ribbon-dress", kind: "outfit", name: "Sunflower Ribbon Dress", icon: "👗", rarity: "epic", wardrobeItemId: "sunflower-ribbon-dress", price: 140 },
  { id: "outfit:sunset-ribbon-dress", kind: "outfit", name: "Sunset Ribbon Dress", icon: "👗", rarity: "epic", wardrobeItemId: "sunset-ribbon-dress", price: 140 },
  christmas("santa-hat", "Santa Hat", "🎅", "common", "head"),
  christmas("elf-hat", "Elf Hat", "🧝", "common", "head"),
  christmas("earmuffs", "Snow Earmuffs", "❄️", "common", "head"),
  christmas("pompom-beanie", "Pom-pom Beanie", "🧶", "common", "head"),
  christmas("candy-cane-bow", "Candy Cane Bow", "🍬", "rare", "head"),
  christmas("jingle-bell-bow", "Jingle Bell Bow", "🔔", "rare", "head"),
  christmas("mistletoe-headband", "Mistletoe Headband", "🌿", "rare", "head"),
  christmas("gingerbread-clip", "Gingerbread Clip", "🍪", "rare", "head"),
  christmas("reindeer-antlers", "Reindeer Antlers", "🦌", "epic", "head"),
  christmas("holly-crown", "Holly Crown", "🎄", "epic", "head"),
  christmas("star-topper", "Tree-top Star", "⭐", "epic", "head"),
  christmas("snowflake-tiara", "Snowflake Tiara", "💎", "legendary", "head"),
  christmas("holly-ribbon-dress", "Holly Red Dress", "👗", "rare", "body"),
  christmas("evergreen-ribbon-dress", "Evergreen Dress", "👗", "rare", "body"),
  christmas("candy-cane-hoodie", "Candy Cane Hoodie", "🧥", "epic", "body"),
  christmas("evergreen-blazer", "Evergreen Blazer", "🧥", "epic", "body"),
];

/** What coins buy (owner, 2026-11-07): coins must be scarce enough to mean something. One board pays about
 * 50-70 coins (option B, from the replay), enough for one or two treats, so she chooses or saves. */
export const PRICE_LIST = { gamePlay: 25, callMinutes5: 30, mysteryChest: 60 } as const;
/** The earned call (owner, 2026-11-07): finishing a board opens the call; the call burns the call time she has
 * earned (CALL_TIME_LOOT) and more costs coins, so she wants to come back and earn again. No free minutes per
 * board (2026-11-10: they piled up into 10-minute calls), no cap, no daily limit: earn rates alone set the time. */
// 11/22: warn at 30 s left, not 60; with 25-60 s saved per call, 60 meant the call opened with a time warning.
export const CALL_RULES = { warnAtSecondsLeft: 30 } as const;
/** Call time is rolled loot (owner, 2026-11-10): every finished stop's chest rolls one row. The common drop is
 * 10-20 seconds; a full minute is the rare drop. ONE tunable table: odds (`below`, cumulative) and amounts.
 * About 18 seconds a stop on average, so a board of six stops earns about two minutes of FaceTime. */
export const CALL_TIME_LOOT: ReadonlyArray<{ tier: RewardRarity; seconds: number; below: number }> = [
  { tier: "common", seconds: 10, below: 0.35 },
  { tier: "common", seconds: 15, below: 0.65 },
  { tier: "common", seconds: 20, below: 0.92 },
  { tier: "rare", seconds: 60, below: Infinity },
];
/** Reward games are timed (owner, 2026-11-08): one game play (PRICE_LIST.gamePlay) buys these minutes on the
 * same paid-minute meter as the call; at time up she inserts another coin or goes back to her map.
 * A reward stop's first play is earned by the stops before it (2026-11-10): earnedMinutesFirstPlay are free;
 * replaying a finished reward stop is paid on the same meter. */
export const ARCADE_RULES = { minutesPerPlay: 3, earnedMinutesFirstPlay: 3, warnAtSecondsLeft: 60 } as const;

/** What each chest pays: coins always, call time from CALL_TIME_LOOT, and by chance a catalog item. */
/** Option B (owner, 2026-11-07), tuned on a replay of the girls' real history: about 50-70 coins a session,
 * so a call top-up or a game is a session's treat and a dress is a week's goal. */
export const CHEST_TABLE: Record<RewardRarity, { coins: number; coinRange: readonly [number, number]; bonusChance: number }> = {
  // Loot like World of Warcraft (owner, 2026-11-08): with ITEM_SHARE 0.75, an item drops from about 1/3 of
  // common chests, 1/2 of rare and 3/4 of epic and legendary.
  common: { coins: 8, coinRange: [5, 11], bonusChance: 0.45 },
  rare: { coins: 16, coinRange: [12, 20], bonusChance: 0.67 },
  epic: { coins: 30, coinRange: [24, 36], bonusChance: 1 },
  legendary: { coins: 60, coinRange: [50, 70], bonusChance: 1 },
};

/** Every chest is a surprise (owner, 2026-11-07, after Ila's session): a stop's kind is only the floor; the chest
 * rolls its rarity from these odds, then its coins within that rarity's range. Average stays about 11 per stop. */
export const CHEST_RARITY_ODDS: ReadonlyArray<{ rarity: RewardRarity; below: number }> = [
  { rarity: "common", below: 0.7 },
  { rarity: "rare", below: 0.92 },
  { rarity: "epic", below: 0.99 },
  { rarity: "legendary", below: Infinity },
];
/** Of the lucky rolls, the share that drops a catalog item while she still has items to find. */
export const ITEM_SHARE = 0.75;
const RANK: Record<RewardRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
const CHESTS: RewardRarity[] = ["common", "rare", "epic", "legendary"];

/** Items a chest of this rarity can drop now: ones she does not own, no rarer than the chest, in season. */
export function eligibleDrops(chest: RewardRarity, ownedIds: readonly string[], nowIso: string): RewardItem[] {
  return REWARD_CATALOG.filter(item => !ownedIds.includes(item.id) && RANK[item.rarity] <= RANK[chest] && inSeason(item, nowIso));
}

/** The chance one chest drops this item now, before any pity bonus. */
export function dropChance(item: RewardItem, chest: RewardRarity, ownedIds: readonly string[], nowIso: string): number {
  const pool = eligibleDrops(chest, ownedIds, nowIso);
  if (!pool.some(row => row.id === item.id)) return 0;
  return CHEST_TABLE[chest].bonusChance * ITEM_SHARE / pool.length;
}

export type CollectionEntry = { item: RewardItem; owned: boolean; bestChest?: RewardRarity; bestChance?: number };

/** Her collection: everything, owned first, then the rest by rarity with the chest most likely to drop each.
 * A seasonal item shows greyed before and during its season; after it, only what she won stays. */
export function collectionView(ownedIds: readonly string[], nowIso: string = new Date().toISOString()): CollectionEntry[] {
  return REWARD_CATALOG.filter(item => ownedIds.includes(item.id) || !seasonOver(item, nowIso)).map(item => {
    if (ownedIds.includes(item.id)) return { item, owned: true };
    const [bestChest, bestChance] = CHESTS.map(chest => [chest, dropChance(item, chest, ownedIds, nowIso)] as const)
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
