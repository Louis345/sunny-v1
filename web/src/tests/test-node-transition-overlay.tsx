import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { useState } from "react";
import { NodeTransitionOverlay } from "../components/NodeTransitionOverlay";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("NodeTransitionOverlay", () => {
  test("renders children when active=false, no overlay", () => {
    render(
      <NodeTransitionOverlay active={false} color="#6D5EF5" onComplete={() => {}}>
        <span>ChildContent</span>
      </NodeTransitionOverlay>,
    );
    expect(screen.queryByText("ChildContent")).not.toBeNull();
    expect(screen.queryByTestId("node-transition-overlay")).toBeNull();
  });

  test("renders children when active=true", () => {
    vi.useFakeTimers();
    render(
      <NodeTransitionOverlay active color="#6D5EF5" duration={500} onComplete={() => {}}>
        <span>ChildContent</span>
      </NodeTransitionOverlay>,
    );
    expect(screen.queryByText("ChildContent")).not.toBeNull();
    expect(screen.queryByTestId("node-transition-overlay")).not.toBeNull();
  });

  test("calls onComplete after duration ms when active=true", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(
      <NodeTransitionOverlay active color="#6D5EF5" duration={400} onComplete={onComplete}>
        <span>x</span>
      </NodeTransitionOverlay>,
    );
    expect(onComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("overlay clears after onComplete fires", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(
      <NodeTransitionOverlay active color="#6D5EF5" duration={300} onComplete={onComplete}>
        <span>x</span>
      </NodeTransitionOverlay>,
    );
    expect(screen.queryByTestId("node-transition-overlay")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onComplete).toHaveBeenCalled();
    expect(screen.queryByTestId("node-transition-overlay")).toBeNull();
  });

  test("no consecutive transition style repeats across 10 activations", () => {
    vi.useFakeTimers();

    function Harness() {
      const [active, setActive] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setActive((a) => !a)}>
            toggle
          </button>
          <NodeTransitionOverlay active={active} color="#000" duration={100} onComplete={() => {}}>
            <span>kid</span>
          </NodeTransitionOverlay>
        </div>
      );
    }

    render(<Harness />);
    const btn = screen.getByRole("button", { name: "toggle" });
    const styles: string[] = [];

    for (let i = 0; i < 10; i++) {
      act(() => {
        btn.click();
      });
      expect(screen.queryByTestId("node-transition-overlay")).not.toBeNull();
      const style = screen
        .getByTestId("node-transition-overlay")
        .getAttribute("data-transition-style");
      expect(style).toBeTruthy();
      styles.push(style!);
      act(() => {
        vi.advanceTimersByTime(100);
      });
      act(() => {
        btn.click();
      });
    }

    for (let i = 1; i < styles.length; i++) {
      expect(styles[i]).not.toBe(styles[i - 1]);
    }
  });
});
