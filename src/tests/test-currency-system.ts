import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { MapState } from "../shared/adventureTypes";
import * as learningProfileIO from "../utils/learningProfileIO";
import { reconcileCompanionCurrencyAward } from "../server/currencyAward";

vi.mock("../utils/generateStoryImage", () => ({
  generateStoryImage: vi.fn().mockResolvedValue(null),
}));

vi.mock("../profiles/buildProfile", () => ({
  buildProfile: vi.fn(),
}));

vi.mock("../agents/designer/designer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/designer/designer")>();
  return { ...actual, generateTheme: vi.fn() };
});

vi.mock("../engine/nodeSelection", () => ({
  buildNodeList: vi.fn(),
}));

vi.mock("../engine/learningEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/learningEngine")>();
  return {
    ...actual,
    recordAttempt: vi.fn().mockReturnValue({}),
    planSession: vi.fn((childId: string, mode: string, opts?: unknown) => {
      if (mode === "homework") {
        return {
          childId,
          mode,
          activities: [],
          newWords: [],
          reviewWords: [],
          focusWords: [],
          totalWordCount: 0,
          estimatedMinutes: 0,
          bondContext: "",
          difficultyParams: {
            targetAccuracy: 0.7,
            easyThreshold: 0.85,
            hardThreshold: 0.5,
            breakThreshold: 0.4,
            windowSize: 8,
          },
          moodAdjustment: false,
          wilsonStep: 1,
          dueWords: [],
        };
      }
      return actual.planSession(childId, mode, opts as never);
    }),
  };
});

import { buildProfile } from "../profiles/buildProfile";
import { generateTheme } from "../agents/designer/designer";
import { buildNodeList } from "../engine/nodeSelection";
import { cloneCompanionDefaults } from "../shared/companionTypes";
import type { WebSocket } from "ws";
import * as mapCoordinator from "../server/map-coordinator";

function mockTheme() {
  return {
    name: "default",
    palette: {
      sky: "#a",
      ground: "#b",
      accent: "#c",
      particle: "#d",
      glow: "#e",
      cardBackground: "#f",
    },
    ambient: { type: "dots" as const, count: 20, speed: 1, color: "#fff" },
    nodeStyle: "rounded" as const,
    pathStyle: "curve" as const,
    castleVariant: "stone" as const,
  };
}

function mockNodes(): MapState["nodes"] {
  return [
    {
      id: "n-wheel",
      type: "wheel-of-fortune",
      isLocked: false,
      isCompleted: false,
      isGoal: true,
      difficulty: 1,
    },
  ];
}

describe("companionCurrency — profile reconciliation", () => {
  const baseLp = {
    childId: "testchild",
    version: 1,
    companionCurrency: 100,
  } as unknown as LearningProfile;

  beforeEach(() => {
    vi.spyOn(learningProfileIO, "readLearningProfile").mockReturnValue({
      ...baseLp,
    });
    vi.spyOn(learningProfileIO, "writeLearningProfile").mockImplementation(() => {
      /* no disk */
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("currency_award event increases companionCurrency in profile", () => {
    const out = reconcileCompanionCurrencyAward({
      childId: "testchild",
      amount: 50,
      dryRun: false,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.balance).toBe(150);
    expect(learningProfileIO.writeLearningProfile).toHaveBeenCalledWith(
      "testchild",
      expect.objectContaining({ companionCurrency: 150 }),
    );
  });

  it("currency_award with negative amount decreases companionCurrency", () => {
    vi.mocked(learningProfileIO.readLearningProfile).mockReturnValue({
      ...baseLp,
      companionCurrency: 80,
    } as LearningProfile);
    const out = reconcileCompanionCurrencyAward({
      childId: "testchild",
      amount: -30,
      dryRun: false,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.balance).toBe(50);
    expect(learningProfileIO.writeLearningProfile).toHaveBeenCalledWith(
      "testchild",
      expect.objectContaining({ companionCurrency: 50 }),
    );
  });

  it("companionCurrency never goes below 0", () => {
    vi.mocked(learningProfileIO.readLearningProfile).mockReturnValue({
      ...baseLp,
      companionCurrency: 10,
    } as LearningProfile);
    const out = reconcileCompanionCurrencyAward({
      childId: "testchild",
      amount: -999,
      dryRun: false,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.balance).toBe(0);
    expect(learningProfileIO.writeLearningProfile).toHaveBeenCalledWith(
      "testchild",
      expect.objectContaining({ companionCurrency: 0 }),
    );
  });

  it("currency_award is ignored if amount is missing or NaN", () => {
    expect(
      reconcileCompanionCurrencyAward({
        childId: "testchild",
        amount: undefined,
        dryRun: false,
      }).ok,
    ).toBe(false);
    expect(
      reconcileCompanionCurrencyAward({
        childId: "testchild",
        amount: NaN,
        dryRun: false,
      }).ok,
    ).toBe(false);
    expect(learningProfileIO.writeLearningProfile).not.toHaveBeenCalled();
  });

  it("dryRun does not write profile", () => {
    const out = reconcileCompanionCurrencyAward({
      childId: "testchild",
      amount: 5,
      dryRun: true,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.balance).toBe(105);
    expect(learningProfileIO.writeLearningProfile).not.toHaveBeenCalled();
  });
});

describe("companionCurrency — map coordinator broadcast", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mapCoordinator.__resetAdventureMapSessionsForTests();
    vi.spyOn(learningProfileIO, "readLearningProfile").mockReturnValue({
      childId: "ila",
      version: 1,
      companionCurrency: 20,
    } as LearningProfile);
    vi.spyOn(learningProfileIO, "writeLearningProfile").mockImplementation(() => {
      /* no disk */
    });
    vi.mocked(buildProfile).mockResolvedValue({
      childId: "ila",
      ttsName: "Ila",
      level: 1,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 200_000,
      childContext: "",
      companion: cloneCompanionDefaults(),
      companionContext: "",
    });
    vi.mocked(generateTheme).mockResolvedValue(mockTheme() as never);
    vi.mocked(buildNodeList).mockResolvedValue(mockNodes());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mapCoordinator.__resetAdventureMapSessionsForTests();
  });

  it("HUD broadcast fires after every currency_award", async () => {
    const send = vi.fn();
    const ws = {
      readyState: 1,
      send,
      once: vi.fn(),
      off: vi.fn(),
    } as unknown as WebSocket;
    mapCoordinator.registerMapSessionWebSocket("ila", ws);
    const { sessionId } = await mapCoordinator.startMapSession("ila");
    mapCoordinator.handleMapClientMessage(sessionId, {
      type: "currency_award",
      payload: { amount: 15, reason: "test_award", skipPersistence: false },
    });
    expect(send).toHaveBeenCalledTimes(1);
    const frame = JSON.parse(String(send.mock.calls[0]![0]));
    expect(frame).toEqual({ type: "currency_update", balance: 35 });
  });
});
