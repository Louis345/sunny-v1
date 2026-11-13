import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CompanionCareView } from "../../../src/shared/companionCareTypes";
import { CompanionCareProvider } from "../context/CompanionCareContext";
import { CompanionCareHud } from "../components/CompanionCareHud";

const hungryCare: CompanionCareView = {
  childId: "demo-pashley",
  companionId: "elli",
  displayName: "Elli",
  vitals: {
    hunger: 0.2,
    mood: 0.5,
    bond: 0.7,
    energy: 0.7,
    usefulness: 0.7,
    thoughtClarity: 0.7,
    lastSeenAt: "2026-07-29T12:00:00.000Z",
  },
  economy: { coins: 0, storeUnlocks: [] },
  inventory: {
    food: [
      {
        id: "apple_bite",
        label: "Apple Bite",
        description: "A crisp snack.",
        quantity: 1,
        rarity: "common",
      },
    ],
    careItems: [],
  },
  readiness: {
    hungry: true,
    lowEnergy: false,
    lowBond: false,
    lowThoughtClarity: false,
    highEnergyReluctance: true,
    canContinueTired: true,
    suggestedRepair: "feed",
  },
  moodLabel: "hungry",
  lastSeenLabel: "today",
};

describe("production companion care HUD", () => {
  it("shows the real care meter and opens the existing Care Pack sheet", async () => {
    render(
      <CompanionCareProvider
        childId="demo-pashley"
        profile={{ care_plan: { companion_care: hungryCare } }}
      >
        <CompanionCareHud companionName="Elli" fallbackTamagotchi={{
          hunger: 0.2,
          happiness: 0.5,
          bond: 0.7,
          intellect: 0.7,
          lastSeenAt: hungryCare.vitals.lastSeenAt,
        }} />
      </CompanionCareProvider>,
    );

    expect(screen.getByTestId("map-care-strip")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open bookbag: Hunger 20%" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    expect(screen.getByText("Apple Bite")).toBeVisible();
  });

  it("hides the meter while an activity is active", () => {
    render(
      <CompanionCareProvider
        childId="demo-pashley"
        profile={{ care_plan: { companion_care: hungryCare } }}
      >
        <CompanionCareHud
          companionName="Elli"
          fallbackTamagotchi={{
            hunger: 0.2,
            happiness: 0.5,
            bond: 0.7,
            intellect: 0.7,
            lastSeenAt: hungryCare.vitals.lastSeenAt,
          }}
          activityActive
        />
      </CompanionCareProvider>,
    );

    expect(screen.queryByTestId("map-care-strip")).toBeNull();
  });

  it("feeds through the provider rather than maintaining a second care store", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ companionCare: hungryCare }),
    } as Response);
    render(
      <CompanionCareProvider
        childId="demo-pashley"
        profile={{ care_plan: { companion_care: hungryCare } }}
      >
        <CompanionCareHud
          companionName="Elli"
          fallbackTamagotchi={{
            hunger: 0.2,
            happiness: 0.5,
            bond: 0.7,
            intellect: 0.7,
            lastSeenAt: hungryCare.vitals.lastSeenAt,
          }}
        />
      </CompanionCareProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open bookbag: Hunger 20%" }));
    fireEvent.click(screen.getByRole("button", { name: /Feed Apple Bite/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/demo-pashley/companion-care/feed",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
