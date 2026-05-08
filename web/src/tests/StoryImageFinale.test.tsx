import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("generates a real movie before spending coins", async () => {
    const onGenerateMovie = vi.fn().mockResolvedValue("https://example.com/erosion.mp4");
    const onPurchaseMovie = vi.fn().mockResolvedValue({ balance: 17, cost: 8 });
    render(
      <StoryImageFinale
        childId="reina"
        childDisplayName="Reina"
        imageUrl="https://example.com/erosion.png"
        loading={false}
        failed={false}
        companionCurrency={25}
        purchaseCost={8}
        onGenerateMovie={onGenerateMovie}
        onPurchaseMovie={onPurchaseMovie}
        onExit={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Play movie for 8 coins" }));
    });

    expect(onGenerateMovie).toHaveBeenCalledWith("https://example.com/erosion.png");
    await waitFor(() => {
      expect(screen.getByTestId("story-movie-video")).not.toBeNull();
    });
    expect(onPurchaseMovie).toHaveBeenCalledWith(8);
    expect(screen.getByTestId("story-movie-video").getAttribute("src")).toBe(
      "https://example.com/erosion.mp4",
    );
  });

  it("subtracts coins through purchase, then unlocks in-session replay", async () => {
    vi.useFakeTimers();
    const onGenerateMovie = vi.fn().mockResolvedValue("https://example.com/erosion.mp4");
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
        onGenerateMovie={onGenerateMovie}
        onPurchaseMovie={onPurchaseMovie}
        onExit={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Play movie for 8 coins" }));
    });
    expect(onGenerateMovie).toHaveBeenCalled();
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
