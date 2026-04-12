import { describe, expect, it } from "vitest";
import {
  buildCurve,
  buildCurvePathD,
  computeArcLengths,
  distributeNodes,
  interpolateAtLength,
  sampleCurvePoints,
} from "../shared/pathCurve";

describe("pathCurve geometry", () => {
  it("places a single node at the trimmed start, not center", () => {
    const curve = buildCurve(1000, 500);
    const samples = sampleCurvePoints(curve);
    const arcLengths = computeArcLengths(samples);
    const point = distributeNodes(curve, 1, 44, 60)[0];
    const expected = interpolateAtLength(samples, arcLengths, 44);

    expect(point.x).toBeCloseTo(expected.x, 3);
    expect(point.y).toBeCloseTo(expected.y, 3);
  });

  it("trims first and last node by their endpoint radii", () => {
    const curve = buildCurve(1000, 500);
    const samples = sampleCurvePoints(curve);
    const arcLengths = computeArcLengths(samples);
    const total = arcLengths[arcLengths.length - 1];
    const positions = distributeNodes(curve, 4, 44, 60);
    const expectedFirst = interpolateAtLength(samples, arcLengths, 44);
    const expectedLast = interpolateAtLength(samples, arcLengths, total - 60);

    expect(positions[0].x).toBeCloseTo(expectedFirst.x, 3);
    expect(positions[0].y).toBeCloseTo(expectedFirst.y, 3);
    expect(positions[3].x).toBeCloseTo(expectedLast.x, 3);
    expect(positions[3].y).toBeCloseTo(expectedLast.y, 3);
  });

  it("builds a cubic svg path string", () => {
    const curve = buildCurve(1000, 500);
    const d = buildCurvePathD(curve);

    expect(d.startsWith("M ")).toBe(true);
    expect(d.includes(" C ")).toBe(true);
  });
});
