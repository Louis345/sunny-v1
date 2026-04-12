import { useCallback, useEffect, useState } from "react";
import type {
  CompanionEvent,
  CompanionEventPayload,
} from "../../../src/shared/companionTypes";
import type {
  MapState,
  NodeConfig,
  NodeResult,
  SessionTheme,
} from "../../../src/shared/adventureTypes";

export type MapConnectionStatus = "idle" | "connecting" | "open" | "error";

function isCompanionEvent(msg: unknown): msg is CompanionEvent {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  if (m.type !== "companion_event") return false;
  const p = m.payload;
  if (!p || typeof p !== "object") return false;
  const pl = p as Record<string, unknown>;
  return (
    typeof pl.trigger === "string" &&
    typeof pl.childId === "string" &&
    typeof pl.timestamp === "number"
  );
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = `http_${res.status}`;
    console.error("  🔴 [useMapSession] POST failed", url, detail);
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

/**
 * Map session over REST (TASK-010). Outbound shapes match the coordinator
 * WebSocket contract for a future dedicated map socket.
 */
export function useMapSession(childId: string): {
  mapState: MapState | null;
  theme: SessionTheme | null;
  sessionId: string | null;
  connectionStatus: MapConnectionStatus;
  onNodeClick: (nodeId: string) => Promise<void>;
  launchedNode: NodeConfig | null;
  clearLaunchedNode: () => void;
  sendNodeResult: (result: NodeResult) => Promise<MapState | null>;
  sendNodeRating: (
    nodeId: string,
    rating: "like" | "dislike" | null,
  ) => Promise<void>;
  companionEvents: CompanionEventPayload[];
} {
  const [mapState, setMapState] = useState<MapState | null>(null);
  const [theme, setTheme] = useState<SessionTheme | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<MapConnectionStatus>("idle");
  const [launchedNode, setLaunchedNode] = useState<NodeConfig | null>(null);
  const [companionEvents, setCompanionEvents] = useState<CompanionEventPayload[]>(
    [],
  );

  useEffect(() => {
    if (!childId.trim()) {
      setMapState(null);
      setTheme(null);
      setSessionId(null);
      setLaunchedNode(null);
      setCompanionEvents([]);
      setConnectionStatus("idle");
      const w = window as unknown as { _mapWs?: WebSocket };
      w._mapWs = undefined;
      return;
    }
    setCompanionEvents([]);
    let cancelled = false;
    setConnectionStatus("connecting");
    postJson<{ sessionId: string; mapState: MapState }>("/api/map/start", {
      childId,
    })
      .then((out) => {
        if (cancelled) return;
        setSessionId(out.sessionId);
        setMapState(out.mapState);
        setTheme(out.mapState.theme);
        setConnectionStatus("open");
        console.log("  🎮 [useMapSession] map session ready");
      })
      .catch((err) => {
        console.error("  🔴 [useMapSession] map /start failed:", err);
        if (!cancelled) setConnectionStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  useEffect(() => {
    const id = childId.trim();
    if (!id) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    const w = window as unknown as { _mapWs?: WebSocket };
    w._mapWs = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({ type: "map_session_attach", childId: id }),
      );
      console.log(
        "[useMapSession] map WebSocket open, sent map_session_attach",
        { childId: id, url: wsUrl },
      );
    };
    ws.onmessage = (ev) => {
      try {
        const msg: unknown = JSON.parse(String(ev.data));
        if (isCompanionEvent(msg)) {
          console.log("companion_event received:", msg);
          setCompanionEvents((prev) => [...prev, msg.payload]);
        }
      } catch {
        /* ignore non-JSON frames */
      }
    };
    ws.onerror = () => {
      console.error("  �� [useMapSession] map WebSocket error");
    };
    return () => {
      if (w._mapWs === ws) {
        w._mapWs = undefined;
      }
      ws.close();
    };
  }, [childId]);

  const onNodeClick = useCallback(
    async (nodeId: string) => {
      if (!sessionId) return;
      try {
        const res = await postJson<{
          events?: Array<{ type: string; payload?: unknown }>;
        }>("/api/map/node-complete", {
          sessionId,
          phase: "click",
          nodeId,
        });
        const launch = res.events?.find((e) => e.type === "node_launched");
        const payload = launch?.payload;
        if (payload && typeof payload === "object") {
          setLaunchedNode(payload as NodeConfig);
        }
      } catch (err) {
        console.error("  🔴 [useMapSession] node click failed:", err);
        setConnectionStatus("error");
      }
    },
    [sessionId],
  );

  const clearLaunchedNode = useCallback(() => setLaunchedNode(null), []);

  const sendNodeResult = useCallback(
    async (result: NodeResult) => {
      if (!sessionId) return null;
      try {
        const res = await postJson<{
          mapState: MapState;
          companionEvent?: CompanionEvent | null;
        }>("/api/map/node-complete", {
          sessionId,
          result,
        });
        setMapState(res.mapState);
        setTheme(res.mapState.theme);
        setLaunchedNode(null);
        if (res.companionEvent && isCompanionEvent(res.companionEvent)) {
          const ev = res.companionEvent;
          console.log("companion_event received (REST):", ev);
          setCompanionEvents((prev) => [...prev, ev.payload]);
        }
        return res.mapState;
      } catch (err) {
        console.error("  🔴 [useMapSession] node result failed:", err);
        setConnectionStatus("error");
        return null;
      }
    },
    [sessionId],
  );

  const sendNodeRating = useCallback(
    async (nodeId: string, rating: "like" | "dislike" | null) => {
      if (!sessionId) return;
      try {
        await postJson("/api/map/node-complete", {
          sessionId,
          phase: "rating",
          nodeId,
          rating,
        });
      } catch (err) {
        console.error("  🔴 [useMapSession] node rating failed:", err);
        setConnectionStatus("error");
      }
    },
    [sessionId],
  );

  return {
    mapState,
    theme,
    sessionId,
    connectionStatus,
    onNodeClick,
    launchedNode,
    clearLaunchedNode,
    sendNodeResult,
    sendNodeRating,
    companionEvents,
  };
}
