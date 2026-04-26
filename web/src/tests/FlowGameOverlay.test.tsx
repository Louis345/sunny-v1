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

    fireEvent.click(screen.getByTestId("flow-game-back"));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
