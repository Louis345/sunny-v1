import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowGameOverlay } from "../components/FlowGameOverlay";
import { PostActivityEngagementOverlay } from "../components/PostActivityEngagementOverlay";

describe("FlowGameOverlay", () => {
  afterEach(() => {
    cleanup();
  });

  it("provides one exit when the result surface owns navigation, and restores the game exit afterward", () => {
    const onBack = vi.fn();
    const onAction = vi.fn();
    const { rerender } = render(
      <FlowGameOverlay onBack={onBack} backLabel="Back to map" completionNavigation={{completed:true,ownsBack:true}}>
        <PostActivityEngagementOverlay title="Word Radar" outcome={{completed:true}} onAction={onAction} />
      </FlowGameOverlay>,
    );
    expect(screen.getAllByRole("button", {name:"Back to map"})).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", {name:"Back to map"}));
    expect(onAction).toHaveBeenCalledWith("back_to_map");
    expect(onBack).not.toHaveBeenCalled();
    rerender(<FlowGameOverlay onBack={onBack} backLabel="Back to map"><div>Game</div></FlowGameOverlay>);
    fireEvent.click(screen.getByRole("button", {name:"Back to map"}));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("retains the exit when a failed Discovery save offers no result action", () => {
    const onBack = vi.fn();
    render(
      <FlowGameOverlay onBack={onBack} backLabel="Leave Discovery" completionNavigation={{completed:false,ownsBack:false}}>
        <PostActivityEngagementOverlay title="Try leaving again" outcome={{completed:false}} canReplay={false} showBackAction={false} onAction={vi.fn()} />
      </FlowGameOverlay>,
    );
    fireEvent.click(screen.getByRole("button", {name:"Leave Discovery"}));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", {name:"Back to map"})).not.toBeInTheDocument();
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
