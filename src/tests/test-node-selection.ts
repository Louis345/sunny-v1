import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChildProfile } from "../shared/childProfile";
import { cloneCompanionDefaults } from "../shared/companionTypes";
import type { SessionTheme } from "../shared/adventureTypes";
import { buildNodeList } from "../engine/nodeSelection";

vi.mock("../engine/bandit", () => ({
  selectNodeType: vi.fn(),
}));

vi.mock("../engine/learningEngine", async (orig) => {
  const mod = await orig<typeof import("../engine/learningEngine")>();
  return {
    ...mod,
    planSession: vi.fn(),
  };
});

import { selectNodeType } from "../engine/bandit";
import { planSession } from "../engine/learningEngine";

function profile(attention: number, childId = "qa_child"): ChildProfile {
  return {
    childId,
    level: 5,
    interests: { tags: [] },
    ui: { accentColor: "#111" },
    unlockedThemes: ["default"],
    attentionWindow_ms: attention,
    companion: cloneCompanionDefaults(),
  };
}

function theme(): SessionTheme {
  return {
    name: "default",
    palette: {
      sky: "#a",
      ground: "#b",
      accent: "#c",
      particle: "#d",
      glow: "#e",
    },
    ambient: { type: "dots", count: 20, speed: 1, color: "#fff" },
    nodeStyle: "rounded",
    pathStyle: "curve",
    castleVariant: "stone",
  };
}

describe("buildNodeList (TASK-009)", () => {
  beforeEach(() => {
    vi.mocked(selectNodeType).mockReset();
    vi.mocked(selectNodeType).mockResolvedValue("word-builder");
    vi.mocked(planSession).mockReturnValue({
      childId: "qa_child",
      mode: "spelling",
      activities: [],
      newWords: [],
      reviewWords: ["alpha", "beta"],
      focusWords: ["alpha", "beta", "gamma"],
      totalWordCount: 3,
      estimatedMinutes: 10,
      bondContext: "",
      difficultyParams: {} as never,
      moodAdjustment: false,
      wilsonStep: 1,
    });
  });

  it("first node is riddle", async () => {
    const nodes = await buildNodeList(profile(100_000), theme());
    expect(nodes[0]?.type).toBe("riddle");
  });

  it("last node is boss with isGoal=true", async () => {
    const nodes = await buildNodeList(profile(400_000), theme());
    expect(nodes[nodes.length - 1]?.type).toBe("boss");
    expect(nodes[nodes.length - 1]?.isGoal).toBe(true);
  });

  it("isGoal is false on all non-terminal nodes", async () => {
    const nodes = await buildNodeList(profile(400_000), theme());
    expect(nodes.slice(0, -1).every((n) => n.isGoal === false)).toBe(true);
  });

  it("matches attention-based counts (3 / 4 / 5 nodes)", async () => {
    const short = await buildNodeList(profile(100_000), theme());
    const med = await buildNodeList(profile(200_000), theme());
    const long = await buildNodeList(profile(400_000), theme());
    expect(short.length).toBe(3);
    expect(med.length).toBe(4);
    expect(long.length).toBe(5);
  });

  it("marks all generated nodes with map status flags", async () => {
    const nodes = await buildNodeList(profile(400_000), theme());
    const wb = nodes.find((n) => n.type === "word-builder");
    expect(wb).toBeDefined();
    expect(wb?.isLocked).toBe(false);
    expect(wb?.isCompleted).toBe(false);
  });

  it("works for any childId string on profile", async () => {
    const nodes = await buildNodeList(profile(200_000, "registry_child_x"), theme());
    expect(nodes.length).toBeGreaterThan(0);
    expect(
      vi.mocked(planSession).mock.calls.some((c) => c[0] === "registry_child_x"),
    ).toBe(true);
  });
});
