import { describe, expect, it } from "vitest";
import {
  inspectXwearArchiveEntries,
  parseWardrobeCandidateManifest,
} from "../wardrobe/xwearCandidateManifest.js";

describe("XWear candidate ingestion contract", () => {
  it("normalizes a valid manifest as a non-publishable candidate", () => {
    const manifest = parseWardrobeCandidateManifest({
      version: 1,
      id: "midnight-cardigan",
      name: "Midnight Cardigan",
      icon: "🧥",
      price: 45,
      styleTags: ["cozy", "navy"],
      occupies: ["top", "outerwear"],
      replaces: ["top"],
      source: {
        creator: "Example Creator",
        url: "https://example.com/midnight-cardigan",
        licenseNotes: "Local sandbox evaluation only",
      },
    });

    expect(manifest.qa).toEqual({ status: "candidate" });
    expect(manifest.publishable).toBe(false);
    expect(manifest.occupies).toEqual(["top", "outerwear"]);
  });

  it("rejects unsafe paths and invalid clothing slots", () => {
    expect(() =>
      parseWardrobeCandidateManifest({
        version: 1,
        id: "../escape",
        name: "Escape",
        icon: "?",
        price: 1,
        styleTags: ["test"],
        occupies: ["cape"],
        replaces: ["top"],
        source: {
          creator: "Unknown",
          url: "https://example.com",
          licenseNotes: "test",
        },
      }),
    ).toThrow();
  });

  it("requires the structural files needed by the XWear renderer", () => {
    expect(
      inspectXwearArchiveEntries([
        "Mesh/outfit.mesh.bin",
        "Body/XResources/outfit-resource.json",
        "Body/XItem.json/outfit-item.json",
        "Textures/main.png",
      ]),
    ).toEqual({ ok: true, missing: [] });

    expect(inspectXwearArchiveEntries(["Textures/main.png"])).toEqual({
      ok: false,
      missing: ["Mesh/", "Body/XResources/", "Body/XItem.json/"],
    });
  });
});
