import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowGameOverlay } from "../components/FlowGameOverlay";

describe("FlowGameOverlay", () => {
  afterEach(() => {
    cleanup();
  });

  it("provides the shared back button for flow-state game overlays", () => {
    const onBack = vi.fn();
    render(
      <FlowGameOverlay onBack={onBack}>
        <div>Game</div>
      </FlowGameOverlay>,
    );

    const backButton = screen.getByTestId("flow-game-back");
    expect(backButton).toHaveClass("top-16");
    expect(backButton).not.toHaveClass("top-3");
    fireEvent.click(backButton);

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
