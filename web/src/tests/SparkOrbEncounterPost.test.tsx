import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SparkOrbEncounterPost,
  type SparkOrbEncounterPhase,
} from "../components/SparkOrbEncounterPost";

const phases: SparkOrbEncounterPhase[] = [
  "idle",
  "charge-1",
  "charge-2",
  "ready",
  "launching",
  "collected",
];

const baseProps = {
  creatureName: "Lumipuff",
  statLabel: "SPARK",
  statValue: 214,
  orbCount: 7,
  attribution: "Sunny Lab",
  timestamp: "11:21 AM · Apr 24, 2026",
  views: "1,732 Views",
  hint: "Flick up to launch",
};

describe("SparkOrbEncounterPost", () => {
  it("renders the post shell, encounter HUD, orb counter, charge state, and collected card", () => {
    render(<SparkOrbEncounterPost {...baseProps} phase="collected" />);

    expect(screen.getByRole("heading", { name: "Post" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sunny Spark Orb encounter" })).toBeInTheDocument();
    expect(screen.getByText("Lumipuff")).toBeInTheDocument();
    expect(screen.getByText("SPARK 214")).toBeInTheDocument();
    expect(screen.getByText("ORB")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("From Sunny Lab")).toBeInTheDocument();
    expect(screen.getByText("Charge 3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Lumipuff collectible card" })).toBeInTheDocument();
  });

  it("exposes all six visual phases through props", () => {
    const { rerender } = render(<SparkOrbEncounterPost {...baseProps} phase="idle" />);

    for (const phase of phases) {
      rerender(<SparkOrbEncounterPost {...baseProps} phase={phase} />);
      expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute("data-phase", phase);
      expect(screen.getByTestId("spark-orb")).toHaveAttribute("data-phase", phase);
    }
  });

  it("marks ready, launch, and collected states with distinct visual state hooks", () => {
    const { rerender } = render(<SparkOrbEncounterPost {...baseProps} phase="ready" />);

    expect(screen.getByTestId("spark-orb")).toHaveAttribute("data-ready", "true");
    expect(screen.getByText("Charge 3 / 3")).toBeInTheDocument();

    rerender(<SparkOrbEncounterPost {...baseProps} phase="launching" />);
    expect(screen.getByTestId("spark-orb")).toHaveAttribute("data-launching", "true");
    expect(screen.getByTestId("spark-orb-spectral-stream")).toHaveAttribute(
      "data-active",
      "true",
    );

    rerender(<SparkOrbEncounterPost {...baseProps} phase="collected" />);
    expect(screen.getByTestId("spark-orb")).toHaveAttribute("data-collected", "true");
    expect(screen.getByText("Collected")).toBeInTheDocument();
  });

  it("adds magical charged-energy layers for ready and launch states", () => {
    const { rerender } = render(<SparkOrbEncounterPost {...baseProps} phase="ready" />);

    expect(screen.getByTestId("spark-orb-energy-rings")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("spark-orb-spectral-stream")).toHaveAttribute(
      "data-active",
      "false",
    );

    rerender(<SparkOrbEncounterPost {...baseProps} phase="launching" />);
    expect(screen.getByTestId("spark-orb-energy-rings")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("spark-orb-spectral-stream")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("does not show passive video playback controls inside the active encounter", () => {
    render(<SparkOrbEncounterPost {...baseProps} phase="ready" />);

    expect(screen.queryByRole("button", { name: "Play encounter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Volume" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Picture in picture" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fullscreen" })).not.toBeInTheDocument();
    expect(screen.queryByText("0:14 / 0:24")).not.toBeInTheDocument();
    expect(screen.getByText("Flick up to launch")).toBeInTheDocument();
  });

  it("does not show social timestamp or view metadata below the encounter", () => {
    render(<SparkOrbEncounterPost {...baseProps} phase="ready" />);

    expect(screen.queryByText("11:21 AM · Apr 24, 2026 · 1,732 Views")).not.toBeInTheDocument();
  });

  it("emits encounter events for charge, launch, collect, and reset actions", () => {
    const onEncounterEvent = vi.fn();
    const { rerender } = render(
      <SparkOrbEncounterPost
        {...baseProps}
        phase="idle"
        onEncounterEvent={onEncounterEvent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Charge orb" }));
    expect(onEncounterEvent).toHaveBeenLastCalledWith({
      type: "charge",
      phase: "idle",
      chargeCount: 0,
      creatureName: "Lumipuff",
    });

    rerender(
      <SparkOrbEncounterPost
        {...baseProps}
        phase="ready"
        onEncounterEvent={onEncounterEvent}
      />,
    );
    expect(onEncounterEvent).toHaveBeenLastCalledWith({
      type: "ready",
      phase: "ready",
      chargeCount: 3,
      creatureName: "Lumipuff",
    });

    fireEvent.click(screen.getByRole("button", { name: "Launch Sunny orb" }));
    expect(onEncounterEvent).toHaveBeenLastCalledWith({
      type: "launch",
      phase: "ready",
      chargeCount: 3,
      creatureName: "Lumipuff",
    });

    rerender(
      <SparkOrbEncounterPost
        {...baseProps}
        phase="collected"
        onEncounterEvent={onEncounterEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Collect Lumipuff" }));
    expect(onEncounterEvent).toHaveBeenLastCalledWith({
      type: "collected",
      phase: "collected",
      chargeCount: 3,
      creatureName: "Lumipuff",
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset encounter" }));
    expect(onEncounterEvent).toHaveBeenLastCalledWith({
      type: "reset",
      phase: "collected",
      chargeCount: 3,
      creatureName: "Lumipuff",
    });
  });

  it("keeps source language Sunny-original instead of source-identifying brand terms", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/SparkOrbEncounterPost.tsx"),
      "utf8",
    ).toLowerCase();

    expect(source).not.toContain("pokemon");
    expect(source).not.toContain("pokémon");
    expect(source).not.toContain("pokeball");
    expect(source).not.toContain("pokéball");
    expect(source).not.toContain("poke ball");
    expect(source).not.toContain("poké ball");
  });
});
