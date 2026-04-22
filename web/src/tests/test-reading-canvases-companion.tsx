import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { KaraokeReadingCanvas } from "../components/KaraokeReadingCanvas";
import { PronunciationGameCanvas } from "../components/PronunciationGameCanvas";

afterEach(() => {
  cleanup();
});

describe("KaraokeReadingCanvas — no companion dock (injection architecture deleted)", () => {
  it("does not render companion dock when no companion prop", () => {
    render(
      <KaraokeReadingCanvas
        words={["a", "b"]}
        interimTranscript=""
        sendMessage={() => {}}
      />,
    );
    expect(screen.queryByTestId("karaoke-companion-dock")).toBeNull();
  });

  it("companion prop is not accepted (omitting it causes no error)", () => {
    // If companion prop was removed, this render should succeed without it.
    expect(() =>
      render(
        <KaraokeReadingCanvas
          words={["a", "b"]}
          interimTranscript=""
          sendMessage={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});

describe("PronunciationGameCanvas — no companion dock (injection architecture deleted)", () => {
  it("does not render companion dock", () => {
    render(
      <PronunciationGameCanvas
        words={["cat"]}
        interimTranscript=""
        sendMessage={() => {}}
      />,
    );
    expect(screen.queryByTestId("pronunciation-companion-dock")).toBeNull();
  });

  it("companion prop is not accepted (omitting it causes no error)", () => {
    expect(() =>
      render(
        <PronunciationGameCanvas
          words={["cat"]}
          interimTranscript=""
          sendMessage={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});

// Suppresses vitest's "no module mock used" warning since we no longer mock CompanionFace.
vi.mock("../components/CompanionFace", () => ({ CompanionFace: () => null }));
