import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ChildProfile } from "../shared/childProfile";
import { cloneCompanionDefaults } from "../shared/companionTypes";
import { ALL_NODE_TYPES } from "../shared/adventureTypes";
import * as themeRegistry from "../server/theme-registry";
import { generateTheme } from "../agents/designer/designer";

vi.mock("../utils/generateStoryImage", () => ({
  generateStoryImage: vi.fn().mockResolvedValue(null),
}));

import { generateStoryImage } from "../utils/generateStoryImage";

function baseProfile(overrides: Partial<ChildProfile> = {}): ChildProfile {
  return {
    childId: "qa_profile",
    ttsName: "Qa profile",
    level: 6,
    interests: { tags: ["puzzles"] },
    ui: { accentColor: "#3366ff" },
    unlockedThemes: ["default", "beach"],
    attentionWindow_ms: 240_000,
    childContext: "",
    companion: cloneCompanionDefaults(),
    ...overrides,
  };
}

describe("DesignerAgent generateTheme (TASK-008)", () => {
  beforeEach(() => {
    vi.mocked(generateStoryImage).mockClear();
    vi.mocked(generateStoryImage).mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.SUNNY_SUBJECT;
    vi.unstubAllGlobals();
  });

  it("returns a valid SessionTheme shape", async () => {
    const t = (await generateTheme(baseProfile()))!;
    expect(t.name).toBeTruthy();
    expect(t.palette.sky).toBeTruthy();
    expect(t.palette.ground).toBeTruthy();
    expect(t.palette.accent).toBeTruthy();
    expect(t.palette.particle).toBeTruthy();
    expect(t.palette.glow).toBeTruthy();
    expect(t.ambient.count).toBeGreaterThan(0);
    expect(t.nodeStyle).toBeTruthy();
    expect(t.pathStyle).toBeTruthy();
    expect(t.castleVariant).toBeTruthy();
    expect(t.mapWaypoints).toBeDefined();
    expect(t.mapWaypoints!.length).toBeGreaterThanOrEqual(2);
  });

  it("works when Grok returns null (no API key path)", async () => {
    const t = (await generateTheme(baseProfile()))!;
    expect(t.backgroundUrl).toBeUndefined();
    expect(t.castleUrl).toBeNull();
    expect(t.nodeThumbnails).toBeDefined();
    for (const type of ALL_NODE_TYPES) {
      expect(t.nodeThumbnails![type]).toBeNull();
    }
    expect(vi.mocked(generateStoryImage)).toHaveBeenCalledTimes(
      2 + ALL_NODE_TYPES.length,
    );
  });

  it("selects theme name from profile.unlockedThemes only", async () => {
    const spy = vi.spyOn(themeRegistry, "getRandomUnlockedTheme").mockReturnValue("beach");
    const t = (await generateTheme(baseProfile({ unlockedThemes: ["default", "beach"] })))!;
    expect(t.name).toBe("beach");
    spy.mockRestore();
  });

  it("respects time of day for palette (mock Date)", async () => {
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    const dayTheme = (await generateTheme(baseProfile()))!;
    vi.setSystemTime(new Date("2026-06-15T22:00:00Z"));
    const nightTheme = (await generateTheme(baseProfile()))!;
    expect(dayTheme.palette.sky).not.toBe(nightTheme.palette.sky);
  });

  it("applies reading-mode palette when SUNNY_SUBJECT=reading", async () => {
    process.env.SUNNY_SUBJECT = "reading";
    const t = (await generateTheme(baseProfile()))!;
    expect(t.pathStyle).toContain("reading");
  });
});
