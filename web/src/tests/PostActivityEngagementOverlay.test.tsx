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
});
