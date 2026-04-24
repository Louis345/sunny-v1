import { describe, it, expect, vi, beforeEach } from "vitest";
import WebSocket from "ws";
import type { NodeResult } from "../shared/adventureTypes";

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

vi.mock("../agents/elli/run", () => ({
  runAgent: vi.fn().mockResolvedValue(""),
}));

import {
  __resetAdventureMapSessionsForTests,
  applyNodeResult,
  handleMapClientMessage,
  startMapSession,
} from "../server/map-coordinator";
import {
  registerActiveVoiceSessionManager,
  unregisterActiveVoiceSessionManager,
  __resetVoiceSessionRegistryForTests,
} from "../server/voice-session-registry";
import { buildProfile } from "../profiles/buildProfile";
import { generateTheme } from "../agents/designer/designer";
import { buildNodeList } from "../engine/nodeSelection";
import { cloneCompanionDefaults } from "../shared/companionTypes";
import { SessionManager } from "../server/session-manager";

function mockWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
  } as unknown as WebSocket;
}

function mockTheme() {
  return {
    name: "default",
    palette: { sky: "#a", ground: "#b", accent: "#c", particle: "#d", glow: "#e" },
    ambient: { type: "dots", count: 20, speed: 1, color: "#fff" },
    nodeStyle: "rounded",
    pathStyle: "curve",
    castleVariant: "stone",
  };
}

function mockNodes() {
  return [
    {
      id: "n-spell",
      type: "spell-check" as const,
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 2 as const,
      words: ["cat", "dog"],
    },
    {
      id: "n-wb",
      type: "word-builder" as const,
      isLocked: true,
      isCompleted: false,
      isGoal: true,
      difficulty: 2 as const,
      words: ["cat", "dog"],
    },
  ];
}

function mockResult(nodeId: string): NodeResult {
  return {
    nodeId,
    completed: true,
    accuracy: 0.9,
    timeSpent_ms: 30_000,
    wordsAttempted: 3,
  };
}

function getHistory(sm: SessionManager): Array<{ role: string; content: unknown }> {
  return (sm as unknown as { conversationHistory: Array<{ role: string; content: unknown }> })
    .conversationHistory;
}

describe("map-coordinator injects NodeResult into voice SessionManager (GAME-EVENT-001)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    __resetAdventureMapSessionsForTests();
    __resetVoiceSessionRegistryForTests();
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

  it("8b. [BASELINE→FINAL] node_click with voice SM calls noteExternalEvent(map_node_started) with word hint", async () => {
    const { sessionId, mapState } = await startMapSession("ila");
    const sm = new SessionManager(mockWs(), "Ila");
    registerActiveVoiceSessionManager("ila", sm);

    const notespy = vi.spyOn(sm as unknown as { noteExternalEvent: (e: unknown) => void }, "noteExternalEvent");
    const firstId = mapState.nodes[0]!.id;
    handleMapClientMessage(sessionId, {
      type: "node_click",
      payload: { nodeId: firstId },
    });

    expect(notespy).toHaveBeenCalledTimes(1);
    const started = notespy.mock.calls[0]?.[0] as { source: string; summary: string };
    expect(started?.source).toBe("map_node_started");
    expect(started?.summary).toContain("ila");
    expect(started?.summary.toLowerCase()).toMatch(/spell/);
    expect(started?.summary).toMatch(/"cat"/);

    unregisterActiveVoiceSessionManager("ila", sm);
  });

  it("9. when voice SM is registered, applyNodeResult calls noteExternalEvent exactly once with consistent summary", async () => {
    const { sessionId, mapState } = await startMapSession("ila");
    const sm = new SessionManager(mockWs(), "Ila");
    // Register SM for the same childId ("ila")
    registerActiveVoiceSessionManager("ila", sm);

    const notespy = vi.spyOn(sm as unknown as { noteExternalEvent: (e: unknown) => void }, "noteExternalEvent");
    const histBefore = getHistory(sm).length;

    const nodeId = mapState.nodes[0]!.id;
    await applyNodeResult(sessionId, mockResult(nodeId));

    expect(notespy).toHaveBeenCalledTimes(1);
    expect(getHistory(sm).length).toBe(histBefore + 1);
    // Summary should mention spell-check
    const injectedEvent = notespy.mock.calls[0]?.[0] as { summary: string; source: string };
    expect(injectedEvent).toBeDefined();
    expect(injectedEvent!.summary).toBeTruthy();
    expect(injectedEvent!.summary.toLowerCase()).toMatch(/spell/);
    expect(injectedEvent!.source).toBe("map_node_complete");

    unregisterActiveVoiceSessionManager("ila", sm);
  });

  it("10. when NO voice SM is registered, applyNodeResult completes normally and does not throw", async () => {
    const { sessionId, mapState } = await startMapSession("ila");
    // No SM registered for "ila"
    const nodeId = mapState.nodes[0]!.id;
    await expect(applyNodeResult(sessionId, mockResult(nodeId))).resolves.toBeDefined();
  });

  it("11. map WebSocket companion_event broadcast still fires regardless of whether a voice SM is attached", async () => {
    // Without voice SM
    {
      const { sessionId, mapState } = await startMapSession("ila");
      const nodeId = mapState.nodes[0]!.id;
      const { companionEvent } = await applyNodeResult(sessionId, mockResult(nodeId));
      expect(companionEvent.type).toBe("companion_event");
      expect(companionEvent.payload.trigger).toMatch(/correct_answer|wrong_answer/);
    }

    __resetAdventureMapSessionsForTests();
    __resetVoiceSessionRegistryForTests();

    // With voice SM registered
    {
      const { sessionId, mapState } = await startMapSession("ila");
      const sm = new SessionManager(mockWs(), "Ila");
      registerActiveVoiceSessionManager("ila", sm);

      const nodeId = mapState.nodes[0]!.id;
      const { companionEvent } = await applyNodeResult(sessionId, mockResult(nodeId));
      expect(companionEvent.type).toBe("companion_event");
      expect(companionEvent.payload.trigger).toMatch(/correct_answer|wrong_answer/);

      unregisterActiveVoiceSessionManager("ila", sm);
    }
  });
});
