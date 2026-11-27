import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SLEEVELESS_DRESS_OUTFIT, COMET_HOODIE_OUTFIT, CONSTELLATION_BLAZER_OUTFIT } from "../lib/xwearDress";
import { resolveLocalWardrobeAsset } from "../../wardrobeAssets";

describe("wardrobe asset portability", () => {
  it.each([SLEEVELESS_DRESS_OUTFIT, COMET_HOODIE_OUTFIT, CONSTELLATION_BLAZER_OUTFIT])("loads $id through an allowlisted local lab route", (outfit) => {
    expect(outfit.archiveUrl).toMatch(/^\/__wardrobe-assets\//);
    const archive = resolveLocalWardrobeAsset(outfit.archiveUrl!);
    expect(archive).toBeTruthy();
    expect(readFileSync(archive!).subarray(0, 2).toString()).toBe("PK");
    expect(archive).not.toContain("/public/");
  });
  it.each(["/__wardrobe-assets/../../.env", "/__wardrobe-assets/%2e%2e/.env", "/__wardrobe-assets/unknown", "/.env"])("refuses non-catalog path %s", (url) => {
    expect(resolveLocalWardrobeAsset(url)).toBeUndefined();
  });
});
