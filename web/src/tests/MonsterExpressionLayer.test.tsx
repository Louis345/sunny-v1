import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonsterExpressionLayer } from "../components/MonsterExpressionLayer";
import type { CapturedMonsterConfig } from "../components/capturedMonsterCatalog";
import { LUMIPUFF_MONSTER } from "../components/capturedMonsterCatalog";
import {
  advanceBlinkPhase,
  hasBlinkFrames,
  pickBlinkIntervalMs,
} from "../utils/monsterBlinkTiming";

const frameCreature: CapturedMonsterConfig = {
  ...LUMIPUFF_MONSTER,
  expression: {
    ...LUMIPUFF_MONSTER.expression,
    blink: {
      mode: "frame-swap",
      frames: {
        open: "/encounters/spark-orb/lumipuff.png",
        half: "/encounters/spark-orb/lumipuff-blink-half.png",
        closed: "/encounters/spark-orb/lumipuff-blink-closed.png",
      },
      timing: {
        durationMs: 140,
        minIntervalMs: 3000,
        maxIntervalMs: 7000,
        doubleBlinkChance: 1,
      },
    },
  },
};

const missingFrameCreature: CapturedMonsterConfig = {
  ...LUMIPUFF_MONSTER,
  expression: {
    ...LUMIPUFF_MONSTER.expression,
    blink: {
      mode: "frame-swap",
      frames: {
        open: "/encounters/spark-orb/lumipuff.png",
      },
      timing: {
        durationMs: 140,
        minIntervalMs: 3000,
        maxIntervalMs: 7000,
        doubleBlinkChance: 0,
      },
    },
  },
};

describe("monsterBlinkTiming", () => {
  it("picks idle blink intervals inside the configured range", () => {
    const interval = pickBlinkIntervalMs("idle", frameCreature.expression.blink.timing, () => 0.5);
    expect(interval).toBeGreaterThanOrEqual(3000);
    expect(interval).toBeLessThanOrEqual(7000);
  });

  it("blinks faster when alert", () => {
    const idle = pickBlinkIntervalMs("idle", frameCreature.expression.blink.timing, () => 0.5);
    const alert = pickBlinkIntervalMs("alert", frameCreature.expression.blink.timing, () => 0.5);
    expect(alert).toBeLessThan(idle);
  });

  it("advances through open, half, closed, half, open during a full blink", () => {
    expect(advanceBlinkPhase("open", "full")).toBe("half");
    expect(advanceBlinkPhase("half", "full")).toBe("closed");
    expect(advanceBlinkPhase("closed", "full")).toBe("half");
    expect(advanceBlinkPhase("half", "full", { reopening: true })).toBe("open");
  });

  it("detects when blink frame assets are missing", () => {
    expect(hasBlinkFrames(frameCreature.expression.blink.frames)).toBe(true);
    expect(hasBlinkFrames(missingFrameCreature.expression.blink.frames)).toBe(false);
  });
});

describe("MonsterExpressionLayer", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders frame-swap blink layer from the creature catalog", () => {
    render(
      <MonsterExpressionLayer
        creature={frameCreature}
        expressionState="idle"
        testIds={{
          layer: "monster-expression-layer",
          blink: "monster-expression-blink",
        }}
      />,
    );

    const layer = screen.getByTestId("monster-expression-layer");
    const blink = screen.getByTestId("monster-expression-blink");

    expect(layer).toHaveAttribute("data-expression-state", "idle");
    expect(layer).toHaveAttribute("data-blink-mode", "frame-swap");
    expect(layer).toHaveAttribute("data-blink-frame", "open");
    expect(blink).toHaveAttribute("aria-hidden", "true");
    expect(document.body.innerHTML).not.toContain("radial-gradient");
  });

  it("advances through blink frames within the configured duration", () => {
    vi.useFakeTimers();
    const random = vi.fn(() => 0.5);

    render(
      <MonsterExpressionLayer
        creature={frameCreature}
        expressionState="idle"
        blinkRandom={random}
        testIds={{
          layer: "monster-expression-layer",
          blink: "monster-expression-blink",
        }}
      />,
    );

    const layer = screen.getByTestId("monster-expression-layer");
    expect(layer).toHaveAttribute("data-blink-frame", "open");

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(layer).toHaveAttribute("data-blink-frame", "half");

    act(() => {
      vi.advanceTimersByTime(35);
    });
    expect(layer).toHaveAttribute("data-blink-frame", "closed");

    act(() => {
      vi.advanceTimersByTime(35);
    });
    expect(layer).toHaveAttribute("data-blink-frame", "half");

    act(() => {
      vi.advanceTimersByTime(35);
    });
    expect(layer).toHaveAttribute("data-blink-frame", "open");
  });

  it("schedules a second blink when doubleBlinkChance hits", () => {
    vi.useFakeTimers();
    const random = vi.fn(() => 0.5);

    render(
      <MonsterExpressionLayer
        creature={frameCreature}
        expressionState="idle"
        blinkRandom={random}
        testIds={{
          layer: "monster-expression-layer",
        }}
      />,
    );

    const layer = screen.getByTestId("monster-expression-layer");

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(layer).toHaveAttribute("data-blink-frame", "half");

    act(() => {
      vi.advanceTimersByTime(140);
    });
    expect(layer).toHaveAttribute("data-blink-frame", "open");

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(layer).toHaveAttribute("data-blink-frame", "half");
  });

  it("holds closed longer in sleepy expression state", () => {
    vi.useFakeTimers();
    const random = vi.fn(() => 0.5);

    render(
      <MonsterExpressionLayer
        creature={frameCreature}
        expressionState="sleepy"
        blinkRandom={random}
        testIds={{
          layer: "monster-expression-layer",
        }}
      />,
    );

    const layer = screen.getByTestId("monster-expression-layer");

    act(() => {
      vi.advanceTimersByTime(5500);
    });
    expect(layer).toHaveAttribute("data-blink-frame", "half");

    act(() => {
      vi.advanceTimersByTime(35);
    });
    expect(layer).toHaveAttribute("data-blink-frame", "closed");

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(layer).toHaveAttribute("data-blink-frame", "closed");

    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(layer).toHaveAttribute("data-blink-frame", "half");
  });

  it("renders nothing and warns when blink frame assets are missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { container } = render(
      <MonsterExpressionLayer
        creature={missingFrameCreature}
        expressionState="idle"
        testIds={{
          layer: "monster-expression-layer",
          blink: "monster-expression-blink",
        }}
      />,
    );

    expect(screen.queryByTestId("monster-expression-layer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("monster-expression-blink")).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain("radial-gradient");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("lumipuff"),
    );
  });

  it("cleans up blink timers on unmount", () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const random = vi.fn(() => 0);

    const { unmount } = render(
      <MonsterExpressionLayer
        creature={frameCreature}
        expressionState="idle"
        blinkRandom={random}
        testIds={{ layer: "monster-expression-layer" }}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
