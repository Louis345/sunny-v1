import { describe, expect, it } from "vitest";
import { equipTryOnLook, nextTryOnLook } from "../components/WardrobeStoreLab";
import { createInitialWardrobeStoreState, equipWardrobeItem, resolveEquippedWardrobeSelection } from "../lib/wardrobeStore";

// W9 (Ila, 11/16 evening: "I keep trying to do purple ears with purple dress, but it won't let me… it won't let me
// do anything"). Saori 11/17 00:10 UTC: she tapped Cat Ears and Plum Ribbon Dress back and forth three times each,
// owning both, and never saw them together: every try-on was drawn over Elli's equipped look (Sky + Star Halo), not
// over the try-on already showing, and "Wear" put on only the one item. Why the human caught it: she was building an
// outfit. Why the logs missed it: each tap logged "previewed", which looked normal. Why the lab missed it: no test
// tried on two items in a row.

const elli = { id: "elli", name: "Elli", modelUrl: "/companions/elli.vrm" };

function owned() {
  let state = createInitialWardrobeStoreState({ initialCoins: 0 });
  state = { ...state, ownedItemIds: ["cat-ears", "plum-ribbon-dress", "star-halo", "sky-ribbon-dress"] };
  state = equipWardrobeItem(state, "elli", "sky-ribbon-dress", elli.modelUrl, { testing: true }).state;
  return equipWardrobeItem(state, "elli", "star-halo", elli.modelUrl, { testing: true }).state;
}

describe("trying on clothes builds one outfit", () => {
  it("the second try-on keeps the first one on", () => {
    const state = owned();
    const ears = nextTryOnLook(state, elli, "cat-ears", true, null);
    const both = nextTryOnLook(state, elli, "plum-ribbon-dress", true, ears);
    expect(both.itemIds).toEqual({ accessory: "cat-ears", outfit: "plum-ribbon-dress" });
    expect(both.selection.accessoryId).toBe(ears.selection.accessoryId);
    expect(both.selection.outfitId).toBe(nextTryOnLook(state, elli, "plum-ribbon-dress", true, null).selection.outfitId);
  });

  it("the first try-on starts from what she already wears", () => {
    const first = nextTryOnLook(owned(), elli, "plum-ribbon-dress", true, null);
    expect(first.itemIds).toEqual({ accessory: "star-halo", outfit: "plum-ribbon-dress" });
  });

  it("Wear puts on the whole outfit she built, not just the last piece", () => {
    const state = owned();
    const look = nextTryOnLook(state, elli, "plum-ribbon-dress", true, nextTryOnLook(state, elli, "cat-ears", true, null));
    const worn = equipTryOnLook(state, elli, look, true);
    expect(worn.state.equippedByCompanion.elli).toEqual({ accessoryItemId: "cat-ears", outfitItemId: "plum-ribbon-dress" });
    expect(resolveEquippedWardrobeSelection(worn.state, "elli", elli.modelUrl, { testing: true })).toEqual(look.selection);
  });

  it("an item she has not bought is tried on but not worn", () => {
    const state = { ...owned(), ownedItemIds: ["plum-ribbon-dress", "star-halo", "sky-ribbon-dress"] };
    const look = nextTryOnLook(state, elli, "plum-ribbon-dress", true, nextTryOnLook(state, elli, "cat-ears", true, null));
    const worn = equipTryOnLook(state, elli, look, true);
    expect(worn.state.equippedByCompanion.elli).toEqual({ accessoryItemId: "star-halo", outfitItemId: "plum-ribbon-dress" });
    expect(worn.skipped).toEqual(["cat-ears"]);
  });
});
