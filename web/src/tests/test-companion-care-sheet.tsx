import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TamagotchiSheet } from "../components/TamagotchiSheet";
import type { CompanionCareView } from "../../../src/shared/companionCareTypes";

const careView: CompanionCareView = {
  childId: "reina",
  companionId: "matilda",
  displayName: "Matilda",
  vitals: {
    hunger: 0.18,
    mood: 0.45,
    bond: 0.2,
    energy: 0.22,
    usefulness: 0.3,
    thoughtClarity: 0.25,
    lastSeenAt: "2026-05-01T00:00:00.000Z",
  },
  economy: { coins: 1300, storeUnlocks: [] },
  inventory: {
    food: [
      {
        id: "apple_bite",
        label: "Apple Bite",
        description: "A crisp snack.",
        quantity: 3,
        rarity: "common",
      },
      {
        id: "mystery_snack",
        label: "Mystery Snack",
        description: "A rare earned reward.",
        quantity: 1,
        rarity: "rare",
      },
    ],
    careItems: [],
  },
  readiness: {
    hungry: true,
    lowEnergy: true,
    lowBond: false,
    lowThoughtClarity: true,
    highEnergyReluctance: true,
    canContinueTired: true,
    suggestedRepair: "feed",
  },
  moodLabel: "hungry",
  lastSeenLabel: "2 days ago",
};

describe("TamagotchiSheet companion care", () => {
  afterEach(() => cleanup());

  it("renders companion care vitals, inventory, readiness, and feeds an item", () => {
    const onFeed = vi.fn();
    render(
      <TamagotchiSheet
        open
        companionName="Matilda"
        companionCare={careView}
        onFeed={onFeed}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Energy")).toBeTruthy();
    expect(screen.getByText("Thoughts")).toBeTruthy();
    expect(screen.getByText("Apple Bite")).toBeTruthy();
    expect(screen.getByText("Mystery Snack")).toBeTruthy();
    expect(screen.getByText(/low-energy/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /feed apple bite/i }));
    expect(onFeed).toHaveBeenCalledWith("apple_bite");
  });
});
