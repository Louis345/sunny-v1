import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  RewardTriggerPanel,
  REWARD_TRIGGER_BUTTON_LABELS,
} from "../components/RewardTriggerPanel";
import { isRewardDiagEnabled } from "../types/rewardDiag";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("RewardTriggerPanel", () => {
  it("renders 6 buttons", () => {
    render(<RewardTriggerPanel childId="ila" />);
    expect(screen.getAllByRole("button")).toHaveLength(6);
  });

  it("does not render when enabled=false", () => {
    const { queryByTestId } = render(
      <RewardTriggerPanel childId="ila" enabled={false} />,
    );
    expect(queryByTestId("reward-trigger-panel")).toBeNull();
  });

  it("each button label matches exported XP labels", () => {
    render(<RewardTriggerPanel childId="ila" />);
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.textContent?.trim() ?? "");
    expect(labels).toEqual([...REWARD_TRIGGER_BUTTON_LABELS]);
  });
});

describe("isRewardDiagEnabled gate (trigger panel)", () => {
  it("when VITE_REWARD_DIAG is false, panel is not mounted like production", () => {
    vi.stubEnv("VITE_REWARD_DIAG", "false");
    expect(isRewardDiagEnabled()).toBe(false);
    const { queryByTestId } = render(
      <>
        {isRewardDiagEnabled() ? (
          <RewardTriggerPanel childId="ila" />
        ) : null}
      </>,
    );
    expect(queryByTestId("reward-trigger-panel")).toBeNull();
  });
});
