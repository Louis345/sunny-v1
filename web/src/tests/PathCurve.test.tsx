import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPixelPositionsFromWaypoints } from "../../../src/shared/mapPathLayout";
import { PathCurve } from "../components/PathCurve";

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
}

describe("PathCurve", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      toJSON: () => ({}),
    })) as unknown as typeof Element.prototype.getBoundingClientRect;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.restoreAllMocks();
  });

  it("uses waypoint-derived positions for both nodes and the dashed path", async () => {
    const waypoints = [
      { x: 0.12, y: 0.78 },
      { x: 0.34, y: 0.34 },
      { x: 0.58, y: 0.66 },
      { x: 0.84, y: 0.24 },
    ];
    let positions: Array<{ x: number; y: number }> = [];
    const expected = buildPixelPositionsFromWaypoints(waypoints, 1000, 800, 4);

    const { container } = render(
      <PathCurve count={4} waypoints={waypoints} onPositionsChange={(p) => (positions = p)}>
        {(pts) => (
          <>
            {pts.map((p, i) => (
              <span key={i} data-testid={`node-${i}`}>
                {Math.round(p.x)},{Math.round(p.y)}
              </span>
            ))}
          </>
        )}
      </PathCurve>,
    );

    await waitFor(() => expect(positions).toHaveLength(4));

    expected.forEach((p, i) => {
      expect(positions[i]?.x).toBeCloseTo(p.x, 3);
      expect(positions[i]?.y).toBeCloseTo(p.y, 3);
    });

    const d = container.querySelector("path")?.getAttribute("d") ?? "";
    expect(d).not.toContain(`M ${expected[0].x} ${expected[0].y}`);
    expect(d).not.toContain(`L ${expected[3].x} ${expected[3].y}`);
  });
});
