import { describe, it, expect, vi, afterEach } from "vitest";
import type { ChildProfile } from "../shared/childProfile";
import { cloneCompanionDefaults } from "../shared/companionTypes";
import {
  getAvailableThemes,
  getRandomUnlockedTheme,
  isThemeUnlocked,
} from "../server/theme-registry";

function profileAtLevel(level: number): ChildProfile {
  const unlocked =
    level >= 10
      ? ["default", "beach", "space"]
      : level >= 5
        ? ["default", "beach"]
        : ["default"];
  return {
    childId: "qa",
    ttsName: "Qa",
    level,
    interests: { tags: [] },
    ui: { accentColor: "#000" },
    unlockedThemes: unlocked,
    attentionWindow_ms: 300_000,
    childContext: "",
    companion: cloneCompanionDefaults(),
  };
}

describe("theme-registry (TASK-006)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getAvailableThemes includes default when default.html exists", () => {
    const names = getAvailableThemes();
    expect(names).toContain("default");
  });

  it("isThemeUnlocked default always true", () => {
    expect(isThemeUnlocked("default", profileAtLevel(1))).toBe(true);
  });

  it("isThemeUnlocked beach false below level 5", () => {
    expect(isThemeUnlocked("beach", profileAtLevel(4))).toBe(false);
  });

  it("isThemeUnlocked beach true at level 5", () => {
    expect(isThemeUnlocked("beach", profileAtLevel(5))).toBe(true);
  });

  it("getRandomUnlockedTheme picks from unlocked list", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const p = profileAtLevel(10);
    const t = getRandomUnlockedTheme(p);
    expect(p.unlockedThemes).toContain(t);
  });
});
