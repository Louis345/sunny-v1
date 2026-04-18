import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useAdventureState, type AdventureVoiceState } from "../useAdventureState";

function makeState(overrides: Partial<AdventureVoiceState> = {}): AdventureVoiceState {
  return {
    phase: "picker",
    canvas: { mode: "idle" },
    karaokeStoryComplete: false,
    error: null,
    childName: null,
    ...overrides,
  };
}

describe("useAdventureState", () => {
  afterEach(() => {
    cleanup();
  });

  it("karaokeReadingActive is true when phase=active, mode=karaoke, words > 0", () => {
    const words = ["the", "cat"];
    const { result } = renderHook(() =>
      useAdventureState(
        makeState({
          phase: "active",
          canvas: { mode: "karaoke", karaokeWords: words },
          karaokeStoryComplete: false,
        }),
        false,
      ),
    );
    expect(result.current.karaokeReadingActive).toBe(true);
  });

  it("karaokeReadingActive is false when karaokeStoryComplete is true", () => {
    const words = ["the", "cat"];
    const { result } = renderHook(() =>
      useAdventureState(
        makeState({
          phase: "active",
          canvas: { mode: "karaoke", karaokeWords: words },
          karaokeStoryComplete: true,
        }),
        false,
      ),
    );
    expect(result.current.karaokeReadingActive).toBe(false);
  });

  it("companionMuted equals karaokeReadingActive in both states", () => {
    const words = ["one"];
    const { result, rerender } = renderHook(
      (state: AdventureVoiceState) => useAdventureState(state, false),
      {
        initialProps: makeState({
          phase: "active",
          canvas: { mode: "karaoke", karaokeWords: words },
        }),
      },
    );
    expect(result.current.karaokeReadingActive).toBe(true);
    expect(result.current.companionMuted).toBe(true);

    rerender(makeState({ phase: "active", canvas: { mode: "idle" } }));
    expect(result.current.karaokeReadingActive).toBe(false);
    expect(result.current.companionMuted).toBe(false);
  });

  it("effectiveChildId is null when state.error is set", () => {
    const { result, rerender } = renderHook(
      (state: AdventureVoiceState) => useAdventureState(state, true),
      { initialProps: makeState({ phase: "active" }) },
    );
    act(() => {
      result.current.setAdventureChildId("ila");
    });
    expect(result.current.adventureChildId).toBe("ila");

    rerender(makeState({ phase: "picker", error: "connection timeout" }));
    expect(result.current.adventureChildId).toBeNull();
  });

  it("effectiveNodeScreen is null when adventureChildId is null", () => {
    const { result } = renderHook(() =>
      useAdventureState(makeState({ phase: "picker" }), false),
    );
    expect(result.current.adventureChildId).toBeNull();
    expect(result.current.activeNodeScreen).toBeNull();
  });
});
