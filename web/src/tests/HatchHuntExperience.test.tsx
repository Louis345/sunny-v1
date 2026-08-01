import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HatchHuntExperience } from "../components/HatchHuntExperience";
import { MOSSBACK_MONSTER } from "../components/capturedMonsterCatalog";
import type { HatchHuntQuestion } from "../components/HatchHuntEngine";

const questions: HatchHuntQuestion[] = [
  {
    id: "guardian",
    prompt: "Which product equals 42?",
    answers: ["6 × 7", "5 × 8", "9 × 4"],
    correctAnswer: "6 × 7",
    difficulty: "guardian",
    seconds: null,
  },
  {
    id: "crack-1",
    prompt: "What is 8 × 7?",
    answers: ["54", "56", "64"],
    correctAnswer: "56",
    difficulty: "stretch",
    seconds: 15,
  },
  {
    id: "crack-2",
    prompt: "What is 9 × 6?",
    answers: ["45", "54", "63"],
    correctAnswer: "54",
    difficulty: "stretch",
    seconds: 12,
  },
  {
    id: "crack-3",
    prompt: "What is 12 × 4?",
    answers: ["44", "46", "48"],
    correctAnswer: "48",
    difficulty: "challenge",
    seconds: 9,
  },
  {
    id: "rescue",
    prompt: "Build 8 × 7 from 7 groups.",
    answers: ["49 + 7", "48 + 7", "42 + 7"],
    correctAnswer: "49 + 7",
    difficulty: "recovery",
    seconds: null,
  },
];

describe("HatchHuntExperience", () => {
  it("lets the child choose an egg and hatch Mossy without native presentation", async () => {
    const onDiscovered = vi.fn();
    const { container } = render(
      <HatchHuntExperience
        encounterId="mossy-test-1"
        childId="ila"
        creature={MOSSBACK_MONSTER}
        questions={questions}
        hatchRevealMs={0}
        onDiscovered={onDiscovered}
      />,
    );

    expect(screen.getAllByRole("button", { name: /choose .* egg/i })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Choose fern egg" }));
    fireEvent.click(screen.getByRole("button", { name: "6 × 7" }));
    expect(screen.getByText("15 seconds")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "56" }));
    fireEvent.click(screen.getByRole("button", { name: "54" }));
    fireEvent.click(screen.getByRole("button", { name: "48" }));

    expect(screen.queryByRole("heading", { name: "Mossy hatched!" })).not.toBeInTheDocument();
    expect(screen.queryByText("What is 12 × 4?")).not.toBeInTheDocument();
    expect(container.querySelector("main[data-phase='hatched']"))
      .toHaveAttribute("data-reveal-visibility", "unobstructed");
    await waitFor(() => expect(onDiscovered).toHaveBeenCalledTimes(1));
    expect(onDiscovered.mock.calls[0]?.[0].discovery).toMatchObject({
      encounterId: "mossy-test-1",
      creatureId: "mossback",
      next: "orb_chase",
    });
  });
});
