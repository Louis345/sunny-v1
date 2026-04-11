import { useCallback, useEffect, useState } from "react";
import type { MapState, SessionTheme } from "../../../src/shared/adventureTypes";

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
 * Map session transport uses the same-origin REST map API (TASK-010).
 * Message shapes mirror the coordinator WebSocket contract for a future WS transport.
 */
export function useMapSession(childId: string): {
  mapState: MapState | null;
  theme: SessionTheme | null;
  sessionId: string | null;
  connectionStatus: MapConnectionStatus;
  onNodeClick: (nodeId: string) => Promise<void>;
} {
  const [mapState, setMapState] = useState<MapState | null>(null);
  const [theme, setTheme] = useState<SessionTheme | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<MapConnectionStatus>("idle");

  useEffect(() => {
    if (!childId.trim()) {
      setMapState(null);
      setTheme(null);
      setSessionId(null);
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
        await postJson("/api/map/node-complete", {
          sessionId,
          phase: "click",
          nodeId,
        });
      } catch {
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
  };
}
