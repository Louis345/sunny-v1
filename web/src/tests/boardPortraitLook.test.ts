import { describe, expect, it, vi } from "vitest";
import { resolvePreparedWardrobePresentation } from "../lib/wardrobeBodyProfiles";
import { WARDROBE_LOOK_CHANGED_EVENT, loadBoardPortraitLook } from "../lib/boardPortraitLook";

// Owner-caught 2026-11-12 and again 2026-11-13: Reina dressed Matilda in the closet, went back to the board, and
// the board portrait wore her old clothes. Why the human caught it: the portrait is on screen all session. Why the
// logs missed it: no line said which look the board portrait draws. Why the lab missed it: only the FaceTime call
// loaded the saved look (callStartLook.test.ts); the board portrait (CompanionLayer) had no outfit input at all.
const storageWith = (state: unknown) => ({ getItem: () => JSON.stringify(state) });
const MATILDA_DEFAULT = "/companions/matilda-default.vrm";
const DRESSED = (companionId: string) => ({
  version: 1, ledger: [], ownedItemIds: ["sleeveless-dress"], savedItemIds: [], preferenceEvents: [],
  equippedByCompanion: { [companionId]: { outfitItemId: "sleeveless-dress" } },
});
const wallet = { coins: 0, ownedRewardIds: ["outfit:navy-ribbon-dress"] };

describe("board portrait look", () => {
  it("wears the outfit she saved for this companion, on the companion's dressable body", async () => {
    const body = resolvePreparedWardrobePresentation("elli")!.bodyModelUrl;
    const look = await loadBoardPortraitLook({ childId: "ila", companionId: "elli", defaultModelUrl: MATILDA_DEFAULT,
      fetchWallet: async () => wallet, storage: storageWith(DRESSED("elli")) });
    expect(look).toEqual({ modelUrl: body, look: expect.objectContaining({ outfitId: "sleeveless-dress" }) });
  });

  it("keeps the companion's own model when she has no saved look", async () => {
    const look = await loadBoardPortraitLook({ childId: "ila", companionId: "elli", defaultModelUrl: MATILDA_DEFAULT,
      fetchWallet: async () => wallet, storage: storageWith({ ...DRESSED("elli"), equippedByCompanion: {} }) });
    expect(look).toEqual({ modelUrl: MATILDA_DEFAULT, look: { accessoryId: "none", outfitId: "none" } });
  });

  it("falls back to the companion's own model when the wallet cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const look = await loadBoardPortraitLook({ childId: "ila", companionId: "elli", defaultModelUrl: MATILDA_DEFAULT,
      fetchWallet: async () => { throw new Error("offline"); }, storage: storageWith(DRESSED("elli")) });
    expect(look.modelUrl).toBe(MATILDA_DEFAULT);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("names the event the closet sends when a look changes", () => {
    expect(WARDROBE_LOOK_CHANGED_EVENT).toBe("sunny:wardrobe-look-changed");
  });
});
