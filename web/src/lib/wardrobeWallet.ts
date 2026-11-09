import { REWARD_CATALOG, type RewardItem } from "../../../src/shared/rewardCatalog";
import {
  WARDROBE_STORE_CATALOG,
  WARDROBE_STORE_STORAGE_KEY,
  createInitialWardrobeStoreState,
  isWardrobeStoreItemCompatible,
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
    if (parsed) state = parsed;
  } catch (error: unknown) {
    console.error(" 🎮 [wardrobe-wallet] [saved-look] [load-failed]", error);
  }
  const owned = withServerWallet(state, wallet);
  if (owned.equippedByCompanion[companionId]) return resolveEquippedWardrobeSelection(owned, companionId, companionModelUrl);
  // Owner rule (2026-11-08): what she bought follows HER. A companion with no saved look borrows her most recently
  // equipped look; the resolver still keeps only owned items that fit this companion's body.
  const donor = mostRecentLookCompanion(owned);
  if (!donor) return resolveEquippedWardrobeSelection(owned, companionId, companionModelUrl);
  // Each borrowed item is checked for fit on its own, so an accessory that does not fit never drops the outfit.
  const fits = (itemId: string | undefined) => {
    const item = itemId ? WARDROBE_STORE_CATALOG.find((row) => row.id === itemId) : undefined;
    return item && isWardrobeStoreItemCompatible(item, companionModelUrl, companionId) ? itemId : undefined;
  };
  const donorLook = owned.equippedByCompanion[donor];
  const fitted = { ...(fits(donorLook.accessoryItemId) ? { accessoryItemId: donorLook.accessoryItemId } : {}), ...(fits(donorLook.outfitItemId) ? { outfitItemId: donorLook.outfitItemId } : {}) };
  const borrowed = { ...owned, equippedByCompanion: { ...owned.equippedByCompanion, [companionId]: fitted } };
  const look = resolveEquippedWardrobeSelection(borrowed, companionId, companionModelUrl);
  console.log(` 🎮 [wardrobe-wallet] [saved-look] [follows-child] child=${childId} companion=${companionId} from=${donor} outfit=${look.outfitId} accessory=${look.accessoryId}`);
  return look;
}

/** The companion she dressed most recently: the newest equip or purchase event with a look still saved, else the last saved look. */
function mostRecentLookCompanion(state: WardrobeStoreState): string | null {
  const hasLook = (id: string) => {
    const look = state.equippedByCompanion[id];
    return Boolean(look?.outfitItemId || look?.accessoryItemId);
  };
  const events = state.preferenceEvents
    .filter((event) => (event.action === "equipped" || event.action === "purchased") && hasLook(event.companionId))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  if (events.length > 0) return events[events.length - 1].companionId;
  const saved = Object.keys(state.equippedByCompanion).filter(hasLook);
  return saved.length > 0 ? saved[saved.length - 1] : null;
}
