import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  kind: "star" | "confetti";
  rot: number;
  vr: number;
};

/**
 * Full-viewport canvas: gold star burst from `origin` + confetti rain (quest unlock).
 */
export function QuestParticles(props: {
  active: boolean;
  origin: { x: number; y: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const secondBurstRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!props.active) {
      window.clearTimeout(secondBurstRef.current);
      particlesRef.current = [];
      const c = ref.current;
      if (c) {
        const ctx = c.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, c.width, c.height);
      }
      return undefined;
    }

    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { x: ox, y: oy } = props.origin;
    const parts: Particle[] = [];
    const makeStar = (x: number, y: number): Particle => {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 6;
      return {
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1.2,
        life: 0,
        maxLife: 55 + Math.random() * 40,
        size: 2 + Math.random() * 3,
        hue: 45 + Math.random() * 25,
        kind: "star",
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2,
      };
    };
    for (let i = 0; i < 80; i++) {
      parts.push(makeStar(ox, oy));
    }
    for (let i = 0; i < 150; i++) {
      parts.push({
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.4,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 2 + Math.random() * 4,
        life: 0,
        maxLife: 100 + Math.random() * 80,
        size: 4 + Math.random() * 5,
        hue: Math.random() * 360,
        kind: "confetti",
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.15,
      });
    }
    particlesRef.current = parts;
    startRef.current = performance.now();
    secondBurstRef.current = window.setTimeout(() => {
      particlesRef.current.push(
        ...Array.from({ length: 40 }, () => makeStar(ox, oy - 100)),
      );
    }, 550);

    const tick = (now: number) => {
      const ctx2 = canvas.getContext("2d");
      if (!ctx2) return;
      ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2.clearRect(0, 0, w, h);
      const t = now - startRef.current;
      let alive = 0;
      for (const p of particlesRef.current) {
        if (p.life >= p.maxLife) continue;
        alive++;
        p.life += 1;
        p.x += p.vx;
        p.y += p.vy;
        if (p.kind === "star") {
          p.vy += 0.06;
        } else {
          p.vy += 0.04;
        }
        p.rot += p.vr;
        const alpha = 1 - p.life / p.maxLife;
        ctx2.save();
        ctx2.translate(p.x, p.y);
        ctx2.rotate(p.rot);
        ctx2.globalAlpha = Math.max(0, alpha);
        if (p.kind === "star") {
          ctx2.fillStyle = `hsla(${p.hue}, 95%, 62%, ${alpha})`;
          ctx2.beginPath();
          for (let k = 0; k < 4; k++) {
            const ang = (k * Math.PI) / 2;
            ctx2.lineTo(Math.cos(ang) * p.size * 2, Math.sin(ang) * p.size * 2);
            ctx2.lineTo(Math.cos(ang + 0.4) * p.size * 0.5, Math.sin(ang + 0.4) * p.size * 0.5);
          }
          ctx2.closePath();
          ctx2.fill();
        } else {
          ctx2.fillStyle = `hsla(${p.hue}, 85%, 55%, ${alpha})`;
          ctx2.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        }
        ctx2.restore();
      }
      if (alive > 0 && t < 4500) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.clearTimeout(secondBurstRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, [props.active, props.origin.x, props.origin.y]);

  if (!props.active) return null;

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 160,
        pointerEvents: "none",
      }}
    />
  );
}
