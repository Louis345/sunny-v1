import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BossDropReveal } from "../components/BossDropReveal";

// Owner, 2026-11-05: beating the Boss drops loot, with the approved ceremony card: it shakes face-down while
// its glow climbs through the tiers, then flips to her tier and coins. The tier is the saved server roll.
afterEach(() => vi.useRealTimers());

describe("BossDropReveal", () => {
  it("keeps the tier hidden until the card flips, then shows her saved tier and coins", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<BossDropReveal drop={{ tier: "epic", coins: 60 }} onDone={onDone} />);
    expect(screen.getByTestId("boss-drop")).toHaveAttribute("data-phase", "suspense");
    expect(screen.queryByText("EPIC")).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByTestId("boss-drop")).toHaveAttribute("data-phase", "revealed");
    expect(screen.getByText("EPIC")).toBeInTheDocument();
    expect(screen.getByText("+60 coins")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collect" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
