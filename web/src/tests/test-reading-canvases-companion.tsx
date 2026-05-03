import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { KaraokeReadingCanvas } from "../components/KaraokeReadingCanvas";
import { PronunciationGameCanvas } from "../components/PronunciationGameCanvas";

afterEach(() => {
  cleanup();
});

describe("KaraokeReadingCanvas — optional embedded portrait (Word Radar pattern)", () => {
  it("does not render companion portrait stack when companion is omitted", () => {
    render(
      <KaraokeReadingCanvas
        words={["a", "b"]}
        interimTranscript=""
        sendMessage={() => {}}
      />,
    );
    expect(screen.queryByTestId("companion-portrait-stack")).toBeNull();
  });

  it("renders without error when companion props omitted", () => {
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

  it("does not mount its own companion portrait even when companion props are provided", () => {
    render(
      <KaraokeReadingCanvas
        words={["a", "b"]}
        interimTranscript=""
        sendMessage={() => {}}
        childId="reina"
        companion={{
          companionId: "matilda",
          vrmUrl: "/companions/matilda.vrm",
          expressions: {},
          faceCamera: { position: [0, 1, 2], target: [0, 1, 0] },
          dopamineGames: [],
          sensitivity: {
            session_start: 1,
            correct_answer: 1,
            wrong_answer: 1,
            mastery_unlock: 1,
            session_complete: 1,
            session_end: 1,
            idle_too_long: 1,
          },
          idleFrequency_ms: 1000,
          randomMomentProbability: 0,
          toggledOff: false,
        }}
      />,
    );
    expect(screen.queryByTestId("companion-portrait-stack")).toBeNull();
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
