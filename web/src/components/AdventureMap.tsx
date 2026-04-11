import { useCallback, useEffect, useRef } from "react";
import type { MapState, NodeConfig, SessionTheme } from "../../../src/shared/adventureTypes";
import { useMapSession } from "../hooks/useMapSession";
import "./AdventureMap.css";

type Layout = { x: number; y: number; r: number };

const PARTICLES = 20;
const IMAGE_FADE_MS = 800;

function nodeLayouts(w: number, h: number, nodes: NodeConfig[]): Layout[] {
  const pad = 56;
  const cy = h * 0.55;
  const n = nodes.length;
  const out: Layout[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = pad + t * Math.max(1, w - pad * 2);
    const wave = Math.sin(t * Math.PI) * (h * 0.12);
    const baseR = nodes[i]?.isCastle ? 36 : 28;
    out.push({ x, y: cy - wave, r: baseR });
  }
  return out;
}

function drawCheck(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = Math.max(2, s * 0.14);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.35, y);
  ctx.lineTo(x - s * 0.05, y + s * 0.32);
  ctx.lineTo(x + s * 0.42, y - s * 0.28);
  ctx.stroke();
  ctx.restore();
}

function drawPadlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  stroke: string,
) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  const w = s * 0.42;
  const h = s * 0.34;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h * 0.1, w, h, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - h * 0.45, w * 0.35, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
}

function drawPlay(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.22, y - s * 0.28);
  ctx.lineTo(x + s * 0.32, y);
  ctx.lineTo(x - s * 0.22, y + s * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function AdventureMap(props: { childId?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const resolved =
    props.childId ??
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("childId") ?? ""
      : "");
  const { mapState, theme, connectionStatus, onNodeClick } = useMapSession(resolved);

  const mapRef = useRef<MapState | null>(null);
  const themeRef = useRef<SessionTheme | null>(null);
  useEffect(() => {
    mapRef.current = mapState;
    themeRef.current = theme ?? mapState?.theme ?? null;
  }, [mapState, theme]);

  const bgImg = useRef<HTMLImageElement | null>(null);
  const castleImg = useRef<HTMLImageElement | null>(null);
  const bgLoadAt = useRef<number | null>(null);
  const castleLoadAt = useRef<number | null>(null);

  useEffect(() => {
    const u = mapState?.theme.backgroundUrl;
    bgImg.current = null;
    bgLoadAt.current = null;
    if (!u) return;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      bgImg.current = im;
      bgLoadAt.current = performance.now();
    };
    im.onerror = () => {
      bgImg.current = null;
    };
    im.src = u;
  }, [mapState?.theme.backgroundUrl]);

  useEffect(() => {
    const u = mapState?.theme.castleUrl;
    castleImg.current = null;
    castleLoadAt.current = null;
    if (!u) return;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      castleImg.current = im;
      castleLoadAt.current = performance.now();
    };
    im.onerror = () => {
      castleImg.current = null;
    };
    im.src = u;
  }, [mapState?.theme.castleUrl]);

  const layoutsRef = useRef<Layout[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapRef.current!);

    let t0 = performance.now();
    const particleSeed = Array.from({ length: PARTICLES }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      ph: (i / PARTICLES) * Math.PI * 2,
      sp: 0.4 + Math.random() * 0.6,
    }));

    const tick = (now: number) => {
      const elapsed = (now - t0) / 1000;
      const ms = mapRef.current;
      const th = themeRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!ms || !th) {
        ctx.clearRect(0, 0, w, h);
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      const pal = th.palette;
      const nodes = ms.nodes;
      const layouts = nodeLayouts(w, h, nodes);
      layoutsRef.current = layouts;

      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, pal.sky);
      skyGrad.addColorStop(1, pal.ground);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      let bgA = 0;
      if (bgImg.current && bgLoadAt.current != null) {
        bgA = Math.min(1, (now - bgLoadAt.current) / IMAGE_FADE_MS);
        ctx.save();
        ctx.globalAlpha = bgA;
        ctx.drawImage(bgImg.current, 0, 0, w, h);
        ctx.restore();
      }

      if (layouts.length >= 2) {
        ctx.save();
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 10]);
        const dashPhase = (elapsed * 40) % 20;
        ctx.lineDashOffset = -dashPhase;
        ctx.beginPath();
        ctx.moveTo(layouts[0].x, layouts[0].y);
        for (let i = 1; i < layouts.length; i++) {
          const p = layouts[i - 1];
          const q = layouts[i];
          const cx = (p.x + q.x) / 2;
          const cy = Math.min(p.y, q.y) - 40;
          ctx.quadraticCurveTo(cx, cy, q.x, q.y);
        }
        ctx.stroke();
        ctx.restore();
      }

      const ambColor = th.ambient?.color || pal.particle;
      for (let i = 0; i < PARTICLES; i++) {
        const p = particleSeed[i];
        const ox = p.x * w;
        const oy = (p.y * h + Math.sin(elapsed * p.sp + p.ph) * 18) % h;
        ctx.fillStyle = ambColor;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const cur = ms.currentNodeIndex;
      const completed = new Set(ms.completedNodes);
      const pulse = 1 + Math.sin(elapsed * 3) * 0.06;

      nodes.forEach((node, i) => {
        const L = layouts[i];
        if (!L) return;
        const isDone = completed.has(node.id);
        const isActive = i === cur && !isDone;
        const isLocked = i > cur && !isDone;
        const castle = node.isCastle;

        let fill = pal.ground;
        if (isDone) fill = pal.glow;
        else if (isLocked) fill = pal.sky;
        else if (isActive) fill = pal.accent;

        const R = (isActive ? L.r * pulse : L.r) * (castle ? 1.05 : 1);

        if (isActive) {
          ctx.save();
          ctx.strokeStyle = pal.glow;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(L.x, L.y, R + 6 + Math.sin(elapsed * 5) * 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.fillStyle = fill;
        ctx.strokeStyle = isLocked ? pal.accent : "#ffffff55";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(L.x - R, L.y - R * 1.15, R * 2, R * 2.3, 10);
        ctx.fill();
        ctx.stroke();

        if (isDone) drawCheck(ctx, L.x, L.y - 2, R * 1.1);
        else if (isLocked) drawPadlock(ctx, L.x, L.y, R * 1.4, pal.accent);
        else if (castle) drawPlay(ctx, L.x + 2, L.y, R, "#fff");

        ctx.save();
        ctx.fillStyle = isLocked ? pal.accent : "#0a0a0acc";
        ctx.font = `600 ${Math.max(10, Math.round(R * 0.28))}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(node.type, L.x, L.y + R * 0.55);
        ctx.restore();
      });

      const last = layouts[layouts.length - 1];
      const lastNode = nodes[nodes.length - 1];
      if (last && lastNode?.isCastle) {
        const cx = last.x;
        const cy = last.y - last.r * 1.4;
        let ca = 0;
        if (castleImg.current && castleLoadAt.current != null) {
          ca = Math.min(1, (now - castleLoadAt.current) / IMAGE_FADE_MS);
          ctx.save();
          ctx.globalAlpha = ca;
          const iw = last.r * 2.8;
          const ih = last.r * 2.2;
          ctx.drawImage(castleImg.current, cx - iw / 2, cy - ih, iw, ih);
          ctx.restore();
        }
        ctx.save();
        ctx.strokeStyle = pal.glow;
        ctx.lineWidth = 3;
        const cp = 1 + Math.sin(elapsed * 4) * 0.08;
        ctx.beginPath();
        ctx.arc(cx, cy, 16 * cp, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.fillStyle = "#ffffffee";
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2;
      const bx = 12;
      const by = 12;
      const bw = 140;
      const bh = 40;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#111";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`XP ${ms.xp} · Lv ${ms.level}`, bx + 12, by + bh / 2);
      ctx.restore();

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, []);

  const pickNodeId = useCallback((clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    for (let i = 0; i < layoutsRef.current.length; i++) {
      const L = layoutsRef.current[i];
      const dx = x - L.x;
      const dy = y - L.y;
      if (dx * dx + dy * dy <= L.r * L.r * 1.5) {
        const id = mapRef.current?.nodes[i]?.id;
        return id ?? null;
      }
    }
    return null;
  }, []);

  const handleCanvasClick = useCallback(
    async (ev: React.MouseEvent<HTMLCanvasElement>) => {
      const id = pickNodeId(ev.clientX, ev.clientY);
      if (id) await onNodeClick(id);
    },
    [onNodeClick, pickNodeId],
  );

  return (
    <div
      ref={wrapRef}
      className={`adventure-map-root ${connectionStatus === "open" ? "is-animating" : ""}`}
      data-connection={connectionStatus}
    >
      <canvas
        ref={canvasRef}
        className="adventure-map-canvas"
        onClick={handleCanvasClick}
        aria-label="Adventure map"
      />
    </div>
  );
}
