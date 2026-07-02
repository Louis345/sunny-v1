import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useMapSession } from "../useMapSession";
import type { MapState } from "../../../../src/shared/adventureTypes";

const baseMapState: MapState = {
  childId: "reina",
  sessionDate: "2026-06-25",
  nodes: [],
  completedNodes: [],
  currentNodeIndex: 0,
  xp: 0,
  level: 1,
  theme: {
    name: "Test",
    palette: {
      sky: "#111827",
      ground: "#020617",
      accent: "#facc15",
      particle: "#f8fafc",
      glow: "#fef3c7",
    },
    ambient: {
      type: "stars",
      count: 12,
      speed: 1,
      color: "#f8fafc",
    },
    nodeStyle: "orb",
    pathStyle: "curve",
    castleVariant: "gold",
  },
};

describe("useMapSession Quest/Boss preparation", () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  function installWebSocketMock() {
    class MockWebSocket {
      static OPEN = 1;
      readonly readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      send = vi.fn();
      close = vi.fn();

      constructor() {
        setTimeout(() => this.onopen?.(), 0);
      }
    }
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  }

  it("starts async Quest/Boss preparation after the map session opens", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/map/start") {
        return Response.json({ sessionId: "session-1", mapState: baseMapState });
      }
      if (url === "/api/homework/quest-boss/prepare") {
        return Response.json(
          {
            ok: true,
            childId: "reina",
            jobs: [{ briefId: "brief-quest", kind: "quest", status: "brief_only" }],
            running: ["reina:brief-quest"],
            briefs: [{ briefId: "brief-quest", kind: "quest", status: "brief_only" }],
          },
          { status: 202 },
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    installWebSocketMock();

    renderHook(() => useMapSession("reina"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/homework/quest-boss/prepare",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ childId: "reina" }),
        }),
      );
    });
  });

  it("polls preparation status while a Quest/Boss job is running", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/map/start") {
        return Response.json({ sessionId: "session-1", mapState: baseMapState });
      }
      if (url === "/api/homework/quest-boss/prepare") {
        return Response.json(
          {
            ok: true,
            childId: "reina",
            jobs: [{ briefId: "brief-quest", kind: "quest", status: "brief_only" }],
            running: ["reina:brief-quest"],
            briefs: [{ briefId: "brief-quest", kind: "quest", status: "brief_only" }],
          },
          { status: 202 },
        );
      }
      if (url === "/api/homework/quest-boss/status?childId=reina") {
        return Response.json({
          ok: true,
          childId: "reina",
          jobs: [],
          running: [],
          briefs: [{ briefId: "brief-quest", kind: "quest", status: "ready_for_review" }],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    installWebSocketMock();

    const { result } = renderHook(() => useMapSession("reina"));

    await waitFor(() => {
      expect(result.current.questBossPreparation?.running).toEqual(["reina:brief-quest"]);
    }, { timeout: 2000 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/homework/quest-boss/status?childId=reina");
      expect(result.current.questBossPreparation?.briefs[0]?.status).toBe("ready_for_review");
    }, { timeout: 2000 });
  });

  it("rechecks Quest/Boss preparation after an activity result writes evidence", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/map/start") {
        return Response.json({ sessionId: "session-1", mapState: baseMapState });
      }
      if (url === "/api/homework/quest-boss/prepare") {
        return Response.json(
          {
            ok: true,
            childId: "reina",
            jobs: [],
            running: [],
            briefs: [{ briefId: "brief-quest", kind: "quest", status: "brief_only" }],
          },
          { status: 202 },
        );
      }
      if (url === "/api/map/node-complete") {
        return Response.json({ mapState: baseMapState, companionEvent: null });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    installWebSocketMock();

    const { result } = renderHook(() => useMapSession("reina"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/homework/quest-boss/prepare",
        expect.anything(),
      );
    });
    fetchMock.mockClear();

    await act(async () => {
      await result.current.sendNodeResult({
        nodeId: "n-word-radar",
        completed: true,
        accuracy: 1,
        timeSpent_ms: 1000,
        wordsAttempted: 1,
        activityId: "word-radar",
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/homework/quest-boss/prepare",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
