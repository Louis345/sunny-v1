import { expect, it } from "vitest";
import { REWARD_CATALOG } from "../../../src/shared/rewardCatalog";
import { WARDROBE_STORE_CATALOG, getCompatibleWardrobeItems } from "../lib/wardrobeStore";
import { walletShopItems } from "../lib/wardrobeWallet";
import prepared from "../lib/wardrobePrepared.generated.json";

const ELLI_BODY = (prepared as Array<{ companionId: string; modelUrl: string }>).find(body => body.companionId === "elli")!.modelUrl;

// The reward catalog names wardrobe items by id instead of copying them: this fails if one stops matching.
it("every outfit she can earn is a real wardrobe store item", () => {
  const wardrobeIds = new Set(WARDROBE_STORE_CATALOG.map(item => item.id));
  for (const item of REWARD_CATALOG.filter(row => row.kind === "outfit")) expect(wardrobeIds.has(item.wardrobeItemId!), item.id).toBe(true);
});

it("an outfit costs the same in the collection as in the wardrobe store", () => {
  const prices = new Map(WARDROBE_STORE_CATALOG.map(item => [item.id, item.price]));
  // An outfit without a price is chest-only (the wardrobe has not priced it yet).
  for (const item of REWARD_CATALOG.filter(row => row.kind === "outfit" && row.price !== undefined)) expect(item.price, item.id).toBe(prices.get(item.wardrobeItemId!));
});

// Owner 2026-11-12 ("the rewards are never bland"): the shop showed 7 items; the hoodie and blazer were fitted and
// approved but had no price, so the wallet shelf hid them. Every shop item now has a price in both catalogs, and the
// ribbon dress comes in more colours.
it("every wardrobe item is priced in the shop and the collection, so none is hidden", () => {
  for (const item of WARDROBE_STORE_CATALOG) {
    expect(item.price, item.id).toBeGreaterThan(0);
    expect(REWARD_CATALOG.find(row => row.kind === "outfit" && row.wardrobeItemId === item.id)?.price, item.id).toBe(item.price);
  }
});

it("the hoodie, the blazer and at least seven distinct dress colours are on Elli's shelf", () => {
  const shelf = walletShopItems(getCompatibleWardrobeItems(WARDROBE_STORE_CATALOG, ELLI_BODY, "elli"), []).map(item => item.id);
  expect(shelf).toEqual(expect.arrayContaining(["comet-hoodie", "constellation-blazer"]));
  const dresses = WARDROBE_STORE_CATALOG.filter(item => item.templateId === "ribbon-dress" && shelf.includes(item.id));
  expect(dresses.length).toBeGreaterThanOrEqual(7);
  expect(new Set(dresses.map(item => item.asset.kind === "outfit" ? item.asset.materialVariant.tint.toLowerCase() : "")).size).toBe(dresses.length);
});
