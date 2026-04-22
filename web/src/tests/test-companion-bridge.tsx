import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const componentsDir = join(dirname(fileURLToPath(import.meta.url)), "../components");

describe("Injection architecture deletion", () => {
  it("CompanionBridge.tsx does not exist", () => {
    expect(existsSync(join(componentsDir, "CompanionBridge.tsx"))).toBe(false);
  });

  it("CompanionFace.tsx does not exist", () => {
    expect(existsSync(join(componentsDir, "CompanionFace.tsx"))).toBe(false);
  });
});
