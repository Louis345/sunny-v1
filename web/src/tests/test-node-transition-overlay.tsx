import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { useState } from "react";
import {
  NodeTransitionOverlay,
  TRANSITION_PALETTES,
} from "../components/NodeTransitionOverlay";

const EMBER = { from: "#f59e0b", to: "#ef4444" };
const PURPLE = { from: "#6D5EF5", to: "#a78bfa" };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("NodeTransitionOverlay", () => {
  test("renders children when active=false, no overlay", () => {
    render(
      <NodeTransitionOverlay active={false} palette={EMBER} onComplete={() => {}}>
        <span>ChildContent</span>
      </NodeTransitionOverlay>,
    );
    expect(screen.queryByText("ChildContent")).not.toBeNull();
    expect(screen.queryByTestId("node-transition-overlay")).toBeNull();
  });

  test("renders children when active=true", () => {
    vi.useFakeTimers();
    render(
      <NodeTransitionOverlay active palette={PURPLE} duration={500} onComplete={() => {}}>
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
      <NodeTransitionOverlay active palette={EMBER} duration={400} onComplete={onComplete}>
        <span>x</span>
      </NodeTransitionOverlay>,
    );
    expect(onComplete).not.toHaveBeenCalled();
    act(() => {
      // Fallback timer is duration + 400 (see NodeTransitionOverlay); rAF may not run under fake timers.
      vi.advanceTimersByTime(400 + 400);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("overlay clears after onComplete fires", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(
      <NodeTransitionOverlay active palette={EMBER} duration={300} onComplete={onComplete}>
        <span>x</span>
      </NodeTransitionOverlay>,
    );
    expect(screen.queryByTestId("node-transition-overlay")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(300 + 400);
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
          <NodeTransitionOverlay active={active} palette={EMBER} duration={100} onComplete={() => {}}>
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

  test("palette='random' produces no immediate palette repeats across 12 activations", () => {
    vi.useFakeTimers();

    function Harness() {
      const [active, setActive] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setActive((a) => !a)}>
            toggle
          </button>
          <NodeTransitionOverlay active={active} palette="random" duration={100} onComplete={() => {}}>
            <span>kid</span>
          </NodeTransitionOverlay>
        </div>
      );
    }

    render(<Harness />);
    const btn = screen.getByRole("button", { name: "toggle" });
    const froms: string[] = [];

    for (let i = 0; i < 12; i++) {
      act(() => { btn.click(); });
      const el = screen.queryByTestId("node-transition-overlay");
      expect(el).not.toBeNull();
      const from = el!.getAttribute("data-palette-from") ?? "";
      froms.push(from);
      act(() => { vi.advanceTimersByTime(100); });
      act(() => { btn.click(); });
    }

    // No two consecutive activations should use the same --from color.
    for (let i = 1; i < froms.length; i++) {
      expect(froms[i]).not.toBe(froms[i - 1]);
    }
  });

  test("TRANSITION_PALETTES exports 12 entries", () => {
    expect(TRANSITION_PALETTES).toHaveLength(12);
    for (const p of TRANSITION_PALETTES) {
      expect(p.from).toMatch(/^#/);
      expect(p.to).toMatch(/^#/);
    }
  });
});
