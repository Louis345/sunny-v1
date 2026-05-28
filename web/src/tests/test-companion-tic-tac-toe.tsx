import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CompanionTicTacToe } from "../components/CompanionTicTacToe";

describe("CompanionTicTacToe", () => {
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
      { timeout: 2500 },
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

  it("uses a small thinking beat before the companion move so play feels conversational", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionTicTacToe.tsx"),
      "utf8",
    );

    expect(source).toContain("COMPANION_TIC_TAC_TOE_THINK_MS");
    expect(source).toContain("1180");
    expect(source).toContain("COMPANION_TIC_TAC_TOE_THINK_JITTER_MS");
    expect(source).toContain("getCompanionTicTacToeThinkDelay");
    expect(source).not.toContain("}, 360)");
  });

  it("emits banter for child and companion moves so the call can stay conversational", async () => {
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
        line: expect.stringMatching(/\S/),
      }),
    );

    await waitFor(
      () => {
        expect(screen.getByRole("gridcell", { name: "Square 5 O" })).toBeInTheDocument();
      },
      { timeout: 2500 },
    );
    expect(onCompanionTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        square: 5,
        line: expect.stringContaining("my turn"),
      }),
    );
    expect(onBanter).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "companion_move",
        square: 5,
        line: expect.stringMatching(/my turn|square|center/i),
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
    expect(source).toContain("companionTurnLines");
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
