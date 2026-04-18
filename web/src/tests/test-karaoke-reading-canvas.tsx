import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KaraokeReadingCanvas } from "../components/KaraokeReadingCanvas";

describe("KaraokeReadingCanvas", () => {
  afterEach(() => {
    cleanup();
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
});
