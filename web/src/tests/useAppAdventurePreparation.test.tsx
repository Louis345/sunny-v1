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

  it("carries saved evaluation marks through to loading cards for all ten words", () => {
    const results = Array.from({ length: 10 }, (_, i) => ({ display: `word${i}`, correct: i % 2 === 0 }));
    const { result } = renderHook(() => useAppAdventurePreparation({
      surface: "chapter", packet: { activeSessionPlan: { domain: "spelling", nodePlan: [{ targets: results.map(item => item.display) }] }, spellingEvaluationResults: results } as never,
      childId: "lab", homeworkId: "hw", status: null, finished: false,
      checkNow: vi.fn(), onFinish: vi.fn(), sendMessage: vi.fn(),
    }));
    render(<>{result.current.screen}</>);
    expect(screen.getAllByRole("button", { name: /Hear word/ })).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Hear word0 — Correct" })).toHaveTextContent("✓");
    expect(screen.getByRole("button", { name: "Hear word9 — To practise" })).toHaveTextContent("✕");
  });

  // 2026-11-01 Ila finished her board and nothing happened: the next board was ready but her screen still said done.
  describe("when she finishes a board", () => {
    const finished = { activeSessionPlan: { domain: "spelling", nodePlan: [{ targets: ["mailbox", "moonlight"] }] },
      spellingEvaluationResults: [{ display: "mailbox", correct: false }, { display: "moonlight", correct: true }],
      spellingBoardResults: [{ display: "mailbox", firstTry: false, correct: true }, { display: "moonlight", firstTry: true, correct: false }] };
    const open = (over: Partial<Parameters<typeof useAppAdventurePreparation>[0]> = {}) => {
      const onFinish = vi.fn(), onReveal = vi.fn();
      const hook = renderHook((props: { surface: PreparationSurface; status: GenerationStatus | null }) => useAppAdventurePreparation({
        ...props, packet: finished as never, childId: "lab", homeworkId: "hw", finishedBoardId: "hw:board:2", finished: false,
        checkNow: vi.fn(), onFinish, onReveal, sendMessage: vi.fn(), ...over,
      }), { initialProps: { surface: "chapter" as PreparationSurface, status: status("successor_preparing", []) } });
      return { ...hook, onFinish, onReveal };
    };

    it("shows her latest try and marks the words she got that she missed at the start", () => {
      const { result } = open();
      render(<>{result.current.screen}</>);
      expect(screen.getByRole("button", { name: /Hear mailbox — Correct/ })).toHaveTextContent("New!");
      expect(screen.getByRole("button", { name: /Hear moonlight — To practise/ })).not.toHaveTextContent("New!");
      expect(result.current.waiting?.detail ?? "").toContain("New since her first try: mailbox.");
    });

    it("opens again after the Discovery screen was already used on this homework", async () => {
      const { result, rerender } = renderHook(({ finishedBoardId }) => useAppAdventurePreparation({
        surface: "chapter", packet: finished as never, childId: "lab", homeworkId: "hw", finishedBoardId, status: status("successor_preparing", []),
        finished: false, checkNow: vi.fn(), onFinish: vi.fn(), sendMessage: vi.fn(),
      }), { initialProps: { finishedBoardId: null as string | null } });
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
      rerender({ finishedBoardId: "hw:board:2" });
      const view = render(<>{result.current.screen}</>);
      expect(view.container.querySelector(".ap-root")).toHaveAttribute("data-state", "look");
    });

    it("gives her two choices once the next map is ready: play it now, or save it for next time", async () => {
      const hook = open();
      hook.rerender({ surface: null, status: status("successor_published", [["n1", "ready"]]) });
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
      const view = render(<>{hook.result.current.screen}</>);
      expect(view.container.querySelector(".ap-root")).toHaveAttribute("data-state", "ready");
      fireEvent.click(screen.getByRole("button", { name: "Save for next time" }));
      expect(hook.onFinish).toHaveBeenCalledOnce();
      expect(hook.onReveal).not.toHaveBeenCalled();
      view.unmount();
      const again = open({ childId: "other" });
      again.rerender({ surface: null, status: status("successor_published", [["n1", "ready"]]) });
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
      render(<>{again.result.current.screen}</>);
      fireEvent.click(screen.getByRole("button", { name: "Let's go!" }));
      expect(again.onReveal).toHaveBeenCalledOnce();
    });
  });

  it("does not restart review on equivalent packet refreshes or mark a later held screen", async () => {
    const sendMessage = vi.fn();
    const makePacket = () => ({ activeSessionPlan: { domain: "spelling", nodePlan: [{ targets: ["night", "light"] }] },
      spellingEvaluationResults: [{ display: "night", correct: true }, { display: "light", correct: false }, { display: "old-word", correct: false }],
    });
    const { result, rerender } = renderHook(({ surface, packet }) => useAppAdventurePreparation({
      surface, packet: packet as never, childId: "lab", homeworkId: "hw", status: status("board_generating", []),
      finished: false, checkNow: vi.fn(), onFinish: vi.fn(), sendMessage,
    }), { initialProps: { surface: "chapter" as PreparationSurface, packet: makePacket() } });
    const view = render(<>{result.current.screen}</>);
    expect(screen.queryByRole("button", { name: /old-word/ })).toBeNull();
    for (let i = 0; i < 7; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      rerender({ surface: "chapter", packet: makePacket() });
    }
    view.rerender(<>{result.current.screen}</>);
    expect(view.container.querySelector(".ap-root")).toHaveAttribute("data-state", "plan");
    view.unmount();
    const held = renderHook(() => useAppAdventurePreparation({ surface: "held", packet: makePacket() as never,
      childId: "other", homeworkId: "hw", status: status("board_generating", []), finished: false,
      checkNow: vi.fn(), onFinish: vi.fn(), sendMessage: vi.fn(),
    }));
    render(<>{held.result.current.screen}</>);
    expect(screen.getByRole("button", { name: "Hear night" })).not.toHaveTextContent("✓");
  });

  // Human-caught 2026-10-07: Ila asked Elli what was happening while this
  // screen was visible, but Elli still answered from Word Radar context. The
  // preparation tests only asserted fixed narration, so the missing live
  // context bridge was invisible to the lab.
  it("keeps Elli grounded in the visible preparation phase and real progress", async () => {
    // The waiting screen describes itself through the kiosk's one screen report, never its own message.
    const { result, rerender, stateUpdates } = setup({ surface: "chapter", status: null });
    expect(result.current.waiting).toMatchObject({ step: "You did it! Let me look at all your words.", ready: 0, total: 0 });

    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    rerender({ surface: "chapter", status: status("board_generating", [["a", "ready"], ["b", "preparing"]]) });
    expect(result.current.waiting).toMatchObject({ step: "I'm building your games. One is ready!", ready: 1, total: 2 });
    expect(stateUpdates()).toEqual([]);
  });

  // Human-caught 2026-10-07: Elli promised "a few more seconds" while the
  // backend was paused. The bridge exposed the phase but not elapsed time or
  // the fact that remaining time was unknown, so the lab never challenged the
  // unsupported estimate.
  it("gives Elli elapsed time and forbids invented completion estimates", async () => {
    const startedAt = new Date(Date.now() - 2 * 60_000).toISOString();
    const paused = { ...status("needs_attention", []), startedAt, error: "provider_unavailable" };
    const { result } = setup({ surface: "held", status: paused });
    expect(result.current.waiting).toMatchObject({ step: "Your words are saved. Building is paused." });
    expect(result.current.waiting?.detail).toContain("Elapsed: 2 min so far.");
    expect(result.current.waiting?.detail).toContain("Remaining time is not known.");
  });

  it("uses visual state updates without automatic fixed loading narration", async () => {
    const { result, rerender, spoken } = setup({ surface: "chapter", status: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    rerender({ surface: "chapter", status: status("board_generating", [["a", "ready"], ["b", "preparing"]]) });
    expect(spoken()).toEqual([]);
    expect(result.current.waiting).toMatchObject({ ready: 1, total: 2 });
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
    expect(result.current.waiting).toMatchObject({ step: "Your map is ready. Let's go!" });
    expect(stateUpdates()).toEqual([]);
    const view = render(<>{result.current.screen}</>);
    fireEvent.click(screen.getByRole("button", { name: "Let's go!" }));
    view.unmount();
    const publishedBeforePlay = stateUpdates().length;

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    rerender({ surface: null, status: { ...ready, startedAt: new Date().toISOString() } });

    expect(result.current.screen).toBeNull();
    expect(result.current.waiting).toBeNull();
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

  // 2026-10-22 human catch: a timer counted from yesterday's Planner decision over a finished board.
  it("offers a published next board with Let's go and no elapsed timer, even from yesterday", () => {
    const yesterday = new Date(Date.now() - 1395 * 60_000).toISOString();
    const { result, rerender } = setup({ surface: "held", status: { phase: "successor_preparing", updatedAt: yesterday, startedAt: yesterday, nodes: [] } });
    rerender({ surface: null, status: { phase: "successor_published", updatedAt: yesterday, startedAt: yesterday, nodes: [] } });
    render(<>{result.current.screen}</>);
    expect(screen.getByRole("button", { name: "Let's go!" })).toBeTruthy();
    expect(screen.queryByText(/min/)).toBeNull();
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
