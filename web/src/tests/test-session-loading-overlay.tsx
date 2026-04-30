import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { SessionLoadingOverlay } from "../components/SessionLoadingOverlay";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SessionLoadingOverlay", () => {
  it("shows the selected child's avatar and readiness progress", () => {
    render(
      <SessionLoadingOverlay
        childName="Ila"
        avatarImagePath="/__fixtures__/ila-portrait.png"
        accentColor="#2dd4bf"
        accentBg="#ecfeff"
        voiceReady
        mapReady
        assetsReady={false}
      />,
    );

    expect(screen.getByAltText("Ila avatar").getAttribute("src")).toBe(
      "/__fixtures__/ila-portrait.png",
    );
    expect(screen.getByText("67%")).not.toBeNull();
    expect(screen.getByText("Voice is warmed up")).not.toBeNull();
    expect(screen.getByText("Map is ready")).not.toBeNull();
    expect(screen.getByText("Magic images are setting")).not.toBeNull();
  });

  it("lifts the curtain and reports 100 percent when everything is ready", () => {
    render(
      <SessionLoadingOverlay
        childName="Reina"
        avatarImagePath="/__fixtures__/reina-portrait.png"
        accentColor="#f97316"
        accentBg="#fff7ed"
        voiceReady
        mapReady
        assetsReady
      />,
    );

    const overlay = screen.getByTestId("session-loading-overlay");
    expect(overlay.getAttribute("data-ready")).toBe("true");
    expect(screen.getByText("100%")).not.toBeNull();
    expect(screen.getByText("Curtain up!")).not.toBeNull();
  });

  it("falls back to the first initial when no avatar image exists", () => {
    render(
      <SessionLoadingOverlay
        childName="Matilda"
        avatarImagePath={null}
        accentColor="#8b5cf6"
        accentBg="#f5f3ff"
        voiceReady={false}
        mapReady={false}
        assetsReady={false}
      />,
    );

    expect(screen.getByText("M")).not.toBeNull();
    expect(screen.getByText("0%")).not.toBeNull();
  });

  it("logs readiness changes without repeating unchanged states", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { rerender } = render(
      <SessionLoadingOverlay
        childName="Ila"
        avatarImagePath="/__fixtures__/ila-portrait.png"
        accentColor="#2dd4bf"
        accentBg="#ecfeff"
        voiceReady={false}
        mapReady={false}
        assetsReady={false}
      />,
    );
    rerender(
      <SessionLoadingOverlay
        childName="Ila"
        avatarImagePath="/__fixtures__/ila-portrait.png"
        accentColor="#2dd4bf"
        accentBg="#ecfeff"
        voiceReady
        mapReady={false}
        assetsReady={false}
      />,
    );

    expect(log).toHaveBeenCalledWith(
      " 🎮 [loading-screen] readiness 0%",
      expect.objectContaining({ voiceReady: false }),
    );
    expect(log).toHaveBeenCalledWith(
      " 🎮 [loading-screen] readiness 33%",
      expect.objectContaining({ voiceReady: true }),
    );
    log.mockRestore();
  });

  it("cycles stage palettes so the curtain does not stay one-note", () => {
    vi.useFakeTimers();
    render(
      <SessionLoadingOverlay
        childName="Ila"
        avatarImagePath="/__fixtures__/ila-portrait.png"
        accentColor="#2dd4bf"
        accentBg="#ecfeff"
        voiceReady={false}
        mapReady
        assetsReady
        paletteCycleMs={1000}
      />,
    );

    const overlay = screen.getByTestId("session-loading-overlay");
    const first = overlay.getAttribute("data-palette-name");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const second = overlay.getAttribute("data-palette-name");

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });

  it("fires a safety release when a readiness signal stalls", () => {
    vi.useFakeTimers();
    const onSafetyRelease = vi.fn();
    render(
      <SessionLoadingOverlay
        childName="Ila"
        avatarImagePath="/__fixtures__/ila-portrait.png"
        accentColor="#2dd4bf"
        accentBg="#ecfeff"
        voiceReady={false}
        mapReady
        assetsReady
        safetyReleaseMs={3000}
        onSafetyRelease={onSafetyRelease}
      />,
    );

    expect(onSafetyRelease).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onSafetyRelease).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("session-loading-overlay").getAttribute("data-safety-released")).toBe(
      "true",
    );
    expect(screen.getByText("Opening the curtain...")).not.toBeNull();
  });

  it("calls onCurtainOpen once after curtainOpenMs when ready", () => {
    vi.useFakeTimers();
    const onCurtainOpen = vi.fn();
    render(
      <SessionLoadingOverlay
        childName="Ila"
        avatarImagePath="/__fixtures__/ila-portrait.png"
        accentColor="#2dd4bf"
        accentBg="#ecfeff"
        voiceReady
        mapReady
        assetsReady
        onCurtainOpen={onCurtainOpen}
        curtainOpenMs={400}
      />,
    );
    expect(onCurtainOpen).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(onCurtainOpen).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onCurtainOpen).toHaveBeenCalledTimes(1);
  });

  it("does not call onCurtainOpen until ready even after curtainOpenMs", () => {
    vi.useFakeTimers();
    const onCurtainOpen = vi.fn();
    render(
      <SessionLoadingOverlay
        childName="Ila"
        avatarImagePath="/__fixtures__/ila-portrait.png"
        accentColor="#2dd4bf"
        accentBg="#ecfeff"
        voiceReady={false}
        mapReady
        assetsReady
        onCurtainOpen={onCurtainOpen}
        curtainOpenMs={200}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onCurtainOpen).not.toHaveBeenCalled();
  });

  it("fires a hard release after the configured timeout", () => {
    vi.useFakeTimers();
    const onHardRelease = vi.fn();
    render(
      <SessionLoadingOverlay
        childName="Ila"
        avatarImagePath="/__fixtures__/ila-portrait.png"
        accentColor="#2dd4bf"
        accentBg="#ecfeff"
        voiceReady={false}
        mapReady={false}
        assetsReady={false}
        safetyReleaseMs={60_000}
        hardReleaseMs={30_000}
        onHardRelease={onHardRelease}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(onHardRelease).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onHardRelease).toHaveBeenCalledTimes(1);
  });
});
