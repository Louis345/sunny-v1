import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WardrobeStoreLab } from "../components/WardrobeStoreLab";
import {
  WARDROBE_STORE_CATALOG,
  WARDROBE_STORE_STORAGE_KEY,
  createCompanionShoppingVisit,
  createInitialWardrobeStoreState,
  getCompatibleWardrobeItems,
} from "../lib/wardrobeStore";

const companion = {
  id: "elli",
  name: "Elli",
  modelUrl: "/companions/sample.vrm",
};

function createCallProps() {
  return {
    talkPhase: "idle" as const,
    responseText: "That one definitely caught my eye.",
    error: null,
    onAskVoice: vi.fn(),
  };
}

describe("WardrobeStoreLab shopping call", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("opens at the entrance with the full companion and no selected product", () => {
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Shopping with Elli" })).toBeTruthy();
    expect(screen.getByLabelText("Elli store entrance")).toContainElement(
      screen.getByTestId("companion-vrm"),
    );
    expect(screen.queryByRole("heading", { name: "Royal Crown" })).toBeNull();
    expect(screen.queryByLabelText("Elli live")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Talk to Elli" })).toBeNull();
    expect(screen.queryByLabelText("Talk with Elli")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Shop items" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View Royal Crown, 20 coins" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View Downloaded Dress, 60 coins" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "The Lantern Room" })).toBeNull();
  });

  it("moves one live companion renderer from review portrait to try-on and requests grounded reactions", () => {
    const onWardrobeChange = vi.fn();
    const onCompanionReaction = vi.fn();
    const call = createCallProps();
    const renderCompanion = vi.fn((view: "full_body" | "portrait") => (
      <div data-testid="companion-vrm">{view} VRM</div>
    ));
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={renderCompanion}
        call={call}
        onWardrobeChange={onWardrobeChange}
        onCompanionReaction={onCompanionReaction}
        onExit={vi.fn()}
        visitSeed="ui-flow"
      />,
    );

    expect(renderCompanion).toHaveBeenLastCalledWith("full_body");

    fireEvent.click(
      screen.getByRole("button", { name: "View Downloaded Dress, 60 coins" }),
    );
    expect(renderCompanion).toHaveBeenLastCalledWith("portrait");
    expect(screen.getByLabelText("Elli live")).toContainElement(
      screen.getByTestId("companion-vrm"),
    );
    expect(screen.getByText("That one definitely caught my eye.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Talk to Elli by voice" }));
    expect(call.onAskVoice).toHaveBeenCalledTimes(1);
    expect(onCompanionReaction).toHaveBeenLastCalledWith(
      { type: "item_reviewed", itemId: "sleeveless-dress" },
      expect.objectContaining({ mode: "review" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Try on Downloaded Dress" }));

    expect(renderCompanion).toHaveBeenLastCalledWith("full_body");
    expect(screen.getByLabelText("Elli try-on stage")).toContainElement(
      screen.getByTestId("companion-vrm"),
    );
    expect(screen.queryByLabelText("Elli live")).toBeNull();
    expect(screen.getAllByTestId("companion-vrm")).toHaveLength(1);
    expect(onCompanionReaction).toHaveBeenLastCalledWith(
      { type: "try_on_started", itemId: "sleeveless-dress" },
      expect.objectContaining({
        mode: "try_on",
        selectedItem: expect.objectContaining({
          id: "sleeveless-dress",
          name: "Downloaded Dress",
        }),
      }),
    );
    expect(onWardrobeChange).toHaveBeenLastCalledWith({
      accessoryId: "none",
      outfitId: "sleeveless-dress",
    });
  });

  it("keeps purchase arithmetic and confirmation inside the same shopping screen", () => {
    const visitSeed = "purchase-flow";
    const state = createInitialWardrobeStoreState();
    const items = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      companion.modelUrl,
    );
    const visit = createCompanionShoppingVisit({
      companionId: companion.id,
      items,
      state,
      visitSeed,
    });
    const acceptedItem = items.find(
      (item) => visit.itemOpinions[item.id]?.companionConsentsToWear,
    );
    expect(acceptedItem).toBeTruthy();
    const onExit = vi.fn();
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={vi.fn()}
        onExit={onExit}
        exitLabel="Back to the showroom"
        visitSeed={visitSeed}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: `View ${acceptedItem?.name}, ${acceptedItem?.price} coins`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Try on ${acceptedItem?.name}` }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `Buy and wear ${acceptedItem?.name} for ${acceptedItem?.price} coins`,
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      `${acceptedItem?.name} added to Elli’s closet · 100 → ${100 - (acceptedItem?.price ?? 0)} coins`,
    );
    expect(screen.getByRole("heading", { name: "Shopping with Elli" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /receipt/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to the showroom" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("keeps unapproved downloaded outfits out of other character stores", () => {
    render(
      <WardrobeStoreLab
        companion={{
          id: "kefla",
          name: "Kefla",
          modelUrl: "/companions/Kefla.vrm",
        }}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Downloaded Dress/ })).toBeNull();
    expect(screen.getByRole("button", { name: "View Royal Crown, 20 coins" })).toBeTruthy();
  });

  it("publishes exact store truth for the companion conversation", async () => {
    const onShoppingContextChange = vi.fn();
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={vi.fn()}
        onShoppingContextChange={onShoppingContextChange}
        onExit={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(onShoppingContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: "entrance",
          walletBalance: 100,
          selectedItem: null,
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "View Royal Crown, 20 coins" }));

    await waitFor(() =>
      expect(onShoppingContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: "review",
          selectedItem: expect.objectContaining({ id: "royal-crown" }),
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Try on Royal Crown" }));

    await waitFor(() =>
      expect(onShoppingContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: "try_on",
          selectedItem: expect.objectContaining({ id: "royal-crown" }),
        }),
      ),
    );
  });

  it("keeps provider failures concise without hiding the code-owned opinion", () => {
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={{
          ...createCallProps(),
          error: "400 provider billing response that should never be shown to a child",
        }}
        onWardrobeChange={vi.fn()}
        onExit={vi.fn()}
        visitSeed="provider-failure"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View Royal Crown, 20 coins" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Elli could not answer out loud, but her opinion is still active.",
    );
    expect(screen.queryByText(/provider billing response/)).toBeNull();
  });

  it("enforces a code-owned refusal without spending coins", () => {
    const visitSeed = "strong-refusal";
    const state = createInitialWardrobeStoreState();
    const items = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      companion.modelUrl,
    );
    const visit = createCompanionShoppingVisit({
      companionId: companion.id,
      items,
      state,
      visitSeed,
    });
    const rejectedItem = items.find(
      (item) => visit.itemOpinions[item.id]?.verdict === "reject",
    );
    expect(rejectedItem).toBeTruthy();

    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={vi.fn()}
        onExit={vi.fn()}
        visitSeed={visitSeed}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(`View ${rejectedItem?.name}`),
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Try on ${rejectedItem?.name}` }),
    );

    expect(screen.getByText("Not for me today")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Buy and wear/ })).toBeNull();
    expect(screen.getByText("100 demo coins")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save .* for later/ })).toBeTruthy();
  });

  it("blocks a rejected owned item from being equipped from the closet", () => {
    const visitSeed = "owned-refusal";
    const items = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      companion.modelUrl,
    );
    const state = {
      ...createInitialWardrobeStoreState(),
      ownedItemIds: items.map((item) => item.id),
    };
    const visit = createCompanionShoppingVisit({
      companionId: companion.id,
      items,
      state,
      visitSeed,
    });
    const rejectedItem = items.find(
      (item) => !visit.itemOpinions[item.id]?.companionConsentsToWear,
    );
    expect(rejectedItem).toBeTruthy();
    window.localStorage.setItem(WARDROBE_STORE_STORAGE_KEY, JSON.stringify(state));
    const onWardrobeChange = vi.fn();

    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={onWardrobeChange}
        onExit={vi.fn()}
        visitSeed={visitSeed}
      />,
    );
    onWardrobeChange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Elli’s closet" }));
    fireEvent.click(screen.getByRole("button", { name: rejectedItem?.name }));

    expect(screen.getByText(`Elli does not want to wear ${rejectedItem?.name} today.`)).toBeTruthy();
    expect(screen.getByText("100 demo coins")).toBeTruthy();
    expect(onWardrobeChange).not.toHaveBeenCalled();
  });
});
