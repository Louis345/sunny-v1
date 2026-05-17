import { describe, expect, it } from "vitest";
import { shouldSuppressTranscriptDuringActiveLearningGame } from "./urgentLearningRuntime";

describe("active learning transcript suppression", () => {
  it("lets Spell Check help requests reach Elli", () => {
    expect(
      shouldSuppressTranscriptDuringActiveLearningGame({
        transcript: "What word is it?",
        currentActivityState: {
          game: "spell-check",
          currentWord: "above",
          phase: "spelling",
        },
        currentCanvasState: { mode: "spell-check" },
      }),
    ).toBe(false);
  });

  it("lets product complaints through during active games", () => {
    expect(
      shouldSuppressTranscriptDuringActiveLearningGame({
        transcript: "It didn't say the word.",
        currentActivityState: {
          game: "spell-check",
          currentWord: "above",
          phase: "spelling",
        },
        currentCanvasState: { mode: "spell-check" },
      }),
    ).toBe(false);
  });

  it("does not suppress Spell Check answer noise; Elli gets the board snapshot", () => {
    expect(
      shouldSuppressTranscriptDuringActiveLearningGame({
        transcript: "above above above",
        currentActivityState: {
          game: "spell-check",
          currentWord: "above",
          phase: "spelling",
        },
        currentCanvasState: { mode: "spell-check" },
      }),
    ).toBe(false);
  });

  it("suppresses pronunciation practice speech because it owns the mic flow", () => {
    expect(
      shouldSuppressTranscriptDuringActiveLearningGame({
        transcript: "government government",
        currentActivityState: {
          game: "pronunciation",
          currentWord: "government",
          phase: "listening",
        },
        currentCanvasState: { mode: "pronunciation" },
      }),
    ).toBe(true);
  });

  it("does not suppress Word Radar speech; Elli gets the board snapshot", () => {
    expect(
      shouldSuppressTranscriptDuringActiveLearningGame({
        transcript: "m a c h i n e",
        currentActivityState: {
          game: "word-radar",
          currentWord: "machine",
          phase: "response",
        },
        currentCanvasState: { mode: "word-radar" },
      }),
    ).toBe(false);
  });
});
