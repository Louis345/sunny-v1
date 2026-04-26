import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..");
const manifestPath = path.join(repoRoot, "scripts", "companion-vrms.manifest.json");

type ManifestAsset = { filename: string; sha256?: string };

type Manifest = {
  githubRepo: string;
  releaseTag: string;
  minBytesToTreatAsPresent?: number;
  assets: ManifestAsset[];
};

function loadManifest(): Manifest {
  const raw = fs.readFileSync(manifestPath, "utf8");
  return JSON.parse(raw) as Manifest;
}

describe("companion-vrms.manifest.json", () => {
  it("has a valid GitHub repo and release tag", () => {
    const m = loadManifest();
    expect(m.githubRepo).toMatch(/^[\w.-]+\/[\w.-]+$/);
    expect(m.releaseTag.length).toBeGreaterThan(0);
  });

  it("lists only bare .vrm filenames", () => {
    const m = loadManifest();
    expect(Array.isArray(m.assets)).toBe(true);
    expect(m.assets.length).toBeGreaterThan(0);
    for (const a of m.assets) {
      expect(typeof a.filename).toBe("string");
      expect(a.filename).toMatch(/\.vrm$/i);
      expect(a.filename).toBe(path.basename(a.filename));
      if (a.sha256 !== undefined) {
        expect(a.sha256).toMatch(/^[a-f0-9]{64}$/i);
      }
    }
  });
});
