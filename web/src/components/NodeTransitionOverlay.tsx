import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const STYLES = ["sheet", "wipe", "split", "iris"] as const;
type TransitionStyle = (typeof STYLES)[number];

export type NodeTransitionOverlayProps = {
  children: ReactNode;
  active: boolean;
  color: string;
  duration?: number;
  onComplete?: () => void;
};

export function NodeTransitionOverlay({
  children,
  active,
  color,
  duration = 700,
  onComplete,
}: NodeTransitionOverlayProps) {
  const lastStyleRef = useRef<TransitionStyle | null>(null);
  const onCompleteRef = useRef(onComplete);
  const [overlay, setOverlay] = useState<{
    style: TransitionStyle;
    armed: boolean;
  } | null>(null);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!active) {
      setOverlay(null);
      return;
    }

    const pool = STYLES.filter((s) => s !== lastStyleRef.current);
    const picked = pool[Math.floor(Math.random() * pool.length)]!;
    lastStyleRef.current = picked;

    setOverlay({ style: picked, armed: false });

    let doneId: number | undefined;

    const armId = window.setTimeout(() => {
      setOverlay((o) => (o ? { ...o, armed: true } : null));
      doneId = window.setTimeout(() => {
        onCompleteRef.current?.();
        setOverlay(null);
      }, duration);
    }, 0);

    return () => {
      window.clearTimeout(armId);
      if (doneId !== undefined) {
        window.clearTimeout(doneId);
      }
    };
  }, [active, duration]);

  const ms = `${duration}ms`;

  const singleLayerBase: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: color,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 14,
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
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 100,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          {overlay.style === "sheet" && (
            <div
              style={{
                ...singleLayerBase,
                transform: overlay.armed ? "translateY(0)" : "translateY(100%)",
                transition: `transform ${ms} ease-out`,
              }}
            />
          )}
          {overlay.style === "wipe" && (
            <div
              style={{
                ...singleLayerBase,
                transform: overlay.armed ? "scaleX(1)" : "scaleX(0)",
                transformOrigin: "left center",
                transition: `transform ${ms} ease-out`,
              }}
            />
          )}
          {overlay.style === "iris" && (
            <div
              style={{
                ...singleLayerBase,
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
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  height: "50%",
                  background: color,
                  transform: overlay.armed ? "translateY(0)" : "translateY(-100%)",
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
                  background: color,
                  transform: overlay.armed ? "translateY(0)" : "translateY(100%)",
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
