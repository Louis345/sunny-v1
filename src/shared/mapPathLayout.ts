/**
 * Adventure map path layout: normalized waypoints (0–1) sampled by arc length,
 * then scaled to container pixels. Optional path extensions for dashed SVG trail.
 */

import type { MapWaypoint } from "./adventureTypes";

/** Default hill/river curve; first point inset from far-left to avoid edge props. */
export const DEFAULT_MAP_WAYPOINTS: readonly MapWaypoint[] = [
  { x: 0.2, y: 0.7 },
  { x: 0.34, y: 0.56 },
  { x: 0.52, y: 0.48 },
  { x: 0.68, y: 0.42 },
  { x: 0.86, y: 0.32 },
] as const;

/**
 * Sample a point at fraction t ∈ [0,1] along the polyline's total arc length.
 */
export function samplePolylineAt(
  waypoints: ReadonlyArray<MapWaypoint>,
  t: number,
): MapWaypoint {
  if (waypoints.length === 0) return { x: 0.5, y: 0.5 };
  if (waypoints.length === 1) return { ...waypoints[0] };
  const tClamped = Math.max(0, Math.min(1, t));

  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const d = Math.hypot(
      waypoints[i].x - waypoints[i - 1].x,
      waypoints[i].y - waypoints[i - 1].y,
    );
    segLens.push(d);
    total += d;
  }
  if (total < 1e-9) return { ...waypoints[0] };

  const target = tClamped * total;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (acc + segLens[i] >= target) {
      const local = segLens[i] > 0 ? (target - acc) / segLens[i] : 0;
      const a = waypoints[i];
      const b = waypoints[i + 1];
      return {
        x: a.x + local * (b.x - a.x),
        y: a.y + local * (b.y - a.y),
      };
    }
    acc += segLens[i];
  }
  const last = waypoints[waypoints.length - 1];
  return { ...last };
}

/** Node centers in pixels from normalized waypoints and container size. */
export function buildPixelPositionsFromWaypoints(
  waypoints: ReadonlyArray<MapWaypoint>,
  width: number,
  height: number,
  count: number,
): { x: number; y: number }[] {
  if (count < 1 || width < 1 || height < 1) return [];
  if (waypoints.length === 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const t = count <= 1 ? 0 : i / (count - 1);
    const p = samplePolylineAt(waypoints, t);
    return { x: p.x * width, y: p.y * height };
  });
}

/**
 * Prepend/append points along first/last segment so the dashed path reads longer * without moving node circles. Fractions are multiples of adjacent segment length.
 */
export function extendPathPolyline(
  positions: ReadonlyArray<{ x: number; y: number }>,
  startExtend: number,
  endExtend: number,
): { x: number; y: number }[] {
  if (positions.length === 0) return [];
  if (positions.length === 1) return [{ ...positions[0] }];
  const p = positions.map((pt) => ({ ...pt }));
  const first = p[0];
  const second = p[1];
  const vx = first.x - second.x;
  const vy = first.y - second.y;
  const len0 = Math.hypot(vx, vy) || 1;
  const start = {
    x: first.x + (vx / len0) * len0 * startExtend,
    y: first.y + (vy / len0) * len0 * startExtend,
  };

  const n = p.length;
  const last = p[n - 1];
  const prev = p[n - 2];
  const wx = last.x - prev.x;
  const wy = last.y - prev.y;
  const lenL = Math.hypot(wx, wy) || 1;
  const end = {
    x: last.x + (wx / lenL) * lenL * endExtend,
    y: last.y + (wy / lenL) * lenL * endExtend,
  };

  return [start, ...p, end];
}
