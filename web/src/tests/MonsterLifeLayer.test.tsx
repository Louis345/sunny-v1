import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonsterLifeLayer } from "../components/CapturedMonsterDen";
import { LUMIPUFF_MONSTER } from "../components/capturedMonsterCatalog";

describe("MonsterLifeLayer", () => {
  it("renders all configured life states", () => {
    const states = LUMIPUFF_MONSTER.lifeStates;
    const { rerender } = render(
      <MonsterLifeLayer creature={LUMIPUFF_MONSTER} nickname="Lumi" lifeState="idle" />,
    );

    for (const state of states) {
      rerender(
        <MonsterLifeLayer creature={LUMIPUFF_MONSTER} nickname="Lumi" lifeState={state} />,
      );
      expect(screen.getByTestId("monster-life-layer")).toHaveAttribute("data-life-state", state);
    }
  });

  it("lets the creature surface be tapped by the den", () => {
    const onPet = vi.fn();
    render(
      <MonsterLifeLayer
        creature={LUMIPUFF_MONSTER}
        nickname="Lumi"
        lifeState="curious"
        onPet={onPet}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tap Lumi" }));
    expect(onPet).toHaveBeenCalledTimes(1);
  });
});
