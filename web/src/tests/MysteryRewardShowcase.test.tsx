import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MysteryRewardShowcase } from "../components/MysteryRewardShowcase";

const reward = {
  id: "comet-cape",
  name: "Comet Cape",
  imageSrc: "/rewards/comet-cape.png",
  kind: "companion_cosmetic" as const,
};

describe("MysteryRewardShowcase", () => {
  it("keeps the reward hidden until the child opens the treasure", () => {
    render(
      <MysteryRewardShowcase
        level={7}
        currentXp={700}
        earnedXp={100}
        xpToNextLevel={800}
        reward={reward}
      />,
    );

    expect(screen.getByTestId("mystery-reward-showcase")).toHaveAttribute("data-reward-phase", "xp");
    expect(screen.getByText("+100 XP")).toBeInTheDocument();
    expect(screen.queryByText("Comet Cape")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Comet Cape" })).not.toBeInTheDocument();
    expect(document.querySelector('[src="/rewards/comet-cape.png"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Claim treasure" }));
    expect(screen.getByTestId("mystery-reward-showcase")).toHaveAttribute("data-reward-phase", "treasure");
    expect(screen.queryByText("Comet Cape")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Comet Cape" })).not.toBeInTheDocument();
    expect(document.querySelector('[src="/rewards/comet-cape.png"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByTestId("mystery-reward-showcase")).toHaveAttribute("data-reward-phase", "reveal");
    expect(screen.getByText("Comet Cape")).toBeInTheDocument();
  });

  it("offers one clear reward decision and reports it exactly once", () => {
    const onRewardDecision = vi.fn();
    render(
      <MysteryRewardShowcase
        level={7}
        currentXp={700}
        earnedXp={100}
        xpToNextLevel={800}
        reward={reward}
        initialPhase="reveal"
        onRewardDecision={onRewardDecision}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Equip" }));
    fireEvent.click(screen.getByRole("button", { name: "Equip" }));

    expect(onRewardDecision).toHaveBeenCalledTimes(1);
    expect(onRewardDecision).toHaveBeenCalledWith({ action: "equip", rewardId: "comet-cape" });
  });

  it("commits only the first decision when save and equip compete", () => {
    const onRewardDecision = vi.fn();
    render(
      <MysteryRewardShowcase
        level={7}
        currentXp={700}
        earnedXp={100}
        xpToNextLevel={800}
        reward={reward}
        initialPhase="reveal"
        onRewardDecision={onRewardDecision}
      />,
    );

    const save = screen.getByRole("button", { name: "Save for later" });
    const equip = screen.getByRole("button", { name: "Equip" });
    fireEvent.click(save);
    fireEvent.click(equip);
    fireEvent.click(save);

    expect(onRewardDecision).toHaveBeenCalledTimes(1);
    expect(onRewardDecision).toHaveBeenCalledWith({ action: "save", rewardId: "comet-cape" });
  });
});
