import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CREATURE_CATALOG } from "../components/capturedMonsterCatalog";
import { CreatureCollection } from "../components/CreatureCollection";
import { CREATURE_REVEAL_MS, CreatureEncounterReveal } from "../components/CreatureEncounterReveal";

vi.mock("../utils/sparkOrbSfx", () => ({
  playSparkOrbSfx: vi.fn(),
  startSparkOrbPullTone: () => null,
}));

afterEach(() => {
  vi.useRealTimers();
});

const glowmoth = CREATURE_CATALOG.find((species) => species.id === "glowmoth")!;

describe("CreatureEncounterReveal", () => {
  it("builds suspense (rustle, silhouette) before showing the creature and the stakes", () => {
    vi.useFakeTimers();
    const onCatch = vi.fn();
    render(<CreatureEncounterReveal creature={glowmoth} isNew charges={4} onCatch={onCatch} onRun={vi.fn()} />);
    const reveal = screen.getByTestId("creature-reveal");
    expect(reveal).toHaveAttribute("data-phase", "rustle");
    expect(screen.queryByText("Glowmoth")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(CREATURE_REVEAL_MS.silhouette));
    expect(reveal).toHaveAttribute("data-phase", "silhouette");
    expect(reveal).toHaveAttribute("data-rarity", "rare");
    expect(screen.queryByText("Glowmoth")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(CREATURE_REVEAL_MS.reveal - CREATURE_REVEAL_MS.silhouette));
    expect(reveal).toHaveAttribute("data-phase", "revealed");
    expect(screen.getByText("Glowmoth")).toBeInTheDocument();
    expect(screen.getByText("NEW!")).toBeInTheDocument();
    expect(screen.getByText(/#003/)).toBeInTheDocument();
    expect(screen.getByText(/Answer 4 to charge the orb/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Catch it/ }));
    expect(onCatch).toHaveBeenCalledTimes(1);
  });

  it("does not say NEW for a creature she has already seen, and running away is a real choice", () => {
    vi.useFakeTimers();
    const onRun = vi.fn();
    render(<CreatureEncounterReveal creature={glowmoth} isNew={false} charges={4} onCatch={vi.fn()} onRun={onRun} />);
    act(() => vi.advanceTimersByTime(CREATURE_REVEAL_MS.reveal));
    expect(screen.queryByText("NEW!")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Let it go/ }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });
});

describe("CreatureCollection", () => {
  it("shows the whole dex with progress, unknowns as ???, and who is out right now", () => {
    render(
      <CreatureCollection
        seenIds={["lumipuff", "glowmoth"]}
        caughtIds={["lumipuff"]}
        scene={{ season: "autumn", timeOfDay: "night" }}
      />,
    );
    expect(screen.getByText(`1 of ${CREATURE_CATALOG.length} caught`)).toBeInTheDocument();
    expect(screen.getByTestId("creature-tile-lumipuff")).toHaveAttribute("data-status", "caught");
    expect(screen.getByTestId("creature-tile-glowmoth")).toHaveAttribute("data-status", "seen");
    expect(screen.getByTestId("creature-tile-frostkit")).toHaveAttribute("data-status", "unknown");
    expect(screen.getAllByText("???").length).toBeGreaterThan(0);
    expect(screen.getByTestId("creature-tile-glowmoth")).toHaveAttribute("data-out-now", "true");
  });
});
