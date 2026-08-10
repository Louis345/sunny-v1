import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readShowroomSource(): string {
  return readFileSync(
    resolve(__dirname, "../components/CompanionShowroom.tsx"),
    "utf8",
  );
}

function readStoreSource(): string {
  return readFileSync(
    resolve(__dirname, "../components/WardrobeStoreLab.tsx"),
    "utf8",
  );
}

function readStoreStyles(): string {
  return readFileSync(
    resolve(__dirname, "../components/WardrobeStoreLab.css"),
    "utf8",
  );
}

describe("companion wardrobe feasibility lab", () => {
  it("keeps the store sandbox behind the explicit wardrobe lab opt-in", () => {
    const source = readShowroomSource();

    expect(source).toContain('get("wardrobeLab") === "true"');
    expect(source).toContain("WardrobeStoreLab");
    expect(source).toContain("handleWardrobeStoreChange");
    expect(source).toContain("wardrobeStoreOpen");
    expect(source).toContain("onGoShopping=");
    expect(source).toContain("wardrobeLabEnabled && wardrobeStoreOpen");
    expect(source).toContain("onExit={closeWardrobeStore}");
  });

  it("shows Go Shopping on the original showroom instead of hiding it inside FaceTime", () => {
    const source = readShowroomSource();

    expect(source).toContain("renderWardrobeStoreButton");
    expect(source).toContain('aria-label="Go Shopping"');
    expect(source).toContain('setWardrobeStoreReturnTarget("showroom")');
    expect(source).toContain('setWardrobeStoreReturnTarget("call")');
  });

  it("renders the spatial store as a full-screen lab with a real VRM preview", () => {
    const source = readStoreSource();
    const showroomSource = readShowroomSource();

    expect(source).toContain('aria-label="Companion shopping sandbox"');
    expect(source).toContain('className="wardrobe-store-lab"');
    expect(source).not.toContain('bottom: 14');
    expect(showroomSource).toContain("companionPreview={");
    expect(showroomSource).not.toContain("companionPortrait={");
    expect(showroomSource).toContain("<CompanionSlot");
    expect(showroomSource).toContain("contained");
    expect(showroomSource).toContain(
      'displayScaleOverride={view === "full_body" ? 4 : 1}',
    );
    expect(showroomSource).toContain(
      'cameraAngleOverride={view === "portrait" ? "mid-shot" : "full-body"}',
    );
  });

  it("uses one shopping-call shell instead of the cluttered physical room", () => {
    const source = readStoreSource();

    expect(source).toContain('`${companion.name} try-on stage`');
    expect(source).toContain('aria-label="Shop items"');
    expect(source).not.toContain("The Lantern Room");
    expect(source).not.toContain("wardrobe-store-lab__fixtures");
    expect(source).not.toContain("receipt-backdrop");
  });

  it("keeps generated review and try-on reactions without rendering a shopping chat bar", () => {
    const source = readShowroomSource();
    const storeSource = readStoreSource();

    expect(source).toContain("openShowroomVideoChat();");
    expect(source).toContain("onMotorReady={handleVideoChatMotorReady}");
    expect(source).toContain("onShoppingContextChange=");
    expect(source).toContain("onCompanionReaction=");
    expect(source).toContain("shoppingContextOverride ?? wardrobeShoppingContext");
    expect(storeSource).not.toContain('aria-label={`Talk to ${companion.name}`}');
    expect(storeSource).not.toContain("wardrobe-store-lab__conversation-dock");
    expect(storeSource).toContain('aria-label={`${companion.name} live`}');
    expect(storeSource).toContain('aria-label={`Talk to ${companion.name} by voice`}');
    expect(storeSource).toContain('aria-label={`${companion.name} try-on stage`}');
  });

  it("removes showroom background music and its controls", () => {
    const source = readShowroomSource();

    expect(source).not.toContain("createAmbientMusic");
    expect(source).not.toContain("Turn background music off");
    expect(source).not.toContain("Turn background music on");
  });

  it("uses responsive grid areas instead of reserving fixed portrait space", () => {
    const styles = readStoreStyles();

    expect(styles).toContain("grid-template-areas:");
    expect(styles).toContain("place-items: center");
    expect(styles).not.toContain("padding-right: 250px");
    expect(styles).not.toContain("wardrobe-store-lab__companion-call");
    expect(styles).toMatch(
      /wardrobe-store-lab__entrance-preview[^{]*\{[^}]*position:\s*relative/s,
    );
    expect(styles).toMatch(
      /wardrobe-store-lab__companion-portrait-preview[^{]*\{[^}]*position:\s*relative/s,
    );
    expect(styles).toMatch(
      /wardrobe-store-lab__try-on-preview[^{]*\{[^}]*position:\s*relative/s,
    );
    expect(styles).toContain("transform: scale(1.18) !important;");
    expect(styles).toContain("transform: scale(1.45) !important;");
    expect(styles).toContain("transform: scale(1.55) !important;");
  });

  it("fills the dynamic viewport in the original showroom without stretching companions", () => {
    const source = readShowroomSource();

    expect(source).toContain('height: "100dvh"');
    expect(source).toContain('bottom: "clamp(48px, 7dvh, 78px)"');
    expect(source).not.toContain('height: "72vh"');
    expect(source).not.toContain('top: wardrobeLabEnabled ? "calc(62vh - 36px)"');
    expect(source).toContain('height: "min(66vh, 560px)"');
  });

  it("keeps every companion inside the camera and exposes per-character resize controls", () => {
    const source = readShowroomSource();

    expect(source).toContain("SHOWROOM_MAX_DISPLAY_SCALE = 1.05");
    expect(source).toContain("showroomCharacterScaleOverrides");
    expect(source).toContain(
      "displayScaleOverride={showroomCharacterScaleOverrides[slot.entry.id]}",
    );
    expect(source).toContain('aria-label={`Make ${current.name} smaller`}');
    expect(source).toContain('aria-label={`Make ${current.name} larger`}');
    expect(source).toContain("character_resize applied");
    expect(source).toContain("displayScale: motorDisplayScale");
    expect(source).not.toContain("motorDisplayScale !== displayScale");
  });

  it("attaches generated accessories to the loaded companion head bone", () => {
    const source = readShowroomSource();

    expect(source).toContain("createWardrobeAccessory");
    expect(source).toContain('getRawBoneNode("head")');
    expect(source).toContain("head.add(accessory)");
    expect(source).toContain("wardrobeAccessoryId");
  });

  it("converts world-up placement into each VRM head bone's local coordinates", () => {
    const source = readShowroomSource();

    expect(source).toContain("getWardrobeAccessoryWorldOffset");
    expect(source).toContain("head.getWorldPosition");
    expect(source).toContain("head.worldToLocal");
    expect(source).toContain("head.getWorldQuaternion");
    expect(source).toContain("invert()");
  });

  it("replaces and disposes the prior preview instead of stacking meshes", () => {
    const source = readShowroomSource();

    expect(source).toContain("removeWardrobeAccessory");
    expect(source).toContain("removeFromParent()");
    expect(source).toContain("geometry.dispose()");
    expect(source).toContain("material.dispose()");
    expect(source).toContain(
      " 🎮 [companion-wardrobe-lab] accessory_preview applied",
    );
  });

  it("offers one segmented outfit that follows torso, hip, arm, and leg bones", () => {
    const source = readShowroomSource();

    expect(source).toContain("createGalaxyHeroOutfit");
    expect(source).toContain('getRawBoneNode("upperChest")');
    expect(source).toContain('getRawBoneNode("hips")');
    expect(source).toContain('getRawBoneNode("leftUpperArm")');
    expect(source).toContain('getRawBoneNode("rightUpperArm")');
    expect(source).toContain('getRawBoneNode("leftLowerLeg")');
    expect(source).toContain('getRawBoneNode("rightLowerLeg")');
    expect(source).toContain("removeWardrobeOutfit");
  });

  it("keeps unverified downloaded outfits off incompatible character designs", () => {
    const source = readShowroomSource();
    const storeSource = readStoreSource();

    expect(source).toContain("isXwearOutfitApprovedForAvatar");
    expect(source).toContain("isWardrobeOutfitCompatible");
    expect(source).toContain("effectiveWardrobeOutfitId");
    expect(storeSource).toContain("getCompatibleWardrobeItems");
  });
});
