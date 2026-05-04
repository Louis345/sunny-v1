import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RewardDiagOverlay } from "../components/RewardDiagOverlay";
import type { RewardDiagEvent } from "../types/rewardDiag";
import { isRewardDiagEnabled } from "../types/rewardDiag";
import rootPackage from "../../../package.json";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("RewardDiagOverlay", () => {
  it("renders without crashing when events=[]", () => {
    render(<RewardDiagOverlay events={[]} />);
    expect(screen.getByTestId("reward-diag-overlay")).toBeTruthy();
  });

  it("renders without crashing when events has 10 items", () => {
    const base = Date.now();
    const events: RewardDiagEvent[] = Array.from({ length: 10 }, (_, i) => ({
      timestamp: base - i * 100,
      type: "reward",
      payload: { i },
    }));
    render(<RewardDiagOverlay events={events} />);
    expect(screen.getByTestId("reward-diag-overlay")).toBeTruthy();
  });

  it("caps display at 6 items when given 10", () => {
    const base = Date.now();
    const events: RewardDiagEvent[] = Array.from({ length: 10 }, (_, i) => ({
      timestamp: base - i * 100,
      type: "progression",
      payload: { n: i },
    }));
    render(<RewardDiagOverlay events={events} />);
    expect(screen.getAllByTestId("reward-diag-entry")).toHaveLength(6);
  });
});

describe("RewardDiagEvent (type)", () => {
  it("accepts all three type values", () => {
    const a: RewardDiagEvent = {
      timestamp: 1,
      type: "reward",
      payload: { x: 1 },
    };
    const b: RewardDiagEvent = {
      timestamp: 2,
      type: "progression",
      payload: {},
    };
    const c: RewardDiagEvent = {
      timestamp: 3,
      type: "progression_end",
      payload: { done: true },
    };
    expect([a.type, b.type, c.type].join(",")).toBe(
      "reward,progression,progression_end",
    );
  });
});

describe("VITE_REWARD_DIAG gate", () => {
  it("VITE_REWARD_DIAG=false does not mount RewardDiagOverlay (queryByTestId)", () => {
    vi.stubEnv("VITE_REWARD_DIAG", "false");
    expect(isRewardDiagEnabled()).toBe(false);
    const { queryByTestId } = render(
      <>
        {isRewardDiagEnabled() ? <RewardDiagOverlay events={[]} /> : null}
      </>,
    );
    expect(queryByTestId("reward-diag-overlay")).toBeNull();
  });
});

describe("package.json", () => {
  it("uses the canonical sunny:run launcher instead of a dedicated reward-diag script", () => {
    const scripts = (rootPackage as { scripts?: Record<string, string> }).scripts ?? {};
    expect(scripts["sunny:run"]).toContain("src/scripts/sunnyRun.ts");
    expect(scripts["sunny:mode:diag:rewards"]).toBeUndefined();
  });
});
