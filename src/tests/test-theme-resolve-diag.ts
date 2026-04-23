import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import type { ChildProfile } from "../shared/childProfile";
import { cloneCompanionDefaults } from "../shared/companionTypes";
import {
  __resetAdventureMapSessionsForTests,
  handleMapClientMessage,
  resolveThemeForMapSession,
  startMapSession,
} from "../server/map-coordinator";
import { paletteOnlyThemeFromProfile } from "../agents/designer/designer";
import {
  bundledJsonToSessionTheme,
  loadRandomSavedTheme,
} from "../utils/themeLoader";

vi.mock("../profiles/buildProfile", () => ({
  buildProfile: vi.fn(),
}));

vi.mock("../agents/designer/designer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/designer/designer")>();
  return { ...actual };
});

vi.mock("../engine/nodeSelection", () => ({
  buildNodeList: vi.fn(),
}));

vi.mock("../utils/nodeRatingIO", () => ({
  appendNodeRating: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../engine/bandit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/bandit")>();
  return { ...actual, recordReward: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("../engine/learningEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/learningEngine")>();
  return { ...actual, recordAttempt: vi.fn().mockReturnValue({}) };
});

import { buildProfile } from "../profiles/buildProfile";
import { buildNodeList } from "../engine/nodeSelection";

function baseProfile(overrides: Partial<ChildProfile> = {}): ChildProfile {
  return {
    childId: "ila",
    ttsName: "Ila",
    level: 2,
    interests: { tags: [] },
    ui: { accentColor: "#00f" },
    unlockedThemes: ["default"],
    attentionWindow_ms: 200_000,
    childContext: "",
    companion: cloneCompanionDefaults(),
    ...overrides,
  };
}

function mockNodes(): NonNullable<
  Awaited<ReturnType<typeof startMapSession>>
>["mapState"]["nodes"] {
  return [
    {
      id: "n-riddle",
      type: "riddle",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 1,
    },
  ];
}

describe("paletteOnlyThemeFromProfile", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fills required SessionTheme fields including palette.cardBackground", () => {
    const theme = paletteOnlyThemeFromProfile(baseProfile());
    expect(theme.palette.sky).toBeTruthy();
    expect(theme.palette.ground).toBeTruthy();
    expect(theme.palette.accent).toBeTruthy();
    expect(theme.palette.particle).toBeTruthy();
    expect(theme.palette.glow).toBeTruthy();
    expect(theme.palette.cardBackground).toBeTruthy();
    expect(theme.nodeStyle).toBeTruthy();
    expect(theme.pathStyle).toBeTruthy();
    expect(theme.castleVariant).toBeTruthy();
    expect(theme.ambient).toBeDefined();
    expect(theme.mapWaypoints?.length).toBeGreaterThanOrEqual(2);
    expect(theme.nodeThumbnails).toEqual({});
  });
});

describe("loadRandomSavedTheme", () => {
  it("returns a valid SessionTheme when themes/ has JSON", () => {
    const theme = loadRandomSavedTheme();
    expect(theme).not.toBeNull();
    expect(theme!.palette.cardBackground).toBeTruthy();
    expect(theme!.source).toBe("saved");
  });

  it("returns null when themes dir is empty", () => {
    const spy = vi.spyOn(fs, "readdirSync").mockReturnValue([]);
    expect(loadRandomSavedTheme()).toBeNull();
    spy.mockRestore();
  });
});

describe("bundledJsonToSessionTheme", () => {
  it("returns null for invalid JSON", () => {
    expect(bundledJsonToSessionTheme(null)).toBeNull();
    expect(bundledJsonToSessionTheme({})).toBeNull();
  });

  it("strips image URLs from homework bundle JSON (URLs expire)", () => {
    const saved = {
      id: "x",
      name: "fixture",
      generatedAt: "2026-01-01T00:00:00.000Z",
      worldBackgroundUrl: "https://expired.grok.url/img.png",
      thumbnails: { "word-builder": "https://cdn.example/w.png" },
      palette: {
        sky: "#1a1a2e",
        ground: "#228b5c",
        accent: "#3366ff",
        particle: "#e0f2fe",
        glow: "#3366ff",
      },
      savedBy: "test",
    };
    const theme = bundledJsonToSessionTheme(saved);
    expect(theme).not.toBeNull();
    expect(theme!.backgroundUrl).toBeUndefined();
    expect(theme!.castleUrl).toBeUndefined();
    expect(theme!.nodeThumbnails).toBeUndefined();
    expect(theme!.palette.sky).toBe("#1a1a2e");
  });

  it("strips image fields from full SessionTheme-shaped JSON", () => {
    const raw = {
      name: "t",
      palette: {
        sky: "#aabbcc",
        ground: "#ddeeff",
        accent: "#111",
        particle: "#222",
        glow: "#333",
      },
      ambient: { type: "dots", count: 1, speed: 1, color: "#fff" },
      nodeStyle: "rounded",
      pathStyle: "curve",
      castleVariant: "stone",
      backgroundUrl: "https://x/img.png",
      castleUrl: "https://x/c.png",
      nodeThumbnails: { riddle: "https://x/r.png" },
    };
    const theme = bundledJsonToSessionTheme(raw);
    expect(theme).not.toBeNull();
    expect(theme!.backgroundUrl).toBeUndefined();
    expect(theme!.castleUrl).toBeUndefined();
    expect(theme!.nodeThumbnails).toBeUndefined();
    expect(theme!.palette.sky).toBe("#aabbcc");
  });
});

describe("resolveThemeForMapSession (diag)", () => {
  beforeEach(() => {
    vi.stubEnv("SUNNY_MODE", "diag");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a saved bundle theme with source saved (no image URLs)", async () => {
    const out = await resolveThemeForMapSession(baseProfile());
    expect(out.theme.source).toBe("saved");
    expect(out.theme.backgroundUrl).toBeUndefined();
    expect(out.theme.nodeThumbnails).toBeUndefined();
    expect(out.theme.palette.sky).toBeTruthy();
    expect(out.shouldPersist).toBe(false);
  });

  it("does not call writeFileSync", async () => {
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
    await resolveThemeForMapSession(baseProfile());
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });
});

describe("diag map session node_click with bundled theme", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    __resetAdventureMapSessionsForTests();
    vi.stubEnv("SUNNY_MODE", "diag");
    vi.mocked(buildProfile).mockResolvedValue({
      ...baseProfile({ childId: "qa_map" }),
    });
    vi.mocked(buildNodeList).mockResolvedValue(mockNodes() as never);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(buildProfile).mockReset();
    vi.mocked(buildNodeList).mockReset();
  });

  it("node_launched uses the current node id", async () => {
    const { sessionId, mapState } = await startMapSession("qa_map");
    const firstId = mapState.nodes[0]!.id;
    const events = handleMapClientMessage(sessionId, {
      type: "node_click",
      payload: { nodeId: firstId },
    });
    expect(events[0]?.type).toBe("node_launched");
  });
});
