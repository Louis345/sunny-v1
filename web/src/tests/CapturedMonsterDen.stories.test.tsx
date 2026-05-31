import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CaptureToDenHandoff,
  type CapturedMonsterDenStoryArgs,
} from "../stories/CapturedMonsterDen.stories";

describe("Captured monster den stories", () => {
  it("renders the capture-to-den handoff story", () => {
    const args: CapturedMonsterDenStoryArgs = {
      nickname: "Lumi",
      mood: "curious",
      bond: 18,
    };

    render(CaptureToDenHandoff.render?.(args, {} as never));

    expect(screen.getByRole("dialog", { name: "Lumipuff captured" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Visit Den" }));
    expect(screen.getByTestId("monster-den-preview")).toBeInTheDocument();
    expect(screen.getByText("Lumi's den")).toBeInTheDocument();
  });
});
