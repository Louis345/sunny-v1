import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CaptureToDenHandoff,
  type CapturedMonsterDenStoryArgs,
} from "../stories/CapturedMonsterDen.stories";

describe("Captured monster den stories", () => {
  it("renders the capture-to-den handoff story", async () => {
    const args: CapturedMonsterDenStoryArgs = {
      nickname: "Lumi",
      mood: "curious",
      bond: 18,
    };

    render(CaptureToDenHandoff.render?.(args, {} as never));

    expect(screen.getByTestId("captured-monster-handoff")).toHaveAttribute(
      "data-reward-record-id",
      "ila:lumipuff:2026-05-30T17:00:00.000Z",
    );
    await waitFor(() => {
      expect(screen.getByTestId("captured-monster-handoff")).toHaveAttribute(
        "data-inventory-count",
        "1",
      );
    });
    expect(screen.getByRole("dialog", { name: "Lumipuff captured" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Visit Den" }));
    expect(screen.getByTestId("monster-den-preview")).toBeInTheDocument();
    expect(screen.getByText("Lumi's den")).toBeInTheDocument();
  });
});
