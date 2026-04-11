import { useCallback, useEffect, useState } from "react";
import type {
  MapState,
  NodeConfig,
  NodeResult,
  SessionTheme,
} from "../../../src/shared/adventureTypes";

export type MapConnectionStatus = "idle" | "connecting" | "open" | "error";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
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
} {
  const [mapState, setMapState] = useState<MapState | null>(null);
  const [theme, setTheme] = useState<SessionTheme | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<MapConnectionStatus>("idle");
  const [launchedNode, setLaunchedNode] = useState<NodeConfig | null>(null);

  useEffect(() => {
    if (!childId.trim()) {
      setMapState(null);
      setTheme(null);
      setSessionId(null);
      setLaunchedNode(null);
      setConnectionStatus("idle");
      return;
    }
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
      })
      .catch(() => {
        if (!cancelled) setConnectionStatus("error");
      });
    return () => {
      cancelled = true;
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
      } catch {
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
        const res = await postJson<{ mapState: MapState }>(
          "/api/map/node-complete",
          {
            sessionId,
            result,
          },
        );
        setMapState(res.mapState);
        setTheme(res.mapState.theme);
        setLaunchedNode(null);
        return res.mapState;
      } catch {
        setConnectionStatus("error");
        return null;
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
  };
}
