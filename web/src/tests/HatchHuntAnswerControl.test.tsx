import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HatchHuntAnswerControl } from "../components/HatchHuntAnswerControl";

describe("HatchHuntAnswerControl", () => {
  it.each([
    ["numeric" as const, "42", "Your number"],
    ["text" as const, "because", "Your answer"],
  ])("captures a hidden %s response without revealing the answer", (mode, answer, label) => {
    const onAnswer = vi.fn();
    render(<HatchHuntAnswerControl mode={mode} answers={[]} onAnswer={onAnswer} />);
    fireEvent.change(screen.getByLabelText(label), { target: { value: answer } });
    fireEvent.click(screen.getByRole("button", { name: "Lock it in" }));
    expect(onAnswer).toHaveBeenCalledWith(answer);
    expect(screen.queryByText(`Correct answer: ${answer}`)).toBeNull();
  });
});
