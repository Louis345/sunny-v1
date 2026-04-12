import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NodeConfig, NodeResult } from "../../../src/shared/adventureTypes";
import type { Point } from "../../../src/shared/pathCurve";
import { useMapSession } from "../hooks/useMapSession";
import { NodeCard } from "./NodeCard";
import { PathCurve } from "./PathCurve";
import { RatingOverlay } from "./RatingOverlay";
import { WorldBackground } from "./WorldBackground";
import { XPBar } from "./XPBar";
import "./AdventureMap.css";

const PORTAL_MS = 800;

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

function buildWordBuilderGameUrl(
  childId: string,
  node: NodeConfig,
  themeName: string,
): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  const q = new URLSearchParams({
    childId,
    difficulty: String(node.difficulty),
    theme: themeName,
    nodeId: node.id,
    game: node.type,
  });
  return `${base}games/word-builder.html?${q.toString()}`;
}

function LaunchPortal({
  x,
  y,
  onComplete,
}: {
  x: number;
  y: number;
  onComplete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const surface = canvasRef.current;
    if (!surface) return;
    const ctx = surface.getContext("2d")!;
    surface.width = window.innerWidth;
    surface.height = window.innerHeight;
    const start = performance.now();
    const duration = 700;
    let frame: number;

    function animate(now: number) {
      const el = canvasRef.current;
      if (!el) return;
      const progress = Math.min((now - start) / duration, 1);
      ctx.clearRect(0, 0, el.width, el.height);

      for (let i = 0; i < 5; i++) {
        const rp = Math.max(0, (progress - i * 0.06) / (1 - i * 0.06));
        if (rp <= 0) continue;
        const radius = rp * Math.max(el.width, el.height) * 1.5;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${(1 - rp) * 0.9})`;
        ctx.lineWidth = 6;
        ctx.stroke();
      }

      const washRadius = progress * Math.max(el.width, el.height) * 2.2;
      const g = ctx.createRadialGradient(x, y, 0, x, y, washRadius);
      g.addColorStop(0, `rgba(255,255,255,${progress})`);
      g.addColorStop(0.6, `rgba(255,255,255,${progress * 0.6})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, el.width, el.height);

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        onComplete();
      }
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [x, y, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 6,
        pointerEvents: "none",
      }}
    />
  );
}

export function AdventureMap(props: { childId: string }) {
  const resolved = props.childId.trim();

  const {
    mapState,
    theme,
    connectionStatus,
    onNodeClick,
    launchedNode,
    sendNodeResult,
    sendNodeRating,
  } = useMapSession(resolved);

  const [gameFrameUrl, setGameFrameUrl] = useState<string | null>(null);
  const [gameFrameEntered, setGameFrameEntered] = useState(false);
  const [portalActive, setPortalActive] = useState(false);
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

  const accentColor =
    resolved && accentForChild?.childId === resolved
      ? accentForChild.accent
      : "#7C3AED";

  const handlePortalAnimationComplete = useCallback(() => {}, []);

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
    const id = requestAnimationFrame(() =>
      setGameFrameEntered(Boolean(gameFrameUrl)),
    );
    return () => cancelAnimationFrame(id);
  }, [gameFrameUrl]);

  useEffect(() => {
    if (!launchedNode || !resolved.trim()) {
      const id = requestAnimationFrame(() => {
        setPortalActive(false);
        if (!launchedNode) setGameFrameUrl(null);
      });
      return () => cancelAnimationFrame(id);
    }
    const rafId = requestAnimationFrame(() => {
      setGameFrameUrl(null);
      setPortalActive(true);
    });
    const t = window.setTimeout(() => {
      const url = buildWordBuilderGameUrl(
        resolved,
        launchedNode,
        mapState?.theme.name ?? "default",
      );
      setGameFrameUrl(url);
      setPortalActive(false);
    }, PORTAL_MS);
    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(t);
    };
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


  const launchedIdx =
    launchedNode && mapState
      ? mapState.nodes.findIndex((n) => n.id === launchedNode.id)
      : -1;

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
        className="adventure-map-world"
        style={{ width: "100vw", height: "100vh" }}
      >
        <WorldBackground url={bgUrl} />
        <PathCurve
          count={nodes.length}
          startRadius={nodes[0]?.isGoal ? 60 : 44}
          endRadius={nodes[nodes.length - 1]?.isGoal ? 60 : 44}
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
                  />
                );
              })}
              {portalActive && launchedIdx >= 0 && positions[launchedIdx] ? (
                <LaunchPortal
                  x={positions[launchedIdx].x}
                  y={positions[launchedIdx].y}
                  onComplete={handlePortalAnimationComplete}
                />
              ) : null}
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

      {gameFrameUrl ? (
        <iframe
          title="Adventure node game"
          src={gameFrameUrl}
          allow="autoplay; fullscreen"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: 0,
            zIndex: 14,
            background: "#0a0a0c",
            transform: gameFrameEntered ? "translateY(0)" : "translateY(100%)",
            opacity: gameFrameEntered ? 1 : 0,
            transition: "transform 420ms ease-out, opacity 420ms ease-out",
            pointerEvents: "auto",
          }}
        />
      ) : null}
    </div>
  );
}
