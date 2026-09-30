import { describe, expect, it, vi } from "vitest";
import { ActiveCanvasActivityController } from "./activeCanvasActivity";

describe("ActiveCanvasActivityController", () => {
  it("pauses and restores a worksheet without losing its visible question", async () => {
    let canvasState: Record<string, unknown> | null = {
      mode: "worksheet",
      question: "Which hand shows the minutes?",
    };
    let contextCanvas: Record<string, unknown> = { mode: "worksheet" };
    const sent: Record<string, unknown>[] = [];
    const replayQuestion = vi.fn().mockResolvedValue(undefined);
    const synced: string[] = [];
    const controller = new ActiveCanvasActivityController({
      readCanvasState: () => canvasState,
      clearCanvasState: () => { canvasState = null; },
      restoreCanvasState: (value) => { canvasState = value; },
      readContextCanvas: () => contextCanvas,
      updateContextCanvas: (value) => { contextCanvas = value; },
      readWorksheet: () => ({
        problemIndex: 2,
        question: "Which hand shows the minutes?",
      }),
      restoreWorksheetProblemIndex: vi.fn(),
      readWordBuilder: () => ({ word: "clock", round: 1 }),
      readSpellCheck: () => ({ word: "clock" }),
      clearPendingGameStart: vi.fn(),
      syncActivity: (state) => synced.push(state.pauseState),
      sendCanvas: (payload) => sent.push(payload),
      broadcastContext: vi.fn(),
      replayWorksheetQuestion: replayQuestion,
    });

    controller.set("worksheet");
    expect(await controller.pause("child_request")).toBe(true);
    expect(controller.state.pauseState).toBe("paused_for_checkin");
    expect(canvasState).toBeNull();
    expect(sent.at(-1)).toEqual({ mode: "idle" });

    expect(await controller.resume()).toBe(true);
    expect(controller.state.pauseState).toBe("active");
    expect(canvasState).toMatchObject({ mode: "worksheet" });
    expect(replayQuestion).toHaveBeenCalledWith("Which hand shows the minutes?");
    expect(sent.at(-1)).toEqual({
      args: expect.objectContaining({ mode: "worksheet" }),
      result: expect.objectContaining({ mode: "worksheet" }),
    });
    expect(synced).toContain("paused_for_checkin");
  });

  it("recognizes explicit pause and resume requests without treating ordinary speech as control", () => {
    const controller = new ActiveCanvasActivityController({
      readCanvasState: () => null,
      clearCanvasState: vi.fn(),
      restoreCanvasState: vi.fn(),
      readContextCanvas: () => undefined,
      updateContextCanvas: vi.fn(),
      readWorksheet: () => undefined,
      restoreWorksheetProblemIndex: vi.fn(),
      readWordBuilder: () => ({ word: "", round: 0 }),
      readSpellCheck: () => ({ word: "" }),
      clearPendingGameStart: vi.fn(),
      syncActivity: vi.fn(),
      sendCanvas: vi.fn(),
      broadcastContext: vi.fn(),
      replayWorksheetQuestion: vi.fn(),
    });

    expect(controller.isPauseRequest("Can I tell you about my day?"))
      .toBe(true);
    expect(controller.isResumeRequest("I'm ready to go back to the worksheet"))
      .toBe(true);
    expect(controller.isPauseRequest("I think the answer is seven"))
      .toBe(false);
  });
});
