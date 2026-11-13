import { expect, it } from "vitest";
import { WARDROBE_STORE_CATALOG, createInitialWardrobeStoreState, getCompatibleWardrobeItems } from "../lib/wardrobeStore";
import { rewardForWardrobeItem, withServerWallet } from "../lib/wardrobeWallet";

const companion = { id: "elli" };

// Owner-reported 2026-11-07 (watching the earned call): a dress she had bought and put on Elli was gone when
// the next call started. Why: the call began with no outfit and only the shop's mount put her saved look on,
// so Elli wore it only after the shop was opened. Logs had no line for "call started with outfit X"; the lab
// tested buying and equipping inside one open shop, never a fresh call afterwards.
it("starts a fresh call wearing the outfit she saved, and only one the server says she owns", async () => {
  const { savedEquippedLook } = await import("../lib/wardrobeWallet");
  const { equipWardrobeItem } = await import("../lib/wardrobeStore");
  const elliModel = "/companions/elli-wardrobe-identity-preserved-v1.vrm";
  const outfit = getCompatibleWardrobeItems(WARDROBE_STORE_CATALOG, elliModel, companion.id)
    .find(item => item.asset.kind === "outfit" && rewardForWardrobeItem(item.id)?.price !== undefined)!;
  const rewardId = rewardForWardrobeItem(outfit.id)!.id;
  const owned = withServerWallet(createInitialWardrobeStoreState(), { coins: 0, ownedRewardIds: [rewardId] });
  const dressed = equipWardrobeItem(owned, companion.id, outfit.id, elliModel);
  expect(dressed.status).toBe("equipped");
  const saved = new Map([["sunny:wardrobe-store-lab:v1:ila", JSON.stringify(dressed.state)]]);
  const storage = { getItem: (key: string) => saved.get(key) ?? null };
  const look = savedEquippedLook(storage, "ila", { coins: 0, ownedRewardIds: [rewardId] }, companion.id, elliModel);
  expect(look.outfitId).not.toBe("none");
  // A browser-only purchase the server never recorded is not worn.
  expect(savedEquippedLook(storage, "ila", { coins: 0, ownedRewardIds: [] }, companion.id, elliModel).outfitId).toBe("none");
  // Another child's saved look is never used.
  expect(savedEquippedLook(storage, "reina", { coins: 0, ownedRewardIds: [rewardId] }, companion.id, elliModel).outfitId).toBe("none");
});

// Owner-observed 2026-11-08 (kiosk localStorage): Ila bought the navy dress while the call opened as Matilda, so it
// was saved on Matilda's slot. The 11/8 rule let a companion with no look borrow it ("her look follows her").
// Owner-reported 2026-11-09 (Ila upset): Elli was wearing the outfit she bought for another character; to her,
// Elli stole it. Why the human caught it: Ila knows whom she dressed; the log line [saved-look] [follows-child]
// recorded the borrow as intended; the lab encoded the 11/8 rule. Rule now: each companion wears only what she
// put on that companion, and it stays there.
const KIOSK_STATE = {
  version: 1,
  ledger: [],
  ownedItemIds: ["cat-ears", "royal-crown", "sleeveless-dress"],
  savedItemIds: [],
  equippedByCompanion: { matilda: { outfitItemId: "sleeveless-dress" } },
  preferenceEvents: [],
};
const KIOSK_WALLET = { coins: 0, ownedRewardIds: ["outfit:cat-ears", "outfit:royal-crown", "outfit:navy-ribbon-dress"] };
const storageWith = (state: unknown) => ({ getItem: (key: string) => (key === "sunny:wardrobe-store-lab:v1:ila" ? JSON.stringify(state) : null) });

it("elli never wears the dress Ila put on another companion; that companion keeps it", async () => {
  const { savedEquippedLook } = await import("../lib/wardrobeWallet");
  const elli = savedEquippedLook(storageWith(KIOSK_STATE), "ila", KIOSK_WALLET, "elli", "/companions/elli-wardrobe-identity-preserved-v1.vrm");
  expect(elli).toMatchObject({ outfitId: "none", accessoryId: "none" });
  // Owner 2026-11-11: looks stay per companion with no migration; Matilda keeps what Ila put on Matilda.
  const matilda = savedEquippedLook(storageWith(KIOSK_STATE), "ila", KIOSK_WALLET, "matilda", "/companions/sample.vrm");
  expect(matilda.outfitId).toBe("sleeveless-dress");
});
