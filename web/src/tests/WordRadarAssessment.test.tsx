import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWordRadar, WORD_RADAR_FEEDBACK_MS } from "../hooks/useWordRadar";
import { WordRadar } from "../components/WordRadar";

describe("Word Radar independent assessment mode", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  const items = [{ itemId: "i1", display: "night", acceptedResponses: ["night"] }, { itemId: "i2", display: "light", acceptedResponses: ["light"] }];
  const setup = () => renderHook(() => useWordRadar({ items, interimTranscript: "", inputMode: "keyboard", showKeyboard: true, assessmentMode: true, personalBests: {}, onFinish: vi.fn() }));

  it("never enters the answer-flash phase and requires an explicit submission", () => {
    const { result } = setup();
    expect(result.current.phase).toBe("response");
    act(() => result.current.setTypedBuffer("night"));
    expect(result.current.phase).toBe("response");
    expect(result.current.rawResults).toHaveLength(0);
    act(() => result.current.submitAssessment());
    expect(result.current.rawResults[0].typedResponse).toBe("night");
    act(() => vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS));
    expect(result.current.itemIndex).toBe(1);
    expect(result.current.phase).toBe("response");
  });

  it("accepts wrong-length responses without clearing, correcting, or trapping them", () => {
    const { result } = setup();
    act(() => result.current.setTypedBuffer("nighttime"));
    expect(result.current.typedBuffer).toBe("nighttime");
    expect(result.current.shakeKeyboard).toBe(false);
    act(() => result.current.submitAssessment());
    act(() => result.current.submitAssessment());
    expect(result.current.rawResults).toHaveLength(1);
    expect(result.current.rawResults[0]).toMatchObject({ correct: false, typedResponse: "nighttime", attempts: 1 });
    act(() => vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS));
    expect(result.current.itemIndex).toBe(1);
  });

  it("permits Not sure without a retry or exposing the next answer", () => {
    const { result } = setup();
    expect(result.current.canTryAgain).toBe(false);
    act(() => result.current.handleSkip());
    expect(result.current.rawResults[0]).toMatchObject({ skipped: true });
    act(() => vi.advanceTimersByTime(WORD_RADAR_FEEDBACK_MS));
    expect(result.current.phase).toBe("response");
  });

  it("uses real controls without leaking answers or writing the legacy practice channel", () => {
    const sendMessage = vi.fn();
    const onAssessmentAttempt = vi.fn();
    render(<WordRadar items={items} interimTranscript="" sendMessage={sendMessage} personalBests={{}} onComplete={vi.fn()} assessmentMode autoStart onAssessmentAttempt={onAssessmentAttempt} />);
    expect(screen.getByTestId("word-radar-phase").textContent).toBe("response");
    expect(screen.queryByText("night")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hear the word" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hear the word" }));
    const narration = sendMessage.mock.calls.map(([, payload]) => payload?.event).find(event => event?.type === "narration_request");
    expect(narration.payload).toMatchObject({ assessmentMode: true, itemId: "i1", visibleState: { wordVisible: false, slotsVisible: false } });
    expect(screen.queryByTestId("word-radar-length-hint")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("word-radar-input"), { target: { value: "nite" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onAssessmentAttempt).toHaveBeenCalledOnce();
    expect(onAssessmentAttempt).toHaveBeenCalledWith(expect.objectContaining({ itemIndex: 0, attemptedValue: "nite", skipped: false }));
    expect(screen.queryByText("night")).not.toBeInTheDocument();
    expect(screen.queryByText("Missed")).not.toBeInTheDocument();
    expect(screen.queryByTestId("word-radar-feedback-flash")).not.toBeInTheDocument();
    expect(screen.queryByText("Response saved")).not.toBeInTheDocument();
    const states = sendMessage.mock.calls.map(([, payload]) => payload?.event?.payload).filter(payload => payload?.phase === "feedback");
    expect(states.length).toBeGreaterThan(0);
    expect(states.every(payload => payload.answerVisibility === "hidden" && payload.visibleState.wordVisible === false && payload.visibleState.slotsVisible === false)).toBe(true);
    expect(sendMessage.mock.calls.some(([type]) => type === "word_radar_complete")).toBe(false);
    expect(sendMessage.mock.calls.some(([, payload]) => payload?.event?.type === "learning_attempt")).toBe(false);
  });
  it("keeps frozen practice completion on the canonical host channel and never claims mastery", () => {
    const sendMessage = vi.fn(), complete = vi.fn();
    render(<WordRadar items={[items[0]]} interimTranscript="" sendMessage={sendMessage} personalBests={{}} onComplete={complete} autoStart recallMode="visible_read" inputMode="keyboard" />);
    act(() => vi.advanceTimersByTime(12000));
    fireEvent.change(screen.getByTestId("word-radar-input"), { target: { value: "night" } });
    act(() => vi.advanceTimersByTime(12000));
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0][0]).toMatchObject({ masteryEligible: false, targetResults: [{ target: "i1", attemptedValue: "night", masteryEligible: false }] });
    const attempts = sendMessage.mock.calls.filter(([, payload]) => payload?.event?.type === "attempt_event");
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts.every(([, payload]) => payload.event.payload.target === "i1")).toBe(true);
    expect(sendMessage.mock.calls.some(([type]) => type === "word_radar_complete")).toBe(false);
  });
});
