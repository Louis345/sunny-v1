import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatureDen } from "../components/CreatureDen";
import type { DenState } from "../components/creatureDenRules";
import { SIDEKICK_CHEER_MS, SIDEKICK_SLEEP_MS, SidekickBuddy } from "../components/SidekickBuddy";
import { CREATURE_CATALOG } from "../components/capturedMonsterCatalog";

vi.mock("../utils/sparkOrbSfx", () => ({
  playSparkOrbSfx: vi.fn(),
  startSparkOrbPullTone: () => null,
}));

afterEach(() => {
  vi.useRealTimers();
});

const state: DenState = {
  creatures: [
    { creatureId: "lumipuff", nickname: "Lumi", bond: 40, caughtAt: "2026-11-01T18:00:00.000Z" },
    { creatureId: "glowmoth", nickname: "Glow", bond: 20, caughtAt: "2026-11-08T21:00:00.000Z" },
  ],
  sidekickId: null,
  food: { apple_bite: 2, star_candy: 0, mystery_snack: 1 },
};

describe("CreatureDen", () => {
  it("shows every caught creature, opens one, and recalls or sends it home", () => {
    const onChange = vi.fn();
    const { rerender } = render(<CreatureDen state={state} onChange={onChange} />);
    expect(screen.getByTestId("den-tile-lumipuff")).toBeInTheDocument();
    expect(screen.getByTestId("den-tile-glowmoth")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("den-tile-glowmoth"));
    expect(screen.getByRole("heading", { name: "Glow" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Recall Glow/ }));
    const recalled = onChange.mock.calls.at(-1)![0] as DenState;
    expect(recalled.sidekickId).toBe("glowmoth");

    rerender(<CreatureDen state={recalled} onChange={onChange} />);
    expect(screen.getByTestId("den-tile-glowmoth")).toHaveAttribute("data-sidekick", "true");
    fireEvent.click(screen.getByRole("button", { name: /Send Glow home/ }));
    expect((onChange.mock.calls.at(-1)![0] as DenState).sidekickId).toBeNull();
  });

  it("feeds with store food she owns, and points to the store when she has none", () => {
    const onChange = vi.fn();
    render(<CreatureDen state={state} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("den-tile-lumipuff"));
    const apple = screen.getByRole("button", { name: /Apple Bite ×2/ });
    fireEvent.click(apple);
    expect((onChange.mock.calls.at(-1)![0] as DenState).food.apple_bite).toBe(1);
    expect(screen.getByRole("button", { name: /Star Candy ×0/ })).toBeDisabled();
    expect(screen.getByText(/Buy more food in the store/)).toBeInTheDocument();
  });
});

describe("SidekickBuddy", () => {
  const glowmoth = CREATURE_CATALOG.find((species) => species.id === "glowmoth")!;

  it("cheers when she gets one right, then settles; dozes when nothing happens", () => {
    vi.useFakeTimers();
    const { rerender } = render(<SidekickBuddy creature={glowmoth} nickname="Glow" cheerKey={0} onDismiss={vi.fn()} />);
    const buddy = screen.getByTestId("sidekick-buddy");
    expect(buddy).toHaveAttribute("data-mood", "idle");
    rerender(<SidekickBuddy creature={glowmoth} nickname="Glow" cheerKey={1} onDismiss={vi.fn()} />);
    expect(buddy).toHaveAttribute("data-mood", "cheer");
    act(() => vi.advanceTimersByTime(SIDEKICK_CHEER_MS));
    expect(buddy).toHaveAttribute("data-mood", "idle");
    act(() => vi.advanceTimersByTime(SIDEKICK_SLEEP_MS));
    expect(buddy).toHaveAttribute("data-mood", "sleep");
  });

  it("tapping the sidekick sends it home", () => {
    const onDismiss = vi.fn();
    render(<SidekickBuddy creature={glowmoth} nickname="Glow" cheerKey={0} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /Send Glow home/ }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
