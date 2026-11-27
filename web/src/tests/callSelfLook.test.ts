import { describe, expect, it } from "vitest";
import { callCompanionLook, createSelfLookGuard, noteTryOn, portraitSnapshot } from "../lib/callSelfLook";

// BUGS.md S34 (human-caught 2026-11-19 01:08 UTC): Ila tried the sky ribbon dress and then the navy one on Princess
// and asked "you like this dress, or do you like this dress?"; Princess said she could not see anything. Why the human
// caught it: only a child dressing her companion asks it about itself. Why logs missed it: the call sent no outfit, and
// vision=false is every turn's normal. Why the lab missed it: no test checked what a FaceTime turn says she wears.

describe("what the call tells the companion she wears (S34)", () => {
  it("names the drawn outfit and accessory by their shop names", () => {
    expect(callCompanionLook({ outfitId: "sleeveless-dress", accessoryId: "none", materialVariant: { id: "sleeveless-dress", tint: "#ffffff" } }, [])).toEqual({
      outfit: "Navy Ribbon Dress", accessory: "", recentTryOns: [],
    });
  });

  it("tells the sky dress from the navy one (same dress, different colour)", () => {
    expect(callCompanionLook({ outfitId: "sleeveless-dress", accessoryId: "none", materialVariant: { id: "sky-ribbon-dress", tint: "#7cc8ff" } }, []).outfit)
      .toBe("Sky Ribbon Dress");
  });

  it("says nothing from the shop when she wears her own clothes", () => {
    expect(callCompanionLook({ outfitId: "none", accessoryId: "none", materialVariant: null }, ["Navy Ribbon Dress"]))
      .toEqual({ outfit: "", accessory: "", recentTryOns: ["Navy Ribbon Dress"] });
  });

  it("keeps the last three different try-ons, newest last", () => {
    const tried = ["Sky Ribbon Dress", "Navy Ribbon Dress", "Sky Ribbon Dress", "Sky Ribbon Dress", "Plum Ribbon Dress"]
      .reduce<string[]>((list, name) => noteTryOn(list, name), []);
    expect(tried).toEqual(["Navy Ribbon Dress", "Sky Ribbon Dress", "Plum Ribbon Dress"]);
  });
});

describe("look-at-myself guard (S34, AGENTS Law 2)", () => {
  it("allows one look per question", () => {
    const guard = createSelfLookGuard();
    expect(guard.allow("turn-1")).toBe(true);
    expect(guard.allow("turn-1")).toBe(false);
    expect(guard.allow("turn-2")).toBe(true);
  });

  it("stops after ten looks in one call", () => {
    const guard = createSelfLookGuard();
    const allowed = Array.from({ length: 12 }, (_, index) => guard.allow(`turn-${index}`)).filter(Boolean);
    expect(allowed).toHaveLength(10);
  });

  it("starts fresh for a new call", () => {
    const guard = createSelfLookGuard();
    for (let index = 0; index < 10; index += 1) guard.allow(`turn-${index}`);
    guard.reset();
    expect(guard.allow("turn-0")).toBe(true);
  });
});

describe("her picture", () => {
  it("is null when the portrait cannot be drawn, so she answers from the facts", () => {
    expect(portraitSnapshot(null)).toBeNull();
  });
});
