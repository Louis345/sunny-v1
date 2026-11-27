import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { collectGameLayout, pickPortraitLift, type LayoutBox } from "../../../src/shared/layoutCoverage";

/** S41: every control in the open game frames (same-origin), in page coordinates. A frame it cannot read is skipped. */
export function gameControlBoxes(doc: Document): LayoutBox[] {
  const boxes: LayoutBox[] = [];
  for (const frame of Array.from(doc.querySelectorAll("iframe")).slice(0, 8)) {
    let inner: Document | null = null;
    try { inner = frame.contentDocument; } catch { inner = null; }
    if (!inner) continue;
    const at = frame.getBoundingClientRect();
    if (at.width < 4 || at.height < 4) continue;
    for (const control of collectGameLayout(inner).controls) boxes.push({ ...control, x: control.x + at.left, y: control.y + at.top });
  }
  return boxes;
}

/** Her home is bottom-right; a lift only slides her up the right edge (11/22: never another corner). */
export function portraitLiftStyle(lift: number, margin: number): CSSProperties {
  return { right: margin, bottom: margin + lift, alignItems: "flex-end" };
}

const CHECK_MS = 1_500;

/**
 * How far her portrait slides up so her circle covers no game control: re-checked every 1.5 s while shown, stopped
 * when hidden or unmounted. Only the circle (data-testid="companion-portrait") is measured, never the pill and hint.
 */
export function usePortraitLift(active: boolean, wrapRef: RefObject<HTMLElement | null>, margin: number): number {
  const [lift, setLift] = useState(0);
  const liftRef = useRef(0);
  useEffect(() => {
    if (!active) { liftRef.current = 0; setLift(0); return; }
    const check = () => {
      const circle = wrapRef.current?.querySelector('[data-testid="companion-portrait"]');
      if (!circle) return;
      const rect = circle.getBoundingClientRect();
      const bottomGap = window.innerHeight - rect.bottom - liftRef.current;
      const choice = pickPortraitLift({ w: window.innerWidth, h: window.innerHeight }, { w: rect.width, h: rect.height }, margin, gameControlBoxes(document), 24, bottomGap);
      if (choice.lift !== liftRef.current) {
        console.log(` 🎮 [companion-portrait] [lift] [moved] lift=${choice.lift} still_covers=${choice.coveredLabels.join(",") || "none"}`);
        liftRef.current = choice.lift;
        setLift(choice.lift);
      }
    };
    check();
    const timer = window.setInterval(check, CHECK_MS);
    return () => window.clearInterval(timer);
  }, [active, wrapRef, margin]);
  return lift;
}
