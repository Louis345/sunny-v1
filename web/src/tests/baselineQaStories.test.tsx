import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BaselineQaHarness,
  IframeInstrumentFrame,
} from "../storybook/BaselineQaHarness";
import { baselineQaFixtures } from "../storybook/baselineQaFixtures";

describe("baseline QA Storybook harness", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders transcript controls and logs simulated events", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    render(
      <BaselineQaHarness
        fixture={baselineQaFixtures["word-radar"].easy}
        transcript=""
        onTranscript={onTranscript}
      >
        <div>Instrument body</div>
      </BaselineQaHarness>,
    );

    expect(screen.getByText("Instrument body")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "say current" }));
    expect(onTranscript).toHaveBeenCalledWith("able");
    expect(screen.getByText(/say_current/)).toBeTruthy();
  });

  it("keeps QA controls above fixed full-screen game canvases", () => {
    render(
      <BaselineQaHarness
        fixture={baselineQaFixtures.pronunciation.support}
        transcript=""
        onTranscript={() => {}}
      >
        <div style={{ position: "fixed", inset: 0, zIndex: 5 }}>Fixed game</div>
      </BaselineQaHarness>,
    );

    const controls = screen.getByLabelText("Baseline QA controls");
    expect(controls.style.position).toBe("relative");
    expect(Number(controls.style.zIndex)).toBeGreaterThan(5);
  });

  it("can drive transcript from live browser speech recognition", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const recognition = {
      continuous: false,
      interimResults: false,
      lang: "",
      start: vi.fn(),
      stop: vi.fn(),
      onresult: null as null | ((event: unknown) => void),
      onerror: null as null | ((event: unknown) => void),
      onend: null as null | (() => void),
    };
    const SpeechRecognition = vi.fn(() => recognition);
    vi.stubGlobal("webkitSpeechRecognition", SpeechRecognition);

    render(
      <BaselineQaHarness
        fixture={baselineQaFixtures.pronunciation.support}
        transcript=""
        onTranscript={onTranscript}
      >
        <div>Pronunciation body</div>
      </BaselineQaHarness>,
    );

    await user.click(screen.getByRole("button", { name: "start live mic" }));
    expect(recognition.start).toHaveBeenCalledTimes(1);

    recognition.onresult?.({
      resultIndex: 0,
      results: [
        {
          isFinal: false,
          0: { transcript: "a bull" },
        },
      ],
    });

    expect(onTranscript).toHaveBeenCalledWith("a bull");
    await waitFor(() => {
      expect(screen.getByText(/live_mic: a bull/)).toBeTruthy();
    });
  });

  it("blocks repeated live mic starts after browser permission denial", async () => {
    const user = userEvent.setup();
    const recognition = {
      continuous: false,
      interimResults: false,
      lang: "",
      start: vi.fn(),
      stop: vi.fn(),
      onresult: null as null | ((event: unknown) => void),
      onerror: null as null | ((event: unknown) => void),
      onend: null as null | (() => void),
    };
    const SpeechRecognition = vi.fn(() => recognition);
    vi.stubGlobal("webkitSpeechRecognition", SpeechRecognition);

    render(
      <BaselineQaHarness
        fixture={baselineQaFixtures.pronunciation.support}
        transcript=""
        onTranscript={() => {}}
      >
        <div>Pronunciation body</div>
      </BaselineQaHarness>,
    );

    const startButton = screen.getByRole("button", { name: "start live mic" });
    await user.click(startButton);
    recognition.onerror?.({ error: "not-allowed" });

    await waitFor(() => {
      expect(screen.getByLabelText("Live mic state").textContent).toBe("blocked");
    });
    expect(screen.getByText(/live_mic_blocked: not-allowed/)).toBeTruthy();
    expect(startButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "stop live mic" })).toBeDisabled();

    await user.click(startButton);
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/live_mic_stop/)).toBeNull();
  });

  it("renders iframe games with Storybook preview URLs", () => {
    render(
      <IframeInstrumentFrame
        activityId="letter-rush"
        state="hard"
        title="Letter Rush"
      />,
    );

    const frame = screen.getByTitle("Letter Rush") as HTMLIFrameElement;
    expect(frame.src).toContain("/games/letter-rush.html?");
    expect(frame.src).toContain("preview=storybook");
    expect(frame.src).toContain("fixtureState=hard");
  });

  it("bridges iframe narration_request events to explicit Storybook local audio", async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak, cancel });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      vi.fn().mockImplementation((text: string) => ({ text })),
    );

    render(
      <BaselineQaHarness
        fixture={baselineQaFixtures["spell-check"].support}
        transcript=""
        onTranscript={() => {}}
      >
        <IframeInstrumentFrame
          activityId="spell-check"
          state="support"
          title="Spell Check"
        />
      </BaselineQaHarness>,
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "narration_request",
          activityId: "spell-check",
          nodeId: "storybook-spell-check-support",
          word: "farmer",
          reason: "repeat_word",
        },
      }),
    );

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: "farmer" }));
    await waitFor(() => {
      expect(screen.getByText(/storybook_audio_bridge: spell-check farmer/)).toBeTruthy();
    });
  });
});
