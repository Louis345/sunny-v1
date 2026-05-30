import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import meta, { AutoRunEncounter } from "../stories/SparkOrbEncounterPost.stories";
import * as sparkOrbPostStories from "../stories/SparkOrbEncounterPost.stories";

describe("SparkOrbEncounterPost stories", () => {
  it("does not expose a static charging sequence story in Storybook", () => {
    expect(sparkOrbPostStories).not.toHaveProperty("ChargingSequence");
  });

  it("runs the full encounter from one Storybook trigger", () => {
    vi.useFakeTimers();

    const rendered = AutoRunEncounter.render?.(
      {
        ...meta.args,
        phase: "idle",
      },
      {} as never,
    ) as ReactElement;

    render(rendered);
    expect(screen.getByRole("button", { name: "Run full encounter" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run full encounter" }));
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute("data-phase", "idle");

    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute("data-phase", "charge-1");

    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute("data-phase", "charge-2");

    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute("data-phase", "ready");

    act(() => vi.advanceTimersByTime(900));
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute("data-phase", "launching");

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute("data-phase", "collected");

    vi.useRealTimers();
  });
});
