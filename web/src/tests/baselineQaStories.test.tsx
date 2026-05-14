import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BaselineQaHarness,
  IframeInstrumentFrame,
} from "../storybook/BaselineQaHarness";
import { baselineQaFixtures } from "../storybook/baselineQaFixtures";

describe("baseline QA Storybook harness", () => {
  it("renders transcript controls and logs simulated events", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    render(
      <BaselineQaHarness
        fixture={baselineQaFixtures["word-radar"].easy}
        transcript=""
        onTranscript={onTranscript}
      >
        <div>Instrument body</div>
      </BaselineQaHarness>,
    );

    expect(screen.getByText("Instrument body")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "say current" }));
    expect(onTranscript).toHaveBeenCalledWith("able");
    expect(screen.getByText(/say_current/)).toBeTruthy();
  });

  it("renders iframe games with Storybook preview URLs", () => {
    render(
      <IframeInstrumentFrame
        activityId="letter-rush"
        state="hard"
        title="Letter Rush"
      />,
    );

    const frame = screen.getByTitle("Letter Rush") as HTMLIFrameElement;
    expect(frame.src).toContain("/games/letter-rush.html?");
    expect(frame.src).toContain("preview=storybook");
    expect(frame.src).toContain("fixtureState=hard");
  });
});
