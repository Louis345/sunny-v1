import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ANIMATION_REGISTRY,
  assertAnimationRegistryComplete,
  getAnimationEntry,
} from "../companion/animationRegistry";
import { COMPANION_ANIMATION_IDS } from "../../../src/shared/companions/companionContract";

describe("animationRegistry (COMPANION-MOTOR)", () => {
  it("has a row for every contract AnimationName", () => {
    expect(() => assertAnimationRegistryComplete()).not.toThrow();
    for (const id of COMPANION_ANIMATION_IDS) {
      expect(id in ANIMATION_REGISTRY).toBe(true);
    }
  });

  it("getAnimationEntry returns registry row", () => {
    expect(getAnimationEntry("wave")).toBe(ANIMATION_REGISTRY.wave);
  });

  it("points every registry row at a real static FBX asset", () => {
    for (const entry of Object.values(ANIMATION_REGISTRY)) {
      expect(entry, "contract animation should have a registry entry").not.toBeNull();
      if (!entry) continue;
      const relativePath = entry.path.replace(/^\//, "");
      const diskPath = path.join(process.cwd(), "public", relativePath);
      const bytes = fs.existsSync(diskPath) ? fs.readFileSync(diskPath, null) : null;
      const header = bytes ? bytes.subarray(0, 32).toString("utf8") : "";

      expect(fs.existsSync(diskPath), `missing ${diskPath}`).toBe(true);
      expect(bytes?.byteLength ?? 0, `${entry.path} should not be a placeholder`).toBeGreaterThan(
        1024,
      );
      expect(header, `${entry.path} did not resolve to an FBX binary`).not.toContain(
        "<!doctype html>",
      );
      expect(diskPath.endsWith(".fbx"), `${entry.path} should stay on FBX loader path`).toBe(
        true,
      );
    }
  });
});
