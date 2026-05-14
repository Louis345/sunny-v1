import { cleanup, render, screen, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NodeConfig } from "../../../src/shared/adventureTypes";
import childrenCfg from "../../../children.config.json"; // IDs from repo config (never hard-coded child labels)
import { CompanionCurrencyHud } from "../components/CompanionCurrencyHud";
import { NodeCard } from "../components/NodeCard.tsx";
import { TamagotchiSheet } from "../components/TamagotchiSheet";
import { useMapSession } from "../hooks/useMapSession";

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

  it("map load errors expose the server reason instead of only connection copy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({
          error: "activity_plan_blocked: high_confidence_spelling_requires_independent_recall",
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMapSession("reina", "free", true));

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe("error");
    });
    expect(result.current.connectionError).toBe(
      "activity_plan_blocked: high_confidence_spelling_requires_independent_recall",
    );
  });

  it("passes homework domain intent with the child picked for map startup", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sessionId: "map-1",
          mapState: {
            childId: "reina",
            sessionId: "map-1",
            sessionDate: "2026-05-12",
            nodes: [],
            completedNodes: [],
            currentNodeId: null,
            xp: 0,
            level: 1,
            theme: {
              name: "test",
              palette: { sky: "#fff", ground: "#fff", accent: "#000" },
            },
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useMapSession("reina", false, false, "spelling"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      childId: "reina",
      runtime: {
        homeworkDomain: "spelling",
      },
    });
  });
});
