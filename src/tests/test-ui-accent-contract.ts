import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { normalizeCompanionConfig } from "../shared/companionTheme";

function read(filePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), filePath), "utf-8");
}

describe("UI accent contract", () => {
  it("does not ship the legacy AdventureMap companion accent helper", () => {
    expect(fs.existsSync(path.resolve(process.cwd(), "web/src/components/AdventureMap.tsx"))).toBe(false);
  });

  it("does not use Ila/Reina object keys in component files", () => {
    const files = [
      "web/src/components/AdventureBoard.tsx",
      "web/src/components/AdventureBoardExperience.tsx",
      "web/src/components/SessionScreen.tsx",
      "web/src/components/ChildPicker.tsx",
    ];
    for (const fp of files) {
      const src = read(fp);
      expect(/\bIla\s*:/.test(src)).toBe(false);
      expect(/\bReina\s*:/.test(src)).toBe(false);
    }
  });

  it("normalizes missing companion accent fields to defaults", () => {
    const normalized = normalizeCompanionConfig({
      childName: "NewChild",
      companionName: "Nova",
      emoji: "🌟",
    });
    expect(normalized.accentColor).toBe("#7C3AED");
    expect(normalized.accentBg).toBe("#F3E8FF");
  });
});
