import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ChildProfile } from "../shared/childProfile";
import { cloneCompanionDefaults } from "../shared/companionTypes";
import { ALL_NODE_TYPES } from "../shared/adventureTypes";
import * as themeRegistry from "../server/theme-registry";
import { generateTheme } from "../agents/designer/designer";
import { resolveThemeForMapSession } from "../server/map-coordinator";

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
    companionContext: "",
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

  it("generates a content-aware erosion theme for main homework sessions", async () => {
    vi.setSystemTime(new Date("2026-05-04T12:00:00Z"));
    vi.mocked(generateStoryImage).mockResolvedValue("https://example.com/erosion-world.png");
    const result = await resolveThemeForMapSession(
      baseProfile({
        pendingHomework: {
          weekOf: "2026-05-04",
          testDate: "2026-05-06",
          wordList: ["erosion", "soil", "water"],
          homeworkId: "hw-reading-erosion",
          generatedAt: "2026-05-04T12:00:00.000Z",
          contentProfile: {
            practiceDomain: "reading",
            contentDomain: "science",
            topic: "Erosion and Earth's Surface",
            primarySkill: "reading_comprehension",
            assignmentFormat: "study_guide",
            concepts: ["erosion", "soil", "water", "rivers"],
            sourceEvidence: ["Erosion happens when water wears away soil."],
          },
          capturedContent: null,
          nodes: [
            {
              id: "n-word-radar-hw-reading-erosion",
              type: "word-radar",
              words: ["erosion"],
              difficulty: 1,
              gameFile: null,
              storyFile: null,
              approved: false,
            },
          ],
        },
      }),
    );

    expect(result.theme.name).toBe("erosion");
    expect(result.theme.source).toBe("generated");
    expect(result.theme.backgroundUrl).toBe("https://example.com/erosion-world.png");
    expect(result.shouldPersist).toBe(true);
  });
});
