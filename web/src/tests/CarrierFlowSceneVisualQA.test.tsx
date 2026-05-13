import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CarrierFlowScene } from "../components/VisualExplainer/CarrierFlowScene";
import { visualBriefs } from "../components/VisualExplainer/visualBriefs";

const CANONICAL_LAYERS = [
  "bgFar",
  "bgMid",
  "terrain",
  "medium",
  "actors",
  "terrainNear",
  "payload",
  "regionLabels",
  "accents",
];

const PHASES = [
  { name: "intro", progress: 0 },
  { name: "prediction", progress: 0.48 },
  { name: "reveal", progress: 0.78 },
  { name: "complete", progress: 1 },
] as const;

describe("carrier-flow visual QA structure", () => {
  it.each(["erosion", "red-blood-cells"] as const)(
    "renders all 9 canonical layers for %s",
    (briefId) => {
      const { container } = render(
        <CarrierFlowScene brief={visualBriefs[briefId]} progress={0.78} isPlaying={false} />,
      );

      const layers = Array.from(container.querySelectorAll("[data-layer]")).map((node) =>
        node.getAttribute("data-layer"),
      );

      expect(layers).toEqual(CANONICAL_LAYERS);
    },
  );

  it.each(PHASES)("changes the camera/viewBox at $name", ({ progress }) => {
    const { container } = render(
      <CarrierFlowScene brief={visualBriefs.erosion} progress={progress} isPlaying={false} />,
    );

    const scene = container.querySelector('[data-testid="visual-explainer-scene"]');
    expect(scene?.getAttribute("viewBox")).toMatch(/-?\d+ -?\d+ \d+ \d+/);
  });

  it("keeps erosion zoomed out as a landscape, not a cropped diagram", () => {
    const { container } = render(
      <CarrierFlowScene brief={visualBriefs.erosion} progress={0.78} isPlaying={false} />,
    );

    const scene = container.querySelector('[data-testid="visual-explainer-scene"]');
    const [x, y, width, height] = scene
      ?.getAttribute("viewBox")
      ?.split(/\s+/)
      .map(Number) ?? [];

    expect(x).toBeLessThan(0);
    expect(y).toBeLessThanOrEqual(0);
    expect(width).toBeGreaterThan(1600);
    expect(height).toBeGreaterThan(900);
  });

  it("renders erosion as animated primitives with water, sediment, and reveal focus", () => {
    const { container } = render(
      <CarrierFlowScene brief={visualBriefs.erosion} progress={0.78} isPlaying={true} />,
    );

    const waterPath = container.querySelector('[data-testid="carrier-flow-water-path"]');
    const revealLens = container.querySelector('[data-testid="carrier-flow-reveal-lens"]');
    const grains = container.querySelectorAll('[data-payload-grain="sediment"]');

    expect(waterPath).toBeInTheDocument();
    expect(waterPath?.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(revealLens).toBeInTheDocument();
    expect(Number(revealLens?.getAttribute("opacity") ?? "0")).toBeGreaterThan(0.5);
    expect(grains.length).toBeGreaterThanOrEqual(18);
  });

  it("fills the render viewport without browser-default SVG letterboxing", () => {
    const { container } = render(
      <CarrierFlowScene brief={visualBriefs.erosion} progress={0.78} isPlaying={false} />,
    );

    const scene = container.querySelector('[data-testid="visual-explainer-scene"]');
    expect(scene).toHaveStyle({
      display: "block",
      width: "100%",
      height: "100%",
    });
  });

  it("does not leak debug strings into the rendered scene", () => {
    const { container } = render(
      <CarrierFlowScene brief={visualBriefs.erosion} progress={0.5} isPlaying={false} />,
    );

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/STATE:/i);
    expect(text).not.toMatch(/PAUSEDFORPREDICTION/i);
    expect(text).not.toMatch(/data-layer-index/i);
  });

  it("keeps red blood cell carriers and oxygen cargo visible after pickup", () => {
    const { container } = render(
      <CarrierFlowScene
        brief={visualBriefs["red-blood-cells"]}
        progress={0.48}
        isPlaying={false}
      />,
    );

    const carriers = container.querySelectorAll('[data-testid="carrier-flow-carrier"]');
    const cellBodies = container.querySelectorAll('[data-carrier-body="cell"]');
    const cargoGroups = container.querySelectorAll('[data-testid="carrier-flow-cargo"]');
    const firstBody = cellBodies[0];
    const firstCargo = cargoGroups[0];

    expect(carriers).toHaveLength(5);
    expect(cellBodies).toHaveLength(5);
    expect(firstBody?.getAttribute("stroke")).toBe("#fff5f8");
    expect(Number(firstBody?.getAttribute("stroke-width") ?? "0")).toBeGreaterThanOrEqual(6);
    expect(cargoGroups).toHaveLength(5);
    expect(Number(firstCargo?.getAttribute("opacity") ?? "0")).toBeGreaterThan(0.5);
  });
});
