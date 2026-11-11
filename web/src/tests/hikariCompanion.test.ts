import { describe, expect, it } from "vitest";
import { COMPANION_MANIFEST } from "../companion/companions.generated";
import { resolveVideoCallPickupGreeting } from "../components/CompanionShowroom";
import {
  isWardrobeReadyForHumanReview,
  resolvePreparedWardrobePresentation,
  resolveWardrobeTemplateCertification,
} from "../lib/wardrobeBodyProfiles";
import {
  WARDROBE_STORE_CATALOG,
  createInitialWardrobeStoreState,
  equipWardrobeItem,
  getCompatibleWardrobeItems,
  getWardrobePairVersion,
  type WardrobeStoreState,
} from "../lib/wardrobeStore";
import { savedEquippedLook } from "../lib/wardrobeWallet";

// Owner-reported 2026-11-09: the FaceTime angel was labelled "Matilda", Reina's homework companion's name. The angel
// is now Hikari. Why the human caught it: Ila sees the name; logs said companion=matilda, which looked right; the lab
// never checked that a showroom character is not another child's homework companion.
const ANGEL_MODEL = "/companions/673852811403133503.vrm";
const HIKARI_VOICE = "d8WcCpplp8meHt10UhL8";

describe("Hikari in the FaceTime picker", () => {
  it("lists Hikari with the angel model and her own default voice, nobody's default companion", () => {
    const hikari = COMPANION_MANIFEST.find(entry => entry.id === "hikari");
    expect(hikari?.name).toBe("Hikari");
    expect(hikari?.vrmUrl).toBe(ANGEL_MODEL);
    expect(hikari?.voices.filter(v => v.default).map(v => v.id)).toEqual([HIKARI_VOICE]);
    expect(hikari?.defaultFor).toBeUndefined();
    expect(hikari?.showroom?.scripts.en.intro).toMatch(/^Hi! I'm Hikari/);
  });

  it("keeps Matilda's entry as Reina's Matilda", () => {
    const matilda = COMPANION_MANIFEST.find(entry => entry.id === "matilda");
    expect(matilda?.name).toBe("Matilda");
    expect(matilda?.defaultFor).toBe("reina");
    expect(matilda?.voices.filter(v => v.default).map(v => v.id)).toEqual(["XrExE9yKIg1WjnnlVkGX"]);
  });

  it("greets as Hikari when the call picks up", () => {
    const greeting = resolveVideoCallPickupGreeting({
      companionId: "hikari",
      companionName: "Hikari",
      childName: "Ila",
      callSource: "showroom",
      relationshipState: "previewing",
    });
    expect(greeting.text).toContain("Hikari");
    expect(greeting.text).not.toContain("Matilda");
  });
});

describe("Hikari's wardrobe is the angel body's wardrobe", () => {
  const presentation = resolvePreparedWardrobePresentation("hikari");
  // The pink-jacket body's prepared assets carry the historical asset id "matilda"; Matilda the companion now wears
  // the starter body (owner 2026-11-11), so compare Hikari with the asset, not with Matilda.
  const matildaPresentation = { bodyModelUrl: "/companions/matilda-wardrobe-native-identity-v1.vrm", bodyProfileId: presentation?.bodyProfileId };

  it("wears the angel's prepared body", () => {
    expect(presentation?.bodyModelUrl).toBe(matildaPresentation?.bodyModelUrl);
    expect(presentation?.bodyProfileId).toBe(matildaPresentation?.bodyProfileId);
    expect(isWardrobeReadyForHumanReview("hikari")).toBe(isWardrobeReadyForHumanReview("matilda"));
  });

  it("fits exactly the items that fit the angel as Matilda", () => {
    const model = presentation!.bodyModelUrl;
    const forHikari = getCompatibleWardrobeItems(WARDROBE_STORE_CATALOG, model, "hikari").map(i => i.id);
    const forMatilda = getCompatibleWardrobeItems(WARDROBE_STORE_CATALOG, model, "matilda").map(i => i.id);
    expect(forMatilda.length).toBeGreaterThan(0);
    expect(forHikari).toEqual(forMatilda);
    for (const templateId of ["ribbon-dress", "comet-hoodie", "constellation-blazer", "royal-crown", "cat-ears", "star-halo"]) {
      expect(resolveWardrobeTemplateCertification("hikari", templateId, model).status).toBe(
        resolveWardrobeTemplateCertification("matilda", templateId, model).status,
      );
    }
    expect(getWardrobePairVersion("hikari", model, "sleeveless-dress", "star-halo")).toBe(
      getWardrobePairVersion("matilda", model, "sleeveless-dress", "star-halo"),
    );
  });

  it("can be dressed and keeps her look", () => {
    const model = presentation!.bodyModelUrl;
    const state = { ...createInitialWardrobeStoreState(), ownedItemIds: ["sleeveless-dress"] };
    const dressed = equipWardrobeItem(state, "hikari", "sleeveless-dress", model);
    expect(dressed.status).toBe("equipped");
    expect(dressed.state.equippedByCompanion.hikari?.outfitItemId).toBe("sleeveless-dress");
  });
});

// Ila's angel look already moved to hikari on the kiosk (11/09 migration, removed 11/11).
describe("Ila's Hikari look", () => {
  const kioskState = (): WardrobeStoreState => ({
    version: 1,
    ledger: [],
    ownedItemIds: ["sleeveless-dress"],
    savedItemIds: [],
    equippedByCompanion: { hikari: { outfitItemId: "sleeveless-dress" } },
    preferenceEvents: [],
  });

  it("starts Ila's Hikari call in the dress she bought for the angel", () => {
    const presentation = resolvePreparedWardrobePresentation("hikari")!;
    const storage = {
      getItem: (key: string) => (key === "sunny:wardrobe-store-lab:v1:ila" ? JSON.stringify(kioskState()) : null),
    };
    const wallet = { coins: 0, ownedRewardIds: ["outfit:navy-ribbon-dress"] };
    expect(savedEquippedLook(storage, "ila", wallet, "hikari", presentation.bodyModelUrl).outfitId).toBe("sleeveless-dress");
  });
});
