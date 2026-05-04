import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  buildPixelPositionsFromWaypoints,
  buildPolylinePathD,
  resolveMapWaypoints,
  trimPathPolyline,
} from "../../../src/shared/mapPathLayout";
import type { MapWaypoint } from "../../../src/shared/adventureTypes";
import type { Point } from "../../../src/shared/pathCurve";

interface PathCurveProps {
  count: number;
  startRadius?: number;
  endRadius?: number;
  waypoints?: ReadonlyArray<MapWaypoint>;
  /** Fired when node layout positions are recomputed (for companion LookAt, etc.). */
  onPositionsChange?: (positions: Point[]) => void;
  children: (positions: Point[]) => ReactNode;
}

export function PathCurve({
  count,
  startRadius = 44,
  endRadius = 44,
  waypoints,
  onPositionsChange,
  children,
}: PathCurveProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [state, setState] = useState<{ pathD: string; positions: Point[] }>({
    pathD: "",
    positions: [],
  });

  const recompute = useCallback(() => {
    if (!svgRef.current) return;
    const { width, height } = svgRef.current.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    const resolvedWaypoints = resolveMapWaypoints(undefined, waypoints);
    const positions = buildPixelPositionsFromWaypoints(
      resolvedWaypoints,
      width,
      height,
      count,
    );
    const pathPoints = trimPathPolyline(
      positions,
      Math.max(0, startRadius),
      Math.max(0, endRadius),
    );
    setState({ pathD: buildPolylinePathD(pathPoints), positions });
  }, [count, startRadius, endRadius, waypoints]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    if (!svgRef.current) return;
    const observer = new ResizeObserver(() => recompute());
    observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, [recompute]);

  useEffect(() => {
    onPositionsChange?.(state.positions);
  }, [state.positions, onPositionsChange]);

  return (
    <>
      <svg
        ref={svgRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 2,
          pointerEvents: "none",
          overflow: "visible",
        }}
      >
        {state.pathD ? (
          <path
            d={state.pathD}
            fill="none"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={4}
            strokeDasharray="14 8"
            strokeLinecap="round"
            style={{ animation: "pathCurveDashMove 1.2s linear infinite" }}
          />
        ) : null}
        <style>{`
          @keyframes pathCurveDashMove {
            to { stroke-dashoffset: -44; }
          }
        `}</style>
      </svg>
      {children(state.positions)}
    </>
  );
}
