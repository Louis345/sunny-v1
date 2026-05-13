import { useEffect, useMemo, useRef } from "react";
import { CarrierFlowScene } from "./CarrierFlowScene";
import { getVisualBrief, visualBriefs } from "./visualBriefs";
import type { VisualBriefId } from "./visualBriefSchema";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function resolveBriefId(): VisualBriefId {
  const candidate = new URLSearchParams(window.location.search).get("brief");
  return candidate && Object.prototype.hasOwnProperty.call(visualBriefs, candidate)
    ? (candidate as VisualBriefId)
    : "erosion";
}

function resolveProgress(): number {
  const raw = new URLSearchParams(window.location.search).get("progress");
  return clamp01(Number(raw ?? 0));
}

export function VisualExplainerRenderRoute(): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const briefId = useMemo(resolveBriefId, []);
  const progress = useMemo(resolveProgress, []);
  const brief = getVisualBrief(briefId);

  useEffect(() => {
    const previousBodyBackground = document.body.style.background;
    const previousBodyMargin = document.body.style.margin;
    const previousHtmlBackground = document.documentElement.style.background;

    document.body.style.background = brief.palette.page;
    document.body.style.margin = "0";
    document.documentElement.style.background = brief.palette.page;

    let cancelled = false;
    const markReady = () => {
      if (cancelled) return;
      rootRef.current?.setAttribute("data-render-ready", "true");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          rootRef.current?.setAttribute("data-render-ready", "true");
        });
      });
    };

    const readyTimer = window.setTimeout(markReady, 350);
    void document.fonts.ready.then(markReady).catch(markReady);

    return () => {
      cancelled = true;
      window.clearTimeout(readyTimer);
      document.body.style.background = previousBodyBackground;
      document.body.style.margin = previousBodyMargin;
      document.documentElement.style.background = previousHtmlBackground;
    };
  }, [brief.palette.page]);

  return (
    <div
      ref={rootRef}
      data-scene-root
      data-render-ready="false"
      data-brief-id={briefId}
      data-progress={progress}
      style={{
        width: "1600px",
        height: "900px",
        overflow: "hidden",
        background: brief.palette.page,
      }}
    >
      <CarrierFlowScene brief={brief} progress={progress} isPlaying={false} />
    </div>
  );
}
