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
        isFeeding={false}
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

  it("frames the sheet as a bookbag while showing care details", () => {
    render(
      <TamagotchiSheet
        open
        companionName="Matilda"
        companionCare={careView}
        isFeeding={false}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Matilda's bookbag")).toBeTruthy();
    expect(screen.getByText("Companion care")).toBeTruthy();
  });

  it("keeps the bookbag header sticky while food inventory scrolls", () => {
    render(
      <TamagotchiSheet
        open
        companionName="Matilda"
        companionCare={careView}
        isFeeding={false}
        onClose={() => {}}
      />,
    );

    const header = screen.getByTestId("bookbag-sticky-header");
    expect(header).toHaveStyle({ position: "sticky" });
    expect(header).toHaveStyle({ top: "0px" });
    expect(header).toHaveStyle({ zIndex: "3" });
    expect(header).toHaveStyle({ paddingTop: "18px" });
  });

  it("renders food as scarce icon cards with quantities", () => {
    render(
      <TamagotchiSheet
        open
        companionName="Matilda"
        companionCare={careView}
        isFeeding={false}
        onClose={() => {}}
      />,
    );

    expect(screen.getByLabelText("Apple Bite icon")).toBeTruthy();
    expect(screen.getByLabelText("Mystery Snack icon")).toBeTruthy();
    expect(screen.getByText("x3 left")).toBeTruthy();
    expect(screen.getByText("x1 left")).toBeTruthy();
    expect(screen.getByText("Needs care")).toBeTruthy();
    expect(screen.getByText("Earn more food by finishing map nodes.")).toBeTruthy();
  });

  it("uses a compact non-modal drawer and closes after feeding so the companion stays visible", () => {
    const onFeed = vi.fn();
    const onClose = vi.fn();
    render(
      <TamagotchiSheet
        open
        companionName="Matilda"
        companionCare={careView}
        isFeeding={false}
        onFeed={onFeed}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("false");
    expect(dialog).toHaveStyle({ maxHeight: "min(500px, calc(100vh - 120px))" });
    expect(dialog).toHaveStyle({ width: "440px" });
    expect(dialog).toHaveStyle({ maxWidth: "calc(100vw - 32px)" });

    fireEvent.click(screen.getByRole("button", { name: /feed apple bite/i }));
    expect(onFeed).toHaveBeenCalledWith("apple_bite");
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps overflow inside the drawer body instead of stretching over the map", () => {
    render(
      <TamagotchiSheet
        open
        companionName="Matilda"
        companionCare={careView}
        isFeeding={false}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId("bookbag-scroll-body")).toHaveStyle({
      overflowY: "auto",
      minHeight: "0px",
    });
  });

  it("does not render the clipped floating close circle above the bookbag header", () => {
    render(
      <TamagotchiSheet
        open
        companionName="Matilda"
        companionCare={careView}
        isFeeding={false}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByTestId("bookbag-floating-close")).toBeNull();
  });
});
