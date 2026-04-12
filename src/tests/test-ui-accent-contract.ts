import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { normalizeCompanionConfig } from "../shared/companionTheme";

function read(filePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), filePath), "utf-8");
}

describe("UI accent contract", () => {
  it("does not define legacy companion accent helper", () => {
    const src = read("web/src/components/AdventureMap.tsx");
    const legacyName = `companion${"Accent"}`;
    expect(src.includes(`function ${legacyName}`)).toBe(false);
  });

  it("does not use Ila/Reina object keys in component files", () => {
    const files = [
      "web/src/components/AdventureMap.tsx",
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
