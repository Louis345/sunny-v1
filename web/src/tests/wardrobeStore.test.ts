import { describe, expect, it } from "vitest";
import {
  WARDROBE_STORE_CATALOG,
  createCompanionShoppingVisit,
  createInitialWardrobeStoreState,
  equipWardrobeItem,
  getCompatibleWardrobeItems,
  getWardrobeBalance,
  purchaseWardrobeItem,
  recordWardrobeInteraction,
  resolveCompanionStoreDesire,
  saveWardrobeItemForLater,
} from "../lib/wardrobeStore";

describe("wardrobe store domain", () => {
  it("creates one stable strong-opinion mood for a shopping visit", () => {
    const state = createInitialWardrobeStoreState();
    const items = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      "/companions/sample.vrm",
    );
    const first = createCompanionShoppingVisit({
      companionId: "elli",
      items,
      state,
      visitSeed: "elli-visit-1",
    });
    const repeated = createCompanionShoppingVisit({
      companionId: "elli",
      items,
      state,
      visitSeed: "elli-visit-1",
    });
    const opinions = Object.values(first.itemOpinions);

    expect(repeated).toEqual(first);
    expect(first.mood.label.length).toBeGreaterThan(0);
    expect(opinions.filter((opinion) => opinion.verdict === "reject")).toHaveLength(2);
    expect(opinions.some((opinion) => opinion.companionConsentsToWear)).toBe(true);
    expect(
      opinions
        .filter((opinion) => opinion.verdict === "reject")
        .every((opinion) => !opinion.companionConsentsToWear),
    ).toBe(true);
  });

  it("can choose a different mood on a later visit without changing within one visit", () => {
    const state = createInitialWardrobeStoreState();
    const items = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      "/companions/sample.vrm",
    );
    const moodIds = new Set(
      Array.from({ length: 12 }, (_, index) =>
        createCompanionShoppingVisit({
          companionId: "elli",
          items,
          state,
          visitSeed: `elli-visit-${index}`,
        }).mood.id,
      ),
    );

    expect(moodIds.size).toBeGreaterThan(1);
  });

  it("filters the catalog by the exact companion model approval", () => {
    const sampleItems = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      "/companions/sample.vrm",
    );
    const keflaItems = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      "/companions/Kefla.vrm",
    );

    expect(sampleItems.map((item) => item.id)).toEqual([
      "royal-crown",
      "cat-ears",
      "star-halo",
      "sleeveless-dress",
    ]);
    expect(keflaItems.map((item) => item.id)).toEqual([
      "royal-crown",
      "cat-ears",
      "star-halo",
    ]);
  });

  it("admits only skinned XWear assets as sellable clothing", () => {
    const outfits = WARDROBE_STORE_CATALOG.filter(
      (item) => item.asset.kind === "outfit",
    );

    expect(outfits.map((item) => item.name)).toEqual(["Navy Ribbon Dress"]);
    expect(
      outfits.every(
        (item) => item.asset.kind === "outfit" && item.asset.fit === "skinned_xwear",
      ),
    ).toBe(true);
    expect(WARDROBE_STORE_CATALOG.some((item) => item.id === "galaxy-hero")).toBe(false);
    expect(WARDROBE_STORE_CATALOG.some((item) => item.id === "comet-hoodie")).toBe(false);
    expect(WARDROBE_STORE_CATALOG.some((item) => item.id === "celtic-sweater")).toBe(false);
  });

  it("records one immutable debit and grants ownership exactly once", () => {
    const initial = createInitialWardrobeStoreState();
    const first = purchaseWardrobeItem(initial, {
      itemId: "star-halo",
      companionId: "elli",
      companionModelUrl: "/companions/sample.vrm",
      transactionId: "purchase-halo-1",
      occurredAt: "2026-08-08T12:00:00.000Z",
    });
    const retry = purchaseWardrobeItem(first.state, {
      itemId: "star-halo",
      companionId: "elli",
      companionModelUrl: "/companions/sample.vrm",
      transactionId: "purchase-halo-1",
      occurredAt: "2026-08-08T12:00:01.000Z",
    });

    expect(first.status).toBe("purchased");
    expect(getWardrobeBalance(first.state)).toBe(75);
    expect(first.state.ownedItemIds).toContain("star-halo");
    expect(retry.status).toBe("duplicate");
    expect(getWardrobeBalance(retry.state)).toBe(75);
    expect(retry.state.ledger).toHaveLength(2);
  });

  it("rejects incompatible and unaffordable purchases without changing currency", () => {
    const initial = createInitialWardrobeStoreState({ initialCoins: 30 });
    const incompatible = purchaseWardrobeItem(initial, {
      itemId: "sleeveless-dress",
      companionId: "kefla",
      companionModelUrl: "/companions/Kefla.vrm",
      transactionId: "bad-fit",
      occurredAt: "2026-08-08T12:00:00.000Z",
    });
    const unaffordable = purchaseWardrobeItem(initial, {
      itemId: "sleeveless-dress",
      companionId: "elli",
      companionModelUrl: "/companions/sample.vrm",
      transactionId: "not-enough",
      occurredAt: "2026-08-08T12:00:00.000Z",
    });

    expect(incompatible.status).toBe("incompatible");
    expect(unaffordable.status).toBe("insufficient_funds");
    expect(getWardrobeBalance(incompatible.state)).toBe(30);
    expect(getWardrobeBalance(unaffordable.state)).toBe(30);
    expect(incompatible.state.ledger).toHaveLength(1);
    expect(unaffordable.state.ledger).toHaveLength(1);
  });

  it("keeps ownership separate from each companion's equipped wardrobe", () => {
    const purchased = purchaseWardrobeItem(createInitialWardrobeStoreState(), {
      itemId: "royal-crown",
      companionId: "elli",
      companionModelUrl: "/companions/sample.vrm",
      transactionId: "purchase-crown-1",
      occurredAt: "2026-08-08T12:00:00.000Z",
    });
    const equipped = equipWardrobeItem(
      purchased.state,
      "elli",
      "royal-crown",
      "/companions/sample.vrm",
    );
    const rejected = equipWardrobeItem(
      createInitialWardrobeStoreState(),
      "elli",
      "royal-crown",
      "/companions/sample.vrm",
    );

    expect(equipped.status).toBe("equipped");
    expect(equipped.state.equippedByCompanion.elli?.accessoryItemId).toBe(
      "royal-crown",
    );
    expect(rejected.status).toBe("not_owned");
    expect(rejected.state.equippedByCompanion.elli).toBeUndefined();
  });

  it("advances a companion desire when an owned item fulfills it", () => {
    const initial = createInitialWardrobeStoreState();
    const firstDesire = resolveCompanionStoreDesire("elli", initial);
    const purchased = purchaseWardrobeItem(initial, {
      itemId: "star-halo",
      companionId: "elli",
      companionModelUrl: "/companions/sample.vrm",
      transactionId: "purchase-halo-2",
      occurredAt: "2026-08-08T12:00:00.000Z",
    });
    const nextDesire = resolveCompanionStoreDesire("elli", purchased.state);

    expect(firstDesire.label).toBe("a celestial headpiece");
    expect(nextDesire.label).toBe("an elegant new outfit");
  });

  it("records wardrobe choices only as engagement or companion evidence", () => {
    const state = recordWardrobeInteraction(createInitialWardrobeStoreState(), {
      id: "interaction-1",
      companionId: "elli",
      itemId: "star-halo",
      action: "previewed",
      evidenceStream: "engagement",
      occurredAt: "2026-08-08T12:00:00.000Z",
    });

    expect(state.preferenceEvents).toEqual([
      expect.objectContaining({
        action: "previewed",
        evidenceStream: "engagement",
      }),
    ]);
    expect(JSON.stringify(state.preferenceEvents)).not.toContain("academic");
  });

  it("saves a compatible item without changing the wallet or ownership", () => {
    const initial = createInitialWardrobeStoreState();
    const saved = saveWardrobeItemForLater(
      initial,
      "sleeveless-dress",
      "/companions/sample.vrm",
    );
    const duplicate = saveWardrobeItemForLater(
      saved.state,
      "sleeveless-dress",
      "/companions/sample.vrm",
    );

    expect(saved.status).toBe("saved");
    expect(saved.state.savedItemIds).toEqual(["sleeveless-dress"]);
    expect(duplicate.status).toBe("already_saved");
    expect(getWardrobeBalance(duplicate.state)).toBe(100);
    expect(duplicate.state.ownedItemIds).toEqual([]);
  });
});
