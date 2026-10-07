import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppAdventurePreparation, type PreparationSurface } from "../components/AdventurePreparation/useAppAdventurePreparation";
import type { GenerationStatus } from "../hooks/useAdaptiveMathGenerationRefresh";

const packet = { activeSessionPlan: { domain: "spelling", nodePlan: [{ targets: ["night", "light"] }], adventureBoard: { nodes: [{ id: "a", kind: "activity", activityId: "word-radar" }, { id: "b", kind: "activity", activityId: "letter-rush" }] } } } as never;
const status = (phase: string, nodes: Array<[string, string]>): GenerationStatus => ({ phase, updatedAt: `${phase}:${nodes.join()}`, startedAt: new Date().toISOString(), nodes: nodes.map(([nodeId, s]) => ({ nodeId, status: s })) });

function setup(initial: { surface: PreparationSurface; status: GenerationStatus | null }) {
  const sendMessage = vi.fn(), onFinish = vi.fn(), checkNow = vi.fn();
  const hook = renderHook((props: { surface: PreparationSurface; status: GenerationStatus | null }) => useAppAdventurePreparation({
    ...props, packet, childId: "lab", homeworkId: "hw", finished: false, checkNow, onFinish, sendMessage,
  }), { initialProps: initial });
  const events = () => sendMessage.mock.calls.map(call => (call[1] as { event: { type: string; payload: Record<string, unknown> } }).event);
  const spoken = () => events().filter(event => event.type === "narration_request").map(event => event.payload.text);
  const stateUpdates = () => events().filter(event => event.type === "game_state_update").map(event => event.payload);
  return { ...hook, spoken, stateUpdates, onFinish };
}

describe("useAppAdventurePreparation", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  // Human-caught 2026-10-07: Ila asked Elli what was happening while this
  // screen was visible, but Elli still answered from Word Radar context. The
  // preparation tests only asserted fixed narration, so the missing live
  // context bridge was invisible to the lab.
  it("keeps Elli grounded in the visible preparation phase and real progress", async () => {
    const { rerender, stateUpdates } = setup({ surface: "chapter", status: null });
    expect(stateUpdates().at(-1)).toMatchObject({
      game: "adventure-preparation",
      childId: "lab",
      phase: "look",
      progress: "You did it! Let me look at all your words.",
      ready: 0,
      total: 0,
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    rerender({ surface: "chapter", status: status("board_generating", [["a", "ready"], ["b", "preparing"]]) });
    expect(stateUpdates().at(-1)).toMatchObject({
      game: "adventure-preparation",
      childId: "lab",
      phase: "build",
      progress: "I'm building your games. One is ready!",
      ready: 1,
      total: 2,
    });
  });

  it("ends the Discovery chapter calmly and never offers the new map this session", async () => {
    const { result, rerender, spoken } = setup({ surface: "chapter", status: null });
    expect(result.current.screen).not.toBeNull();
    expect(spoken()).toEqual(["You did it! Let me look at all your words."]);
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(spoken().at(-1)).toBe("Now I'm choosing where we'll go next.");
    rerender({ surface: "chapter", status: status("board_generating", [["a", "preparing"], ["b", "preparing"]]) });
    expect(spoken().at(-1)).toBe("I'm building your games.");
    // The packet switches to the finished board: the chapter still ends here.
    rerender({ surface: null, status: status("board_ready", [["a", "ready"], ["b", "ready"]]) });
    expect(result.current.screen).not.toBeNull();
    expect(spoken().at(-1)).toBe("Your map is ready for next time. Bye for now!");
    expect(new Set(spoken()).size).toBe(spoken().length);
    render(<>{result.current.screen}</>);
    expect(screen.queryByRole("button", { name: "Let's go!" })).toBeNull();
  });

  it("resumes a building map next session and reveals it once with Let's go", () => {
    const { result, rerender, spoken } = setup({ surface: "held", status: null });
    expect(result.current.screen).toBeNull();
    rerender({ surface: "held", status: status("board_generating", [["a", "ready"], ["b", "preparing"]]) });
    expect(spoken()).toEqual(["I'm building your games. One is ready!"]);
    rerender({ surface: null, status: status("board_ready", [["a", "ready"], ["b", "ready"]]) });
    expect(spoken().at(-1)).toBe("Your map is ready. Let's go!");
    const { unmount } = render(<>{result.current.screen}</>);
    fireEvent.click(screen.getByRole("button", { name: "Let's go!" }));
    unmount();
    rerender({ surface: null, status: status("board_ready", [["a", "ready"], ["b", "ready"]]) });
    expect(result.current.screen).toBeNull();
  });

  it("stops on request, then ends the session only on Bye for now", () => {
    const { result, onFinish } = setup({ surface: "chapter", status: null });
    const first = render(<>{result.current.screen}</>);
    fireEvent.click(screen.getByRole("button", { name: /stop for now/i }));
    expect(onFinish).not.toHaveBeenCalled();
    first.unmount();
    render(<>{result.current.screen}</>);
    fireEvent.click(screen.getByRole("button", { name: /bye for now/i }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
