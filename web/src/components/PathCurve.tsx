import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  buildCurve,
  buildCurvePathD,
  distributeNodes,
  type CubicCurve,
  type Point,
} from "../../../src/shared/pathCurve";

interface PathCurveProps {
  count: number;
  startRadius?: number;
  endRadius?: number;
  /** Fired when node layout positions are recomputed (for companion LookAt, etc.). */
  onPositionsChange?: (positions: Point[]) => void;
  children: (positions: Point[]) => ReactNode;
}

export function PathCurve({
  count,
  startRadius = 44,
  endRadius = 44,
  onPositionsChange,
  children,
}: PathCurveProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [state, setState] = useState<{ curve: CubicCurve | null; positions: Point[] }>({
    curve: null,
    positions: [],
  });

  const recompute = useCallback(() => {
    if (!svgRef.current) return;
    const { width, height } = svgRef.current.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    const curve = buildCurve(width, height);
    const positions = distributeNodes(curve, count, startRadius, endRadius);
    setState({ curve, positions });
  }, [count, startRadius, endRadius]);

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
        {state.curve && (
          <path
            d={buildCurvePathD(state.curve)}
            fill="none"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={4}
            strokeDasharray="14 8"
            strokeLinecap="round"
            style={{ animation: "pathCurveDashMove 1.2s linear infinite" }}
          />
        )}
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
