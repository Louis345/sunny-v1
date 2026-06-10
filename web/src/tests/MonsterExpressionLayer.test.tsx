import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonsterExpressionLayer } from "../components/MonsterExpressionLayer";
import { LUMIPUFF_MONSTER } from "../components/capturedMonsterCatalog";

describe("MonsterExpressionLayer", () => {
  it("renders a reusable CSS blink overlay from the creature catalog", () => {
    render(
      <MonsterExpressionLayer
        creature={LUMIPUFF_MONSTER}
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
    expect(layer).toHaveAttribute("data-blink-mode", "css-overlay");
    expect(layer.getAttribute("style")).toContain("--monster-eye-top: 30%");
    expect(layer.getAttribute("style")).toContain("--monster-blink-cycle-min: 3200ms");
    expect(layer.getAttribute("style")).toContain("--monster-blink-cycle-max: 6200ms");
    expect(blink).toHaveAttribute("aria-hidden", "true");
  });

  it("can render more alert blink timing without changing the creature art", () => {
    render(
      <MonsterExpressionLayer
        creature={LUMIPUFF_MONSTER}
        expressionState="alert"
        testIds={{
          layer: "monster-expression-layer",
          blink: "monster-expression-blink",
        }}
      />,
    );

    expect(screen.getByTestId("monster-expression-layer")).toHaveAttribute(
      "data-expression-state",
      "alert",
    );
  });
});
