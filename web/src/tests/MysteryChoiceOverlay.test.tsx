import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NodeConfig } from "../../../src/shared/adventureTypes";
import { MysteryChoiceOverlay } from "../components/MysteryChoiceOverlay";

function mysteryNode(overrides: Partial<NodeConfig> = {}): NodeConfig {
  return {
    id: "n-mystery",
    type: "mystery",
    isLocked: false,
    isCompleted: false,
    isGoal: false,
    difficulty: 2,
    words: ["above", "about"],
    mysteryMode: "choice_lab",
    choiceSetId: "choice-1",
    choiceSource: "child_choice",
    choiceOptions: [
      {
        optionId: "monster",
        activityId: "monster-stampede",
        nodeType: "monster-stampede",
        label: "Monster Stampede",
        purposeLabel: "FAST GAME",
        thumbnailUrl: "/thumbnails/activities/monster-stampede.svg",
        gameFile: "monster-stampede.html",
        activityKind: "learning_activity",
      },
      {
        optionId: "pronunciation",
        activityId: "pronunciation",
        nodeType: "pronunciation",
        label: "Pronunciation",
        purposeLabel: "VOICE CHALLENGE",
        thumbnailUrl: "/thumbnails/activities/pronunciation.svg",
        activityKind: "learning_activity",
      },
      {
        optionId: "quest",
        activityId: "quest",
        nodeType: "quest",
        label: "Custom Quest",
        purposeLabel: "CUSTOM MISSION",
        locked: true,
        lockedReason: "Need a few warm-up rounds first",
        activityKind: "generated_learning",
      },
    ],
    ...overrides,
  };
}

describe("MysteryChoiceOverlay", () => {
  it("renders C3 choice cards and disables locked options", () => {
    const onSelect = vi.fn();
    render(
      <MysteryChoiceOverlay
        node={mysteryNode()}
        open
        previewMode={false}
        onSelect={onSelect}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /FAST GAME .* Monster Stampede/i })).toBeEnabled();
    const locked = screen.getByRole("button", { name: /CUSTOM MISSION .* Custom Quest/i });
    expect(locked).toBeDisabled();
    expect(screen.getByText("THREE DOORS")).toBeInTheDocument();
    expect(screen.getByText("Step through one")).toBeInTheDocument();
    expect(screen.getAllByTestId("mystery-choice-card")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: /VOICE CHALLENGE .* Say it out loud/i }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ optionId: "pronunciation" }),
    );
  });

  it("reveals and auto-selects a surprise option", () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(
      <MysteryChoiceOverlay
        node={mysteryNode({
          mysteryMode: "surprise_drop",
          choiceSource: "system_recommendation",
          surpriseOption: {
            optionId: "asteroid",
            activityId: "asteroid",
            nodeType: "asteroid",
            label: "Asteroids",
            purposeLabel: "SURPRISE GAME",
            thumbnailUrl: "/thumbnails/activities/asteroid.svg",
            gameFile: "asteroid.html",
            activityKind: "dopamine_game",
          },
        })}
        open
        previewMode={false}
        onSelect={onSelect}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText("Asteroids")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1150);
    });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ optionId: "asteroid" }),
    );
    vi.useRealTimers();
  });

  it("shows the full surprise choice set in free preview and waits for a click", () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(
      <MysteryChoiceOverlay
        node={mysteryNode({
          mysteryMode: "surprise_drop",
          choiceSource: "system_recommendation",
          surpriseOption: {
            optionId: "asteroid",
            activityId: "asteroid",
            nodeType: "asteroid",
            label: "Asteroids",
            purposeLabel: "SURPRISE GAME",
            thumbnailUrl: "/thumbnails/activities/asteroid.svg",
            gameFile: "asteroid.html",
            activityKind: "dopamine_game",
          },
        })}
        open
        previewMode="free"
        onSelect={onSelect}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText("THREE DOORS")).toBeInTheDocument();
    expect(screen.getByText("Step through one")).toBeInTheDocument();
    expect(screen.getAllByTestId("mystery-choice-card")).toHaveLength(3);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /FAST GAME .* Monster Stampede/i }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ optionId: "monster" }),
    );
    vi.useRealTimers();
  });

  it("renders Wheel of Fortune as a real choice card instead of the mystery fallback", () => {
    render(
      <MysteryChoiceOverlay
        node={mysteryNode({
          choiceOptions: [
            {
              optionId: "wheel",
              activityId: "wheel-of-fortune",
              nodeType: "wheel-of-fortune",
              label: "Wheel of Fortune",
              purposeLabel: "SPIN REWARD",
              thumbnailUrl: "/thumbnails/activities/wheel-of-fortune.svg",
              gameFile: "WheelOfFortune.html",
              activityKind: "dopamine_game",
            },
          ],
        })}
        open
        previewMode={false}
        onSelect={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /SPIN REWARD .* Wheel of Fortune/i }),
    ).toBeEnabled();
    expect(screen.queryByText("?")).not.toBeInTheDocument();
  });
});
