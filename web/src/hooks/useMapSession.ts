import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMPANION_API_VERSION,
  type CompanionCommand,
} from "../../../src/shared/companions/companionContract";
import type {
  CompanionEvent,
  CompanionEventPayload,
} from "../../../src/shared/companionTypes";
import { isCompanionEmote } from "../../../src/shared/companionEmotes";
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
  const hasTrigger = typeof pl.trigger === "string";
  const hasEmote = isCompanionEmote(pl.emote);
  return (
    (hasTrigger || hasEmote) &&
    typeof pl.childId === "string" &&
    typeof pl.timestamp === "number"
  );
}

function isCompanionCommandMessage(msg: unknown): msg is {
  type: "companion_command";
  command: CompanionCommand;
} {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  if (m.type !== "companion_command") return false;
  const c = m.command;
  if (!c || typeof c !== "object") return false;
  const cmd = c as Record<string, unknown>;
  return (
    cmd.apiVersion === COMPANION_API_VERSION &&
    typeof cmd.type === "string" &&
    typeof cmd.childId === "string" &&
    typeof cmd.timestamp === "number" &&
    (cmd.source === "claude" || cmd.source === "diag") &&
    cmd.payload != null &&
    typeof cmd.payload === "object"
  );
}

const DIAG_READING_ENABLED =
  import.meta.env.VITE_DIAG_READING === "true";

const DIAG_KARAOKE_WORDS: readonly string[] = [
  "Chimpanzees",
  "are",
  "apes.",
  "They",
  "inhabit",
  "steamy",
  "rainforests",
  "and",
  "other",
  "parts",
  "of",
  "Africa.",
  "Chimps",
  "gather",
  "in",
  "bands",
  "that",
  "number",
  "from",
  "15",
  "to",
  "150",
  "chimps.",
];

function applyDiagReadingFirstNode(mapState: MapState): MapState {
  if (!DIAG_READING_ENABLED || mapState.nodes.length === 0) {
    return mapState;
  }
  const first = mapState.nodes[0]!;
  /** Keep `first.id` so POST /api/map/node-complete (click) matches server `currentNode.id`. */
  const diagNode: NodeConfig = {
    ...first,
    type: "karaoke",
    isLocked: false,
    isCompleted: false,
    difficulty: 1,
    words: [...DIAG_KARAOKE_WORDS],
    theme: "jungle",
    isCastle: false,
    accentColor: mapState.theme.palette.accent,
  };
  return {
    ...mapState,
    nodes: [diagNode, ...mapState.nodes.slice(1)],
  };
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
export type MapClientPreviewMode = false | "free" | "go-live";

function mapPreviewQueryParam(
  mode: MapClientPreviewMode,
): "free" | "go-live" | undefined {
  return mode === "free" || mode === "go-live" ? mode : undefined;
}

export function useMapSession(
  childId: string,
  previewMode: MapClientPreviewMode = false,
): {
  mapState: MapState | null;
  theme: SessionTheme | null;
  sessionId: string | null;
  connectionStatus: MapConnectionStatus;
  onNodeClick: (nodeId: string) => Promise<NodeConfig | null>;
  commitLaunchedNode: (node: NodeConfig) => void;
  launchedNode: NodeConfig | null;
  clearLaunchedNode: () => void;
  sendNodeResult: (result: NodeResult) => Promise<MapState | null>;
  sendNodeRating: (
    nodeId: string,
    rating: "like" | "dislike" | null,
  ) => Promise<void>;
  companionEvents: CompanionEventPayload[];
  companionCommands: CompanionCommand[];
  forwardMapIframeCompanionEvent: (payload: CompanionEventPayload) => void;
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
  const [companionCommands, setCompanionCommands] = useState<CompanionCommand[]>(
    [],
  );

  const mapStateRef = useRef<MapState | null>(null);
  useEffect(() => {
    mapStateRef.current = mapState;
  }, [mapState]);

  useEffect(() => {
    if (!childId.trim()) {
      setMapState(null);
      setTheme(null);
      setSessionId(null);
      setLaunchedNode(null);
      setCompanionEvents([]);
      setCompanionCommands([]);
      setConnectionStatus("idle");
      const w = window as unknown as { _mapWs?: WebSocket };
      w._mapWs = undefined;
      return;
    }
    setCompanionEvents([]);
    setCompanionCommands([]);
    let cancelled = false;
    setConnectionStatus("connecting");
    postJson<{ sessionId: string; mapState: MapState }>("/api/map/start", {
      childId,
      ...(previewMode === "free" ? { preview: "free" } : {}),
    })
      .then((out) => {
        if (cancelled) return;
        setSessionId(out.sessionId);
        setMapState(applyDiagReadingFirstNode(out.mapState));
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
  }, [childId, previewMode]);

  useEffect(() => {
    const id = childId.trim();
    if (!id) return;
    if (previewMode === "free") {
      return;
    }

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
        } else if (
          typeof msg === "object" &&
          msg !== null &&
          (msg as Record<string, unknown>).type === "companion_command"
        ) {
          if (isCompanionCommandMessage(msg)) {
            console.log("🎮 [useMapSession] companion_command received:", msg);
            setCompanionCommands((prev) => [...prev, msg.command]);
          } else {
            console.warn(
              "🎮 [useMapSession] companion_command ignored (invalid shape)",
              msg,
            );
          }
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
  }, [childId, previewMode]);

  const onNodeClick = useCallback(
    async (nodeId: string): Promise<NodeConfig | null> => {
      /** Preview (free or go-live): launch from local map — no /node-complete or WS. */
      if (previewMode === "free" || previewMode === "go-live") {
        const ms = mapStateRef.current;
        const fromMap = ms?.nodes.find((n) => n.id === nodeId);
        return fromMap ?? null;
      }
      if (!sessionId) return null;
      try {
        const res =         await postJson<{
          events?: Array<{ type: string; payload?: unknown }>;
        }>("/api/map/node-complete", {
          sessionId,
          phase: "click",
          nodeId,
          ...(mapPreviewQueryParam(previewMode)
            ? { preview: mapPreviewQueryParam(previewMode) }
            : {}),
        });
        const launch = res.events?.find((e) => e.type === "node_launched");
        const payload = launch?.payload;
        if (!payload || typeof payload !== "object") {
          return null;
        }
        let node = payload as NodeConfig;
        const ms = mapStateRef.current;
        if (ms) {
          const fromMap = ms.nodes.find((n) => n.id === nodeId);
          if (fromMap?.words?.length) {
            node = { ...node, type: fromMap.type, words: fromMap.words };
          }
        }
        return node;
      } catch (err) {
        console.error("  🔴 [useMapSession] node click failed:", err);
        setConnectionStatus("error");
        return null;
      }
    },
    [sessionId, previewMode],
  );

  const commitLaunchedNode = useCallback((node: NodeConfig) => {
    setLaunchedNode(node);
  }, []);

  const clearLaunchedNode = useCallback(() => setLaunchedNode(null), []);

  /** Forward iframe `companion_event` to server so `sessionEventBus` + voice session react. */
  const forwardMapIframeCompanionEvent = useCallback(
    (payload: CompanionEventPayload) => {
      const w = (typeof window !== "undefined"
        ? (window as unknown as { _mapWs?: WebSocket })._mapWs
        : undefined) as WebSocket | undefined;
      if (!w || w.readyState !== WebSocket.OPEN) {
        return;
      }
      w.send(
        JSON.stringify({
          type: "map_iframe_companion_event",
          payload,
        }),
      );
    },
    [],
  );

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
          ...(mapPreviewQueryParam(previewMode)
            ? { preview: mapPreviewQueryParam(previewMode) }
            : {}),
        });
        setMapState(applyDiagReadingFirstNode(res.mapState));
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
    [sessionId, previewMode],
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
          ...(mapPreviewQueryParam(previewMode)
            ? { preview: mapPreviewQueryParam(previewMode) }
            : {}),
        });
      } catch (err) {
        console.error("  🔴 [useMapSession] node rating failed:", err);
        setConnectionStatus("error");
      }
    },
    [sessionId, previewMode],
  );

  return {
    mapState,
    theme,
    sessionId,
    connectionStatus,
    onNodeClick,
    commitLaunchedNode,
    launchedNode,
    clearLaunchedNode,
    sendNodeResult,
    sendNodeRating,
    companionEvents,
    companionCommands,
    forwardMapIframeCompanionEvent,
  };
}
