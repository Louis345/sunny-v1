import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { PronunciationGameCanvas } from "../components/PronunciationGameCanvas";

describe("PronunciationGameCanvas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as typeof HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("no camera")),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows one immediate target word instead of waiting for belt spawn", () => {
    render(
      <PronunciationGameCanvas
        words={["hamburger", "corner"]}
        interimTranscript=""
        sendMessage={vi.fn()}
      />,
    );

    expect(screen.getByText("hamburger")).toBeTruthy();
    expect(screen.queryByText("corner")).toBeNull();
  });

  it("keeps the heard word visible briefly when interim transcript clears", () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["hamburger"]}
        interimTranscript="hamburger"
        sendMessage={sendMessage}
      />,
    );

    expect(
      screen.getByText((_, element) => element?.textContent === "heard: hamburger"),
    ).toBeTruthy();

    rerender(
      <PronunciationGameCanvas
        words={["hamburger"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    expect(
      screen.getByText((_, element) => element?.textContent === "heard: hamburger"),
    ).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(
      screen.getByText((_, element) => element?.textContent === "heard: —"),
    ).toBeTruthy();
  });

  it("keeps the comic hit and miss effect hooks in the rendered CSS", () => {
    render(
      <PronunciationGameCanvas
        words={["hamburger"]}
        interimTranscript=""
        sendMessage={vi.fn()}
      />,
    );

    const css = Array.from(document.querySelectorAll("style"))
      .map((el) => el.textContent ?? "")
      .join("\n");

    expect(css).toContain("@keyframes pg-ring-expand");
    expect(css).toContain("@keyframes pg-hit-pass");
    expect(css).toContain("@keyframes pg-miss-shatter");
    expect(css).toContain("@keyframes pg-miss-stamp");
  });
});
