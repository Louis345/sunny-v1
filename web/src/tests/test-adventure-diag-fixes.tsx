import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NodeConfig } from "../../../src/shared/adventureTypes";
import childrenCfg from "../../../children.config.json"; // IDs from repo config (never hard-coded child labels)
import { CompanionCurrencyHud } from "../components/CompanionCurrencyHud";
import { NodeCard } from "../components/NodeCard.tsx";
import { TamagotchiSheet } from "../components/TamagotchiSheet";

const SAMPLE_NODE: NodeConfig = {
  id: "node-x",
  type: "spell-check",
  isLocked: false,
  isCompleted: true,
  isGoal: false,
  difficulty: 1,
};

describe("diag / adventure map regressions", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("clicking a completed node in unlocked mode launches it", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <NodeCard
        node={SAMPLE_NODE}
        position={{ x: 400, y: 300 }}
        onClick={onClick}
        onHoverChange={() => {}}
        isActive={false}
        allowReplayWhenCompleted={false}
      />,
    );
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();

    rerender(
      <NodeCard
        node={SAMPLE_NODE}
        position={{ x: 400, y: 300 }}
        onClick={onClick}
        onHoverChange={() => {}}
        isActive={false}
        allowReplayWhenCompleted
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("HUD renders companionCurrency from profile", () => {
    render(<CompanionCurrencyHud companionCurrency={42} />);
    const hud = screen.getByTestId("companion-currency-hud");
    expect(hud.textContent ?? "").toContain("42");
  });

  it("care bag stats show profile tamagotchi values, not default template", () => {
    expect(Object.keys(childrenCfg.childProfiles ?? {}).length).toBeGreaterThan(
      0,
    );

    const t = {
      hunger: 0.11,
      happiness: 0.5,
      bond: 0.2,
      intellect: 0.33,
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    };
    const { container } = render(
      <TamagotchiSheet
        open
        tamagotchi={t}
        companionName="Care"
        onClose={() => {}}
      />,
    );
    const html = container.innerHTML;
    expect(html.includes("width: 11%")).toBe(true);
    expect(html.includes("width: 80%")).toBe(false);
  });
});
