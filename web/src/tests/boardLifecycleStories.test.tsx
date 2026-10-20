import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PredecessorUnchangedAfterSuccessor,
  SuccessorPreparingWithRealStatus,
  SuccessorPublishedWaitsForNextVisit,
  SupportBoardWithoutQuestOrBoss,
} from "../stories/BoardLifecycle.stories";

describe("immutable board lifecycle stories", () => {
  it("does not add a fake destination after the complete support board", () => {
    const renderStory = SupportBoardWithoutQuestOrBoss.render;
    expect(renderStory).toBeTypeOf("function");

    render(renderStory!({} as never, {} as never));

    expect(
      screen.queryByRole("img", { name: /trail camp/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the predecessor as read-only history once its successor exists", () => {
    render(PredecessorUnchangedAfterSuccessor.render!({} as never, {} as never));
    expect(screen.getByText(/read-only history/i)).toBeInTheDocument();
    expect(screen.queryByText(/quest|boss/i)).not.toBeInTheDocument();
  });

  it("uses the real preparation status between boards without promising encounters", () => {
    const preparing = render(SuccessorPreparingWithRealStatus.render!({} as never, {} as never));
    expect(screen.getByRole("status").textContent).toContain("Sunny is preparing your next adventure");
    expect(screen.getByRole("status").textContent).not.toMatch(/quest|boss/i);
    preparing.unmount();
    render(SuccessorPublishedWaitsForNextVisit.render!({} as never, {} as never));
    expect(screen.getByRole("status").textContent).toContain("Your next adventure is ready for your next visit");
  });
});
