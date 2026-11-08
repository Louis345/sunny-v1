import { describe, expect, it } from "vitest";
import { callPortraitLook } from "../utils/callCompanion";

// Owner 2026-11-08: Ila bought a dress in the call and Elli was not wearing it. The call's portrait was drawn
// with no outfit at all (only the shop preview had one). Logs showed the purchase paid; the lab checked the
// shop preview, never the call portrait.
describe("the call portrait wears what she bought", () => {
  const current = { id: "elli", vrmUrl: "/companions/elli.vrm" };
  const dressable = { id: "elli", vrmUrl: "/companions/elli-wardrobe-identity-preserved-v1.vrm" };
  it("draws the dressable body with her outfit in an earned call", () => {
    expect(callPortraitLook({ shopEnabled: true, current, dressable, outfitId: "sleeveless-dress", accessoryId: "royal-crown", materialVariant: null }))
      .toEqual({ entry: dressable, outfitId: "sleeveless-dress", accessoryId: "royal-crown", materialVariant: null });
  });
  it("draws the plain companion outside an earned call", () => {
    expect(callPortraitLook({ shopEnabled: false, current, dressable, outfitId: "sleeveless-dress", accessoryId: "none", materialVariant: null }))
      .toEqual({ entry: current, outfitId: "none", accessoryId: "none", materialVariant: null });
  });
});
