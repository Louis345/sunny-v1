import { describe, expect, it, vi } from "vitest";
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
  resolveWardrobeItemSelection,
  saveWardrobeItemForLater,
} from "../lib/wardrobeStore";
import { resolveWardrobeTemplateCertification } from "../lib/wardrobeBodyProfiles";

describe("wardrobe store domain", () => {
  it("creates one stable strong-opinion mood for a shopping visit", () => {
    const state = createInitialWardrobeStoreState();
    const items = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      "/companions/sample.vrm",
      "elli",
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
    const rejectionCount = opinions.filter(
      (opinion) => opinion.verdict === "reject",
    ).length;
    expect(rejectionCount).toBeGreaterThanOrEqual(Math.floor(opinions.length * 0.4));
    expect(rejectionCount).toBeLessThanOrEqual(Math.ceil(opinions.length * 0.5));
    // Owner 2026-11-12: a "not for me today" is her opinion, never a lock. Refused items had no Buy or Wear
    // button, a different 40% each visit, which looked broken to the kids. The child always decides.
    expect(opinions.every((opinion) => opinion.companionConsentsToWear)).toBe(true);
  });

  it("can choose a different mood on a later visit without changing within one visit", () => {
    const state = createInitialWardrobeStoreState();
    const items = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      "/companions/sample.vrm",
      "elli",
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

  it("filters shopping fixtures by their supplied companion approval", () => {
    // The dressing room shows each companion on her prepared body; garments are offered only where they render.
    const sampleItems = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      "/companions/elli-wardrobe-identity-preserved-v1.vrm",
      "elli",
    );
    const keflaItems = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      "/companions/kefla-wardrobe-native-identity-v1.vrm",
      "kefla",
    );
    const matildaItems = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      "/companions/elli-wardrobe-identity-preserved-v1.vrm",
      "matilda",
    );
    // On the raw starter model (prepared body missing) the hoodie and blazer would not render, so they are not offered.
    expect(getCompatibleWardrobeItems(WARDROBE_STORE_CATALOG, "/companions/sample.vrm", "elli").map(item => item.id))
      .not.toContain("comet-hoodie");

    expect(sampleItems.map((item) => item.id)).toEqual([
      "royal-crown",
      "cat-ears",
      "star-halo",
      "sleeveless-dress",
      "plum-ribbon-dress",
      "teal-ribbon-dress",
      "rose-ribbon-dress",
      "sky-ribbon-dress",
      "sunflower-ribbon-dress",
      "sunset-ribbon-dress",
      // Owner, 2026-11-10: an automated visual pass is approval, so garments with a passed review are listed too.
      "comet-hoodie",
      "constellation-blazer",
    ]);
    // Kefla's garments passed the automated visual review, so they are hers to wear without a human sign-off.
    expect(keflaItems.map((item) => item.id)).toEqual(sampleItems.map((item) => item.id));
    expect(matildaItems.map((item) => item.id)).toEqual(
      sampleItems.map((item) => item.id),
    );
    expect(resolveWardrobeTemplateCertification("elli", "ribbon-dress").status).toBe(
      "approved",
    );
    expect(resolveWardrobeTemplateCertification("matilda", "ribbon-dress").status).toBe(
      "approved",
    );
    expect(resolveWardrobeTemplateCertification("kefla", "ribbon-dress").status).toBe(
      "candidate",
    );
  });

  it("quarantines an outfit with no human or automated evidence even when the companion uses the standard body", () => {
    const initial = createInitialWardrobeStoreState();
    const result = purchaseWardrobeItem(initial, {
      itemId: "sleeveless-dress",
      companionId: "ghost-without-review",
      companionModelUrl: "/companions/sample.vrm",
      transactionId: "uncertified-standard-body",
      occurredAt: "2026-08-08T12:00:00.000Z",
    });

    expect(result.status).toBe("incompatible");
    expect(result.state).toBe(initial);
    expect(getWardrobeBalance(result.state)).toBe(100);
  });

  it("keeps every clothing candidate backed by skinned XWear", () => {
    const outfits = WARDROBE_STORE_CATALOG.filter(
      (item) => item.asset.kind === "outfit",
    );

    expect(outfits.map((item) => item.name)).toEqual([
      "Navy Ribbon Dress",
      "Plum Ribbon Dress",
      "Teal Ribbon Dress",
      "Rose Ribbon Dress",
      "Sky Ribbon Dress",
      "Sunflower Ribbon Dress",
      "Sunset Ribbon Dress",
      "Comet Hoodie",
      "Constellation Blazer",
    ]);
    expect(
      outfits.every(
        (item) => item.asset.kind === "outfit" && item.asset.fit === "skinned_xwear",
      ),
    ).toBe(true);
    expect(
      outfits.every(
        (item) =>
          item.compatibility.kind === "approved_body_profiles" &&
          item.compatibility.bodyProfileIds.includes("sunny-standard-v1"),
      ),
    ).toBe(true);
    expect(WARDROBE_STORE_CATALOG.some((item) => item.id === "galaxy-hero")).toBe(false);
    expect(WARDROBE_STORE_CATALOG.some((item) => item.id === "ruby-comet-hoodie")).toBe(false);
    expect(WARDROBE_STORE_CATALOG.some((item) => item.id === "celtic-sweater")).toBe(false);
  });

  it("carries the selected product palette separately from its shared fitted silhouette", () => {
    const roseDress = WARDROBE_STORE_CATALOG.find(
      (item) => item.id === "rose-ribbon-dress",
    );

    expect(roseDress).toBeDefined();
    expect(resolveWardrobeItemSelection(roseDress!)).toEqual({
      accessoryId: "none",
      outfitId: "sleeveless-dress",
      outfitMaterialVariant: {
        id: "rose-ribbon-dress",
        tint: "#ff8fb2",
      },
    });
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
    expect(getWardrobeBalance(first.state)).toBe(100 - WARDROBE_STORE_CATALOG.find((item) => item.id === "star-halo")!.price);
    expect(first.state.ownedItemIds).toContain("star-halo");
    expect(retry.status).toBe("duplicate");
    expect(getWardrobeBalance(retry.state)).toBe(100 - WARDROBE_STORE_CATALOG.find((item) => item.id === "star-halo")!.price);
    expect(retry.state.ledger).toHaveLength(2);
  });

  it("rejects incompatible and unaffordable purchases without changing currency", () => {
    const initial = createInitialWardrobeStoreState({ initialCoins: 30 });
    const incompatible = purchaseWardrobeItem(initial, {
      itemId: "sleeveless-dress",
      companionId: "ghost-without-review",
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
      "elli",
    );
    const duplicate = saveWardrobeItemForLater(
      saved.state,
      "sleeveless-dress",
      "/companions/sample.vrm",
      "elli",
    );

    expect(saved.status).toBe("saved");
    expect(saved.state.savedItemIds).toEqual(["sleeveless-dress"]);
    expect(duplicate.status).toBe("already_saved");
    expect(getWardrobeBalance(duplicate.state)).toBe(100);
    expect(duplicate.state.ownedItemIds).toEqual([]);
  });
});

// Shopping behavior uses explicit synthetic approvals. Real assets stay quarantined;
// wardrobe-certification.test.ts exercises the unmocked, version-bound gate.
vi.mock("../lib/wardrobeBodyProfiles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/wardrobeBodyProfiles")>();
  return {...actual, isWardrobePairApproved: () => true, resolveWardrobeTemplateCertification: (companionId: string, templateId: string) => ({
    companionId, templateId,
    status: (["royal-crown", "cat-ears", "star-halo"].includes(templateId) || (templateId === "ribbon-dress" && ["elli", "matilda"].includes(companionId))) ? "approved" : "candidate",
    reason: "TEST FIXTURE ONLY — synthetic human approval for shopping behavior",
  })};
});

// Owner 2026-11-12: the wish is the goal she works toward, so it must never run out once the listed wishes are owned.
it("keeps a concrete wish after every listed wish is owned", () => {
  const owned = { ...createInitialWardrobeStoreState(), ownedItemIds: ["star-halo", "sleeveless-dress"] };
  const desire = resolveCompanionStoreDesire("elli", owned);
  expect(desire.matchingItemIds.length).toBeGreaterThan(0);
  expect(desire.matchingItemIds.some(id => owned.ownedItemIds.includes(id))).toBe(false);
});
