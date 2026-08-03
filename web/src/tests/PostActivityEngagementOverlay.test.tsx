import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PostActivityEngagementOverlay } from "../components/PostActivityEngagementOverlay";

describe("PostActivityEngagementOverlay", () => {
  it("renders completion evidence and emits replay/back actions", () => {
    const onAction = vi.fn();

    render(
      <PostActivityEngagementOverlay
        title="Word Radar"
        outcome={{ completed: true, accuracy: 0.92, activePlayTimeMs: 42_000 }}
        stats={[
          { label: "accuracy", value: "92%" },
          { label: "time", value: "42s" },
        ]}
        canReplay
        onAction={onAction}
      />,
    );

    expect(screen.getByTestId("post-activity-engagement-overlay")).toBeTruthy();
    expect(screen.getByText("Word Radar")).toBeTruthy();
    expect(screen.getByText("92%")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to map" }));

    expect(onAction).toHaveBeenNthCalledWith(1, "replay_same");
    expect(onAction).toHaveBeenNthCalledWith(2, "back_to_map");
  });

  it("only shows harder replay when the activity supports it", () => {
    const onAction = vi.fn();

    const { rerender } = render(
      <PostActivityEngagementOverlay
        title="Quest"
        outcome={{ completed: true, accuracy: 1 }}
        canReplay
        canTryHarder={false}
        onAction={onAction}
      />,
    );

    expect(screen.queryByRole("button", { name: "Harder replay" })).toBeNull();

    rerender(
      <PostActivityEngagementOverlay
        title="Pronunciation"
        outcome={{ completed: true, accuracy: 1 }}
        canReplay
        canTryHarder
        onAction={onAction}
      />,
    );

    expect(screen.getByText("Try harder")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Harder replay" }));
    expect(onAction).toHaveBeenCalledWith("replay_harder");
  });

  it("records a one-tap fun rating or skip", () => {
    vi.useFakeTimers();
    const onFunRating = vi.fn();
    const { rerender } = render(
      <PostActivityEngagementOverlay
        title="Puzzle Vault"
        outcome={{ completed: true, accuracy: 1 }}
        onAction={vi.fn()}
        onFunRating={onFunRating}
      />,
    );

    expect(screen.getByText("How fun was this activity?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4 stars" }));
    vi.advanceTimersByTime(300);
    expect(onFunRating).toHaveBeenCalledWith(4);

    rerender(
      <PostActivityEngagementOverlay
        title="Puzzle Vault"
        outcome={{ completed: true, accuracy: 1 }}
        onAction={vi.fn()}
        onFunRating={onFunRating}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip fun rating" }));
    expect(onFunRating).toHaveBeenLastCalledWith(null);
    vi.useRealTimers();
  });

  it("shows cumulative outlined, hovered, and selected star feedback", () => {
    vi.useFakeTimers();
    const onFunRating = vi.fn();
    render(
      <PostActivityEngagementOverlay
        title="Puzzle Vault"
        outcome={{ completed: true }}
        onAction={vi.fn()}
        onFunRating={onFunRating}
      />,
    );

    const third = screen.getByRole("button", { name: "3 stars" });
    expect(screen.getAllByText("☆")).toHaveLength(5);

    fireEvent.mouseEnter(third);
    expect(screen.getAllByText("★")).toHaveLength(3);
    expect(screen.getAllByText("☆")).toHaveLength(2);

    fireEvent.click(third);
    expect(screen.getAllByText("★")).toHaveLength(3);
    expect(third).toHaveAttribute("aria-pressed", "true");
    vi.advanceTimersByTime(300);
    expect(onFunRating).toHaveBeenCalledWith(3);
    vi.useRealTimers();
  });

  it("shows a confirmed coin award without hover geometry changes", () => {
    render(
      <PostActivityEngagementOverlay
        title="Fraction Run"
        outcome={{ completed: true }}
        coinAward={{ amount: 25, balance: 125 }}
        onAction={vi.fn()}
        onFunRating={vi.fn()}
      />,
    );

    expect(screen.getByText("+25 Sunny Coins")).toBeTruthy();
    expect(screen.getByText("Balance: 125")).toBeTruthy();
    expect(screen.getByRole("button", { name: "5 stars" }).className).not.toContain(
      "scale",
    );
  });
});
