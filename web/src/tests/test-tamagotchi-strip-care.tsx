import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CompanionCareView } from "../../../src/shared/companionCareTypes";
import { TamagotchiStrip } from "../components/TamagotchiStrip";
import { DEFAULT_TAMAGOTCHI } from "../../../src/shared/vrrTypes";

const care = {
  vitals: {
    hunger: 0.2,
    mood: 0.3,
    bond: 0.4,
    energy: 0.5,
    usefulness: 0.6,
    thoughtClarity: 0.7,
    lastSeenAt: "2026-05-04T00:00:00.000Z",
  },
} as CompanionCareView;

describe("TamagotchiStrip care bars", () => {
  it("renders four care-plan bars and opens the bookbag", () => {
    const onOpenBookbag = vi.fn();
    render(
      <TamagotchiStrip
        tamagotchi={DEFAULT_TAMAGOTCHI}
        companionCare={care}
        onOpenSheet={onOpenBookbag}
      />,
    );

    expect(screen.getByLabelText("Open bookbag: Hunger 20%")).toBeTruthy();
    expect(screen.getByLabelText("Open bookbag: Mood 30%")).toBeTruthy();
    expect(screen.getByLabelText("Open bookbag: Bond 40%")).toBeTruthy();
    expect(screen.getByLabelText("Open bookbag: Energy 50%")).toBeTruthy();
    expect(screen.queryByLabelText(/Thoughts/)).toBeNull();
    expect(screen.getByTestId("map-care-strip")).toHaveStyle({
      width: "360px",
      maxWidth: "calc(100vw - 32px)",
    });
    expect(screen.getByText("20%")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Open bookbag: Hunger 20%"));
    expect(onOpenBookbag).toHaveBeenCalled();
  });
});
