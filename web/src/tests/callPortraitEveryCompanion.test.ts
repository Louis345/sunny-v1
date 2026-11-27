import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPANION_MANIFEST } from "../companion/companions.generated";
import { resolvePreparedWardrobePresentation } from "../lib/wardrobeBodyProfiles";
import { callPortraitLook } from "../utils/callCompanion";

// Bug 2026-11-10 (Ila's session): Princess showed no portrait in FaceTime, the same blank square another companion
// had before. In an earned call the portrait draws the companion's dressable wardrobe body; when that body could
// not load, the slot settled as "failed" and stayed hidden, so the call had no face at all.
// Why the human caught it: she opened a call with Princess and saw an empty frame.
// Why the logs did not: the slot logged `preview_settled result=failed`, but nothing tied that to the call portrait
// being blank, and nothing tried the companion's own model.
// Why the lab missed it: portrait tests used Elli only, and never a dressable body that fails to load.

const ids = COMPANION_MANIFEST.map(entry => entry.id);

describe("every companion has a portrait in the call", () => {
  it("covers the whole registry, Princess included", () => {
    expect(ids).toContain("princess");
    expect(ids.length).toBeGreaterThanOrEqual(8);
  });

  for (const current of COMPANION_MANIFEST) {
    it(`${current.id}: draws a model, and falls back to her own model when the dressable body fails`, () => {
      const ownModel = current.companionConfig?.vrmUrl ?? current.vrmUrl;
      expect(ownModel, `${current.id} has no model`).toMatch(/\.vrm$/);
      const presentation = resolvePreparedWardrobePresentation(current.id);
      const dressable = presentation
        ? { ...current, companionConfig: { ...current.companionConfig, vrmUrl: presentation.bodyModelUrl } }
        : null;
      const look = callPortraitLook({ shopEnabled: true, current, dressable, outfitId: "comet-hoodie", accessoryId: "cat-ears", materialVariant: null });
      expect(look.entry.companionConfig?.vrmUrl ?? look.entry.vrmUrl).toMatch(/\.vrm$/);
      const failed = callPortraitLook({ shopEnabled: true, current, dressable, outfitId: "comet-hoodie", accessoryId: "cat-ears", materialVariant: null, dressableFailed: true });
      expect(failed.entry).toBe(current);
      expect(failed.outfitId).toBe("none");
    });
  }

  it("each companion's own model file ships with the kiosk (checked where the models are installed)", () => {
    const dir = path.join(process.cwd(), "public/companions");
    const installed = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith(".vrm")) : [];
    if (installed.length === 0) return; // CI has no licensed model files; the kiosk and dev machines do.
    for (const entry of COMPANION_MANIFEST) {
      const url = entry.companionConfig?.vrmUrl ?? entry.vrmUrl;
      expect(installed, `${entry.id} model ${url}`).toContain(path.basename(url));
    }
  });

  it("the call portrait reports a model that failed to load so the call falls back", () => {
    const showroom = fs.readFileSync(path.join(process.cwd(), "src/components/CompanionShowroom.tsx"), "utf8");
    expect(showroom).toContain("onModelFailed");
    expect(showroom).toContain("dressableFailed:");
  });
});
