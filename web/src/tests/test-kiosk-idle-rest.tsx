import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KioskRestingScreen, useKioskIdleRest } from "../components/KioskIdleRest";

describe("kiosk idle rest", () => {
  // Human-caught invariant: the kiosk could look active after being abandoned even when its
  // connection was no longer useful. Session logs only recorded transport events, and the lab
  // missed it because no browser journey advanced a quiet kiosk through a long idle window.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ends an enabled kiosk session after the configured inactivity window", () => {
    const onIdle = vi.fn();
    const { result } = renderHook(() =>
      useKioskIdleRest({ enabled: true, timeoutMs: 1_000, activitySignal: "", onIdle }),
    );

    expect(result.current.resting).toBe(false);
    act(() => vi.advanceTimersByTime(999));
    expect(onIdle).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(result.current.resting).toBe(true);
  });

  it("resets the inactivity window when the child interacts", () => {
    const onIdle = vi.fn();
    renderHook(() =>
      useKioskIdleRest({ enabled: true, timeoutMs: 1_000, activitySignal: "", onIdle }),
    );

    act(() => vi.advanceTimersByTime(700));
    fireEvent.pointerDown(window);
    act(() => vi.advanceTimersByTime(700));
    expect(onIdle).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("counts a new child transcript as activity", () => {
    const onIdle = vi.fn();
    const { rerender } = renderHook(
      ({ activitySignal }) =>
        useKioskIdleRest({ enabled: true, timeoutMs: 1_000, activitySignal, onIdle }),
      { initialProps: { activitySignal: "" } },
    );

    act(() => vi.advanceTimersByTime(700));
    rerender({ activitySignal: "I think it is seven" });
    act(() => vi.advanceTimersByTime(700));
    expect(onIdle).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("does nothing outside an enabled kiosk journey", () => {
    const onIdle = vi.fn();
    renderHook(() =>
      useKioskIdleRest({ enabled: false, timeoutMs: 1_000, activitySignal: "", onIdle }),
    );

    act(() => vi.advanceTimersByTime(5_000));
    expect(onIdle).not.toHaveBeenCalled();
  });

  it("shows a neutral resting screen and starts only after a tap", () => {
    const onStart = vi.fn();
    render(<KioskRestingScreen onStart={onStart} />);

    expect(screen.getByRole("heading", { name: "Sunny is resting" })).not.toBeNull();
    expect(screen.getByText("Your completed work is saved.")).not.toBeNull();
    expect(onStart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start Sunny" }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
