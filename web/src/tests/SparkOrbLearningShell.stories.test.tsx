import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import meta, {
  AimAndLaunchSkill,
  CollectedAnimation,
  type SparkOrbLearningShellStoryArgs,
} from "../stories/SparkOrbLearningShell.stories";

vi.mock("../components/CompanionLayer", () => ({
  CompanionLayer: ({ companion }: { companion: { companionId?: string } | null }) => (
    <div data-testid="mock-companion-layer" data-companion-id={companion?.companionId ?? ""} />
  ),
}));

describe("SparkOrbLearningShell stories", () => {
  it("exposes the aim-and-launch skill story as the primary launch mechanic", () => {
    const storyArgs: SparkOrbLearningShellStoryArgs = {
      phase: AimAndLaunchSkill.args?.phase ?? meta.args?.phase ?? "ready",
      domain: AimAndLaunchSkill.args?.domain ?? meta.args?.domain ?? "spelling",
      currentTarget: AimAndLaunchSkill.args?.currentTarget ?? meta.args?.currentTarget ?? "word:because",
      lastMoment: AimAndLaunchSkill.args?.lastMoment ?? meta.args?.lastMoment ?? "orb_ready",
    };
    const rendered = AimAndLaunchSkill.render?.(storyArgs, {} as never) as ReactElement;
    render(rendered);

    expect(screen.getByTestId("spark-orb-launch-control")).toHaveAttribute(
      "aria-label",
      "Grab the orb to aim and launch",
    );
    expect(screen.queryByText("Flick up")).not.toBeInTheDocument();
    expect(screen.queryByText("Aim up, then release")).not.toBeInTheDocument();
  });

  it("renders a scrubbed collected animation story for inspecting capture timing", () => {
    const storyArgs: SparkOrbLearningShellStoryArgs = {
      phase: CollectedAnimation.args?.phase ?? meta.args?.phase ?? "ready",
      domain: CollectedAnimation.args?.domain ?? meta.args?.domain ?? "spelling",
      currentTarget: CollectedAnimation.args?.currentTarget ?? meta.args?.currentTarget ?? "word:because",
      lastMoment: CollectedAnimation.args?.lastMoment ?? meta.args?.lastMoment ?? "orb_ready",
    };
    const rendered = CollectedAnimation.render?.(storyArgs, {} as never) as ReactElement;
    render(rendered);

    const scrubber = screen.getByRole("slider", { name: "Capture animation progress" });
    expect(scrubber).toBeInTheDocument();

    fireEvent.change(scrubber, { target: { value: "58" } });
    expect(screen.getByTestId("spark-orb-encounter")).toHaveAttribute(
      "data-capture-stage",
      "shrinking",
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
