import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KaraokeReadingCanvas } from "../components/KaraokeReadingCanvas";

describe("KaraokeReadingCanvas", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("first word is highlighted on mount", () => {
    render(
      <KaraokeReadingCanvas
        words={["one", "two", "three"]}
        interimTranscript=""
        sendMessage={() => {}}
      />,
    );
    const hi = document.querySelector("[data-highlighted='true']");
    expect(hi).not.toBeNull();
    expect(hi?.textContent).toContain("one");
  });

  it("clicking current word advances to next word", async () => {
    const user = userEvent.setup();
    render(
      <KaraokeReadingCanvas
        words={["a", "b", "c"]}
        interimTranscript=""
        sendMessage={vi.fn()}
      />,
    );
    const hi = document.querySelector("[data-highlighted='true']");
    expect(hi?.textContent).toContain("a");
    await user.click(hi!);
    await waitFor(() => {
      const newHi = document.querySelector("[data-highlighted='true']");
      expect(newHi?.textContent).toContain("b");
    });
  });

  it("pressing Enter through the final highlighted word sends reading complete", async () => {
    const user = userEvent.setup();
    const sendMessage = vi.fn();
    render(
      <KaraokeReadingCanvas
        words={["one", "two", "three"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    for (const expected of ["one", "two", "three"]) {
      const hi = document.querySelector("[data-highlighted='true']");
      expect(hi?.textContent).toContain(expected);
      await user.type(hi as HTMLElement, "{enter}");
    }

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        "reading_progress",
        expect.objectContaining({
          event: "complete",
          wordIndex: 3,
          totalWords: 3,
        }),
      );
    });
  });

  it("preview-only finish button completes the story without reading every word", async () => {
    const user = userEvent.setup();
    const sendMessage = vi.fn();
    render(
      <KaraokeReadingCanvas
        words={["one", "two", "three"]}
        interimTranscript=""
        sendMessage={sendMessage}
        previewFinishEnabled
      />,
    );

    await user.click(screen.getByRole("button", { name: "Finish story preview" }));

    expect(sendMessage).toHaveBeenCalledWith(
      "reading_progress",
      expect.objectContaining({
        event: "complete",
        wordIndex: 3,
        totalWords: 3,
      }),
    );
  });

  it("does not show the finish shortcut outside preview", () => {
    render(
      <KaraokeReadingCanvas
        words={["one", "two", "three"]}
        interimTranscript=""
        sendMessage={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: "Finish story preview" })).toBeNull();
  });

  it("clicking non-current word does not advance wordIndex", async () => {
    const user = userEvent.setup();
    render(
      <KaraokeReadingCanvas
        words={["a", "b", "c"]}
        interimTranscript=""
        sendMessage={vi.fn()}
      />,
    );
    // "a" is current; click "b" (not highlighted)
    await user.click(screen.getByText("b", { exact: true }));
    const hi = document.querySelector("[data-highlighted='true']");
    expect(hi?.textContent).toContain("a");
  });

  it("progress bar reflects reading progress", async () => {
    const sendMsg = vi.fn();
    // Use a stable words ref via rerender
    const { rerender } = render(
      <KaraokeReadingCanvas
        words={["w1", "w2", "w3", "w4"]}
        interimTranscript=""
        sendMessage={sendMsg}
      />,
    );
    const fill = screen.getByTestId("karaoke-progress-fill");
    expect(fill.getAttribute("style")).toContain("width: 0%");

    rerender(
      <KaraokeReadingCanvas
        words={["w1", "w2", "w3", "w4"]}
        interimTranscript="w1"
        sendMessage={sendMsg}
      />,
    );
    await waitFor(() => {
      expect(fill.getAttribute("style")).toContain("width: 25%");
    });
  });

  it("backgroundImageUrl applied to container background", () => {
    const url = "https://example.com/story-bg.jpg";
    render(
      <KaraokeReadingCanvas
        words={["x"]}
        interimTranscript=""
        sendMessage={() => {}}
        backgroundImageUrl={url}
      />,
    );
    const root = screen.getByTestId("karaoke-reading-root");
    expect(root.style.backgroundImage).toContain("example.com");
  });

  it("uses a light reading card when map theme passes a dark card background", () => {
    render(
      <KaraokeReadingCanvas
        words={["Reina", "stepped", "into", "the", "muddy", "training"]}
        interimTranscript=""
        sendMessage={() => {}}
        cardBackground="#0f172a"
      />,
    );

    const card = screen.getByTestId("karaoke-reading-card");
    expect(card.style.background).toBe("rgb(255, 244, 226)");
    expect(screen.getByText("stepped", { exact: true })).toBeTruthy();
  });

  it("renders punctuation from storyText while using words for matching", () => {
    render(
      <KaraokeReadingCanvas
        words={["Reina", "stepped", "into", "the", "valley", "Water", "rushed"]}
        storyText="Reina stepped into the valley. Water rushed."
        interimTranscript=""
        sendMessage={() => {}}
      />,
    );

    expect(screen.getByTestId("karaoke-reading-card").textContent).toContain(
      "valley.",
    );
  });

  it("empty words array renders without crash", () => {
    const { container } = render(
      <KaraokeReadingCanvas
        words={[]}
        interimTranscript=""
        sendMessage={() => {}}
      />,
    );
    expect(container.querySelector("[data-testid='karaoke-reading-root']")).not.toBeNull();
  });

  it("always adds karaoke-active class to document.body on mount", () => {
    const { unmount } = render(
      <KaraokeReadingCanvas
        words={["only"]}
        interimTranscript=""
        sendMessage={() => {}}
      />,
    );
    // The class is managed by useKaraokeReading if needed, or permanently by the component.
    // Since KaraokeReadingCanvas is always a full-screen reading surface, the body class
    // is set unconditionally so CompanionLayer knows to minimize.
    expect(document.body.classList.contains("karaoke-active")).toBe(true);
    unmount();
    expect(document.body.classList.contains("karaoke-active")).toBe(false);
  });

  it("suppresses companion voice turns while karaoke is mounted", () => {
    const sendMessage = vi.fn();
    const { unmount } = render(
      <KaraokeReadingCanvas
        words={["rain", "rushed"]}
        interimTranscript=""
        sendMessage={sendMessage}
        childId="reina"
      />,
    );

    expect(sendMessage).toHaveBeenCalledWith("game_event", {
      event: {
        type: "voice_control",
        voiceEnabled: false,
        payload: {
          game: "karaoke",
          childId: "reina",
        },
        version: "1.0",
      },
    });

    unmount();

    expect(sendMessage).toHaveBeenCalledWith("game_event", {
      event: {
        type: "voice_control",
        voiceEnabled: true,
        payload: {
          game: "karaoke",
          childId: "reina",
        },
        version: "1.0",
      },
    });
  });

  it("emits quiet board context updates while Elli voice turns are suppressed", async () => {
    const sendMessage = vi.fn();
    const { rerender } = render(
      <KaraokeReadingCanvas
        words={["Rain", "rushed"]}
        interimTranscript=""
        sendMessage={sendMessage}
        childId="reina"
      />,
    );

    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "karaoke",
        activity: "story-karaoke",
        childId: "reina",
        currentWord: "Rain",
        expectedWords: ["Rain", "rushed"],
        mode: "reading",
        sttStatus: "listening",
        wordIndex: 0,
        totalWords: 2,
      }),
    );

    rerender(
      <KaraokeReadingCanvas
        words={["Rain", "rushed"]}
        interimTranscript="Rain"
        sendMessage={sendMessage}
        childId="reina"
      />,
    );

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        "game_state_update",
        expect.objectContaining({
          game: "karaoke",
          currentWord: "rushed",
          heardTranscript: "Rain",
          wordIndex: 1,
        }),
      );
    });
  });

  it("shows transcript freshness without requesting game-local microphone audio", async () => {
    vi.useFakeTimers();
    const getUserMedia = vi.fn();
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const sendMessage = vi.fn();
    render(
      <KaraokeReadingCanvas
        words={["rain"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    expect(screen.getByTestId("karaoke-listening-status").textContent).toContain("listening");
    expect(getUserMedia).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(4500);
    });

    expect(screen.getByTestId("karaoke-listening-status").textContent).toContain("reconnecting");
    expect(sendMessage).toHaveBeenCalledWith(
      "game_state_update",
      expect.objectContaining({
        game: "karaoke",
        sttStatus: "reconnecting",
      }),
    );
  });

  it("keeps reading progress when rerender receives the same words in a new array", async () => {
    const user = userEvent.setup();
    const sendMessage = vi.fn();
    const { rerender } = render(
      <KaraokeReadingCanvas
        words={["one", "two", "three"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    await user.click(document.querySelector("[data-highlighted='true']")!);
    await waitFor(() => {
      expect(document.querySelector("[data-highlighted='true']")?.textContent).toContain("two");
    });

    rerender(
      <KaraokeReadingCanvas
        words={["one", "two", "three"]}
        interimTranscript=""
        sendMessage={sendMessage}
      />,
    );

    expect(document.querySelector("[data-highlighted='true']")?.textContent).toContain("two");
  });
});
