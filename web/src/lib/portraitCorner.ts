import { useEffect, useState, type CSSProperties, type RefObject } from "react";
import { collectGameLayout, pickFreeCorner, type Corner, type LayoutBox } from "../../../src/shared/layoutCoverage";

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

export function portraitCornerStyle(corner: Corner, margin: number): CSSProperties {
  const [vertical, horizontal] = corner.split("-") as ["top" | "bottom", "left" | "right"];
  return { [vertical]: margin, [horizontal]: margin, alignItems: horizontal === "left" ? "flex-start" : "flex-end" };
}

const CHECK_MS = 1_500;

/** The portrait's corner: re-checked every 1.5 s while it is shown, stopped when hidden or unmounted. */
export function usePortraitCorner(active: boolean, wrapRef: RefObject<HTMLElement | null>, margin: number): Corner {
  const [corner, setCorner] = useState<Corner>("bottom-right");
  useEffect(() => {
    if (!active) { setCorner("bottom-right"); return; }
    const check = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const choice = pickFreeCorner({ w: window.innerWidth, h: window.innerHeight }, { w: rect.width, h: rect.height }, margin, gameControlBoxes(document));
      setCorner(previous => {
        if (previous !== choice.corner) {
          console.log(` 🎮 [companion-portrait] [corner] [moved] to=${choice.corner} still_covers=${choice.coveredLabels.join(",") || "none"}`);
        }
        return choice.corner;
      });
    };
    check();
    const timer = window.setInterval(check, CHECK_MS);
    return () => window.clearInterval(timer);
  }, [active, wrapRef, margin]);
  return corner;
}
