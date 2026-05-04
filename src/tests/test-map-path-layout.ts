import { describe, it, expect } from "vitest";
import {
  DEFAULT_MAP_WAYPOINTS,
  MAP_PATH_PRESETS,
  buildPixelPositionsFromWaypoints,
  extendPathPolyline,
  resolveMapWaypoints,
  samplePolylineAt,
} from "../shared/mapPathLayout";

describe("mapPathLayout", () => {
  it("samplePolylineAt(0) is at start of polyline", () => {
    const p = samplePolylineAt(DEFAULT_MAP_WAYPOINTS, 0);
    expect(p.x).toBeCloseTo(DEFAULT_MAP_WAYPOINTS[0].x, 5);
    expect(p.y).toBeCloseTo(DEFAULT_MAP_WAYPOINTS[0].y, 5);
  });

  it("samplePolylineAt(1) is at end of polyline", () => {
    const last = DEFAULT_MAP_WAYPOINTS[DEFAULT_MAP_WAYPOINTS.length - 1];
    const p = samplePolylineAt(DEFAULT_MAP_WAYPOINTS, 1);
    expect(p.x).toBeCloseTo(last.x, 5);
    expect(p.y).toBeCloseTo(last.y, 5);
  });

  it("buildPixelPositionsFromWaypoints spaces nodes with increasing x", () => {
    const pts = buildPixelPositionsFromWaypoints(DEFAULT_MAP_WAYPOINTS, 1000, 800, 4);
    expect(pts).toHaveLength(4);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].x).toBeGreaterThan(pts[i - 1].x - 0.01);
    }
  });

  it("extendPathPolyline adds endpoints", () => {
    const base = [
      { x: 100, y: 200 },
      { x: 200, y: 150 },
    ];
    const ext = extendPathPolyline(base, 0.5, 0.5);
    expect(ext.length).toBe(4);
    expect(ext[1]).toEqual(base[0]);
    expect(ext[2]).toEqual(base[1]);
  });

  it("exposes named layout presets for the adventure map", () => {
    expect(Object.keys(MAP_PATH_PRESETS).sort()).toEqual([
      "gentle-s-curve",
      "rising-curve",
      "stepping-stones",
      "zigzag-climb",
    ]);
    expect(MAP_PATH_PRESETS["rising-curve"]).toEqual(DEFAULT_MAP_WAYPOINTS);
    expect(MAP_PATH_PRESETS["zigzag-climb"]).not.toEqual(DEFAULT_MAP_WAYPOINTS);
  });

  it("falls back to rising-curve for unknown or missing preset names", () => {
    expect(resolveMapWaypoints()).toEqual(DEFAULT_MAP_WAYPOINTS);
    expect(resolveMapWaypoints("not-a-real-preset")).toEqual(DEFAULT_MAP_WAYPOINTS);
  });

  it("prefers explicit custom waypoints over a named preset", () => {
    const custom = [
      { x: 0.1, y: 0.8 },
      { x: 0.5, y: 0.2 },
      { x: 0.9, y: 0.7 },
    ];

    expect(resolveMapWaypoints("zigzag-climb", custom)).toEqual(custom);
  });
});
