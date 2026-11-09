import { describe, expect, it, vi } from "vitest";
import { fittedCallLook, loadCallStartLook } from "../lib/callStartLook";

// Owner-observed 2026-11-08: Elli wore the wrong clothes in FaceTime. The call-start effect skipped applying a
// "none" look, so a companion with no look kept the previous companion's clothes; the async wallet result was
// applied without checking the companion was still current; and the accessory was never checked for fit.
// Why the human caught it: she saw Elli in Matilda's dress. Why logs missed it: the call-start log printed the
// resolved look ("none") but nothing said it was skipped. Why the lab missed it: it only tested one companion.
const ELLI_BODY = "/companions/elli-wardrobe-identity-preserved-v1.vrm";
const MATILDA_BODY = "/companions/matilda-wardrobe-native-identity-v1.vrm";
const storageWith = (state: unknown) => ({ getItem: () => JSON.stringify(state) });
const DRESSED_MATILDA_ONLY = {
  version: 1, ledger: [], ownedItemIds: ["sleeveless-dress"], savedItemIds: [], preferenceEvents: [],
  equippedByCompanion: { matilda: { outfitItemId: "sleeveless-dress" }, elli: {} },
};

describe("call-start look", () => {
  // Owner 2026-11-09: the angel Ila dressed under the old id "matilda" is now Hikari; her saved look moves to Hikari.
  it("switching from a dressed companion to one with no look clears the outfit", async () => {
    const apply = vi.fn();
    const fetchWallet = vi.fn(async () => ({ coins: 0, ownedRewardIds: ["outfit:navy-ribbon-dress"] }));
    await loadCallStartLook({ childId: "ila", companionId: "hikari", modelUrl: MATILDA_BODY, fetchWallet, storage: storageWith(DRESSED_MATILDA_ONLY), isCurrent: () => true, apply });
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ outfitId: "sleeveless-dress" }));
    await loadCallStartLook({ childId: "ila", companionId: "elli", modelUrl: ELLI_BODY, fetchWallet, storage: storageWith(DRESSED_MATILDA_ONLY), isCurrent: () => true, apply });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith({ accessoryId: "none", outfitId: "none" });
  });

  it("ignores a stale wallet result for a companion that is no longer current", async () => {
    const apply = vi.fn();
    let current = "hikari";
    let release: (wallet: { coins: number; ownedRewardIds: string[] }) => void = () => {};
    const fetchWallet = () => new Promise<{ coins: number; ownedRewardIds: string[] }>((resolve) => { release = resolve; });
    const pending = loadCallStartLook({ childId: "ila", companionId: "hikari", modelUrl: MATILDA_BODY, fetchWallet, storage: storageWith(DRESSED_MATILDA_ONLY), isCurrent: () => current === "hikari", apply });
    current = "elli";
    release({ coins: 0, ownedRewardIds: ["outfit:navy-ribbon-dress"] });
    await pending;
    expect(apply).not.toHaveBeenCalled();
  });

  it("checks the accessory for fit like the outfit", () => {
    // Cat ears are not approved on Elli's dressable body; the dress is.
    expect(fittedCallLook({ accessoryId: "cat-ears", outfitId: "sleeveless-dress" }, ELLI_BODY, "elli")).toEqual({ accessoryId: "none", outfitId: "sleeveless-dress" });
    expect(fittedCallLook({ accessoryId: "none", outfitId: "sleeveless-dress" }, "/companions/elli.vrm", "elli").outfitId).toBe("none");
  });
});
