import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameSandbox } from "../components/GameSandbox";

const profile = {
  childId: "ila",
  games: {
    "word-radar": {
      unlocked: true,
      sessionCount: 3,
      lastAccuracy: 0.8,
      inputMode: "whole-word",
      speakStyle: "option-a",
      keyboardStyle: "option-c",
      showTimer: true,
      personalBestMetric: "accuracy",
    },
  },
  wordRadar: {
    personalBests: { cat: 1200 },
  },
};

describe("GameSandbox", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders game selector dropdown", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => profile,
    } as Response);
    render(<GameSandbox interimTranscript="" sendMessage={vi.fn()} />);
    expect(await screen.findByLabelText("Game")).toBeTruthy();
  });

  it("renders config controls for word-radar", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => profile,
    } as Response);
    render(<GameSandbox interimTranscript="" sendMessage={vi.fn()} />);
    expect((await screen.findAllByLabelText("inputMode whole-word")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("speakStyle option-a")).toBeTruthy();
    expect(screen.getByLabelText("keyboard option-c")).toBeTruthy();
    expect(screen.getByLabelText("showTimer")).toBeTruthy();
  });

  it("config controls initialize from profile API values", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => profile,
    } as Response);
    render(<GameSandbox interimTranscript="" sendMessage={vi.fn()} />);
    const wholeWord = (await screen.findAllByLabelText("inputMode whole-word"))[0];
    expect(wholeWord).toHaveProperty("checked", true);
  });

  it("Launch button renders WordRadar with sandbox config", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => profile,
    } as Response);
    render(<GameSandbox interimTranscript="" sendMessage={vi.fn()} />);
    await screen.findAllByLabelText("inputMode whole-word");
    fireEvent.click(screen.getByText("Test Word Radar"));
    expect(await screen.findByTestId("word-radar-root")).toBeTruthy();
    await waitFor(
      () => {
        expect(screen.getByTestId("word-radar-timer-readout")).toBeTruthy();
      },
      { timeout: 4000 },
    );
  });

  it("timer seconds field is in the panel and clamps input", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => profile,
    } as Response);
    render(<GameSandbox interimTranscript="" sendMessage={vi.fn()} />);
    const input = await screen.findByLabelText("Timer seconds");
    expect(input).toHaveValue(10);
    fireEvent.change(input, { target: { value: "500" } });
    expect(input).toHaveValue(180);
    fireEvent.change(input, { target: { value: "0" } });
    expect(input).toHaveValue(1);
  });

  it("onComplete dismisses sandbox and logs result", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => profile,
    } as Response);
    render(<GameSandbox interimTranscript="cat" sendMessage={vi.fn()} />);
    await screen.findAllByLabelText("inputMode whole-word");
    fireEvent.click(screen.getByText("Test Word Radar"));
    await act(async () => Promise.resolve());
    await waitFor(() => expect(console.log).toHaveBeenCalled());
  });
});
