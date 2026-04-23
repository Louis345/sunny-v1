import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ChildProfile } from "../shared/childProfile";
import { cloneCompanionDefaults } from "../shared/companionTypes";

vi.mock("../utils/generateStoryImage", () => ({
  generateStoryImage: vi.fn().mockResolvedValue("https://example.com/g.png"),
}));

import { generateStoryImage } from "../utils/generateStoryImage";
import { generateTheme } from "../agents/designer/designer";
import fs from "fs";

vi.mock("../profiles/buildProfile", () => ({
  buildProfile: vi.fn(),
}));

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

import {
  __resetAdventureMapSessionsForTests,
  startMapSession,
} from "../server/map-coordinator";
import { buildProfile } from "../profiles/buildProfile";
import { buildNodeList } from "../engine/nodeSelection";

function baseProfile(overrides: Partial<ChildProfile> = {}): ChildProfile {
  return {
    childId: "qa_grok_gate",
    ttsName: "Qa",
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

function mockNodes() {
  return [
    {
      id: "n-riddle",
      type: "riddle" as const,
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 1 as const,
    },
  ];
}

describe("diag mode blocks Grok spend (SUNNY_MODE=diag)", () => {
  beforeEach(() => {
    vi.mocked(generateStoryImage).mockClear();
    vi.mocked(generateStoryImage).mockResolvedValue("https://example.com/g.png");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("getSunnyMode diag blocks generateTheme from calling generateStoryImage", async () => {
    vi.stubEnv("SUNNY_MODE", "diag");
    vi.stubEnv("SUNNY_SUBJECT", "homework");

    const t = await generateTheme(baseProfile());
    expect(t).toBeNull();
    expect(vi.mocked(generateStoryImage)).not.toHaveBeenCalled();
  });

  it("getSunnyMode diag blocks theme persistence on map session start", async () => {
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
    vi.stubEnv("SUNNY_MODE", "diag");
    vi.stubEnv("SUNNY_SUBJECT", "homework");
    __resetAdventureMapSessionsForTests();
    vi.mocked(buildProfile).mockResolvedValue({
      ...baseProfile({ childId: "qa_grok_gate" }),
      pendingHomework: {
        weekOf: "2026-01-01",
        testDate: null,
        generatedAt: new Date().toISOString(),
        wordList: ["a", "b"],
        nodes: [
          {
            id: "n1",
            type: "riddle" as const,
            words: [],
            difficulty: 1,
            gameFile: null,
            storyFile: null,
          },
        ],
      },
    });
    vi.mocked(buildNodeList).mockResolvedValue(mockNodes() as never);

    await startMapSession("qa_grok_gate");

    const themeWrites = writeSpy.mock.calls.filter(
      (c) =>
        typeof c[0] === "string" &&
        c[0].includes("themes") &&
        c[0].endsWith(".json"),
    );
    expect(themeWrites.length).toBe(0);
    writeSpy.mockRestore();
  });
});
