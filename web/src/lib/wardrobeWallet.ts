import { REWARD_CATALOG, type RewardItem } from "../../../src/shared/rewardCatalog";
import {
  WARDROBE_STORE_STORAGE_KEY,
  createInitialWardrobeStoreState,
  parseWardrobeStoreState,
  resolveEquippedWardrobeSelection,
  type EquippedWardrobe,
  type WardrobeSelection,
  type WardrobeStoreItem,
  type WardrobeStoreState,
} from "./wardrobeStore";

/** One companion's look on her chart, by wardrobe item id (owner, 2026-11-25). No ids = her own clothes. */
export type ChartWearing = { outfitItemId?: string; accessoryItemId?: string; changedAt?: string };

/**
 * Her saved wallet from the server: coins, every reward she owns (chest drops and purchases), and what each
 * companion is wearing. `wearing` is the one source every room reads; an older server leaves it out.
 */
export type ServerWallet = { coins: number; ownedRewardIds: string[]; wearing?: Record<string, ChartWearing> };

/** The reward catalog row for a wardrobe item; it holds the coin price and the server's item id. */
export function rewardForWardrobeItem(wardrobeItemId: string): RewardItem | undefined {
  return REWARD_CATALOG.find((item) => item.kind === "outfit" && item.wardrobeItemId === wardrobeItemId);
}

/**
 * The shop on her real coins (owner, 2026-11-07): the server's balance replaces any browser ledger, and
 * only what the server says she owns is in her closet, so demo purchases can never leak into her wallet.
 */
export function withServerWallet(state: WardrobeStoreState, wallet: ServerWallet): WardrobeStoreState {
  const owned = REWARD_CATALOG
    .filter((item) => item.kind === "outfit" && item.wardrobeItemId && wallet.ownedRewardIds.includes(item.id))
    .map((item) => item.wardrobeItemId!);
  // Her chart wins for every companion it has a look for; a browser look stays only until it is moved (S8).
  const chartLooks = Object.fromEntries(Object.entries(wallet.wearing ?? {}).map(([companionId, entry]) => [companionId, {
    ...(entry.accessoryItemId ? { accessoryItemId: entry.accessoryItemId } : {}),
    ...(entry.outfitItemId ? { outfitItemId: entry.outfitItemId } : {}),
  }]));
  const equippedByCompanion = Object.fromEntries(
    Object.entries({ ...state.equippedByCompanion, ...chartLooks }).map(([companionId, equipped]) => [companionId, {
      ...(equipped.accessoryItemId && owned.includes(equipped.accessoryItemId) ? { accessoryItemId: equipped.accessoryItemId } : {}),
      ...(equipped.outfitItemId && owned.includes(equipped.outfitItemId) ? { outfitItemId: equipped.outfitItemId } : {}),
    }]),
  );
  return {
    ...state,
    ledger: [{ id: "server-wallet", type: "opening_credit", amount: Math.max(0, Math.floor(wallet.coins)), occurredAt: new Date(0).toISOString() }],
    ownedItemIds: owned,
    savedItemIds: state.savedItemIds.filter((id) => !owned.includes(id)),
    equippedByCompanion,
  };
}

/** Items the wallet shop shows: anything with a coin price, plus anything she already owns. */
export function walletShopItems(items: readonly WardrobeStoreItem[], ownedWardrobeIds: readonly string[]): WardrobeStoreItem[] {
  return items.filter((item) => ownedWardrobeIds.includes(item.id) || rewardForWardrobeItem(item.id)?.price !== undefined);
}

/** Her per-child browser closet, as the kiosk saved it before looks moved to her chart. */
function browserCloset(storage: Pick<Storage, "getItem"> | undefined, childId: string): WardrobeStoreState {
  try {
    const saved = storage?.getItem(`${WARDROBE_STORE_STORAGE_KEY}:${childId}`);
    const parsed = saved ? parseWardrobeStoreState(JSON.parse(saved) as unknown) : null;
    if (parsed) return parsed;
  } catch (error: unknown) {
    console.error(" 🎮 [wardrobe-wallet] [saved-look] [load-failed]", error);
  }
  return createInitialWardrobeStoreState();
}

/**
 * A look that exists only in this browser for a companion her chart has never heard of (S8, owner 2026-11-25): it is
 * moved to her chart once, so nothing she picked before the update is lost. Null once the chart has a look.
 */
export function browserLookToMove(
  storage: Pick<Storage, "getItem"> | undefined,
  childId: string,
  wallet: ServerWallet,
  companionId: string,
): EquippedWardrobe | null {
  if (wallet.wearing?.[companionId]) return null;
  const owned = withServerWallet(browserCloset(storage, childId), { ...wallet, wearing: {} }).equippedByCompanion[companionId];
  return owned && (owned.outfitItemId || owned.accessoryItemId) ? owned : null;
}

/**
 * The look she saved for her companion, for a room that opens before the closet: her chart's look, limited to what
 * the server says she owns (BUGS.md 2026-11-07, a bought dress missing at call start).
 */
export function savedEquippedLook(
  storage: Pick<Storage, "getItem"> | undefined,
  childId: string,
  wallet: ServerWallet,
  companionId: string,
  companionModelUrl: string,
): WardrobeSelection {
  const owned = withServerWallet(browserCloset(storage, childId), wallet);
  // Owner 2026-11-09: each companion wears only what she put on that companion (Elli never borrows another's dress).
  return resolveEquippedWardrobeSelection(owned, companionId, companionModelUrl);
}

/** Saves one companion's look to her chart; the closet and the one-time move of a browser look use it. */
export type PostWearing = (childId: string, companionId: string, equipped: EquippedWardrobe) => Promise<void>;

/**
 * Her chart's look for this companion. A look that exists only in this browser (saved before looks moved to her
 * chart) is moved there once and worn now, so nothing she picked is lost (outfit-follows-companion S8).
 */
export function chartLookFor(input: {
  childId: string; companionId: string; wallet: ServerWallet; storage: Pick<Storage, "getItem"> | undefined; postWearing?: PostWearing;
}): ChartWearing | null {
  const fromChart = input.wallet.wearing?.[input.companionId];
  if (fromChart) return fromChart;
  const moving = browserLookToMove(input.storage, input.childId, input.wallet, input.companionId);
  if (!moving) return null;
  console.log(` 🎮 [wardrobe] [wearing] [migrated] child=${input.childId} companion=${input.companionId} outfit=${moving.outfitItemId ?? "own"} accessory=${moving.accessoryItemId ?? "none"}`);
  input.postWearing?.(input.childId, input.companionId, moving)
    .catch((error: unknown) => console.error(` 🎮 [wardrobe] [wearing] [migrate-failed] child=${input.childId} companion=${input.companionId}`, error));
  return moving;
}

/** Saves one companion's look to her chart (POST /api/rewards/wearing); a refused or failed save is logged. */
export const postChartWearing: PostWearing = async (childId, companionId, equipped) => {
  const response = await fetch(`/api/rewards/wearing/${encodeURIComponent(childId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companionId, ...equipped }),
  });
  if (!response.ok) throw new Error(`wearing_save_${response.status}`);
  console.log(` 🎮 [wardrobe] [wearing] [sent] child=${childId} companion=${companionId} outfit=${equipped.outfitItemId ?? "own"} accessory=${equipped.accessoryItemId ?? "none"}`);
};
