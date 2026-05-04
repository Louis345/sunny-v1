/**
 * Adventure map path layout: normalized waypoints (0–1) sampled by arc length,
 * then scaled to container pixels. Optional path extensions for dashed SVG trail.
 */

import type { MapPathPresetName, MapWaypoint } from "./adventureTypes";

export const MAP_PATH_PRESETS: Record<MapPathPresetName, readonly MapWaypoint[]> = {
  /** Current hill/river curve; first point inset from far-left to avoid edge props. */
  "rising-curve": [
    { x: 0.2, y: 0.7 },
    { x: 0.34, y: 0.56 },
    { x: 0.52, y: 0.48 },
    { x: 0.68, y: 0.42 },
    { x: 0.86, y: 0.32 },
  ],
  "zigzag-climb": [
    { x: 0.14, y: 0.76 },
    { x: 0.32, y: 0.42 },
    { x: 0.5, y: 0.66 },
    { x: 0.68, y: 0.36 },
    { x: 0.86, y: 0.22 },
  ],
  "gentle-s-curve": [
    { x: 0.12, y: 0.72 },
    { x: 0.3, y: 0.62 },
    { x: 0.48, y: 0.42 },
    { x: 0.66, y: 0.5 },
    { x: 0.86, y: 0.28 },
  ],
  "stepping-stones": [
    { x: 0.16, y: 0.74 },
    { x: 0.32, y: 0.62 },
    { x: 0.44, y: 0.48 },
    { x: 0.6, y: 0.56 },
    { x: 0.74, y: 0.4 },
    { x: 0.88, y: 0.26 },
  ],
} as const;

export const MAP_PATH_PRESET_NAMES = Object.keys(
  MAP_PATH_PRESETS,
) as MapPathPresetName[];

export const DEFAULT_MAP_PATH_PRESET: MapPathPresetName = "rising-curve";

export const DEFAULT_MAP_WAYPOINTS = MAP_PATH_PRESETS[DEFAULT_MAP_PATH_PRESET];

function isMapPathPresetName(value: unknown): value is MapPathPresetName {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(MAP_PATH_PRESETS, value)
  );
}

function hasUsableCustomWaypoints(
  waypoints: ReadonlyArray<MapWaypoint> | undefined,
): waypoints is ReadonlyArray<MapWaypoint> {
  return (
    Array.isArray(waypoints) &&
    waypoints.length >= 2 &&
    waypoints.every(
      (p) =>
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        p.x >= 0 &&
        p.x <= 1 &&
        p.y >= 0 &&
        p.y <= 1,
    )
  );
}

export function resolveMapPathPresetName(
  name: string | undefined | null,
): MapPathPresetName {
  return isMapPathPresetName(name) ? name : DEFAULT_MAP_PATH_PRESET;
}

export function resolveMapWaypoints(
  presetName?: string | null,
  customWaypoints?: ReadonlyArray<MapWaypoint>,
): readonly MapWaypoint[] {
  if (hasUsableCustomWaypoints(customWaypoints)) return customWaypoints;
  return MAP_PATH_PRESETS[resolveMapPathPresetName(presetName)];
}

export function mapPathPresetForTheme(seed: string): MapPathPresetName {
  if (MAP_PATH_PRESET_NAMES.length === 0) return DEFAULT_MAP_PATH_PRESET;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return MAP_PATH_PRESET_NAMES[hash % MAP_PATH_PRESET_NAMES.length] ?? DEFAULT_MAP_PATH_PRESET;
}

export function buildPolylinePathD(
  positions: ReadonlyArray<{ x: number; y: number }>,
): string {
  if (positions.length === 0) return "";
  const [first, ...rest] = positions;
  return [
    `M ${first.x} ${first.y}`,
    ...rest.map((p) => `L ${p.x} ${p.y}`),
  ].join(" ");
}

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

/**
 * Trim first/last polyline endpoints toward their adjacent points by node radii in pixels,
 * so the dashed path reaches node edges without drawing through or beyond the circles.
 */
export function trimPathPolyline(
  positions: ReadonlyArray<{ x: number; y: number }>,
  startRadius: number,
  endRadius: number,
): { x: number; y: number }[] {
  if (positions.length === 0) return [];
  if (positions.length === 1) return [{ ...positions[0] }];
  const p = positions.map((pt) => ({ ...pt }));

  const first = p[0];
  const second = p[1];
  const dx0 = second.x - first.x;
  const dy0 = second.y - first.y;
  const len0 = Math.hypot(dx0, dy0) || 1;
  const startInset = Math.max(0, Math.min(startRadius, len0 / 2));
  p[0] = {
    x: first.x + (dx0 / len0) * startInset,
    y: first.y + (dy0 / len0) * startInset,
  };

  const n = p.length;
  const last = p[n - 1];
  const prev = p[n - 2];
  const dxL = prev.x - last.x;
  const dyL = prev.y - last.y;
  const lenL = Math.hypot(dxL, dyL) || 1;
  const endInset = Math.max(0, Math.min(endRadius, lenL / 2));
  p[n - 1] = {
    x: last.x + (dxL / lenL) * endInset,
    y: last.y + (dyL / lenL) * endInset,
  };

  return p;
}
