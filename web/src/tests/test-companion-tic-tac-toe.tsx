import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COMPANION_TIC_TAC_TOE_MIN_REVEAL_MS,
  COMPANION_TIC_TAC_TOE_THINK_JITTER_MS,
  COMPANION_TIC_TAC_TOE_THINK_MS,
  CompanionTicTacToe,
} from "../components/CompanionTicTacToe";

describe("CompanionTicTacToe", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits structured activity events that can land in live session logs", async () => {
    const onGameEvent = vi.fn();

    render(
      <CompanionTicTacToe
        companionName="Elli"
        onClose={vi.fn()}
        onGameEvent={onGameEvent}
      />,
    );

    expect(onGameEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "companion_activity_started",
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
      }),
    );

    fireEvent.click(screen.getByRole("gridcell", { name: "Square 1" }));

    await waitFor(
      () => {
        expect(screen.getByRole("gridcell", { name: "Square 5 O" })).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    expect(onGameEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "companion_activity_child_move",
        activityId: "tic_tac_toe",
        moveDescription: "placed X on square 1",
        moveBy: "child",
      }),
    );
    expect(onGameEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "companion_activity_companion_move",
        activityId: "tic_tac_toe",
        moveDescription: "placed O on square 5",
        moveBy: "companion",
      }),
    );
  });

  it("emits round completion once even when the parent rerenders after the completed board", async () => {
    vi.useFakeTimers();
    const onGameEvent = vi.fn();

    function RerenderingParent() {
      const [tick, setTick] = useState(0);
      return (
        <>
          <CompanionTicTacToe
            companionName="Elli"
            onClose={vi.fn()}
            onGameEvent={(event) => {
              onGameEvent(event);
              if (event.type === "companion_activity_round_complete" && tick === 0) {
                setTick(1);
              }
            }}
          />
          <div data-testid="parent-tick">{tick}</div>
        </>
      );
    }

    render(<RerenderingParent />);

    const play = async (square: number) => {
      fireEvent.click(screen.getByRole("gridcell", { name: `Square ${square}` }));
      await act(async () => {
        vi.advanceTimersByTime(4_000);
      });
    };

    await play(1);
    await play(2);
    await play(7);
    await play(6);
    fireEvent.click(screen.getByRole("gridcell", { name: "Square 8" }));

    expect(screen.getByText(/Draw game/i)).toBeInTheDocument();
    expect(screen.getByTestId("parent-tick")).toHaveTextContent("1");

    const completeEvents = onGameEvent.mock.calls.filter(
      ([event]) => event.type === "companion_activity_round_complete",
    );
    expect(completeEvents).toHaveLength(1);
  });

  it("uses a deliberate thinking beat before the companion move so play feels conversational", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionTicTacToe.tsx"),
      "utf8",
    );

    expect(source).toContain("COMPANION_TIC_TAC_TOE_THINK_MS");
    expect(source).toContain("2200");
    expect(source).toContain("COMPANION_TIC_TAC_TOE_THINK_JITTER_MS");
    expect(source).toContain("getCompanionTicTacToeThinkDelay");
    expect(source).not.toContain("}, 360)");
  });

  it("uses a deliberate decision rhythm so companion moves do not feel like computer reflexes", () => {
    expect(COMPANION_TIC_TAC_TOE_THINK_MS).toBeGreaterThanOrEqual(1_900);
    expect(COMPANION_TIC_TAC_TOE_THINK_MS).toBeLessThanOrEqual(2_600);
    expect(COMPANION_TIC_TAC_TOE_THINK_JITTER_MS).toBeGreaterThanOrEqual(450);
    expect(COMPANION_TIC_TAC_TOE_THINK_MS + COMPANION_TIC_TAC_TOE_THINK_JITTER_MS).toBeLessThanOrEqual(
      3_400,
    );
  });

  it("records planned and actual companion decision timing for trace review", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionTicTacToe.tsx"),
      "utf8",
    );

    expect(source).toContain("decisionStartedAt");
    expect(source).toContain("plannedDecisionDelayMs");
    expect(source).toContain("decisionLatencyMs");
  });

  it("emits game events for AI-authored reactions without local spoken lines", async () => {
    const onCompanionTurn = vi.fn();
    const onBanter = vi.fn();

    render(
      <CompanionTicTacToe
        companionId="elli"
        companionName="Elli"
        onClose={vi.fn()}
        onBanter={onBanter}
        onCompanionTurn={onCompanionTurn}
      />,
    );

    fireEvent.click(screen.getByRole("gridcell", { name: "Square 1" }));

    expect(onBanter).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "child_move",
        activityId: "tic_tac_toe",
      }),
    );

    await waitFor(
      () => {
        expect(screen.getByRole("gridcell", { name: "Square 5 O" })).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
    expect(onCompanionTurn).toHaveBeenCalled();
    expect(onBanter).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "companion_move",
        activityId: "tic_tac_toe",
      }),
    );
  });

  it("keeps turn feedback local with sound effects instead of round-tripping every move to Claude", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionTicTacToe.tsx"),
      "utf8",
    );

    expect(source).toContain("playCompanionActivitySfx");
    const sfxSource = readFileSync(
      resolve(__dirname, "../components/companionActivities/companionActivitySfx.ts"),
      "utf8",
    );
    expect(sfxSource).toContain("child_move");
    expect(sfxSource).toContain("companion_move");
    expect(sfxSource).toContain("round_complete");
    expect(source).not.toContain("companionTurnLines");
    expect(source).not.toContain("getCompanionTicTacToeBanterLine");
    expect(source).not.toContain("/api/companions/");
  });

  it("defers the gated companion reveal until resolveCompanionTurn settles and keeps the board locked", async () => {
    vi.useFakeTimers();
    let resolveGate: (() => void) | undefined;
    const resolveCompanionTurn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveGate = resolve;
        }),
    );
    const onCompanionTurn = vi.fn();

    render(
      <CompanionTicTacToe
        companionName="Elli"
        onClose={vi.fn()}
        onCompanionTurn={onCompanionTurn}
        resolveCompanionTurn={resolveCompanionTurn}
      />,
    );

    fireEvent.click(screen.getByRole("gridcell", { name: "Square 1" }));
    await act(async () => {});

    expect(resolveCompanionTurn).toHaveBeenCalledTimes(1);
    expect(resolveCompanionTurn).toHaveBeenCalledWith({
      boardView: {
        text: "1=X, 2=empty, 3=empty, 4=empty, 5=empty, 6=empty, 7=empty, 8=empty, 9=empty",
        signature: "X--------",
      },
      plannedMove: "place your O on square 5",
    });

    await act(async () => {
      vi.advanceTimersByTime(COMPANION_TIC_TAC_TOE_MIN_REVEAL_MS + 3_000);
    });
    expect(screen.queryByRole("gridcell", { name: "Square 5 O" })).toBeNull();
    expect(onCompanionTurn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("gridcell", { name: "Square 2" }));
    expect(screen.queryByRole("gridcell", { name: "Square 2 X" })).toBeNull();

    await act(async () => {
      resolveGate?.();
    });
    expect(screen.getByRole("gridcell", { name: "Square 5 O" })).toBeInTheDocument();
    expect(onCompanionTurn).toHaveBeenCalled();
    expect(screen.queryByRole("gridcell", { name: "Square 2 X" })).toBeNull();
  });

  it("fail-opens the gated reveal when resolveCompanionTurn rejects", async () => {
    vi.useFakeTimers();
    const resolveCompanionTurn = vi.fn(() => Promise.reject(new Error("packet_failed")));

    render(
      <CompanionTicTacToe
        companionName="Elli"
        onClose={vi.fn()}
        resolveCompanionTurn={resolveCompanionTurn}
      />,
    );

    fireEvent.click(screen.getByRole("gridcell", { name: "Square 1" }));
    await act(async () => {
      vi.advanceTimersByTime(COMPANION_TIC_TAC_TOE_MIN_REVEAL_MS + 50);
    });

    expect(screen.getByRole("gridcell", { name: "Square 5 O" })).toBeInTheDocument();
  });

  it("adds small square motion so moves feel placed instead of appearing instantly", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionTicTacToe.tsx"),
      "utf8",
    );

    expect(source).toContain("motion.button");
    expect(source).toContain("lastMove");
    expect(source).toContain("whileTap={{ scale: 0.96 }}");
    expect(source).toContain("animate={{ scale: lastMove === index ? [1, 1.08, 1] : 1 }}");
    expect(source).toContain("transition={{ duration: 0.22, ease: \"easeOut\" }}");
  });
});
