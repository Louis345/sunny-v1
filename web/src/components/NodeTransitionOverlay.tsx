import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type Palette = {
  from: string;
  to: string;
};

export const TRANSITION_PALETTES: Palette[] = [
  { from: "#f59e0b", to: "#ef4444" }, // ember         (cover-wipe fave)
  { from: "#6D5EF5", to: "#a78bfa" }, // purple dream
  { from: "#f472b6", to: "#fb923c" }, // pink sunset
  { from: "#06b6d4", to: "#3b82f6" }, // ocean dive
  { from: "#10b981", to: "#84cc16" }, // jungle
  { from: "#8b5cf6", to: "#ec4899" }, // magic hour
  { from: "#14b8a6", to: "#0ea5e9" }, // lagoon
  { from: "#eab308", to: "#f97316" }, // honey
  { from: "#a855f7", to: "#6366f1" }, // nebula
  { from: "#22c55e", to: "#06b6d4" }, // mint breeze
  { from: "#e879f9", to: "#f472b6" }, // bubblegum
  { from: "#fb7185", to: "#f59e0b" }, // peach glow
];

export type NodeTransitionOverlayProps = {
  children: ReactNode;
  active: boolean;
  palette?: Palette | "random";
  duration?: number;
  onComplete?: () => void;
};

const STYLES = ["sheet", "wipe", "split", "iris"] as const;
type TransitionStyle = (typeof STYLES)[number];

function resolvePalette(
  palette: Palette | "random",
  lastIndexRef: React.MutableRefObject<number>,
): Palette {
  if (palette !== "random") return palette;
  let idx: number;
  do {
    idx = Math.floor(Math.random() * TRANSITION_PALETTES.length);
  } while (idx === lastIndexRef.current && TRANSITION_PALETTES.length > 1);
  lastIndexRef.current = idx;
  return TRANSITION_PALETTES[idx]!;
}

export function NodeTransitionOverlay({
  children,
  active,
  palette = "random",
  duration = 700,
  onComplete,
}: NodeTransitionOverlayProps) {
  const lastStyleRef = useRef<TransitionStyle | null>(null);
  const lastPaletteIndexRef = useRef<number>(-1);
  const onCompleteRef = useRef(onComplete);
  const hasCompletedRef = useRef(false);
  const [overlay, setOverlay] = useState<{
    style: TransitionStyle;
    palette: Palette;
    armed: boolean;
  } | null>(null);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!active) {
      setOverlay(null);
      hasCompletedRef.current = false;
      return;
    }

    hasCompletedRef.current = false;

    const pool = STYLES.filter((s) => s !== lastStyleRef.current);
    const picked = pool[Math.floor(Math.random() * pool.length)]!;
    lastStyleRef.current = picked;

    const resolvedPalette = resolvePalette(palette, lastPaletteIndexRef);
    setOverlay({ style: picked, palette: resolvedPalette, armed: false });

    // double-rAF: guarantees the browser has committed the unarmed state
    // before we flip armed=true, so the CSS transition always fires.
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setOverlay((o) => (o ? { ...o, armed: true } : null));
      });
    });

    // Safety-only fallback: fires if transitionend never arrives
    // (e.g. prefers-reduced-motion cuts duration to 0, tab is hidden).
    // The real gate is onTransitionEnd on each animated div below.
    const fallbackId = window.setTimeout(() => {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onCompleteRef.current?.();
        setOverlay(null);
      }
    }, duration + 400);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(fallbackId);
    };
  }, [active, duration, palette]);

  // Called by whichever animated div finishes its CSS transition first.
  // `prop` is the CSS property we care about — prevents double-firing when
  // multiple properties transition (e.g. clip-path + -webkit-clip-path).
  const onTransitionDone = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>, prop: string) => {
      if (e.propertyName !== prop) return;
      if (hasCompletedRef.current) return;
      hasCompletedRef.current = true;
      onCompleteRef.current?.();
      setOverlay(null);
    },
    [],
  );

  const ms = `${duration}ms`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {children}
      {overlay && (
        <div
          data-testid="node-transition-overlay"
          data-transition-style={overlay.style}
          data-palette-from={overlay.palette.from}
          style={
            {
              position: "absolute",
              inset: 0,
              zIndex: 100,
              // block clicks while the transition animation is playing
              pointerEvents: "auto",
              overflow: "hidden",
              "--from": overlay.palette.from,
              "--to": overlay.palette.to,
            } as React.CSSProperties
          }
        >
          {overlay.style === "sheet" && (
            <div
              onTransitionEnd={(e) => onTransitionDone(e, "transform")}
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(0deg, var(--from), var(--to))",
                transform: overlay.armed ? "translateY(0)" : "translateY(100%)",
                transition: `transform ${ms} ease-out`,
              }}
            />
          )}
          {overlay.style === "wipe" && (
            <div
              onTransitionEnd={(e) => onTransitionDone(e, "transform")}
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(90deg, var(--from), var(--to))",
                transform: overlay.armed ? "scaleX(1)" : "scaleX(0)",
                transformOrigin: "left center",
                transition: `transform ${ms} ease-out`,
              }}
            />
          )}
          {overlay.style === "iris" && (
            <div
              onTransitionEnd={(e) => onTransitionDone(e, "clip-path")}
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at center, var(--from), var(--to))",
                clipPath: overlay.armed
                  ? "circle(150vmax at 50% 50%)"
                  : "circle(0% at 50% 50%)",
                WebkitClipPath: overlay.armed
                  ? "circle(150vmax at 50% 50%)"
                  : "circle(0% at 50% 50%)",
                transition: `clip-path ${ms} ease-out, -webkit-clip-path ${ms} ease-out`,
              }}
            />
          )}
          {overlay.style === "split" && (
            <>
              <div
                onTransitionEnd={(e) => onTransitionDone(e, "transform")}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  height: "50%",
                  background:
                    "linear-gradient(180deg, var(--from), var(--to))",
                  transform: overlay.armed
                    ? "translateY(0)"
                    : "translateY(-100%)",
                  transition: `transform ${ms} ease-out`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: "50%",
                  background: "linear-gradient(0deg, var(--from), var(--to))",
                  transform: overlay.armed
                    ? "translateY(0)"
                    : "translateY(100%)",
                  transition: `transform ${ms} ease-out`,
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
