import { REWARD_CATALOG, type RewardItem } from "../../../src/shared/rewardCatalog";
import type { WardrobeStoreItem, WardrobeStoreState } from "./wardrobeStore";

/** Her saved wallet from the server: coins and every reward she owns (chest drops and purchases). */
export type ServerWallet = { coins: number; ownedRewardIds: string[] };

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
  const equippedByCompanion = Object.fromEntries(
    Object.entries(state.equippedByCompanion).map(([companionId, equipped]) => [companionId, {
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
