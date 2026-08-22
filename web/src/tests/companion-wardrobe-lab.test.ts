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

function readXwearSource(): string {
  return readFileSync(resolve(__dirname, "../lib/xwearDress.ts"), "utf8");
}

function readViteConfig(): string {
  return readFileSync(resolve(__dirname, "../../vite.config.ts"), "utf8");
}

function readMainSource(): string {
  return readFileSync(resolve(__dirname, "../main.tsx"), "utf8");
}

function readRootPackage(): string {
  return readFileSync(resolve(__dirname, "../../../package.json"), "utf8");
}

describe("companion wardrobe feasibility lab", () => {
  it("can pin the wardrobe sandbox to its matching backend instead of another worktree on port 3001", () => {
    const config = readViteConfig();

    expect(config).toContain("VITE_API_PROXY_TARGET");
    expect(config).toContain('const apiProxyTarget =');
    expect(config).toContain('target: apiProxyTarget');
  });

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

  it("keeps wardrobe diagnostics opt-in and routes them through the existing sanitized call trace", () => {
    const source = readShowroomSource();
    const storeSource = readStoreSource();

    expect(source).toContain('get("wardrobeDebug") === "true"');
    expect(source).toContain("wardrobeDebugEnabled");
    expect(source).toContain("onDebugEvent=");
    expect(source).toContain("debugTraceLink=");
    expect(source).toContain("debugTraceCopyStatus=");
    expect(source).toContain("onCopyDebugTraceLink=");
    expect(source).toContain("emitShowroomVideoCallTrace");
    expect(storeSource).toContain('type: "wardrobe_store_mounted"');
    expect(storeSource).toContain('type: "wardrobe_item_reviewed"');
    expect(storeSource).toContain('type: "wardrobe_try_on_started"');
    expect(storeSource).toContain('type: "wardrobe_voice_requested"');
    expect(storeSource).toContain('type: "wardrobe_store_exited"');
    expect(storeSource).toContain('aria-label="Copy debug log"');
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

  it("waits for the child to request an organic opinion after try-on", () => {
    const source = readShowroomSource();
    const storeSource = readStoreSource();

    expect(source).toContain("openShowroomVideoChat({ handsFree: false });");
    expect(source).toContain("onMotorReady={handleVideoChatMotorReady}");
    expect(source).toContain("onShoppingContextChange=");
    expect(source).toContain("shoppingContextOverride ?? wardrobeShoppingContext");
    expect(source).not.toContain("onCompanionReaction=");
    expect(source).not.toContain("React naturally to the item that was just tried on.");
    expect(source).not.toContain("systemInitiated");
    expect(storeSource).not.toContain('{ type: "item_reviewed", itemId: item.id }');
    expect(storeSource).not.toContain('{ type: "try_on_started", itemId: item.id }');
    expect(storeSource).toContain("conversation=waiting_for_child");
    expect(storeSource).not.toContain('aria-label={`Talk to ${companion.name}`}');
    expect(storeSource).not.toContain("wardrobe-store-lab__conversation-dock");
    expect(storeSource).toContain('aria-label={`${companion.name} live`}');
    expect(storeSource).toContain('aria-label={`Talk to ${companionName} by voice`}');
    expect(storeSource.match(/<CompanionVoiceButton/g)).toHaveLength(2);
    expect(storeSource).toContain('aria-label={`${companion.name} try-on stage`}');
    expect(storeSource).toContain('aria-label={`${companionName} is ${state}`}');
    expect(storeSource).not.toContain('aria-label={`${companion.name}’s generated opinion`}');
    expect(storeSource).not.toContain("{call.responseText}");
    expect(storeSource).toContain('role={state === "unavailable" ? "alert" : "status"}');
  });

  it("routes intro mode directly to the showroom before normal session hooks mount", () => {
    const mainSource = readMainSource();

    expect(mainSource).toContain(
      'const companionShowroomEnabled = import.meta.env.VITE_MODE === "intro"',
    );
    expect(mainSource).toContain(
      "companionShowroomEnabled ? (\n        <CompanionShowroomPage />",
    );
  });

  it("provides one verified wardrobe launcher with intro mode and an explicit env source", () => {
    const packageSource = readRootPackage();

    expect(packageSource).toContain('"wardrobe:lab"');
    expect(packageSource).toContain("VITE_MODE=intro");
    expect(packageSource).toContain("DOTENV_CONFIG_PATH");
    expect(packageSource).toContain("SUNNY_ENV_PATH");
  });

  it("uses explicit store microphone turns instead of hands-free audio that can overwrite item reactions", () => {
    const source = readShowroomSource();

    expect(source).toContain("openShowroomVideoChat({ handsFree: false });");
    expect(source).toContain("disableWardrobeHandsFreeListening");
    expect(source).toContain(
      "(!videoChatContinuousListenRef.current && !wardrobeStoreOpen)",
    );
    expect(source).toContain("[wardrobe-store-lab] hands_free disabled");
  });

  it("removes showroom background music and its controls", () => {
    const source = readShowroomSource();

    expect(source).not.toContain("createAmbientMusic");
    expect(source).not.toContain("Turn background music off");
    expect(source).not.toContain("Turn background music on");
  });

  it("uses responsive grid areas instead of reserving fixed portrait space", () => {
    const styles = readStoreStyles();
    const storeSource = readStoreSource();

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
    expect(styles).toContain("transform: translate(7%, 18%) scale(1.28) !important;");
    expect(styles).toContain("transform: scale(1.28) !important;");
    expect(styles).toContain("wardrobe-store-lab__companion-state");
    expect(storeSource).toContain('type WardrobeCompanionState =');
    expect(storeSource).toContain('| "thinking"');
    expect(storeSource).toContain('| "speaking"');
    expect(storeSource).toContain('| "unavailable"');
    expect(storeSource).toContain("<CompanionStateBubble");
    expect(storeSource).not.toContain("{call.responseText}");
    expect(styles).not.toContain("overflow-y: auto;\n  padding: 12px 14px;");
    expect(styles).not.toContain("transform: scale(1.45) !important;");
    expect(styles).not.toContain("transform: scale(1.55) !important;");
  });

  it("projects the loaded VRM head into the preview so every character drives bubble placement", () => {
    const showroomSource = readShowroomSource();
    const storeSource = readStoreSource();
    const styles = readStoreStyles();

    expect(showroomSource).toContain("onHeadScreenAnchorChange");
    expect(showroomSource).toContain('getRawBoneNode("head")');
    expect(showroomSource).toContain("project(camera)");
    expect(showroomSource).toContain("companionHeadAnchor=");
    expect(storeSource).toContain("companionHeadAnchor");
    expect(styles).toContain("--companion-head-x");
    expect(styles).toContain("--companion-head-y");
    expect(styles).not.toContain("left: calc(50% + clamp(42px, 5vw, 78px));");
  });

  it("freezes the status bubble anchor between resize events instead of chasing head animation", () => {
    const showroomSource = readShowroomSource();
    const styles = readStoreStyles();

    expect(showroomSource).toContain("if (!lastHeadAnchorRef.current)");
    expect(showroomSource).toContain("lastHeadAnchorRef.current = null");
    expect(showroomSource).not.toContain("time - lastAnchor.at >= 100");
    expect(showroomSource).not.toContain(
      "Math.abs(nextAnchor.x - lastAnchor.x) >= 0.015",
    );
    expect(styles).toMatch(
      /wardrobe-store-lab__companion-state\s*\{[^}]*width:\s*124px/s,
    );
    expect(styles).toContain("animation: wardrobe-store-state-enter");
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

  it("does not sell rigid bone-attached primitives as clothing", () => {
    const source = readShowroomSource();

    expect(source).toContain("removeWardrobeOutfit");
    expect(source).not.toContain("createGalaxyHeroOutfit");
    expect(source).not.toContain("createCometHoodieOutfit");
    expect(source).not.toContain('wardrobeOutfitId === "galaxy-hero"');
    expect(source).not.toContain('wardrobeOutfitId === "comet-hoodie"');
  });

  it("keeps unverified downloaded outfits off incompatible character designs", () => {
    const source = readShowroomSource();
    const storeSource = readStoreSource();

    expect(source).toContain("isXwearOutfitApprovedForAvatar");
    expect(source).toContain("isWardrobeOutfitCompatible");
    expect(source).toContain("effectiveWardrobeOutfitId");
    expect(storeSource).toContain("getCompatibleWardrobeItems");
  });

  it("reloads a shared fitted outfit when its selected product palette changes", () => {
    const source = readShowroomSource();
    const xwearSource = readXwearSource();

    expect(source).toContain("wardrobeOutfitMaterialVariant");
    expect(source).toContain(
      "attachXwearOutfit(vrmScene, outfitDefinition, wardrobeOutfitMaterialVariant)",
    );
    expect(source).toContain(
      "showroomCompanionConfig.vrmUrl,\n    wardrobeOutfitId,\n    wardrobeOutfitMaterialVariant,\n    wardrobeQaMode,",
    );
    expect(xwearSource).toContain(
      "applyXwearMaterialVariant(materials, materialVariant)",
    );
  });
});
