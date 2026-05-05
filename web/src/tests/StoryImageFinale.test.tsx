import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoryImageFinale } from "../components/StoryImageFinale";

describe("StoryImageFinale purchase flow", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the image visible while showing the movie purchase sheet", () => {
    render(
      <StoryImageFinale
        childId="reina"
        childDisplayName="Reina"
        imageUrl="https://example.com/erosion.png"
        loading={false}
        failed={false}
        companionCurrency={25}
        purchaseCost={8}
        onPurchaseMovie={vi.fn().mockResolvedValue({ balance: 17, cost: 8 })}
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByAltText("Story finale").getAttribute("src")).toContain(
      "erosion.png",
    );
    expect(screen.getByTestId("story-movie-purchase-sheet")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Play movie for 8 coins" }),
    ).not.toBeNull();
  });

  it("subtracts coins through purchase, then unlocks in-session replay", async () => {
    vi.useFakeTimers();
    const onPurchaseMovie = vi
      .fn()
      .mockResolvedValue({ balance: 17, cost: 8 });

    render(
      <StoryImageFinale
        childId="reina"
        childDisplayName="Reina"
        imageUrl="https://example.com/erosion.png"
        loading={false}
        failed={false}
        companionCurrency={25}
        purchaseCost={8}
        onPurchaseMovie={onPurchaseMovie}
        onExit={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Play movie for 8 coins" }));
    });
    expect(onPurchaseMovie).toHaveBeenCalledWith(8);

    await act(async () => {
      vi.advanceTimersByTime(2600);
    });

    expect(screen.getByText("17 coins left")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Watch again" })).not.toBeNull();
  });

  it("provides a clear route back to the map after the story reward", () => {
    const onExit = vi.fn();
    render(
      <StoryImageFinale
        childId="reina"
        childDisplayName="Reina"
        imageUrl="https://example.com/erosion.png"
        loading={false}
        failed={false}
        companionCurrency={25}
        purchaseCost={8}
        onPurchaseMovie={vi.fn().mockResolvedValue({ balance: 17, cost: 8 })}
        onExit={onExit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Back to map" }));

    expect(onExit).toHaveBeenCalled();
  });
});
