import { describe, expect, it } from "vitest";
import {
  resolveSlotWardrobeOutfit,
  shouldFallBackToPlainLook,
  shouldRevealWardrobeCompanionCanvas,
} from "../components/CompanionShowroom";

// Owner-observed 2026-11-08: companions vanished while scrolling through them in FaceTime. The main-stage slot
// loads the plain companion model but was handed the outfit approved only for the dressable body; xwearDress
// refused it, the load was marked failed, and a failed load hid the canvas forever. Why the human caught it: an
// empty stage. Why logs missed it: "preview_settled result=failed" looked like a routine asset miss, with no
// line saying a companion was now invisible. Why the lab missed it: it only tested reveal states, never which
// outfit a slot receives for the model it actually loads.
const PLAIN_MODEL = "/companions/673852811403133503.vrm"; // Matilda's plain model (vroid-slim body)
const ELLI_DRESSABLE = "/companions/elli-wardrobe-identity-preserved-v1.vrm";

describe("main-stage slot outfit", () => {
  it("a plain model never receives an outfit approved only for the dressable body, so it still reveals", () => {
    const outfit = resolveSlotWardrobeOutfit({ outfitId: "sleeveless-dress", modelUrl: PLAIN_MODEL });
    expect(outfit).toBe("none");
    // With no outfit to refuse, the plain load settles ready and the canvas is revealed.
    expect(shouldRevealWardrobeCompanionCanvas({ requiresReady: true, presentationState: "ready", requestedKey: "k", settledKey: "k" })).toBe(true);
  });

  it("the dressable body keeps an outfit approved for it", () => {
    expect(resolveSlotWardrobeOutfit({ outfitId: "sleeveless-dress", modelUrl: ELLI_DRESSABLE })).toBe("sleeveless-dress");
  });

  it("a failed dressed load falls back to her own clothes; a failed plain load does not loop", () => {
    expect(shouldFallBackToPlainLook({ presentationState: "failed", loadedOutfitId: "sleeveless-dress" })).toBe(true);
    expect(resolveSlotWardrobeOutfit({ outfitId: "sleeveless-dress", modelUrl: ELLI_DRESSABLE, dressFailed: true })).toBe("none");
    expect(shouldFallBackToPlainLook({ presentationState: "failed", loadedOutfitId: "none" })).toBe(false);
    expect(shouldFallBackToPlainLook({ presentationState: "ready", loadedOutfitId: "sleeveless-dress" })).toBe(false);
  });
});
