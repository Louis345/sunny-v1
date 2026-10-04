import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdventurePreparationScreen, elliPreparationLine, preparationView } from "../components/AdventurePreparationScreen";
import type { GenerationStatus } from "../hooks/useAdaptiveMathGenerationRefresh";

// Design: "Sunny · Getting your next adventure ready" (Claude Design brief, 2026-10-04).
// Progress may only move on real status; Ila cannot rely on reading, so every state
// has one spoken Elli line; her word cards replay words but never grade them.
const status = (phase: string, nodes: Array<[string, string]> = [], startedAt?: string): GenerationStatus =>
  ({ phase, updatedAt: "t", ...(startedAt ? { startedAt } : {}), nodes: nodes.map(([nodeId, s]) => ({ nodeId, status: s })) });
const NOW = Date.parse("2026-10-04T18:00:00Z");
const words = ["tomorrow", "broken", "obey"];

describe("preparationView maps only real backend status", () => {
  it.each([
    [null, "planning"],
    [status("targeted_planning"), "planning"],
    [status("board_designing"), "planning"],
    [status("board_generating", [["a", "ready"], ["b", "preparing"]]), "building"],
    [status("board_ready", [["a", "ready"], ["b", "ready"]]), "ready"],
    [status("needs_attention"), "needs_grownup"],
    [status("board_generating", [["a", "failed_resumable"]]), "needs_grownup"],
  ] as const)("%j -> %s", (input, kind) => {
    expect(preparationView(input, NOW).kind).toBe(kind);
  });

  it("counts prepared activities from node status, never from time", () => {
    const view = preparationView(status("board_generating", [["a", "ready"], ["b", "evidence_locked"], ["c", "preparing"], ["d", "preparing"]]), NOW);
    expect(view).toMatchObject({ kind: "building", ready: 2, total: 4 });
  });

  it("marks a wait as slow only from the real start time", () => {
    const fresh = status("targeted_planning", [], new Date(NOW - 60_000).toISOString());
    const long = status("targeted_planning", [], new Date(NOW - 5 * 60_000).toISOString());
    expect(preparationView(fresh, NOW).slow).toBe(false);
    expect(preparationView(long, NOW).slow).toBe(true);
    expect(preparationView(status("targeted_planning"), NOW).slow).toBe(false);
  });

  it("gives every state one short spoken Elli line", () => {
    for (const kind of ["planning", "building", "ready", "needs_grownup"] as const) {
      const line = elliPreparationLine({ kind, ready: 1, total: 3, slow: false });
      expect(line.length).toBeGreaterThan(0);
      expect(line.split(/[.!?]\s/).length).toBeLessThanOrEqual(2);
    }
    expect(elliPreparationLine({ kind: "planning", ready: 0, total: 0, slow: true })).not.toBe(elliPreparationLine({ kind: "planning", ready: 0, total: 0, slow: false }));
  });
});

describe("AdventurePreparationScreen", () => {
  const props = { words, now: NOW, onCheck: vi.fn(), onFinish: vi.fn(), onHearWord: vi.fn() };

  it("shows three honest steps and her words while planning", () => {
    render(<AdventurePreparationScreen {...props} status={status("targeted_planning")} />);
    expect(screen.getAllByTestId("preparation-step")).toHaveLength(3);
    expect(screen.getByTestId("preparation-step-current").textContent).toMatch(/plan/i);
    for (const word of words) expect(screen.getByRole("button", { name: `Hear ${word}` })).toBeTruthy();
    expect(screen.getByRole("status").textContent).not.toMatch(/%/);
  });

  it("never marks her words right or wrong", () => {
    const { container } = render(<AdventurePreparationScreen {...props} status={status("targeted_planning")} />);
    const cards = container.querySelector('[data-testid="preparation-word-cards"]')!;
    expect(cards.textContent).not.toMatch(/[✓✔✗✘★⭐]|correct|wrong/i);
  });

  it("replays a word when she taps its card", () => {
    const onHearWord = vi.fn();
    render(<AdventurePreparationScreen {...props} onHearWord={onHearWord} status={status("targeted_planning")} />);
    fireEvent.click(screen.getByRole("button", { name: "Hear broken" }));
    expect(onHearWord).toHaveBeenCalledWith("broken");
  });

  it("shows real build progress as n of N ready", () => {
    render(<AdventurePreparationScreen {...props} status={status("board_generating", [["a", "ready"], ["b", "ready"], ["c", "preparing"], ["d", "preparing"]])} />);
    expect(screen.getByTestId("preparation-step-current").textContent).toMatch(/build/i);
    expect(screen.getByRole("status").textContent).toContain("2 of 4 ready");
  });

  it("stays calm when the wait is long", () => {
    render(<AdventurePreparationScreen {...props} status={status("board_generating", [["a", "preparing"]], new Date(NOW - 6 * 60_000).toISOString())} />);
    expect(screen.getByRole("status").textContent).toMatch(/still working/i);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tells a grown-up the work is saved and keeps the existing grown-up actions", () => {
    const onCheck = vi.fn(), onFinish = vi.fn();
    render(<AdventurePreparationScreen {...props} onCheck={onCheck} onFinish={onFinish} status={status("needs_attention", [["a", "failed_resumable"]])} />);
    expect(screen.getByRole("status").textContent).toMatch(/saved/i);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onCheck).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /finish for now/i }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("lets her stop for now exactly once", () => {
    const onFinish = vi.fn();
    render(<AdventurePreparationScreen {...props} onFinish={onFinish} status={status("board_generating", [["a", "preparing"]])} />);
    const stop = screen.getByRole("button", { name: /stop for now/i });
    fireEvent.click(stop);
    fireEvent.click(stop);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("shows Elli's current line on screen and exposes it for speech", () => {
    render(<AdventurePreparationScreen {...props} status={status("targeted_planning")} />);
    const line = elliPreparationLine(preparationView(status("targeted_planning"), NOW));
    expect(screen.getByTestId("preparation-elli-line").textContent).toBe(line);
  });
});
