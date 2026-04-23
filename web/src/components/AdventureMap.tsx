import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { NodeConfig, NodeResult } from "../../../src/shared/adventureTypes";
import type { Point } from "../../../src/shared/pathCurve";
import type { CompanionConfig } from "../../../src/shared/companionTypes";
import childrenCfg from "../../../children.config.json";
import { buildNodeLaunchAction } from "../../../src/shared/homeworkNodeRouting";
import { NODE_DISPLAY_LABELS } from "../../../src/shared/nodeRegistry";
import { useTransition, type Palette } from "../context/TransitionContext";
import { useMapSession } from "../hooks/useMapSession";
import { KaraokeReadingCanvas } from "./KaraokeReadingCanvas";
import type { KaraokeReadingCanvasProps } from "./KaraokeReadingCanvas";
import { PronunciationGameCanvas } from "./PronunciationGameCanvas";
import { NodeCard } from "./NodeCard.tsx";
import { PathCurve } from "./PathCurve.tsx";
import { RatingOverlay } from "./RatingOverlay.tsx";
import { WorldBackground } from "./WorldBackground.tsx";
import { XPBar } from "./XPBar.tsx";
import "./AdventureMap.css";

import type { NodeType } from "../../../src/shared/adventureTypes";
export type GameIframeOverlayState = {
  active: boolean;
  iframe: HTMLIFrameElement | null;
  url: string | null;
};
import { evaluateVRR } from "../../../src/engine/vrrEngine";
import {
  DEFAULT_TAMAGOTCHI,
  type TamagotchiState,
  type VRREvent,
} from "../../../src/shared/vrrTypes";
import { SlotMachineOverlay } from "./SlotMachineOverlay";
import { TamagotchiStrip } from "./TamagotchiStrip";

export type MapPreviewMode = false | "free" | "go-live";

/** Space below fixed preview banner (z-index 9999, height 40). */
const PREVIEW_GAME_TOP_INSET_PX = 40;

function ensurePreviewQueryParam(url: string, mode: MapPreviewMode): string {
  if (!mode) return url;
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set("preview", mode);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    const hasPreview = /(?:^|[?&])preview=/.test(url);
    if (hasPreview) return url;
    return url.includes("?") ? `${url}&preview=${mode}` : `${url}?preview=${mode}`;
  }
}

/** Home palette per node type. 20% of activations pick "random" instead. */
const NODE_PALETTES: Partial<Record<NodeType, Palette>> = {
  karaoke:         { from: "#6D5EF5", to: "#a78bfa" }, // purple dream
  riddle:          { from: "#e879f9", to: "#fbcfe8" }, // bubblegum
  boss:            { from: "#f59e0b", to: "#ef4444" }, // ember
  "word-builder":  { from: "#10b981", to: "#84cc16" }, // jungle
  "spell-check":   { from: "#06b6d4", to: "#3b82f6" }, // ocean dive
  "clock-game":    { from: "#eab308", to: "#f97316" }, // honey
  "coin-counter":  { from: "#14b8a6", to: "#0ea5e9" }, // lagoon
  "space-invaders":{ from: "#8b5cf6", to: "#ec4899" }, // magic hour
  asteroid:        { from: "#a855f7", to: "#6366f1" }, // nebula
  "space-frogger": { from: "#22c55e", to: "#06b6d4" }, // mint breeze
  "bubble-pop":    { from: "#f472b6", to: "#fb923c" }, // pink sunset
};

function nodeTransitionPalette(nodeType: string): Palette | "random" {
  if (Math.random() < 0.2) return "random";
  return NODE_PALETTES[nodeType as NodeType] ?? "random";
}

function MapLoadingOverlay({ accent }: { accent: string }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#1a1a2e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          border: "4px solid rgba(255,255,255,0.1)",
          borderTop: `4px solid ${accent}`,
          animation: "adventure-map-spin 1s linear infinite",
        }}
      />
      <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
        Building your world...
      </div>
      <style>{`@keyframes adventure-map-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}


export function AdventureMap(props: {
  childId: string;
  mapSession: ReturnType<typeof useMapSession>;
  previewMode?: MapPreviewMode;
  /** @deprecated Launch context uses mapCompanion + children.config.json default. */
  launchCompanionId?: string;
  /** Profile companion for game URL params and launch context (null until /api/profile loads). */
  mapCompanion?: CompanionConfig | null;
  companionMutedForMap?: boolean;
  onGameIframeOverlayChange?: (s: GameIframeOverlayState) => void;
  /** Notifies parent when the launched game iframe mounts (load) or clears (null). */
  onGameIframeMount?: (el: HTMLIFrameElement | null) => void;
  onActiveNodeScreenChange?: (p: { x: number; y: number } | null) => void;
  /** Voice-session reading props when a map node of type \"karaoke\" is launched. */
  karaokeReadingForMapNode?: KaraokeReadingCanvasProps;
  /** From `/api/profile` — drives tamagotchi strip + VRR evaluation. */
  tamagotchi?: TamagotchiState;
  /** After VRR claim persisted on server — parent should merge into profile state. */
  onTamagotchiSynced?: (t: TamagotchiState) => void;
  /** Phase-1 VRR begins — e.g. pulse celebrating emote on companion (live map only). */
  onVrrPhase1Begin?: () => void;
  /** Map UI: opens tamagotchi care sheet (e.g. "Elli's Care" button). */
  onOpenTamagotchiSheet?: () => void;
}) {
  const resolved = props.childId.trim();

  const {
    mapState,
    theme,
    connectionStatus,
    sessionId,
    onNodeClick,
    commitLaunchedNode,
    clearLaunchedNode,
    launchedNode,
    sendNodeResult,
    sendNodeRating,
  } = props.mapSession;

  const { triggerTransition } = useTransition();

  const togglePreviewMode = useCallback(() => {
    if (props.previewMode !== "free" && props.previewMode !== "go-live") return;
    const next: "free" | "go-live" =
      props.previewMode === "go-live" ? "free" : "go-live";
    const url = new URL(window.location.href);
    url.searchParams.set("preview", next);
    window.location.assign(url.toString());
  }, [props.previewMode]);

  const [ratingPrompt, setRatingPrompt] = useState<{
    nodeId: string;
    nodeType: string;
  } | null>(null);
  const [celebration, setCelebration] = useState(false);
  const [pendingVrr, setPendingVrr] = useState<VRREvent | null>(null);
  const vrrDroppedRef = useRef(false);
  const [accentForChild, setAccentForChild] = useState<{
    childId: string;
    accent: string;
  } | null>(null);
  const lastCompletedLenRef = useRef(0);
  const sessionStampRef = useRef("");
  const prevCelebrationLenRef = useRef(0);
  const worldRef = useRef<HTMLDivElement>(null);
  const [pathPositions, setPathPositions] = useState<Point[]>([]);
  const [hoveredNodeIndex, setHoveredNodeIndex] = useState<number | null>(null);
  const [launchedUrl, setLaunchedUrl] = useState<string | null>(null);
  const gameIframeRef = useRef<HTMLIFrameElement>(null);
  const [showBossPlaceholder, setShowBossPlaceholder] = useState(false);

  const publishIframeOverlay = useCallback(() => {
    const el = gameIframeRef.current;
    if (!el || !launchedUrl) return;
    props.onGameIframeOverlayChange?.({
      active: true,
      iframe: el,
      url: launchedUrl,
    });
  }, [launchedUrl, props.onGameIframeOverlayChange]);

  useEffect(() => {
    if (!launchedUrl) {
      props.onGameIframeOverlayChange?.({
        active: false,
        iframe: null,
        url: null,
      });
      props.onGameIframeMount?.(null);
    }
  }, [launchedUrl, props.onGameIframeOverlayChange, props.onGameIframeMount]);

  const accentColor =
    resolved && accentForChild?.childId === resolved
      ? accentForChild.accent
      : "#7C3AED";

  useEffect(() => {
    if (!resolved) return;
    let cancelled = false;
    fetch(`/api/profile/${encodeURIComponent(resolved)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((profile) => {
        if (cancelled) return;
        const accent =
          typeof profile?.ui?.accentColor === "string" &&
          profile.ui.accentColor.trim().length > 0
            ? profile.ui.accentColor
            : "#7C3AED";
        setAccentForChild({ childId: resolved, accent });
      })
      .catch(() => {
        if (!cancelled) setAccentForChild({ childId: resolved, accent: "#7C3AED" });
      });
    return () => {
      cancelled = true;
    };
  }, [resolved]);

  const launchedNodeRef = useRef<NodeConfig | null>(null);
  useEffect(() => {
    launchedNodeRef.current = launchedNode;
  }, [launchedNode]);
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      const t = (d as { type?: string }).type;
      if (t === "node_result") {
        void sendNodeResult(d as NodeResult);
        return;
      }
      if (t !== "node_complete") return;
      const pl = d as Record<string, unknown>;
      const node = launchedNodeRef.current;
      if (node?.type === "spell-check" && props.previewMode !== "go-live") {
        const sid = sessionIdRef.current;
        if (sid) {
          const wordsCorrect = Array.isArray(pl.wordsCorrect)
            ? (pl.wordsCorrect as unknown[]).map(String)
            : [];
          const wordsStruggled = Array.isArray(pl.wordsStruggled)
            ? (pl.wordsStruggled as unknown[]).map(String)
            : [];
          const previewModePayload =
            props.previewMode === "free" ? "free" : undefined;
          void fetch("/api/map/spell-check-results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              childId: resolved,
              nodeId: node.id,
              wordsCorrect,
              wordsStruggled,
              accuracy: pl.accuracy,
              sessionId: sid,
              previewMode: previewModePayload,
            }),
          }).catch((err) => {
            console.error("  🔴 [AdventureMap] spell-check-results failed:", err);
          });
        }
      }
      const nodeId =
        typeof pl.nodeId === "string" && pl.nodeId.length > 0
          ? pl.nodeId
          : launchedNodeRef.current?.id ?? "";
      const nr: NodeResult = {
        nodeId,
        completed: pl.completed === true,
        accuracy: typeof pl.accuracy === "number" ? pl.accuracy : 0,
        timeSpent_ms:
          typeof pl.timeSpent_ms === "number" ? pl.timeSpent_ms : 0,
        wordsAttempted:
          typeof pl.wordsAttempted === "number" ? pl.wordsAttempted : 0,
      };
      void sendNodeResult(nr);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [sendNodeResult, resolved, props.previewMode]);

  useEffect(() => {
    if (!mapState) {
      lastCompletedLenRef.current = 0;
      sessionStampRef.current = "";
      const clearId = requestAnimationFrame(() => setRatingPrompt(null));
      return () => cancelAnimationFrame(clearId);
    }
    const stamp = `${mapState.childId}|${mapState.sessionDate}`;
    if (stamp !== sessionStampRef.current) {
      sessionStampRef.current = stamp;
      vrrDroppedRef.current = false;
      lastCompletedLenRef.current = mapState.completedNodes.length;
      const clearId = requestAnimationFrame(() => setRatingPrompt(null));
      return () => cancelAnimationFrame(clearId);
    }
    const n = mapState.completedNodes.length;
    if (n > lastCompletedLenRef.current) {
      lastCompletedLenRef.current = n;
      const nid = mapState.completedNodes[n - 1];
      const node = mapState.nodes.find((x) => x.id === nid);
      if (nid && node) {
        const show = window.setTimeout(() => {
          setRatingPrompt({
            nodeId: nid,
            nodeType: NODE_DISPLAY_LABELS[node.type] ?? node.type,
          });
          const isMapPreview =
            props.previewMode === "free" || props.previewMode === "go-live";
          const ev =
            !isMapPreview && !vrrDroppedRef.current
              ? evaluateVRR(
                  {
                    easinessDelta: 0.31,
                    masteryGateCrossed: node.type === "boss",
                  },
                  {
                    tamagotchi: props.tamagotchi ?? DEFAULT_TAMAGOTCHI,
                  },
                  vrrDroppedRef.current,
                )
              : null;
          if (ev) {
            vrrDroppedRef.current = true;
            setPendingVrr(ev);
          }
        }, 500);
        return () => window.clearTimeout(show);
      }
    }
    return undefined;
  }, [mapState, props.previewMode, props.tamagotchi]);

  useEffect(() => {
    if (!mapState || mapState.nodes.length === 0) {
      prevCelebrationLenRef.current = 0;
      const id = requestAnimationFrame(() => setCelebration(false));
      return () => cancelAnimationFrame(id);
    }
    const n = mapState.completedNodes.length;
    const total = mapState.nodes.length;
    const last = mapState.nodes[total - 1];
    const allDone = n === total && Boolean(last?.isGoal);
    if (
      allDone &&
      n > prevCelebrationLenRef.current &&
      last?.isGoal
    ) {
      const rafId = requestAnimationFrame(() => setCelebration(true));
      const t = window.setTimeout(() => setCelebration(false), 2200);
      prevCelebrationLenRef.current = n;
      return () => {
        cancelAnimationFrame(rafId);
        window.clearTimeout(t);
      };
    }
    prevCelebrationLenRef.current = n;
    return undefined;
  }, [mapState]);

  const activeIndexForActiveNode = mapState?.currentNodeIndex ?? 0;
  const focusIndexForActiveNode = hoveredNodeIndex ?? activeIndexForActiveNode;

  useLayoutEffect(() => {
    const cb = props.onActiveNodeScreenChange;
    if (!cb) return;
    const container = worldRef.current;
    if (!container) return;
    if (pathPositions.length === 0) {
      cb(null);
      return;
    }
    const safeIdx = Math.max(0, Math.min(focusIndexForActiveNode, pathPositions.length - 1));
    const pos = pathPositions[safeIdx];
    if (!pos) {
      cb(null);
      return;
    }
    const rect = container.getBoundingClientRect();
    cb({ x: rect.left + pos.x, y: rect.top + pos.y });
  }, [focusIndexForActiveNode, pathPositions, props.onActiveNodeScreenChange]);

  const handleRate = useCallback(
    async (rating: "like" | "dislike" | null) => {
      if (!ratingPrompt) return;
      const { nodeId } = ratingPrompt;
      setRatingPrompt(null);
      await sendNodeRating(nodeId, rating);
    },
    [ratingPrompt, sendNodeRating],
  );

  function playFairyShimmer() {
    try {
      const ac = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      if (ac.state === "suspended") void ac.resume();
      const now = ac.currentTime;

      const scale = [523, 659, 784, 1047, 1319];
      scale.forEach((freq, i) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g);
        g.connect(ac.destination);
        o.type = "sine";
        o.frequency.setValueAtTime(freq, now + i * 0.08);
        g.gain.setValueAtTime(0, now + i * 0.08);
        g.gain.linearRampToValueAtTime(0.18, now + i * 0.08 + 0.01);
        g.gain.exponentialRampToValueAtTime(
          0.001,
          now + i * 0.08 + 0.5,
        );
        o.start(now + i * 0.08);
        o.stop(now + i * 0.08 + 0.55);

        const buf = ac.createBuffer(
          1,
          ac.sampleRate * 0.12,
          ac.sampleRate,
        );
        const d = buf.getChannelData(0);
        for (let j = 0; j < d.length; j++)
          d[j] = Math.random() * 2 - 1;
        const src = ac.createBufferSource();
        src.buffer = buf;
        const f = ac.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 4000;
        f.Q.value = 0.5;
        const ng = ac.createGain();
        src.connect(f);
        f.connect(ng);
        ng.connect(ac.destination);
        ng.gain.setValueAtTime(0.04, now + i * 0.08);
        ng.gain.exponentialRampToValueAtTime(
          0.001,
          now + i * 0.08 + 0.12,
        );
        src.start(now + i * 0.08);
        src.stop(now + i * 0.08 + 0.15);
      });
    } catch {
      // Audio not available — fail silently
    }
  }

  const handleNodeLaunch = useCallback(
    async (node: NodeConfig) => {
      const previewMode = props.previewMode;
      const mapPreview =
        previewMode === "free" || previewMode === "go-live";
      console.log("[DEBUG node-click]", {
        nodeId: node?.id,
        nodeType: node?.type,
        isLocked: node?.isLocked,
        previewMode,
        mapPreview: previewMode === "free" || previewMode === "go-live",
        launchedUrl,
        pendingVRR: pendingVrr,
      });
      playFairyShimmer();
      const result = mapPreview ? node : await onNodeClick(node.id);
      if (!result) {
        console.log("[DEBUG] aborted: no result from onNodeClick / empty node");
        return;
      }
      if (result.type === "boss" && !result.gameFile) {
        setLaunchedUrl(null);
        setShowBossPlaceholder(true);
        return;
      }
      const muted = props.companionMutedForMap === true;
      const presetId =
        props.mapCompanion?.companionId ?? childrenCfg.defaultCompanionId;
      const launchAction = buildNodeLaunchAction(result, {
        childId: resolved,
        companion: muted ? "off" : presetId,
        isDiagMode:
          props.previewMode === "free" ||
          props.previewMode === "go-live" ||
          resolved === "creator",
        iframePreviewParam:
          props.previewMode === "free"
            ? "free"
            : props.previewMode === "go-live"
              ? "go-live"
              : undefined,
        vrmUrl: props.mapCompanion?.vrmUrl,
        companionMuted: muted,
      });
      console.log("[DEBUG] after buildNodeLaunchAction:", launchAction);
      console.log("[DEBUG] action kind:", launchAction?.kind);
      if (launchAction.kind === "skip") {
        console.warn("🎮 [AdventureMap] node launch skip:", launchAction.reason, result.type);
        return;
      }
      if (launchAction.kind === "canvas") {
        const payload = launchAction.payload;
        triggerTransition({
          palette: nodeTransitionPalette(result.type),
          onComplete: () => {
            commitLaunchedNode(result);
            console.log("[DEBUG] after commitLaunchedNode (canvas path)");
            if (!mapPreview) {
              props.karaokeReadingForMapNode?.sendMessage?.(
                "canvas_show",
                payload,
              );
            }
          },
        });
        return;
      }
      if (launchAction.kind === "iframe") {
        const iframeUrl =
          props.previewMode === "free" || props.previewMode === "go-live"
            ? ensurePreviewQueryParam(launchAction.url, props.previewMode)
            : launchAction.url;
        commitLaunchedNode(result);
        console.log("[DEBUG] after commitLaunchedNode (iframe path)");
        triggerTransition({
          palette: nodeTransitionPalette(result.type),
          onComplete: () => {
            setLaunchedUrl(iframeUrl);
            console.log("[DEBUG] launchedUrl set to:", iframeUrl);
          },
        });
      }
    },
    [
      onNodeClick,
      resolved,
      props.childId,
      props.previewMode,
      props.mapCompanion,
      props.companionMutedForMap,
      props.karaokeReadingForMapNode,
      commitLaunchedNode,
      clearLaunchedNode,
      triggerTransition,
      launchedUrl,
      pendingVrr,
    ],
  );

  const diagReading = import.meta.env.VITE_DIAG_READING === "true";
  const chimpBg =
    "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1600";

  if (resolved && !mapState) {
    if (connectionStatus === "error") {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#1a1a2e",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 16, textAlign: "center" }}>
            Could not load your adventure map.
          </div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, textAlign: "center" }}>
            Check your connection and try again.
          </div>
        </div>
      );
    }
    return <MapLoadingOverlay accent={accentColor} />;
  }

  const bgUrl = theme?.backgroundUrl ?? mapState?.theme.backgroundUrl;
  const castleUrl = theme?.castleUrl ?? mapState?.theme.castleUrl;
  const thumbs = theme?.nodeThumbnails ?? mapState?.theme.nodeThumbnails;

  const nodes = mapState?.nodes ?? [];
  const previewActive =
    props.previewMode === "free" || props.previewMode === "go-live";
  const displayNodes = previewActive
    ? nodes.map((n) => ({
        ...n,
        isLocked: false,
        isCompleted: false,
      }))
    : nodes;
  const activeIndex = mapState?.currentNodeIndex ?? 0;
  const completed = new Set(
    previewActive ? [] : (mapState?.completedNodes ?? []),
  );

  const level = mapState?.level ?? 1;
  const xp = mapState?.xp ?? 0;
  const xpToNext = Math.max(1, level * 100);

  return (
    <div
      className="adventure-map-root"
      data-connection={connectionStatus}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        paddingTop: previewActive ? 40 : 0,
      }}
    >
      {previewActive ? (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            height: 40,
            background:
              props.previewMode === "go-live"
                ? "rgba(16, 185, 129, 0.95)"
                : "rgba(109, 94, 245, 0.95)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            fontFamily: "Lexend, sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: "white",
          }}
        >
          <span>
            {props.previewMode === "go-live"
              ? "🟢 Go Live Preview — full experience"
              : "👁 Free Preview — nothing recorded"}
          </span>
          <button
            type="button"
            onClick={togglePreviewMode}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "1px solid rgba(255,255,255,0.4)",
              borderRadius: 999,
              color: "white",
              padding: "4px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "Lexend, sans-serif",
            }}
          >
            {props.previewMode === "go-live"
              ? "Switch to Free Preview"
              : "Switch to Go Live"}
          </button>
        </div>
      ) : null}
      <div
        ref={worldRef}
        className="adventure-map-world"
        style={{ width: "100vw", height: "100vh" }}
      >
        <WorldBackground
          url={bgUrl}
          paletteSky={theme?.palette?.sky ?? mapState?.theme.palette.sky}
          paletteGround={theme?.palette?.ground ?? mapState?.theme.palette.ground}
        />
        <PathCurve
          count={displayNodes.length}
          startRadius={displayNodes[0]?.isGoal ? 60 : 44}
          endRadius={displayNodes[displayNodes.length - 1]?.isGoal ? 60 : 44}
          onPositionsChange={setPathPositions}
        >
          {(positions: Point[]) => (
            <>
              {displayNodes.map((node, i) => {
                const pos = positions[i];
                if (!pos) return null;
                const thumbBase =
                  node.thumbnailUrl ??
                  (node.isGoal
                    ? (castleUrl ?? thumbs?.[node.type])
                    : thumbs?.[node.type]);
                const isDone = completed.has(node.id);
                const isActive = i === activeIndex && !isDone;
                return (
                  <NodeCard
                    key={node.id}
                    node={node}
                    position={pos}
                    thumbnail={thumbBase ?? undefined}
                    onClick={() => void handleNodeLaunch(node)}
                    isActive={isActive}
                    onHoverChange={(h) => {
                      setHoveredNodeIndex(h ? i : null);
                    }}
                  />
                );
              })}
            </>
          )}
        </PathCurve>
        {mapState ? (
          <XPBar level={level} xp={xp} xpToNext={xpToNext} side="right" />
        ) : null}
        <TamagotchiStrip
          tamagotchi={props.tamagotchi ?? DEFAULT_TAMAGOTCHI}
          hidden={Boolean(launchedNode)}
        />
        <AnimatePresence>
          {ratingPrompt ? (
            <RatingOverlay
              key={ratingPrompt.nodeId}
              nodeType={ratingPrompt.nodeType}
              onRate={(r) => void handleRate(r)}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {celebration ? (
            <motion.div
              key="celebration"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 12,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                paddingTop: "12vh",
                pointerEvents: "none",
                background: "rgba(10,10,12,0.35)",
              }}
            >
              <motion.div
                initial={{ scale: 0.9, y: 8 }}
                animate={{ scale: 1, y: 0 }}
                style={{
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 26,
                  fontWeight: 700,
                  color: "#fef3c7",
                  textShadow: "0 2px 16px rgba(0,0,0,0.5)",
                }}
              >
                Session complete!
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {launchedNode?.type === "karaoke" &&
      launchedNode.words &&
      launchedNode.words.length > 0 ? (
        <div
          key={launchedNode.id}
          className="fixed inset-0 z-[40] flex flex-col"
          style={{ background: "#0a1512" }}
        >
          {props.previewMode ? (
            <div
              aria-hidden
              style={{ height: PREVIEW_GAME_TOP_INSET_PX, flexShrink: 0, background: "#0a1512" }}
            />
          ) : null}
          <div
            className="relative flex min-h-0 flex-1 flex-col"
            style={props.previewMode ? { minHeight: 0 } : undefined}
          >
          <KaraokeReadingCanvas
            words={launchedNode.words}
            interimTranscript={
              props.karaokeReadingForMapNode?.interimTranscript ?? ""
            }
            sendMessage={
              props.previewMode === "free"
                ? (_type: string, _payload?: Record<string, unknown>) => {
                    /* free preview: no voice WebSocket */
                  }
                : props.karaokeReadingForMapNode?.sendMessage ??
                  ((_type: string, _payload?: Record<string, unknown>) => {
                    void _type;
                    void _payload;
                  })
            }
            backgroundImageUrl={
              diagReading
                ? chimpBg
                : props.karaokeReadingForMapNode?.backgroundImageUrl
            }
            accentColor={
              props.karaokeReadingForMapNode?.accentColor ??
              theme?.palette?.accent ??
              mapState?.theme.palette.accent ??
              accentColor
            }
            cardBackground={
              props.karaokeReadingForMapNode?.cardBackground ??
              mapState?.theme.palette.cardBackground
            }
            fontSize={props.karaokeReadingForMapNode?.fontSize}
            lineHeight={props.karaokeReadingForMapNode?.lineHeight}
            wordsPerLine={props.karaokeReadingForMapNode?.wordsPerLine}
            storyTitle={
              diagReading
                ? "Chimpanzees"
                : props.karaokeReadingForMapNode?.storyTitle
            }
          />
          {props.previewMode ? (
            <button
              type="button"
              className="absolute top-3 right-3 z-[50] rounded-full bg-black/70 px-4 py-2 text-sm text-white"
              onClick={() => clearLaunchedNode()}
            >
              ← Back to map
            </button>
          ) : null}
          </div>
        </div>
      ) : null}
      {props.previewMode === "free" &&
      launchedNode != null &&
      (launchedNode.type as string) === "pronunciation" &&
      (launchedNode.words?.length ?? 0) > 0 ? (
        <div className="fixed inset-0 z-[45] flex flex-col">
          <div
            aria-hidden
            style={{ height: PREVIEW_GAME_TOP_INSET_PX, flexShrink: 0, background: "#0f172a" }}
          />
          <div className="relative min-h-0 flex-1">
          <PronunciationGameCanvas
            words={launchedNode.words ?? []}
            interimTranscript={
              props.karaokeReadingForMapNode?.interimTranscript ?? ""
            }
            sendMessage={() => {
              /* preview: no voice WebSocket */
            }}
            accentColor={
              props.karaokeReadingForMapNode?.accentColor ??
              theme?.palette?.accent ??
              mapState?.theme.palette.accent ??
              accentColor
            }
            onComplete={() => {
              clearLaunchedNode();
            }}
            topInset={props.previewMode ? PREVIEW_GAME_TOP_INSET_PX : 0}
          />
          <button
            type="button"
            className="absolute top-4 right-4 z-[50] rounded-full bg-black/70 px-4 py-2 text-sm text-white"
            onClick={() => clearLaunchedNode()}
          >
            ← Back to map
          </button>
          </div>
        </div>
      ) : null}
      {launchedUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "#000",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {props.previewMode ? (
            <div
              aria-hidden
              style={{ height: PREVIEW_GAME_TOP_INSET_PX, flexShrink: 0, background: "#000" }}
            />
          ) : null}
          <div
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              zIndex: 101,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={() => {
                clearLaunchedNode();
                setLaunchedUrl(null);
              }}
              style={{
                background: "rgba(0,0,0,0.75)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 999,
                padding: "8px 18px",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "Lexend, sans-serif",
                fontWeight: 600,
              }}
            >
              ← Back to map
            </button>
          </div>
          <iframe
            ref={gameIframeRef}
            src={launchedUrl}
            onLoad={() => {
              publishIframeOverlay();
              props.onGameIframeMount?.(gameIframeRef.current);
            }}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              flex: 1,
            }}
            allow="camera; microphone"
            title="game"
          />
          </div>
        </div>
      )}
      {showBossPlaceholder ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "linear-gradient(135deg, #1a0533, #2d1260)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
          }}
        >
          <div style={{ fontSize: 80 }}>🏰</div>
          <h2
            style={{
              color: "white",
              fontSize: 28,
              fontFamily: "Lexend, sans-serif",
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            Final Boss Challenge
          </h2>
          <p
            style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: 16,
              textAlign: "center",
              fontFamily: "Lexend, sans-serif",
              maxWidth: 400,
            }}
          >
            {"The boss challenge hasn't been generated yet."}
          </p>
          <code
            style={{
              background: "rgba(255,255,255,0.1)",
              color: "#a78bfa",
              padding: "12px 20px",
              borderRadius: 8,
              fontSize: 13,
              fontFamily: "monospace",
            }}
          >
            {`npm run sunny:ingest:homework -- --child=${resolved ?? props.childId} --opus`}
          </code>
          <button
            type="button"
            onClick={() => setShowBossPlaceholder(false)}
            style={{
              background: "#6D5EF5",
              color: "white",
              border: "none",
              borderRadius: 999,
              padding: "12px 32px",
              fontSize: 16,
              fontFamily: "Lexend, sans-serif",
              fontWeight: 600,
              cursor: "pointer",
              marginTop: 8,
            }}
          >
            ← Back to map
          </button>
        </div>
      ) : null}
      {!launchedUrl && !launchedNode && props.onOpenTamagotchiSheet ? (
        <button
          type="button"
          onClick={() => props.onOpenTamagotchiSheet?.()}
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            zIndex: 50,
            background: "rgba(109,94,245,0.9)",
            border: "none",
            borderRadius: 999,
            color: "white",
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "Lexend, sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          🍎 Elli's Care
        </button>
      ) : null}
      <SlotMachineOverlay
        event={pendingVrr}
        companionName={
          props.mapCompanion?.companionId ?? "companion"
        }
        onPhase1Begin={props.onVrrPhase1Begin}
        onClaim={async (reward) => {
          const ev = pendingVrr;
          setPendingVrr(null);
          if (!ev) return;
          console.log("[VRR] claimed:", reward.id);
          if (props.previewMode === "free" || props.previewMode === "go-live") {
            return;
          }
          try {
            const r = await fetch(
              `/api/profile/${encodeURIComponent(resolved)}/vrr-claim`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rewardId: reward.id }),
              },
            );
            const j = (await r.json()) as { tamagotchi?: TamagotchiState };
            if (j.tamagotchi && props.onTamagotchiSynced) {
              props.onTamagotchiSynced(j.tamagotchi);
            }
          } catch {
            /* best-effort */
          }
        }}
      />
    </div>
  );
}
