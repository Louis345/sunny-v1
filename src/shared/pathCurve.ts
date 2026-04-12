export interface Point {
  x: number;
  y: number;
}

export interface CubicCurve {
  start: Point;
  cp1: Point;
  cp2: Point;
  end: Point;
}

const DEFAULT_SAMPLE_COUNT = 500;

export function buildCurve(width: number, height: number): CubicCurve {
  const start = { x: width * 0.08, y: height * 0.85 };
  const end = { x: width * 0.92, y: height * 0.2 };
  const dx = end.x - start.x;
  const dy = start.y - end.y;
  const cp1 = { x: start.x + dx * 0.25, y: start.y - dy * 0.1 };
  const cp2 = { x: start.x + dx * 0.75, y: end.y + dy * 0.1 };
  return { start, cp1, cp2, end };
}

export function sampleCubicBezier(
  start: Point,
  cp1: Point,
  cp2: Point,
  end: Point,
  t: number,
): Point {
  const mt = 1 - t;
  return {
    x:
      mt ** 3 * start.x +
      3 * mt ** 2 * t * cp1.x +
      3 * mt * t ** 2 * cp2.x +
      t ** 3 * end.x,
    y:
      mt ** 3 * start.y +
      3 * mt ** 2 * t * cp1.y +
      3 * mt * t ** 2 * cp2.y +
      t ** 3 * end.y,
  };
}

export function sampleCurvePoints(
  curve: CubicCurve,
  sampleCount = DEFAULT_SAMPLE_COUNT,
): Point[] {
  if (sampleCount <= 1) {
    return [curve.start, curve.end];
  }
  return Array.from({ length: sampleCount }, (_, idx) =>
    sampleCubicBezier(
      curve.start,
      curve.cp1,
      curve.cp2,
      curve.end,
      idx / (sampleCount - 1),
    ),
  );
}

export function computeArcLengths(points: Point[]): number[] {
  if (points.length === 0) return [0];
  const arcLengths = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    arcLengths.push(arcLengths[i - 1] + Math.hypot(dx, dy));
  }
  return arcLengths;
}

export function interpolateAtLength(
  points: Point[],
  arcLengths: number[],
  target: number,
): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  if (target <= 0) return points[0];
  const total = arcLengths[arcLengths.length - 1] ?? 0;
  if (target >= total) return points[points.length - 1];

  for (let i = 1; i < arcLengths.length; i++) {
    if (arcLengths[i] >= target) {
      const span = Math.max(1e-6, arcLengths[i] - arcLengths[i - 1]);
      const t = (target - arcLengths[i - 1]) / span;
      return {
        x: points[i - 1].x + t * (points[i].x - points[i - 1].x),
        y: points[i - 1].y + t * (points[i].y - points[i - 1].y),
      };
    }
  }

  return points[points.length - 1];
}

export function distributeNodes(
  curve: CubicCurve,
  count: number,
  startRadius: number,
  endRadius: number,
  sampleCount = DEFAULT_SAMPLE_COUNT,
): Point[] {
  if (count === 0) return [];

  const points = sampleCurvePoints(curve, sampleCount);
  const arcLengths = computeArcLengths(points);
  const total = arcLengths[arcLengths.length - 1] ?? 0;
  const trimStart = Math.max(0, Math.min(startRadius, total));
  const trimEnd = Math.max(trimStart, total - Math.max(0, endRadius));
  const usable = Math.max(0, trimEnd - trimStart);

  if (count === 1) {
    return [interpolateAtLength(points, arcLengths, trimStart)];
  }

  if (usable <= 1e-6) {
    const midpoint = total / 2;
    return Array.from({ length: count }, () =>
      interpolateAtLength(points, arcLengths, midpoint),
    );
  }

  return Array.from({ length: count }, (_, i) => {
    const target = trimStart + (i / (count - 1)) * usable;
    return interpolateAtLength(points, arcLengths, target);
  });
}

export function buildCurvePathD(curve: CubicCurve): string {
  return `M ${curve.start.x} ${curve.start.y} C ${curve.cp1.x} ${curve.cp1.y} ${curve.cp2.x} ${curve.cp2.y} ${curve.end.x} ${curve.end.y}`;
}
