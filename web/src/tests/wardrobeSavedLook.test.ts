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

// Owner-observed 2026-11-08 (kiosk localStorage): Ila bought the navy dress while the call wrongly opened as
// Matilda, so it was saved on Matilda's slot and Elli had no look. Owner rule: what she bought follows HER to
// whichever companion she calls: a companion with no saved look wears her most recently equipped look, limited
// to items she owns and items that fit that companion's body.
const KIOSK_STATE = {
  version: 1,
  ledger: [],
  ownedItemIds: ["cat-ears", "royal-crown", "sleeveless-dress"],
  savedItemIds: [],
  equippedByCompanion: { matilda: { outfitItemId: "sleeveless-dress", accessoryItemId: "cat-ears" } },
  preferenceEvents: [],
};
const KIOSK_WALLET = { coins: 0, ownedRewardIds: ["outfit:cat-ears", "outfit:royal-crown", "outfit:navy-ribbon-dress"] };
const storageWith = (state: unknown) => ({ getItem: (key: string) => (key === "sunny:wardrobe-store-lab:v1:ila" ? JSON.stringify(state) : null) });

it("elli with only a matilda look wears the dress she bought (her look follows her)", async () => {
  const { savedEquippedLook } = await import("../lib/wardrobeWallet");
  const look = savedEquippedLook(storageWith(KIOSK_STATE), "ila", KIOSK_WALLET, "elli", "/companions/elli-wardrobe-identity-preserved-v1.vrm");
  expect(look.outfitId).toBe("sleeveless-dress");
  // Cat ears are not approved on Elli's body, so the borrowed accessory is dropped, not forced on.
  expect(look.accessoryId).toBe("none");
});

it("a borrowed look keeps only what she owns and only what fits the loaded body", async () => {
  const { savedEquippedLook } = await import("../lib/wardrobeWallet");
  const elliModel = "/companions/elli-wardrobe-identity-preserved-v1.vrm";
  expect(savedEquippedLook(storageWith(KIOSK_STATE), "ila", { coins: 0, ownedRewardIds: [] }, "elli", elliModel).outfitId).toBe("none");
  expect(savedEquippedLook(storageWith(KIOSK_STATE), "ila", KIOSK_WALLET, "elli", "/companions/elli.vrm").outfitId).toBe("none");
});

it("borrows her most recently equipped look when several companions have one", async () => {
  const { savedEquippedLook } = await import("../lib/wardrobeWallet");
  const state = {
    ...KIOSK_STATE,
    ownedItemIds: ["sleeveless-dress", "comet-hoodie"],
    equippedByCompanion: { matilda: { outfitItemId: "sleeveless-dress" }, ruby: { outfitItemId: "comet-hoodie" } },
    preferenceEvents: [
      { id: "a", companionId: "ruby", itemId: "comet-hoodie", action: "equipped", evidenceStream: "companion", occurredAt: "2026-11-07T10:00:00.000Z" },
      { id: "b", companionId: "matilda", itemId: "sleeveless-dress", action: "equipped", evidenceStream: "companion", occurredAt: "2026-11-08T10:00:00.000Z" },
    ],
  };
  const wallet = { coins: 0, ownedRewardIds: ["outfit:navy-ribbon-dress", "outfit:comet-hoodie"] };
  expect(savedEquippedLook(storageWith(state), "ila", wallet, "elli", "/companions/elli-wardrobe-identity-preserved-v1.vrm").outfitId).toBe("sleeveless-dress");
});
