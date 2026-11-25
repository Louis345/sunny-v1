import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { loadBoardPortraitLook } from "../lib/boardPortraitLook";
import { planCompanionLook } from "../lib/dressCompanion";
import { resolvePreparedWardrobePresentation } from "../lib/wardrobeBodyProfiles";
import { WARDROBE_STORE_CATALOG, createInitialWardrobeStoreState, getCompatibleWardrobeItems } from "../lib/wardrobeStore";
import { rewardForWardrobeItem, savedEquippedLook, withServerWallet } from "../lib/wardrobeWallet";

// Owner-reported 2026-11-25: "When they change their clothes, they should be wearing their clothes throughout the
// entire experience." Why the human caught it: the kids dress Elli in the closet and see her in starter clothes in a
// 3D Quest. Why logs did not: no line said which look a game drew, and the closet's save was browser-only. Why the
// lab missed it: every look test passed a browser storage stub; no test asked a room that reads only the server.
// Rule now: her chart is the one source for what each companion wears; the browser copy is read once, to move it.

const ELLI_BODY = resolvePreparedWardrobePresentation("elli")!.bodyModelUrl;
const ELLI_DEFAULT = "/companions/elli-default.vrm";
const outfit = getCompatibleWardrobeItems(WARDROBE_STORE_CATALOG, ELLI_BODY, "elli")
  .find(item => item.asset.kind === "outfit" && rewardForWardrobeItem(item.id)?.price !== undefined)!;
const other = getCompatibleWardrobeItems(WARDROBE_STORE_CATALOG, ELLI_BODY, "elli")
  .find(item => item.asset.kind === "outfit" && item.id !== outfit.id && rewardForWardrobeItem(item.id)?.price !== undefined)!;
const owned = [rewardForWardrobeItem(outfit.id)!.id, rewardForWardrobeItem(other.id)!.id];
const browserWith = (equippedByCompanion: Record<string, { outfitItemId?: string }>) => {
  const state = { ...createInitialWardrobeStoreState(), ownedItemIds: [outfit.id, other.id], equippedByCompanion };
  return { getItem: (key: string) => (key === "sunny:wardrobe-store-lab:v1:ila" ? JSON.stringify(state) : null) };
};

describe("her chart is the one source for what Elli wears", () => {
  it("the chart wins over the browser copy, including her own clothes (F6)", () => {
    const browser = { ...createInitialWardrobeStoreState(), equippedByCompanion: { elli: { outfitItemId: other.id } } };
    const fromChart = withServerWallet(browser, { coins: 0, ownedRewardIds: owned, wearing: { elli: { outfitItemId: outfit.id, changedAt: "2026-11-25T18:00:00.000Z" } } });
    expect(fromChart.equippedByCompanion.elli).toEqual({ outfitItemId: outfit.id });
    const ownClothes = withServerWallet(browser, { coins: 0, ownedRewardIds: owned, wearing: { elli: { changedAt: "2026-11-25T18:00:00.000Z" } } });
    expect(ownClothes.equippedByCompanion.elli).toEqual({});
    expect(savedEquippedLook(browserWith({ elli: { outfitItemId: other.id } }), "ila",
      { coins: 0, ownedRewardIds: owned, wearing: { elli: { outfitItemId: outfit.id } } }, "elli", ELLI_BODY).outfitId).toBe(outfit.asset.kind === "outfit" ? outfit.asset.outfitId : "");
  });

  it("moves a look that exists only in the browser to her chart once, so today's looks survive the update (S8)", async () => {
    const postWearing = vi.fn(async () => {});
    const first = await loadBoardPortraitLook({ childId: "ila", companionId: "elli", defaultModelUrl: ELLI_DEFAULT,
      fetchWallet: async () => ({ coins: 0, ownedRewardIds: owned, wearing: {} }), storage: browserWith({ elli: { outfitItemId: outfit.id } }), postWearing });
    expect(first.modelUrl).toBe(ELLI_BODY);
    expect(postWearing).toHaveBeenCalledWith("ila", "elli", { outfitItemId: outfit.id });
    // Once the chart has her look, the browser copy is never read again.
    postWearing.mockClear();
    await loadBoardPortraitLook({ childId: "ila", companionId: "elli", defaultModelUrl: ELLI_DEFAULT,
      fetchWallet: async () => ({ coins: 0, ownedRewardIds: owned, wearing: { elli: { outfitItemId: outfit.id } } }), storage: browserWith({ elli: { outfitItemId: other.id } }), postWearing });
    expect(postWearing).not.toHaveBeenCalled();
  });

  it("plans a room's look from the companion card alone: her body and her outfit, or her own model (S4, S5)", () => {
    const dressed = planCompanionLook({ companionId: "elli", vrmUrl: ELLI_DEFAULT, wearing: { outfitItemId: outfit.id } });
    expect(dressed.modelUrl).toBe(ELLI_BODY);
    expect(dressed.look.outfitId).not.toBe("none");
    expect(planCompanionLook({ companionId: "elli", vrmUrl: ELLI_DEFAULT, wearing: null })).toEqual({ modelUrl: ELLI_DEFAULT, look: { accessoryId: "none", outfitId: "none" } });
    // An item this body cannot wear is left off, the same fit rule as the board and FaceTime (F5).
    expect(planCompanionLook({ companionId: "elli", vrmUrl: ELLI_DEFAULT, wearing: { outfitItemId: "no-such-dress" } }).look.outfitId).toBe("none");
  });
});

describe("3D library games wear her look through the shared bridge", () => {
  const card = { companionId: "elli", name: "Elli", vrmUrl: ELLI_DEFAULT, voiceId: "v", wearing: { outfitItemId: "comet-hoodie" } };
  function runBridge(sunnyDress: unknown) {
    const warn = vi.fn();
    const window: Record<string, unknown> = {
      GAME_PARAMS: { itemBindings: [], spellingItemBindings: [] },
      SUNNY_GAME_CONFIG: { childId: "ila", subject: "spelling", gameId: "lab-game", items: [] },
      fireAttemptEvent: vi.fn(), fireCompanionEvent: vi.fn(), sendNodeComplete: vi.fn(), reportStep: vi.fn(),
      ...(sunnyDress ? { SunnyDress: sunnyDress } : {}),
    };
    const fetch = vi.fn(async () => ({ ok: true, json: async () => card }));
    const context = vm.createContext({ window, document: { getElementById: () => null, title: "lab" }, location: { search: "" },
      URLSearchParams, console: { log: () => {}, warn, error: warn }, fetch, Promise, setTimeout, Object, Array, String, Number, RegExp, Math, Date });
    vm.runInContext(fs.readFileSync(path.join(process.cwd(), "public/games/cookoff/_library.js"), "utf8"), context);
    return { library: window.SunnyLibrary as { loadCompanion: (loader: unknown) => Promise<{ userData: { vrm: unknown } }> }, warn };
  }

  it("loads her dressable body and puts her outfit on after the game sets Elli up", async () => {
    const vrm = { scene: {} };
    const dress = { planCompanionLook: vi.fn(() => ({ modelUrl: "/companions/body.vrm", look: { outfitId: "comet-hoodie", accessoryId: "none" } })),
      captureXwearAvatarBindPose: vi.fn(), dressCompanionVrm: vi.fn(async () => {}) };
    const { library } = runBridge(dress);
    const loader = { loadAsync: vi.fn(async () => ({ userData: { vrm } })) };
    const gltf = await library.loadCompanion(loader);
    expect(loader.loadAsync).toHaveBeenCalledWith("/companions/body.vrm", undefined);
    expect(dress.planCompanionLook).toHaveBeenCalledWith(expect.objectContaining({ companionId: "elli", wearing: { outfitItemId: "comet-hoodie" } }));
    expect(gltf.userData.vrm).toBe(vrm);
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(dress.dressCompanionVrm).toHaveBeenCalledWith(vrm, expect.objectContaining({ outfitId: "comet-hoodie" }), "/companions/body.vrm", expect.any(Function), "library-game");
  });

  it("keeps the game playing with Elli in her own clothes when the dress-up cannot load (F2)", async () => {
    const { library, warn } = runBridge(undefined);
    const loader = { loadAsync: vi.fn(async () => ({ userData: { vrm: { scene: {} } } })) };
    await library.loadCompanion(loader);
    expect(loader.loadAsync).toHaveBeenCalledWith(ELLI_DEFAULT, undefined);
    expect(warn.mock.calls.some(call => String(call[0]).includes("[dress] [unavailable]"))).toBe(true);
  });

  it("keeps the game playing when putting the outfit on fails (F2)", async () => {
    const dress = { planCompanionLook: vi.fn(() => ({ modelUrl: "/companions/body.vrm", look: { outfitId: "comet-hoodie", accessoryId: "none" } })),
      captureXwearAvatarBindPose: vi.fn(), dressCompanionVrm: vi.fn(async () => { throw new Error("garment 404"); }) };
    const { library, warn } = runBridge(dress);
    const gltf = await library.loadCompanion({ loadAsync: vi.fn(async () => ({ userData: { vrm: { scene: {} } } })) });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(gltf.userData.vrm).toBeTruthy();
    expect(warn.mock.calls.some(call => String(call[0]).includes("[dress] [failed]"))).toBe(true);
  });
});

// S11: a 3D game gets her clothes for free only if it loads Elli through the shared bridge. A game that loads a .vrm
// itself would draw her in starter clothes again, so every library game is held to the bridge.
describe("every 3D library game loads Elli through the shared bridge", () => {
  const dir = path.join(process.cwd(), "public/games/cookoff");
  const games = fs.readdirSync(dir).filter(name => fs.existsSync(path.join(dir, name, "main.js")));
  it.each(games)("%s loads the companion only with SunnyLibrary.loadCompanion", (game) => {
    const source = fs.readFileSync(path.join(dir, game, "main.js"), "utf8");
    expect(source).toMatch(/\b(SL|LIB|SunnyLibrary)\.loadCompanion\(/);
    expect(source).not.toMatch(/\.vrm["'`]/);
    expect(source).not.toContain("/api/companion/current");
  });
});
