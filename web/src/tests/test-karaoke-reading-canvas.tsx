import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KaraokeReadingCanvas } from "../components/KaraokeReadingCanvas";

describe("KaraokeReadingCanvas", () => {
  afterEach(() => {
    document.body.classList.remove("karaoke-active");
    cleanup();
  });

  it("word at wordIndex has data-highlighted attribute", () => {
    render(
      <KaraokeReadingCanvas
        words={["one", "two", "three"]}
        wordIndex={1}
        onSkipWord={() => {}}
        companionMinimized={false}
      />,
    );
    const hi = document.querySelector("[data-highlighted='true']");
    expect(hi).not.toBeNull();
    expect(hi?.textContent).toContain("two");
  });

  it("clicking word at wordIndex calls onSkipWord with that index", async () => {
    const user = userEvent.setup();
    const onSkipWord = vi.fn();
    render(
      <KaraokeReadingCanvas
        words={["a", "b", "c"]}
        wordIndex={1}
        onSkipWord={onSkipWord}
        companionMinimized={false}
      />,
    );
    const hi = document.querySelector("[data-highlighted='true']");
    expect(hi).not.toBeNull();
    await user.click(hi!);
    expect(onSkipWord).toHaveBeenCalledTimes(1);
    expect(onSkipWord).toHaveBeenCalledWith(1);
  });

  it("clicking non-current word does not call onSkipWord", async () => {
    const user = userEvent.setup();
    const onSkipWord = vi.fn();
    render(
      <KaraokeReadingCanvas
        words={["a", "b", "c"]}
        wordIndex={1}
        onSkipWord={onSkipWord}
        companionMinimized={false}
      />,
    );
    await user.click(screen.getByText("a", { exact: true }));
    expect(onSkipWord).not.toHaveBeenCalled();
  });

  it("progress bar reflects wordIndex / words.length ratio", () => {
    render(
      <KaraokeReadingCanvas
        words={["w1", "w2", "w3", "w4"]}
        wordIndex={2}
        onSkipWord={() => {}}
        companionMinimized={false}
      />,
    );
    const fill = screen.getByTestId("karaoke-progress-fill");
    expect(fill.getAttribute("style")).toContain("width: 50%");
  });

  it("backgroundImageUrl applied to container background", () => {
    const url = "https://example.com/story-bg.jpg";
    render(
      <KaraokeReadingCanvas
        words={["x"]}
        wordIndex={0}
        onSkipWord={() => {}}
        backgroundImageUrl={url}
        companionMinimized={false}
      />,
    );
    const root = screen.getByTestId("karaoke-reading-root");
    expect(root.style.backgroundImage).toContain("example.com");
  });

  it("empty words array renders without crash", () => {
    const { container } = render(
      <KaraokeReadingCanvas
        words={[]}
        wordIndex={0}
        onSkipWord={() => {}}
        companionMinimized={false}
      />,
    );
    expect(container.querySelector("[data-testid='karaoke-reading-root']")).not.toBeNull();
  });

  it("companionMinimized adds karaoke-active class to document.body", () => {
    const { unmount } = render(
      <KaraokeReadingCanvas
        words={["only"]}
        wordIndex={0}
        onSkipWord={() => {}}
        companionMinimized
      />,
    );
    expect(document.body.classList.contains("karaoke-active")).toBe(true);
    unmount();
    expect(document.body.classList.contains("karaoke-active")).toBe(false);
  });
});
