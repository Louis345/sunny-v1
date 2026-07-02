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
import type { SunnyHomeworkDomain } from "../../../src/shared/runtimeConfig";
import { applyLocalNodeResult } from "../../../src/shared/mapLocalProgress";

export type MapConnectionStatus = "idle" | "connecting" | "open" | "error";

export type QuestBossArtifactLifecycleStatus =
  | "brief_only"
  | "generating"
  | "validating"
  | "ready_for_review"
  | "approved_ready"
  | "failed_retryable"
  | "failed_final"
  | "retired"
  | "generated"
  | "validated"
  | "failed";

export type QuestBossPreparationStatus = {
  ok: true;
  childId: string;
  jobs: Array<{
    childId: string;
    homeworkId?: string;
    briefId: string;
    kind: "quest" | "boss";
    status: QuestBossArtifactLifecycleStatus;
  }>;
  running: string[];
  briefs: Array<{
    briefId: string;
    kind: "quest" | "boss";
    status: QuestBossArtifactLifecycleStatus;
  }>;
};

export class MapRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "MapRequestError";
    this.status = status;
  }
}

function childSafeMapStartError(): string {
  return "Sunny is getting your adventure map ready.";
}

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

function isCurrencyUpdateMessage(msg: unknown): msg is {
  type: "currency_update";
  balance: number;
} {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  if (m.type !== "currency_update") return false;
  const b = m.balance;
  return typeof b === "number" && Number.isFinite(b);
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

/** Diag reading replaces node 1 with karaoke unless user opened homework map preview (`?homeworkPreview=1`). */
function homeworkMapPreviewFromSearch(): boolean {
  if (typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search).get("homeworkPreview");
  return v === "1" || v?.toLowerCase() === "true";
}

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
  if (homeworkMapPreviewFromSearch()) {
    return mapState;
  }
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
    let detail = `http_${res.status}`;
    try {
      const payload = await res.json() as { error?: unknown; message?: unknown };
      const serverMessage =
        typeof payload.error === "string"
          ? payload.error
          : typeof payload.message === "string"
            ? payload.message
            : "";
      if (serverMessage.trim()) detail = serverMessage.trim();
    } catch {
      /* keep HTTP status fallback */
    }
    console.error("  🔴 [useMapSession] POST failed", url, detail);
    const message = url === "/api/map/start"
      ? childSafeMapStartError()
      : detail;
    throw new MapRequestError(res.status, message);
  }
  return res.json() as Promise<T>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = `http_${res.status}`;
    try {
      const payload = await res.json() as { error?: unknown; message?: unknown };
      const serverMessage =
        typeof payload.error === "string"
          ? payload.error
          : typeof payload.message === "string"
            ? payload.message
            : "";
      if (serverMessage.trim()) detail = serverMessage.trim();
    } catch {
      /* keep HTTP status fallback */
    }
    console.error("  🔴 [useMapSession] GET failed", url, detail);
    throw new MapRequestError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

function shouldPollQuestBossPreparation(status: QuestBossPreparationStatus | null): boolean {
  if (!status) return false;
  if (status.running.length > 0 || status.jobs.length > 0) return true;
  return status.briefs.some((brief) =>
    brief.status === "brief_only" ||
    brief.status === "generating" ||
    brief.status === "validating" ||
    brief.status === "failed_retryable",
  );
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
  inspectAllMode = false,
  homeworkDomain?: SunnyHomeworkDomain | null,
): {
  mapState: MapState | null;
  theme: SessionTheme | null;
  sessionId: string | null;
  connectionStatus: MapConnectionStatus;
  connectionError: string | null;
  onNodeClick: (nodeId: string) => Promise<NodeConfig | null>;
  commitLaunchedNode: (node: NodeConfig) => void;
  launchedNode: NodeConfig | null;
  clearLaunchedNode: () => void;
  sendNodeResult: (
    result: NodeResult,
    opts?: { keepLaunchedNode?: boolean },
  ) => Promise<MapState | null>;
  sendNodeRating: (
    nodeId: string,
    rating: "like" | "dislike" | null,
  ) => Promise<void>;
  companionEvents: CompanionEventPayload[];
  companionCommands: CompanionCommand[];
  forwardMapIframeCompanionEvent: (payload: CompanionEventPayload) => void;
  forwardMapIframeGameStateUpdate: (payload: Record<string, unknown>) => void;
  forwardMapIframeCurrencyAward: (amount: number, reason: string) => Promise<void>;
  purchaseStoryMovie: () => Promise<{ balance: number; cost: number }>;
  /** Server-pushed balance while map WS is open; null = use profile-only value from parent. */
  liveMapCurrency: number | null;
  sessionStarted: boolean;
  questBossPreparation: QuestBossPreparationStatus | null;
} {
  const [mapState, setMapState] = useState<MapState | null>(null);
  const [theme, setTheme] = useState<SessionTheme | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<MapConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [launchedNode, setLaunchedNode] = useState<NodeConfig | null>(null);
  const [companionEvents, setCompanionEvents] = useState<CompanionEventPayload[]>(
    [],
  );
  const [companionCommands, setCompanionCommands] = useState<CompanionCommand[]>(
    [],
  );
  const [sessionStarted, setSessionStarted] = useState(false);
  const [liveMapCurrency, setLiveMapCurrency] = useState<number | null>(null);
  const [questBossPreparation, setQuestBossPreparation] =
    useState<QuestBossPreparationStatus | null>(null);

  const mapStateRef = useRef<MapState | null>(null);
  useEffect(() => {
    mapStateRef.current = mapState;
  }, [mapState]);

  const triggerQuestBossPreparation = useCallback(async (): Promise<QuestBossPreparationStatus | null> => {
    const id = childId.trim().toLowerCase();
    if (!id || previewMode === "free" || previewMode === "go-live") return null;
    try {
      const status = await postJson<QuestBossPreparationStatus>(
        "/api/homework/quest-boss/prepare",
        { childId: id },
      );
      setQuestBossPreparation(status);
      return status;
    } catch (err) {
      console.warn(" 🎮 [useMapSession] quest_boss_prep_start_failed", {
        childId: id,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }, [childId, previewMode]);

  useEffect(() => {
    if (!childId.trim()) {
      setMapState(null);
      setTheme(null);
      setSessionId(null);
      setLaunchedNode(null);
      setCompanionEvents([]);
      setCompanionCommands([]);
      setSessionStarted(false);
      setLiveMapCurrency(null);
      setQuestBossPreparation(null);
      setConnectionStatus("idle");
      setConnectionError(null);
      const w = window as unknown as { _mapWs?: WebSocket };
      w._mapWs = undefined;
      return;
    }
    setCompanionEvents([]);
    setCompanionCommands([]);
    setSessionStarted(false);
    setLiveMapCurrency(null);
    setQuestBossPreparation(null);
    let cancelled = false;
    setConnectionStatus("connecting");
    setConnectionError(null);
    postJson<{ sessionId: string; mapState: MapState }>("/api/map/start", {
      childId,
      runtime: {
        previewMode: mapPreviewQueryParam(previewMode) ?? "off",
        nodeAccess: inspectAllMode ? "inspect-all" : "normal",
        homeworkDomain: homeworkDomain ?? null,
      },
    })
      .then((out) => {
        if (cancelled) return;
        setSessionId(out.sessionId);
        setMapState(applyDiagReadingFirstNode(out.mapState));
        setTheme(out.mapState.theme);
        setConnectionStatus("open");
        setConnectionError(null);
        setSessionStarted(true);
        console.log("  🎮 [useMapSession] map session ready");
      })
      .catch((err) => {
        console.error("  🔴 [useMapSession] map /start failed:", err);
        if (!cancelled) {
          setConnectionStatus("error");
          setConnectionError(err instanceof Error ? err.message : "Could not load map.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [childId, homeworkDomain, inspectAllMode, previewMode]);

  useEffect(() => {
    const id = childId.trim().toLowerCase();
    if (!id || !sessionStarted || previewMode === "free" || previewMode === "go-live") {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pollCount = 0;

    const pollStatus = async () => {
      if (cancelled) return;
      pollCount += 1;
      if (pollCount > 120) {
        console.warn(" 🎮 [useMapSession] quest_boss_prep_poll_guard", { childId: id });
        return;
      }
      try {
        const status = await getJson<QuestBossPreparationStatus>(
          `/api/homework/quest-boss/status?childId=${encodeURIComponent(id)}`,
        );
        if (cancelled) return;
        setQuestBossPreparation(status);
        if (shouldPollQuestBossPreparation(status)) {
          timer = setTimeout(() => {
            void pollStatus();
          }, 5000);
        }
      } catch (err) {
        console.warn(" 🎮 [useMapSession] quest_boss_prep_status_failed", {
          childId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    triggerQuestBossPreparation()
      .then((status) => {
        if (cancelled || !status) return;
        if (shouldPollQuestBossPreparation(status)) {
          timer = setTimeout(() => {
            void pollStatus();
          }, 5000);
        }
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [childId, previewMode, sessionStarted, triggerQuestBossPreparation]);

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
          (msg as Record<string, unknown>).type === "session_started"
        ) {
          setSessionStarted(true);
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
        } else if (isCurrencyUpdateMessage(msg)) {
          setLiveMapCurrency(Math.max(0, Math.floor(msg.balance)));
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
          if (fromMap?.wordRadarItems?.length) {
            node = {
              ...node,
              type: fromMap.type,
              wordRadarItems: fromMap.wordRadarItems,
            };
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

  const forwardMapIframeGameStateUpdate = useCallback(
    (payload: Record<string, unknown>) => {
      if (!sessionId) return;
      void postJson<{ events?: unknown[] }>("/api/map/node-complete", {
        sessionId,
        phase: "game_state_update",
        payload,
        ...(mapPreviewQueryParam(previewMode)
          ? { preview: mapPreviewQueryParam(previewMode) }
          : {}),
      }).catch((err) => {
        console.error("  🔴 [useMapSession] game_state_update failed:", err);
      });
    },
    [sessionId, previewMode],
  );

  const forwardMapIframeCurrencyAward = useCallback(
    async (amount: number, reason: string) => {
      if (!sessionId) return;
      await postJson<{ events?: unknown[] }>("/api/map/node-complete", {
        sessionId,
        phase: "currency_award",
        amount,
        reason,
        ...(mapPreviewQueryParam(previewMode)
          ? { preview: mapPreviewQueryParam(previewMode) }
          : {}),
      }).catch((err) => {
        console.error("  🔴 [useMapSession] currency_award failed:", err);
        throw err;
      });
    },
    [sessionId, previewMode],
  );

  const purchaseStoryMovie = useCallback(async () => {
    if (!sessionId) {
      throw new Error("map_session_required");
    }
    return postJson<{ balance: number; cost: number }>(
      "/api/map/story-reward-purchase",
      {
        sessionId,
        ...(mapPreviewQueryParam(previewMode)
          ? { preview: mapPreviewQueryParam(previewMode) }
          : {}),
      },
    );
  }, [sessionId, previewMode]);

  const sendNodeResult = useCallback(
    async (result: NodeResult, opts: { keepLaunchedNode?: boolean } = {}) => {
      if (previewMode === "free" || previewMode === "go-live") {
        const cur = mapStateRef.current;
        if (!cur) return null;
        const next = applyDiagReadingFirstNode(applyLocalNodeResult(cur, result));
        setMapState(next);
        setTheme(next.theme);
        if (opts.keepLaunchedNode !== true) {
          setLaunchedNode(null);
        }
        return next;
      }
      if (!sessionId) return null;
      try {
        const res = await postJson<{
          mapState: MapState;
          companionEvent?: CompanionEvent | null;
        }>("/api/map/node-complete", {
          sessionId,
          result,
        });
        setMapState(applyDiagReadingFirstNode(res.mapState));
        setTheme(res.mapState.theme);
        if (opts.keepLaunchedNode !== true) {
          setLaunchedNode(null);
        }
        if (res.companionEvent && isCompanionEvent(res.companionEvent)) {
          const ev = res.companionEvent;
          console.log("companion_event received (REST):", ev);
          setCompanionEvents((prev) => [...prev, ev.payload]);
        }
        void triggerQuestBossPreparation();
        return res.mapState;
      } catch (err) {
        console.error("  🔴 [useMapSession] node result failed:", err);
        setConnectionStatus("error");
        return null;
      }
    },
    [sessionId, previewMode, triggerQuestBossPreparation],
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
    connectionError,
    onNodeClick,
    commitLaunchedNode,
    launchedNode,
    clearLaunchedNode,
    sendNodeResult,
    sendNodeRating,
    companionEvents,
    companionCommands,
    forwardMapIframeCompanionEvent,
    forwardMapIframeGameStateUpdate,
    forwardMapIframeCurrencyAward,
    purchaseStoryMovie,
    liveMapCurrency,
    sessionStarted,
    questBossPreparation,
  };
}
