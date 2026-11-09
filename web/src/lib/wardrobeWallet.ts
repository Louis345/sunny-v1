import { REWARD_CATALOG, type RewardItem } from "../../../src/shared/rewardCatalog";
import {
  WARDROBE_STORE_STORAGE_KEY,
  createInitialWardrobeStoreState,
  parseWardrobeStoreState,
  resolveEquippedWardrobeSelection,
  type WardrobeSelection,
  type WardrobeStoreItem,
  type WardrobeStoreState,
} from "./wardrobeStore";

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

/**
 * Owner 2026-11-09: the angel Ila dressed was ingested as "matilda" (Reina's homework companion's id); she is now
 * Hikari. Ila's angel look moves to Hikari once. Only Ila: Reina's Matilda look is hers. Idempotent, and a look
 * already on Hikari is never overwritten.
 */
export function migrateChildWardrobeState(state: WardrobeStoreState, childId: string): WardrobeStoreState {
  const { matilda, hikari } = state.equippedByCompanion;
  if (childId !== "ila" || !matilda || hikari) return state;
  const { matilda: _moved, ...rest } = state.equippedByCompanion;
  console.log(` 🎮 [wardrobe-wallet] [angel-look-migration] [moved] child=${childId} from=matilda to=hikari outfit=${matilda.outfitItemId ?? "none"} accessory=${matilda.accessoryItemId ?? "none"}`);
  return { ...state, equippedByCompanion: { ...rest, hikari: matilda } };
}

/**
 * The look she saved for her companion, for a call that starts before the shop is opened: her per-child saved
 * closet, limited to what the server says she owns (BUGS.md 2026-11-07, a bought dress missing at call start).
 */
export function savedEquippedLook(
  storage: Pick<Storage, "getItem"> | undefined,
  childId: string,
  wallet: ServerWallet,
  companionId: string,
  companionModelUrl: string,
): WardrobeSelection {
  let state = createInitialWardrobeStoreState();
  try {
    const saved = storage?.getItem(`${WARDROBE_STORE_STORAGE_KEY}:${childId}`);
    const parsed = saved ? parseWardrobeStoreState(JSON.parse(saved) as unknown) : null;
    if (parsed) state = migrateChildWardrobeState(parsed, childId);
  } catch (error: unknown) {
    console.error(" 🎮 [wardrobe-wallet] [saved-look] [load-failed]", error);
  }
  const owned = withServerWallet(state, wallet);
  // Owner 2026-11-09: each companion wears only what she put on that companion (Elli never borrows another's dress).
  return resolveEquippedWardrobeSelection(owned, companionId, companionModelUrl);
}

