import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import meta, {
  AimAndLaunchSkill,
  CollectedAnimation,
  type SparkOrbLearningShellStoryArgs,
} from "../stories/SparkOrbLearningShell.stories";
import { playSparkOrbSfx } from "../utils/sparkOrbSfx";

vi.mock("../components/CompanionLayer", () => ({
  CompanionLayer: ({ companion }: { companion: { companionId?: string } | null }) => (
    <div data-testid="mock-companion-layer" data-companion-id={companion?.companionId ?? ""} />
  ),
}));

vi.mock("../utils/sparkOrbSfx", () => ({
  playSparkOrbSfx: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("SparkOrbLearningShell stories", () => {
  it("charges the orb by answering questions before exposing the aim-and-launch mechanic", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const storyArgs: SparkOrbLearningShellStoryArgs = {
      phase: AimAndLaunchSkill.args?.phase ?? meta.args?.phase ?? "idle",
      domain: AimAndLaunchSkill.args?.domain ?? meta.args?.domain ?? "spelling",
      currentTarget: AimAndLaunchSkill.args?.currentTarget ?? meta.args?.currentTarget ?? "word:because",
      lastMoment: AimAndLaunchSkill.args?.lastMoment ?? meta.args?.lastMoment ?? "watching",
      capturePersonality:
        AimAndLaunchSkill.args?.capturePersonality ?? meta.args?.capturePersonality ?? "playful",
    };
    const rendered = AimAndLaunchSkill.render?.(storyArgs, {} as never) as ReactElement;
    render(rendered);

    expect(screen.getByText("Charge 0 / 3")).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 3")).toBeInTheDocument();
    expect(screen.queryByTestId("spark-orb-launch-control")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "because" }));
    expect(screen.getByText("Charge 1 / 3")).toBeInTheDocument();
    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "garden" }));
    expect(screen.getByText("Charge 2 / 3")).toBeInTheDocument();
    expect(screen.getByText("Question 3 of 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "spark" }));
    expect(screen.getByText("Charge 3 / 3")).toBeInTheDocument();
    expect(screen.getByTestId("spark-orb-launch-control")).toHaveAttribute(
      "aria-label",
      "Grab the orb to aim and launch",
    );
    expect(screen.queryByText("Flick up")).not.toBeInTheDocument();
    expect(screen.queryByText("Aim up, then release")).not.toBeInTheDocument();
    expect(vi.mocked(playSparkOrbSfx)).toHaveBeenCalledWith("charge");
    expect(vi.mocked(playSparkOrbSfx)).toHaveBeenCalledWith("ready");
    expect(infoSpy).toHaveBeenCalledWith(
      " 🎮 [storybook:spark-orb-learning] [question-answer] [charge-earned]",
      expect.objectContaining({
        questionIndex: 3,
        chargeCount: 3,
        chargeGoal: 3,
        phase: "ready",
      }),
    );
  });

  it("routes successful Spark Orb captures through the Storybook reward gateway", () => {
    vi.useFakeTimers();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const storyArgs: SparkOrbLearningShellStoryArgs = {
      phase: "ready",
      domain: AimAndLaunchSkill.args?.domain ?? meta.args?.domain ?? "spelling",
      currentTarget: AimAndLaunchSkill.args?.currentTarget ?? meta.args?.currentTarget ?? "word:because",
      lastMoment: "orb_ready",
      capturePersonality:
        AimAndLaunchSkill.args?.capturePersonality ?? meta.args?.capturePersonality ?? "playful",
    };

    render(AimAndLaunchSkill.render?.(storyArgs, {} as never) as ReactElement);

    const launchControl = screen.getByTestId("spark-orb-launch-control");
    fireEvent.pointerDown(launchControl, { clientX: 320, clientY: 620 });
    fireEvent.pointerMove(launchControl, { clientX: 338, clientY: 450 });
    fireEvent.pointerUp(launchControl, { clientX: 338, clientY: 450 });
    act(() => {
      vi.advanceTimersByTime(3650);
    });

    expect(infoSpy).toHaveBeenCalledWith(
      " 🎮 [captured-creature-reward-gateway] [record_capture] [storybook_only]",
      expect.objectContaining({
        type: "captured_creature_reward_recorded",
        mode: "storybook_only",
        childId: "ila",
        creatureId: "lumipuff",
      }),
    );
  });

  it("applies selected monster personality inside the full aim-and-launch story", () => {
    vi.useFakeTimers();
    const storyArgs: SparkOrbLearningShellStoryArgs = {
      phase: "idle",
      domain: "spelling",
      currentTarget: "word:because",
      lastMoment: "watching",
      capturePersonality: "brave",
    };

    render(AimAndLaunchSkill.render?.(storyArgs, {} as never) as ReactElement);

    fireEvent.click(screen.getByRole("button", { name: "because" }));
    fireEvent.click(screen.getByRole("button", { name: "garden" }));
    fireEvent.click(screen.getByRole("button", { name: "spark" }));

    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-capture-personality",
      "brave",
    );

    const launchControl = screen.getByTestId("spark-orb-launch-control");
    fireEvent.pointerDown(launchControl, { clientX: 320, clientY: 620 });
    fireEvent.pointerMove(launchControl, { clientX: 338, clientY: 450 });
    fireEvent.pointerUp(launchControl, { clientX: 338, clientY: 450 });

    act(() => {
      vi.advanceTimersByTime(650);
    });

    expect(screen.getByTestId("spark-orb-creature")).toHaveAttribute(
      "data-personality-reaction",
      "resist",
    );
  });

  it("renders a scrubbed collected animation story for inspecting capture timing", () => {
    expect(meta.argTypes).toHaveProperty("capturePersonality");
    expect(meta.argTypes?.capturePersonality).toMatchObject({
      control: "select",
      options: ["playful", "shy", "brave", "sleepy"],
    });

    const storyArgs = {
      phase: CollectedAnimation.args?.phase ?? meta.args?.phase ?? "ready",
      domain: CollectedAnimation.args?.domain ?? meta.args?.domain ?? "spelling",
      currentTarget: CollectedAnimation.args?.currentTarget ?? meta.args?.currentTarget ?? "word:because",
      lastMoment: CollectedAnimation.args?.lastMoment ?? meta.args?.lastMoment ?? "orb_ready",
      capturePersonality: "sleepy",
    } as SparkOrbLearningShellStoryArgs & { capturePersonality: "sleepy" };
    const rendered = CollectedAnimation.render?.(storyArgs, {} as never) as ReactElement;
    render(rendered);

    const scrubber = screen.getByRole("slider", { name: "Capture animation progress" });
    expect(scrubber).toBeInTheDocument();

    fireEvent.change(scrubber, { target: { value: "45" } });
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-capture-stage",
      "shrinking",
    );
    expect(screen.getByTestId("spark-orb-creature")).toHaveAttribute(
      "data-capture-scrubbed",
      "true",
    );
    expect(Number(screen.getByTestId("spark-orb-creature").getAttribute("data-capture-scale"))).toBeLessThan(0.92);

    fireEvent.change(scrubber, { target: { value: "58" } });
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-capture-stage",
      "shrinking",
    );
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-capture-personality",
      "sleepy",
    );
    expect(screen.getByTestId("spark-orb-creature")).toHaveAttribute(
      "data-personality-reaction",
      "float",
    );

    fireEvent.change(scrubber, { target: { value: "94" } });
    expect(screen.getByRole("dialog", { name: "Lumipuff added to collection" })).toBeInTheDocument();

    fireEvent.change(scrubber, { target: { value: "100" } });
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute("data-flight", "settled");
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-collection-state",
      "settled",
    );
    expect(screen.queryByRole("dialog", { name: "Lumipuff added to collection" })).not.toBeInTheDocument();
    expect(screen.getByTestId("spark-orb")).toHaveAttribute("data-on-ground", "true");
  });
});
