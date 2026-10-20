import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CompanionCommand } from "../../../src/shared/companions/companionContract";
import { LEVEL_REWARD_QUEUE } from "../../../src/shared/levelRewardCatalog";
import { LevelPathExperience } from "../components/LevelPathExperience";

const progression = {
  childId: "reina",
  level: 3,
  currentXP: 45,
  xpToNextLevel: 55,
  totalXP: 245,
  wordsMastered: 8,
  totalWords: 12,
  streakRecord: 2,
  recentTrend: "stable" as const,
};

function showLevelPathCommand(timestamp: number, childId = "reina"): CompanionCommand {
  return {
    apiVersion: "1.0",
    type: "show_level_path",
    payload: {},
    childId,
    timestamp,
    source: "claude",
  };
}

describe("LevelPathExperience", () => {
  it("opens the same visible level queue from the level badge", () => {
    render(
      <LevelPathExperience
        childId="reina"
        progression={progression}
        companionCommands={[]}
        showTrigger
      />,
    );

    expect(screen.queryByRole("dialog", { name: /level path/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /level 3/i }));

    expect(screen.getByRole("dialog", { name: /level path/i })).toBeVisible();
    expect(screen.getByText("45 / 100 XP")).toBeVisible();
    expect(screen.getAllByTestId("level-reward-row")).toHaveLength(LEVEL_REWARD_QUEUE.length);
    expect(screen.getByText("Reward placeholder 4")).toBeVisible();
    expect(screen.getByText("Next reward")).toBeVisible();
  });

  it("shows guaranteed level rewards but never reveals mystery-drop contents", () => {
    render(
      <LevelPathExperience
        childId="reina"
        progression={progression}
        companionCommands={[]}
        initiallyOpen
      />,
    );

    expect(screen.getByText("Reward placeholder 8")).toBeVisible();
    expect(screen.queryByText("Comet Cape")).not.toBeInTheDocument();
    expect(screen.queryByText(/mystery drop odds/i)).not.toBeInTheDocument();
  });

  it("lets Elli open the modal through one validated command without a phrase matcher", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const first = showLevelPathCommand(100);
    const { rerender } = render(
      <LevelPathExperience
        childId="reina"
        progression={progression}
        companionCommands={[]}
      />,
    );

    rerender(
      <LevelPathExperience
        childId="reina"
        progression={progression}
        companionCommands={[first]}
      />,
    );
    expect(screen.getByRole("dialog", { name: /level path/i })).toBeVisible();
    expect(info).toHaveBeenCalledWith(
      " 🎮 [level-path] [open] [companion-command] child=reina level=3",
    );

    fireEvent.click(screen.getByRole("button", { name: /close level path/i }));
    rerender(
      <LevelPathExperience
        childId="reina"
        progression={progression}
        companionCommands={[first]}
      />,
    );
    expect(screen.queryByRole("dialog", { name: /level path/i })).not.toBeInTheDocument();

    rerender(
      <LevelPathExperience
        childId="reina"
        progression={progression}
        companionCommands={[first, showLevelPathCommand(101)]}
      />,
    );
    expect(screen.getByRole("dialog", { name: /level path/i })).toBeVisible();
  });

  it("ignores commands for another child and closes with Escape", () => {
    const { rerender } = render(
      <LevelPathExperience
        childId="reina"
        progression={progression}
        companionCommands={[showLevelPathCommand(100, "ila")]}
      />,
    );

    expect(screen.queryByRole("dialog", { name: /level path/i })).not.toBeInTheDocument();
    rerender(
      <LevelPathExperience
        childId="reina"
        progression={progression}
        companionCommands={[showLevelPathCommand(100, "ila"), showLevelPathCommand(101)]}
      />,
    );
    expect(screen.getByRole("dialog", { name: /level path/i })).toBeVisible();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /level path/i })).not.toBeInTheDocument();
  });

  it("closes and forgets processed commands when the active child changes", () => {
    const reinaCommand = showLevelPathCommand(200, "reina");
    const { rerender } = render(
      <LevelPathExperience
        childId="reina"
        progression={progression}
        companionCommands={[reinaCommand]}
      />,
    );
    expect(screen.getByRole("dialog", { name: /level path/i })).toBeVisible();

    rerender(
      <LevelPathExperience
        childId="ila"
        progression={null}
        companionCommands={[reinaCommand]}
      />,
    );
    expect(screen.queryByRole("dialog", { name: /level path/i })).not.toBeInTheDocument();

    rerender(
      <LevelPathExperience
        childId="ila"
        progression={{ ...progression, childId: "ila" }}
        companionCommands={[reinaCommand]}
      />,
    );
    expect(screen.queryByRole("dialog", { name: /level path/i })).not.toBeInTheDocument();
  });
});
