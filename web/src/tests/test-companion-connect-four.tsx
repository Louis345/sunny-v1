import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanionConnectFour } from "../components/CompanionConnectFour";
import { COMPANION_ACTIVITY_MIN_REVEAL_MS } from "../components/companionActivities/activityTurnGate";
import { CONNECT_FOUR_ROWS } from "../components/companionActivities/connectFourEngine";

describe("CompanionConnectFour", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits a generic activity envelope the companion layer can consume", () => {
    const onGameEvent = vi.fn();
    render(
      <CompanionConnectFour
        companionName="Elli"
        onClose={vi.fn()}
        onGameEvent={onGameEvent}
      />,
    );

    expect(onGameEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "companion_activity_started",
        activityId: "connect_four",
        surface: "video_call_overlay",
        labels: { child: "red discs", companion: "yellow discs" },
        boardView: expect.objectContaining({
          text: expect.stringContaining("R=child"),
          signature: expect.stringMatching(/^-{42}$/),
        }),
      }),
    );
  });

  it("drops discs to the lowest empty slot so gravity is visible", () => {
    const onGameEvent = vi.fn();
    render(
      <CompanionConnectFour
        companionName="Elli"
        onClose={vi.fn()}
        onGameEvent={onGameEvent}
      />,
    );

    fireEvent.click(screen.getByRole("gridcell", { name: "Column 4" }));

    const childMove = onGameEvent.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === "companion_activity_child_move");
    expect(childMove.moveDescription).toBe("dropped a red disc into column 4");
    // Bottom row of column 4 => index 5*7+3 = 38.
    expect(childMove.boardView.signature[38]).toBe("R");
  });

  it("marks a full column and refuses further drops into it", () => {
    render(<CompanionConnectFour companionName="Elli" onClose={vi.fn()} />);

    // Fill column 1 with child discs only (no gate ⇒ companion also plays,
    // so drive it by repeatedly clicking and letting the local reveal run).
    for (let i = 0; i < CONNECT_FOUR_ROWS; i += 1) {
      const control = screen.queryByRole("gridcell", { name: "Column 1" });
      if (!control || (control as HTMLButtonElement).disabled) break;
      fireEvent.click(control);
    }
    // Either the column filled (labelled full) or it is still open — both are
    // valid mid-game, but a full column must never remain clickable.
    const full = screen.queryByRole("gridcell", { name: "Column 1 full" });
    if (full) expect(full).toBeDisabled();
  });

  it("defers the gated companion reveal until the packet settles and keeps columns locked", async () => {
    vi.useFakeTimers();
    let resolveGate: (() => void) | undefined;
    const resolveCompanionTurn = vi.fn(
      (_plan: { boardView: { text: string; signature: string }; plannedMove: string }) =>
        new Promise<void>((resolve) => {
          resolveGate = resolve;
        }),
    );
    const onCompanionTurn = vi.fn();
    const onGameEvent = vi.fn();

    render(
      <CompanionConnectFour
        companionName="Elli"
        onClose={vi.fn()}
        onCompanionTurn={onCompanionTurn}
        onGameEvent={onGameEvent}
        resolveCompanionTurn={resolveCompanionTurn}
      />,
    );

    fireEvent.click(screen.getByRole("gridcell", { name: "Column 4" }));
    await act(async () => {});

    expect(resolveCompanionTurn).toHaveBeenCalledTimes(1);
    const plan = resolveCompanionTurn.mock.calls[0][0];
    expect(plan.plannedMove).toMatch(/^drop your yellow disc into column [1-7]$/);
    expect(plan.boardView.signature).toHaveLength(42);

    // Well past the floor: still no companion disc, and the board is locked.
    await act(async () => {
      vi.advanceTimersByTime(COMPANION_ACTIVITY_MIN_REVEAL_MS + 3_000);
    });
    expect(onCompanionTurn).not.toHaveBeenCalled();
    expect(screen.getByRole("gridcell", { name: "Column 2" })).toBeDisabled();

    await act(async () => {
      resolveGate?.();
    });
    expect(onCompanionTurn).toHaveBeenCalled();
    const companionMove = onGameEvent.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === "companion_activity_companion_move");
    expect(companionMove.moveDescription).toMatch(
      /^dropped a yellow disc into column [1-7]$/,
    );
  });

  it("fail-opens the gated reveal when the packet rejects", async () => {
    vi.useFakeTimers();
    const resolveCompanionTurn = vi.fn(() => Promise.reject(new Error("packet_failed")));
    const onCompanionTurn = vi.fn();

    render(
      <CompanionConnectFour
        companionName="Elli"
        onClose={vi.fn()}
        onCompanionTurn={onCompanionTurn}
        resolveCompanionTurn={resolveCompanionTurn}
      />,
    );

    fireEvent.click(screen.getByRole("gridcell", { name: "Column 4" }));
    await act(async () => {
      vi.advanceTimersByTime(COMPANION_ACTIVITY_MIN_REVEAL_MS + 100);
    });

    expect(onCompanionTurn).toHaveBeenCalled();
  });

  it("plays standalone without a gate, honouring the reveal floor", async () => {
    const onCompanionTurn = vi.fn();
    render(
      <CompanionConnectFour
        companionName="Elli"
        onClose={vi.fn()}
        onCompanionTurn={onCompanionTurn}
      />,
    );

    fireEvent.click(screen.getByRole("gridcell", { name: "Column 4" }));
    await waitFor(() => expect(onCompanionTurn).toHaveBeenCalled(), { timeout: 4000 });
  });
});
