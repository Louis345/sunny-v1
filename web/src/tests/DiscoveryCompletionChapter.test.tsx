import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiscoveryCompletionChapter } from "../components/DiscoveryCompletionChapter";

describe("DiscoveryCompletionChapter", () => {
  it("closes the evaluation as a finished chapter without exposing build progress", () => {
    const onFinish = vi.fn();

    render(<DiscoveryCompletionChapter onFinish={onFinish} />);

    expect(screen.getByRole("heading", { name: "You did the check!" })).toBeVisible();
    expect(screen.getByText("Sunny will make your practice board for next time.")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /check progress/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Finish for now" }));
    fireEvent.click(screen.getByRole("button", { name: "Finishing…" }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("tells a rehearsal user that nothing was saved", () => {
    render(<DiscoveryCompletionChapter preview onFinish={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Preview complete" })).toBeVisible();
    expect(screen.getByText("No child learning evidence was saved.")).toBeVisible();
  });
});
