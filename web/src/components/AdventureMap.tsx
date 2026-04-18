import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  NodeConfig,
  NodeResult,
  NodeType,
} from "../../../src/shared/adventureTypes";
import type { Point } from "../../../src/shared/pathCurve";
import { useMapSession } from "../hooks/useMapSession";
import { KaraokeReadingCanvas } from "./KaraokeReadingCanvas";
import type { KaraokeReadingCanvasProps } from "./KaraokeReadingCanvas";
import { NodeCard } from "./NodeCard.tsx";
import { NodeTransitionOverlay } from "./NodeTransitionOverlay";
import { PathCurve } from "./PathCurve.tsx";
import { RatingOverlay } from "./RatingOverlay.tsx";
import { WorldBackground } from "./WorldBackground.tsx";
import { XPBar } from "./XPBar.tsx";
import "./AdventureMap.css";


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

/** HTML game file per node type; unknown types fall back to word-builder stub. */
const NODE_TYPE_GAME_HTML: Partial<Record<NodeType, string>> = {
  "word-builder": "word-builder.html",
  "spell-check": "spell-check.html",
  "clock-game": "clock-game.html",
  "coin-counter": "coin-counter.html",
  "space-invaders": "space-invaders.html",
  "asteroid": "asteroid.html",
  "space-frogger": "space-frogger.html",
  "bubble-pop": "word-builder.html",
  "riddle": "word-builder.html",
  "boss": "word-builder.html",
};

function buildAdventureNodeGameUrl(
  childId: string,
  node: NodeConfig,
  themeName: string,
): string | null {
  if (node.type === "karaoke") return null;
  const file = NODE_TYPE_GAME_HTML[node.type] ?? "word-builder.html";
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  const q = new URLSearchParams({
    childId,
    difficulty: String(node.difficulty),
    theme: themeName,
    nodeId: node.id,
    game: node.type,
  });
  return `${base}games/${file}?${q.toString()}`;
}

export function AdventureMap(props: {
  childId: string;
  mapSession: ReturnType<typeof useMapSession>;
  onActiveNodeScreenChange?: (p: { x: number; y: number } | null) => void;
  /** Voice-session reading props when a map node of type \"karaoke\" is launched. */
  karaokeReadingForMapNode?: KaraokeReadingCanvasProps;
}) {
  const resolved = props.childId.trim();

  const {
    mapState,
    theme,
    connectionStatus,
    onNodeClick,
    launchedNode,
    sendNodeResult,
    sendNodeRating,
  } = props.mapSession;

  const [gameFrameUrl, setGameFrameUrl] = useState<string | null>(null);
  const [ratingPrompt, setRatingPrompt] = useState<{
    nodeId: string;
    nodeType: string;
  } | null>(null);
  const [celebration, setCelebration] = useState(false);
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

  useEffect(() => {
    if (!launchedNode || !resolved.trim()) {
      setGameFrameUrl(null);
      return;
    }
    const url = buildAdventureNodeGameUrl(
      resolved,
      launchedNode,
      mapState?.theme.name ?? "default",
    );
    setGameFrameUrl(url);
  }, [launchedNode, mapState?.theme.name, resolved]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      if ((d as { type?: string }).type !== "node_result") return;
      void sendNodeResult(d as NodeResult);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [sendNodeResult]);

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
          setRatingPrompt({ nodeId: nid, nodeType: node.type });
        }, 500);
        return () => window.clearTimeout(show);
      }
    }
    return undefined;
  }, [mapState]);

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
  const activeIndex = mapState?.currentNodeIndex ?? 0;
  const completed = new Set(mapState?.completedNodes ?? []);

  const level = mapState?.level ?? 1;
  const xp = mapState?.xp ?? 0;
  const xpToNext = Math.max(1, level * 100);

  return (
    <div
      className="adventure-map-root"
      data-connection={connectionStatus}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
    >
      <div
        ref={worldRef}
        className="adventure-map-world"
        style={{ width: "100vw", height: "100vh" }}
      >
        <WorldBackground url={bgUrl} />
        <PathCurve
          count={nodes.length}
          startRadius={nodes[0]?.isGoal ? 60 : 44}
          endRadius={nodes[nodes.length - 1]?.isGoal ? 60 : 44}
          onPositionsChange={setPathPositions}
        >
          {(positions: Point[]) => (
            <>
              {nodes.map((node, i) => {
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
                    onClick={() => void onNodeClick(node.id)}
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

      {launchedNode ? (
        <NodeTransitionOverlay
          active
          color={
            theme?.palette?.accent ??
            mapState?.theme.palette.accent ??
            accentColor ??
            "#6D5EF5"
          }
        >
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 14,
              background: "#0a0a0c",
            }}
          >
            {launchedNode.type === "karaoke" && props.karaokeReadingForMapNode ? (
              <KaraokeReadingCanvas {...props.karaokeReadingForMapNode} />
            ) : gameFrameUrl ? (
              <iframe
                title="Adventure node game"
                src={gameFrameUrl}
                allow="autoplay; fullscreen"
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  display: "block",
                  background: "#0a0a0c",
                }}
              />
            ) : null}
          </div>
        </NodeTransitionOverlay>
      ) : null}
    </div>
  );
}
