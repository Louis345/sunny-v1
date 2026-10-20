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
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T21:00:00.000Z")); });
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

  // Human-caught 2026-10-07: Elli promised "a few more seconds" while the
  // backend was paused. The bridge exposed the phase but not elapsed time or
  // the fact that remaining time was unknown, so the lab never challenged the
  // unsupported estimate.
  it("gives Elli elapsed time and forbids invented completion estimates", async () => {
    const startedAt = new Date(Date.now() - 2 * 60_000).toISOString();
    const paused = { ...status("needs_attention", []), startedAt, error: "provider_unavailable" };
    const { stateUpdates } = setup({ surface: "held", status: paused });
    expect(stateUpdates().at(-1)).toMatchObject({
      phase: "help",
      boardState: "needs_attention",
      elapsedLabel: "2 min so far",
      remainingTimeKnown: false,
      progress: "Your words are saved. Building is paused.",
    });
    expect(stateUpdates().at(-1)?.screenText).toContain("Remaining time is not known.");
  });

  it("uses visual state updates without automatic fixed loading narration", async () => {
    const { rerender, spoken, stateUpdates } = setup({ surface: "chapter", status: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    rerender({ surface: "chapter", status: status("board_generating", [["a", "ready"], ["b", "preparing"]]) });
    expect(spoken()).toEqual([]);
    expect(stateUpdates().at(-1)).toMatchObject({ phase: "build", ready: 1, total: 2 });
  });

  it("offers the fully verified board after Discovery and reveals it only on request", async () => {
    const { result, rerender, spoken } = setup({ surface: "chapter", status: null });
    expect(result.current.screen).not.toBeNull();
    expect(spoken()).toEqual([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(spoken()).toEqual([]);
    rerender({ surface: "chapter", status: status("board_generating", [["a", "preparing"], ["b", "preparing"]]) });
    expect(spoken()).toEqual([]);
    // Completion is not an instruction to end the child's session.
    rerender({ surface: null, status: status("board_ready", [["a", "ready"], ["b", "ready"]]) });
    expect(result.current.screen).not.toBeNull();
    expect(spoken()).toEqual([]);
    const { unmount } = render(<>{result.current.screen}</>);
    expect(screen.queryByText("Ready next time")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Let's go!" }));
    unmount();
    rerender({ surface: null, status: status("board_ready", [["a", "ready"], ["b", "ready"]]) });
    expect(result.current.screen).toBeNull();
  });

  it("resumes a building map next session and reveals it once with Let's go", () => {
    const { result, rerender, spoken } = setup({ surface: "held", status: null });
    expect(result.current.screen).toBeNull();
    rerender({ surface: "held", status: status("board_generating", [["a", "ready"], ["b", "preparing"]]) });
    expect(spoken()).toEqual([]);
    rerender({ surface: null, status: status("board_ready", [["a", "ready"], ["b", "ready"]]) });
    expect(spoken()).toEqual([]);
    const { unmount } = render(<>{result.current.screen}</>);
    fireEvent.click(screen.getByRole("button", { name: "Let's go!" }));
    unmount();
    rerender({ surface: null, status: status("board_ready", [["a", "ready"], ["b", "ready"]]) });
    expect(result.current.screen).toBeNull();
  });

  // Oct 20: Saori's active spelling practice was replaced in Elli's context
  // by a hidden preparation screen. The lab checked reveal, but never let
  // status/time updates continue after reveal as they do in a live session.
  it("stops publishing preparation context after the child reveals the board", async () => {
    const { result, rerender, stateUpdates } = setup({ surface: "chapter", status: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    const ready = status("board_ready", [["a", "ready"], ["b", "ready"]]);
    rerender({ surface: null, status: ready });
    expect(stateUpdates().at(-1)).toMatchObject({ game: "adventure-preparation", phase: "ready" });
    const view = render(<>{result.current.screen}</>);
    fireEvent.click(screen.getByRole("button", { name: "Let's go!" }));
    view.unmount();
    const publishedBeforePlay = stateUpdates().length;

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    rerender({ surface: null, status: { ...ready, startedAt: new Date().toISOString() } });

    expect(result.current.screen).toBeNull();
    expect(stateUpdates()).toHaveLength(publishedBeforePlay);
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

  it("waits for canonical publication before offering reveal, even when all artifacts are ready", () => {
    const {result, rerender} = setup({surface:"held",status:status("board_generating",[["a","ready"],["b","ready"]])});
    const first = render(<>{result.current.screen}</>);
    expect(screen.queryByRole("button",{name:"Let's go!"})).toBeNull();
    first.unmount();
    rerender({surface:null,status:status("board_ready",[["a","ready"],["b","ready"]])});
    render(<>{result.current.screen}</>);
    expect(screen.getByRole("button",{name:"Let's go!"})).toBeTruthy();
  });

  it("allows declining a completed board without revealing it", () => {
    const {result,rerender,onFinish} = setup({surface:"held",status:status("board_generating",[["a","ready"],["b","preparing"]])});
    rerender({surface:null,status:status("board_ready",[["a","ready"],["b","ready"]])});
    const first=render(<>{result.current.screen}</>);
    fireEvent.click(screen.getByRole("button",{name:/stop for now/i}));
    first.unmount();
    render(<>{result.current.screen}</>);
    expect(screen.queryByRole("button",{name:"Let's go!"})).toBeNull();
    expect(onFinish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:/bye for now/i}));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
