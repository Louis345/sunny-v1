import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";


import meta, { RhythmPlayground } from "../stories/Pronunciation.stories";

describe("Pronunciation Storybook rhythm playground", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the rhythm playground with pronunciationConfig mode rhythm", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as typeof HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("no camera")),
      },
    });
    const renderStory = RhythmPlayground.render;
    expect(renderStory).toBeDefined();

    render(
      renderStory?.(
        {
          ...meta.args,
          ...RhythmPlayground.args,
          state: "medium",
          rhythmPreset: "custom",
          durationMs: 5000,
          baseBeatMs: 900,
          minBeatMs: 520,
          rampEveryMs: 1500,
          rampStepMs: 60,
          targetWords: "able, common",
          sfxMode: "scored",
        },
        {} as never,
      ) ?? null,
    );

    expect(screen.getByTestId("pronunciation-rhythm-meter")).toBeTruthy();
    expect(screen.getByTestId("pronunciation-word-card").textContent).toContain("able");
  });
});
