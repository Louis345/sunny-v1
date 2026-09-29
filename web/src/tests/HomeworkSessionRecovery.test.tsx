import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { HomeworkSessionRecovery } from "../components/HomeworkSessionRecovery";

describe("homework connection recovery", () => {
  it("shows a clear recovery action instead of a dead homework board", () => {
    const onRetry = vi.fn();
    render(<HomeworkSessionRecovery error="Connection lost after three reconnect attempts" onRetry={onRetry} />);

    expect(screen.getByRole("heading", { name: /sunny lost the connection/i })).toBeVisible();
    expect(screen.getByText(/your work is safe/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("routes fatal homework failures to recovery before rendering the board", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const fatalBranch = source.indexOf("homeworkBoardMode && state.errorFatal");
    const boardBranch = source.indexOf("else if (homeworkBoardMode)");

    expect(fatalBranch).toBeGreaterThan(-1);
    expect(boardBranch).toBeGreaterThan(fatalBranch);
    expect(source).toContain("<HomeworkSessionRecovery");
  });
});
