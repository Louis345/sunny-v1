import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { PronunciationGameCanvas } from "../components/PronunciationGameCanvas";
import { GAME_SFX, GAME_SFX_CONFIG } from "../utils/gameSfx";

describe("PronunciationGameCanvas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as typeof HTMLCanvasElement.prototype.getContext;
    vi.stubGlobal(
      "Audio",
      vi.fn().mockImplementation(() => ({
        volume: 0,
        play: vi.fn().mockResolvedValue(undefined),
      })),
    );
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

  it("dedupes repeated pronunciation targets so one word does not stutter through multiple blocks", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["erosion", "erosion", "rocks"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    expect(screen.getByText("erosion")).toBeTruthy();
    rerender(
      <PronunciationGameCanvas
        words={["erosion", "erosion", "rocks"]}
        interimTranscript="erosion"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByText("rocks")).toBeTruthy();
    rerender(
      <PronunciationGameCanvas
        words={["erosion", "erosion", "rocks"]}
        interimTranscript="Erosion."
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("rocks")).toBeTruthy();
  });

  it("does not send karaoke reading_progress events while scoring pronunciation", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["above"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    rerender(
      <PronunciationGameCanvas
        words={["above"]}
        interimTranscript="above"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendMessage).not.toHaveBeenCalledWith(
      "reading_progress",
      expect.anything(),
    );
  });

  it("emits live game_state_update with the current word and pronunciation outcomes", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["able", "common"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        currentWord: "able",
        wordIndex: 0,
        totalWords: 2,
        phase: "approaching",
      }),
    );

    rerender(
      <PronunciationGameCanvas
        words={["able", "common"]}
        interimTranscript="able"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        currentWord: "able",
        lastOutcome: "hit",
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        currentWord: "common",
        wordIndex: 1,
      }),
    );
  });

  it("shows an immediate support cue when the server sends pronunciation_support", async () => {
    const sendMessage = vi.fn();
    render(
      <PronunciationGameCanvas
        words={["able"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("sunny_pronunciation_support", {
          detail: {
            type: "pronunciation_support",
            word: "able",
            chunked: "a-ble",
            chunks: ["a", "ble"],
            guidance: "long A, then ble",
            mode: "pause",
            durationMs: 7000,
          },
        }),
      );
    });

    expect(screen.getByTestId("pronunciation-support-cue").textContent).toContain("a-ble");
    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "pronunciation",
        phase: "support",
        currentWord: "able",
        supportMode: "pause",
      }),
    );
  });

  it("does not flash a miss for a transient non-target transcript before timeout", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["ago"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    rerender(
      <PronunciationGameCanvas
        words={["ago"]}
        interimTranscript="agallo"
        sendMessage={sendMessage}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(1300);
    });

    expect(sendMessage).not.toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "pronunciation_miss",
        }),
      }),
    );
  });

  it("normalizes concept phrases like wear away into single pronunciation words", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["erosion", "wear away", "rocks"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    expect(screen.getByText("erosion")).toBeTruthy();
    expect(screen.queryByText("wear away")).toBeNull();

    rerender(
      <PronunciationGameCanvas
        words={["erosion", "wear away", "rocks"]}
        interimTranscript="erosion"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByText("wear")).toBeTruthy();
    expect(screen.queryByText("wear away")).toBeNull();
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

  it("speeds up and adds fire effects while heating up", async () => {
    const sendMessage = vi.fn();
    const words = ["alpha", "bravo", "charlie", "delta"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    for (let i = 0; i < 3; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    expect(screen.getByTestId("pronunciation-speed-state").textContent).toContain(
      "1.12x",
    );
    expect(screen.getByTestId("pronunciation-heat-fire")).toBeTruthy();
  });

  it("returns speed and fire effects to normal after a timeout miss", async () => {
    const sendMessage = vi.fn();
    const words = ["alpha", "bravo", "charlie", "delta"];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    for (let i = 0; i < 3; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    expect(screen.getByTestId("pronunciation-heat-fire")).toBeTruthy();
    rerender(
      <PronunciationGameCanvas
        words={words}
        interimTranscript={`${words.slice(0, 3).join(" ")} zzzwrong`}
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId("pronunciation-speed-state").textContent).toContain(
      "1.00x",
    );
    expect(screen.queryByTestId("pronunciation-heat-fire")).toBeNull();
  });

  it("keeps hand-picked arcade combo audio under the pronunciation config", () => {
    expect(GAME_SFX.pronunciation.comboBreaker).toBe(
      "/sfx/pronunciation/combo_breaker.mp3",
    );
    expect(GAME_SFX.pronunciation.onFire).toBe("/sfx/kefla-power-up.mp3");
    expect(GAME_SFX_CONFIG.pronunciation.comboMilestones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minStreak: 5,
          effect: "combo-breaker",
          src: "/sfx/pronunciation/combo_breaker.mp3",
        }),
        expect.objectContaining({
          minStreak: 10,
          effect: "on-fire",
          src: "/sfx/kefla-power-up.mp3",
        }),
      ]),
    );
    expect(GAME_SFX.pronunciation.hitPop).toBe("synth:pronunciation-hit-pop");
    expect(GAME_SFX.pronunciation.missThunk).toBe("synth:pronunciation-miss-thunk");
    expect(GAME_SFX.pronunciation.replayStart).toBe("synth:pronunciation-replay-start");
    expect(GAME_SFX.pronunciation.completeFanfare).toBe(
      "synth:pronunciation-complete-fanfare",
    );
    expect(GAME_SFX.pronunciation.heatUp).toBe("synth:pronunciation-heat-up");
  });

  it("offers replay and harder replay from the completion overlay", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <PronunciationGameCanvas
        words={["alpha"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    rerender(
      <PronunciationGameCanvas
        words={["alpha"]}
        interimTranscript="alpha"
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: /play again/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /harder replay/i })).toBeTruthy();

    act(() => {
      screen.getByRole("button", { name: /harder replay/i }).click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "replay_requested",
          payload: expect.objectContaining({
            game: "pronunciation",
            mode: "hard",
          }),
        }),
      }),
    );
    expect(screen.queryByRole("button", { name: /harder replay/i })).toBeNull();
    expect(screen.getAllByText("alpha").length).toBeGreaterThan(0);
    expect(screen.getByTestId("pronunciation-speed-state").textContent).toContain(
      "1.25x",
    );
  });

  it("harder replay expands into the extended word pool instead of replaying a 5-word teaser", async () => {
    const sendMessage = vi.fn();
    const teaserWords = ["able", "common", "behind", "whole", "easy"];
    const replayWords = [
      ...teaserWords,
      "carefully",
      "remember",
      "vowel",
      "likely",
      "friendly",
    ];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={teaserWords}
        replayWords={replayWords}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    for (let i = 0; i < teaserWords.length; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={teaserWords}
          replayWords={replayWords}
          interimTranscript={teaserWords.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    act(() => {
      screen.getByRole("button", { name: /harder replay/i }).click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "replay_requested",
          payload: expect.objectContaining({
            game: "pronunciation",
            mode: "hard",
            wordCount: replayWords.length,
          }),
        }),
      }),
    );
    expect(screen.getByTestId("pronunciation-progress").textContent).toContain(
      `/ ${replayWords.length}`,
    );
  });

  it("fires combo breaker event and marks the next word as x2 after a huge streak", async () => {
    const sendMessage = vi.fn();
    const words = [
      "alpha",
      "bravo",
      "charlie",
      "delta",
      "echo",
      "foxtrot",
      "golf",
      "hotel",
      "india",
    ];
    const { rerender } = render(
      <PronunciationGameCanvas
        words={words}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    for (let i = 0; i < 8; i += 1) {
      rerender(
        <PronunciationGameCanvas
          words={words}
          interimTranscript={words.slice(0, i + 1).join(" ")}
          sendMessage={sendMessage}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
    }

    expect(sendMessage).toHaveBeenCalledWith(
      "game_event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "combo_breaker",
          payload: expect.objectContaining({
            game: "pronunciation",
            streak: 8,
            bonusWord: "india",
            bonusMultiplier: 2,
            difficulty: "super_hard",
          }),
        }),
      }),
    );
    expect(screen.getByText("COMBO BREAKER! BONUS WORD x2")).toBeTruthy();
    expect(screen.getByTestId("pronunciation-bonus-word")).toBeTruthy();
  });

  it("keeps combo breaker, AI socket event, flame trail, and x2 bonus hooks in the source", async () => {
    const { default: source } = (await import(
      "../components/PronunciationGameCanvas.tsx?raw"
    )) as { default: string };

    expect(source).toContain("COMBO_BREAKER_STREAK");
    expect(source).toContain("playGameSfx(\"pronunciation\", \"comboBreaker\")");
    expect(source).toContain("playPronunciationMilestoneSfx");
    expect(source).toContain("playGameSfx(\"pronunciation\", \"hitPop\")");
    expect(source).toContain("playGameSfx(\"pronunciation\", \"missThunk\")");
    expect(source).toContain("playGameSfx(\"pronunciation\", \"replayStart\")");
    expect(source).toContain("playGameSfx(\"pronunciation\", \"completeFanfare\")");
    expect(source).toContain("type: \"combo_breaker\"");
    expect(source).toContain("data-testid=\"pronunciation-bonus-word\"");
    expect(source).toContain("BONUS WORD x2");
    expect(source).toContain("@keyframes pg-flame-trail");
  });
});
