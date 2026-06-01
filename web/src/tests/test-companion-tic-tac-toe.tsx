import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
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
        type: "companion_tic_tac_toe_started",
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
        type: "companion_tic_tac_toe_child_move",
        activityId: "tic_tac_toe",
        square: 1,
        mark: "X",
      }),
    );
    expect(onGameEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "companion_tic_tac_toe_companion_move",
        activityId: "tic_tac_toe",
        square: 5,
        mark: "O",
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
              if (event.type === "companion_tic_tac_toe_round_complete" && tick === 0) {
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
      ([event]) => event.type === "companion_tic_tac_toe_round_complete",
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
        square: 1,
      }),
    );

    await waitFor(
      () => {
        expect(screen.getByRole("gridcell", { name: "Square 5 O" })).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
    expect(onCompanionTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        square: 5,
      }),
    );
    expect(onBanter).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "companion_move",
        square: 5,
      }),
    );
  });

  it("keeps turn feedback local with sound effects instead of round-tripping every move to Claude", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionTicTacToe.tsx"),
      "utf8",
    );

    expect(source).toContain("playTicTacToeSfx");
    expect(source).toContain("child_move");
    expect(source).toContain("companion_move");
    expect(source).toContain("round_complete");
    expect(source).not.toContain("companionTurnLines");
    expect(source).not.toContain("getCompanionTicTacToeBanterLine");
    expect(source).not.toContain("/api/companions/");
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
